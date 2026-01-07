import React, { useState, useCallback } from 'react';
import type { Message } from '../types';
import { avatar } from './avatar';

// Hàm render markdown bold (**text**) thành HTML
const renderBoldText = (text: string): string => {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong class="text-purple-600 font-bold">$1</strong>');
};

// Component để render text với các từ ẩn có thể click để hiện
const HiddenWordsText: React.FC<{ text: string }> = ({ text }) => {
  const [revealedWords, setRevealedWords] = useState<Set<number>>(new Set());

  const handleReveal = useCallback((index: number) => {
    setRevealedWords(prev => new Set(prev).add(index));
  }, []);

  // Parse text để tìm các từ in đậm
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let wordIndex = 0;
  const regex = /\*\*(.+?)\*\*/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Thêm text trước từ in đậm
    if (match.index > lastIndex) {
      parts.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
    }

    const currentWordIndex = wordIndex;
    const isRevealed = revealedWords.has(currentWordIndex);

    if (isRevealed) {
      // Hiện từ đã được reveal
      parts.push(
        <strong key={`word-${currentWordIndex}`} className="text-purple-600 font-bold">
          {match[1]}
        </strong>
      );
    } else {
      // Ẩn từ, cho phép click để hiện
      parts.push(
        <button
          key={`hidden-${currentWordIndex}`}
          onClick={() => handleReveal(currentWordIndex)}
          className="inline-flex items-center px-2 py-0.5 mx-0.5 bg-gray-300 hover:bg-gray-400 rounded text-transparent select-none transition-colors cursor-pointer"
          style={{ minWidth: `${Math.max(match[1].length * 8, 40)}px` }}
          title="Nhấp để hiện từ"
        >
          <span className="opacity-0">{match[1]}</span>
        </button>
      );
    }

    lastIndex = match.index + match[0].length;
    wordIndex++;
  }

  // Thêm phần text còn lại
  if (lastIndex < text.length) {
    parts.push(<span key={`text-end`}>{text.slice(lastIndex)}</span>);
  }

  return <>{parts}</>;
};

interface MessageBubbleProps {
  message: Message;
  onReplayAudio: (audioData: string, characterName?: string) => Promise<void> | void;
  onGenerateAudio: (messageId: string, force?: boolean) => Promise<void>;
  onTranslate: (text: string) => Promise<string>;
  onStoreTranslation: (messageId: string, translation: string) => void;
  onRetry: () => void;
  isJournalView?: boolean;
  editingMessageId?: string | null;
  setEditingMessageId?: (id: string | null) => void;
  onUpdateMessage?: (messageId: string, newText: string) => Promise<void>;
  onUpdateBotMessage?: (messageId: string, newText: string, newTone: string) => Promise<void>;
  onRegenerateTone?: (text: string, characterName: string) => Promise<string>;
  onCollectVocabulary?: (korean: string, messageId: string) => void | Promise<void>;
  onRegenerateImage?: (messageId: string) => Promise<void>;
  onDeleteMessage?: (messageId: string) => void;
  avatarUrl?: string;
  isListeningMode?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ 
    message, 
    onReplayAudio, 
    onGenerateAudio, 
    onTranslate, 
    onStoreTranslation, 
    onRetry, 
    isJournalView,
    editingMessageId,
    setEditingMessageId,
    onUpdateMessage,
    onUpdateBotMessage,
    onRegenerateTone,
    onCollectVocabulary,
    onRegenerateImage,
    onDeleteMessage,
    avatarUrl,
    isListeningMode = false,
}) => {
  const isUser = message.sender === 'user';
  const mimiAvatarUrl = avatar

  const [isExpanded, setIsExpanded] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateCountdown, setTranslateCountdown] = useState(0);
  const [isWaitingTranslation, setIsWaitingTranslation] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [selectedText, setSelectedText] = useState<string>('');
  const [showCollectButton, setShowCollectButton] = useState(false);
  const [isCollecting, setIsCollecting] = useState(false);
  
  const [editedText, setEditedText] = useState(message.text);
  const [editedTone, setEditedTone] = useState('cheerfully');
  const [isSaving, setIsSaving] = useState(false);
  const [isRegeneratingTone, setIsRegeneratingTone] = useState(false);
  const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);
  const [isTextRevealed, setIsTextRevealed] = useState(false);

  const isEditing = editingMessageId === message.id;
  
  const handleAudioClick = async () => {
    if (isGeneratingAudio) return;

    if (message.audioData) {
      onReplayAudio(message.audioData, message.characterName);
    } else {
      setIsGeneratingAudio(true);
      try {
        await onGenerateAudio(message.id);
      } finally {
        setIsGeneratingAudio(false);
      }
    }
  };

  const handleRegenerateAudioClick = async () => {
    if (isGeneratingAudio) return;
    setIsGeneratingAudio(true);
    try {
      await onGenerateAudio(message.id, true);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleTranslateClick = async () => {
    if (isExpanded) {
      setIsExpanded(false);
      setTranslateCountdown(0);
      setIsWaitingTranslation(false);
      return;
    }

    // Always start countdown first, even if translation exists
    if (!isWaitingTranslation) {
      setIsExpanded(true);
      setIsWaitingTranslation(true);
      setTranslateCountdown(10);
      
      // Countdown timer
      const interval = setInterval(() => {
        setTranslateCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      // After 10s, show or fetch translation
      setTimeout(async () => {
        setIsWaitingTranslation(false);
        
        // If already has translation, just show it (countdown already done)
        if (message.translation) {
          return;
        }
        
        // Otherwise fetch translation
        setIsTranslating(true);
        try {
          const result = await onTranslate(message.text);
          onStoreTranslation(message.id, result);
        } catch (error) {
          console.error("Translation failed:", error);
          const errorMessage = "Xin lỗi, không thể dịch được văn bản này.";
          onStoreTranslation(message.id, errorMessage);
        } finally {
          setIsTranslating(false);
        }
      }, 10000);
      
      return;
    }
  };

  const handleCopyClick = () => {
    if (message.rawText) {
      navigator.clipboard.writeText(message.rawText).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }).catch(err => {
        console.error('Failed to copy text: ', err);
      });
    }
  };

  const handleStartEdit = () => {
    if (setEditingMessageId) {
      setEditedText(message.text);
      if (!isUser) {
        const toneMatch = message.rawText?.match(/Tone:\s*([\s\S]*?)(?=\n|$)/i);
        const currentTone = toneMatch ? toneMatch[1].trim() : 'cheerfully';
        setEditedTone(currentTone);
      }
      setEditingMessageId(message.id);
    }
  };

  const handleSaveEdit = async () => {
    if (isSaving) return;
    setIsSaving(true);
    
    if (isUser) {
      if (onUpdateMessage && editedText.trim() && editedText.trim() !== message.text) {
        await onUpdateMessage(message.id, editedText.trim());
      }
    } else {
      if (onUpdateBotMessage) {
        await onUpdateBotMessage(message.id, editedText.trim(), editedTone);
      }
    }

    if (setEditingMessageId) {
      setEditingMessageId(null);
    }
    setIsSaving(false);
  };

  const handleCancelEdit = () => {
    if (setEditingMessageId) {
      setEditingMessageId(null);
    }
    setEditedText(message.text);
  };

  const handleRegenToneClick = async () => {
    if (!onRegenerateTone || !message.characterName) return;
    setIsRegeneratingTone(true);
    try {
        const newTone = await onRegenerateTone(editedText, message.characterName);
        setEditedTone(newTone);
    } finally {
        setIsRegeneratingTone(false);
    }
  };

  const handleRegenerateImageClick = async () => {
    if (!onRegenerateImage || isRegeneratingImage) return;
    setIsRegeneratingImage(true);
    try {
        await onRegenerateImage(message.id);
    } finally {
        setIsRegeneratingImage(false);
    }
  };

  const handleTextSelection = () => {
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() || '';
      console.log('Text selected:', text); // Debug
      console.log('isUser:', isUser); // Debug
      console.log('onCollectVocabulary exists:', !!onCollectVocabulary); // Debug
      if (text && !isUser) {
        setSelectedText(text);
        setShowCollectButton(true);
        console.log('Show collect button:', true); // Debug
      } else {
        setShowCollectButton(false);
        console.log('Hiding button - text:', text, 'isUser:', isUser, 'hasCallback:', !!onCollectVocabulary); // Debug
      }
    }, 0);
  };

  const handleCollectVocab = async () => {
    if (selectedText) {
      setIsCollecting(true);
      try {
        if (onCollectVocabulary) {
          await onCollectVocabulary(selectedText, message.id);
        } else {
          alert('Chức năng thu thập từ vựng chưa được kích hoạt. onCollectVocabulary is missing.');
        }
      } finally {
        setIsCollecting(false);
        setShowCollectButton(false);
        setSelectedText('');
        window.getSelection()?.removeAllRanges();
      }
    }
  };

  const bubbleClasses = isUser
    ? 'bg-blue-500 text-white rounded-l-2xl rounded-tr-2xl'
    : message.isError 
      ? 'bg-red-100 text-red-700 rounded-r-2xl rounded-tl-2xl'
      : 'bg-gray-200 text-gray-800 rounded-r-2xl rounded-tl-2xl';

  const translationContent = message.translation;

  const handleDeleteClick = () => {
    if (onDeleteMessage && window.confirm('Bạn có chắc muốn xóa tin nhắn này?')) {
      onDeleteMessage(message.id);
    }
  };

  // Delete button only (for cases where edit is not available)
  const deleteOnlyButton = !isJournalView && onDeleteMessage && !setEditingMessageId && (
    <div className={`flex items-center self-center mx-2 opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? 'order-first' : 'order-last'}`}>
      <button
        onClick={handleDeleteClick}
        className="p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-gray-100"
        title="Xóa tin nhắn"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );

  const editButton = !isJournalView && setEditingMessageId && (
    <div className={`flex items-center self-center mx-2 opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? 'order-first' : 'order-last'}`}>
      <button
        onClick={handleStartEdit}
        className="p-1 rounded-full text-gray-400 hover:text-blue-500 hover:bg-gray-100"
        title="Chỉnh sửa tin nhắn"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L15.232 5.232z" />
        </svg>
      </button>
      {onDeleteMessage && (
        <button
          onClick={handleDeleteClick}
          className="p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-gray-100"
          title="Xóa tin nhắn"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  );

  if (isEditing && setEditingMessageId) {
    return (
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start ml-10'}`}>
        <div className="w-full max-w-xs md:max-w-md lg:max-w-lg">
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="w-full px-3 py-2 border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800"
            rows={3}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSaveEdit();
              }
              if (e.key === 'Escape') {
                handleCancelEdit();
              }
            }}
          />
          {!isUser && (
            <div className="mt-2">
                <label htmlFor="tone-input" className="text-sm font-medium text-gray-700 flex items-center">
                  Giọng điệu:
                  {onRegenerateTone && (
                    <button
                      type="button"
                      onClick={handleRegenToneClick}
                      disabled={isRegeneratingTone || isSaving}
                      className="ml-2 p-1 rounded-full text-gray-400 hover:text-blue-500 disabled:opacity-50 disabled:cursor-wait"
                      title="Tạo lại giọng điệu"
                    >
                      {isRegeneratingTone ? (
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0L7 10.5 1.5 11.23c-1.57.17-2.22 2.19-1.01 3.28l4.13 3.65-1.31 5.37c-.43 1.55 1.34 2.8 2.78 1.94L10 22.28l4.9 3.18c1.44.86 3.21-.39 2.78-1.94l-1.31-5.37 4.13-3.65c1.21-1.09.56-3.11-1.01-3.28L13 10.5l-1.51-7.33z" clipRule="evenodd" /></svg>
                      )}
                    </button>
                  )}
                </label>
              <input
                id="tone-input"
                type="text"
                value={editedTone}
                onChange={(e) => setEditedTone(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="e.g., cheerfully"
                disabled={isSaving || isRegeneratingTone}
              />
            </div>
          )}
          <div className="flex justify-end space-x-2 mt-2">
            <button onClick={handleCancelEdit} className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300" disabled={isSaving}>Hủy</button>
            <button onClick={handleSaveEdit} className="px-3 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-blue-300" disabled={isSaving}>
              {isSaving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Format duration for voice messages
  const formatVoiceDuration = (seconds?: number): string => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle play voice message for user
  const handlePlayVoiceMessage = async () => {
    if (message.audioId) {
      await onReplayAudio(message.audioId);
    }
  };

  if (isUser) {
    // Check if this is a voice message
    if (message.kind === 'voice' && message.audioId) {
      return (
        <div className="group flex justify-end items-center">
          {editButton || deleteOnlyButton}
          <div className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-3 break-words ${bubbleClasses}`}>
            <div className="flex items-center gap-3">
              <button
                onClick={handlePlayVoiceMessage}
                className="flex-shrink-0 w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors"
                aria-label="Phát tin nhắn giọng nói"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              </button>
              <div className="flex flex-col flex-1">
                {message.transcript ? (
                  <>
                    <p className="text-sm whitespace-pre-wrap">{message.transcript}</p>
                    <div className="flex items-center gap-1 mt-1 text-xs opacity-70">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      <span>{formatVoiceDuration(message.audioDuration)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      <span className="text-sm font-medium">Tin nhắn giọng nói</span>
                    </div>
                    <span className="text-xs opacity-80">{formatVoiceDuration(message.audioDuration)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Regular text message
    return (
      <div className="group flex justify-end items-center">
        {editButton || deleteOnlyButton}
        <div className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 break-words ${bubbleClasses}`}>
          <p className="whitespace-pre-wrap">{message.text}</p>
        </div>
      </div>
    );
  }

  // Bot message layout
  return (
    <div className="flex justify-start items-start gap-2">
      <img src={avatarUrl || mimiAvatarUrl} alt={`${message.characterName || 'Mimi'} Avatar`} className="w-8 h-8 rounded-full object-cover" />
      <div className="flex flex-col items-start w-full">
        {!isUser && message.characterName && (
          <p className="text-xs text-gray-500 ml-3 mb-0.5">{message.characterName}</p>
        )}
        <div className="group flex items-end w-full max-w-lg">
            <div className={`max-w-xs md:max-w-md flex-shrink px-4 py-2 break-words transition-all duration-300 ease-in-out ${bubbleClasses}`} onMouseUp={handleTextSelection}>
              {message.imageUrl && (
                <div className="mb-2 relative group/image">
                  <img src={message.imageUrl} alt="Generated Scene" className="w-full h-auto rounded-lg shadow-sm" />
                  {onRegenerateImage && (
                    <button
                        onClick={handleRegenerateImageClick}
                        disabled={isRegeneratingImage}
                        className="absolute top-2 right-2 bg-white/80 hover:bg-white text-gray-700 p-1.5 rounded-full shadow-sm opacity-0 group-hover/image:opacity-100 transition-opacity disabled:opacity-100 disabled:cursor-wait"
                        title="Tạo lại ảnh"
                    >
                        {isRegeneratingImage ? (
                            <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        )}
                    </button>
                  )}
                </div>
              )}
              {/* Text content with listening mode support */}
              {isListeningMode && !isTextRevealed ? (
                <button
                  onClick={() => setIsTextRevealed(true)}
                  className="w-full text-left py-2 px-3 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                    <span className="text-sm font-medium">Nhấn để hiện chữ</span>
                  </div>
                </button>
              ) : (
                <p 
                  className="whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: renderBoldText(message.text) }}
                />
              )}
              {isExpanded && !message.isError && (
                <div className="mt-3 pt-3 border-t border-gray-500/20 text-left">
                  {isWaitingTranslation ? (
                    <div className="flex items-center text-sm text-amber-600">
                      <span>🧠 Hãy cố gắng hiểu! Bản dịch sẽ xuất hiện sau {translateCountdown}s...</span>
                    </div>
                  ) : isTranslating ? (
                    <div className="flex items-center text-sm text-gray-500">
                      <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Đang dịch...</span>
                    </div>
                  ) : (
                    <div className="prose prose-sm max-w-none text-gray-700">
                      <HiddenWordsText text={translationContent || ''} />
                    </div>
                  )}
                  <button onClick={() => { setIsExpanded(false); setIsWaitingTranslation(false); }} className="text-xs text-blue-600 hover:underline mt-2 font-semibold">
                    Đóng
                  </button>
                </div>
              )}
            </div>
            {editButton}
        </div>
        
        {/* Collect Vocabulary Button */}
        {console.log('Render check - showCollectButton:', showCollectButton, 'isJournalView:', isJournalView, 'onCollectVocabulary:', !!onCollectVocabulary, 'selectedText:', selectedText)}
        {showCollectButton && onCollectVocabulary && (
          <button
            onClick={handleCollectVocab}
            disabled={isCollecting}
            className={`mt-2 px-3 py-1 text-xs text-white rounded-full transition-colors shadow-md flex items-center gap-1 ${isCollecting ? 'bg-gray-400 cursor-wait' : 'bg-green-500 hover:bg-green-600'}`}
          >
            {isCollecting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Đang thu thập...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Thu thập: {selectedText}
              </>
            )}
          </button>
        )}
        
        {/* Action Buttons */}
        {isJournalView ? (
          <div className="flex items-center mt-2 space-x-2">
            {!isUser && !message.isError && message.audioData && (
              <button
                onClick={handleAudioClick}
                className="text-gray-400 hover:text-blue-500 transition-colors p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-300"
                aria-label="Nghe lại"
              >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
              </button>
            )}
            {!isUser && !message.isError && (
              <button
                onClick={handleTranslateClick}
                className="text-gray-400 hover:text-blue-500 transition-colors p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-300"
                aria-label={isExpanded ? "Đóng bản dịch" : "Dịch"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 2a6 6 0 100 12 6 6 0 000-12zM2 10a8 8 0 1116 0 8 8 0 01-16 0z" />
                  <path d="M10 6a1 1 0 011 1v3a1 1 0 11-2 0V7a1 1 0 011-1zM9 12a1 1 0 112 0 1 1 0 01-2 0z" />
                </svg>
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center mt-2 space-x-2">
            {!isUser && !message.isError && (
              <button
                onClick={handleAudioClick}
                className="text-gray-400 hover:text-blue-500 transition-colors p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-300"
                aria-label={message.audioData ? "Nghe lại" : "Nghe"}
                disabled={isGeneratingAudio}
              >
                {isGeneratingAudio ? (
                  <svg className="animate-spin h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            )}
            {!isUser && !message.isError && (
              <button
                onClick={handleRegenerateAudioClick}
                className="text-gray-400 hover:text-blue-500 transition-colors p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-300"
                aria-label={message.audioData ? "Tạo lại âm thanh" : "Tạo âm thanh"}
                title={message.audioData ? "Tạo lại âm thanh" : "Tạo âm thanh"}
                disabled={isGeneratingAudio}
              >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
              </button>
            )}
            {!message.isError && (
               <button
                  onClick={handleTranslateClick}
                  className="text-gray-400 hover:text-blue-500 transition-colors p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-300"
                  aria-label={isExpanded ? "Đóng bản dịch" : "Dịch và giải thích"}
                >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                   <path d="M10 2a6 6 0 100 12 6 6 0 000-12zM2 10a8 8 0 1116 0 8 8 0 01-16 0z" />
                   <path d="M10 6a1 1 0 011 1v3a1 1 0 11-2 0V7a1 1 0 011-1zM9 12a1 1 0 112 0 1 1 0 01-2 0z" />
                 </svg>
               </button>
            )}
            {!message.isError && message.rawText && (
              <button
                onClick={handleCopyClick}
                className="text-gray-400 hover:text-blue-500 transition-colors p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-300"
                aria-label="Copy full response"
              >
                {isCopied ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            )}
            {message.isError && (
              <button
                onClick={onRetry}
                className="text-gray-400 hover:text-blue-500 transition-colors p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-300"
                aria-label="Thử lại"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            {onDeleteMessage && (
              <button
                onClick={handleDeleteClick}
                className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-red-300"
                aria-label="Xóa tin nhắn"
                title="Xóa tin nhắn"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
