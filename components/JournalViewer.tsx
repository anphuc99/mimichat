
import React, { useState } from 'react';
import type { ChatJournal, DailyChat, StreakData, Character } from '../types';
import { MessageBubble } from './MessageBubble';
import { StreakDisplay } from './StreakDisplay';

interface DailyEntryProps {
  dailyChat: DailyChat;
  onReplayAudio: (audioData: string, characterName?: string) => Promise<void>;
  onPreloadAudio?: (audioData: string) => Promise<void>;
  isGeneratingThoughts: string | null;
  onGenerateThoughts: (id: string) => void;
  isGeneratingVocabulary: string | null;
  onGenerateVocabulary: (id: string) => void;
  onStartVocabulary: (id: string) => void;
  isSelected: boolean;
  onToggleSelect: () => void;
  playingMessageId: string | null;
  onCollectVocabulary?: (korean: string, messageId: string, dailyChatId: string) => void;
  onDownloadTxt?: (dailyChatId: string) => void;
  characters: Character[];
  onTranslate: (text: string) => Promise<string>;
  onStoreTranslation: (messageId: string, translation: string, dailyChatId: string) => void;
  onUpdateSummary?: (dailyChatId: string, newSummary: string) => void;
}

const DailyEntry: React.FC<DailyEntryProps> = ({ 
    dailyChat, 
    onReplayAudio, 
    onPreloadAudio,
    isGeneratingThoughts, 
    onGenerateThoughts,
    isGeneratingVocabulary,
    onGenerateVocabulary,
    onStartVocabulary,
    isSelected,
    onToggleSelect,
    playingMessageId,
    onCollectVocabulary,
    onDownloadTxt,
    characters,
    onTranslate,
    onStoreTranslation,
    onUpdateSummary,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [isPreloading, setIsPreloading] = useState(false);
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [editedSummary, setEditedSummary] = useState(dailyChat.summary || '');
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number>(-1);
  const messageRefs = React.useRef<Map<number, HTMLDivElement>>(new Map());
  const autoPlayRef = React.useRef<boolean>(false);

  const formattedDate = new Date(dailyChat.date + 'T00:00:00+07:00').toLocaleDateString('vi-VN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh'
  });

  // Effect to handle global playback scrolling/expanding
  React.useEffect(() => {
    if (playingMessageId) {
      const index = dailyChat.messages.findIndex(m => m.id === playingMessageId);
      if (index !== -1) {
        setIsExpanded(true);
        // Small delay to allow expansion rendering
        setTimeout(() => {
          const el = messageRefs.current.get(index);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
    }
  }, [playingMessageId, dailyChat.messages]);

  const handlePreloadAudio = async () => {
    if (!onPreloadAudio || isPreloading) return;
    
    const messagesWithAudio = dailyChat.messages.filter(msg => msg.audioData);
    if (messagesWithAudio.length === 0) {
      alert('Không có tin nhắn nào có audio để tải');
      return;
    }

    setIsPreloading(true);
    try {
      // Process in chunks to avoid overwhelming the network/browser
      const chunkSize = 3;
      for (let i = 0; i < messagesWithAudio.length; i += chunkSize) {
        const chunk = messagesWithAudio.slice(i, i + chunkSize);
        await Promise.all(chunk.map(msg => onPreloadAudio(msg.audioData!)));
      }
      // alert('Đã tải xong audio cho cuộc trò chuyện này!');
    } catch (error) {
      console.error("Failed to preload audio:", error);
      alert("Có lỗi xảy ra khi tải audio.");
    } finally {
      setIsPreloading(false);
    }
  };

  const handleAutoPlay = async () => {
    if (isAutoPlaying) {
      autoPlayRef.current = false;
      setIsAutoPlaying(false);
      setCurrentPlayingIndex(-1);
      return;
    }

    const messagesWithAudio = dailyChat.messages.filter(msg => msg.audioData);
    if (messagesWithAudio.length === 0) {
      alert('Không có tin nhắn nào có audio để phát');
      return;
    }

    setIsAutoPlaying(true);
    autoPlayRef.current = true;

    for (let i = 0; i < dailyChat.messages.length; i++) {
      if (!autoPlayRef.current) break; // Stop if user clicked stop

      const message = dailyChat.messages[i];
      if (!message.audioData) continue;

      setCurrentPlayingIndex(i);

      // Scroll to message
      const messageElement = messageRefs.current.get(i);
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Play audio
      await onReplayAudio(message.audioData, message.characterName);

      // Small pause between messages
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    autoPlayRef.current = false;
    setIsAutoPlaying(false);
    setCurrentPlayingIndex(-1);
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
      <div className="flex items-start space-x-3">
        <div className="pt-1" onClick={(e) => e.stopPropagation()}>
            <input 
                type="checkbox" 
                checked={isSelected} 
                onChange={onToggleSelect}
                className="h-5 w-5 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
            />
        </div>
        <div className="flex-1">
            <div className="cursor-pointer" onClick={() => !isEditingSummary && setIsExpanded(!isExpanded)}>
              <p className="font-semibold text-gray-600">{formattedDate}</p>
            </div>
            {isEditingSummary ? (
              <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                <textarea
                  value={editedSummary}
                  onChange={(e) => setEditedSummary(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                  rows={2}
                  placeholder="Nhập tóm tắt..."
                />
                <div className="flex justify-end space-x-2 mt-2">
                  <button
                    onClick={() => {
                      if (onUpdateSummary) {
                        onUpdateSummary(dailyChat.id, editedSummary);
                      }
                      setIsEditingSummary(false);
                    }}
                    className="px-3 py-1 text-sm bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
                  >
                    Lưu
                  </button>
                  <button
                    onClick={() => {
                      setEditedSummary(dailyChat.summary || '');
                      setIsEditingSummary(false);
                    }}
                    className="px-3 py-1 text-sm bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            ) : (
              <div className="cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex items-center mt-2">
                  <p className="text-gray-800 italic flex-1">"{dailyChat.summary}"</p>
                  {onUpdateSummary && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditedSummary(dailyChat.summary || '');
                        setIsEditingSummary(true);
                      }}
                      className="ml-2 p-1 text-gray-400 hover:text-blue-500 transition-colors"
                      title="Sửa tóm tắt"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="text-right text-sm text-blue-500 mt-2">
                  {isExpanded ? 'Thu gọn' : 'Xem chi tiết...'} ({dailyChat.messages.length} tin nhắn)
                </div>
              </div>
            )}
        </div>
      </div>
      {isExpanded && (
        <>
          <div className="mt-4 mb-2 flex justify-end space-x-2">
            {onDownloadTxt && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDownloadTxt(dailyChat.id);
                }}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center space-x-2"
                title="Tải xuống hội thoại dạng văn bản"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                </svg>
                <span>TXT</span>
              </button>
            )}
            {onPreloadAudio && (
              <button
                onClick={handlePreloadAudio}
                disabled={isPreloading}
                className={`px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
                  isPreloading 
                    ? 'bg-gray-400 cursor-not-allowed text-white' 
                    : 'bg-teal-500 hover:bg-teal-600 text-white'
                }`}
                title="Tải trước audio để nghe mượt mà hơn"
              >
                {isPreloading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Đang tải...</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    <span>Tải audio</span>
                  </>
                )}
              </button>
            )}
            <button
              onClick={handleAutoPlay}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
                isAutoPlaying 
                  ? 'bg-red-500 hover:bg-red-600 text-white' 
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              {isAutoPlaying ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                  </svg>
                  <span>Dừng</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  <span>Tự động phát</span>
                </>
              )}
            </button>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 space-y-4 max-h-96 overflow-y-auto pr-2">
            {dailyChat.messages.map((message, index) => {
              const character = characters.find(c => c.name === message.characterName);
              return (
              <div 
                key={message.id}
                ref={(el) => {
                  if (el) messageRefs.current.set(index, el);
                  else messageRefs.current.delete(index);
                }}
                className={`transition-all ${currentPlayingIndex === index || playingMessageId === message.id ? 'ring-2 ring-blue-400 rounded-lg' : ''}`}
              >
                   <MessageBubble 
                      message={message} 
                      onReplayAudio={onReplayAudio} 
                      onGenerateAudio={async () => {}} 
                      onTranslate={onTranslate}
                      onStoreTranslation={(msgId, translation) => onStoreTranslation(msgId, translation, dailyChat.id)}
                      onRetry={() => {}}
                      isJournalView={true}
                      onCollectVocabulary={onCollectVocabulary ? (korean, messageId) => onCollectVocabulary(korean, messageId, dailyChat.id) : undefined}
                      avatarUrl={character?.avatar}
                  />
              </div>
            )})}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    if (!dailyChat.characterThoughts) {
                        onGenerateThoughts(dailyChat.id);
                    }
                }}
                className="w-full px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors disabled:bg-indigo-300 disabled:cursor-wait"
                disabled={isGeneratingThoughts === dailyChat.id}
            >
                {isGeneratingThoughts === dailyChat.id
                    ? 'Đang tạo nhật ký...'
                    : dailyChat.characterThoughts
                        ? 'Nhật ký của nhân vật:'
                        : 'Xem nhân vật nghĩ gì'}
            </button>

            {isGeneratingThoughts === dailyChat.id && (
                 <div className="text-center p-4">
                    <svg className="animate-spin h-6 w-6 text-indigo-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-sm text-gray-500 mt-2">Mimi và các bạn đang suy nghĩ... Vui lòng chờ một lát.</p>
                </div>
            )}
            
            {dailyChat.characterThoughts && (
              <div className="mt-4 space-y-3">
                {dailyChat.characterThoughts.map((thought, index) => (
                  <div key={index} className="p-3 bg-indigo-50 rounded-md border border-indigo-200">
                    <div className="flex items-center space-x-2">
                      <p className="font-medium text-sm text-indigo-800">{thought.characterName}:</p>
                      {thought.audioData && (
                        <button 
                            onClick={() => onReplayAudio(thought.audioData, thought.characterName)} 
                            className="text-indigo-500 hover:text-indigo-700"
                            title="Nghe suy nghĩ"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 italic mt-1">"{thought.text}"</p>
                  </div>
                ))}
              </div>
            )}

            {/* Vocabulary Learning Button */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    if (!dailyChat.vocabularies || dailyChat.vocabularies.length === 0) {
                        onGenerateVocabulary(dailyChat.id);
                    } else {
                        onStartVocabulary(dailyChat.id);
                    }
                }}
                className="w-full px-4 py-2 mt-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:bg-purple-300 disabled:cursor-wait"
                disabled={isGeneratingVocabulary === dailyChat.id}
            >
                {isGeneratingVocabulary === dailyChat.id
                    ? '⏳ Đang phân tích từ vựng...'
                    : dailyChat.vocabularies && dailyChat.vocabularies.length > 0
                        ? `📚 Học từ vựng (${dailyChat.vocabularies.length} từ)`
                        : '📚 Học từ vựng'}
            </button>

            {isGeneratingVocabulary === dailyChat.id && (
                 <div className="text-center p-4">
                    <svg className="animate-spin h-6 w-6 text-purple-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-sm text-gray-500 mt-2">Đang phân tích từ vựng... (Có thể mất 10-30 giây)</p>
                </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

interface JournalViewerProps {
  journal: ChatJournal;
  onReplayAudio: (audioData: string, characterName?: string) => Promise<void>;
  onBackToChat: () => void;
  isGeneratingThoughts: string | null;
  onGenerateThoughts: (id: string) => void;
  isGeneratingVocabulary: string | null;
  onGenerateVocabulary: (id: string) => void;
  onStartVocabulary: (id: string) => void;
  relationshipSummary: string;
  onUpdateRelationshipSummary: (newSummary: string) => void;
  onStartReview: () => void;
  onStartMemory?: () => void;
  reviewDueCount: number;
  streak: StreakData;
  onCollectVocabulary?: (korean: string, messageId: string, dailyChatId: string) => void;
  onPreloadAudio?: (audioData: string) => Promise<void>;
  onDownloadTxt?: (dailyChatId: string) => void;
  characters: Character[];
  onTranslate: (text: string) => Promise<string>;
  onStoreTranslation: (messageId: string, translation: string, dailyChatId: string) => void;
  onUpdateDailySummary?: (dailyChatId: string, newSummary: string) => void;
}

export const JournalViewer: React.FC<JournalViewerProps> = ({ 
    journal, 
    onReplayAudio, 
    onPreloadAudio,
    onBackToChat, 
    isGeneratingThoughts, 
    onGenerateThoughts,
    isGeneratingVocabulary,
    onGenerateVocabulary,
    onStartVocabulary,
    relationshipSummary,
    onUpdateRelationshipSummary,
    onStartReview,
    onStartMemory,
    reviewDueCount,
    streak,
    onCollectVocabulary,
    onDownloadTxt,
    characters,
    onTranslate,
    onStoreTranslation,
    onUpdateDailySummary,
}) => {
    const [isViewingSummary, setIsViewingSummary] = useState(false);
    const [isEditingSummary, setIsEditingSummary] = useState(false);
    const [editedSummary, setEditedSummary] = useState(relationshipSummary);
    
    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearchResults, setShowSearchResults] = useState(false);
    
    // Global Player State
    const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
    const [isPlaying, setIsPlaying] = useState(false);
    const [playMode, setPlayMode] = useState<'sequential' | 'loop' | 'shuffle'>('sequential');
    const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
    const playerTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
    const isPlayingRef = React.useRef(false);

    const summarizedEntries = journal.filter(entry => entry.summary && entry.messages.length > 0).reverse();

    // Cleanup player on unmount
    React.useEffect(() => {
        return () => {
            if (playerTimeoutRef.current) clearTimeout(playerTimeoutRef.current);
        };
    }, []);

    const toggleSelectEntry = (id: string) => {
        const newSet = new Set(selectedEntryIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedEntryIds(newSet);
    };

    const selectAll = () => {
        if (selectedEntryIds.size === summarizedEntries.length) {
            setSelectedEntryIds(new Set());
        } else {
            // Select entries in reverse order (from the last displayed entry to the first)
            // This preserves insertion order in the Set so playlist/operations iterate from last->first
            setSelectedEntryIds(new Set(summarizedEntries.map(e => e.id).reverse()));
        }
    };

    const getPlaylist = React.useCallback(() => {
        // Create map for lookup to preserve selection order
        const entryMap = new Map(summarizedEntries.map(e => [e.id, e]));
        const entries = Array.from(selectedEntryIds)
            .map(id => entryMap.get(id))
            .filter((e): e is DailyChat => e !== undefined);
            
        return entries.flatMap(e => e.messages.filter(m => m.audioData));
    }, [summarizedEntries, selectedEntryIds]);

    const playNext = React.useCallback(async (currentId: string | null) => {
        if (!isPlayingRef.current) return;

        const playlist = getPlaylist();
        if (playlist.length === 0) {
            setIsPlaying(false);
            isPlayingRef.current = false;
            setPlayingMessageId(null);
            return;
        }

        let nextIndex = 0;
        if (currentId) {
            const currentIndex = playlist.findIndex(m => m.id === currentId);
            if (currentIndex !== -1) {
                if (playMode === 'shuffle') {
                    nextIndex = Math.floor(Math.random() * playlist.length);
                } else {
                    nextIndex = currentIndex + 1;
                }
            }
        }

        if (nextIndex >= playlist.length) {
            if (playMode === 'loop') {
                nextIndex = 0;
            } else {
                setIsPlaying(false);
                isPlayingRef.current = false;
                setPlayingMessageId(null);
                return;
            }
        }

        const nextMsg = playlist[nextIndex];
        setPlayingMessageId(nextMsg.id);
        
        await onReplayAudio(nextMsg.audioData!, nextMsg.characterName);

        if (isPlayingRef.current) {
            await new Promise(resolve => setTimeout(resolve, 500));
            if (isPlayingRef.current) {
                playNext(nextMsg.id);
            }
        }

    }, [getPlaylist, playMode, onReplayAudio]);

    const handlePlayPause = () => {
        if (isPlaying) {
            setIsPlaying(false);
            isPlayingRef.current = false;
            if (playerTimeoutRef.current) clearTimeout(playerTimeoutRef.current);
            setPlayingMessageId(null);
        } else {
            const playlist = getPlaylist();
            if (playlist.length === 0) {
                alert('Vui lòng chọn ít nhất một nhật ký để phát.');
                return;
            }
            setIsPlaying(true);
            isPlayingRef.current = true;
            playNext(null);
        }
    };

    const handleDownloadSelectedTxt = () => {
        if (selectedEntryIds.size === 0) {
            alert('Vui lòng chọn ít nhất một nhật ký để tải xuống.');
            return;
        }

        // Get selected entries in the insertion order of the Set (so Select All reverse order is respected)
        const entryMap = new Map(summarizedEntries.map(e => [e.id, e]));
        const selectedEntries = Array.from(selectedEntryIds)
            .map(id => entryMap.get(id))
            .filter((e): e is DailyChat => !!e);
        
        let content = '';
        
        for (const dailyChat of selectedEntries) {
            // Add separator between entries
            if (content.length > 0) {
                content += '\n\n' + '='.repeat(50) + '\n\n';
            }
            
            content += `Date: ${dailyChat.date}\n`;
            content += `Summary: ${dailyChat.summary || 'N/A'}\n\n`;

            if (dailyChat.characterThoughts && dailyChat.characterThoughts.length > 0) {
                content += `--- Character Thoughts ---\n`;
                dailyChat.characterThoughts.forEach(thought => {
                    content += `${thought.characterName} (${thought.tone}): ${thought.text}\n`;
                });
                content += `\n`;
            }

            content += `--- Conversation ---\n`;
            const lines = dailyChat.messages.map(msg => {
                const sender = msg.sender === 'user' ? 'User' : (msg.characterName || 'Bot');
                return `${sender}: ${msg.text}`;
            });

            content += lines.join('\n');
        }

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
        link.download = `conversations-${dateStr}-${selectedEntries.length}entries.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleSaveSummary = () => {
        onUpdateRelationshipSummary(editedSummary);
        setIsEditingSummary(false);
    };

    const handleCancelEdit = () => {
        setEditedSummary(relationshipSummary);
        setIsEditingSummary(false);
    };

    // Search messages across all journal entries
    const searchResults = React.useMemo(() => {
        if (!searchQuery.trim()) return [];
        
        const query = searchQuery.toLowerCase();
        const results: {
            message: typeof journal[0]['messages'][0];
            dailyChat: typeof journal[0];
            matchIndex: number;
        }[] = [];
        
        for (const dailyChat of journal) {
            for (const message of dailyChat.messages) {
                if (message.text.toLowerCase().includes(query)) {
                    results.push({ message, dailyChat, matchIndex: results.length });
                }
            }
        }
        
        return results;
    }, [journal, searchQuery]);

    // Play search result audio
    const handlePlaySearchResult = async (result: typeof searchResults[0]) => {
        if (result.message.audioData) {
            await onReplayAudio(result.message.audioData, result.message.characterName);
        }
    };

    return (
        <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-700">Nhật ký trò chuyện</h2>
                <div className="flex items-center space-x-2">
                    {onStartMemory && (
                        <button 
                            onClick={onStartMemory}
                            className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center space-x-2"
                            title="Ký ức từ vựng - Học & ôn tập với ký ức cá nhân"
                        >
                            <span>🧠</span>
                            <span>Ký ức</span>
                        </button>
                    )}
                    <button 
                        onClick={onStartReview}
                        className="relative px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center space-x-2"
                    >
                        <span>🔄</span>
                        <span>Tổng ôn</span>
                        {reviewDueCount > 0 && (
                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                                {reviewDueCount}
                            </span>
                        )}
                    </button>
                    <button 
                        onClick={onBackToChat} 
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                        Quay lại trò chuyện
                    </button>
                </div>
            </div>

            {/* Player Controls */}
            <div className="mb-6 bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-wrap items-center gap-4">
                <div className="flex items-center space-x-2">
                    <button 
                        onClick={selectAll}
                        className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
                    >
                        {selectedEntryIds.size === summarizedEntries.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                    </button>
                    <span className="text-sm text-gray-500">Đã chọn: {selectedEntryIds.size}</span>
                </div>

                <div className="h-6 w-px bg-gray-300 mx-2 hidden sm:block"></div>

                <div className="flex items-center space-x-2">
                    <button
                        onClick={handlePlayPause}
                        className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors ${
                            isPlaying ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'
                        }`}
                    >
                        {isPlaying ? (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                                </svg>
                                <span>Dừng phát</span>
                            </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                </svg>
                                <span>Phát đã chọn</span>
                            </>
                        )}
                    </button>
                    <button
                        onClick={handleDownloadSelectedTxt}
                        disabled={selectedEntryIds.size === 0}
                        className="px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors bg-gray-500 hover:bg-gray-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Tải xuống các nhật ký đã chọn dạng TXT"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                        <span>Tải TXT</span>
                    </button>
                </div>

                <div className="flex items-center space-x-2 bg-gray-100 p-1 rounded-lg">
                    <button
                        onClick={() => setPlayMode('sequential')}
                        className={`p-1.5 rounded-md transition-colors ${playMode === 'sequential' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        title="Tuần tự"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                        </svg>
                    </button>
                    <button
                        onClick={() => setPlayMode('loop')}
                        className={`p-1.5 rounded-md transition-colors ${playMode === 'loop' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        title="Lặp lại"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                        </svg>
                    </button>
                    <button
                        onClick={() => setPlayMode('shuffle')}
                        className={`p-1.5 rounded-md transition-colors ${playMode === 'shuffle' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        title="Ngẫu nhiên"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Message Search Section */}
            <div className="mb-6 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center gap-3">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setShowSearchResults(true);
                            }}
                            placeholder="🔍 Tìm kiếm tin nhắn trong toàn bộ story..."
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => {
                                    setSearchQuery('');
                                    setShowSearchResults(false);
                                }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => setShowSearchResults(!showSearchResults)}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                            showSearchResults && searchQuery ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        {searchResults.length > 0 ? `${searchResults.length} kết quả` : 'Tìm kiếm'}
                    </button>
                </div>

                {/* Search Results */}
                {showSearchResults && searchQuery && (
                    <div className="mt-4 max-h-96 overflow-y-auto border-t border-gray-200 pt-4">
                        {searchResults.length > 0 ? (
                            <div className="space-y-3">
                                {searchResults.map((result, idx) => {
                                    const isUser = result.message.sender === 'user';
                                    const formattedDate = new Date(result.dailyChat.date + 'T00:00:00+07:00').toLocaleDateString('vi-VN', {
                                        day: 'numeric',
                                        month: 'short',
                                        year: 'numeric',
                                        timeZone: 'Asia/Ho_Chi_Minh'
                                    });
                                    
                                    return (
                                        <div 
                                            key={`${result.dailyChat.id}-${result.message.id}`}
                                            className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                                            isUser ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'
                                                        }`}>
                                                            {isUser ? 'Bạn' : result.message.characterName || 'Bot'}
                                                        </span>
                                                        <span className="text-xs text-gray-400">{formattedDate}</span>
                                                    </div>
                                                    <p className="text-sm text-gray-700 break-words">
                                                        {result.message.text.length > 200 
                                                            ? result.message.text.substring(0, 200) + '...'
                                                            : result.message.text
                                                        }
                                                    </p>
                                                </div>
                                                {result.message.audioData && (
                                                    <button
                                                        onClick={() => handlePlaySearchResult(result)}
                                                        className="flex-shrink-0 w-10 h-10 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors"
                                                        title="Phát audio"
                                                    >
                                                        🔊
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-center text-gray-500 py-4">
                                Không tìm thấy tin nhắn nào phù hợp với "{searchQuery}"
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Streak Display Section */}
            <div className="mb-6">
                <StreakDisplay streak={streak} />
            </div>

            {/* Relationship Summary Section */}
            <div className="mb-6 bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-lg border border-purple-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-purple-800 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                            <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                        </svg>
                        Tóm tắt bối cảnh chung
                    </h3>
                    <div className="flex space-x-2">
                        {!isEditingSummary && (
                            <>
                                <button
                                    onClick={() => setIsViewingSummary(!isViewingSummary)}
                                    className="px-3 py-1 text-sm bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors"
                                >
                                    {isViewingSummary ? 'Ẩn' : 'Xem'}
                                </button>
                                {relationshipSummary && (
                                    <button
                                        onClick={() => {
                                            setIsEditingSummary(true);
                                            setEditedSummary(relationshipSummary);
                                        }}
                                        className="px-3 py-1 text-sm bg-indigo-500 text-white rounded-md hover:bg-indigo-600 transition-colors"
                                    >
                                        Sửa
                                    </button>
                                )}
                            </>
                        )}
                        {isEditingSummary && (
                            <>
                                <button
                                    onClick={handleSaveSummary}
                                    className="px-3 py-1 text-sm bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
                                >
                                    Lưu
                                </button>
                                <button
                                    onClick={handleCancelEdit}
                                    className="px-3 py-1 text-sm bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
                                >
                                    Hủy
                                </button>
                            </>
                        )}
                    </div>
                </div>
                
                {isViewingSummary && !isEditingSummary && (
                    <div className="mt-3 p-3 bg-white rounded-md border border-purple-100">
                        {relationshipSummary ? (
                            <p className="text-gray-700 text-sm whitespace-pre-wrap">{relationshipSummary}</p>
                        ) : (
                            <p className="text-gray-400 text-sm italic">Chưa có tóm tắt. Nhấn "Kết thúc ngày" để tạo tóm tắt tự động.</p>
                        )}
                    </div>
                )}

                {isEditingSummary && (
                    <div className="mt-3">
                        <textarea
                            value={editedSummary}
                            onChange={(e) => setEditedSummary(e.target.value)}
                            className="w-full p-3 border border-purple-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-400 text-sm"
                            rows={5}
                            placeholder="Nhập tóm tắt bối cảnh chung..."
                        />
                    </div>
                )}
            </div>

            {summarizedEntries.length > 0 ? (
                <div className="space-y-4">
                    {summarizedEntries.map(dailyChat => (
                        <DailyEntry 
                            key={dailyChat.id} 
                            dailyChat={dailyChat}
                            onReplayAudio={onReplayAudio}
                            onPreloadAudio={onPreloadAudio}
                            isGeneratingThoughts={isGeneratingThoughts}
                            onGenerateThoughts={onGenerateThoughts}
                            isGeneratingVocabulary={isGeneratingVocabulary}
                            onGenerateVocabulary={onGenerateVocabulary}
                            onStartVocabulary={onStartVocabulary}
                            isSelected={selectedEntryIds.has(dailyChat.id)}
                            onToggleSelect={() => toggleSelectEntry(dailyChat.id)}
                            playingMessageId={playingMessageId}
                            onCollectVocabulary={onCollectVocabulary}
                            onDownloadTxt={onDownloadTxt}
                            characters={characters}
                            onTranslate={onTranslate}
                            onStoreTranslation={onStoreTranslation}
                            onUpdateSummary={onUpdateDailySummary}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center text-gray-500 mt-10">
                    <p>Chưa có mục nhật ký nào được lưu.</p>
                    <p className="text-sm">Trò chuyện với Mimi và bấm "Kết thúc ngày" để tạo bản tóm tắt đầu tiên.</p>
                </div>
            )}
        </div>
    );
};