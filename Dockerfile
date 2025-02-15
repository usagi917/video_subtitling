FROM ubuntu:latest

RUN apt-get update && apt-get install -y python3

# Node.jsの環境も必要やから、Node.jsのイメージをベースにする
FROM node:20-slim AS builder

# 作業ディレクトリを設定
WORKDIR /app

# アプリケーションのソースコードをコピー
COPY . .

# Pythonのインストール
RUN apt-get update && apt-get install -y -q python3 python3-pip

# npm install 実行時に、pythonの場所を教える
ENV PYTHON=/usr/bin/python3

# 依存関係をインストール
RUN npm install

# ビルド
RUN npm run build

# 実行用のイメージ
FROM node:20-slim

WORKDIR /app

COPY --from=builder /app ./

CMD ["npm", "start"] 