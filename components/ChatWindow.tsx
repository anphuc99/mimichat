
import React, { useEffect, useRef } from 'react';
import type { Message, Character } from '../types';
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
  onCollectVocabulary?: (korean: string, messageId: string) => void;
  onRegenerateImage?: (messageId: string) => Promise<void>;
  onDeleteMessage?: (messageId: string) => void;
  characters: Character[];
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
}) => {
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);
  return (
    <div className="flex-1 p-4 overflow-y-auto bg-gray-50 flex flex-col">
      <div className="space-y-4">
        {messages.map((message) => {
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
