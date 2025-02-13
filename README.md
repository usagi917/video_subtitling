# video\_subtitling\_mvp

動画に字幕を自動生成するNext.js製のWebアプリケーションです。

## 概要

このアプリケーションは、ユーザーが動画ファイルをアップロードすると、以下の処理を行います。

1.  **音声認識**: Google Cloud Speech-to-Text APIを使用して、動画の音声をテキストに変換します。
2.  **字幕生成**: OpenAI API (GPTモデル) を使用して、認識されたテキストを元に字幕を生成します。
3.  **字幕調整**: (必要に応じて) 生成された字幕のタイミングや表現を調整します。
4.  **字幕付き動画生成**: (オプション) FFmpegを使用して、元の動画に字幕を焼き付けた新しい動画ファイルを生成します。

## 使用技術

*   **フロントエンド**:
    *   Next.js (React)
    *   TypeScript
*   **バックエンド**:
    *   Next.js API Routes
    *   Google Cloud Speech-to-Text API
    *   OpenAI API
    *   FFmpeg (fluent-ffmpeg)

## 開発環境セットアップ

### 1. 必要なもの

*   Node.js (バージョン18以上推奨)
*   npm (またはyarn)
*   Google Cloud Platform (GCP) プロジェクト
    *   Speech-to-Text APIの有効化
    *   サービスアカウントキーの作成 (JSON形式)
*   OpenAI APIキー

### 2. プロジェクトのクローン

```bash
git clone [このリポジトリのURL]
cd video_subtitling_mvp
```

### 3. 依存関係のインストール

```bash
npm install
```

### 4. 環境変数の設定

`.env.local` ファイルを作成し、以下の環境変数を設定してください。

```
GOOGLE_APPLICATION_CREDENTIALS=[GCPサービスアカウントキーのパス]
OPENAI_API_KEY=[OpenAI APIキー]
```

### 5. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開くと、アプリケーションが表示されます。

## 本番環境へのデプロイ

Vercelなどのホスティングサービスを利用すると、簡単にデプロイできます。

## ライセンス

MIT License

