FROM node:18-buster

# Python3のインストール
RUN apt-get update && apt-get install -y python3 && ln -s /usr/bin/python3 /usr/bin/python

WORKDIR /app

# package.jsonとpackage-lock.jsonをコピーして依存関係をインストール
COPY package*.json ./
RUN npm install

# アプリケーションのソースコードをコピー
COPY . .

# Next.jsのビルド
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"] 