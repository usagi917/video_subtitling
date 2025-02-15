import React from 'react';

interface LogProps {
  message: any;
}

const Log: React.FC<LogProps> = ({ message }) => {
  console.log(message);
  return null;
};

export default Log;