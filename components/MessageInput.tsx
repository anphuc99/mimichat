import React, { useState } from 'react';

interface MessageInputProps {
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  onSummarize: () => void;
}

const EMOJIS = ['😊', '😂', '❤️', '👍', '😢', '😠', '🎉', '🤔', '👋', '🎨', '⚽', '🍰'];

export const MessageInput: React.FC<MessageInputProps> = ({ onSendMessage, isLoading, onSummarize }) => {
  const [inputValue, setInputValue] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSendMessage(inputValue);
      setInputValue('');
      setShowEmojiPicker(false);
    }
  };

  const handleEmojiClick = (emoji: string) => {
    setInputValue(prev => prev + emoji);
  };

  const handleLike = () => {
    onSendMessage('👍');
  }

  return (
    <div className="p-4 bg-white border-t border-gray-200 sticky bottom-0">
       {showEmojiPicker && (
        <div className="grid grid-cols-6 gap-2 p-2 mb-2 bg-gray-100 rounded-lg">
          {EMOJIS.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleEmojiClick(emoji)}
              className="text-2xl rounded-lg hover:bg-gray-200 p-1 transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex items-center space-x-3">
        <button
            type="button"
            onClick={onSummarize}
            className="flex-shrink-0 text-gray-500 hover:text-blue-600 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
            disabled={isLoading}
            aria-label="Kết thúc ngày & Tóm tắt"
            title="Kết thúc ngày & Tóm tắt"
          >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        </button>
        <div className="flex-1 w-full relative">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Aa"
            className="w-full pl-4 pr-10 py-2 bg-gray-100 border border-transparent rounded-full focus:outline-none focus:ring-2 focus:ring-blue-400"
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label="Chọn biểu tượng cảm xúc"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 100-2 1 1 0 000 2zm7-1a1 1 0 11-2 0 1 1 0 012 0zm-.464 5.535a.75.75 0 01.083-1.059 5.005 5.005 0 00-6.238 0 .75.75 0 01-1.141.975 6.505 6.505 0 018.103 0 .75.75 0 01-.807.084z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        
        {inputValue ? (
          <button
            type="submit"
            className="flex-shrink-0 text-blue-500 hover:text-blue-600 disabled:text-gray-300 disabled:cursor-not-allowed"
            disabled={isLoading}
            aria-label="Send message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        ) : (
           <button
            type="button"
            onClick={handleLike}
            className="flex-shrink-0 text-blue-500 hover:text-blue-600 disabled:text-gray-300 disabled:cursor-not-allowed"
            disabled={isLoading}
            aria-label="Send like"
          >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
               <path d="M21.3 8.29C20.42 7.42 19.26 7 18 7h-3.42c.33-.89.51-1.85.51-2.85 0-1.28-.48-2.4-1.28-3.21-.8-.8-1.92-1.28-3.21-1.28-1.54 0-2.85.83-3.53 2.08L6 6.32V19h11.23c.91 0 1.7-.55 2.05-1.38l2.6-6.5c.34-.85.16-1.82-.48-2.83zM4 19h2V7H4v12z"/>
             </svg>
           </button>
        )}
      </form>
    </div>
  );
};