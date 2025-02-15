import React from 'react';

interface AudioPlayerProps {
  src: string;
  type: string;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ src, type }) => {
  return (
    <div style={{ marginTop: '20px', textAlign: 'center' }}>
      <audio controls style={{ width: '100%', maxWidth: '500px' }}>
        <source src={src} type={type} />
        Your browser does not support the audio element.
      </audio>
    </div>
  );
};

export default AudioPlayer;