import React, { useState } from 'react';
import AudioPlayer from '../components/AudioPlayer';
import Log from '../components/Log';

const HomePage: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [message, setMessage] = useState('');
  const [nijivoiceApiKey, setNijivoiceApiKey] = useState('');
  const [podcastData, setPodcastData] = useState<any | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl) {
      setMessage("YouTubeのURLを入力してな！");
      return;
    }
    setMessage("処理中や、ちょっと待ってや～");
    const formData = new FormData();
    formData.append("youtubeUrl", youtubeUrl);
    formData.append("apiKey", apiKey);

    try {
      const res = await fetch("/api/processVideo", {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const errText = await res.text();
        setMessage("エラー: " + errText);
        return;
      }

      // レスポンスをBlobに変換してダウンロード開始
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "output.mp4";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setMessage("処理完了！ダウンロード開始やで。");
    } catch (err) {
      setMessage("エラー発生: " + String(err));
    }
  };

  const handlePodcastGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl) {
      setMessage("YouTubeのURLを入力してな！");
      return;
    }
    setMessage("Podcast作成中や、ちょっと待ってや～");
    const formData = new FormData();
    formData.append("youtubeUrl", youtubeUrl);
    formData.append("apiKey", apiKey);
    formData.append("nijivoiceApiKey", nijivoiceApiKey);

    try {
      const res = await fetch("/api/generatePodcast", {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const errText = await res.text();
        setMessage("エラー: " + errText);
        return;
      }

      // レスポンスをJSONとして解析
      const data = await res.json();

      // APIから返ってくる audioUrl がBase64形式の場合、中身は実はJSONで音声ファイルのURLが含まれてる可能性があるで！
      if (data.audioUrl && data.audioUrl.startsWith('data:')) {
        try {
          let base64Data = data.audioUrl;
          let mimeType = 'audio/mp3';
          // ヘッダー付きの場合、MIMEタイプとプレフィックスを取り除くで！
          const matches = base64Data.match(/^data:(audio\/[a-zA-Z0-9]+);base64,/);
          if (matches) {
            mimeType = matches[1];
            base64Data = base64Data.replace(/^data:(audio\/[a-zA-Z0-9]+);base64,/, '');
          }
          const decodedStr = atob(base64Data);
          // もしデコード結果がJSON形式ならパースして実際のURLを抽出するで！
          if (decodedStr.trim().startsWith('{')) {
            const parsedData = JSON.parse(decodedStr);
            if (parsedData.generatedVoice && parsedData.generatedVoice.audioFileUrl) {
              data.audioUrl = parsedData.generatedVoice.audioFileUrl;
            } else {
              // 期待するプロパティが無かった場合は、Blob変換でフォールバックするで
              const byteCharacters = decodedStr;
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: mimeType });
              data.audioUrl = URL.createObjectURL(blob);
            }
          } else {
            // JSON形式やなかったら、従来のBlob変換を使うで！
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: mimeType });
            data.audioUrl = URL.createObjectURL(blob);
          }
        } catch (error) {
          setMessage("audioUrl変換中にエラー発生: " + String(error));
          return;
        }
      }

      if (!data.audioData) {
        setMessage("エラー: 音声データが見つかりません");
        return;
      }

      setPodcastData(data);

      setMessage("Podcast作成完了！上のプレーヤーで再生できるで！");
    } catch (err) {
      setMessage("エラー発生: " + String(err));
    }
  };

  const buttonStyle = {
    padding: "15px 40px",
    fontSize: "18px",
    color: "white",
    border: "none",
    borderRadius: "30px",
    cursor: "pointer",
    transition: "all 0.3s ease",
  };

  return (
    <div style={{
      padding: "40px",
      maxWidth: "800px",
      margin: "0 auto",
      minHeight: "100vh",
      background: "linear-gradient(135deg, #f5f7fa 0%, #e4e8eb 100%)",
      fontFamily: "'Segoe UI', Arial, sans-serif"
    }}>
      <h1 style={{
        fontSize: "2.5rem",
        color: "#2c3e50",
        textAlign: "center",
        marginBottom: "40px",
        textShadow: "2px 2px 4px rgba(0,0,0,0.1)"
      }}>YouTube動画自動字幕生成システム</h1>

      <div style={{
        background: "white",
        padding: "30px",
        borderRadius: "15px",
        boxShadow: "0 10px 20px rgba(0,0,0,0.1)",
      }}>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "25px" }}>
            <label style={{
              display: "block",
              marginBottom: "10px",
              color: "#34495e",
              fontWeight: "bold"
            }}>
              YouTube URL
            </label>
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "2px solid #e0e0e0",
                fontSize: "16px",
                transition: "all 0.3s ease",
                outline: "none",
              }}
              placeholder="https://www.youtube.com/watch?v=..."
            />
          </div>

          <div style={{ marginBottom: "25px" }}>
            <label style={{
              display: "block",
              marginBottom: "10px",
              color: "#34495e",
              fontWeight: "bold"
            }}>
              OpenAI APIキー
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "2px solid #e0e0e0",
                fontSize: "16px",
                transition: "all 0.3s ease",
                outline: "none",
              }}
              placeholder="sk-..."
            />
          </div>

          <div style={{ marginBottom: "25px" }}>
            <label style={{
              display: "block",
              marginBottom: "10px",
              color: "#34495e",
              fontWeight: "bold"
            }}>
              にじボイスAPIキー
            </label>
            <input
              type="password"
              value={nijivoiceApiKey}
              onChange={(e) => setNijivoiceApiKey(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "2px solid #e0e0e0",
                fontSize: "16px",
                transition: "all 0.3s ease",
                outline: "none",
              }}
              placeholder="sk-..."
            />
          </div>

          <div style={{ textAlign: "center", display: "flex", gap: "20px", justifyContent: "center" }}>
            <button
              type="submit"
              style={{
                ...buttonStyle,
                backgroundColor: "#3498db",
                boxShadow: "0 4px 6px rgba(52,152,219,0.2)",
              }}
            >
              字幕作成開始
            </button>
            <button
              onClick={handlePodcastGeneration}
              type="button"
              style={{
                ...buttonStyle,
                backgroundColor: "#2ecc71",
                boxShadow: "0 4px 6px rgba(46,204,113,0.2)",
              }}
            >
              Podcast生成
            </button>
          </div>
        </form>
      </div>

      {message && (
        <div style={{
          marginTop: "30px",
          padding: "20px",
          backgroundColor: "white",
          borderRadius: "12px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
          textAlign: "center",
          color: "#2c3e50",
          fontSize: "16px",
          animation: "fadeIn 0.5s ease-in-out"
        }}>
          {message}
        </div>
      )}

      {podcastData && (podcastData.audioData || podcastData.audioUrl) && (
        <AudioPlayer
          src={podcastData.audioUrl || podcastData.audioData}
          type="audio/mpeg"
        />
      )}

      {podcastData && <Log message={{ audioData: podcastData.audioData, audioUrl: podcastData.audioUrl }} />}

      <style jsx>{`
        .container {
          padding: 40px;
          max-width: 800px;
          margin: 0 auto;
          min-height: 100vh;
          background: linear-gradient(135deg, #f5f7fa 0%, #e4e8eb 100%);
          font-family: 'Segoe UI', Arial, sans-serif;
        }

        input[type="password"]:focus, input[type="url"]:focus {
          border-color: #3498db;
          box-shadow: 0 0 0 3px rgba(52,152,219,0.2);
        }

        button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 8px rgba(52,152,219,0.3);
        }
        
        button[type="submit"]:hover {
          background-color: #2980b9;
        }

        button[type="button"]:hover {
          background-color: #27ae60;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default HomePage;