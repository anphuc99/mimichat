import type { VocabularyReview, VocabularyItem, DailyChat, Message, FSRSRating, FSRSSettings } from '../types';
import { DEFAULT_FSRS_SETTINGS } from '../types';
import { fsrs, createEmptyCard, Rating, State, type Card, type Grade, type FSRS } from 'ts-fsrs';

// ============================================================================
// FSRS (Free Spaced Repetition Scheduler) Algorithm Implementation
// Using ts-fsrs library for accurate calculations
// ============================================================================

// Create FSRS instance with default parameters
const f: FSRS = fsrs();

/**
 * Map our 3-level rating to ts-fsrs Rating
 * Our: 1=Again, 2=Hard, 3=Good
 * ts-fsrs: Again=1, Hard=2, Good=3, Easy=4
 */
function mapRatingToTsFsrs(rating: FSRSRating): Grade {
  switch (rating) {
    case 1: return Rating.Again;
    case 2: return Rating.Hard;
    case 3: return Rating.Good;
    default: return Rating.Good;
  }
}

/**
 * Convert VocabularyReview to ts-fsrs Card format
 */
function reviewToCard(review: VocabularyReview): Card {
  const isNew = review.stability === undefined || review.stability === 0;
  
  if (isNew) {
    return createEmptyCard();
  }
  
  return {
    due: new Date(review.nextReviewDate),
    stability: review.stability || 0,
    difficulty: review.difficulty || 0,
    elapsed_days: review.lastReviewDate 
      ? Math.max(0, (Date.now() - new Date(review.lastReviewDate).getTime()) / (1000 * 60 * 60 * 24))
      : 0,
    scheduled_days: review.currentIntervalDays || 0,
    reps: review.reviewHistory.length,
    lapses: review.lapses || 0,
    state: isNew ? State.New : (review.lapses && review.lapses > 0 ? State.Relearning : State.Review),
    last_review: review.lastReviewDate ? new Date(review.lastReviewDate) : undefined
  };
}

/**
 * Calculate retrievability (probability of recall) based on stability and elapsed time
 * Using ts-fsrs formula
 */
export function calculateRetrievability(stability: number, elapsedDays: number): number {
  if (stability <= 0) return 0;
  // FSRS formula: R = (1 + FACTOR * t / S) ^ DECAY
  // where FACTOR ≈ 19/81, DECAY = -0.5
  const DECAY = -0.5;
  const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;
  return Math.pow(1 + FACTOR * elapsedDays / stability, DECAY);
}

/**
 * @deprecated Kept for backward compatibility - ts-fsrs handles this internally
 */
export function getInitialStability(rating: FSRSRating): number {
  const card = createEmptyCard();
  const result = f.repeat(card, new Date())[mapRatingToTsFsrs(rating)].card;
  return result.stability;
}

/**
 * @deprecated Kept for backward compatibility - ts-fsrs handles this internally
 */
export function getInitialDifficulty(rating: FSRSRating): number {
  const card = createEmptyCard();
  const result = f.repeat(card, new Date())[mapRatingToTsFsrs(rating)].card;
  return result.difficulty;
}

/**
 * @deprecated Kept for backward compatibility - ts-fsrs handles this internally
 */
export function updateDifficulty(currentDifficulty: number, rating: FSRSRating): number {
  // This is now handled by ts-fsrs internally
  return currentDifficulty;
}

/**
 * @deprecated Kept for backward compatibility - ts-fsrs handles this internally
 */
export function calculateNextStabilitySuccess(
  difficulty: number,
  stability: number,
  retrievability: number,
  rating: FSRSRating
): number {
  // This is now handled by ts-fsrs internally
  return stability;
}

/**
 * @deprecated Kept for backward compatibility - ts-fsrs handles this internally
 */
export function calculateNextStabilityFail(
  difficulty: number,
  stability: number,
  retrievability: number
): number {
  // This is now handled by ts-fsrs internally
  return stability;
}

/**
 * @deprecated Kept for backward compatibility - ts-fsrs handles this internally
 */
export function calculateIntervalFromStability(stability: number, desiredRetention: number = 0.9): number {
  // ts-fsrs uses this formula internally
  const interval = (9 * stability) * (1 / desiredRetention - 1);
  return Math.max(1, Math.round(interval));
}

/**
 * @deprecated Kept for backward compatibility - ts-fsrs handles this internally
 */
export function applyFuzzFactor(interval: number): number {
  // ts-fsrs handles fuzz internally
  return interval;
}

/**
 * Main FSRS update function - call after a review
 * Uses ts-fsrs library for accurate calculations
 * Returns updated VocabularyReview with new stability, difficulty, and nextReviewDate
 */
export function updateFSRSAfterReview(
  review: VocabularyReview,
  rating: FSRSRating,
  settings: FSRSSettings = DEFAULT_FSRS_SETTINGS
): VocabularyReview {
  const now = new Date();
  
  // Convert to ts-fsrs Card format
  const card = reviewToCard(review);
  
  // Get scheduling options for all ratings
  const schedulingCards = f.repeat(card, now);
  
  // Get the result for the selected rating
  const tsFsrsRating = mapRatingToTsFsrs(rating);
  const result = schedulingCards[tsFsrsRating];
  const newCard = result.card;
  
  // Calculate retrievability before this review
  const lastReviewDate = review.lastReviewDate ? new Date(review.lastReviewDate) : now;
  const elapsedDays = Math.max(0, (now.getTime() - lastReviewDate.getTime()) / (1000 * 60 * 60 * 24));
  const retrievability = review.stability && review.stability > 0 
    ? calculateRetrievability(review.stability, elapsedDays) 
    : 1;
  
  // Create history entry
  const historyEntry = {
    date: now.toISOString(),
    correctCount: rating >= 2 ? 1 : 0,
    incorrectCount: rating === 1 ? 1 : 0,
    intervalBefore: review.currentIntervalDays,
    intervalAfter: newCard.scheduled_days,
    rating,
    stabilityBefore: review.stability || 0,
    stabilityAfter: newCard.stability,
    difficultyBefore: review.difficulty || 5,
    difficultyAfter: newCard.difficulty,
    retrievability
  };
  
  return {
    ...review,
    currentIntervalDays: newCard.scheduled_days,
    nextReviewDate: newCard.due.toISOString(),
    lastReviewDate: now.toISOString(),
    reviewHistory: [...review.reviewHistory, historyEntry],
    stability: newCard.stability,
    difficulty: newCard.difficulty,
    lapses: newCard.lapses
  };
}

/**
 * Balance review load across days to avoid pile-ups
 * Redistributes reviews that exceed maxPerDay to subsequent days
 */
export function balanceReviewLoad(
  reviews: VocabularyReview[],
  maxPerDay: number = 50
): VocabularyReview[] {
  // Group by date
  const reviewsByDate = new Map<string, VocabularyReview[]>();
  
  for (const review of reviews) {
    const dateStr = review.nextReviewDate.split('T')[0];
    if (!reviewsByDate.has(dateStr)) {
      reviewsByDate.set(dateStr, []);
    }
    reviewsByDate.get(dateStr)!.push(review);
  }
  
  // Sort dates
  const sortedDates = Array.from(reviewsByDate.keys()).sort();
  const result: VocabularyReview[] = [];
  const overflow: VocabularyReview[] = [];
  
  for (const dateStr of sortedDates) {
    const dayReviews = [...(reviewsByDate.get(dateStr) || []), ...overflow.splice(0, overflow.length)];
    
    // Sort by stability (lower stability = more urgent)
    dayReviews.sort((a, b) => (a.stability || 0) - (b.stability || 0));
    
    // Take up to maxPerDay, push rest to overflow
    const taken = dayReviews.slice(0, maxPerDay);
    const excess = dayReviews.slice(maxPerDay);
    
    result.push(...taken);
    
    // Push excess to next day
    for (const review of excess) {
      const nextDate = new Date(dateStr);
      nextDate.setDate(nextDate.getDate() + 1);
      overflow.push({
        ...review,
        nextReviewDate: nextDate.toISOString()
      });
    }
  }
  
  // Handle any remaining overflow
  let currentDate = sortedDates.length > 0 
    ? new Date(sortedDates[sortedDates.length - 1])
    : new Date();
  
  while (overflow.length > 0) {
    currentDate.setDate(currentDate.getDate() + 1);
    const batch = overflow.splice(0, maxPerDay);
    for (const review of batch) {
      result.push({
        ...review,
        nextReviewDate: currentDate.toISOString()
      });
    }
  }
  
  return result;
}

/**
 * Migrate legacy review to FSRS format
 * Estimates stability from currentIntervalDays and difficulty from history
 */
export function migrateLegacyToFSRS(review: VocabularyReview): VocabularyReview {
  if (review.stability !== undefined && review.difficulty !== undefined) {
    // Already migrated
    return review;
  }
  
  // Estimate stability from current interval
  const stability = Math.max(1, review.currentIntervalDays || 1);
  
  // Estimate difficulty from review history
  let totalIncorrect = 0;
  let totalCorrect = 0;
  for (const h of review.reviewHistory) {
    totalIncorrect += h.incorrectCount;
    totalCorrect += h.correctCount;
  }
  
  const total = totalCorrect + totalIncorrect;
  const successRate = total > 0 ? totalCorrect / total : 0.5;
  // Map success rate to difficulty: 100% -> 1, 50% -> 5.5, 0% -> 10
  const difficulty = Math.max(1, Math.min(10, 10 - successRate * 9));
  
  // Count lapses from history
  const lapses = review.reviewHistory.filter(h => h.incorrectCount > 0).length;
  
  return {
    ...review,
    stability,
    difficulty,
    lapses
  };
}

// ============================================================================
// Legacy functions (kept for backward compatibility)
// ============================================================================

/**
 * @deprecated Use FSRS functions instead
 * Calculate next interval based on current interval and incorrect count
 */
export function calculateNextInterval(currentInterval: number, incorrectCount: number): number {
  let baseInterval: number;
  
  if (currentInterval === 0) {
    baseInterval = 4;
  } else {
    baseInterval = currentInterval * 2;
  }
  
  const actualInterval = baseInterval - incorrectCount;
  return Math.max(1, actualInterval);
}

/**
 * @deprecated Use FSRS functions instead
 * Initialize a new VocabularyReview when vocabulary is first created
 */
export function initializeVocabularyReview(
  vocab: VocabularyItem,
  dailyChatId: string
): VocabularyReview {
  const today = new Date();
  const firstReviewDate = new Date(today);
  firstReviewDate.setDate(today.getDate() + 1);
  
  return {
    vocabularyId: vocab.id,
    dailyChatId: dailyChatId,
    currentIntervalDays: 0,
    nextReviewDate: firstReviewDate.toISOString(),
    lastReviewDate: null,
    reviewHistory: [],
    // FSRS initial values (will be set on first review)
    stability: 0,
    difficulty: 5, // Default medium difficulty
    lapses: 0
  };
}

/**
 * Initialize a new VocabularyReview with FSRS support
 */
export function initializeFSRSReview(
  vocab: VocabularyItem,
  dailyChatId: string
): VocabularyReview {
  const today = new Date();
  const firstReviewDate = new Date(today);
  firstReviewDate.setDate(today.getDate() + 1); // First review tomorrow
  
  return {
    vocabularyId: vocab.id,
    dailyChatId: dailyChatId,
    currentIntervalDays: 1,
    nextReviewDate: firstReviewDate.toISOString(),
    lastReviewDate: null,
    reviewHistory: [],
    // FSRS initial values
    stability: 0, // Will be set on first actual review
    difficulty: 5, // Default medium difficulty
    lapses: 0
  };
}

/**
 * @deprecated Use updateFSRSAfterReview instead
 * Update review schedule after completing a quiz
 */
export function updateReviewAfterQuiz(
  review: VocabularyReview,
  correctCount: number,
  incorrectCount: number
): VocabularyReview {
  const now = new Date();
  const intervalBefore = review.currentIntervalDays;
  
  let nextInterval: number;
  if (intervalBefore === 0) {
    nextInterval = 1;
  } else {
    nextInterval = calculateNextInterval(intervalBefore, incorrectCount);
  }
  
  const nextReviewDate = new Date(now);
  nextReviewDate.setDate(now.getDate() + nextInterval);
  
  const newHistoryEntry = {
    date: now.toISOString(),
    correctCount,
    incorrectCount,
    intervalBefore,
    intervalAfter: nextInterval
  };
  
  return {
    ...review,
    currentIntervalDays: nextInterval,
    nextReviewDate: nextReviewDate.toISOString(),
    lastReviewDate: now.toISOString(),
    reviewHistory: [...review.reviewHistory, newHistoryEntry]
  };
}

/**
 * Helper to get Vietnam date string (YYYY-MM-DD)
 */
function getVietnamDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

/**
 * Get all vocabularies that are due for review today or earlier
 * Maximum 20 words to avoid overwhelming the user
 * @param excludeVocabularyIds - vocabulary IDs to exclude (e.g., words already in pending chat review)
 */
export function getVocabulariesDueForReview(
  journal: DailyChat[],
  excludeVocabularyIds: string[] = []
): {
  vocabulary: VocabularyItem;
  review: VocabularyReview;
  dailyChat: DailyChat;
  messages: Message[];
}[] {
  const todayStr = getVietnamDateString(new Date());
  const excludeSet = new Set(excludeVocabularyIds);
  
  const dueVocabularies: {
    vocabulary: VocabularyItem;
    review: VocabularyReview;
    dailyChat: DailyChat;
    messages: Message[];
  }[] = [];
  
  for (const dailyChat of journal) {
    if (!dailyChat.reviewSchedule || !dailyChat.vocabularies) continue;
    
    for (const review of dailyChat.reviewSchedule) {
      // Skip if this vocabulary is in the exclude list
      if (excludeSet.has(review.vocabularyId)) continue;
      
      const nextReviewDate = new Date(review.nextReviewDate);
      const nextReviewDateStr = getVietnamDateString(nextReviewDate);
      
      // Check if due (today or earlier)
      if (nextReviewDateStr <= todayStr) {
        const vocabulary = dailyChat.vocabularies.find(v => v.id === review.vocabularyId);
        
        if (vocabulary) {
          dueVocabularies.push({
            vocabulary,
            review,
            dailyChat,
            messages: dailyChat.messages
          });
        }
      }
    }
  }
  
  // Sort by stability (lower = more urgent) instead of totalReviews, limit to 1000 words
  return dueVocabularies.sort((a, b) => (a.review.stability || 0) - (b.review.stability || 0)).slice(0, 1000);
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

/**
 * Get count of vocabularies due for review
 */
export function getReviewDueCount(journal: DailyChat[]): number {
  return getVocabulariesDueForReview(journal).length;
}

/**
 * Get all vocabularies with their review schedule (for statistics)
 */
export function getAllReviewStatistics(journal: DailyChat[]): {
  total: number;
  dueToday: number;
  upcoming: number;
  averageInterval: number;
} {
  const allReviews: VocabularyReview[] = [];
  
  for (const dailyChat of journal) {
    if (dailyChat.reviewSchedule) {
      allReviews.push(...dailyChat.reviewSchedule);
    }
  }
  
  const dueToday = getReviewDueCount(journal);
  const todayStr = getVietnamDateString(new Date());
  
  const upcoming = allReviews.filter(review => {
    const nextDateStr = getVietnamDateString(new Date(review.nextReviewDate));
    return nextDateStr > todayStr;
  }).length;
  
  const totalInterval = allReviews.reduce((sum, review) => sum + review.currentIntervalDays, 0);
  const averageInterval = allReviews.length > 0 ? totalInterval / allReviews.length : 0;
  
  return {
    total: allReviews.length,
    dueToday,
    upcoming,
    averageInterval: Math.round(averageInterval * 10) / 10
  };
}

/**
 * Get comprehensive vocabulary learning statistics
 * - totalLearned: Total vocabularies that have been added to learning (have reviewSchedule)
 * - totalReviewed: Vocabularies that have been reviewed at least once
 * - mastered: Vocabularies with stability >= 30 days (considered mastered)
 * - inProgress: Vocabularies being learned but not yet mastered
 * - newToday: Vocabularies added today
 */
export function getVocabularyLearningStats(journal: DailyChat[]): {
  totalLearned: number;
  totalReviewed: number;
  mastered: number;
  inProgress: number;
  newToday: number;
  totalReviewSessions: number;
  averageStability: number;
  averageDifficulty: number;
} {
  const todayStr = getVietnamDateString(new Date());
  
  let totalLearned = 0;
  let totalReviewed = 0;
  let mastered = 0;
  let inProgress = 0;
  let newToday = 0;
  let totalReviewSessions = 0;
  let totalStability = 0;
  let totalDifficulty = 0;
  let countWithFSRS = 0;
  
  for (const dailyChat of journal) {
    if (!dailyChat.reviewSchedule) continue;
    
    for (const review of dailyChat.reviewSchedule) {
      totalLearned++;
      totalReviewSessions += review.reviewHistory.length;
      
      // FSRS stats
      if (review.stability !== undefined && review.stability > 0) {
        totalStability += review.stability;
        totalDifficulty += review.difficulty || 5;
        countWithFSRS++;
      }
      
      // Check if reviewed at least once
      if (review.reviewHistory.length > 0) {
        totalReviewed++;
      }
      
      // Check if mastered (stability >= 30 days for FSRS, or currentIntervalDays >= 30 for legacy)
      const effectiveStability = review.stability || review.currentIntervalDays;
      if (effectiveStability >= 30) {
        mastered++;
      } else {
        inProgress++;
      }
      
      // Check if added today (no review yet and nextReviewDate is tomorrow or today)
      if (review.lastReviewDate === null) {
        const nextDate = new Date(review.nextReviewDate);
        const nextDateStr = getVietnamDateString(nextDate);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = getVietnamDateString(tomorrow);
        
        if (nextDateStr === tomorrowStr || nextDateStr === todayStr) {
          newToday++;
        }
      }
    }
  }
  
  return {
    totalLearned,
    totalReviewed,
    mastered,
    inProgress,
    newToday,
    totalReviewSessions,
    averageStability: countWithFSRS > 0 ? Math.round(totalStability / countWithFSRS * 10) / 10 : 0,
    averageDifficulty: countWithFSRS > 0 ? Math.round(totalDifficulty / countWithFSRS * 10) / 10 : 5
  };
}

/**
 * Get count of total vocabularies learned (simplified version)
 */
export function getTotalVocabulariesLearned(journal: DailyChat[]): number {
  let count = 0;
  for (const dailyChat of journal) {
    if (dailyChat.reviewSchedule) {
      count += dailyChat.reviewSchedule.length;
    }
  }
  return count;
}

/**
 * Get vocabularies due for Memory Card review with FSRS
 * Respects maxReviewsPerDay limit from settings
 */
export function getVocabulariesDueForMemoryReview(
  journal: DailyChat[],
  settings: FSRSSettings = DEFAULT_FSRS_SETTINGS
): {
  vocabulary: VocabularyItem;
  review: VocabularyReview;
  dailyChat: DailyChat;
  memory?: import('../types').VocabularyMemoryEntry;
}[] {
  const todayStr = getVietnamDateString(new Date());
  
  const dueVocabularies: {
    vocabulary: VocabularyItem;
    review: VocabularyReview;
    dailyChat: DailyChat;
    memory?: import('../types').VocabularyMemoryEntry;
  }[] = [];
  
  for (const dailyChat of journal) {
    if (!dailyChat.reviewSchedule || !dailyChat.vocabularies) continue;
    
    for (const review of dailyChat.reviewSchedule) {
      const nextReviewDate = new Date(review.nextReviewDate);
      const nextReviewDateStr = getVietnamDateString(nextReviewDate);
      
      // Check if due (today or earlier)
      if (nextReviewDateStr <= todayStr) {
        const vocabulary = dailyChat.vocabularies.find(v => v.id === review.vocabularyId);
        
        if (vocabulary) {
          // Find associated memory if exists
          const memory = dailyChat.vocabularyMemories?.find(m => m.vocabularyId === vocabulary.id);
          
          dueVocabularies.push({
            vocabulary,
            review: migrateLegacyToFSRS(review), // Ensure FSRS fields exist
            dailyChat,
            memory
          });
        }
      }
    }
  }
  
  // Sort by stability (lower = more urgent)
  dueVocabularies.sort((a, b) => (a.review.stability || 0) - (b.review.stability || 0));
  
  // Apply maxReviewsPerDay limit
  return dueVocabularies.slice(0, settings.maxReviewsPerDay);
}

/**
 * Find vocabulary and its memory entry by vocabularyId across all journals
 */
export function findVocabularyWithMemory(
  journal: DailyChat[],
  vocabularyId: string
): {
  vocabulary: VocabularyItem;
  review?: VocabularyReview;
  dailyChat: DailyChat;
  memory?: import('../types').VocabularyMemoryEntry;
} | null {
  for (const dailyChat of journal) {
    const vocabulary = dailyChat.vocabularies?.find(v => v.id === vocabularyId);
    if (vocabulary) {
      const review = dailyChat.reviewSchedule?.find(r => r.vocabularyId === vocabularyId);
      const memory = dailyChat.vocabularyMemories?.find(m => m.vocabularyId === vocabularyId);
      return { vocabulary, review, dailyChat, memory };
    }
  }
  return null;
}

/**
 * Get all vocabularies with their memories for browsing/learning
 */
export function getAllVocabulariesWithMemories(
  journal: DailyChat[]
): {
  vocabulary: VocabularyItem;
  review?: VocabularyReview;
  dailyChat: DailyChat;
  memory?: import('../types').VocabularyMemoryEntry;
}[] {
  const result: {
    vocabulary: VocabularyItem;
    review?: VocabularyReview;
    dailyChat: DailyChat;
    memory?: import('../types').VocabularyMemoryEntry;
  }[] = [];
  
  for (const dailyChat of journal) {
    if (!dailyChat.vocabularies) continue;
    
    for (const vocabulary of dailyChat.vocabularies) {
      const review = dailyChat.reviewSchedule?.find(r => r.vocabularyId === vocabulary.id);
      const memory = dailyChat.vocabularyMemories?.find(m => m.vocabularyId === vocabulary.id);
      
      result.push({ vocabulary, review, dailyChat, memory });
    }
  }
  
  return result;
}
