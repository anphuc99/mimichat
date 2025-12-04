import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Chat, Content } from '@google/genai';
import { ChatWindow } from './components/ChatWindow';
import { MessageInput } from './components/MessageInput';
import { JournalViewer } from './components/JournalViewer';
import { CharacterManager } from './components/CharacterManager';
import { VocabularyScene } from './components/VocabularyScene';
import { ChatContextViewer } from './components/ChatContextViewer';
import { ReviewScene } from './components/ReviewScene';
import { StreakDisplay } from './components/StreakDisplay';
import { StreakCelebration } from './components/StreakCelebration';
import { LevelSelector } from './components/LevelSelector';
import { AutoChatModal } from './components/AutoChatModal';
import type { Message, ChatJournal, DailyChat, Character, SavedData, CharacterThought, QuizState, VocabularyItem, VocabularyReview, StreakData, KoreanLevel, StoryMeta, StoriesIndex } from './types';
import { initializeGeminiService, initChat, sendMessage, textToSpeech, translateAndExplainText, translateWord, summarizeConversation, generateCharacterThoughts, generateToneDescription, generateRelationshipSummary, generateContextSuggestion, generateMessageSuggestions, generateVocabulary, generateSceneImage, initAutoChatSession, sendAutoChatMessage } from './services/geminiService';
import { calculateProgress } from './utils/vocabularyQuiz';
import { getVocabulariesDueForReview, updateReviewAfterQuiz, initializeVocabularyReview, getReviewDueCount } from './utils/spacedRepetition';
import { initializeStreak, updateStreak, checkStreakStatus } from './utils/streakManager';
import { KOREAN_LEVELS } from './types';
import http, { API_URL } from './services/HTTPService';

const initialCharacters: Character[] = [
  { 
    id: 'mimi', 
    name: 'Mimi', 
    personality: 'a Korean girl. She must only speak Korean in very short and simple sentences (max 5 words). Her personality is cheerful, playful, and a bit stubborn.', 
    gender: 'female', 
    voiceName: 'Kore', 
    pitch: 5.0, 
    speakingRate: 1.1,
    relations: {},
    userOpinion: { opinion: '', sentiment: 'neutral', closeness: 0 },
  },
  { 
    id: 'lisa', 
    name: 'Lisa', 
    personality: 'Mimi\'s friend, also a Korean girl. She is more curious and asks a lot of questions. She also speaks only short and simple Korean.', 
    gender: 'female', 
    voiceName: 'Zephyr', 
    pitch: 2.0, 
    speakingRate: 1.0,
    relations: {},
    userOpinion: { opinion: '', sentiment: 'neutral', closeness: 0 },
  },
  { 
    id: 'klee', 
    name: 'Klee', 
    personality: 'the neighbor, a very energetic and cheerful Korean girl. She often talks about games and fun activities and speaks simple Korean with a lot of excitement.', 
    gender: 'female', 
    voiceName: 'Kore', 
    pitch: 8.0, 
    speakingRate: 1.2,
    relations: {},
    userOpinion: { opinion: '', sentiment: 'neutral', closeness: 0 },
  }
];

const App: React.FC = () => {
  const [journal, setJournal] = useState<ChatJournal>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [view, setView] = useState<'chat' | 'journal' | 'vocabulary' | 'context' | 'review'>('chat');

  const [characters, setCharacters] = useState<Character[]>(initialCharacters);
  const [activeCharacterIds, setActiveCharacterIds] = useState<string[]>(['mimi']);
  const [context, setContext] = useState<string>("at Mimi's house");
  const [relationshipSummary, setRelationshipSummary] = useState<string>('');
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
  const [contextSuggestions, setContextSuggestions] = useState<string[]>([]);
  const [messageSuggestions, setMessageSuggestions] = useState<string[]>([]);
  const [isGeneratingMessageSuggestions, setIsGeneratingMessageSuggestions] = useState(false);
  const [isCharacterManagerOpen, setCharacterManagerOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [isGeneratingThoughts, setIsGeneratingThoughts] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Vocabulary learning states
  const [selectedDailyChatId, setSelectedDailyChatId] = useState<string | null>(null);
  const [quizState, setQuizState] = useState<QuizState | null>(null);
  const [contextViewState, setContextViewState] = useState<{
    vocabulary: VocabularyItem;
    currentUsageIndex: number;
    messages: Message[];
    returnToView?: 'vocabulary' | 'review';
  } | null>(null);
  const [isGeneratingVocabulary, setIsGeneratingVocabulary] = useState<string | null>(null);
  
  // Review mode state - store shuffled list to keep consistent order
  const [currentReviewItems, setCurrentReviewItems] = useState<{
    vocabulary: VocabularyItem;
    review: VocabularyReview;
    dailyChat: DailyChat;
    messages: Message[];
  }[] | null>(null);

  // Streak state
  const [streak, setStreak] = useState<StreakData>(initializeStreak());
  const [showStreakCelebration, setShowStreakCelebration] = useState(false);

  // Level state
  const [currentLevel, setCurrentLevel] = useState<KoreanLevel>('A1');
  const [isLevelSelectorOpen, setIsLevelSelectorOpen] = useState(false);

  // Story management state
  const [storiesIndex, setStoriesIndex] = useState<StoriesIndex>({ stories: [] });
  const [currentStoryId, setCurrentStoryId] = useState<string | null>(null);
  const [isStoryListOpen, setIsStoryListOpen] = useState(false);
  const [isCreatingStory, setIsCreatingStory] = useState(false);
  const [newStoryName, setNewStoryName] = useState('');

  // Auto Chat state
  const [isAutoChatOpen, setIsAutoChatOpen] = useState(false);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);

  const [isGeminiInitialized, setIsGeminiInitialized] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const userPromptRef = useRef<string>('');


  const chatRef = useRef<Chat | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioCacheRef = useRef<Map<string, AudioBuffer>>(new Map());

  const getActiveCharacters = useCallback(() => {
    return characters.filter(c => activeCharacterIds.includes(c.id));
  }, [characters, activeCharacterIds]);

  // Initialize Gemini service first
  useEffect(() => {
    const initializeApp = async () => {
      try {
        await initializeGeminiService();
        setIsGeminiInitialized(true);
        console.log("Gemini service initialized successfully");
      } catch (error) {
        console.error("Failed to initialize Gemini service:", error);
        alert("Không thể kết nối với dịch vụ AI. Vui lòng kiểm tra kết nối mạng và thử lại.");
      }
    };
    initializeApp();
  }, []);

  useEffect(() => {
    if (!isGeminiInitialized) return;
    
    const initializeChatSession = async () => {
      const activeChars = getActiveCharacters();
      if (activeChars.length > 0) {
        chatRef.current = await initChat(activeChars, context, [], '', relationshipSummary, currentLevel);
        console.log("Chat re-initialized with new context/characters.");
      }
    };
    initializeChatSession();
  }, [context, activeCharacterIds, characters, relationshipSummary, getActiveCharacters, isGeminiInitialized]);


  useEffect(() => {
    if (!isGeminiInitialized) return;
    
    const loadData = async () => {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      const initialChat: DailyChat = { id: Date.now().toString(), date: today, summary: '', messages: [] };
      setJournal([initialChat]);
      LoadData();
    };
    loadData();
  }, [isGeminiInitialized]);

  const getCurrentChat = (): DailyChat | null => {
    if (journal.length === 0) return null;
    return journal[journal.length - 1];
  };

  const getCurrentDailyChatId = (): string => {
    const currentChat = getCurrentChat();
    return currentChat?.id || '';
  };

  const decode = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const decodeAudioData = async (
    data: Uint8Array,
    ctx: AudioContext
  ): Promise<AudioBuffer> => {
    const sampleRate = 24000;
    const numChannels = 1;
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  };

  const playAudio = useCallback(async (audioData: string, speakingRate?: number, pitch?: number) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const context = audioContextRef.current;

      if (context.state === 'suspended') {
        await context.resume();
      }

      let audioBuffer = audioCacheRef.current.get(audioData);

      if (!audioBuffer) {
        const response = await http.downloadFile(API_URL.API_AUDIO + `/${audioData}`);
        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = await context.decodeAudioData(arrayBuffer);
        audioCacheRef.current.set(audioData, audioBuffer);
      }

      const source = context.createBufferSource();
      source.buffer = audioBuffer;

      source.playbackRate.value = speakingRate || 1.0;
      if (source.detune) {
        source.detune.value = (pitch || 0) * 50;
      }

      source.connect(context.destination);
      
      return new Promise<void>((resolve) => {
        source.onended = () => resolve();
        source.start();
      });
    } catch (error) {
      console.error("Failed to play audio:", error);
    }
  }, []);

  const preloadAudio = useCallback(async (audioData: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const context = audioContextRef.current;

      if (audioCacheRef.current.has(audioData)) {
        return;
      }

      const response = await http.downloadFile(API_URL.API_AUDIO + `/${audioData}`);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await context.decodeAudioData(arrayBuffer);
      audioCacheRef.current.set(audioData, audioBuffer);
    } catch (error) {
      console.error("Failed to preload audio:", error);
    }
  }, []);

  const handleReplayAudio = useCallback(async (audioData: string, characterName?: string) => {
    if (!characterName) {
      await playAudio(audioData, 1.0, 0); // Play with default if no character
      return;
    }
    const character = characters.find(c => c.name === characterName);
    await playAudio(audioData, character?.speakingRate, character?.pitch);
  }, [characters, playAudio]);

  const updateJournal = useCallback((updater: (prevJournal: ChatJournal) => ChatJournal) => {
    setJournal(updater);
  }, []);

  // Helper function to update streak and show celebration
  const handleStreakUpdate = useCallback(async (activityType: 'chat' | 'review' | 'learn') => {
    const { updatedStreak, isNewStreak, streakIncreased } = updateStreak(streak, activityType);
    
    setStreak(updatedStreak);
    
    // Show celebration if streak increased
    if (streakIncreased) {
      setShowStreakCelebration(true);
      setTimeout(() => setShowStreakCelebration(false), 3000);
    }
    
    // Save streak to separate file on server
    try {
      await http.put(API_URL.API_STREAK, updatedStreak);
    } catch (error) {
      console.error("Failed to save streak:", error);
    }
  }, [streak]);

  const updateCurrentChatMessages = useCallback((updater: (prevMessages: Message[]) => Message[]): void => {
    setJournal(prevJournal => {
      const updatedJournal = [...prevJournal];
      if (updatedJournal.length > 0) {
        const currentMessages = updatedJournal[updatedJournal.length - 1].messages;
        updatedJournal[updatedJournal.length - 1].messages = updater(currentMessages);
      }
      return updatedJournal;
    });
  }, []);

  const processBotResponsesSequentially = useCallback(async (responses: any[]) => {
    if (!Array.isArray(responses) || responses.length === 0) {
      setIsLoading(false);
      return;
    }

    for (const botResponse of responses) {
      const { CharacterName, Text, Action, Tone, Translation } = botResponse;

      const characterName = CharacterName || getActiveCharacters()[0]?.name || "Mimi";
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

      const rawTextForCopy = `User Said: ${userPromptRef.current}\n${characterName} Said: ${speechText}\nAction: ${Action}\nTone: ${tone}`;

      const botMessage: Message = {
        id: (Date.now() + Math.random()).toString(),
        text: displayText,
        sender: 'bot',
        characterName: characterName,
        audioData: audioData ?? undefined,
        rawText: rawTextForCopy,
        translation: Translation
      };

      updateCurrentChatMessages(prev => [...prev, botMessage]);

      if (audioData) {
        await playAudio(audioData, speakingRate, pitch);
      }

      await new Promise(resolve => setTimeout(resolve, 1200));
    }

    setIsLoading(false);
  }, [getActiveCharacters, playAudio, updateCurrentChatMessages, characters]);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = { id: Date.now().toString(), text, sender: 'user' };
    updateCurrentChatMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    userPromptRef.current = text;

    try {
      if (!chatRef.current) {
        const activeChars = getActiveCharacters();
        chatRef.current = await initChat(activeChars, context, [], '', relationshipSummary, currentLevel);
      }
      
      let botResponseText = await sendMessage(chatRef.current, text);

      const parseAndValidate = (jsonString: string) => {
        try {
          let parsed = JSON.parse(jsonString);
          if (!Array.isArray(parsed)) parsed = [parsed];
          
          // Validate required fields
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
        botResponseText = await sendMessage(chatRef.current, retryPrompt);
        botResponses = parseAndValidate(botResponseText);
        retryCount++;
      }

      if (!botResponses) {
        console.error("Failed to parse AI response after retries.");
        throw new Error("Failed to parse AI response.");
      }

      await processBotResponsesSequentially(botResponses);
      
      // Update streak after successful chat
      await handleStreakUpdate('chat');

    } catch (error) {
      console.error("Không thể gửi tin nhắn:", error);
      const errorMessage: Message = { id: (Date.now() + 1).toString(), text: 'Xin lỗi, đã xảy ra lỗi. Vui lòng thử lại.', sender: 'bot', isError: true };
      updateCurrentChatMessages(prev => [...prev, errorMessage]);
      setIsLoading(false);
    }
  }, [isLoading, getActiveCharacters, context, updateCurrentChatMessages, processBotResponsesSequentially, handleStreakUpdate]);

  const handleUpdateMessage = useCallback(async (messageId: string, newText: string) => {
    if (isLoading) return;
    const currentChat = getCurrentChat();
    if (!currentChat) return;

    const currentMessages = currentChat.messages;
    const messageIndex = currentMessages.findIndex(m => m.id === messageId);

    if (messageIndex === -1 || currentMessages[messageIndex].text === newText) {
      setEditingMessageId(null);
      return;
    }

    setEditingMessageId(null);
    setIsLoading(true);
    userPromptRef.current = newText;

    try {
      const messagesBeforeEdit = currentMessages.slice(0, messageIndex);
      const updatedUserMessage: Message = { ...currentMessages[messageIndex], text: newText };
      const newMessagesForUi = [...messagesBeforeEdit, updatedUserMessage];

      updateCurrentChatMessages(() => newMessagesForUi);

      const historyForGemini: Content[] = messagesBeforeEdit.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.rawText || msg.text }],
      }));

      const activeChars = getActiveCharacters();
      chatRef.current = await initChat(activeChars, context, historyForGemini, '', relationshipSummary, currentLevel);

      let botResponseText = await sendMessage(chatRef.current, newText);

      const parseAndValidate = (jsonString: string) => {
        try {
          let parsed = JSON.parse(jsonString);
          if (!Array.isArray(parsed)) parsed = [parsed];
          
          // Validate required fields
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
        console.warn(`Invalid response format on update. Retrying (${retryCount + 1}/${maxRetries})...`);
        const retryPrompt = "SYSTEM: The last response was not in the correct JSON format. Please strictly output a JSON array where each object has 'CharacterName', 'Text', and 'Tone' fields.";
        botResponseText = await sendMessage(chatRef.current, retryPrompt);
        botResponses = parseAndValidate(botResponseText);
        retryCount++;
      }

      if (!botResponses) {
        throw new Error("Failed to parse AI response on update.");
      }

      await processBotResponsesSequentially(botResponses);
    } catch (error) {
      console.error("Failed to update message and regenerate response:", error);
      updateCurrentChatMessages(() => currentMessages); // Restore previous messages on error
      setIsLoading(false);
    }
  }, [isLoading, journal, getActiveCharacters, context, updateCurrentChatMessages, processBotResponsesSequentially]);

  const handleUpdateBotMessage = useCallback(async (messageId: string, newText: string, newTone: string) => {
    const currentChat = getCurrentChat();
    if (!currentChat) return;

    const messageIndex = currentChat.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    try {
      const oldMessage = currentChat.messages[messageIndex];
      const character = characters.find(c => c.name === oldMessage.characterName);
      const voiceName = character?.voiceName || 'echo';
      const pitch = character?.pitch;
      const speakingRate = character?.speakingRate;
      const newAudioData = await textToSpeech(newText, newTone, voiceName);

      updateCurrentChatMessages(prevMessages => {
        const newMessages = [...prevMessages];
        const oldMessage = newMessages[messageIndex];

        const characterName = oldMessage.characterName || 'Mimi';
        const actionMatch = oldMessage.rawText?.match(/Action:\s*([\s\S]*?)(?=\n|$)/i);
        const action = actionMatch ? actionMatch[1].trim() : "";
        const userSaidMatch = oldMessage.rawText?.match(/User Said:\s*([\s\S]*?)(?=\n|$)/i);
        const userSaidText = userSaidMatch ? userSaidMatch[1].trim() : null;

        let newRawText = `${characterName} Said: ${newText}\nAction: ${action}\nTone: ${newTone}`;
        if (userSaidText) {
          newRawText = `User Said: ${userSaidText}\n` + newRawText;
        }

        newMessages[messageIndex] = {
          ...oldMessage,
          text: newText,
          audioData: newAudioData ?? undefined,
          rawText: newRawText,
        };
        return newMessages;
      });

      if (newAudioData) {
        await playAudio(newAudioData, speakingRate, pitch);
      }
    } catch (error) {
      console.error("Failed to update bot message:", error);
    } finally {
      setEditingMessageId(null);
    }
  }, [journal, playAudio, updateCurrentChatMessages, characters]);

  const handleRegenerateTone = useCallback(async (text: string, characterName: string): Promise<string> => {
    const character = characters.find(c => c.name === characterName);
    if (!character) return 'neutral';

    try {
      const newTone = await generateToneDescription(text, character);
      return newTone;
    } catch (error) {
      console.error("Failed to regenerate tone:", error);
      return 'neutral';
    }
  }, [characters]);

  const handleGenerateContextSuggestion = async () => {
    const activeChars = getActiveCharacters();
    if (activeChars.length === 0) return;
    
    setIsGeneratingSuggestion(true);
    try {
      const suggestions = await generateContextSuggestion(activeChars, relationshipSummary, context);
      setContextSuggestions(suggestions);
    } catch (error) {
      console.error('Failed to generate context suggestion:', error);
    } finally {
      setIsGeneratingSuggestion(false);
    }
  };

  const handleGenerateMessageSuggestions = async () => {
    const currentChat = getCurrentChat();
    if (!currentChat) return;
    
    const activeChars = getActiveCharacters();
    if (activeChars.length === 0) return;
    
    setIsGeneratingMessageSuggestions(true);
    try {
      const suggestions = await generateMessageSuggestions(
        activeChars,
        context,
        currentChat.messages
      );
      setMessageSuggestions(suggestions);
    } catch (error) {
      console.error('Failed to generate message suggestions:', error);
    } finally {
      setIsGeneratingMessageSuggestions(false);
    }
  };

  const handleRetry = useCallback(async () => {
    if (isLoading) return;
    const currentChat = getCurrentChat();
    if (!currentChat) return;

    const lastUserMessage = [...currentChat.messages].filter(m => m.sender === 'user').pop();
    if (!lastUserMessage) return;

    const messageIndex = currentChat.messages.lastIndexOf(lastUserMessage);
    const messagesForRegen = currentChat.messages.slice(0, messageIndex + 1);

    updateCurrentChatMessages(() => messagesForRegen);
    setIsLoading(true);
    userPromptRef.current = lastUserMessage.text;

    try {
      const historyForGemini: Content[] = messagesForRegen.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.rawText || msg.text }],
      })).slice(0, -1);

      const activeChars = getActiveCharacters();
      chatRef.current = await initChat(activeChars, context, historyForGemini, '', relationshipSummary, currentLevel);

      let botResponseText = await sendMessage(chatRef.current, lastUserMessage.text);

      const parseAndValidate = (jsonString: string) => {
        try {
          let parsed = JSON.parse(jsonString);
          if (!Array.isArray(parsed)) parsed = [parsed];
          
          // Validate required fields
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
        console.warn(`Invalid response format on retry. Retrying (${retryCount + 1}/${maxRetries})...`);
        const retryPrompt = "SYSTEM: The last response was not in the correct JSON format. Please strictly output a JSON array where each object has 'CharacterName', 'Text', and 'Tone' fields.";
        botResponseText = await sendMessage(chatRef.current, retryPrompt);
        botResponses = parseAndValidate(botResponseText);
        retryCount++;
      }

      if (!botResponses) {
        throw new Error("Failed to parse AI response on retry.");
      }

      await processBotResponsesSequentially(botResponses);

    } catch (error) {
      console.error("Không thể thử lại:", error);
      const errorMessage: Message = { id: (Date.now() + 1).toString(), text: 'Xin lỗi, đã xảy ra lỗi. Vui lòng thử lại.', sender: 'bot', isError: true };
      updateCurrentChatMessages(prev => [...prev, errorMessage]);
      setIsLoading(false);
    }
  }, [journal, isLoading, updateCurrentChatMessages, getActiveCharacters, context, processBotResponsesSequentially]);

  const handleGenerateAudio = useCallback(async (messageId: string, force: boolean = false) => {
    const currentChat = getCurrentChat();
    if (!currentChat) return;

    const messageToUpdate = currentChat.messages.find(m => m.id === messageId);
    if (!messageToUpdate || !messageToUpdate.text) return;

    try {
      const toneMatch = messageToUpdate.rawText?.match(/Tone:\s*([\s\S]*?)(?=\n|$)/i);
      const tone = toneMatch ? toneMatch[1].trim() : 'cheerfully';

      const character = characters.find(c => c.name === messageToUpdate.characterName);
      const voiceName = character?.voiceName || 'echo';
      const pitch = character?.pitch;
      const speakingRate = character?.speakingRate;
      const audioData = await textToSpeech(messageToUpdate.text, tone, voiceName, force);

      if (audioData) {
        updateCurrentChatMessages(prevMessages =>
          prevMessages.map(msg =>
            msg.id === messageId ? { ...msg, audioData } : msg
          )
        );
        await playAudio(audioData, speakingRate, pitch);
      }
    } catch (error) {
      console.error("Failed to generate audio:", error);
    }
  }, [journal, playAudio, updateCurrentChatMessages, characters]);

  const getTranslationAndExplanation = async (text: string): Promise<string> => {
    try {
      const result = await translateAndExplainText(text);
      return result;
    } catch (error) {
      console.error("Failed to get translation:", error);
      return "Lỗi: Không thể nhận được bản dịch.";
    }
  };

  const handleStoreTranslation = (messageId: string, translation: string) => {
    updateCurrentChatMessages(prevMessages =>
      prevMessages.map(msg =>
        msg.id === messageId ? { ...msg, translation } : msg
      )
    );
  };

  const handleEndDay = async () => {
    const currentChat = getCurrentChat();
    if (!currentChat || currentChat.messages.length === 0) {
      alert("Không có tin nhắn nào để tóm tắt.");
      return;
    }
    setIsSummarizing(true);
    try {
      const summary = await summarizeConversation(currentChat.messages);
      
      // Generate relationship summary
      const newRelationshipSummary = await generateRelationshipSummary(
        currentChat.messages, 
        getActiveCharacters(), 
        relationshipSummary
      );
      setRelationshipSummary(newRelationshipSummary);

      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      const newChat: DailyChat = { id: Date.now().toString(), date: today, summary: '', messages: [] };

      setJournal(prevJournal => {
        const updatedJournal = [...prevJournal];
        updatedJournal[updatedJournal.length - 1].summary = summary;
        return [...updatedJournal, newChat];
      });

      const history: Content[] = currentChat.messages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.rawText || msg.text }],
      }));

      const activeChars = getActiveCharacters();
      chatRef.current = await initChat(activeChars, context, history, summary, newRelationshipSummary, currentLevel);
      alert("Cuộc trò chuyện đã được tóm tắt và một ngày mới đã bắt đầu!");

    } catch (error) {
      console.error("Không thể tóm tắt cuộc trò chuyện:", error);
      alert("Đã xảy ra lỗi khi tóm tắt. Vui lòng thử lại.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const getCharactersInChat = useCallback((dailyChat: DailyChat): Character[] => {
    const characterNamesInChat = [...new Set(dailyChat.messages.filter(m => m.sender === 'bot' && m.characterName).map(m => m.characterName as string))];
    return characters.filter(c => characterNamesInChat.includes(c.name));
  }, [characters]);

  const handleGenerateAndShowThoughts = useCallback(async (dailyChatId: string) => {
    const chatIndex = journal.findIndex(dc => dc.id === dailyChatId);
    if (chatIndex === -1) return;

    const dailyChat = journal[chatIndex];
    if (dailyChat.characterThoughts) {
      return;
    }

    setIsGeneratingThoughts(dailyChatId);
    try {
      const charactersInChat = getCharactersInChat(dailyChat);
      if (charactersInChat.length === 0) {
        setIsGeneratingThoughts(null);
        return;
      }

      const thoughtsJson = await generateCharacterThoughts(dailyChat.messages, charactersInChat);
      let parsedThoughts = JSON.parse(thoughtsJson);

      if (!Array.isArray(parsedThoughts)) {
        parsedThoughts = [parsedThoughts];
      }

      const thoughtsWithAudio: CharacterThought[] = await Promise.all(
        parsedThoughts.map(async (thought: any) => {
          const character = characters.find(c => c.name === thought.CharacterName);
          const voiceName = character?.voiceName || 'echo';
          const audioData = await textToSpeech(thought.Text, thought.Tone || 'thoughtfully', voiceName);
          return {
            characterName: thought.CharacterName,
            text: thought.Text,
            tone: thought.Tone || 'thoughtfully',
            audioData: audioData ?? undefined,
          };
        })
      );

      setJournal(prevJournal => {
        const newJournal = [...prevJournal];
        newJournal[chatIndex] = {
          ...newJournal[chatIndex],
          characterThoughts: thoughtsWithAudio,
        };
        return newJournal;
      });

    } catch (error) {
      console.error("Failed to generate thoughts:", error);
      alert("Lỗi: Không thể tạo suy nghĩ của nhân vật.");
    } finally {
      setIsGeneratingThoughts(null);
    }
  }, [journal, getCharactersInChat, characters]);

  // Vocabulary handlers
  const handleCollectVocabulary = useCallback(async (korean: string, messageId: string, dailyChatId: string) => {
    if (!korean.trim()) return;

    // Check if this word already exists
    const chatIndex = journal.findIndex(dc => dc.id === dailyChatId);
    if (chatIndex === -1) return;

    const dailyChat = journal[chatIndex];
    const existingVocab = dailyChat.vocabularies?.find(v => v.korean === korean);
    if (existingVocab) {
      alert('Từ này đã có trong danh sách từ vựng!');
      return;
    }

    try {
      // Translate the word
      const vietnamese = await translateWord(korean);
      if (!vietnamese) {
        alert('Không thể dịch từ này.');
        return;
      }

      // Create new vocabulary item
      const newVocab: VocabularyItem = {
        id: `vocab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        korean,
        vietnamese
      };

      // Initialize review schedule
      const reviewSchedule = initializeVocabularyReview(newVocab, dailyChatId);

      // Update journal
      setJournal(prevJournal => {
        const newJournal = [...prevJournal];
        const chatIndex = newJournal.findIndex(dc => dc.id === dailyChatId);
        if (chatIndex !== -1) {
          newJournal[chatIndex] = {
            ...newJournal[chatIndex],
            vocabularies: [...(newJournal[chatIndex].vocabularies || []), newVocab],
            reviewSchedule: [...(newJournal[chatIndex].reviewSchedule || []), reviewSchedule],
            vocabularyProgress: [
              ...(newJournal[chatIndex].vocabularyProgress || []),
              {
                vocabularyId: newVocab.id,
                correctCount: 0,
                incorrectCount: 0,
                lastPracticed: '',
                needsReview: false,
                reviewAttempts: 0
              }
            ]
          };
        }
        return newJournal;
      });

      // alert(`Đã thêm từ "${korean}" (${vietnamese}) vào danh sách!`);
    } catch (error) {
      console.error('Error collecting vocabulary:', error);
      alert('Có lỗi xảy ra khi thu thập từ vựng.');
    }
  }, [journal]);

  const handleGenerateVocabulary = useCallback(async (dailyChatId: string) => {
    const chatIndex = journal.findIndex(dc => dc.id === dailyChatId);
    if (chatIndex === -1) return;

    const dailyChat = journal[chatIndex];
    if (dailyChat.vocabularies && dailyChat.vocabularies.length > 0) {
      return; // Already has vocabularies
    }

    // Collect all existing vocabularies from all daily chats
    const existingVocabularies = journal
      .flatMap(dc => dc.vocabularies || [])
      .filter((v, index, self) => 
        index === self.findIndex(t => t.korean === v.korean)
      ); // Remove duplicates

    setIsGeneratingVocabulary(dailyChatId);
    try {
      const vocabularies = await generateVocabulary(dailyChat.messages, currentLevel, existingVocabularies);
      
      // Initialize review schedule for each vocabulary
      const reviewSchedule = vocabularies.map(vocab => 
        initializeVocabularyReview(vocab, dailyChatId)
      );
      
      setJournal(prevJournal => {
        const newJournal = [...prevJournal];
        newJournal[chatIndex] = {
          ...newJournal[chatIndex],
          vocabularies,
          reviewSchedule,
          vocabularyProgress: vocabularies.map(v => ({
            vocabularyId: v.id,
            correctCount: 0,
            incorrectCount: 0,
            lastPracticed: '',
            needsReview: false,
            reviewAttempts: 0
          }))
        };
        return newJournal;
      });

      // Auto start vocabulary after generation
      setSelectedDailyChatId(dailyChatId);
      setQuizState({
        currentVocabIndex: 0,
        currentQuizType: 'meaning',
        wrongVocabs: [],
        reviewMode: false,
        completedQuizzes: [],
        reviewStartTime: null
      });
      setView('vocabulary');

    } catch (error) {
      console.error("Failed to generate vocabulary:", error);
      alert("Lỗi: Không thể phân tích từ vựng. Vui lòng thử lại.");
    } finally {
      setIsGeneratingVocabulary(null);
    }
  }, [journal]);

  const handleStartVocabulary = useCallback((dailyChatId: string) => {
    const dailyChat = journal.find(dc => dc.id === dailyChatId);
    if (!dailyChat || !dailyChat.vocabularies || dailyChat.vocabularies.length === 0) {
      alert("Chưa có từ vựng để học!");
      return;
    }

    setSelectedDailyChatId(dailyChatId);
    setQuizState({
      currentVocabIndex: 0,
      currentQuizType: 'meaning',
      wrongVocabs: [],
      reviewMode: false,
      completedQuizzes: [],
      reviewStartTime: null
    });
    setView('vocabulary');
  }, [journal]);

  const handleUpdateQuizState = useCallback((newState: QuizState) => {
    setQuizState(newState);
  }, []);

  const handleViewContext = useCallback((vocabulary: VocabularyItem, usageIndex: number) => {
    const dailyChat = journal.find(dc => dc.id === selectedDailyChatId);
    if (!dailyChat) return;

    setContextViewState({
      vocabulary,
      currentUsageIndex: usageIndex,
      messages: dailyChat.messages,
      returnToView: 'vocabulary'
    });
    setView('context');
  }, [journal, selectedDailyChatId]);

  const handleViewContextFromReview = useCallback((vocabulary: VocabularyItem, usageIndex: number) => {
    // Use stored review items instead of calling getVocabulariesDueForReview again
    if (!currentReviewItems) return;
    
    const item = currentReviewItems.find(r => r.vocabulary.id === vocabulary.id);
    
    if (!item) return;

    setContextViewState({
      vocabulary,
      currentUsageIndex: usageIndex,
      messages: item.messages,
      returnToView: 'review'
    });
    setView('context');
  }, [currentReviewItems]);

  const handleContextNavigate = useCallback((direction: 'prev' | 'next') => {
    if (!contextViewState) return;

    // We don't know the total count here easily without recalculating, 
    // but ChatContextViewer handles the bounds check based on what it finds.
    // We just update the index.
    const newIndex = direction === 'prev' 
      ? Math.max(0, contextViewState.currentUsageIndex - 1)
      : contextViewState.currentUsageIndex + 1;

    setContextViewState({
      ...contextViewState,
      currentUsageIndex: newIndex
    });
  }, [contextViewState]);

  const handleCloseContext = useCallback(() => {
    // Return to the view that opened the context viewer
    const returnView = contextViewState?.returnToView || 'vocabulary';
    setView(returnView);
  }, [contextViewState]);

  const handleCloseContextToReview = useCallback(() => {
    setView('review');
  }, []);

  const handleQuizComplete = useCallback(async () => {
    if (!quizState || !selectedDailyChatId) return;

    const chatIndex = journal.findIndex(dc => dc.id === selectedDailyChatId);
    if (chatIndex === -1) return;

    const dailyChat = journal[chatIndex];
    if (!dailyChat.vocabularies) return;

    // Calculate progress for each vocabulary
    const updatedProgress = dailyChat.vocabularies.map(vocab => {
      const existingProgress = dailyChat.vocabularyProgress?.find(p => p.vocabularyId === vocab.id);
      const vocabQuizzes = quizState.completedQuizzes.filter(q => q.vocabularyId === vocab.id);
      
      return calculateProgress(vocab.id, vocabQuizzes, existingProgress);
    });

    // Update journal with new progress
    setJournal(prevJournal => {
      const newJournal = [...prevJournal];
      newJournal[chatIndex] = {
        ...newJournal[chatIndex],
        vocabularyProgress: updatedProgress
      };
      return newJournal;
    });

    // Save to server
    try {
      const dataToSave: SavedData = {
        version: 5,
        journal: journal.map((chat, idx) => 
          idx === chatIndex 
            ? { ...chat, vocabularyProgress: updatedProgress }
            : chat
        ),
        characters,
        activeCharacterIds,
        context,
        relationshipSummary,
        currentLevel,
      };
      if (currentStoryId) {
        await http.put(`${API_URL.API_STORY}/${currentStoryId}`, { data: dataToSave });
      } else {
        await http.post(API_URL.API_SAVE_DATA, { data: dataToSave });
      }
    } catch (error) {
      console.error("Failed to save vocabulary progress:", error);
    }

    // Update streak after completing vocabulary learning
    await handleStreakUpdate('learn');

    // Return to journal
    setView('journal');
    setQuizState(null);
    setSelectedDailyChatId(null);
  }, [quizState, selectedDailyChatId, journal, characters, activeCharacterIds, context, relationshipSummary, handleStreakUpdate, currentStoryId]);

  const handleBackFromVocabulary = useCallback(() => {
    setView('journal');
    setQuizState(null);
    setSelectedDailyChatId(null);
  }, []);

  // Review mode handlers
  const handleStartReview = useCallback(() => {
    const reviewItems = getVocabulariesDueForReview(journal);
    
    if (reviewItems.length === 0) {
      alert('Không có từ vựng nào cần ôn tập hôm nay!');
      return;
    }
    
    // Store shuffled list to keep consistent order
    setCurrentReviewItems(reviewItems);
    setView('review');
  }, [journal]);

  const handleCompleteReview = useCallback(async (
    results: { vocabularyId: string; correctCount: number; incorrectCount: number }[]
  ) => {
    // Update review schedule for each vocabulary
    const updatedJournal = [...journal];
    
    for (const result of results) {
      // Find the daily chat and review for this vocabulary
      for (let i = 0; i < updatedJournal.length; i++) {
        const dailyChat = updatedJournal[i];
        if (!dailyChat.reviewSchedule) continue;
        
        const reviewIndex = dailyChat.reviewSchedule.findIndex(r => r.vocabularyId === result.vocabularyId);
        if (reviewIndex !== -1) {
          const currentReview = dailyChat.reviewSchedule[reviewIndex];
          const updatedReview = updateReviewAfterQuiz(
            currentReview,
            result.correctCount,
            result.incorrectCount
          );
          
          updatedJournal[i] = {
            ...dailyChat,
            reviewSchedule: [
              ...dailyChat.reviewSchedule.slice(0, reviewIndex),
              updatedReview,
              ...dailyChat.reviewSchedule.slice(reviewIndex + 1)
            ]
          };
          break;
        }
      }
    }
    
    setJournal(updatedJournal);
    
    // Save to server
    try {
      const dataToSave: SavedData = {
        version: 5,
        journal: updatedJournal,
        characters,
        activeCharacterIds,
        context,
        relationshipSummary,
        currentLevel,
      };
      if (currentStoryId) {
        await http.put(`${API_URL.API_STORY}/${currentStoryId}`, { data: dataToSave });
      } else {
        await http.post(API_URL.API_SAVE_DATA, { data: dataToSave });
      }
      alert(`Hoàn thành ôn tập! Đã ôn ${results.length} từ vựng.`);
    } catch (error) {
      console.error("Failed to save review progress:", error);
    }
    
    // Update streak after completing review
    await handleStreakUpdate('review');
    
    // Return to journal
    setView('journal');
    setCurrentReviewItems(null);
  }, [journal, characters, activeCharacterIds, context, relationshipSummary, handleStreakUpdate, currentStoryId]);

  const handleBackFromReview = useCallback(() => {
    setView('journal');
    setCurrentReviewItems(null);
  }, []);

  // Level change handler
  const handleLevelChange = useCallback(async (newLevel: KoreanLevel) => {
    setCurrentLevel(newLevel);
    
    // Reinitialize chat with new level
    if (chatRef.current) {
      const activeChars = getActiveCharacters();
      const currentChat = getCurrentChat();
      if (currentChat) {
        const history: Content[] = currentChat.messages.map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.rawText || msg.text }],
        }));
        const previousSummary = journal.length > 1 ? journal[journal.length - 2]?.summary || '' : '';
        chatRef.current = await initChat(activeChars, context, history, previousSummary, relationshipSummary, newLevel);
      } else {
        chatRef.current = await initChat(activeChars, context, [], '', relationshipSummary, newLevel);
      }
    }
    
    // Save new level
    try {
      const dataToSave: SavedData = {
        version: 5,
        journal,
        characters,
        activeCharacterIds,
        context,
        relationshipSummary,
        currentLevel: newLevel,
      };
      if (currentStoryId) {
        await http.put(`${API_URL.API_STORY}/${currentStoryId}`, { data: dataToSave });
      } else {
        await http.post(API_URL.API_SAVE_DATA, { data: dataToSave });
      }
    } catch (error) {
      console.error("Failed to save level:", error);
    }
  }, [currentLevel, journal, characters, activeCharacterIds, context, relationshipSummary, getActiveCharacters, getCurrentChat, currentStoryId]);

  const handleSaveJournal = async () => {
    try {
      const dataToSave: SavedData = {
        version: 5,
        journal,
        characters,
        activeCharacterIds,
        context,
        relationshipSummary,
        currentLevel,
      };
      
      let rs;
      if (currentStoryId) {
        rs = await http.put(`${API_URL.API_STORY}/${currentStoryId}`, { data: dataToSave });
      } else {
        rs = await http.post(API_URL.API_SAVE_DATA, { data: dataToSave });
      }
      
      if(rs.ok){
        alert("Đã lưu dữ liệu thành công")
      }
    } catch (error) {
      console.error("Không thể lưu nhật ký:", error);
      alert("Đã xảy ra lỗi khi cố gắng lưu nhật ký.");
    }
  };

  const handleDownloadJournal = () => {
    try {
      const dataToSave: SavedData = {
        version: 5,
        journal,
        characters,
        activeCharacterIds,
        context,
        relationshipSummary,
        currentLevel,
      };
      const jsonString = JSON.stringify(dataToSave, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mimi-chat-journal-${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Không thể tải xuống nhật ký:", error);
      alert("Đã xảy ra lỗi khi cố gắng tải xuống nhật ký.");
    }
  };

  const handleGenerateSceneImage = async () => {
    const currentChat = getCurrentChat();
    if (!currentChat || currentChat.messages.length === 0) return;
    
    const activeChars = getActiveCharacters();
    if (activeChars.length === 0) return;

    setIsGeneratingImage(true);
    try {
      const imageUrl = await generateSceneImage(currentChat.messages, activeChars);
      
      if (imageUrl) {
        // Add a special system message with the image
        const imageMessage: Message = {
          id: Date.now().toString(),
          text: "📸 Ảnh chụp khoảnh khắc này",
          sender: 'bot',
          characterName: 'System',
          imageUrl: imageUrl,
          isError: false
        };
        updateCurrentChatMessages(prev => [...prev, imageMessage]);
      } else {
        alert("Không thể tạo hình ảnh. Vui lòng thử lại.");
      }
    } catch (error) {
      console.error("Failed to generate scene image:", error);
      alert("Đã xảy ra lỗi khi tạo hình ảnh.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Handler for Auto Chat - thêm từng tin nhắn realtime vào chat
  const handleAutoChatNewMessage = useCallback((message: Message) => {
    updateCurrentChatMessages(prev => [...prev, message]);
  }, [updateCurrentChatMessages]);

  const handleRegenerateImage = async (messageId: string) => {
    const currentChat = getCurrentChat();
    if (!currentChat) return;

    const messageIndex = currentChat.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    // Use messages up to the image message as context
    const contextMessages = currentChat.messages.slice(0, messageIndex);
    const activeChars = getActiveCharacters();
    
    if (activeChars.length === 0) return;

    // Note: We don't set global isGeneratingImage here to avoid blocking the main UI,
    // but the MessageBubble will show its own loading state.
    
    try {
      const imageUrl = await generateSceneImage(contextMessages, activeChars);
      
      if (imageUrl) {
        updateCurrentChatMessages(prev => prev.map(m => 
          m.id === messageId ? { ...m, imageUrl } : m
        ));
      } else {
        alert("Không thể tạo lại hình ảnh. Vui lòng thử lại.");
      }
    } catch (error) {
      console.error("Failed to regenerate scene image:", error);
      alert("Đã xảy ra lỗi khi tạo lại hình ảnh.");
    }
  };

  const handleDownloadTxt = (dailyChatId: string) => {
    const dailyChat = journal.find(c => c.id === dailyChatId);
    if (!dailyChat) return;

    let content = `Date: ${dailyChat.date}\n`;
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

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `conversation-${dailyChat.date}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const LoadData = async () => {
    try {
      // Load streak from separate file first
      const streakResponse = await http.get(API_URL.API_STREAK);
      if (streakResponse.ok && streakResponse.data) {
        const loadedStreak = checkStreakStatus(streakResponse.data as StreakData);
        setStreak(loadedStreak);
      }

      // Then load stories index
      const storiesResponse = await http.get(API_URL.API_STORIES);
      if (!storiesResponse.ok) {
        throw new Error("Không thể tải danh sách truyện");
      }
      
      const storiesData = storiesResponse.data as StoriesIndex;
      setStoriesIndex(storiesData);
      
      // If no stories exist, show story list to create one
      if (!storiesData.stories || storiesData.stories.length === 0) {
        setIsStoryListOpen(true);
        setIsDataLoaded(true);
        return;
      }
      
      // Load the last opened story or first story
      const storyToLoad = storiesData.lastOpenedStoryId || storiesData.stories[0].id;
      await loadStory(storyToLoad);

    } catch (error) {
      console.error("Không thể tải dữ liệu:", error);
      // Fallback to old data loading method for backward compatibility
      await loadLegacyData();
    }
  };

  const loadStory = async (storyId: string) => {
    try {
      const response = await http.get(`${API_URL.API_STORY}/${storyId}`);
      if (!response.ok) {
        throw new Error("Không thể tải truyện");
      }
      
      const loadedData = response.data;
      await processLoadedData(loadedData, storyId);

    } catch (error) {
      console.error("Không thể tải truyện:", error);
      alert("Đã xảy ra lỗi khi tải truyện.");
    }
  };

  const loadLegacyData = async () => {
    try {
      const response = await http.get(API_URL.API_DATA);
      const loadedData = (response as any).data ?? response;
      await processLoadedData(loadedData, null);
    } catch (error) {
      console.error("Không thể tải dữ liệu legacy:", error);
    }
  };

  const processLoadedData = async (loadedData: any, storyId: string | null) => {
    let loadedJournal: ChatJournal;
    let loadedCharacters: Character[];
    let loadedActiveIds: string[] = ['mimi'];
    let loadedContext: string = "at Mimi's house";
    let loadedRelationshipSummary: string = '';
    let loadedLevel: KoreanLevel = 'A1';

    if (Array.isArray(loadedData)) { // v1 format support
      loadedJournal = loadedData.map((chat, index) => ({ 
        ...chat, 
        id: chat.id || `${new Date(chat.date).getTime()}-${index}`,
        vocabularies: [],
        vocabularyProgress: []
      }));
      loadedCharacters = initialCharacters;
    } else if (typeof loadedData === 'object' && (loadedData.version === 2 || loadedData.version === 3 || loadedData.version === 4 || loadedData.version === 5)) { // v2, v3, v4 & v5 format
      loadedJournal = loadedData.journal.map((chat: any, index: number) => ({
        ...chat,
        id: chat.id || `${new Date(chat.date).getTime()}-${index}`,
        // Add vocabulary fields for v4→v5 migration
        vocabularies: (chat.vocabularies || []).map((v: any) => {
          // Remove usageMessageIds if present (cleanup)
          const { usageMessageIds, ...rest } = v;
          return rest;
        }),
        vocabularyProgress: chat.vocabularyProgress || []
      }));
      // Add default gender, voice, relations and userOpinion for backward compatibility
      loadedCharacters = loadedData.characters.map((c: any) => ({ 
        ...c, 
        gender: c.gender || 'female', 
        voiceName: c.voiceName || 'Kore', 
        pitch: c.pitch ?? 0, 
        speakingRate: c.speakingRate ?? 1.0,
        relations: c.relations || {},
        userOpinion: c.userOpinion || { opinion: '', sentiment: 'neutral', closeness: 0 }
      }));
      loadedActiveIds = loadedData.activeCharacterIds;
      loadedContext = loadedData.context;
      loadedRelationshipSummary = loadedData.relationshipSummary || '';
      loadedLevel = loadedData.currentLevel || 'A1';
    } else {
      throw new Error("Tệp nhật ký không hợp lệ hoặc phiên bản không được hỗ trợ.");
    }

    if (!Array.isArray(loadedJournal) || loadedJournal.length === 0) throw new Error("Dữ liệu nhật ký không hợp lệ.");

    setJournal(loadedJournal);
    setCharacters(loadedCharacters);
    setActiveCharacterIds(loadedActiveIds);
    setContext(loadedContext);
    setRelationshipSummary(loadedRelationshipSummary);
    setCurrentLevel(loadedLevel);
    setCurrentStoryId(storyId);

    const lastChat = loadedJournal[loadedJournal.length - 1];
    const previousSummary = loadedJournal.length > 1 ? loadedJournal[loadedJournal.length - 2].summary : '';

    const history: Content[] = lastChat.messages.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.rawText || msg.text }],
    }));

    const activeChars = loadedCharacters.filter(c => loadedActiveIds.includes(c.id));
    chatRef.current = await initChat(activeChars, loadedContext, history, previousSummary, loadedRelationshipSummary, loadedLevel);

    setView('journal');
    setIsDataLoaded(true);
  };

  const handleCreateStory = async () => {
    if (!newStoryName.trim()) {
      alert("Vui lòng nhập tên truyện");
      return;
    }

    setIsCreatingStory(true);
    try {
      // Send current level to preserve it in the new story (streak is in separate file)
      const response = await http.post(API_URL.API_STORY, { 
        name: newStoryName.trim(),
        currentLevel: currentLevel
      });
      if (!response.ok) {
        throw new Error(response.error || "Không thể tạo truyện mới");
      }

      const { story } = response.data as { success: boolean; story: StoryMeta };
      
      // Update stories index
      setStoriesIndex(prev => ({
        ...prev,
        stories: [...prev.stories, story],
        lastOpenedStoryId: story.id
      }));

      // Load the new story
      await loadStory(story.id);
      
      setNewStoryName('');
      setIsStoryListOpen(false);
      alert(`Đã tạo truyện mới: ${story.name}`);

    } catch (error: any) {
      console.error("Không thể tạo truyện:", error);
      alert(error.message || "Đã xảy ra lỗi khi tạo truyện mới.");
    } finally {
      setIsCreatingStory(false);
    }
  };

  const handleSwitchStory = async (storyId: string) => {
    if (storyId === currentStoryId) {
      setIsStoryListOpen(false);
      return;
    }

    // Save current story before switching
    if (currentStoryId) {
      await saveCurrentStory();
    }

    await loadStory(storyId);
    setIsStoryListOpen(false);
  };

  const handleDeleteStory = async (storyId: string) => {
    if (storiesIndex.stories.length <= 1) {
      alert("Không thể xóa truyện cuối cùng!");
      return;
    }

    const story = storiesIndex.stories.find(s => s.id === storyId);
    if (!confirm(`Bạn có chắc muốn xóa truyện "${story?.name}"?`)) {
      return;
    }

    try {
      const response = await http.delete(`${API_URL.API_STORY}/${storyId}`);
      if (!response.ok) {
        throw new Error("Không thể xóa truyện");
      }

      // Update stories index
      const newStories = storiesIndex.stories.filter(s => s.id !== storyId);
      setStoriesIndex(prev => ({
        ...prev,
        stories: newStories
      }));

      // If deleted current story, switch to another
      if (storyId === currentStoryId && newStories.length > 0) {
        await loadStory(newStories[0].id);
      }

    } catch (error) {
      console.error("Không thể xóa truyện:", error);
      alert("Đã xảy ra lỗi khi xóa truyện.");
    }
  };

  const saveCurrentStory = async () => {
    if (!currentStoryId) return;

    const dataToSave: SavedData = {
      version: 5,
      journal,
      characters,
      activeCharacterIds,
      context,
      relationshipSummary,
      currentLevel,
    };

    try {
      await http.put(`${API_URL.API_STORY}/${currentStoryId}`, { data: dataToSave });
    } catch (error) {
      console.error("Không thể lưu truyện:", error);
    }
  };

  const handleLoadJournal = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') throw new Error("Định dạng tệp không hợp lệ.");
        const loadedData = JSON.parse(text);

        let loadedJournal: ChatJournal;
        let loadedCharacters: Character[];
        let loadedActiveIds: string[] = ['mimi'];
        let loadedContext: string = "at Mimi's house";
        let loadedRelationshipSummary: string = '';
        let loadedStreak: StreakData = initializeStreak();
        let loadedLevel: KoreanLevel = 'A1';

        if (Array.isArray(loadedData)) { // v1 format support
          loadedJournal = loadedData.map((chat, index) => ({ 
            ...chat, 
            id: chat.id || `${new Date(chat.date).getTime()}-${index}`,
            vocabularies: [],
            vocabularyProgress: []
          }));
          loadedCharacters = initialCharacters;
        } else if (typeof loadedData === 'object' && (loadedData.version === 2 || loadedData.version === 3 || loadedData.version === 4 || loadedData.version === 5)) { // v2, v3, v4 & v5 format
          loadedJournal = loadedData.journal.map((chat: any, index: number) => ({
            ...chat,
            id: chat.id || `${new Date(chat.date).getTime()}-${index}`,
            // Add vocabulary fields for v4→v5 migration
            vocabularies: (chat.vocabularies || []).map((v: any) => {
              // Remove usageMessageIds if present (cleanup)
              const { usageMessageIds, ...rest } = v;
              return rest;
            }),
            vocabularyProgress: chat.vocabularyProgress || []
          }));
          // Add default gender, voice, relations and userOpinion for backward compatibility
          loadedCharacters = loadedData.characters.map((c: any) => ({ 
            ...c, 
            gender: c.gender || 'female', 
            voiceName: c.voiceName || 'Kore', 
            pitch: c.pitch ?? 0, 
            speakingRate: c.speakingRate ?? 1.0,
            relations: c.relations || {},
            userOpinion: c.userOpinion || { opinion: '', sentiment: 'neutral', closeness: 0 }
          }));
          loadedActiveIds = loadedData.activeCharacterIds;
          loadedContext = loadedData.context;
          loadedRelationshipSummary = loadedData.relationshipSummary || '';
          loadedStreak = loadedData.streak ? checkStreakStatus(loadedData.streak) : initializeStreak();
          loadedLevel = loadedData.currentLevel || 'A1';
        } else {
          throw new Error("Tệp nhật ký không hợp lệ hoặc phiên bản không được hỗ trợ.");
        }

        if (!Array.isArray(loadedJournal) || loadedJournal.length === 0) throw new Error("Dữ liệu nhật ký không hợp lệ.");

        setJournal(loadedJournal);
        setCharacters(loadedCharacters);
        setActiveCharacterIds(loadedActiveIds);
        setContext(loadedContext);
        setRelationshipSummary(loadedRelationshipSummary);
        setStreak(loadedStreak);
        setCurrentLevel(loadedLevel);

        const lastChat = loadedJournal[loadedJournal.length - 1];
        const previousSummary = loadedJournal.length > 1 ? loadedJournal[loadedJournal.length - 2].summary : '';

        const history: Content[] = lastChat.messages.map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.rawText || msg.text }],
        }));

        const activeChars = loadedCharacters.filter(c => loadedActiveIds.includes(c.id));
        chatRef.current = await initChat(activeChars, loadedContext, history, previousSummary, loadedRelationshipSummary, loadedLevel);

        setView('journal');

      } catch (error) {
        console.error("Không thể tải nhật ký:", error);
        alert("Đã xảy ra lỗi khi tải tệp. Vui lòng kiểm tra xem tệp có đúng định dạng không.");
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Auto-save effect
  useEffect(() => {
    if (!isDataLoaded) return;

    const saveData = async () => {
      setIsSaving(true);
      try {
        const dataToSave: SavedData = {
          version: 5,
          journal,
          characters,
          activeCharacterIds,
          context,
          relationshipSummary,
          currentLevel,
        };
        
        if (currentStoryId) {
          await http.put(`${API_URL.API_STORY}/${currentStoryId}`, { data: dataToSave });
        } else {
          await http.post(API_URL.API_SAVE_DATA, { data: dataToSave });
        }
      } catch (error) {
        console.error("Auto-save failed:", error);
      } finally {
        setIsSaving(false);
      }
    };

    const timeoutId = setTimeout(saveData, 3000); // Debounce 3s

    return () => clearTimeout(timeoutId);
  }, [journal, characters, activeCharacterIds, context, relationshipSummary, currentLevel, isDataLoaded, currentStoryId]);

  const currentMessages = getCurrentChat()?.messages || [];

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-white shadow-2xl rounded-lg overflow-hidden">
      {/* Streak Celebration Overlay */}
      <StreakCelebration 
        streakCount={streak.currentStreak}
        show={showStreakCelebration}
        onComplete={() => setShowStreakCelebration(false)}
      />
      
      <header className="bg-white p-4 border-b border-gray-200 shadow-sm sticky top-0 z-10 flex justify-between items-center">
        <div className="w-28 flex items-center space-x-2">
          <button onClick={() => setView(view === 'chat' ? 'journal' : 'chat')} title={view === 'chat' ? "Xem nhật ký" : "Quay lại trò chuyện"} className="text-gray-600 hover:text-blue-500 transition-colors">
            {view === 'chat' ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v11.494m-9-5.747h18" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.375h16.5M3.75 14.625h16.5M2.25 12h19.5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v11.494m-9-5.747h18" />
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            )}
          </button>
          <button onClick={() => setCharacterManagerOpen(true)} title="Quản lý nhân vật" className="text-gray-600 hover:text-blue-500 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </button>
          <button onClick={() => setIsStoryListOpen(true)} title="Quản lý truyện" className="text-gray-600 hover:text-purple-500 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col items-center flex-1">
          <h1 className="text-2xl font-bold text-center text-gray-800">Mimi Messenger</h1>
          {currentStoryId && storiesIndex.stories.find(s => s.id === currentStoryId) && (
            <span className="text-xs text-purple-600 font-medium">
              📖 {storiesIndex.stories.find(s => s.id === currentStoryId)?.name}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-3">
          {/* Level Badge */}
          <button
            onClick={() => setIsLevelSelectorOpen(true)}
            className="px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all shadow-md flex items-center gap-2"
            title="Chọn trình độ"
          >
            <span className="text-sm">{currentLevel}</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {/* Compact Streak Display */}
          <StreakDisplay streak={streak} compact={true} />
          
          <div className="flex items-center space-x-2">
            {isSaving && <span className="text-xs text-gray-500 animate-pulse">Đang lưu...</span>}
            <button onClick={handleSaveJournal} title="Lưu nhật ký lên server" className="text-gray-600 hover:text-blue-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
            </button>
            <button onClick={handleDownloadJournal} title="Tải xuống nhật ký về máy" className="text-gray-600 hover:text-green-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
            </button>
          </div>
        </div>
      </header>

      <CharacterManager
        isOpen={isCharacterManagerOpen}
        onClose={() => setCharacterManagerOpen(false)}
        characters={characters}
        setCharacters={setCharacters}
        activeCharacterIds={activeCharacterIds}
        setActiveCharacterIds={setActiveCharacterIds}
        textToSpeech={textToSpeech}
        playAudio={playAudio}
      />

      <LevelSelector
        currentLevel={currentLevel}
        onLevelChange={handleLevelChange}
        isOpen={isLevelSelectorOpen}
        onClose={() => setIsLevelSelectorOpen(false)}
      />

      {/* Story List Modal */}
      {isStoryListOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-purple-500 to-indigo-600 text-white">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Danh sách truyện
              </h2>
              <button
                onClick={() => setIsStoryListOpen(false)}
                className="p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Create new story form */}
            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newStoryName}
                  onChange={(e) => setNewStoryName(e.target.value)}
                  placeholder="Nhập tên truyện mới..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isCreatingStory) {
                      handleCreateStory();
                    }
                  }}
                />
                <button
                  onClick={handleCreateStory}
                  disabled={isCreatingStory || !newStoryName.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                >
                  {isCreatingStory ? (
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Tạo
                    </>
                  )}
                </button>
              </div>
            </div>
            
            {/* Story list */}
            <div className="flex-1 overflow-y-auto">
              {storiesIndex.stories.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <p className="font-medium">Chưa có truyện nào</p>
                  <p className="text-sm">Tạo truyện mới để bắt đầu!</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {storiesIndex.stories.map((story) => (
                    <div
                      key={story.id}
                      className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                        story.id === currentStoryId ? 'bg-purple-50 border-l-4 border-purple-500' : ''
                      }`}
                      onClick={() => handleSwitchStory(story.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-800 truncate flex items-center gap-2">
                            {story.id === currentStoryId && (
                              <span className="text-purple-500">▶</span>
                            )}
                            {story.name}
                          </h3>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                              {story.messageCount} tin nhắn
                            </span>
                            {story.charactersPreview && story.charactersPreview.length > 0 && (
                              <span className="flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                {story.charactersPreview.join(', ')}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            Cập nhật: {new Date(story.updatedAt).toLocaleDateString('vi-VN')}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteStory(story.id);
                          }}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Xóa truyện"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {view === 'chat' ? (
        <>
          <ChatWindow
            messages={currentMessages}
            isLoading={isLoading || isAutoGenerating}
            onReplayAudio={handleReplayAudio}
            onTranslate={getTranslationAndExplanation}
            onStoreTranslation={handleStoreTranslation}
            onRetry={handleRetry}
            onGenerateAudio={handleGenerateAudio}
            editingMessageId={editingMessageId}
            setEditingMessageId={setEditingMessageId}
            onUpdateMessage={handleUpdateMessage}
            onUpdateBotMessage={handleUpdateBotMessage}
            onRegenerateTone={handleRegenerateTone}
            onCollectVocabulary={(korean, messageId) => handleCollectVocabulary(korean, messageId, getCurrentDailyChatId())}
            onRegenerateImage={handleRegenerateImage}
            characters={characters}
          />
          <div className="p-2 bg-white border-t border-gray-200 relative">
            <div className="flex items-center space-x-2 justify-center">
              <label htmlFor="context-input" className="text-sm font-medium text-gray-600 whitespace-nowrap">Bối cảnh:</label>
              <div className="relative flex-1 max-w-md">
                <input
                  id="context-input"
                  type="text"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  className="w-full px-3 py-1 bg-gray-100 border border-transparent rounded-full focus:outline-none focus:ring-1 focus:ring-blue-400 text-sm"
                  disabled={isLoading || isSummarizing}
                />
                
                {/* Context Suggestions Dropdown */}
                {contextSuggestions.length > 0 && (
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-80 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <div className="flex justify-between items-center mb-2 px-2">
                        <span className="text-xs font-semibold text-gray-600">Gợi ý bối cảnh:</span>
                        <button
                          onClick={() => setContextSuggestions([])}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      {contextSuggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            setContext(suggestion);
                            setContextSuggestions([]);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 rounded-md transition-colors text-sm"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={handleGenerateContextSuggestion}
                disabled={isGeneratingSuggestion || isLoading || isSummarizing}
                className="p-2 hover:bg-gray-100 rounded-full disabled:opacity-50 transition-colors"
                title="Gợi ý bối cảnh"
              >
                {isGeneratingSuggestion ? '🤔' : '💡'}
              </button>
              <button
                onClick={handleGenerateSceneImage}
                disabled={isGeneratingImage || isLoading || isSummarizing}
                className="p-2 hover:bg-gray-100 rounded-full disabled:opacity-50 transition-colors text-blue-500"
                title="Tạo ảnh minh họa cho cảnh này"
              >
                {isGeneratingImage ? (
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => setIsAutoChatOpen(true)}
                disabled={isLoading || isSummarizing}
                className="p-2 hover:bg-gray-100 rounded-full disabled:opacity-50 transition-colors text-purple-500"
                title="Auto Chat - Nhân vật tự nói chuyện"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                </svg>
              </button>
            </div>
          </div>
          <MessageInput 
            onSendMessage={handleSendMessage} 
            isLoading={isLoading || isSummarizing} 
            onSummarize={handleEndDay}
            suggestions={messageSuggestions}
            onGenerateSuggestions={handleGenerateMessageSuggestions}
            isGeneratingSuggestions={isGeneratingMessageSuggestions}
          />
        </>
      ) : view === 'vocabulary' && selectedDailyChatId && quizState ? (
        <VocabularyScene
          vocabularies={journal.find(d => d.id === selectedDailyChatId)?.vocabularies || []}
          messages={journal.find(d => d.id === selectedDailyChatId)?.messages || []}
          quizState={quizState}
          onUpdateQuizState={handleUpdateQuizState}
          onViewContext={handleViewContext}
          onComplete={handleQuizComplete}
          onBack={handleBackFromVocabulary}
          onReplayAudio={handleReplayAudio}
        />
      ) : view === 'context' && contextViewState ? (
        <ChatContextViewer
          messages={contextViewState.messages}
          vocabulary={contextViewState.vocabulary}
          currentUsageIndex={contextViewState.currentUsageIndex}
          onNavigate={handleContextNavigate}
          onClose={handleCloseContext}
          onReplayAudio={handleReplayAudio}
          characters={characters}
        />
      ) : view === 'review' && currentReviewItems ? (
        <ReviewScene
          reviewItems={currentReviewItems}
          onComplete={handleCompleteReview}
          onBack={handleBackFromReview}
          onReplayAudio={handleReplayAudio}
          onViewContext={handleViewContextFromReview}
          characters={characters}
        />
      ) : (
        <JournalViewer
          journal={journal}
          onReplayAudio={handleReplayAudio}
          onPreloadAudio={preloadAudio}
          onBackToChat={() => setView('chat')}
          isGeneratingThoughts={isGeneratingThoughts}
          onGenerateThoughts={handleGenerateAndShowThoughts}
          relationshipSummary={relationshipSummary}
          onUpdateRelationshipSummary={setRelationshipSummary}
          isGeneratingVocabulary={isGeneratingVocabulary}
          onGenerateVocabulary={handleGenerateVocabulary}
          onStartVocabulary={handleStartVocabulary}
          onStartReview={handleStartReview}
          reviewDueCount={getReviewDueCount(journal)}
          streak={streak}
          onCollectVocabulary={handleCollectVocabulary}
          onDownloadTxt={handleDownloadTxt}
          characters={characters}
        />
      )}

      {/* Auto Chat Modal */}
      <AutoChatModal
        isOpen={isAutoChatOpen}
        onClose={() => setIsAutoChatOpen(false)}
        characters={getActiveCharacters()}
        context={context}
        currentMessages={getCurrentChat()?.messages || []}
        currentLevel={currentLevel}
        onNewMessage={handleAutoChatNewMessage}
        playAudio={playAudio}
        onGeneratingChange={setIsAutoGenerating}
      />
    </div>
  );
};

export default App;
