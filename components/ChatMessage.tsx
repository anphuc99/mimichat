
import React from 'react';
import { Message } from '../types';
import { BotIcon, UserIcon } from './icons';

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.sender === 'user';

  return (
    <div className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center">
          <BotIcon />
        </div>
      )}
      <div
        className={`px-4 py-3 rounded-2xl max-w-sm md:max-w-md lg:max-w-lg break-words transition-all duration-300 ${
          isUser
            ? 'bg-blue-500 text-white rounded-br-lg'
            : 'bg-gray-200 text-gray-800 rounded-bl-lg'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.text}</p>
      </div>
       {isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
          <UserIcon />
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
