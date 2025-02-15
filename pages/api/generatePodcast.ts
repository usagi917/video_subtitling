import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import os from 'os';
import path from 'path';
import util from 'util';
import { exec } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import OpenAI from 'openai';
import YTDlp from 'yt-dlp-exec';
import axios from 'axios';

const execAsync = util.promisify(exec);

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
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

async function downloadYouTubeVideo(url: string): Promise<string> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-'));
  const outputTemplate = path.join(tempDir, 'video.%(ext)s');

  try {
    await YTDlp(url, {
      output: outputTemplate,
      format: 'best',
    });

    const files = fs.readdirSync(tempDir);
    const videoFile = files.find(file => file.startsWith('video.'));
    if (!videoFile) {
      throw new Error('ダウンロードした動画ファイルが見つからんで！');
    }

    return path.join(tempDir, videoFile);
  } catch (error: any) {
    throw new Error(`YouTube動画のダウンロードに失敗したで: ${error.message}`);
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

interface SubtitleSegment {
  startTime: number;
  endTime: number;
  text: string;
}

async function performTranscription(audioFilePath: string, apiKey: string): Promise<SubtitleSegment[]> {
  const openai = new OpenAI({ apiKey: apiKey });
  const audioFile = fs.createReadStream(audioFilePath);
  
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      response_format: 'verbose_json',
      language: 'ja'
    });

    if (!transcription || !transcription.segments) {
      throw new Error('transcription.segmentsが存在してへんで！');
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

async function generatePodcastScript(transcript: string, apiKey: string): Promise<string> {
  const openai = new OpenAI({ apiKey });
  const prompt = `以下の文字起こしを元に、動画の主要な内容を分かりやすく面白おかしく比喩も使い解説するPodcast用のスクリプトを日本語で作成してください。文章は自然な語り口で、聞き手に親しみやすい内容にしてください。100文字で出力してください。\n\n文字起こし:\n${transcript}`;
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });
    const script = response.choices[0].message.content.trim();
    return script;
  } catch (error: any) {
    console.error('Podcast script generation error:', error);
    throw new Error(`Podcastスクリプト生成に失敗したで: ${error.message}`);
  }
}

async function generatePodcastTTS(text: string, nijivoiceApiKey: string): Promise<Buffer> {
  if (!nijivoiceApiKey) {
    throw new Error('にじボイスAPIキーが提供されてへんで！');
  }

  // 受け取ったtext(スクリプト)をログに出力
  console.log("generatePodcastTTSに渡されたtext:", text);

  try {
    // 固定のにじボイスIDを利用
    const voiceActorId = "8c08fd5b-b3eb-4294-b102-a1da00f09c72";

    // 音声生成リクエスト
    const response = await axios.post(
      `https://api.nijivoice.com/api/platform/v1/voice-actors/${voiceActorId}/generate-voice`,
      {
        script: text,
        speed: "1.0",
        format: "mp3",
        pitch: "0",
        intonation: "1.0",
        volume: "1.0"
      },
      {
        headers: {
          'x-api-key': nijivoiceApiKey,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    if (!response.data) {
      throw new Error('音声データが生成されへんかったで！');
    }

    return Buffer.from(response.data);
  } catch (error: any) {
    console.error('TTS生成エラー:', error);
    if (error.response) {
      console.error('エラーレスポンス:', error.response.data);
      throw new Error(`TTS生成に失敗したで: ${error.response.status} - ${error.response.statusText}`);
    }
    throw new Error(`TTS生成に失敗したで: ${error.message}`);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowedやで');
    return;
  }

  let tempFiles: string[] = [];
  let tempDir: string | null = null;

  try {
    const { fields } = await parseForm(req);
    const youtubeUrl = (Array.isArray(fields.youtubeUrl) ? fields.youtubeUrl[0] : fields.youtubeUrl) as string;
    const apiKey = (Array.isArray(fields.apiKey) ? fields.apiKey[0] : fields.apiKey) as string;
    const nijivoiceApiKey = (Array.isArray(fields.nijivoiceApiKey) ? fields.nijivoiceApiKey[0] : fields.nijivoiceApiKey) as string;

    if (!nijivoiceApiKey) {
      res.status(400).send('にじボイスAPIキーも必要やで！');
      return;
    }

    if (!youtubeUrl || !apiKey) {
      res.status(400).send('YouTubeのURLとAPIキー必要やで！');
      return;
    }

    // YouTube動画を一時ダウンロード
    const inputFilePath = await downloadYouTubeVideo(youtubeUrl);
    tempFiles.push(inputFilePath);
    tempDir = path.dirname(inputFilePath);

    // 音声抽出
    const audioFilePath = path.join(tempDir, 'audio.wav');
    tempFiles.push(audioFilePath);
    await extractAudioFromVideo(inputFilePath, audioFilePath);

    // Whisperで文字起こし
    const subtitleSegments = await performTranscription(audioFilePath, apiKey);
    let transcript = '';
    for (const segment of subtitleSegments) {
      if (segment.text) {
        transcript += segment.text + ' ';
      }
    }

    // GPT APIでPodcast解説スクリプト生成
    const podcastScript = await generatePodcastScript(transcript, apiKey);

    // 生成されたスクリプトをログに出力
    console.log("生成されたPodcastスクリプト:", podcastScript);

    // にじボイスTTS APIでMP3生成
    const podcastAudioBuffer = await generatePodcastTTS(podcastScript, nijivoiceApiKey);

    // MP3ファイルを一時保存
    const outputFilePath = path.join(tempDir, 'podcast.mp3');
    fs.writeFileSync(outputFilePath, podcastAudioBuffer);
    tempFiles.push(outputFilePath);

    // Base64エンコードしたMP3データを返す
    const outputBuffer = fs.readFileSync(outputFilePath);
    const base64Audio = outputBuffer.toString('base64');
    
    const response = {
      success: true,
      audioData: `data:audio/mp3;base64,${base64Audio}`,
      message: '音声の生成に成功したで！',
      audioUrl: `data:audio/mp3;base64,${base64Audio}`
    };

    // レスポンスの確認
    console.log("generatePodcast API response:", response);

    if (!response.audioUrl) { // audioUrl が存在するか確認
      return res.status(500).json({ error: '音声URLがおかしいで！' });
    }

    return res.status(200).json(response); // audioUrl を返す
  } catch (err: any) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'エラーが発生したで: ' + (err instanceof Error ? err.message : '')
    });
  } finally {
    // 一時ファイルとディレクトリ削除
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
      console.error('一時ファイルの削除中にエラーが発生したで:', cleanupError);
    }
  }
} 