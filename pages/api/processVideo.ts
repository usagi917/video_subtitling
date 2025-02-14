import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';
import ffmpeg from 'fluent-ffmpeg';
import OpenAI from 'openai';

const execAsync = util.promisify(exec);

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false
  },
};

function parseForm(req: NextApiRequest): Promise<{ fields: formidable.Fields; files: formidable.Files }> {
  const form = formidable({ multiples: false, keepExtensions: true });
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

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

interface WhisperResponse {
  segments: WhisperSegment[];
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

  try {
    const { fields, files } = await parseForm(req);
    const videoFile = (Array.isArray(files.video) ? files.video[0] : files.video) as unknown as formidable.File;
    const apiKey = (Array.isArray(fields.apiKey) ? fields.apiKey[0] : fields.apiKey) as unknown as string;

    if (!videoFile || !apiKey) {
      res.status(400).send('必要なパラメータが不足してるで！');
      return;
    }

    // 入力動画ファイルのパス、音声ファイル、字幕ファイル、出力動画ファイルのパスを設定
    const inputFilePath = videoFile.filepath;
    const audioFilePath = inputFilePath + '.wav';
    const subtitleFilePath = inputFilePath + '.srt';
    const outputFilePath = inputFilePath + '_output.mp4';

    // 動画から音声を抽出
    await extractAudioFromVideo(inputFilePath, audioFilePath);

    // Whisperで文字起こし
    const subtitleSegments = await performTranscription(audioFilePath, apiKey);

    // 字幕をSRT形式に変換（セグメントごとに処理）
    let subtitleIndex = 1;
    let srtContent = "";
    const formatTime = (ms: number) => {
      const hours = Math.floor(ms / 3600000);
      const minutes = Math.floor((ms % 3600000) / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      const milliseconds = ms % 1000;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
    };

    // Whisperのセグメントをそのまま使用して字幕を生成
    for (const segment of subtitleSegments) {
      // 空のテキストはスキップ
      if (!segment.text.trim()) continue;

      // 英語から日本語への翻訳
      const japaneseSentence = await translateText(segment.text, apiKey);
      
      // 最小表示時間を設定（500ms）
      const minDuration = 500;
      const duration = segment.endTime - segment.startTime;
      const endTime = segment.startTime + Math.max(duration, minDuration);

      srtContent += `${subtitleIndex}\n${formatTime(Math.round(segment.startTime))} --> ${formatTime(Math.round(endTime))}\n${japaneseSentence}\n\n`;
      subtitleIndex++;
    }

    // SRTファイルを保存
    fs.writeFileSync(subtitleFilePath, srtContent);

    // ffmpegコマンドを改善：フォントスタイルとサイズを調整
    let ffmpegCmd;
    if (srtContent.trim().length === 0) {
      console.log("字幕が生成されなかったため、動画変換に字幕を適用しませんでした。");
      ffmpegCmd = `ffmpeg -y -i "${inputFilePath}" -c copy "${outputFilePath}"`;
    } else {
      ffmpegCmd = `ffmpeg -y -i "${inputFilePath}" -vf "subtitles=${subtitleFilePath}:force_style='Alignment=2,FontName=Noto Sans CJK JP,FontSize=24,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=35'" -c:a copy "${outputFilePath}"`;
    }
    await execAsync(ffmpegCmd);

    // 出力動画を読み込み
    const outputBuffer = fs.readFileSync(outputFilePath);

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="output.mp4"');
    res.status(200).send(outputBuffer);

    // 一時ファイルの削除
    try {
      fs.unlinkSync(inputFilePath);
      fs.unlinkSync(audioFilePath);
      fs.unlinkSync(subtitleFilePath);
      fs.unlinkSync(outputFilePath);
    } catch (unlinkError) {
      console.error('一時ファイルの削除に失敗したで:', unlinkError);
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生したで！' + (err instanceof Error ? err.message : ''));
  }
} 