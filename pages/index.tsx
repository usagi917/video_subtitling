import React, { useState } from 'react';

const HomePage: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile) {
      setMessage("動画ファイルを選択してな！");
      return;
    }
    setMessage("処理中や、ちょっと待ってや～");
    const formData = new FormData();
    formData.append("video", videoFile);
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
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>動画自動字幕生成システム</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "15px" }}>
          <label>
            動画ファイル (MP4):
            <input 
              type="file" 
              accept="video/mp4" 
              onChange={(e) => {
                if(e.target.files && e.target.files[0]){
                  setVideoFile(e.target.files[0]);
                }
              }}
              style={{ marginLeft: "10px" }}
            />
          </label>
        </div>
        <div style={{ marginBottom: "15px" }}>
          <label>
            OpenAI APIキー:
            <input 
              type="password" 
              value={apiKey} 
              onChange={(e) => setApiKey(e.target.value)}
              style={{ marginLeft: "10px", width: "300px" }}
              placeholder="sk-..."
            />
          </label>
        </div>
        <div>
          <button 
            type="submit"
            style={{
              padding: "10px 20px",
              backgroundColor: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            字幕作成開始
          </button>
        </div>
      </form>
      {message && (
        <p style={{ 
          marginTop: "20px", 
          padding: "10px", 
          backgroundColor: "#f0f0f0", 
          borderRadius: "4px" 
        }}>
          {message}
        </p>
      )}
    </div>
  );
};

export default HomePage; 