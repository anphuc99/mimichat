import React, { useState, useRef, useEffect } from 'react';
import type { Character, Message } from '../types';
import type { Chat } from '@google/genai';
import { initAutoChatSession, sendAutoChatMessage, textToSpeech } from '../services/geminiService';

interface AutoChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  characters: Character[];
  context: string;
  currentLevel: string;
  currentMessages: Message[];
  onNewMessage: (message: Message) => void;
  playAudio: (audioData: string, speakingRate?: number, pitch?: number) => Promise<void>;
  onGeneratingChange: (isGenerating: boolean) => void; // Thông báo khi đang tạo tin nhắn
}

export const AutoChatModal: React.FC<AutoChatModalProps> = ({
  isOpen,
  onClose,
  characters,
  context,
  currentLevel,
  currentMessages,
  onNewMessage,
  playAudio,
  onGeneratingChange,
}) => {
  const [topic, setTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [targetCount, setTargetCount] = useState(50);
  const [currentCount, setCurrentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [generateAudio, setGenerateAudio] = useState(true);
  const [messageDelay, setMessageDelay] = useState(1.2); // Delay giống code cũ
  
  const chatRef = useRef<Chat | null>(null);
  const shouldStopRef = useRef(false);
  const isPausedRef = useRef(false);
  const currentCountRef = useRef(0);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    currentCountRef.current = currentCount;
  }, [currentCount]);

  // Thông báo App khi đang generating (để hiện typing indicator)
  useEffect(() => {
    onGeneratingChange(isGenerating && !isPaused);
  }, [isGenerating, isPaused, onGeneratingChange]);

  // Xử lý TUẦN TỰ như code cũ: tạo audio → thêm message → phát audio → delay
  const processBotResponsesSequentially = async (responses: any[]) => {
    if (!Array.isArray(responses) || responses.length === 0) return 0;

    let addedCount = 0;

    for (const botResponse of responses) {
      // Check stop/pause
      if (shouldStopRef.current) break;
      while (isPausedRef.current && !shouldStopRef.current) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      if (shouldStopRef.current) break;

      const { CharacterName, Text, Tone, Translation } = botResponse;
      if (!CharacterName || !Text) continue;

      const character = characters.find(c => c.name === CharacterName);
      const voiceName = character?.voiceName || 'echo';
      const pitch = character?.pitch;
      const speakingRate = character?.speakingRate;
      const tone = Tone || 'cheerfully';
      const translation = Translation;

      // Tạo audio TRƯỚC (giống code cũ)
      let audioData: string | null = null;
      if (generateAudio && Text) {
        audioData = await textToSpeech(Text, tone, voiceName);
      }

      const msgId = `auto-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Tạo message với audio đã có sẵn
      const message: Message = {
        id: msgId,
        text: Text,
        sender: 'bot',
        characterName: CharacterName,
        audioData: audioData ?? undefined,
        rawText: `${CharacterName} Said: ${Text}\nTone: ${tone}`,
        translation: translation
      };

      // Thêm message vào chat
      onNewMessage(message);
      setCurrentCount(prev => prev + 1);
      addedCount++;

      // Phát audio (giống code cũ)
      if (audioData) {
        await playAudio(audioData, speakingRate, pitch);
      }

      // Delay giữa các tin nhắn (giống code cũ: 1200ms)
      await new Promise(resolve => setTimeout(resolve, messageDelay * 1000));
    }

    return addedCount;
  };

  const startGeneration = async () => {
    if (!topic.trim()) {
      setError('Vui lòng nhập chủ đề');
      return;
    }

    if (characters.length < 1) {
      setError('Cần ít nhất 1 nhân vật để bắt đầu');
      return;
    }

    setIsGenerating(true);
    setIsPaused(false);
    isPausedRef.current = false;
    setError(null);
    setCurrentCount(0);
    currentCountRef.current = 0;
    shouldStopRef.current = false;

    try {
      chatRef.current = await initAutoChatSession(
        characters,
        context,
        topic,
        currentLevel
      );

      // Generation loop
      while (currentCountRef.current < targetCount && !shouldStopRef.current) {
        // Check pause
        while (isPausedRef.current && !shouldStopRef.current) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        if (shouldStopRef.current) break;

        // Lấy batch tin nhắn từ AI
        const command = currentCountRef.current === 0 ? 'START' : 'CONTINUE';
        const responseText = await sendAutoChatMessage(chatRef.current, command);
        
        let responses;
        try {
          responses = JSON.parse(responseText);
          if (!Array.isArray(responses)) responses = [responses];
        } catch {
          console.error('Invalid response format');
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        // Xử lý tuần tự giống code cũ
        const generated = await processBotResponsesSequentially(responses);
        
        if (generated === 0 && !shouldStopRef.current) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (e: any) {
      setError(e.message || 'Failed to start');
    } finally {
      setIsGenerating(false);
    }
  };

  const pauseGeneration = () => {
    setIsPaused(true);
    isPausedRef.current = true;
  };

  const resumeGeneration = () => {
    setIsPaused(false);
    isPausedRef.current = false;
  };

  const stopGeneration = () => {
    shouldStopRef.current = true;
    setIsGenerating(false);
    setIsPaused(false);
    isPausedRef.current = false;
  };

  const handleClose = () => {
    stopGeneration();
    setCurrentCount(0);
    currentCountRef.current = 0;
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-24 right-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-80 overflow-hidden border border-purple-200">
        {/* Header */}
        <div className="p-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white">
          <div className="flex items-center justify-between">
            <h3 className="font-bold flex items-center gap-2 text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Auto Chat
            </h3>
            <button onClick={handleClose} className="p-1 hover:bg-white/20 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 space-y-3">
          {/* Topic input */}
          <div>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Nhập chủ đề thảo luận..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              disabled={isGenerating}
            />
          </div>

          {/* Settings row 1 */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-600">Số tin:</span>
            <input
              type="number"
              min="5"
              max="200"
              step="5"
              value={targetCount}
              onChange={(e) => setTargetCount(Number(e.target.value))}
              className="w-14 px-2 py-1 border border-gray-300 rounded text-center"
              disabled={isGenerating}
            />
            <span className="text-gray-600 ml-2">Delay:</span>
            <select
              value={messageDelay}
              onChange={(e) => setMessageDelay(Number(e.target.value))}
              className="px-2 py-1 border border-gray-300 rounded text-xs"
              disabled={isGenerating}
            >
              <option value={0.5}>0.5s</option>
              <option value={1}>1s</option>
              <option value={1.5}>1.5s</option>
              <option value={2}>2s</option>
              <option value={3}>3s</option>
              <option value={5}>5s</option>
            </select>
            <label className="flex items-center gap-1 cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={generateAudio}
                onChange={(e) => setGenerateAudio(e.target.checked)}
                className="w-3 h-3 text-purple-600"
                disabled={isGenerating}
              />
              <span className="text-gray-600">Audio</span>
            </label>
          </div>

          {/* Progress */}
          {(isGenerating || currentCount > 0) && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className={`font-medium ${isGenerating ? (isPaused ? 'text-yellow-600' : 'text-purple-600') : 'text-green-600'}`}>
                  {isGenerating ? (isPaused ? '⏸️ Tạm dừng' : '🔄 Đang tạo...') : '✅ Xong'}
                </span>
                <span className="text-gray-600">{currentCount}/{targetCount}</span>
              </div>
              <div className="h-1.5 bg-purple-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, (currentCount / targetCount) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-red-500 text-xs">⚠️ {error}</div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {!isGenerating && currentCount === 0 && (
              <button
                onClick={startGeneration}
                disabled={!topic.trim() || characters.length < 1}
                className="flex-1 px-3 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium rounded-lg hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                </svg>
                Bắt đầu
              </button>
            )}

            {isGenerating && !isPaused && (
              <button
                onClick={pauseGeneration}
                className="flex-1 px-3 py-2 bg-yellow-500 text-white font-medium rounded-lg hover:bg-yellow-600 text-sm flex items-center justify-center gap-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
                </svg>
                Dừng
              </button>
            )}

            {isGenerating && isPaused && (
              <button
                onClick={resumeGeneration}
                className="flex-1 px-3 py-2 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 text-sm flex items-center justify-center gap-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                </svg>
                Tiếp
              </button>
            )}

            {isGenerating && (
              <button
                onClick={stopGeneration}
                className="px-3 py-2 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 text-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            {!isGenerating && currentCount > 0 && (
              <button
                onClick={() => {
                  setCurrentCount(0);
                  currentCountRef.current = 0;
                }}
                className="flex-1 px-3 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 text-sm"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutoChatModal;
