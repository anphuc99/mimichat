import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { Character, Message, VocabularyItem, VocabularyReview } from '../types';
import type { Chat, Content } from '@google/genai';
import { initAutoChatSession, sendAutoChatMessage, textToSpeech, suggestConversationTopic, initChat, sendMessage, sendAudioMessage, uploadAudio } from '../services/geminiService';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';

type LearningMode = 'passive' | 'active';

interface VocabularyConversationProps {
  vocabularies: VocabularyItem[];
  characters: Character[];
  context: string;
  currentLevel: string;
  onComplete: (learnedVocabIds: string[]) => void;
  onBack: () => void;
  playAudio: (audioData: string, speakingRate?: number, pitch?: number) => Promise<void>;
  isReviewMode?: boolean; // Đang ôn tập hay học mới
  reviewSchedule?: VocabularyReview[]; // Danh sách từ đã học
  relationshipSummary?: string; // Needed for active learning chat
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
  reviewSchedule = [],
  relationshipSummary = '',
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  // Learning mode: passive (AI talks to each other) or active (user interacts)
  const [learningMode, setLearningMode] = useState<LearningMode | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentCount, setCurrentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState<string>('');
  const [isStarted, setIsStarted] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const shouldStopReplayRef = useRef(false);
  
  // State mới cho việc dừng sau mỗi 10 câu
  const [isWaitingForContinue, setIsWaitingForContinue] = useState(false);
  const [batchCount, setBatchCount] = useState(0); // Đếm số batch đã chạy
  const MESSAGES_PER_BATCH = 10; // Số tin nhắn mỗi batch trước khi dừng
  
  // State cho AI suggested topic (chế độ ôn tập)
  const [suggestedTopic, setSuggestedTopic] = useState<string>('');
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
  const [showMeaning, setShowMeaning] = useState(false); // Ẩn/hiện nghĩa tiếng Việt trong ôn tập
  
  // State để chọn từ vựng muốn học
  const [selectedVocabIds, setSelectedVocabIds] = useState<Set<string>>(
    new Set(vocabularies.map(v => v.id)) // Mặc định chọn tất cả
  );
  
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
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const batchMessageCountRef = useRef(0); // Đếm số tin nhắn trong batch hiện tại
  const waitingForContinueRef = useRef(false);

  // Active learning states
  const [isActiveLoading, setIsActiveLoading] = useState(false);
  const userPromptRef = useRef<string>('');
  const activeChatRef = useRef<Chat | null>(null);

  // Tính số tin nhắn mục tiêu dựa trên số từ vựng đã chọn
  const targetCount = useMemo(() => Math.max(20, selectedVocabIds.size * 5), [selectedVocabIds.size]);

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

  // Toggle chọn từ vựng
  const toggleVocab = (vocabId: string) => {
    setSelectedVocabIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(vocabId)) {
        // Không cho phép bỏ chọn nếu chỉ còn 1 từ
        if (newSet.size <= 1) return prev;
        newSet.delete(vocabId);
      } else {
        newSet.add(vocabId);
      }
      return newSet;
    });
  };

  // Chọn/bỏ chọn tất cả từ vựng
  const toggleAllVocabs = () => {
    if (selectedVocabIds.size === vocabularies.length) {
      // Bỏ chọn tất cả, chỉ giữ lại 1 từ đầu tiên
      setSelectedVocabIds(new Set([vocabularies[0].id]));
    } else {
      // Chọn tất cả
      setSelectedVocabIds(new Set(vocabularies.map(v => v.id)));
    }
  };

  // Lấy danh sách từ vựng đã chọn
  const selectedVocabularies = vocabularies.filter(v => selectedVocabIds.has(v.id));

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

  // Gợi ý bối cảnh từ AI (cho chế độ ôn tập)
  const handleSuggestTopic = async () => {
    if (selectedCharacters.length < 1) {
      setError('Vui lòng chọn nhân vật trước');
      return;
    }
    setIsLoadingSuggestion(true);
    setError(null);
    try {
      const suggestion = await suggestConversationTopic(selectedVocabularies, selectedCharacters, context);
      setSuggestedTopic(suggestion);
      setTopic(suggestion);
    } catch (e: any) {
      setError(e.message || 'Không thể gợi ý bối cảnh');
    } finally {
      setIsLoadingSuggestion(false);
    }
  };

  // Tạo topic tự động từ từ vựng đã chọn
  const generateTopicFromVocabularies = (): string => {
    const koreanWords = selectedVocabularies.map(v => v.korean).join(', ');
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
      
      // Chờ nếu đang pause hoặc đang chờ user continue
      while ((isPausedRef.current || waitingForContinueRef.current) && !shouldStopRef.current) {
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
      batchMessageCountRef.current++;
      addedCount++;

      // Phát audio
      if (audioData) {
        await playAudio(audioData, speakingRate, pitch);
      }

      // Kiểm tra nếu đã đủ 10 tin nhắn trong batch hiện tại -> dừng và chờ user continue
      if (batchMessageCountRef.current >= MESSAGES_PER_BATCH && currentCountRef.current < targetCount) {
        batchMessageCountRef.current = 0;
        setBatchCount(prev => prev + 1);
        setIsWaitingForContinue(true);
        waitingForContinueRef.current = true;
        
        // Chờ cho đến khi user bấm tiếp tục
        while (waitingForContinueRef.current && !shouldStopRef.current) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        if (shouldStopRef.current) break;
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

    if (selectedVocabIds.size === 0) {
      setError('Cần chọn ít nhất 1 từ vựng để học');
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
    
    // Reset batch tracking
    batchMessageCountRef.current = 0;
    waitingForContinueRef.current = false;
    setIsWaitingForContinue(false);
    setBatchCount(0);

    // Chỉ sử dụng từ vựng đã chọn
    const vocabsToLearn = selectedVocabularies;
    const generatedTopic = topic.trim() || generateTopicFromVocabularies();
    const vocabList = vocabsToLearn.map(v => v.korean);

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
    // Chỉ đánh dấu những từ vựng đã chọn là đã học
    const learnedIds = selectedVocabularies.map(v => v.id);
    onComplete(learnedIds);
  };

  // Tiếp tục sau khi dừng mỗi 10 tin nhắn
  const handleContinue = () => {
    setIsWaitingForContinue(false);
    waitingForContinueRef.current = false;
  };
  const handleReplayAudio = async (audioData: string, characterName?: string) => {
    const character = characters.find(c => c.name === characterName);
    await playAudio(audioData, character?.speakingRate, character?.pitch);
  };

  // Nghe lại toàn bộ hội thoại
  const handleReplayAll = async () => {
    if (messages.length === 0) return;
    
    setIsReplaying(true);
    shouldStopReplayRef.current = false;
    
    for (let i = 0; i < messages.length; i++) {
      if (shouldStopReplayRef.current) break;
      
      setReplayIndex(i);
      
      // Scroll đến tin nhắn đang phát
      const messageElement = messageRefs.current.get(i);
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      
      const message = messages[i];
      
      if (message.audioData) {
        const character = selectedCharacters.find(c => c.name === message.characterName) || characters.find(c => c.name === message.characterName);
        await playAudio(message.audioData, character?.speakingRate, character?.pitch);
      }
      
      // Delay ngắn giữa các tin nhắn
      if (!shouldStopReplayRef.current && i < messages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    setIsReplaying(false);
    setReplayIndex(0);
  };

  const stopReplay = () => {
    shouldStopReplayRef.current = true;
    setIsReplaying(false);
    setReplayIndex(0);
  };

  // ============ ACTIVE LEARNING HANDLERS ============
  
  // Start active learning session
  const startActiveLearning = async () => {
    if (selectedCharacters.length < 1) {
      setError('Cần chọn ít nhất 1 nhân vật để bắt đầu');
      return;
    }

    if (selectedVocabIds.size === 0) {
      setError('Cần chọn ít nhất 1 từ vựng để học');
      return;
    }

    setIsStarted(true);
    setError(null);
    setMessages([]);

    // Build context with topic if provided
    const vocabList = selectedVocabularies.map(v => `${v.korean} (${v.vietnamese})`).join(', ');
    const topicContext = topic.trim() 
      ? `Chủ đề hội thoại: ${topic}. Hãy nói chuyện xoay quanh chủ đề này và sử dụng các từ vựng: ${vocabList}`
      : `Hãy nói chuyện tự nhiên và sử dụng các từ vựng sau: ${vocabList}`;

    try {
      // Initialize chat with same logic as main chat in App.tsx
      activeChatRef.current = await initChat(
        selectedCharacters,
        context,
        [],
        topicContext, // Pass topic as context summary
        relationshipSummary,
        currentLevel,
        selectedVocabularies // Pass vocabularies to review
      );
      console.log("Active vocabulary learning chat initialized with topic:", topic || '(auto)', "and vocabularies:", selectedVocabularies.map(v => v.korean));
    } catch (e: any) {
      setError(e.message || 'Không thể khởi tạo phiên học');
    }
  };

  // Process bot responses for active learning (similar to App.tsx)
  const processActiveBotResponses = useCallback(async (responses: any[]) => {
    if (!Array.isArray(responses) || responses.length === 0) {
      setIsActiveLoading(false);
      return;
    }

    for (const botResponse of responses) {
      const { CharacterName, Text, Tone, Translation } = botResponse;

      const characterName = CharacterName || selectedCharacters[0]?.name || "Mimi";
      const speechText = Text || "";
      const tone = Tone || 'cheerfully';
      const displayText = speechText || "...";

      const character = characters.find(c => c.name === characterName);
      const voiceName = character?.voiceName || 'echo';
      const pitch = character?.pitch;
      const speakingRate = character?.speakingRate;

      let audioData: string | null = null;
      if (speechText) {
        audioData = await textToSpeech(speechText, tone, voiceName);
      }

      const rawTextForCopy = `User Said: ${userPromptRef.current}\n${characterName} Said: ${speechText}\nTone: ${tone}`;

      const botMessage: Message = {
        id: (Date.now() + Math.random()).toString(),
        text: displayText,
        sender: 'bot',
        characterName: characterName,
        audioData: audioData ?? undefined,
        rawText: rawTextForCopy,
        translation: Translation
      };

      setMessages(prev => [...prev, botMessage]);

      if (audioData) {
        await playAudio(audioData, speakingRate, pitch);
      }

      await new Promise(resolve => setTimeout(resolve, 1200));
    }

    setIsActiveLoading(false);
  }, [selectedCharacters, characters, playAudio]);

  // Handle send message in active learning mode
  const handleActiveSendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isActiveLoading) return;

    const userMessage: Message = { id: Date.now().toString(), text, sender: 'user' };
    setMessages(prev => [...prev, userMessage]);
    setIsActiveLoading(true);
    userPromptRef.current = text;

    try {
      if (!activeChatRef.current) {
        activeChatRef.current = await initChat(
          selectedCharacters,
          context,
          [],
          '',
          relationshipSummary,
          currentLevel,
          selectedVocabularies
        );
      }
      
      let botResponseText = await sendMessage(activeChatRef.current, text);

      const parseAndValidate = (jsonString: string) => {
        try {
          let parsed = JSON.parse(jsonString);
          if (!Array.isArray(parsed)) parsed = [parsed];
          
          const isValid = parsed.every((item: any) => 
            item && 
            typeof item.CharacterName === 'string' && 
            typeof item.Text === 'string' && 
            typeof item.Tone === 'string'
          );
          
          return isValid ? parsed : null;
        } catch (e) {
          return null;
        }
      };

      let botResponses = parseAndValidate(botResponseText);
      let retryCount = 0;
      const maxRetries = 2;

      while (!botResponses && retryCount < maxRetries) {
        console.warn(`Invalid response format. Retrying (${retryCount + 1}/${maxRetries})...`);
        const retryPrompt = "SYSTEM: The last response was not in the correct JSON format. Please strictly output a JSON array where each object has 'CharacterName', 'Text', and 'Tone' fields.";
        botResponseText = await sendMessage(activeChatRef.current, retryPrompt);
        botResponses = parseAndValidate(botResponseText);
        retryCount++;
      }

      if (!botResponses) {
        console.error("Failed to parse AI response after retries.");
        throw new Error("Failed to parse AI response.");
      }

      await processActiveBotResponses(botResponses);

    } catch (error) {
      console.error("Không thể gửi tin nhắn:", error);
      const errorMessage: Message = { id: (Date.now() + 1).toString(), text: 'Xin lỗi, đã xảy ra lỗi. Vui lòng thử lại.', sender: 'bot', isError: true };
      setMessages(prev => [...prev, errorMessage]);
      setIsActiveLoading(false);
    }
  }, [isActiveLoading, selectedCharacters, context, relationshipSummary, currentLevel, selectedVocabularies, processActiveBotResponses]);

  // Handle send audio in active learning mode
  const handleActiveSendAudio = useCallback(async (audioBase64: string, duration: number) => {
    if (isActiveLoading) return;

    setIsActiveLoading(true);
    userPromptRef.current = '🎤 Voice message';

    try {
      // Upload audio to server
      const audioId = await uploadAudio(audioBase64);
      
      // Create user voice message (transcript will be updated after AI response)
      const userMessageId = Date.now().toString();
      const userMessage: Message = { 
        id: userMessageId, 
        text: '🎤 Tin nhắn giọng nói', 
        sender: 'user',
        kind: 'voice',
        audioId: audioId,
        audioDuration: duration
      };
      setMessages(prev => [...prev, userMessage]);

      // Initialize chat if needed
      if (!activeChatRef.current) {
        activeChatRef.current = await initChat(
          selectedCharacters,
          context,
          [],
          '',
          relationshipSummary,
          currentLevel,
          selectedVocabularies
        );
      }
      
      // Send audio to Gemini
      let botResponseText = await sendAudioMessage(activeChatRef.current, audioBase64, 'audio/wav');

      const parseAndValidate = (jsonString: string) => {
        try {
          let parsed = JSON.parse(jsonString);
          if (!Array.isArray(parsed)) parsed = [parsed];
          
          const isValid = parsed.every((item: any) => 
            item && 
            typeof item.CharacterName === 'string' && 
            typeof item.Text === 'string' && 
            typeof item.Tone === 'string'
          );
          
          return isValid ? parsed : null;
        } catch (e) {
          return null;
        }
      };

      let botResponses = parseAndValidate(botResponseText);
      let retryCount = 0;
      const maxRetries = 2;

      while (!botResponses && retryCount < maxRetries) {
        console.warn(`Invalid response format. Retrying (${retryCount + 1}/${maxRetries})...`);
        const retryPrompt = "SYSTEM: The last response was not in the correct JSON format. Please strictly output a JSON array where each object has 'CharacterName', 'Text', and 'Tone' fields.";
        botResponseText = await sendMessage(activeChatRef.current, retryPrompt);
        botResponses = parseAndValidate(botResponseText);
        retryCount++;
      }

      if (!botResponses) {
        console.error("Failed to parse AI response after retries.");
        throw new Error("Failed to parse AI response.");
      }

      // Extract UserTranscript from the first response if available
      const userTranscript = botResponses[0]?.UserTranscript;
      if (userTranscript) {
        // Update the user message with the transcript
        setMessages(prev => prev.map(msg => 
          msg.id === userMessageId 
            ? { ...msg, text: userTranscript, transcript: userTranscript }
            : msg
        ));
      }

      await processActiveBotResponses(botResponses);

    } catch (error) {
      console.error("Không thể gửi tin nhắn giọng nói:", error);
      const errorMessage: Message = { id: (Date.now() + 1).toString(), text: 'Xin lỗi, đã xảy ra lỗi khi xử lý giọng nói. Vui lòng thử lại.', sender: 'bot', isError: true };
      setMessages(prev => [...prev, errorMessage]);
      setIsActiveLoading(false);
    }
  }, [isActiveLoading, selectedCharacters, context, relationshipSummary, currentLevel, selectedVocabularies, processActiveBotResponses]);

  // Handle complete active learning
  const handleActiveComplete = () => {
    // Mark all selected vocabularies as learned
    const learnedIds = selectedVocabularies.map(v => v.id);
    onComplete(learnedIds);
  };

  // ============ MODE SELECTION SCREEN ============
  if (!learningMode) {
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
            <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">
              Chọn phương pháp học
            </h2>

            {/* Từ vựng hiển thị */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                📝 Từ vựng ({vocabularies.length} từ):
              </h3>
              <div className="flex flex-wrap gap-2">
                {vocabularies.slice(0, 10).map(vocab => (
                  <span 
                    key={vocab.id} 
                    className={`px-2 py-1 rounded text-sm ${isReviewMode ? 'bg-orange-100 text-orange-800' : 'bg-purple-100 text-purple-800'}`}
                  >
                    {vocab.korean} ({vocab.vietnamese})
                  </span>
                ))}
                {vocabularies.length > 10 && (
                  <span className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-sm">
                    +{vocabularies.length - 10} từ nữa
                  </span>
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Passive Learning */}
              <button
                onClick={() => setLearningMode('passive')}
                className={`p-6 rounded-xl border-2 transition-all text-left hover:shadow-lg ${
                  isReviewMode 
                    ? 'border-orange-300 hover:border-orange-500 hover:bg-orange-50' 
                    : 'border-purple-300 hover:border-purple-500 hover:bg-purple-50'
                }`}
              >
                <div className="text-4xl mb-3">🎧</div>
                <h3 className={`text-lg font-bold mb-2 ${isReviewMode ? 'text-orange-800' : 'text-purple-800'}`}>
                  Học thụ động
                </h3>
                <p className="text-gray-600 text-sm mb-3">
                  Các nhân vật tự nói chuyện với nhau xoay quanh từ vựng. Bạn chỉ cần nghe và đọc theo.
                </p>
                <ul className="text-xs text-gray-500 space-y-1">
                  <li>✓ Học theo phương pháp nghe - hiểu</li>
                  <li>✓ Từ vựng xuất hiện tự nhiên trong hội thoại</li>
                  <li>✓ Phù hợp khi bạn muốn thư giãn</li>
                </ul>
              </button>

              {/* Active Learning */}
              <button
                onClick={() => setLearningMode('active')}
                className={`p-6 rounded-xl border-2 transition-all text-left hover:shadow-lg ${
                  isReviewMode 
                    ? 'border-orange-300 hover:border-orange-500 hover:bg-orange-50' 
                    : 'border-purple-300 hover:border-purple-500 hover:bg-purple-50'
                }`}
              >
                <div className="text-4xl mb-3">💬</div>
                <h3 className={`text-lg font-bold mb-2 ${isReviewMode ? 'text-orange-800' : 'text-purple-800'}`}>
                  Học chủ động
                </h3>
                <p className="text-gray-600 text-sm mb-3">
                  Bạn sẽ tương tác trực tiếp với các nhân vật bằng text hoặc voice. Giống như chat bình thường.
                </p>
                <ul className="text-xs text-gray-500 space-y-1">
                  <li>✓ Tương tác trực tiếp với nhân vật</li>
                  <li>✓ Luyện nói và viết tiếng Hàn</li>
                  <li>✓ Không lưu vào nhật ký trò chuyện</li>
                </ul>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ ACTIVE LEARNING CONVERSATION SCREEN ============
  if (learningMode === 'active' && isStarted) {
    return (
      <div className="flex flex-col h-screen w-full bg-white">
        {/* Header */}
        <header className={`${isReviewMode ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-gradient-to-r from-green-500 to-teal-500'} text-white p-4 shadow-lg`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => {
                  if (window.confirm('Bạn có chắc muốn thoát? Tiến độ học sẽ không được lưu.')) {
                    setIsStarted(false);
                    setLearningMode(null);
                    setMessages([]);
                  }
                }}
                className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-lg font-bold">
                💬 Học chủ động
              </h1>
            </div>
          </div>
        </header>

        {/* Vocabulary hints bar */}
        <div className={`${isReviewMode ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'} border-b px-4 py-2`}>
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-xs text-gray-500 whitespace-nowrap">Từ vựng:</span>
            {selectedVocabularies.map(v => (
              <span 
                key={v.id} 
                className={`px-2 py-1 rounded text-xs whitespace-nowrap ${isReviewMode ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}
              >
                <strong>{v.korean}</strong> ({v.vietnamese})
              </span>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
          <div className="max-w-4xl mx-auto space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">💬</div>
                <p className="text-gray-600 mb-2">Bắt đầu trò chuyện với các nhân vật!</p>
                <p className="text-sm text-gray-500">
                  Hãy sử dụng các từ vựng ở trên trong cuộc hội thoại. Bạn có thể gửi tin nhắn text hoặc voice.
                </p>
              </div>
            )}
            {messages.map((message, index) => {
              const character = selectedCharacters.find(c => c.name === message.characterName) || characters.find(c => c.name === message.characterName);
              return (
                <div key={message.id}>
                  <MessageBubble
                    message={message}
                    onReplayAudio={handleReplayAudio}
                    onGenerateAudio={async () => {}}
                    onTranslate={async () => message.translation || ''}
                    onStoreTranslation={() => {}}
                    onRetry={() => {}}
                    isJournalView={true}
                    avatarUrl={character?.avatar}
                  />
                </div>
              );
            })}
            {isActiveLoading && (
              <div className="flex items-center space-x-2 text-gray-500">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span className="text-sm">Đang trả lời...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input - reuse MessageInput component */}
        <MessageInput
          onSendMessage={handleActiveSendMessage}
          isLoading={isActiveLoading}
          onSummarize={() => {}} // Not used in vocabulary learning
          onSendAudio={handleActiveSendAudio}
          footerChildren={
            <button
              onClick={handleActiveComplete}
              disabled={isActiveLoading}
              className="w-full py-3 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              ✅ Hoàn thành
            </button>
          }
        />
      </div>
    );
  }

  // ============ ACTIVE LEARNING SETUP SCREEN ============
  if (learningMode === 'active' && !isStarted) {
    return (
      <div className="flex flex-col h-screen w-full bg-white">
        {/* Header */}
        <header className={`${isReviewMode ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-gradient-to-r from-green-500 to-teal-500'} text-white p-4 shadow-lg`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setLearningMode(null)}
                className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-lg font-bold">
                💬 Học chủ động - Cài đặt
              </h1>
            </div>
          </div>
        </header>

        <div className="flex-1 p-6 overflow-y-auto pb-20">
          <div className="max-w-4xl mx-auto">
            {/* Từ vựng */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-800">
                  📝 Từ vựng sẽ học ({selectedVocabIds.size}/{vocabularies.length} từ):
                </h2>
                <button
                  onClick={toggleAllVocabs}
                  className="text-sm px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  {selectedVocabIds.size === vocabularies.length ? 'Bỏ chọn hết' : 'Chọn tất cả'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {vocabularies.map(vocab => {
                  const isSelected = selectedVocabIds.has(vocab.id);
                  return (
                    <button
                      key={vocab.id}
                      onClick={() => toggleVocab(vocab.id)}
                      className={`px-3 py-2 rounded-lg text-sm transition-all border-2 ${
                        isSelected
                          ? 'bg-green-100 text-green-800 border-green-400'
                          : 'bg-gray-100 text-gray-500 border-gray-200 opacity-60'
                      }`}
                    >
                      <span className="font-bold">{vocab.korean}</span>
                      <span className="text-gray-600"> ({vocab.vietnamese})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Chọn nhân vật */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-3">
                👥 Chọn nhân vật ({selectedCharacterIds.length} đã chọn):
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
                          ? 'bg-green-100 border-green-500 text-green-800'
                          : 'bg-gray-100 border-gray-300 text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      {char.avatar && (
                        <img src={char.avatar} alt={char.name} className="w-8 h-8 rounded-full object-cover" />
                      )}
                      <span className="font-medium">{char.name}</span>
                      {isSelected && (
                        <span className="text-lg text-green-600">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Chủ đề hội thoại */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-3">
                💬 Chủ đề hội thoại (tùy chọn):
              </h2>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Ví dụ: Đi mua sắm, Nấu ăn, Đi du lịch..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <p className="text-sm text-gray-500 mt-2">
                * Để trống để AI tự chọn chủ đề phù hợp với từ vựng
              </p>
            </div>

            {/* Thông tin */}
            <div className="bg-green-50 border-green-200 border rounded-lg p-4">
              <h3 className="font-semibold text-green-800 mb-2">
                ℹ️ Cách học chủ động:
              </h3>
              <ul className="text-sm text-green-700 space-y-1">
                <li>• Bạn sẽ chat trực tiếp với các nhân vật</li>
                <li>• Gửi tin nhắn bằng text hoặc voice</li>
                <li>• Cố gắng sử dụng từ vựng trong cuộc hội thoại</li>
                <li>• Đoạn chat này <strong>KHÔNG</strong> được lưu vào nhật ký</li>
              </ul>
            </div>

            {error && (
              <div className="mt-4 text-red-500 text-sm">⚠️ {error}</div>
            )}
          </div>
        </div>

        {/* Start button */}
        <div className="sticky bottom-0 left-0 right-0 p-4 bg-gray-50 border-t border-gray-200 z-30">
          <div className="max-w-4xl mx-auto">
            <button
              onClick={startActiveLearning}
              disabled={selectedCharacters.length < 1 || selectedVocabIds.size === 0}
              className="w-full py-3 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all text-base flex items-center justify-center space-x-3"
            >
              <span className="text-lg">💬</span>
              <span className="font-bold whitespace-nowrap">Bắt đầu chat với nhân vật</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ PASSIVE LEARNING SETUP SCREEN (Original) ============
  if (learningMode === 'passive' && !isStarted) {
    return (
      <div className="flex flex-col h-screen w-full bg-white">
        {/* Header */}
        <header className={`${isReviewMode ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-gradient-to-r from-purple-500 to-indigo-500'} text-white p-4 shadow-lg`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setLearningMode(null)}
                className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-lg font-bold">
                🎧 Học thụ động {isReviewMode ? '- Ôn tập' : '- Cài đặt'}
              </h1>
            </div>
          </div>
        </header>

        <div className="flex-1 p-6 overflow-y-auto pb-20">
          <div className="max-w-4xl mx-auto">
          {/* Từ vựng cần học */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">
                📝 Từ vựng {isReviewMode ? 'cần ôn tập' : 'sẽ học'} ({selectedVocabIds.size}/{vocabularies.length} từ):
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleAllVocabs}
                  className="text-sm px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  {selectedVocabIds.size === vocabularies.length ? 'Bỏ chọn hết' : 'Chọn tất cả'}
                </button>
                {isReviewMode && (
                  <button
                    onClick={() => setShowMeaning(!showMeaning)}
                    className="text-sm px-3 py-1 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors"
                  >
                    {showMeaning ? '🙈 Ẩn nghĩa' : '👁️ Hiện nghĩa'}
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {vocabularies.map(vocab => {
                const isSelected = selectedVocabIds.has(vocab.id);
                const isLearned = reviewSchedule.some(r => r.vocabularyId === vocab.id);
                return (
                  <button
                    key={vocab.id}
                    onClick={() => toggleVocab(vocab.id)}
                    className={`px-3 py-2 rounded-lg text-sm transition-all border-2 flex items-center gap-1 ${
                      isSelected
                        ? isReviewMode 
                          ? 'bg-orange-100 text-orange-800 border-orange-400' 
                          : 'bg-purple-100 text-purple-800 border-purple-400'
                        : 'bg-gray-100 text-gray-500 border-gray-200 opacity-60'
                    }`}
                  >
                    {isLearned && (
                      <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                    <span className="font-bold">{vocab.korean}</span>
                    {(!isReviewMode || showMeaning) && (
                      <span className="text-gray-600">({vocab.vietnamese})</span>
                    )}
                  </button>
                );
              })}
            </div>
            {selectedVocabIds.size === 0 && (
              <p className="text-red-500 text-sm mt-2">⚠️ Vui lòng chọn ít nhất 1 từ để học</p>
            )}
            {isReviewMode && !showMeaning && (
              <p className="text-sm text-orange-600 mt-2">
                💡 Thử nhớ lại nghĩa của các từ trước khi xem!
              </p>
            )}
            <p className="text-sm text-gray-500 mt-2">
              💡 Click vào từ để chọn/bỏ chọn. Chỉ những từ được chọn sẽ xuất hiện trong hội thoại.
            </p>
          </div>

          {/* Chọn chủ đề */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              💬 Chủ đề hội thoại (tùy chọn):
            </h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Để trống để AI tự chọn chủ đề phù hợp..."
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              {isReviewMode && (
                <button
                  onClick={handleSuggestTopic}
                  disabled={isLoadingSuggestion || selectedCharacters.length < 1}
                  className="px-4 py-3 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {isLoadingSuggestion ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span>Đang gợi ý...</span>
                    </>
                  ) : (
                    <>
                      <span>🤖</span>
                      <span>AI gợi ý</span>
                    </>
                  )}
                </button>
              )}
            </div>
            {suggestedTopic && isReviewMode && (
              <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-sm text-orange-700">
                  <strong>💡 Gợi ý từ AI:</strong> {suggestedTopic}
                </p>
              </div>
            )}
            <p className="text-sm text-gray-500 mt-2">
              {isReviewMode 
                ? '* Trong chế độ ôn tập, AI sẽ gợi ý bối cảnh phù hợp dựa trên từ vựng'
                : '* AI sẽ tạo hội thoại tự nhiên sử dụng các từ vựng trên'
              }
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

        {/* Start button (sticky to viewport bottom; avoid using fixed) */}
        <div className="sticky bottom-0 left-0 right-0 p-4 bg-gray-50 border-t border-gray-200 z-30">
          <div className="max-w-4xl mx-auto">
          <button
            onClick={startConversation}
            disabled={selectedCharacters.length < 1 || selectedVocabIds.size === 0}
            className={`w-full py-3 ${isReviewMode ? 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600' : 'bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600'} text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all text-base flex items-center justify-center space-x-3`}
          >
            <span className="text-lg">▶️</span>
            <span className="font-bold whitespace-nowrap">Bắt đầu học {selectedVocabIds.size} từ qua hội thoại</span>
          </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ PASSIVE LEARNING CONVERSATION SCREEN ============
  // Màn hình hội thoại (passive)
  return (
    <div className="flex flex-col h-screen w-full bg-white">
      {/* Header */}
      <header className={`${isReviewMode ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-gradient-to-r from-purple-500 to-indigo-500'} text-white p-4 shadow-lg`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-bold">
              🎧 Học thụ động {isReviewMode ? '- Ôn tập' : ''}
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
        {messages.map((message, index) => {
          const character = selectedCharacters.find(c => c.name === message.characterName) || characters.find(c => c.name === message.characterName);
          const isCurrentlyPlaying = isReplaying && replayIndex === index;
          return (
            <div 
              key={message.id}
              ref={(el) => {
                if (el) messageRefs.current.set(index, el);
              }}
              className={`transition-all duration-300 ${isCurrentlyPlaying ? 'ring-2 ring-blue-500 ring-offset-2 rounded-lg bg-blue-50' : ''}`}
            >
              <MessageBubble
                message={message}
                onReplayAudio={handleReplayAudio}
                onGenerateAudio={async () => {}}
                onTranslate={async () => message.translation || ''}
                onStoreTranslation={() => {}}
                onRetry={() => {}}
                isJournalView={true}
                avatarUrl={character?.avatar}
              />
            </div>
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

        {/* Nút tiếp tục sau mỗi 10 tin nhắn */}
        {isWaitingForContinue && isGenerating && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-3">
            <div className="text-center mb-3">
              <span className="text-blue-800 font-medium">
                📖 Đã xong {batchCount * MESSAGES_PER_BATCH} tin nhắn. Hãy đọc hiểu rồi bấm tiếp tục!
              </span>
            </div>
            <button
              onClick={handleContinue}
              className={`w-full py-3 ${isReviewMode ? 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600' : 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600'} text-white font-bold rounded-lg transition-all flex items-center justify-center space-x-2`}
            >
              <span>▶️</span>
              <span>Đã hiểu - Tiếp tục học</span>
            </button>
          </div>
        )}

        {isGenerating && !isCompleted && !isWaitingForContinue && (
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

        {!isGenerating && isCompleted && (
          <div className="space-y-3">
            {/* Nút nghe lại */}
            <div className="flex gap-2">
              {!isReplaying ? (
                <button
                  onClick={handleReplayAll}
                  disabled={messages.length === 0}
                  className="flex-1 py-3 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  <span>🔊</span>
                  <span>Nghe lại toàn bộ ({messages.length} tin)</span>
                </button>
              ) : (
                <button
                  onClick={stopReplay}
                  className="flex-1 py-3 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center space-x-2"
                >
                  <span>⏹️</span>
                  <span>Dừng nghe ({replayIndex + 1}/{messages.length})</span>
                </button>
              )}
            </div>
            
            {/* Nút hoàn thành */}
            <button
              onClick={handleComplete}
              disabled={isReplaying}
              className={`w-full py-4 ${isReviewMode ? 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600' : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600'} text-white font-bold rounded-lg transition-all text-lg flex items-center justify-center space-x-2 disabled:opacity-50`}
            >
              <span>✅</span>
              <span>Hoàn thành - Lưu kết quả</span>
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default VocabularyConversation;
