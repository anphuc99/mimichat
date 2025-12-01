
import React, { useEffect, useRef } from 'react';
import type { Message, Character } from '../types';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';

interface ChatWindowProps {
  messages: Message[];
  isLoading: boolean;
  onReplayAudio: (audioData: string, characterName?: string) => void;
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
  characters: Character[];
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ 
  messages, 
  isLoading, 
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
  characters,
}) => {
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
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
              avatarUrl={character?.avatar}
            />
          );
        })}
        {isLoading && <TypingIndicator />}
        <div ref={chatEndRef} />
      </div>
    </div>
  );
};
