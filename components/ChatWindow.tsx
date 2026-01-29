
import React, { useEffect, useRef } from 'react';
import type { Message, Character, VocabularyStore } from '../types';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';

interface ChatWindowProps {
  messages: Message[];
  isLoading: boolean;
  isAISearching?: boolean;
  onReplayAudio: (audioData: string, characterName?: string) => Promise<void> | void;
  onGenerateAudio: (messageId: string, force?: boolean) => Promise<void>;
  onTranslate: (text: string) => Promise<string>;
  onStoreTranslation: (messageId: string, translation: string) => void;
  onRetry: () => void;
  editingMessageId: string | null;
  setEditingMessageId: (id: string | null) => void;
  onUpdateMessage: (messageId: string, newText: string) => Promise<void>;
  onUpdateBotMessage: (messageId: string, newText: string, newTone: string) => Promise<void>;
  onRegenerateTone: (text: string, characterName: string) => Promise<string>;
  onCollectVocabulary?: (korean: string, vietnamese: string, memory: string, linkedMessageIds: string[], messageId: string) => void | Promise<void>;
  onRegenerateImage?: (messageId: string) => Promise<void>;
  onDeleteMessage?: (messageId: string) => void;
  characters: Character[];
  isListeningMode?: boolean;
  onToggleListeningMode?: () => void;
  // New props for collect popup
  dailyChatId?: string;
  dailyChatDate?: string;
  vocabularyStore?: VocabularyStore;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ 
  messages, 
  isLoading, 
  isAISearching = false,
  onReplayAudio, 
  onGenerateAudio, 
  onTranslate, 
  onStoreTranslation, 
  onRetry,
  editingMessageId,
  setEditingMessageId,
  onUpdateMessage,
  onUpdateBotMessage,
  onRegenerateTone,
  onCollectVocabulary,
  onRegenerateImage,
  onDeleteMessage,
  characters,
  isListeningMode = false,
  onToggleListeningMode,
  dailyChatId = '',
  dailyChatDate = '',
  vocabularyStore,
}) => {
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);
  return (
    <div className="flex-1 p-4 overflow-y-auto bg-gray-50 flex flex-col relative">
      {/* Listening Mode Toggle Button */}
      {onToggleListeningMode && (
        <button
          onClick={onToggleListeningMode}
          className={`fixed bottom-24 right-4 z-50 p-3 rounded-full shadow-lg transition-all duration-300 ${
            isListeningMode 
              ? 'bg-purple-600 text-white hover:bg-purple-700 ring-4 ring-purple-300' 
              : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
          title={isListeningMode ? 'Tắt chế độ luyện nghe' : 'Bật chế độ luyện nghe'}
        >
          {isListeningMode ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          )}
        </button>
      )}

      {/* Listening Mode Indicator */}
      {isListeningMode && (
        <div className="sticky top-0 z-40 mb-4 p-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg shadow-md flex items-center justify-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          <span className="font-medium">Chế độ luyện nghe - Nhấn vào tin nhắn để hiện chữ</span>
        </div>
      )}

      <div className="space-y-4">
        {/* Only show public messages (filter out private messages) */}
        {messages.filter(m => m.chatType !== 'private').map((message) => {
          const character = characters.find(c => c.name === message.characterName);
          return (
            <MessageBubble
              key={message.id}
              message={message}
              onReplayAudio={onReplayAudio}
              onGenerateAudio={onGenerateAudio}
              onTranslate={onTranslate}
              onStoreTranslation={onStoreTranslation}
              onRetry={onRetry}
              editingMessageId={editingMessageId}
              setEditingMessageId={setEditingMessageId}
              onUpdateMessage={onUpdateMessage}
              onUpdateBotMessage={onUpdateBotMessage}
              onRegenerateTone={onRegenerateTone}
              onCollectVocabulary={onCollectVocabulary}
              onRegenerateImage={onRegenerateImage}
              onDeleteMessage={onDeleteMessage}
              avatarUrl={character?.avatar}
              isListeningMode={isListeningMode}
              dailyChatId={dailyChatId}
              dailyChatDate={dailyChatDate}
              characters={characters}
              vocabularyStore={vocabularyStore}
            />
          );
        })}
        {isAISearching && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200 animate-pulse">
            <svg className="w-5 h-5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-blue-700 text-sm font-medium">🔍 AI đang tìm kiếm thông tin trong lịch sử hội thoại...</span>
          </div>
        )}
        {isLoading && !isAISearching && <TypingIndicator />}
        <div ref={chatEndRef} />
      </div>
    </div>
  );
};
