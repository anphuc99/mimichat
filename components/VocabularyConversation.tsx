import React, { useState, useRef, useEffect } from 'react';
import type { Character, Message, VocabularyItem } from '../types';
import type { Chat } from '@google/genai';
import { initAutoChatSession, sendAutoChatMessage, textToSpeech } from '../services/geminiService';
import { MessageBubble } from './MessageBubble';

interface VocabularyConversationProps {
  vocabularies: VocabularyItem[];
  characters: Character[];
  context: string;
  currentLevel: string;
  onComplete: (learnedVocabIds: string[]) => void;
  onBack: () => void;
  playAudio: (audioData: string, speakingRate?: number, pitch?: number) => Promise<void>;
  isReviewMode?: boolean; // Đang ôn tập hay học mới
}

export const VocabularyConversation: React.FC<VocabularyConversationProps> = ({
  vocabularies,
  characters,
  context,
  currentLevel,
  onComplete,
  onBack,
  playAudio,
  isReviewMode = false,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentCount, setCurrentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState<string>('');
  const [isStarted, setIsStarted] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  
  // State để chọn nhân vật
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>(
    characters.length > 0 ? characters.slice(0, Math.min(2, characters.length)).map(c => c.id) : []
  );
  
  const chatRef = useRef<Chat | null>(null);
  const shouldStopRef = useRef(false);
  const isPausedRef = useRef(false);
  const currentCountRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const nextBatchRef = useRef<any[] | null>(null);
  const isFetchingRef = useRef(false);

  // Tính số tin nhắn mục tiêu dựa trên số từ vựng
  const targetCount = Math.max(20, vocabularies.length * 5);

  // Lấy danh sách nhân vật đã chọn
  const selectedCharacters = characters.filter(c => selectedCharacterIds.includes(c.id));

  // Toggle chọn nhân vật
  const toggleCharacter = (charId: string) => {
    setSelectedCharacterIds(prev => {
      if (prev.includes(charId)) {
        // Không cho phép bỏ chọn nếu chỉ còn 1 nhân vật
        if (prev.length <= 1) return prev;
        return prev.filter(id => id !== charId);
      } else {
        return [...prev, charId];
      }
    });
  };

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    currentCountRef.current = currentCount;
  }, [currentCount]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Tạo topic tự động từ từ vựng
  const generateTopicFromVocabularies = (): string => {
    const koreanWords = vocabularies.map(v => v.korean).join(', ');
    return `Hãy tạo một cuộc trò chuyện tự nhiên sử dụng các từ vựng sau: ${koreanWords}. AI hãy tự chọn chủ đề phù hợp với các từ này.`;
  };

  // Fetch batch mới (chạy background)
  const fetchNextBatch = async () => {
    if (!chatRef.current || isFetchingRef.current || shouldStopRef.current) return;
    if (currentCountRef.current >= targetCount) return;
    
    isFetchingRef.current = true;
    try {
      const responseText = await sendAutoChatMessage(chatRef.current, 'CONTINUE');
      let responses;
      try {
        responses = JSON.parse(responseText);
        if (!Array.isArray(responses)) responses = [responses];
      } catch {
        responses = [];
      }
      
      if (!shouldStopRef.current) {
        nextBatchRef.current = responses;
      }
    } catch (e) {
      console.error('Error fetching next batch:', e);
    } finally {
      isFetchingRef.current = false;
    }
  };

  // Xử lý tin nhắn tuần tự
  const processBotResponsesSequentially = async (responses: any[], isLastBatch: boolean = false) => {
    if (!Array.isArray(responses) || responses.length === 0) return 0;

    let addedCount = 0;

    for (let i = 0; i < responses.length; i++) {
      const botResponse = responses[i];
      
      if (shouldStopRef.current) break;
      while (isPausedRef.current && !shouldStopRef.current) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      if (shouldStopRef.current) break;

      // Prefetch khi còn 2-3 tin nhắn cuối
      if (i >= responses.length - 3 && !nextBatchRef.current && !isFetchingRef.current && !isLastBatch) {
        fetchNextBatch();
      }

      const { CharacterName, Text, Tone, Translation } = botResponse;
      if (!CharacterName || !Text) continue;

      const character = selectedCharacters.find(c => c.name === CharacterName) || characters.find(c => c.name === CharacterName);
      const voiceName = character?.voiceName || 'echo';
      const pitch = character?.pitch;
      const speakingRate = character?.speakingRate;
      const tone = Tone || 'cheerfully';
      const translation = Translation;

      // Tạo audio
      let audioData: string | null = null;
      if (Text) {
        audioData = await textToSpeech(Text, tone, voiceName);
      }

      const msgId = `vocab-conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const message: Message = {
        id: msgId,
        text: Text,
        sender: 'bot',
        characterName: CharacterName,
        audioData: audioData ?? undefined,
        rawText: `${CharacterName} Said: ${Text}\nTone: ${tone}`,
        translation: translation
      };

      setMessages(prev => [...prev, message]);
      setCurrentCount(prev => prev + 1);
      addedCount++;

      // Phát audio
      if (audioData) {
        await playAudio(audioData, speakingRate, pitch);
      }

      // Delay giữa các tin nhắn
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return addedCount;
  };

  const startConversation = async () => {
    if (selectedCharacters.length < 1) {
      setError('Cần chọn ít nhất 1 nhân vật để bắt đầu');
      return;
    }

    setIsStarted(true);
    setIsGenerating(true);
    setIsPaused(false);
    isPausedRef.current = false;
    setError(null);
    setMessages([]);
    setCurrentCount(0);
    currentCountRef.current = 0;
    shouldStopRef.current = false;
    nextBatchRef.current = null;
    isFetchingRef.current = false;

    const generatedTopic = topic.trim() || generateTopicFromVocabularies();
    const vocabList = vocabularies.map(v => v.korean);

    try {
      chatRef.current = await initAutoChatSession(
        selectedCharacters,
        context,
        generatedTopic,
        currentLevel,
        [],
        vocabList
      );

      // Fetch batch đầu tiên
      const firstResponseText = await sendAutoChatMessage(chatRef.current, 'START');
      let currentBatch;
      try {
        currentBatch = JSON.parse(firstResponseText);
        if (!Array.isArray(currentBatch)) currentBatch = [currentBatch];
      } catch {
        setError('Định dạng phản hồi không hợp lệ');
        setIsGenerating(false);
        return;
      }

      // Generation loop
      while (currentCountRef.current < targetCount && !shouldStopRef.current) {
        while (isPausedRef.current && !shouldStopRef.current) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        if (shouldStopRef.current) break;

        const isLastBatch = currentCountRef.current + currentBatch.length >= targetCount;
        const generated = await processBotResponsesSequentially(currentBatch, isLastBatch);
        
        if (generated === 0 && !shouldStopRef.current) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (currentCountRef.current >= targetCount || shouldStopRef.current) break;

        // Lấy batch tiếp theo
        if (nextBatchRef.current && nextBatchRef.current.length > 0) {
          currentBatch = nextBatchRef.current;
          nextBatchRef.current = null;
        } else {
          while (isFetchingRef.current && !shouldStopRef.current) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          if (nextBatchRef.current && nextBatchRef.current.length > 0) {
            currentBatch = nextBatchRef.current;
            nextBatchRef.current = null;
          } else if (!shouldStopRef.current) {
            const responseText = await sendAutoChatMessage(chatRef.current, 'CONTINUE');
            try {
              currentBatch = JSON.parse(responseText);
              if (!Array.isArray(currentBatch)) currentBatch = [currentBatch];
            } catch {
              currentBatch = [];
            }
          }
        }

        if (!currentBatch || currentBatch.length === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
      }

      // Hoàn thành
      setIsCompleted(true);
    } catch (e: any) {
      setError(e.message || 'Failed to start');
    } finally {
      setIsGenerating(false);
    }
  };

  const pauseConversation = () => {
    setIsPaused(true);
    isPausedRef.current = true;
  };

  const resumeConversation = () => {
    setIsPaused(false);
    isPausedRef.current = false;
  };

  const stopConversation = () => {
    shouldStopRef.current = true;
    setIsGenerating(false);
    setIsPaused(false);
    isPausedRef.current = false;
    setIsCompleted(true);
  };

  const handleComplete = () => {
    // Đánh dấu tất cả từ vựng đã học
    const learnedIds = vocabularies.map(v => v.id);
    onComplete(learnedIds);
  };

  const handleReplayAudio = async (audioData: string, characterName?: string) => {
    const character = characters.find(c => c.name === characterName);
    await playAudio(audioData, character?.speakingRate, character?.pitch);
  };

  // Màn hình chọn chủ đề (trước khi bắt đầu)
  if (!isStarted) {
    return (
      <div className="flex flex-col h-screen w-full bg-white">
        {/* Header */}
        <header className={`${isReviewMode ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-gradient-to-r from-purple-500 to-indigo-500'} text-white p-4 shadow-lg`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={onBack}
                className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-lg font-bold">
                {isReviewMode ? '🔄 Ôn tập từ vựng' : '📚 Học từ vựng mới'}
              </h1>
            </div>
          </div>
        </header>

        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-4xl mx-auto">
          {/* Từ vựng cần học */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              📝 Từ vựng {isReviewMode ? 'cần ôn tập' : 'sẽ học'} ({vocabularies.length} từ):
            </h2>
            <div className="flex flex-wrap gap-2">
              {vocabularies.map(vocab => (
                <div 
                  key={vocab.id}
                  className={`px-3 py-2 rounded-lg text-sm ${isReviewMode ? 'bg-orange-100 text-orange-800' : 'bg-purple-100 text-purple-800'}`}
                >
                  <span className="font-bold">{vocab.korean}</span>
                  <span className="text-gray-600 ml-1">({vocab.vietnamese})</span>
                </div>
              ))}
            </div>
          </div>

          {/* Chọn chủ đề */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              💬 Chủ đề hội thoại (tùy chọn):
            </h2>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Để trống để AI tự chọn chủ đề phù hợp..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="text-sm text-gray-500 mt-2">
              * AI sẽ tạo hội thoại tự nhiên sử dụng các từ vựng trên
            </p>
          </div>

          {/* Nhân vật */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              👥 Chọn nhân vật tham gia ({selectedCharacters.length} đã chọn):
            </h2>
            <div className="flex flex-wrap gap-3">
              {characters.map(char => {
                const isSelected = selectedCharacterIds.includes(char.id);
                return (
                  <button
                    key={char.id}
                    onClick={() => toggleCharacter(char.id)}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all border-2 ${
                      isSelected 
                        ? isReviewMode
                          ? 'bg-orange-100 border-orange-500 text-orange-800'
                          : 'bg-purple-100 border-purple-500 text-purple-800'
                        : 'bg-gray-100 border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {char.avatar && (
                      <img src={char.avatar} alt={char.name} className="w-8 h-8 rounded-full object-cover" />
                    )}
                    <span className="font-medium">{char.name}</span>
                    {isSelected && (
                      <span className={`text-lg ${isReviewMode ? 'text-orange-600' : 'text-purple-600'}`}>✓</span>
                    )}
                  </button>
                );
              })}
            </div>
            {selectedCharacters.length === 0 && (
              <p className="text-red-500 text-sm mt-2">⚠️ Vui lòng chọn ít nhất 1 nhân vật</p>
            )}
          </div>

          {/* Thông tin */}
          <div className={`${isReviewMode ? 'bg-orange-50 border-orange-200' : 'bg-purple-50 border-purple-200'} border rounded-lg p-4`}>
            <h3 className={`font-semibold ${isReviewMode ? 'text-orange-800' : 'text-purple-800'} mb-2`}>
              ℹ️ Cách học:
            </h3>
            <ul className={`text-sm ${isReviewMode ? 'text-orange-700' : 'text-purple-700'} space-y-1`}>
              <li>• Các nhân vật sẽ tự nói chuyện với nhau</li>
              <li>• Từ vựng sẽ được <strong>tô đậm</strong> trong hội thoại</li>
              <li>• Mỗi từ sẽ xuất hiện ít nhất 5 lần</li>
              <li>• Nghe và đọc theo để ghi nhớ tự nhiên</li>
              <li>• Dự kiến ~{targetCount} tin nhắn</li>
            </ul>
          </div>

          {error && (
            <div className="mt-4 text-red-500 text-sm">⚠️ {error}</div>
          )}
          </div>
        </div>

        {/* Start button */}
        <div className="p-4 bg-gray-50 border-t border-gray-200">
          <div className="max-w-4xl mx-auto">
          <button
            onClick={startConversation}
            disabled={selectedCharacters.length < 1}
            className={`w-full py-4 ${isReviewMode ? 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600' : 'bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600'} text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all text-lg flex items-center justify-center space-x-2`}
          >
            <span>▶️</span>
            <span>Bắt đầu học qua hội thoại</span>
          </button>
          </div>
        </div>
      </div>
    );
  }

  // Màn hình hội thoại
  return (
    <div className="flex flex-col h-screen w-full bg-white">
      {/* Header */}
      <header className={`${isReviewMode ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-gradient-to-r from-purple-500 to-indigo-500'} text-white p-4 shadow-lg`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-bold">
              {isReviewMode ? '🔄 Ôn tập' : '📚 Học từ vựng'}
            </h1>
            {isGenerating && !isPaused && (
              <span className="animate-pulse text-sm bg-white/20 px-2 py-1 rounded">
                Đang tạo...
              </span>
            )}
            {isPaused && (
              <span className="text-sm bg-yellow-400 text-yellow-900 px-2 py-1 rounded">
                Tạm dừng
              </span>
            )}
            {isCompleted && (
              <span className="text-sm bg-green-400 text-green-900 px-2 py-1 rounded">
                Hoàn thành!
              </span>
            )}
          </div>
          <div className="text-right">
            <div className="text-sm opacity-90">Tiến độ</div>
            <div className="text-lg font-bold">{currentCount}/{targetCount}</div>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="mt-3 bg-white/30 rounded-full h-2 overflow-hidden">
          <div 
            className="bg-white h-full transition-all duration-300"
            style={{ width: `${Math.min(100, (currentCount / targetCount) * 100)}%` }}
          />
        </div>

        {/* Từ vựng đang học */}
        <div className="mt-2 flex flex-wrap gap-1">
          {vocabularies.slice(0, 5).map(v => (
            <span key={v.id} className="text-xs bg-white/20 px-2 py-0.5 rounded">
              {v.korean}
            </span>
          ))}
          {vocabularies.length > 5 && (
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
              +{vocabularies.length - 5}
            </span>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
        <div className="max-w-4xl mx-auto space-y-4">
        {messages.map(message => {
          const character = selectedCharacters.find(c => c.name === message.characterName) || characters.find(c => c.name === message.characterName);
          return (
            <MessageBubble
              key={message.id}
              message={message}
              onReplayAudio={handleReplayAudio}
              onGenerateAudio={async () => {}}
              onTranslate={async () => message.translation || ''}
              onStoreTranslation={() => {}}
              onRetry={() => {}}
              isJournalView={true}
              avatarUrl={character?.avatar}
            />
          );
        })}
        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Control buttons */}
      <div className="p-4 bg-white border-t border-gray-200">
        <div className="max-w-4xl mx-auto space-y-3">
        {error && (
          <div className="text-red-500 text-sm mb-2">⚠️ {error}</div>
        )}

        {isGenerating && !isCompleted && (
          <div className="flex gap-2">
            {!isPaused ? (
              <button
                onClick={pauseConversation}
                className="flex-1 py-3 bg-yellow-500 text-white font-medium rounded-lg hover:bg-yellow-600 transition-colors flex items-center justify-center space-x-2"
              >
                <span>⏸️</span>
                <span>Tạm dừng</span>
              </button>
            ) : (
              <button
                onClick={resumeConversation}
                className="flex-1 py-3 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center space-x-2"
              >
                <span>▶️</span>
                <span>Tiếp tục</span>
              </button>
            )}
            <button
              onClick={stopConversation}
              className="px-6 py-3 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 transition-colors"
            >
              ⏹️ Dừng
            </button>
          </div>
        )}

        {isCompleted && (
          <button
            onClick={handleComplete}
            className={`w-full py-4 ${isReviewMode ? 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600' : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600'} text-white font-bold rounded-lg transition-all text-lg flex items-center justify-center space-x-2`}
          >
            <span>✅</span>
            <span>Hoàn thành - Lưu kết quả</span>
          </button>
        )}
        </div>
      </div>
    </div>
  );
};

export default VocabularyConversation;
