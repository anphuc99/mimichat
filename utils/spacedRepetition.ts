import type { VocabularyReview, VocabularyItem, DailyChat, Message, FSRSRating, FSRSSettings } from '../types';
import { FSRS_PARAMS, DEFAULT_FSRS_SETTINGS } from '../types';

// ============================================================================
// FSRS (Free Spaced Repetition Scheduler) Algorithm Implementation
// Based on: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
// ============================================================================

const { w, DECAY, FACTOR } = FSRS_PARAMS;

/**
 * Calculate retrievability (probability of recall) based on stability and elapsed time
 * Formula: R(t, S) = (1 + FACTOR * t / S) ^ DECAY
 * When t = S, R ≈ 0.9 (90% retention)
 */
export function calculateRetrievability(stability: number, elapsedDays: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + FACTOR * elapsedDays / stability, DECAY);
}

/**
 * Calculate initial stability based on first rating
 * S0(G) = w[G-1] for G = 1,2,3,4
 * We use G = 1,2,3 so: S0(1)=w[0], S0(2)=w[1], S0(3)=w[2]
 */
export function getInitialStability(rating: FSRSRating): number {
  // Map our 3-level rating to FSRS 4-level: 1->1, 2->2, 3->3 (skip Easy=4)
  return w[rating - 1];
}

/**
 * Calculate initial difficulty based on first rating
 * D0(G) = w[4] - (G - 3) * w[5]
 * Clamped to [1, 10]
 */
export function getInitialDifficulty(rating: FSRSRating): number {
  const d = w[4] - (rating - 3) * w[5];
  return Math.min(10, Math.max(1, d));
}

/**
 * Update difficulty after a review
 * D'(D, G) = w[7] * D0(3) + (1 - w[7]) * (D - w[6] * (G - 3))
 * This includes mean reversion to avoid "ease hell"
 */
export function updateDifficulty(currentDifficulty: number, rating: FSRSRating): number {
  const d0 = w[4]; // D0(3) = w[4] - 0 = w[4]
  const newD = w[7] * d0 + (1 - w[7]) * (currentDifficulty - w[6] * (rating - 3));
  return Math.min(10, Math.max(1, newD));
}

/**
 * Calculate next stability after a successful review (rating >= 2: Hard, Good)
 * S'_r(D, S, R, G) = S * (e^w[8] * (11-D)^(-w[9]) * S^(-w[10]) * (e^(w[10]*(1-R)) - 1) * w[15]^[G=2] * w[16]^[G=4] + 1)
 * 
 * For our 3-level system:
 * - Rating 2 (Hard): apply w[15] penalty
 * - Rating 3 (Good): no bonus/penalty
 */
export function calculateNextStabilitySuccess(
  difficulty: number,
  stability: number,
  retrievability: number,
  rating: FSRSRating
): number {
  const hardPenalty = rating === 2 ? w[15] : 1;
  // We don't have "Easy" rating, so no w[16] bonus
  
  const factor = Math.exp(w[8]) *
    Math.pow(11 - difficulty, -w[9]) *
    Math.pow(stability, -w[10]) *
    (Math.exp(w[10] * (1 - retrievability)) - 1) *
    hardPenalty;
  
  return stability * (factor + 1);
}

/**
 * Calculate next stability after forgetting (rating = 1: Again)
 * S'_f(D, S, R) = w[11] * D^(-w[12]) * ((S+1)^w[13] - 1) * e^(w[14]*(1-R))
 */
export function calculateNextStabilityFail(
  difficulty: number,
  stability: number,
  retrievability: number
): number {
  return w[11] *
    Math.pow(difficulty, -w[12]) *
    (Math.pow(stability + 1, w[13]) - 1) *
    Math.exp(w[14] * (1 - retrievability));
}

/**
 * Calculate next interval from desired retention and stability
 * I(r, S) = 9 * S * (1/r - 1)
 * When r = 0.9, I = S (interval equals stability)
 */
export function calculateIntervalFromStability(stability: number, desiredRetention: number = 0.9): number {
  const interval = (9 * stability) * (1 / desiredRetention - 1);
  return Math.max(1, Math.round(interval));
}

/**
 * Apply fuzz factor to interval to avoid review pile-ups
 * Adds ±5% randomness (max ±2 days) for intervals > 2 days
 */
export function applyFuzzFactor(interval: number): number {
  if (interval <= 2) return interval;
  const fuzzRange = Math.min(interval * 0.05, 2);
  const fuzz = (Math.random() * 2 - 1) * fuzzRange;
  return Math.max(1, Math.round(interval + fuzz));
}

/**
 * Main FSRS update function - call after a review
 * Returns updated VocabularyReview with new stability, difficulty, and nextReviewDate
 */
export function updateFSRSAfterReview(
  review: VocabularyReview,
  rating: FSRSRating,
  settings: FSRSSettings = DEFAULT_FSRS_SETTINGS
): VocabularyReview {
  const now = new Date();
  const isFirstReview = review.stability === undefined || review.stability === 0;
  
  let newStability: number;
  let newDifficulty: number;
  let newLapses = review.lapses || 0;
  let retrievability = 1;
  
  if (isFirstReview) {
    // First review - use initial values
    newStability = getInitialStability(rating);
    newDifficulty = getInitialDifficulty(rating);
    if (rating === 1) newLapses++;
  } else {
    // Subsequent review - calculate based on elapsed time
    const lastReviewDate = review.lastReviewDate ? new Date(review.lastReviewDate) : now;
    const elapsedDays = Math.max(0, (now.getTime() - lastReviewDate.getTime()) / (1000 * 60 * 60 * 24));
    
    retrievability = calculateRetrievability(review.stability!, elapsedDays);
    
    if (rating === 1) {
      // Forgot - use failure formula
      newStability = calculateNextStabilityFail(review.difficulty!, review.stability!, retrievability);
      newLapses++;
    } else {
      // Remembered - use success formula
      newStability = calculateNextStabilitySuccess(review.difficulty!, review.stability!, retrievability, rating);
    }
    
    newDifficulty = updateDifficulty(review.difficulty!, rating);
  }
  
  // Calculate next interval with fuzz
  const baseInterval = calculateIntervalFromStability(newStability, settings.desiredRetention);
  const fuzzedInterval = applyFuzzFactor(baseInterval);
  
  // Calculate next review date
  const nextReviewDate = new Date(now);
  nextReviewDate.setDate(now.getDate() + fuzzedInterval);
  
  // Create history entry
  const historyEntry = {
    date: now.toISOString(),
    correctCount: rating >= 2 ? 1 : 0,
    incorrectCount: rating === 1 ? 1 : 0,
    intervalBefore: review.currentIntervalDays,
    intervalAfter: fuzzedInterval,
    rating,
    stabilityBefore: review.stability || 0,
    stabilityAfter: newStability,
    difficultyBefore: review.difficulty || 5,
    difficultyAfter: newDifficulty,
    retrievability
  };
  
  return {
    ...review,
    currentIntervalDays: fuzzedInterval,
    nextReviewDate: nextReviewDate.toISOString(),
    lastReviewDate: now.toISOString(),
    reviewHistory: [...review.reviewHistory, historyEntry],
    stability: newStability,
    difficulty: newDifficulty,
    lapses: newLapses
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
 * Get random vocabularies due for review to use in chat
 * Returns up to 5 random vocabularies that are due for review
 */
export function getRandomReviewVocabulariesForChat(journal: DailyChat[]): {
  vocabulary: VocabularyItem;
  review: VocabularyReview;
  dailyChatId: string;
}[] {
  const todayStr = getVietnamDateString(new Date());
  
  const dueVocabularies: {
    vocabulary: VocabularyItem;
    review: VocabularyReview;
    dailyChatId: string;
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
          dueVocabularies.push({
            vocabulary,
            review,
            dailyChatId: dailyChat.id
          });
        }
      }
    }
  }
  
  // Sort by stability (lower = more urgent) and return up to 20
  return dueVocabularies.sort((a, b) => (a.review.stability || 0) - (b.review.stability || 0)).slice(0, 20);
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
