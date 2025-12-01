import React, { useEffect, useRef, useMemo } from 'react';
import type { Message, VocabularyItem, Character } from '../types';
import { MessageBubble } from './MessageBubble';
import { avatar } from './avatar';

interface ChatContextViewerProps {
  messages: Message[];
  vocabulary: VocabularyItem;
  currentUsageIndex: number;
  onNavigate: (direction: 'prev' | 'next') => void;
  onClose: () => void;
  onReplayAudio: (audioData: string, characterName?: string) => void;
  characters: Character[];
}

export const ChatContextViewer: React.FC<ChatContextViewerProps> = ({
  messages,
  vocabulary,
  currentUsageIndex,
  onNavigate,
  onClose,
  onReplayAudio,
  characters,
}) => {
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  
  // Find all messages that contain the vocabulary word
  const matchingMessages = useMemo(() => {
    if (!vocabulary || !messages) return [];
    return messages.filter(m => 
      m.text.includes(vocabulary.korean) || 
      (m.rawText && m.rawText.includes(vocabulary.korean))
    );
  }, [messages, vocabulary]);

  // Safety check for vocabulary
  if (!vocabulary) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500">Không có dữ liệu từ vựng</p>
      </div>
    );
  }
  
  const currentMessage = matchingMessages[currentUsageIndex];
  const currentMessageId = currentMessage?.id;

  // Auto-scroll to highlighted message when it changes
  useEffect(() => {
    if (currentMessageId) {
      const messageElement = messageRefs.current.get(currentMessageId);
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      
      // Auto-play audio when message changes
      if (currentMessage?.audioData) {
        onReplayAudio(currentMessage.audioData, currentMessage.characterName);
      }
    }
  }, [currentMessageId, currentMessage, onReplayAudio]);

  // Highlight keyword in message text
  const highlightText = (text: string, keyword: string): React.ReactNode => {
    if (!keyword) return text;
    
    const parts = text.split(keyword);
    return parts.map((part, index) => (
      <React.Fragment key={index}>
        {part}
        {index < parts.length - 1 && (
          <mark className="bg-yellow-300 font-bold px-1 rounded">{keyword}</mark>
        )}
      </React.Fragment>
    ));
  };

  const handlePlayCurrentMessage = () => {
    if (currentMessage?.audioData) {
      onReplayAudio(currentMessage.audioData, currentMessage.characterName);
    }
  };

  const canGoPrev = currentUsageIndex > 0;
  const canGoNext = currentUsageIndex < matchingMessages.length - 1;

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto bg-white overflow-hidden">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white p-4 shadow-lg flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-bold">Xem trong ngữ cảnh</h2>
            <p className="text-sm opacity-90">
              Từ vựng: <span className="font-bold">{vocabulary.korean}</span> - {vocabulary.vietnamese}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
            title="Đóng"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Usage counter */}
        {matchingMessages.length > 0 ? (
          <div className="flex items-center justify-center space-x-2 text-sm">
            <span>Câu {currentUsageIndex + 1}/{matchingMessages.length}</span>
          </div>
        ) : (
          <div className="flex items-center justify-center space-x-2 text-sm text-yellow-200">
            <span>Không tìm thấy câu nào chứa từ này trong đoạn chat hiện tại.</span>
          </div>
        )}
      </header>

      {/* Chat messages */}
      <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
        <div className="space-y-4">
          {messages.map((message) => {
            const isHighlighted = message.id === currentMessageId;
            const character = characters.find(c => c.name === message.characterName);
            
            // Create modified message with highlighted text
            const displayMessage = isHighlighted 
              ? { ...message, text: message.text } // Will be processed in render
              : message;

            return (
              <div 
                key={message.id}
                ref={(el) => {
                  if (el) messageRefs.current.set(message.id, el);
                  else messageRefs.current.delete(message.id);
                }}
                className={`transition-all ${isHighlighted ? 'ring-4 ring-yellow-400 rounded-lg' : ''}`}
              >
                {isHighlighted ? (
                  <div className={`flex ${displayMessage.sender === 'user' ? 'justify-end' : 'justify-start items-start gap-2'}`}>
                    {displayMessage.sender !== 'user' && (
                       <img 
                        src={character?.avatar || avatar} 
                        alt={`${displayMessage.characterName || 'Mimi'} Avatar`} 
                        className="w-8 h-8 rounded-full object-cover" 
                      />
                    )}
                    <div className={`max-w-[80%] ${displayMessage.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-white border border-gray-200'} rounded-2xl px-4 py-3 shadow-sm`}>
                      {displayMessage.sender === 'bot' && displayMessage.characterName && (
                        <p className="text-xs font-semibold text-purple-600 mb-1">
                          {displayMessage.characterName}
                        </p>
                      )}
                      <p className={`text-base ${displayMessage.sender === 'user' ? 'text-white' : 'text-gray-800'}`}>
                        {highlightText(displayMessage.text, vocabulary.korean)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <MessageBubble
                    message={displayMessage}
                    onReplayAudio={onReplayAudio}
                    onGenerateAudio={async () => {}}
                    onTranslate={async () => ""}
                    onStoreTranslation={() => {}}
                    onRetry={() => {}}
                    isJournalView={true}
                    avatarUrl={character?.avatar}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action buttons */}
      <div className="p-4 bg-white border-t border-gray-200 space-y-3 flex-shrink-0">
        {/* Play audio button */}
        {currentMessage?.audioData && (
          <button
            onClick={handlePlayCurrentMessage}
            className="w-full py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium flex items-center justify-center space-x-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            <span>Nghe câu này</span>
          </button>
        )}

        {/* Navigation */}
        {matchingMessages.length > 1 && (
          <div className="flex space-x-3">
            <button
              onClick={() => onNavigate('prev')}
              disabled={!canGoPrev}
              className="flex-1 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center space-x-2"
            >
              <span>◀</span>
              <span>Câu trước</span>
            </button>
            <button
              onClick={() => onNavigate('next')}
              disabled={!canGoNext}
              className="flex-1 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center space-x-2"
            >
              <span>Câu sau</span>
              <span>▶</span>
            </button>
          </div>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="w-full py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium flex items-center justify-center space-x-2"
        >
          <span>↩</span>
          <span>Quay lại bài tập</span>
        </button>
      </div>
    </div>
  );
};
