import React from 'react';
import { avatar } from './avatar';

export const TypingIndicator: React.FC = () => {
  const mimiAvatarUrl = avatar
  return (
    <div className="flex justify-start items-end gap-2">
      <img src={mimiAvatarUrl} alt="Mimi Avatar" className="w-8 h-8 rounded-full" />
      <div className="bg-gray-200 rounded-r-2xl rounded-tl-2xl px-4 py-2">
        <div className="flex items-center space-x-1.5">
          <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
          <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
          <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
        </div>
      </div>
    </div>
  );
};