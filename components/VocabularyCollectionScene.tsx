import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { 
  CollectionVocabularyItem, 
  CollectionData, 
  CollectionReview,
  FSRSRating,
  Character
} from '../types';
import { calculateNewCardInterval } from '../utils/spacedRepetition';
import { fsrs, createEmptyCard, Rating, type Grade } from 'ts-fsrs';
import http, { API_URL } from '../services/HTTPService';

type CollectionTab = 'learn' | 'review' | 'difficult';

interface VocabularyCollectionSceneProps {
  onBack: () => void;
  onStreakUpdate?: () => void;
  characters: Character[];
  onPlayAudio?: (audioData: string, characterName?: string) => void;
  onGenerateAudio?: (text: string, tone: string, voiceName: string) => Promise<string | null>;
}

// Map rating to ts-fsrs Grade
function mapRatingToTsFsrs(rating: FSRSRating): Grade {
  switch (rating) {
    case 1: return Rating.Again;
    case 2: return Rating.Hard;
    case 3: return Rating.Good;
    case 4: return Rating.Easy;
    default: return Rating.Good;
  }
}

// Shuffle array
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Get today's date string (YYYY-MM-DD) in Vietnam timezone
function getTodayDateString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export const VocabularyCollectionScene: React.FC<VocabularyCollectionSceneProps> = ({
  onBack,
  onStreakUpdate,
  characters,
  onPlayAudio,
  onGenerateAudio
}) => {
  const [activeTab, setActiveTab] = useState<CollectionTab>('learn');
  const [isLoading, setIsLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false); // Track if initial data load is complete
  const [error, setError] = useState<string | null>(null);
  
  // Data
  const [allVocabulary, setAllVocabulary] = useState<CollectionVocabularyItem[]>([]);
  const [collectionData, setCollectionData] = useState<CollectionData>({
    settings: { wordsPerDay: 20, requestRetention: 0.9 },
    reviews: [],
    skippedIds: [],
    lastStudyDate: '',
    todayLearnedCount: 0,
    difficultToday: []
  });
  
  // Settings panel
  const [showSettings, setShowSettings] = useState(false);
  const [tempWordsPerDay, setTempWordsPerDay] = useState(20);
  const [tempRequestRetention, setTempRequestRetention] = useState(0.9);
  
  // Quiz state
  const [quizQueue, setQuizQueue] = useState<CollectionVocabularyItem[]>([]);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [quizChoices, setQuizChoices] = useState<string[]>([]);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [showRating, setShowRating] = useState(false);
  const [isRating, setIsRating] = useState(false); // Prevent double-click
  const [isQuizComplete, setIsQuizComplete] = useState(false);
  const [sessionStats, setSessionStats] = useState({ total: 0, correct: 0, incorrect: 0 });
  
  // Review state
  const [reviewQueue, setReviewQueue] = useState<{ vocab: CollectionVocabularyItem; review: CollectionReview }[]>([]);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const [reviewChoices, setReviewChoices] = useState<string[]>([]);
  const [reviewSelectedChoice, setReviewSelectedChoice] = useState<string | null>(null);
  const [showReviewRating, setShowReviewRating] = useState(false);
  const [isReviewComplete, setIsReviewComplete] = useState(false);
  const [reviewStats, setReviewStats] = useState({ total: 0, remembered: 0, forgot: 0 });
  
  // Track words that need to repeat during review session
  // Again (rating 1): repeat after every 10 words
  // Hard (rating 2) with same-day review: repeat after every 20 words
  const [repeatAgainWords, setRepeatAgainWords] = useState<{ vocab: CollectionVocabularyItem; review: CollectionReview; wordsUntilRepeat: number }[]>([]);
  const [repeatHardWords, setRepeatHardWords] = useState<{ vocab: CollectionVocabularyItem; review: CollectionReview; wordsUntilRepeat: number }[]>([]);
  const [reviewedCountSinceRepeat, setReviewedCountSinceRepeat] = useState(0);
  
  // Difficult state - similar to VocabularyMemoryScene
  const [difficultQueue, setDifficultQueue] = useState<{ vocab: CollectionVocabularyItem; rating: 1 | 2 }[]>([]);
  const [currentDifficultIndex, setCurrentDifficultIndex] = useState(0);
  const [difficultChoices, setDifficultChoices] = useState<string[]>([]);
  const [difficultSelectedChoice, setDifficultSelectedChoice] = useState<string | null>(null);
  const [showDifficultAnswer, setShowDifficultAnswer] = useState(false);
  const [isDifficultComplete, setIsDifficultComplete] = useState(false);
  const [difficultStats, setDifficultStats] = useState({ total: 0, practiced: 0 });
  
  // Audio state
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>(characters[0]?.id || '');
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

  // Create FSRS instance with requestRetention setting
  const f = useMemo(() => fsrs({
    request_retention: collectionData.settings.requestRetention || 0.9
  }), [collectionData.settings.requestRetention]);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      
      // Clear any existing quiz state on reload
      setQuizQueue([]);
      setCurrentQuizIndex(0);
      setIsQuizComplete(false);
      setSelectedChoice(null);
      setShowRating(false);
      setReviewQueue([]);
      setCurrentReviewIndex(0);
      setIsReviewComplete(false);
      setDifficultQueue([]);
      setCurrentDifficultIndex(0);
      setIsDifficultComplete(false);
      
      try {
        // Load vocabulary from CSV
        const vocabRes = await http.get<{ vocabulary: CollectionVocabularyItem[]; total: number }>(API_URL.API_VOCABULARY);
        if (vocabRes.ok && vocabRes.data) {
          setAllVocabulary(vocabRes.data.vocabulary);
        }
        
        // Load collection state
        const collectionRes = await http.get<CollectionData>(API_URL.API_VOCABULARY_COLLECTION);
        if (collectionRes.ok && collectionRes.data) {
          let data = collectionRes.data;
          
          // Check if date changed - reset daily count and difficult list
          const today = getTodayDateString();
          if (data.lastStudyDate !== today) {
            data = {
              ...data,
              lastStudyDate: today,
              todayLearnedCount: 0,
              difficultToday: []
            };
            // Save reset data
            await http.put(API_URL.API_VOCABULARY_COLLECTION, data);
          }
          
          setCollectionData(data);
          setTempWordsPerDay(data.settings.wordsPerDay);
          setTempRequestRetention(data.settings.requestRetention || 0.9);
        }
      } catch (e: any) {
        setError(e.message || 'Không thể tải dữ liệu');
      } finally {
        setIsLoading(false);
        setDataLoaded(true); // Mark data as loaded
      }
    };
    
    loadData();
  }, []);

  // Save collection data - use ref to avoid stale closure
  const collectionDataRef = React.useRef(collectionData);
  useEffect(() => {
    collectionDataRef.current = collectionData;
  }, [collectionData]);

  // Save collection data
  const saveCollectionData = useCallback(async (data: CollectionData) => {
    setCollectionData(data);
    collectionDataRef.current = data;
    try {
      await http.put(API_URL.API_VOCABULARY_COLLECTION, data);
    } catch (e) {
      console.error('Failed to save collection data:', e);
    }
  }, []);

  // Get learnable vocabulary (not learned yet, not skipped)
  const learnableVocabulary = useMemo(() => {
    const learnedIds = new Set(collectionData.reviews.map(r => r.vocabularyId));
    const skippedIds = new Set(collectionData.skippedIds);
    return allVocabulary.filter(v => !learnedIds.has(v.id) && !skippedIds.has(v.id));
  }, [allVocabulary, collectionData.reviews, collectionData.skippedIds]);

  // Get words remaining to learn today
  const remainingToday = useMemo(() => {
    return Math.max(0, collectionData.settings.wordsPerDay - collectionData.todayLearnedCount);
  }, [collectionData.settings.wordsPerDay, collectionData.todayLearnedCount]);

  // Get due reviews
  const dueReviews = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    return collectionData.reviews.filter(r => {
      const nextReview = new Date(r.nextReviewDate);
      return nextReview <= today;
    }).map(review => {
      const vocab = allVocabulary.find(v => v.id === review.vocabularyId);
      return vocab ? { vocab, review } : null;
    }).filter(Boolean) as { vocab: CollectionVocabularyItem; review: CollectionReview }[];
  }, [collectionData.reviews, allVocabulary]);

  // Get difficult vocabulary for today
  const difficultVocabulary = useMemo(() => {
    return collectionData.difficultToday.map(id => {
      const vocab = allVocabulary.find(v => v.id === id);
      const review = collectionData.reviews.find(r => r.vocabularyId === id);
      // Get the last rating from today
      const todayStr = getTodayDateString();
      const todayHistory = review?.reviewHistory.filter(h => h.date.startsWith(todayStr)) || [];
      const lastRating = todayHistory[todayHistory.length - 1]?.rating as 1 | 2 || 1;
      return vocab ? { vocab, rating: lastRating } : null;
    }).filter(Boolean) as { vocab: CollectionVocabularyItem; rating: 1 | 2 }[];
  }, [collectionData.difficultToday, allVocabulary, collectionData.reviews]);

  // Generate quiz choices
  const generateChoices = useCallback((correctVocab: CollectionVocabularyItem): string[] => {
    const filtered = allVocabulary.filter(v => v.id !== correctVocab.id);
    const shuffled = shuffleArray<CollectionVocabularyItem>(filtered);
    const wrongChoices = shuffled.slice(0, 3).map(v => v.vietnamese);
    
    return shuffleArray<string>([...wrongChoices, correctVocab.vietnamese]);
  }, [allVocabulary]);

  // Start learning session - học theo thứ tự từ dễ đến khó (tuần tự)
  const startLearning = useCallback(() => {
    // Lấy từ theo thứ tự tuần tự (không shuffle) vì danh sách đã sắp xếp từ dễ đến khó
    const wordsToLearn = learnableVocabulary.slice(0, remainingToday);
    if (wordsToLearn.length === 0) return;
    
    setQuizQueue(wordsToLearn);
    setCurrentQuizIndex(0);
    setQuizChoices(generateChoices(wordsToLearn[0]));
    setSelectedChoice(null);
    setShowRating(false);
    setIsQuizComplete(false);
    setSessionStats({ total: wordsToLearn.length, correct: 0, incorrect: 0 });
  }, [learnableVocabulary, remainingToday, generateChoices]);

  // Handle quiz choice selection
  const handleChoiceSelect = useCallback((choice: string) => {
    if (selectedChoice !== null) return;
    
    const currentVocab = quizQueue[currentQuizIndex];
    const isCorrect = choice === currentVocab.vietnamese;
    
    setSelectedChoice(choice);
    setSessionStats(prev => ({
      ...prev,
      correct: isCorrect ? prev.correct + 1 : prev.correct,
      incorrect: !isCorrect ? prev.incorrect + 1 : prev.incorrect
    }));
    
    // Show rating buttons after short delay
    setTimeout(() => setShowRating(true), 500);
  }, [selectedChoice, quizQueue, currentQuizIndex]);

  // Handle quiz rating
  const handleQuizRating = useCallback(async (rating: FSRSRating) => {
    // Prevent double-click
    if (isRating) return;
    setIsRating(true);
    
    const currentVocab = quizQueue[currentQuizIndex];
    
    // Use ref to get latest data (avoid stale closure)
    const currentData = collectionDataRef.current;
    
    // Check if this vocabulary was already reviewed (prevent duplicate)
    const alreadyReviewed = currentData.reviews.some(r => r.vocabularyId === currentVocab.id);
    if (alreadyReviewed) {
      console.warn('Vocabulary already reviewed, skipping duplicate:', currentVocab.id);
      // Just move to next word without adding duplicate review
      const remainingQueue = quizQueue.filter(v => v.id !== currentVocab.id);
      if (remainingQueue.length === 0 || currentQuizIndex >= remainingQueue.length) {
        setIsQuizComplete(true);
      } else {
        setQuizQueue(remainingQueue);
        // Keep same index since we removed current item
        const newIndex = Math.min(currentQuizIndex, remainingQueue.length - 1);
        setCurrentQuizIndex(newIndex);
        setQuizChoices(generateChoices(remainingQueue[newIndex]));
        setSelectedChoice(null);
        setShowRating(false);
      }
      setIsRating(false);
      return;
    }
    
    // Calculate FSRS values
    const card = createEmptyCard();
    const result = f.repeat(card, new Date());
    const grade = mapRatingToTsFsrs(rating);
    const newCard = result[grade].card;
    
    const now = new Date();
    const newReview: CollectionReview = {
      vocabularyId: currentVocab.id,
      currentIntervalDays: newCard.scheduled_days,
      nextReviewDate: newCard.due.toISOString(),
      lastReviewDate: now.toISOString(),
      reviewHistory: [{
        date: now.toISOString(),
        rating,
        stabilityBefore: 0,
        stabilityAfter: newCard.stability,
        difficultyBefore: 5,
        difficultyAfter: newCard.difficulty
      }],
      stability: newCard.stability,
      difficulty: newCard.difficulty,
      lapses: rating === 1 ? 1 : 0
    };
    
    // Update collection data
    const newData: CollectionData = {
      ...currentData,
      reviews: [...currentData.reviews, newReview],
      todayLearnedCount: currentData.todayLearnedCount + 1,
      difficultToday: rating <= 2 
        ? [...new Set([...currentData.difficultToday, currentVocab.id])]
        : currentData.difficultToday
    };
    
    await saveCollectionData(newData);
    
    // Update streak
    if (onStreakUpdate) {
      onStreakUpdate();
    }
    
    // Remove rated word from queue and move to next
    const remainingQueue = quizQueue.filter(v => v.id !== currentVocab.id);
    if (remainingQueue.length === 0) {
      setIsQuizComplete(true);
    } else {
      setQuizQueue(remainingQueue);
      // Keep same index since we removed current item (or adjust if at end)
      const newIndex = Math.min(currentQuizIndex, remainingQueue.length - 1);
      setCurrentQuizIndex(newIndex);
      setQuizChoices(generateChoices(remainingQueue[newIndex]));
      setSelectedChoice(null);
      setShowRating(false);
    }
    
    setIsRating(false);
  }, [quizQueue, currentQuizIndex, isRating, saveCollectionData, generateChoices, f, onStreakUpdate]);

  // Start review session
  const startReview = useCallback(() => {
    if (dueReviews.length === 0) return;
    
    const shuffled = shuffleArray<{ vocab: CollectionVocabularyItem; review: CollectionReview }>(dueReviews);
    setReviewQueue(shuffled);
    setCurrentReviewIndex(0);
    setReviewChoices(generateChoices(shuffled[0].vocab));
    setReviewSelectedChoice(null);
    setShowReviewRating(false);
    setIsReviewComplete(false);
    setReviewStats({ total: shuffled.length, remembered: 0, forgot: 0 });
    // Reset repeat tracking
    setRepeatAgainWords([]);
    setRepeatHardWords([]);
    setReviewedCountSinceRepeat(0);
  }, [dueReviews, generateChoices]);

  // Handle review choice selection
  const handleReviewChoiceSelect = useCallback((choice: string) => {
    if (reviewSelectedChoice !== null) return;
    
    const currentItem = reviewQueue[currentReviewIndex];
    const isCorrect = choice === currentItem.vocab.vietnamese;
    
    setReviewSelectedChoice(choice);
    
    setTimeout(() => setShowReviewRating(true), 500);
  }, [reviewSelectedChoice, reviewQueue, currentReviewIndex]);

  // Handle review rating
  const handleReviewRating = useCallback(async (rating: FSRSRating) => {
    const currentItem = reviewQueue[currentReviewIndex];
    const existingReview = currentItem.review;
    
    // Calculate new FSRS values
    const card = {
      due: new Date(existingReview.nextReviewDate),
      stability: existingReview.stability || 3,
      difficulty: existingReview.difficulty || 5,
      elapsed_days: existingReview.lastReviewDate 
        ? Math.max(0, (Date.now() - new Date(existingReview.lastReviewDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0,
      scheduled_days: existingReview.currentIntervalDays || 0,
      learning_steps: 0,
      reps: existingReview.reviewHistory.length,
      lapses: existingReview.lapses || 0,
      state: 2 as const, // Review state
      last_review: existingReview.lastReviewDate ? new Date(existingReview.lastReviewDate) : undefined
    };
    
    const result = f.repeat(card, new Date());
    const grade = mapRatingToTsFsrs(rating);
    const newCard = result[grade].card;
    
    const now = new Date();
    const updatedReview: CollectionReview = {
      ...existingReview,
      currentIntervalDays: newCard.scheduled_days,
      nextReviewDate: newCard.due.toISOString(),
      lastReviewDate: now.toISOString(),
      reviewHistory: [
        ...existingReview.reviewHistory,
        {
          date: now.toISOString(),
          rating,
          stabilityBefore: existingReview.stability || 0,
          stabilityAfter: newCard.stability,
          difficultyBefore: existingReview.difficulty || 5,
          difficultyAfter: newCard.difficulty
        }
      ],
      stability: newCard.stability,
      difficulty: newCard.difficulty,
      lapses: rating === 1 ? (existingReview.lapses || 0) + 1 : existingReview.lapses || 0
    };
    
    // Update stats
    setReviewStats(prev => ({
      ...prev,
      remembered: rating >= 2 ? prev.remembered + 1 : prev.remembered,
      forgot: rating === 1 ? prev.forgot + 1 : prev.forgot
    }));
    
    // Use ref to get latest data (avoid stale closure)
    const currentData = collectionDataRef.current;
    
    // Update collection data
    const newData: CollectionData = {
      ...currentData,
      reviews: currentData.reviews.map(r => 
        r.vocabularyId === updatedReview.vocabularyId ? updatedReview : r
      ),
      difficultToday: rating <= 2 
        ? [...new Set([...currentData.difficultToday, currentItem.vocab.id])]
        : currentData.difficultToday
    };
    
    await saveCollectionData(newData);
    
    // Update streak
    if (onStreakUpdate) {
      onStreakUpdate();
    }
    
    // Track words that need to repeat in this session
    // Rating 1 (Again): repeat after 10 words
    // Rating 2 (Hard) with same-day due: repeat after 20 words
    const newReviewedCount = reviewedCountSinceRepeat + 1;
    let updatedAgainWords = [...repeatAgainWords];
    let updatedHardWords = [...repeatHardWords];
    
    // Check if this word needs to be added to repeat lists
    if (rating === 1) {
      // Remove from existing lists if present (to avoid duplicates)
      updatedAgainWords = updatedAgainWords.filter(w => w.vocab.id !== currentItem.vocab.id);
      updatedHardWords = updatedHardWords.filter(w => w.vocab.id !== currentItem.vocab.id);
      // Add to Again list with 10 words until repeat
      updatedAgainWords.push({ vocab: currentItem.vocab, review: updatedReview, wordsUntilRepeat: 10 });
    } else if (rating === 2) {
      // Check if FSRS scheduled it for today (same-day review)
      const dueDate = new Date(newCard.due);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (dueDate <= today) {
        // Remove from existing lists if present
        updatedAgainWords = updatedAgainWords.filter(w => w.vocab.id !== currentItem.vocab.id);
        updatedHardWords = updatedHardWords.filter(w => w.vocab.id !== currentItem.vocab.id);
        // Add to Hard list with 20 words until repeat
        updatedHardWords.push({ vocab: currentItem.vocab, review: updatedReview, wordsUntilRepeat: 20 });
      }
    } else {
      // Good or Easy rating - remove from repeat lists
      updatedAgainWords = updatedAgainWords.filter(w => w.vocab.id !== currentItem.vocab.id);
      updatedHardWords = updatedHardWords.filter(w => w.vocab.id !== currentItem.vocab.id);
    }
    
    // Decrement counters for all tracked words
    updatedAgainWords = updatedAgainWords.map(w => ({ ...w, wordsUntilRepeat: w.wordsUntilRepeat - 1 }));
    updatedHardWords = updatedHardWords.map(w => ({ ...w, wordsUntilRepeat: w.wordsUntilRepeat - 1 }));
    
    // Check if any words need to be inserted back into queue
    const wordsToInsert: { vocab: CollectionVocabularyItem; review: CollectionReview }[] = [];
    
    // Check Again words (every 10)
    const readyAgainWords = updatedAgainWords.filter(w => w.wordsUntilRepeat <= 0);
    for (const w of readyAgainWords) {
      wordsToInsert.push({ vocab: w.vocab, review: w.review });
    }
    // Reset counter for inserted Again words
    updatedAgainWords = updatedAgainWords.map(w => 
      w.wordsUntilRepeat <= 0 ? { ...w, wordsUntilRepeat: 10 } : w
    );
    
    // Check Hard words (every 20)
    const readyHardWords = updatedHardWords.filter(w => w.wordsUntilRepeat <= 0);
    for (const w of readyHardWords) {
      // Don't add duplicates if already in wordsToInsert
      if (!wordsToInsert.some(item => item.vocab.id === w.vocab.id)) {
        wordsToInsert.push({ vocab: w.vocab, review: w.review });
      }
    }
    // Reset counter for inserted Hard words
    updatedHardWords = updatedHardWords.map(w => 
      w.wordsUntilRepeat <= 0 ? { ...w, wordsUntilRepeat: 20 } : w
    );
    
    setRepeatAgainWords(updatedAgainWords);
    setRepeatHardWords(updatedHardWords);
    setReviewedCountSinceRepeat(newReviewedCount);
    
    // Build new queue with inserted repeat words
    let newQueue = [...reviewQueue];
    if (wordsToInsert.length > 0) {
      // Insert repeat words after current position
      const insertPosition = currentReviewIndex + 1;
      newQueue = [
        ...newQueue.slice(0, insertPosition),
        ...wordsToInsert,
        ...newQueue.slice(insertPosition)
      ];
      setReviewQueue(newQueue);
    }
    
    // Move to next or complete
    if (currentReviewIndex < newQueue.length - 1) {
      const nextIndex = currentReviewIndex + 1;
      setCurrentReviewIndex(nextIndex);
      setReviewChoices(generateChoices(newQueue[nextIndex].vocab));
      setReviewSelectedChoice(null);
      setShowReviewRating(false);
    } else {
      // Check if there are still words in repeat lists that haven't been mastered
      if (updatedAgainWords.length > 0 || updatedHardWords.length > 0) {
        // Add remaining repeat words to continue the session
        const remainingWords = [
          ...updatedAgainWords.map(w => ({ vocab: w.vocab, review: w.review })),
          ...updatedHardWords.filter(h => !updatedAgainWords.some(a => a.vocab.id === h.vocab.id))
            .map(w => ({ vocab: w.vocab, review: w.review }))
        ];
        if (remainingWords.length > 0) {
          setReviewQueue([...newQueue, ...remainingWords]);
          const nextIndex = currentReviewIndex + 1;
          setCurrentReviewIndex(nextIndex);
          setReviewChoices(generateChoices(remainingWords[0].vocab));
          setReviewSelectedChoice(null);
          setShowReviewRating(false);
          return;
        }
      }
      setIsReviewComplete(true);
    }
  }, [reviewQueue, currentReviewIndex, saveCollectionData, generateChoices, f, onStreakUpdate, repeatAgainWords, repeatHardWords, reviewedCountSinceRepeat]);

  // Start difficult session
  const startDifficult = useCallback(() => {
    if (difficultVocabulary.length === 0) return;
    
    setDifficultQueue([...difficultVocabulary]);
    setCurrentDifficultIndex(0);
    setDifficultChoices(generateChoices(difficultVocabulary[0].vocab));
    setDifficultSelectedChoice(null);
    setShowDifficultAnswer(false);
    setIsDifficultComplete(false);
    setDifficultStats({ total: difficultVocabulary.length, practiced: 0 });
  }, [difficultVocabulary, generateChoices]);

  // Handle difficult choice selection
  const handleDifficultChoiceSelect = useCallback((choice: string) => {
    if (difficultSelectedChoice !== null) return;
    setDifficultSelectedChoice(choice);
    setTimeout(() => setShowDifficultAnswer(true), 500);
  }, [difficultSelectedChoice]);

  // Handle "Nhớ" (Remember) - remove from queue
  const handleDifficultRemember = useCallback(() => {
    setDifficultStats(prev => ({ ...prev, practiced: prev.practiced + 1 }));
    
    const newQueue = [...difficultQueue];
    newQueue.splice(currentDifficultIndex, 1);
    setDifficultQueue(newQueue);
    
    if (newQueue.length === 0) {
      setIsDifficultComplete(true);
      return;
    }
    
    const nextIndex = currentDifficultIndex >= newQueue.length ? 0 : currentDifficultIndex;
    setCurrentDifficultIndex(nextIndex);
    setDifficultChoices(generateChoices(newQueue[nextIndex].vocab));
    setDifficultSelectedChoice(null);
    setShowDifficultAnswer(false);
  }, [difficultQueue, currentDifficultIndex, generateChoices]);

  // Handle "Quên" (Forgot) - move to end of queue
  const handleDifficultForgot = useCallback(() => {
    const newQueue = [...difficultQueue];
    const currentItem = newQueue.splice(currentDifficultIndex, 1)[0];
    newQueue.push(currentItem);
    setDifficultQueue(newQueue);
    
    const nextIndex = currentDifficultIndex >= newQueue.length - 1 ? 0 : currentDifficultIndex;
    setDifficultChoices(generateChoices(newQueue[nextIndex].vocab));
    setDifficultSelectedChoice(null);
    setShowDifficultAnswer(false);
  }, [difficultQueue, currentDifficultIndex, generateChoices]);

  // Skip vocabulary (manual skip)
  const handleSkipVocab = useCallback(async (vocabId: string) => {
    // Use ref to get latest data (avoid stale closure)
    const currentData = collectionDataRef.current;
    
    // Check if already skipped or reviewed (prevent duplicate operations)
    const alreadySkipped = currentData.skippedIds.includes(vocabId);
    const alreadyReviewed = currentData.reviews.some(r => r.vocabularyId === vocabId);
    
    if (!alreadySkipped && !alreadyReviewed) {
      const newData: CollectionData = {
        ...currentData,
        skippedIds: [...new Set([...currentData.skippedIds, vocabId])]
      };
      await saveCollectionData(newData);
    }
    
    // Remove from current queue if in learn mode
    if (quizQueue.length > 0) {
      const newQueue = quizQueue.filter(v => v.id !== vocabId);
      if (newQueue.length === 0) {
        setIsQuizComplete(true);
      } else {
        setQuizQueue(newQueue);
        const newIndex = Math.min(currentQuizIndex, newQueue.length - 1);
        setCurrentQuizIndex(newIndex);
        setQuizChoices(generateChoices(newQueue[newIndex]));
        setSelectedChoice(null);
        setShowRating(false);
      }
    }
  }, [saveCollectionData, quizQueue, currentQuizIndex, generateChoices]);

  // Handle pronunciation
  const handlePronounce = useCallback(async (korean: string) => {
    if (!onGenerateAudio || !onPlayAudio || isGeneratingAudio) return;
    
    const selectedChar = characters.find(c => c.id === selectedCharacterId);
    const voiceName = selectedChar?.voiceName || 'Kore';
    
    setIsGeneratingAudio(true);
    try {
      const audioData = await onGenerateAudio(korean, 'slowly and clearly', voiceName);
      if (audioData) {
        await onPlayAudio(audioData, selectedChar?.name);
      }
    } catch (error) {
      console.error('Failed to generate pronunciation:', error);
    } finally {
      setIsGeneratingAudio(false);
    }
  }, [onGenerateAudio, onPlayAudio, characters, selectedCharacterId, isGeneratingAudio]);

  // Handle continue learning after reaching daily goal
  const handleContinueLearning = useCallback(() => {
    const wordsToLearnExtra = learnableVocabulary.slice(0, collectionData.settings.wordsPerDay);
    if (wordsToLearnExtra.length > 0) {
      setQuizQueue(wordsToLearnExtra);
      setCurrentQuizIndex(0);
      setQuizChoices(generateChoices(wordsToLearnExtra[0]));
      setSelectedChoice(null);
      setShowRating(false);
      setIsQuizComplete(false);
      setSessionStats({ total: wordsToLearnExtra.length, correct: 0, incorrect: 0 });
    }
  }, [learnableVocabulary, collectionData.settings.wordsPerDay, generateChoices]);

  // Save settings
  const handleSaveSettings = useCallback(async () => {
    // Use ref to get latest data (avoid stale closure)
    const currentData = collectionDataRef.current;
    
    const newData: CollectionData = {
      ...currentData,
      settings: { 
        wordsPerDay: tempWordsPerDay,
        requestRetention: tempRequestRetention
      }
    };
    await saveCollectionData(newData);
    setShowSettings(false);

    // If currently in Learn tab, rebuild the quiz queue to respect the new daily limit
    if (activeTab === 'learn') {
      const newLimit = Math.max(0, tempWordsPerDay - newData.todayLearnedCount);
      const wordsToLearn = learnableVocabulary.slice(0, newLimit);
      if (wordsToLearn.length > 0) {
        setQuizQueue(wordsToLearn);
        setCurrentQuizIndex(0);
        setQuizChoices(generateChoices(wordsToLearn[0]));
        setSelectedChoice(null);
        setShowRating(false);
        setIsQuizComplete(false);
        setSessionStats({ total: wordsToLearn.length, correct: 0, incorrect: 0 });
      } else {
        // No words to learn under new limit; clear current session
        setQuizQueue([]);
        setCurrentQuizIndex(0);
        setSelectedChoice(null);
        setShowRating(false);
        setIsQuizComplete(false);
        setSessionStats({ total: 0, correct: 0, incorrect: 0 });
      }
    }
  }, [tempWordsPerDay, tempRequestRetention, saveCollectionData, activeTab, learnableVocabulary, generateChoices]);

  // DO NOT auto-start learning/review sessions - let user click button to start
  // This prevents race conditions on reload

  // Render loading
  if (isLoading) {
    return (
      <div className="vocabulary-collection-scene">
        <div className="loading-state">
          <div className="loading-spinner">⏳</div>
          <p>Đang tải dữ liệu...</p>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  // Render error
  if (error) {
    return (
      <div className="vocabulary-collection-scene">
        <div className="error-state">
          <div className="error-icon">❌</div>
          <p>{error}</p>
          <button onClick={onBack}>Quay lại</button>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="vocabulary-collection-scene">
      {/* Header */}
      <div className="collection-header">
        <button className="back-btn" onClick={onBack}>← Quay lại</button>
        <h2>📚 Thu thập từ vựng</h2>
        <button className="settings-btn" onClick={() => setShowSettings(true)}>⚙️</button>
      </div>

      {/* Stats bar */}
      <div className="stats-bar">
        <div className="stat-item">
          <span className="stat-label">Tổng từ</span>
          <span className="stat-value">{allVocabulary.length}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Đã học</span>
          <span className="stat-value">{collectionData.reviews.length}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Hôm nay</span>
          <span className="stat-value">{collectionData.todayLearnedCount}/{collectionData.settings.wordsPerDay}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Cần ôn</span>
          <span className="stat-value">{dueReviews.length}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="collection-tabs">
        <button 
          className={`tab-btn ${activeTab === 'learn' ? 'active' : ''}`}
          onClick={() => setActiveTab('learn')}
        >
          📖 Học mới ({remainingToday})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'review' ? 'active' : ''}`}
          onClick={() => setActiveTab('review')}
        >
          🔄 Ôn tập ({dueReviews.length})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'difficult' ? 'active' : ''}`}
          onClick={() => setActiveTab('difficult')}
        >
          💪 Từ khó ({difficultVocabulary.length})
        </button>
      </div>

      {/* Content */}
      <div className="collection-content">
        {/* Learn Tab */}
        {activeTab === 'learn' && (
          <>
            {learnableVocabulary.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🎉</div>
                <h3>Hoàn thành!</h3>
                <p>Bạn đã học hết tất cả từ vựng có sẵn.</p>
              </div>
            ) : dataLoaded && quizQueue.length > 0 ? (
              isQuizComplete ? (
                <div className="complete-state">
                  <div className="complete-icon">🎉</div>
                  <h3>Hoàn thành phiên học!</h3>
                  <div className="complete-stats">
                    <p>Đã học: <strong>{sessionStats.total}</strong> từ</p>
                    <p>Thành công: <strong className="correct">{sessionStats.correct}</strong></p>
                    <p>Cần luyện: <strong className="incorrect">{sessionStats.incorrect}</strong></p>
                  </div>
                  <div className="complete-actions">
                    {learnableVocabulary.length > 0 && (
                      <button 
                        className="action-btn primary" 
                        onClick={handleContinueLearning}
                      >
                        📖 Tiếp tục học ({collectionData.settings.wordsPerDay} từ)
                      </button>
                    )}
                    <button className="action-btn" onClick={() => setActiveTab('review')}>
                      🔄 Chuyển sang ôn tập
                    </button>
                  </div>
                </div>
              ) : (
                <div className="quiz-container">
                  {/* Progress - show completed/total from session stats */}
                  <div className="quiz-progress">
                    <span>{sessionStats.total - quizQueue.length + 1} / {sessionStats.total}</span>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${((sessionStats.total - quizQueue.length + 1) / sessionStats.total) * 100}%` }} />
                    </div>
                  </div>

                  {/* Question */}
                  <div className="quiz-card">
                    <div className="quiz-word">
                      <span className="korean">{quizQueue[currentQuizIndex].korean}</span>
                      <div className="audio-controls">
                        <button 
                          className="audio-btn"
                          onClick={() => handlePronounce(quizQueue[currentQuizIndex].korean)}
                          disabled={isGeneratingAudio}
                        >
                          {isGeneratingAudio ? '⏳' : '🔊'}
                        </button>
                        <select 
                          value={selectedCharacterId}
                          onChange={(e) => setSelectedCharacterId(e.target.value)}
                          className="character-select"
                        >
                          {characters.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Choices */}
                    <div className="quiz-choices">
                      {quizChoices.map((choice, idx) => {
                        const isCorrect = choice === quizQueue[currentQuizIndex].vietnamese;
                        const isSelected = selectedChoice === choice;
                        let className = 'choice-btn';
                        if (selectedChoice !== null) {
                          if (isCorrect) className += ' correct';
                          else if (isSelected) className += ' incorrect';
                        }
                        
                        return (
                          <button
                            key={idx}
                            className={className}
                            onClick={() => handleChoiceSelect(choice)}
                            disabled={selectedChoice !== null}
                          >
                            {choice}
                          </button>
                        );
                      })}
                    </div>

                    {/* Rating buttons */}
                    {showRating && (
                      <div className="rating-section">
                        <p className="rating-label">Đánh giá độ khó:</p>
                        <div className="rating-buttons">
                          <button className="rating-btn easy" onClick={() => handleQuizRating(4)} disabled={isRating}>
                            😊 Dễ
                            <span className="rating-interval">~{calculateNewCardInterval(4)}d</span>
                          </button>
                          <button className="rating-btn medium" onClick={() => handleQuizRating(3)} disabled={isRating}>
                            🤔 Trung bình
                            <span className="rating-interval">~{calculateNewCardInterval(3)}d</span>
                          </button>
                          <button className="rating-btn hard" onClick={() => handleQuizRating(2)} disabled={isRating}>
                            😓 Khó
                            <span className="rating-interval">~{calculateNewCardInterval(2)}d</span>
                          </button>
                          <button className="rating-btn again" onClick={() => handleQuizRating(1)} disabled={isRating}>
                            😵 Lại
                            <span className="rating-interval">~{calculateNewCardInterval(1)}d</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Skip button */}
                  <button 
                    className="skip-vocab-btn"
                    onClick={() => handleSkipVocab(quizQueue[currentQuizIndex].id)}
                  >
                    ⏭️ Bỏ qua từ này
                  </button>
                </div>
              )
            ) : remainingToday === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">✅</div>
                <h3>Đã đạt mục tiêu hôm nay!</h3>
                <p>Bạn đã học {collectionData.todayLearnedCount} từ hôm nay.</p>
                <p className="hint">Hãy quay lại vào ngày mai hoặc ôn tập những từ đã học.</p>
                <div className="action-buttons">
                  {learnableVocabulary.length > 0 && (
                    <button 
                      className="action-btn primary" 
                      onClick={handleContinueLearning}
                    >
                      📖 Tiếp tục học ({collectionData.settings.wordsPerDay} từ)
                    </button>
                  )}
                  <button className="action-btn" onClick={() => setActiveTab('review')}>
                    🔄 Chuyển sang ôn tập
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📖</div>
                <h3>Bắt đầu học</h3>
                <p>Nhấn nút "Học mới" để bắt đầu phiên học.</p>
                <button className="action-btn primary" onClick={startLearning}>
                  📖 Bắt đầu học ({remainingToday} từ)
                </button>
              </div>
            )}
          </>
        )}

        {/* Review Tab */}
        {activeTab === 'review' && (
          <>
            {dueReviews.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">✨</div>
                <h3>Không có từ cần ôn</h3>
                <p>Bạn đã ôn tập xong tất cả từ đến hạn.</p>
                {remainingToday > 0 && learnableVocabulary.length > 0 && (
                  <button className="action-btn" onClick={() => setActiveTab('learn')}>
                    📖 Học từ mới
                  </button>
                )}
              </div>
            ) : isReviewComplete ? (
              <div className="complete-state">
                <div className="complete-icon">💪</div>
                <h3>Hoàn thành ôn tập!</h3>
                <div className="complete-stats">
                  <p>Đã ôn: <strong>{reviewStats.total}</strong> từ</p>
                  <p>Nhớ: <strong className="correct">{reviewStats.remembered}</strong></p>
                  <p>Quên: <strong className="incorrect">{reviewStats.forgot}</strong></p>
                </div>
                <div className="complete-actions">
                  <button className="action-btn" onClick={startReview}>
                    🔄 Ôn lại
                  </button>
                  {remainingToday > 0 && learnableVocabulary.length > 0 && (
                    <button className="action-btn primary" onClick={() => setActiveTab('learn')}>
                      📖 Học từ mới ({remainingToday})
                    </button>
                  )}
                </div>
              </div>
            ) : reviewQueue.length > 0 ? (
              <div className="quiz-container">
                {/* Progress */}
                <div className="quiz-progress">
                  <span>{currentReviewIndex + 1} / {reviewQueue.length}</span>
                  <div className="progress-bar">
                    <div className="progress-fill review" style={{ width: `${((currentReviewIndex + 1) / reviewQueue.length) * 100}%` }} />
                  </div>
                </div>

                {/* Question */}
                <div className="quiz-card">
                  <div className="quiz-word">
                    <span className="korean">{reviewQueue[currentReviewIndex].vocab.korean}</span>
                    <div className="audio-controls">
                      <button 
                        className="audio-btn"
                        onClick={() => handlePronounce(reviewQueue[currentReviewIndex].vocab.korean)}
                        disabled={isGeneratingAudio}
                      >
                        {isGeneratingAudio ? '⏳' : '🔊'}
                      </button>
                      <select 
                        value={selectedCharacterId}
                        onChange={(e) => setSelectedCharacterId(e.target.value)}
                        className="character-select"
                      >
                        {characters.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Choices */}
                  <div className="quiz-choices">
                    {reviewChoices.map((choice, idx) => {
                      const isCorrect = choice === reviewQueue[currentReviewIndex].vocab.vietnamese;
                      const isSelected = reviewSelectedChoice === choice;
                      let className = 'choice-btn';
                      if (reviewSelectedChoice !== null) {
                        if (isCorrect) className += ' correct';
                        else if (isSelected) className += ' incorrect';
                      }
                      
                      return (
                        <button
                          key={idx}
                          className={className}
                          onClick={() => handleReviewChoiceSelect(choice)}
                          disabled={reviewSelectedChoice !== null}
                        >
                          {choice}
                        </button>
                      );
                    })}
                  </div>

                  {/* Rating buttons */}
                  {showReviewRating && (
                    <div className="rating-section">
                      <p className="rating-label">Bạn nhớ từ này như thế nào?</p>
                      <div className="rating-buttons">
                        <button className="rating-btn easy" onClick={() => handleReviewRating(4)}>
                          🤩 Dễ
                        </button>
                        <button className="rating-btn medium" onClick={() => handleReviewRating(3)}>
                          😊 Trung bình
                        </button>
                        <button className="rating-btn hard" onClick={() => handleReviewRating(2)}>
                          🤔 Khó
                        </button>
                        <button className="rating-btn again" onClick={() => handleReviewRating(1)}>
                          😔 Quên
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🔄</div>
                <h3>Bắt đầu ôn tập</h3>
                <p>Có {dueReviews.length} từ cần ôn hôm nay.</p>
                <button className="action-btn primary" onClick={startReview}>
                  🔄 Bắt đầu ôn tập ({dueReviews.length} từ)
                </button>
              </div>
            )}
          </>
        )}

        {/* Difficult Tab */}
        {activeTab === 'difficult' && (
          <>
            {difficultVocabulary.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">✨</div>
                <h3>Không có từ khó</h3>
                <p>Bạn chưa có từ nào được đánh dấu "Khó" hoặc "Lại" hôm nay.</p>
                <p className="hint">Hãy học hoặc ôn tập trước, những từ khó sẽ xuất hiện ở đây!</p>
              </div>
            ) : isDifficultComplete ? (
              <div className="complete-state">
                <div className="complete-icon">💪</div>
                <h3>Hoàn thành luyện từ khó!</h3>
                <div className="complete-stats">
                  <p>Đã luyện: <strong>{difficultStats.practiced}</strong> từ</p>
                </div>
                <button className="action-btn" onClick={startDifficult}>
                  🔄 Luyện lại
                </button>
              </div>
            ) : difficultQueue.length > 0 ? (
              <div className="quiz-container">
                {/* Progress */}
                <div className="quiz-progress">
                  <span>{currentDifficultIndex + 1} / {difficultQueue.length}</span>
                  <div className="progress-bar">
                    <div className="progress-fill difficult" style={{ width: `${((currentDifficultIndex + 1) / difficultQueue.length) * 100}%` }} />
                  </div>
                </div>

                {/* Question */}
                <div className="quiz-card">
                  <div className="difficult-badge">
                    {difficultQueue[currentDifficultIndex].rating === 1 ? '😔 Quên' : '🤔 Khó'}
                  </div>
                  
                  <div className="quiz-word">
                    <span className="korean">{difficultQueue[currentDifficultIndex].vocab.korean}</span>
                    <div className="audio-controls">
                      <button 
                        className="audio-btn"
                        onClick={() => handlePronounce(difficultQueue[currentDifficultIndex].vocab.korean)}
                        disabled={isGeneratingAudio}
                      >
                        {isGeneratingAudio ? '⏳' : '🔊'}
                      </button>
                      <select 
                        value={selectedCharacterId}
                        onChange={(e) => setSelectedCharacterId(e.target.value)}
                        className="character-select"
                      >
                        {characters.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Choices */}
                  <div className="quiz-choices">
                    {difficultChoices.map((choice, idx) => {
                      const isCorrect = choice === difficultQueue[currentDifficultIndex].vocab.vietnamese;
                      const isSelected = difficultSelectedChoice === choice;
                      let className = 'choice-btn';
                      if (difficultSelectedChoice !== null) {
                        if (isCorrect) className += ' correct';
                        else if (isSelected) className += ' incorrect';
                      }
                      
                      return (
                        <button
                          key={idx}
                          className={className}
                          onClick={() => handleDifficultChoiceSelect(choice)}
                          disabled={difficultSelectedChoice !== null}
                        >
                          {choice}
                        </button>
                      );
                    })}
                  </div>

                  {/* Answer and actions */}
                  {showDifficultAnswer && (
                    <div className="difficult-actions">
                      <div className="answer-reveal">
                        <span className="answer-label">Đáp án:</span>
                        <span className="answer-text">{difficultQueue[currentDifficultIndex].vocab.vietnamese}</span>
                      </div>
                      <div className="difficult-buttons">
                        <button className="action-btn forgot" onClick={handleDifficultForgot}>
                          😔 Quên
                        </button>
                        <button className="action-btn remember" onClick={handleDifficultRemember}>
                          😊 Nhớ
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">💪</div>
                <h3>Bắt đầu luyện từ khó</h3>
                <p>Có {difficultVocabulary.length} từ khó cần luyện thêm.</p>
                <button className="action-btn primary" onClick={startDifficult}>
                  💪 Bắt đầu luyện ({difficultVocabulary.length} từ)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>⚙️ Cài đặt</h3>
              <button className="close-btn" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="setting-item">
                <label>Số từ học mỗi ngày:</label>
                <div className="slider-container">
                  <input 
                    type="range" 
                    min="10" 
                    max="200" 
                    step="10"
                    value={tempWordsPerDay}
                    onChange={(e) => setTempWordsPerDay(Number(e.target.value))}
                  />
                  <span className="slider-value">{tempWordsPerDay}</span>
                </div>
              </div>
              <div className="setting-item">
                <label>Tỉ lệ ghi nhớ mong muốn (FSRS):</label>
                <div className="slider-container">
                  <input 
                    type="range" 
                    min="0.70" 
                    max="0.97" 
                    step="0.01"
                    value={tempRequestRetention}
                    onChange={(e) => setTempRequestRetention(Number(e.target.value))}
                  />
                  <span className="slider-value">{Math.round(tempRequestRetention * 100)}%</span>
                </div>
                <p className="setting-hint">
                  {tempRequestRetention >= 0.95 ? '⚠️ Rất cao - ôn tập thường xuyên hơn' :
                   tempRequestRetention >= 0.90 ? '✅ Khuyến nghị - cân bằng tốt' :
                   tempRequestRetention >= 0.80 ? '📚 Trung bình - ít ôn tập hơn' :
                   '⚡ Thấp - khoảng cách ôn tập xa'}
                </p>
              </div>
              <div className="setting-info">
                <p>📊 Đã bỏ qua: {collectionData.skippedIds.length} từ</p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setShowSettings(false)}>Hủy</button>
              <button className="save-btn" onClick={handleSaveSettings}>Lưu</button>
            </div>
          </div>
        </div>
      )}

      <style>{styles}</style>
    </div>
  );
};

const styles = `
.vocabulary-collection-scene {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  color: #fff;
}

.collection-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.collection-header h2 {
  margin: 0;
  font-size: 1.2rem;
}

.back-btn, .settings-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #fff;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
}

.back-btn:hover, .settings-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.stats-bar {
  display: flex;
  justify-content: space-around;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-label {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
}

.stat-value {
  font-size: 1.1rem;
  font-weight: bold;
  color: #4ade80;
}

.collection-tabs {
  display: flex;
  padding: 12px;
  gap: 8px;
  background: rgba(255, 255, 255, 0.02);
}

.tab-btn {
  flex: 1;
  padding: 12px 8px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.tab-btn:hover:not(.active) {
  background: rgba(255, 255, 255, 0.15);
}

.collection-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.empty-state, .loading-state, .error-state, .complete-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  gap: 16px;
}

.empty-icon, .loading-spinner, .error-icon, .complete-icon {
  font-size: 4rem;
}

.empty-state h3, .complete-state h3 {
  margin: 0;
  color: #fff;
}

.empty-state p, .complete-state p {
  margin: 0;
  color: rgba(255, 255, 255, 0.7);
}

.hint {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.5);
}

.complete-stats {
  background: rgba(255, 255, 255, 0.1);
  padding: 16px 24px;
  border-radius: 12px;
}

.complete-stats p {
  margin: 8px 0;
}

.complete-stats .correct {
  color: #4ade80;
}

.complete-stats .incorrect {
  color: #f87171;
}

.complete-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}

.action-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.action-btn.primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.action-btn.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}

.action-buttons .action-btn {
  flex: 1;
}

.quiz-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.quiz-progress {
  display: flex;
  align-items: center;
  gap: 12px;
}

.quiz-progress span {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.7);
  min-width: 60px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4ade80, #22c55e);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-fill.review {
  background: linear-gradient(90deg, #60a5fa, #3b82f6);
}

.progress-fill.difficult {
  background: linear-gradient(90deg, #f97316, #ea580c);
}

.quiz-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 24px;
  position: relative;
}

.quiz-word {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.quiz-word .korean {
  font-size: 2.5rem;
  font-weight: bold;
  color: #fff;
}

.audio-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.audio-btn {
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 1.2rem;
  cursor: pointer;
  transition: all 0.2s;
}

.audio-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

.audio-btn:disabled {
  opacity: 0.5;
}

.character-select {
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 0.9rem;
}

/* Ensure dropdown options are readable on light list background */
.character-select option {
  color: #111827; /* gray-800 */
  background: #ffffff;
}

.quiz-choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.choice-btn {
  padding: 16px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.choice-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
}

.choice-btn.correct {
  background: rgba(74, 222, 128, 0.2);
  border-color: #4ade80;
}

.choice-btn.incorrect {
  background: rgba(248, 113, 113, 0.2);
  border-color: #f87171;
}

.choice-btn:disabled {
  cursor: default;
}

.rating-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.rating-label {
  text-align: center;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 16px;
}

.rating-buttons {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.rating-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  border: none;
  border-radius: 8px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.rating-btn .rating-interval {
  font-size: 0.7rem;
  opacity: 0.7;
}

.rating-btn.easy {
  background: linear-gradient(135deg, #4ade80, #22c55e);
  color: #fff;
}

.rating-btn.medium {
  background: linear-gradient(135deg, #60a5fa, #3b82f6);
  color: #fff;
}

.rating-btn.hard {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #000;
}

.rating-btn.again {
  background: linear-gradient(135deg, #f87171, #ef4444);
  color: #fff;
}

.rating-btn:hover {
  transform: translateY(-2px);
}

.skip-vocab-btn {
  align-self: center;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.9rem;
  cursor: pointer;
}

.skip-vocab-btn:hover {
  color: rgba(255, 255, 255, 0.8);
}

.difficult-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 4px 12px;
  border-radius: 20px;
  background: linear-gradient(135deg, #f97316, #ea580c);
  font-size: 0.8rem;
}

.difficult-actions {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.answer-reveal {
  text-align: center;
  margin-bottom: 16px;
}

.answer-label {
  color: rgba(255, 255, 255, 0.6);
  margin-right: 8px;
}

.answer-text {
  font-size: 1.2rem;
  font-weight: bold;
  color: #4ade80;
}

.difficult-buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.difficult-buttons .action-btn {
  flex: 1;
  max-width: 150px;
}

.difficult-buttons .action-btn.forgot {
  background: linear-gradient(135deg, #f87171, #ef4444);
}

.difficult-buttons .action-btn.remember {
  background: linear-gradient(135deg, #4ade80, #22c55e);
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal-content {
  background: #1e293b;
  border-radius: 16px;
  width: 100%;
  max-width: 400px;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-header h3 {
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  font-size: 1.2rem;
  cursor: pointer;
}

.modal-body {
  padding: 24px 16px;
}

.setting-item {
  margin-bottom: 20px;
}

.setting-item label {
  display: block;
  margin-bottom: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.slider-container {
  display: flex;
  align-items: center;
  gap: 16px;
}

.slider-container input[type="range"] {
  flex: 1;
  height: 8px;
  -webkit-appearance: none;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.slider-container input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  background: #667eea;
  border-radius: 50%;
  cursor: pointer;
}

.slider-value {
  min-width: 40px;
  text-align: center;
  font-weight: bold;
  color: #4ade80;
}

.setting-info {
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.setting-info p {
  margin: 0;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.9rem;
}

.setting-hint {
  margin: 8px 0 0 0;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.5);
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-footer button {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
}

.cancel-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.save-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

@media (max-width: 480px) {
  .rating-buttons {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .quiz-word .korean {
    font-size: 2rem;
  }
  
  .collection-header h2 {
    font-size: 1rem;
  }
}
`;

export default VocabularyCollectionScene;
