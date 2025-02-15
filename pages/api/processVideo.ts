import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import { exec, spawn } from 'child_process';
import util from 'util';
import ffmpeg from 'fluent-ffmpeg';
import OpenAI from 'openai';
import path from 'path';
import os from 'os';
import YTDlp from 'yt-dlp-exec';

const execAsync = util.promisify(exec);

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false
  },
};

function parseForm(req: NextApiRequest): Promise<{ fields: formidable.Fields; files: formidable.Files }> {
  const form = formidable({ multiples: false });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

interface SubtitleSegment {
  startTime: number;
  endTime: number;
  text: string;
}

async function downloadYouTubeVideo(url: string): Promise<string> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-'));
  const outputTemplate = path.join(tempDir, 'video.%(ext)s');
  
  try {
    const result = await YTDlp(url, {
      output: outputTemplate,
      format: 'best',
    });

    // 出力ファイルを探す
    const files = fs.readdirSync(tempDir);
    const videoFile = files.find(file => file.startsWith('video.'));
    if (!videoFile) {
      throw new Error('ダウンロードした動画ファイルが見つかりませんでした。');
    }

    return path.join(tempDir, videoFile);
  } catch (error) {
    throw new Error(`YouTube動画のダウンロードに失敗しました: ${error.message}`);
  }
}

async function extractAudioFromVideo(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat('wav')
      .outputOptions('-acodec pcm_s16le')
      .outputOptions('-ar 16000')
      .outputOptions('-ac 1')
      .save(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err));
  });
}

async function performTranscription(audioFilePath: string, apiKey: string): Promise<SubtitleSegment[]> {
  const openai = new OpenAI({ apiKey: apiKey });

  const audioFile = fs.createReadStream(audioFilePath);
  
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      response_format: "verbose_json",
      language: "en"
    });

    if (!transcription || !transcription.segments) {
      throw new Error("transcription.segmentsが存在してへんで！");
    }
    return transcription.segments.map((segment: any) => ({
      startTime: segment.start * 1000,
      endTime: segment.end * 1000,
      text: segment.text.trim()
    }));
  } catch (error) {
    console.error('Transcription error:', error);
    throw error;
  }
}

// 翻訳関数を改善：より自然な日本語訳を得るためのプロンプトを追加
async function translateText(text: string, apiKey: string): Promise<string> {
  const openai = new OpenAI({ apiKey });
  const prompt = `以下の英語のセリフを、自然な日本語に翻訳してください。文脈や話し言葉のニュアンスを保ちながら翻訳してください：\n\n${text}`;
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
  });
  return response.choices[0].message.content.trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  let tempFiles: string[] = [];
  let tempDir: string | null = null;

  try {
    const { fields } = await parseForm(req);
    const youtubeUrl = (Array.isArray(fields.youtubeUrl) ? fields.youtubeUrl[0] : fields.youtubeUrl) as string;
    const apiKey = (Array.isArray(fields.apiKey) ? fields.apiKey[0] : fields.apiKey) as string;

    if (!youtubeUrl || !apiKey) {
      res.status(400).send('YouTubeのURLとAPIキーが必要です！');
      return;
    }

    // YouTube動画をダウンロード
    const inputFilePath = await downloadYouTubeVideo(youtubeUrl);
    tempFiles.push(inputFilePath);
    tempDir = path.dirname(inputFilePath);

    // 音声ファイル、字幕ファイル、出力動画ファイルのパスを設定
    const audioFilePath = path.join(tempDir, 'audio.wav');
    const subtitleFilePath = path.join(tempDir, 'subtitles.srt');
    const outputFilePath = path.join(tempDir, 'output.mp4');
    tempFiles.push(audioFilePath, subtitleFilePath, outputFilePath);

    // 動画から音声を抽出
    await extractAudioFromVideo(inputFilePath, audioFilePath);

    // Whisperで文字起こし
    const subtitleSegments = await performTranscription(audioFilePath, apiKey);

    // 字幕をSRT形式に変換
    let subtitleIndex = 1;
    let srtContent = "";
    const formatTime = (ms: number) => {
      const hours = Math.floor(ms / 3600000);
      const minutes = Math.floor((ms % 3600000) / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      const milliseconds = ms % 1000;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
    };

    for (const segment of subtitleSegments) {
      if (!segment.text.trim()) continue;

      const japaneseSentence = await translateText(segment.text, apiKey);
      
      const minDuration = 500;
      const duration = segment.endTime - segment.startTime;
      const endTime = segment.startTime + Math.max(duration, minDuration);

      srtContent += `${subtitleIndex}\n${formatTime(Math.round(segment.startTime))} --> ${formatTime(Math.round(endTime))}\n${japaneseSentence}\n\n`;
      subtitleIndex++;
    }

    // SRTファイルを保存
    fs.writeFileSync(subtitleFilePath, srtContent);

    // ffmpegで字幕を焼き付け
    let ffmpegCmd;
    if (srtContent.trim().length === 0) {
      ffmpegCmd = `ffmpeg -y -i "${inputFilePath}" -c copy "${outputFilePath}"`;
    } else {
      ffmpegCmd = `ffmpeg -y -i "${inputFilePath}" -vf "subtitles=${subtitleFilePath}:force_style='Alignment=2,FontName=Noto Sans CJK JP,FontSize=24,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=35'" -c:a copy "${outputFilePath}"`;
    }
    await execAsync(ffmpegCmd);

    // 出力動画を読み込んでレスポンスとして送信
    const outputBuffer = fs.readFileSync(outputFilePath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="output.mp4"');
    res.status(200).send(outputBuffer);

  } catch (err) {
    console.error(err);
    res.status(500).send('エラーが発生しました: ' + (err instanceof Error ? err.message : ''));
  } finally {
    // 一時ファイルとディレクトリの削除
    try {
      tempFiles.forEach(file => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      });
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir);
      }
    } catch (cleanupError) {
      console.error('一時ファイルの削除中にエラーが発生しました:', cleanupError);
    }
  }
} 