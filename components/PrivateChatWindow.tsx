import React, { useState, useRef, useEffect } from 'react';
import type { Message, Character } from '../types';
import { avatar } from './avatar';

interface PrivateChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
  characters: Character[]; // Available characters in current chat
  allMessages: Message[]; // All messages to filter private ones
  onSendPrivateMessage: (text: string, characterId: string, characterName: string) => void;
  onReplayAudio: (audioData: string, characterName?: string) => Promise<void>;
  isLoading: boolean;
  hasNewPrivateMessage?: boolean; // Flag to show notification
}

export const PrivateChatWindow: React.FC<PrivateChatWindowProps> = ({
  isOpen,
  onClose,
  characters,
  allMessages,
  onSendPrivateMessage,
  onReplayAudio,
  isLoading,
  hasNewPrivateMessage = false,
}) => {
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('');
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-select first character if none selected
  useEffect(() => {
    if (isOpen && characters.length > 0 && !selectedCharacterId) {
      setSelectedCharacterId(characters[0].id);
    }
  }, [isOpen, characters, selectedCharacterId]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages, selectedCharacterId]);

  // Focus input when character selected
  useEffect(() => {
    if (isOpen && selectedCharacterId) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, selectedCharacterId]);

  // Filter private messages for selected character
  const privateMessages = allMessages.filter(
    m => m.chatType === 'private' && m.privateWithCharacterId === selectedCharacterId
  );

  const selectedCharacter = characters.find(c => c.id === selectedCharacterId);

  const handleSend = () => {
    if (!inputText.trim() || !selectedCharacterId || !selectedCharacter || isLoading) return;
    
    const text = inputText.trim();
    setInputText('');
    onSendPrivateMessage(text, selectedCharacterId, selectedCharacter.name);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-20 right-4 w-96 h-[500px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col z-50 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-500 to-purple-600 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          <span className="font-semibold">Chat riêng</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/20 rounded-full transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Character Selector */}
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {characters.map(char => {
            const charPrivateCount = allMessages.filter(
              m => m.chatType === 'private' && m.privateWithCharacterId === char.id
            ).length;
            
            return (
              <button
                key={char.id}
                onClick={() => setSelectedCharacterId(char.id)}
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full transition-all ${
                  selectedCharacterId === char.id
                    ? 'bg-purple-500 text-white shadow-md'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <img
                  src={char.avatar || avatar}
                  alt={char.name}
                  className="w-6 h-6 rounded-full object-cover"
                />
                <span className="text-sm font-medium">{char.name}</span>
                {charPrivateCount > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    selectedCharacterId === char.id
                      ? 'bg-white/20 text-white'
                      : 'bg-purple-100 text-purple-600'
                  }`}>
                    {charPrivateCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {characters.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-2">
            Chưa có nhân vật nào trong cuộc trò chuyện
          </p>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gradient-to-b from-purple-50/30 to-pink-50/30">
        {selectedCharacter && privateMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <img
              src={selectedCharacter.avatar || avatar}
              alt={selectedCharacter.name}
              className="w-16 h-16 rounded-full object-cover mb-3 opacity-50"
            />
            <p className="text-sm text-center">
              Bắt đầu chat riêng với {selectedCharacter.name}
            </p>
            <p className="text-xs mt-1">
              🔒 Các nhân vật khác sẽ không biết nội dung này
            </p>
          </div>
        )}

        {privateMessages.map((message) => {
          const isUser = message.sender === 'user';
          return (
            <div
              key={message.id}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'} items-end gap-2`}
            >
              {!isUser && selectedCharacter && (
                <img
                  src={selectedCharacter.avatar || avatar}
                  alt={selectedCharacter.name}
                  className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                />
              )}
              <div
                className={`max-w-[75%] px-3 py-2 rounded-2xl ${
                  isUser
                    ? 'bg-purple-500 text-white rounded-br-md'
                    : 'bg-white text-gray-800 rounded-bl-md shadow-sm border border-gray-100'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                {/* Audio button for bot messages */}
                {!isUser && message.audioData && (
                  <button
                    onClick={() => onReplayAudio(message.audioData!, message.characterName)}
                    className="mt-1 text-gray-400 hover:text-purple-500 transition-colors"
                    title="Nghe"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex justify-start items-end gap-2">
            {selectedCharacter && (
              <img
                src={selectedCharacter.avatar || avatar}
                alt={selectedCharacter.name}
                className="w-7 h-7 rounded-full object-cover flex-shrink-0"
              />
            )}
            <div className="bg-white text-gray-800 rounded-2xl rounded-bl-md shadow-sm border border-gray-100 px-4 py-3">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      {selectedCharacter ? (
        <div className="p-3 border-t border-gray-100 bg-white">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Nhắn riêng cho ${selectedCharacter.name}...`}
              className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent max-h-24"
              rows={1}
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isLoading}
              className="p-2.5 bg-purple-500 text-white rounded-xl hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            Tin nhắn riêng tư - Các nhân vật khác không thể đọc được
          </p>
        </div>
      ) : (
        <div className="p-4 border-t border-gray-100 bg-gray-50 text-center text-gray-500 text-sm">
          Chọn một nhân vật để bắt đầu chat riêng
        </div>
      )}
    </div>
  );
};

// Button component to open private chat
export const PrivateChatButton: React.FC<{
  onClick: () => void;
  hasNewMessage?: boolean;
}> = ({ onClick, hasNewMessage = false }) => {
  return (
    <button
      onClick={onClick}
      className="relative p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-full transition-colors"
      title="Chat riêng"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      {/* Lock icon overlay */}
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 absolute bottom-1 right-1 text-purple-600" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
      </svg>
      {/* Notification dot */}
      {hasNewMessage && (
        <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
      )}
    </button>
  );
};
