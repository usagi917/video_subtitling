import React, { useState } from 'react';

const HomePage: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [message, setMessage] = useState('');

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
          
          <div style={{ textAlign: "center" }}>
            <button 
              type="submit"
              style={{
                padding: "15px 40px",
                fontSize: "18px",
                backgroundColor: "#3498db",
                color: "white",
                border: "none",
                borderRadius: "30px",
                cursor: "pointer",
                transition: "all 0.3s ease",
                boxShadow: "0 4px 6px rgba(52,152,219,0.2)",
              }}
            >
              字幕作成開始
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
      
      <style jsx>{`
        input[type="password"]:focus, input[type="url"]:focus {
          border-color: #3498db;
          box-shadow: 0 0 0 3px rgba(52,152,219,0.2);
        }
        
        button[type="submit"] {
          padding: 15px 40px;
          font-size: 18px;
          background-color: #3498db;
          color: white;
          border: none;
          border-radius: 30px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 6px rgba(52,152,219,0.2);
        }
        
        button[type="submit"]:hover {
          background-color: #2980b9;
          transform: translateY(-2px);
          box-shadow: 0 6px 8px rgba(52,152,219,0.3);
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        body {
          margin: 0;
          padding: 0;
          background: #f5f7fa;
        }
      `}</style>
    </div>
  );
};

export default HomePage; 