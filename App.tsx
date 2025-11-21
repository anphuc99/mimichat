
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Chat, Content } from '@google/genai';
import { ChatWindow } from './components/ChatWindow';
import { MessageInput } from './components/MessageInput';
import { JournalViewer } from './components/JournalViewer';
import { CharacterManager } from './components/CharacterManager';
import { VocabularyScene } from './components/VocabularyScene';
import { ChatContextViewer } from './components/ChatContextViewer';
import type { Message, ChatJournal, DailyChat, Character, SavedData, CharacterThought, QuizState, VocabularyItem } from './types';
import { initializeGeminiService, initChat, sendMessage, textToSpeech, translateAndExplainText, summarizeConversation, generateCharacterThoughts, generateToneDescription, generateRelationshipSummary, generateContextSuggestion, generateMessageSuggestions, generateVocabulary } from './services/geminiService';
import { calculateProgress } from './utils/vocabularyQuiz';
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
  const [view, setView] = useState<'chat' | 'journal' | 'vocabulary' | 'context'>('chat');

  const [characters, setCharacters] = useState<Character[]>(initialCharacters);
  const [activeCharacterIds, setActiveCharacterIds] = useState<string[]>(['mimi']);
  const [context, setContext] = useState<string>("at Mimi's house");
  const [relationshipSummary, setRelationshipSummary] = useState<string>('');
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
  const [messageSuggestions, setMessageSuggestions] = useState<string[]>([]);
  const [isGeneratingMessageSuggestions, setIsGeneratingMessageSuggestions] = useState(false);
  const [isCharacterManagerOpen, setCharacterManagerOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [isGeneratingThoughts, setIsGeneratingThoughts] = useState<string | null>(null);

  // Vocabulary learning states
  const [selectedDailyChatId, setSelectedDailyChatId] = useState<string | null>(null);
  const [quizState, setQuizState] = useState<QuizState | null>(null);
  const [contextViewState, setContextViewState] = useState<{
    vocabulary: VocabularyItem;
    currentUsageIndex: number;
    messages: Message[];
  } | null>(null);
  const [isGeneratingVocabulary, setIsGeneratingVocabulary] = useState<string | null>(null);

  const [isGeminiInitialized, setIsGeminiInitialized] = useState(false);

  const userPromptRef = useRef<string>('');


  const chatRef = useRef<Chat | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

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
        chatRef.current = await initChat(activeChars, context, [], '', relationshipSummary);
        console.log("Chat re-initialized with new context/characters.");
      }
    };
    initializeChatSession();
  }, [context, activeCharacterIds, characters, relationshipSummary, getActiveCharacters, isGeminiInitialized]);


  useEffect(() => {
    if (!isGeminiInitialized) return;
    
    const loadData = async () => {
      const today = new Date().toISOString().split('T')[0];
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
      const context = new AudioContext();
      const response = await http.downloadFile(API_URL.API_AUDIO + `/${audioData}`);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await context.decodeAudioData(arrayBuffer);

      const source = context.createBufferSource();
      source.buffer = audioBuffer;

      source.playbackRate.value = speakingRate || 1.0;
      if (source.detune) {
        source.detune.value = (pitch || 0) * 50;
      }

      source.connect(context.destination);
      source.start();
    } catch (error) {
      console.error("Failed to play audio:", error);
    }
  }, []);

  const handleReplayAudio = useCallback((audioData: string, characterName?: string) => {
    if (!characterName) {
      playAudio(audioData, 1.0, 0); // Play with default if no character
      return;
    }
    const character = characters.find(c => c.name === characterName);
    playAudio(audioData, character?.speakingRate, character?.pitch);
  }, [characters, playAudio]);

  const updateJournal = useCallback((updater: (prevJournal: ChatJournal) => ChatJournal) => {
    setJournal(updater);
  }, []);

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
      const { CharacterName, Text, Action, Tone } = botResponse;

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
        chatRef.current = await initChat(activeChars, context, [], '', relationshipSummary);
      }
      const botResponseText = await sendMessage(chatRef.current, text);

      let botResponses;
      try {
        botResponses = JSON.parse(botResponseText);
        if (!Array.isArray(botResponses)) botResponses = [botResponses];
      } catch (e) {
        console.error("Failed to parse AI response.", e);
        throw new Error("Failed to parse AI response.");
      }

      await processBotResponsesSequentially(botResponses);

    } catch (error) {
      console.error("Không thể gửi tin nhắn:", error);
      const errorMessage: Message = { id: (Date.now() + 1).toString(), text: 'Xin lỗi, đã xảy ra lỗi. Vui lòng thử lại.', sender: 'bot', isError: true };
      updateCurrentChatMessages(prev => [...prev, errorMessage]);
      setIsLoading(false);
    }
  }, [isLoading, getActiveCharacters, context, updateCurrentChatMessages, processBotResponsesSequentially]);

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
      chatRef.current = await initChat(activeChars, context, historyForGemini, '', relationshipSummary);

      const botResponseText = await sendMessage(chatRef.current, newText);

      let botResponses;
      try {
        botResponses = JSON.parse(botResponseText);
        if (!Array.isArray(botResponses)) botResponses = [botResponses];
      } catch (e) {
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
      const suggestion = await generateContextSuggestion(activeChars, relationshipSummary, context);
      setContext(suggestion);
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
      chatRef.current = await initChat(activeChars, context, historyForGemini, '', relationshipSummary);

      const botResponseText = await sendMessage(chatRef.current, lastUserMessage.text);

      let botResponses;
      try {
        botResponses = JSON.parse(botResponseText);
        if (!Array.isArray(botResponses)) botResponses = [botResponses];
      } catch (e) {
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

  const handleGenerateAudio = useCallback(async (messageId: string) => {
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
      const audioData = await textToSpeech(messageToUpdate.text, tone, voiceName);

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

      const today = new Date().toISOString().split('T')[0];
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
      chatRef.current = await initChat(activeChars, context, history, summary, newRelationshipSummary);
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
  const handleGenerateVocabulary = useCallback(async (dailyChatId: string) => {
    const chatIndex = journal.findIndex(dc => dc.id === dailyChatId);
    if (chatIndex === -1) return;

    const dailyChat = journal[chatIndex];
    if (dailyChat.vocabularies && dailyChat.vocabularies.length > 0) {
      return; // Already has vocabularies
    }

    setIsGeneratingVocabulary(dailyChatId);
    try {
      const vocabularies = await generateVocabulary(dailyChat.messages, 'A0-A1');
      
      setJournal(prevJournal => {
        const newJournal = [...prevJournal];
        newJournal[chatIndex] = {
          ...newJournal[chatIndex],
          vocabularies,
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
      messages: dailyChat.messages
    });
    setView('context');
  }, [journal, selectedDailyChatId]);

  const handleContextNavigate = useCallback((direction: 'prev' | 'next') => {
    if (!contextViewState) return;

    const newIndex = direction === 'prev' 
      ? Math.max(0, contextViewState.currentUsageIndex - 1)
      : Math.min(contextViewState.vocabulary.usageMessageIds.length - 1, contextViewState.currentUsageIndex + 1);

    setContextViewState({
      ...contextViewState,
      currentUsageIndex: newIndex
    });
  }, [contextViewState]);

  const handleCloseContext = useCallback(() => {
    setView('vocabulary');
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
      };
      await http.post(API_URL.API_SAVE_DATA, { data: dataToSave });
    } catch (error) {
      console.error("Failed to save vocabulary progress:", error);
    }

    // Return to journal
    setView('journal');
    setQuizState(null);
    setSelectedDailyChatId(null);
  }, [quizState, selectedDailyChatId, journal, characters, activeCharacterIds, context, relationshipSummary]);

  const handleBackFromVocabulary = useCallback(() => {
    setView('journal');
    setQuizState(null);
    setSelectedDailyChatId(null);
  }, []);

  const handleSaveJournal = async () => {
    try {
      const dataToSave: SavedData = {
        version: 5,
        journal,
        characters,
        activeCharacterIds,
        context,
        relationshipSummary,
      };
      const rs = await http.post(API_URL.API_SAVE_DATA, {data: dataToSave})
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
      };
      const jsonString = JSON.stringify(dataToSave, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mimi-chat-journal-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Không thể tải xuống nhật ký:", error);
      alert("Đã xảy ra lỗi khi cố gắng tải xuống nhật ký.");
    }
  };

  const LoadData = async () => {
    try {
      const response = await http.get(API_URL.API_DATA);
      const loadedData = (response as any).data ?? response;

      let loadedJournal: ChatJournal;
      let loadedCharacters: Character[];
      let loadedActiveIds: string[] = ['mimi'];
      let loadedContext: string = "at Mimi's house";
      let loadedRelationshipSummary: string = '';

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
          vocabularies: chat.vocabularies || [],
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
      } else {
        throw new Error("Tệp nhật ký không hợp lệ hoặc phiên bản không được hỗ trợ.");
      }

      if (!Array.isArray(loadedJournal) || loadedJournal.length === 0) throw new Error("Dữ liệu nhật ký không hợp lệ.");

      setJournal(loadedJournal);
      setCharacters(loadedCharacters);
      setActiveCharacterIds(loadedActiveIds);
      setContext(loadedContext);
      setRelationshipSummary(loadedRelationshipSummary);

      const lastChat = loadedJournal[loadedJournal.length - 1];
      const previousSummary = loadedJournal.length > 1 ? loadedJournal[loadedJournal.length - 2].summary : '';

      const history: Content[] = lastChat.messages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.rawText || msg.text }],
      }));

      const activeChars = loadedCharacters.filter(c => loadedActiveIds.includes(c.id));
      chatRef.current = await initChat(activeChars, loadedContext, history, previousSummary, loadedRelationshipSummary);

      setView('journal');

    } catch (error) {
      console.error("Không thể tải nhật ký:", error);
      alert("Đã xảy ra lỗi khi tải tệp. Vui lòng kiểm tra xem tệp có đúng định dạng không.");
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
            vocabularies: chat.vocabularies || [],
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
        } else {
          throw new Error("Tệp nhật ký không hợp lệ hoặc phiên bản không được hỗ trợ.");
        }

        if (!Array.isArray(loadedJournal) || loadedJournal.length === 0) throw new Error("Dữ liệu nhật ký không hợp lệ.");

        setJournal(loadedJournal);
        setCharacters(loadedCharacters);
        setActiveCharacterIds(loadedActiveIds);
        setContext(loadedContext);
        setRelationshipSummary(loadedRelationshipSummary);

        const lastChat = loadedJournal[loadedJournal.length - 1];
        const previousSummary = loadedJournal.length > 1 ? loadedJournal[loadedJournal.length - 2].summary : '';

        const history: Content[] = lastChat.messages.map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.rawText || msg.text }],
        }));

        const activeChars = loadedCharacters.filter(c => loadedActiveIds.includes(c.id));
        chatRef.current = await initChat(activeChars, loadedContext, history, previousSummary, loadedRelationshipSummary);

        setView('journal');

      } catch (error) {
        console.error("Không thể tải nhật ký:", error);
        alert("Đã xảy ra lỗi khi tải tệp. Vui lòng kiểm tra xem tệp có đúng định dạng không.");
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const currentMessages = getCurrentChat()?.messages || [];

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-white shadow-2xl rounded-lg overflow-hidden">
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
        </div>
        <h1 className="text-2xl font-bold text-center text-gray-800 flex-1">Mimi Messenger</h1>
        <div className="flex items-center space-x-4 w-28 justify-end">
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
            {/*<label htmlFor="load-journal-input" title="Tải nhật ký" className="cursor-pointer text-gray-600 hover:text-blue-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
            </label>
            <input
                id="load-journal-input"
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleLoadJournal}
            /> */}
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

      {view === 'chat' ? (
        <>
          <ChatWindow
            messages={currentMessages}
            isLoading={isLoading}
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
          />
          <div className="p-2 bg-white border-t border-gray-200">
            <div className="flex items-center space-x-2">
              <label htmlFor="context-input" className="text-sm font-medium text-gray-600 whitespace-nowrap">Bối cảnh:</label>
              <input
                id="context-input"
                type="text"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                className="flex-1 w-full px-3 py-1 bg-gray-100 border border-transparent rounded-full focus:outline-none focus:ring-1 focus:ring-blue-400 text-sm"
                disabled={isLoading || isSummarizing}
              />
              <button
                onClick={handleGenerateContextSuggestion}
                disabled={isGeneratingSuggestion || isLoading || isSummarizing}
                className="p-2 hover:bg-gray-100 rounded-full disabled:opacity-50 transition-colors"
                title="Gợi ý bối cảnh"
              >
                {isGeneratingSuggestion ? '🤔' : '💡'}
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
        />
      ) : (
        <JournalViewer
          journal={journal}
          onReplayAudio={handleReplayAudio}
          onBackToChat={() => setView('chat')}
          isGeneratingThoughts={isGeneratingThoughts}
          onGenerateThoughts={handleGenerateAndShowThoughts}
          relationshipSummary={relationshipSummary}
          onUpdateRelationshipSummary={setRelationshipSummary}
          isGeneratingVocabulary={isGeneratingVocabulary}
          onGenerateVocabulary={handleGenerateVocabulary}
          onStartVocabulary={handleStartVocabulary}
        />
      )}
    </div>
  );
};

export default App;
