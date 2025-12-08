
import React, { useEffect, useRef, useState } from 'react';
import type { Message, Character, VocabularyItem } from '../types';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';

interface VocabHintsProps {
  reviewVocabularies: VocabularyItem[];
  messagesLength: number;
  onSuggest?: (v: VocabularyItem) => void;
}

const VocabHints: React.FC<VocabHintsProps> = ({ reviewVocabularies, messagesLength, onSuggest }) => {
  const [showPanel, setShowPanel] = useState<boolean>(false);

  return (
    <div className="sticky top-0 z-20 w-full bg-gray-50 px-2 py-1 transform -translate-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-purple-600">📚 {reviewVocabularies.length} từ cần ôn</div>
        <button
          className="text-xs px-2 py-1 bg-white border rounded-full shadow-sm hover:bg-gray-50"
          onClick={() => setShowPanel(s => !s)}
        >
          {showPanel ? 'Ẩn gợi ý' : 'Hiện gợi ý'}
        </button>
      </div>

      {showPanel && (
        <div className="p-1 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-lg">📚</span>
            <span className="text-sm font-semibold text-purple-700">Từ vựng cần ôn tập hôm nay:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {reviewVocabularies.map((vocab) => (
              <button
                key={vocab.id}
                onClick={() => onSuggest?.(vocab)}
                className="px-3 py-1.5 bg-white rounded-full border border-purple-300 hover:border-purple-500 hover:bg-purple-50 transition-colors shadow-sm"
                title={`Gợi ý: Hãy hỏi về "${vocab.korean}"`}
              >
                <span className="font-medium text-purple-800">{vocab.korean}</span>
                <span className="text-gray-500 text-sm ml-1">({vocab.vietnamese})</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1 italic">
            💡 Nhấn vào từ để tạo gợi ý hội thoại, hoặc tự do trò chuyện - AI sẽ cố gắng sử dụng những từ này!
          </p>
        </div>
      )}
    </div>
  );
};

interface ChatWindowProps {
  messages: Message[];
  isLoading: boolean;
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
  characters: Character[];
  reviewVocabularies?: VocabularyItem[];
  onSuggestWithVocabulary?: (vocabulary: VocabularyItem) => void;
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
  onRegenerateImage,
  characters,
  reviewVocabularies = [],
  onSuggestWithVocabulary,
}) => {
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);
  return (
    <div className="flex-1 p-4 overflow-y-auto bg-gray-50 flex flex-col">
      {reviewVocabularies.length > 0 && (
        <VocabHints reviewVocabularies={reviewVocabularies} messagesLength={messages.length} onSuggest={onSuggestWithVocabulary} />
      )}

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
