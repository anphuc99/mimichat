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
 * Map our 4-level rating to ts-fsrs Rating
 * Our: 1=Again, 2=Hard, 3=Good, 4=Easy
 * ts-fsrs: Again=1, Hard=2, Good=3, Easy=4
 */
function mapRatingToTsFsrs(rating: FSRSRating): Grade {
  switch (rating) {
    case 1: return Rating.Again;
    case 2: return Rating.Hard;
    case 3: return Rating.Good;
    case 4: return Rating.Easy;
    default: return Rating.Good;
  }
}

/**
 * Convert VocabularyReview to ts-fsrs Card format
 * For cards without stability (new or legacy), use default initial values
 * that will produce desired intervals: easy=7d, medium=3d, hard=1d
 */
function reviewToCard(review: VocabularyReview): Card {
  const hasStability = review.stability !== undefined && review.stability > 0;
  const hasReviewHistory = review.reviewHistory && review.reviewHistory.length > 0;
  
  if (!hasStability) {
    // For new cards or legacy cards without stability:
    // Set initial stability that will produce reasonable intervals
    // With FSRS, stability ≈ interval (simplified for retention = 0.9)
    // Default: stability = 3 (will produce ~6 days interval on first Good rating)
    const initialStability = 3;
    const initialDifficulty = 5;
    
    console.log(`[reviewToCard] Card without stability (new or legacy), using default: stability=${initialStability}, difficulty=${initialDifficulty}`);
    
    return {
      due: hasReviewHistory ? new Date(review.nextReviewDate) : new Date(),
      stability: initialStability,
      difficulty: initialDifficulty,
      elapsed_days: review.lastReviewDate 
        ? Math.max(0, (Date.now() - new Date(review.lastReviewDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0,
      scheduled_days: review.currentIntervalDays || 0,
      learning_steps: 0,
      reps: hasReviewHistory ? review.reviewHistory.length : 0,
      lapses: review.lapses || 0,
      state: hasReviewHistory ? State.Review : State.New, // Legacy cards are in Review state
      last_review: review.lastReviewDate ? new Date(review.lastReviewDate) : undefined
    };
  }
  
  // Normal FSRS card with stability
  return {
    due: new Date(review.nextReviewDate),
    stability: review.stability,
    difficulty: review.difficulty || 5,
    elapsed_days: review.lastReviewDate 
      ? Math.max(0, (Date.now() - new Date(review.lastReviewDate).getTime()) / (1000 * 60 * 60 * 24))
      : 0,
    scheduled_days: review.currentIntervalDays || 0,
    learning_steps: 0,
    reps: review.reviewHistory.length,
    lapses: review.lapses || 0,
    state: review.lapses && review.lapses > 0 ? State.Relearning : State.Review,
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
 * Calculate interval (in days) for a new card based on FSRS rating
 * Uses ts-fsrs to compute the actual scheduled interval
 */
export function calculateNewCardInterval(rating: FSRSRating): number {
  const newCard = createEmptyCard();
  const result = f.repeat(newCard, new Date());
  const grade = mapRatingToTsFsrs(rating);
  return result[grade].card.scheduled_days;
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
 * Unified FSRS review update function - handles both legacy and new data
 * Used by both VocabularyMemoryFlashcard (flashcard review) and ASK_VOCAB_DIFFICULTY (rating)
 * Ensures consistent FSRS calculations across all review modes
 */
export function updateFSRSReview(
  review: VocabularyReview,
  rating: FSRSRating,
  settings: FSRSSettings = DEFAULT_FSRS_SETTINGS
): VocabularyReview {
  // Use the main updateFSRSAfterReview which handles legacy migration via reviewToCard
  return updateFSRSAfterReview(review, rating, settings);
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
 * Initialize a new VocabularyReview with user's difficulty rating
 * Maps user rating to FSRS: very_easy=4 (Easy), easy=3 (Good), medium=2 (Hard), hard=1 (Again)
 * Uses fixed intervals: very_easy=14 days, easy=7 days, medium=3 days, hard=1 day
 */
export function initializeFSRSWithDifficulty(
  vocab: VocabularyItem,
  dailyChatId: string,
  difficultyRating: 'very_easy' | 'easy' | 'medium' | 'hard'
): VocabularyReview {
  const now = new Date();
  
  // Map difficulty to FSRS rating: very_easy=4, easy=3, medium=2, hard=1
  const fsrsRating: FSRSRating = difficultyRating === 'very_easy' ? 4 : difficultyRating === 'easy' ? 3 : difficultyRating === 'medium' ? 2 : 1;
  
  // Fixed intervals based on difficulty (NOT using ts-fsrs new card which gives 10 minutes)
  // very_easy=14 days, easy=7 days, medium=3 days, hard=1 day
  const intervalDays = difficultyRating === 'very_easy' ? 14 : difficultyRating === 'easy' ? 7 : difficultyRating === 'medium' ? 3 : 1;
  
  // Initial stability based on interval (for FSRS, stability ≈ interval when retention=0.9)
  const initialStability = intervalDays;
  const initialDifficulty = difficultyRating === 'very_easy' ? 1 : difficultyRating === 'easy' ? 3 : difficultyRating === 'medium' ? 5 : 7;
  
  // Calculate next review date
  const nextReviewDate = new Date(now);
  nextReviewDate.setDate(now.getDate() + intervalDays);
  
  console.log(`[initializeFSRSWithDifficulty] Creating new review: rating=${difficultyRating}, interval=${intervalDays} days, stability=${initialStability}`);
  
  // Create initial history entry
  const historyEntry = {
    date: now.toISOString(),
    correctCount: fsrsRating >= 2 ? 1 : 0,
    incorrectCount: fsrsRating === 1 ? 1 : 0,
    intervalBefore: 0,
    intervalAfter: intervalDays,
    rating: fsrsRating,
    stabilityBefore: 0,
    stabilityAfter: initialStability,
    difficultyBefore: 5,
    difficultyAfter: initialDifficulty,
    retrievability: 1
  };
  
  return {
    vocabularyId: vocab.id,
    dailyChatId: dailyChatId,
    currentIntervalDays: intervalDays,
    nextReviewDate: nextReviewDate.toISOString(),
    lastReviewDate: now.toISOString(),
    reviewHistory: [historyEntry],
    stability: initialStability,
    difficulty: initialDifficulty,
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
 * Get vocabularies that don't have a review schedule yet (new cards)
 * These are candidates for auto-adding to the memory system
 */
export function getNewVocabulariesWithoutReview(
  journal: DailyChat[]
): {
  vocabulary: VocabularyItem;
  dailyChat: DailyChat;
  memory?: import('../types').VocabularyMemoryEntry;
}[] {
  const result: {
    vocabulary: VocabularyItem;
    dailyChat: DailyChat;
    memory?: import('../types').VocabularyMemoryEntry;
  }[] = [];
  
  for (const dailyChat of journal) {
    if (!dailyChat.vocabularies) continue;
    
    for (const vocabulary of dailyChat.vocabularies) {
      // Check if this vocabulary already has a review
      const hasReview = dailyChat.reviewSchedule?.some(r => r.vocabularyId === vocabulary.id);
      
      if (!hasReview) {
        const memory = dailyChat.vocabularyMemories?.find(m => m.vocabularyId === vocabulary.id);
        result.push({ vocabulary, dailyChat, memory });
      }
    }
  }
  
  // Sort by date (oldest first - FIFO)
  result.sort((a, b) => {
    const dateA = new Date(a.dailyChat.id).getTime();
    const dateB = new Date(b.dailyChat.id).getTime();
    return dateA - dateB;
  });
  
  return result;
}

/**
 * Create initial review for a new vocabulary
 * New cards start with interval = 0 (due today) so they appear in review immediately
 * User will rate difficulty after seeing the card for the first time
 */
export function createInitialReview(
  vocabulary: VocabularyItem,
  dailyChatId: string
): VocabularyReview {
  const now = new Date();
  
  // New card: due today, no stability yet (will be set after first review)
  return {
    vocabularyId: vocabulary.id,
    dailyChatId: dailyChatId,
    currentIntervalDays: 0,
    nextReviewDate: now.toISOString(), // Due immediately
    lastReviewDate: null,
    reviewHistory: [],
    stability: 0, // Will be set after first rating
    difficulty: 5, // Default middle difficulty
    lapses: 0
  };
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
  
  // Sort by lastReviewDate (most recently reviewed first - closest to today)
  // Example: today=12/1, lastReview=11/1 (1 day ago) comes BEFORE lastReview=10/1 (2 days ago)
  const now = Date.now();
  dueVocabularies.sort((a, b) => {
    const lastA = a.review.lastReviewDate ? new Date(a.review.lastReviewDate).getTime() : 0;
    const lastB = b.review.lastReviewDate ? new Date(b.review.lastReviewDate).getTime() : 0;
    
    // Sort descending by lastReviewDate (most recent first)
    return lastB - lastA;
  });
  
  // Apply maxReviewsPerDay limit
  return dueVocabularies.slice(0, settings.maxReviewsPerDay);
}

/**
 * Auto-add new vocabularies to the review system
 * New cards are due immediately (interval=0) - user will rate after first review
 * @param journal - Current journal
 * @param settings - FSRS settings with newCardsPerDay
 * @returns Updated journal with new reviews added, and count of added reviews
 */
export function autoAddNewVocabularies(
  journal: DailyChat[],
  settings: FSRSSettings = DEFAULT_FSRS_SETTINGS
): { 
  updatedJournal: DailyChat[];
  addedCount: number;
  addedVocabularies: { vocabulary: VocabularyItem; dailyChatId: string }[];
} {
  const newVocabs = getNewVocabulariesWithoutReview(journal);
  const toAdd = newVocabs.slice(0, settings.newCardsPerDay || 20);
  
  if (toAdd.length === 0) {
    return { updatedJournal: journal, addedCount: 0, addedVocabularies: [] };
  }
  
  console.log(`[autoAddNewVocabularies] Adding ${toAdd.length} new vocabularies (due today for first review)`);
  
  // Group by dailyChatId for efficient update
  const reviewsByChat = new Map<string, VocabularyReview[]>();
  const addedVocabularies: { vocabulary: VocabularyItem; dailyChatId: string }[] = [];
  
  for (const item of toAdd) {
    const review = createInitialReview(item.vocabulary, item.dailyChat.id);
    
    if (!reviewsByChat.has(item.dailyChat.id)) {
      reviewsByChat.set(item.dailyChat.id, []);
    }
    reviewsByChat.get(item.dailyChat.id)!.push(review);
    addedVocabularies.push({ vocabulary: item.vocabulary, dailyChatId: item.dailyChat.id });
  }
  
  // Update journal with new reviews
  const updatedJournal = journal.map(dc => {
    const newReviews = reviewsByChat.get(dc.id);
    if (newReviews && newReviews.length > 0) {
      return {
        ...dc,
        reviewSchedule: [...(dc.reviewSchedule || []), ...newReviews]
      };
    }
    return dc;
  });
  
  return { 
    updatedJournal, 
    addedCount: toAdd.length,
    addedVocabularies 
  };
}

/**
 * Get statistics about new/review cards
 */
export function getVocabularyStats(
  journal: DailyChat[],
  settings: FSRSSettings = DEFAULT_FSRS_SETTINGS
): {
  totalVocabularies: number;
  withReview: number;
  withoutReview: number;
  dueToday: number;
  newCardsPerDay: number;
  maxReviewsPerDay: number;
} {
  const allVocabs = getAllVocabulariesWithMemories(journal);
  const newVocabs = getNewVocabulariesWithoutReview(journal);
  const dueReviews = getVocabulariesDueForMemoryReview(journal, settings);
  
  return {
    totalVocabularies: allVocabs.length,
    withReview: allVocabs.length - newVocabs.length,
    withoutReview: newVocabs.length,
    dueToday: dueReviews.length,
    newCardsPerDay: settings.newCardsPerDay || 20,
    maxReviewsPerDay: settings.maxReviewsPerDay
  };
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

/**
 * Get difficult vocabularies that were rated Hard (2) or Again (1) today
 * These are words the user struggled with and should review again
 * This does NOT update FSRS - it's just for extra practice
 */
export function getDifficultVocabulariesToday(
  journal: DailyChat[]
): {
  vocabulary: VocabularyItem;
  review: VocabularyReview;
  dailyChat: DailyChat;
  memory?: import('../types').VocabularyMemoryEntry;
  todayRating: 1 | 2; // The rating given today (Again or Hard)
}[] {
  const todayStr = getVietnamDateString(new Date());
  
  const difficultVocabs: {
    vocabulary: VocabularyItem;
    review: VocabularyReview;
    dailyChat: DailyChat;
    memory?: import('../types').VocabularyMemoryEntry;
    todayRating: 1 | 2;
  }[] = [];
  
  for (const dailyChat of journal) {
    if (!dailyChat.reviewSchedule || !dailyChat.vocabularies) continue;
    
    for (const review of dailyChat.reviewSchedule) {
      if (!review.reviewHistory || review.reviewHistory.length === 0) continue;
      
      // Check if there's a Hard or Again rating from today
      const todayDifficultReview = review.reviewHistory.find(h => {
        const reviewDateStr = getVietnamDateString(new Date(h.date));
        return reviewDateStr === todayStr && h.rating !== undefined && (h.rating === 1 || h.rating === 2);
      });
      
      if (todayDifficultReview && todayDifficultReview.rating) {
        const vocabulary = dailyChat.vocabularies.find(v => v.id === review.vocabularyId);
        
        if (vocabulary) {
          const memory = dailyChat.vocabularyMemories?.find(m => m.vocabularyId === vocabulary.id);
          
          difficultVocabs.push({
            vocabulary,
            review: migrateLegacyToFSRS(review),
            dailyChat,
            memory,
            todayRating: todayDifficultReview.rating as 1 | 2
          });
        }
      }
    }
  }
  
  // Sort by rating: Again (1) first, then Hard (2)
  difficultVocabs.sort((a, b) => a.todayRating - b.todayRating);
  
  return difficultVocabs;
}

/**
 * Get difficult vocabularies today for Review Scene (with messages)
 * This is for "Tổng ôn" feature - only reviews words rated Hard/Again today
 */
export function getDifficultVocabulariesForReview(
  journal: DailyChat[]
): {
  vocabulary: VocabularyItem;
  review: VocabularyReview;
  dailyChat: DailyChat;
  messages: Message[];
}[] {
  const todayStr = getVietnamDateString(new Date());
  
  const difficultVocabs: {
    vocabulary: VocabularyItem;
    review: VocabularyReview;
    dailyChat: DailyChat;
    messages: Message[];
  }[] = [];
  
  for (const dailyChat of journal) {
    if (!dailyChat.reviewSchedule || !dailyChat.vocabularies) continue;
    
    for (const review of dailyChat.reviewSchedule) {
      if (!review.reviewHistory || review.reviewHistory.length === 0) continue;
      
      // Check if there's a Hard or Again rating from today
      const todayDifficultReview = review.reviewHistory.find(h => {
        const reviewDateStr = getVietnamDateString(new Date(h.date));
        return reviewDateStr === todayStr && h.rating !== undefined && (h.rating === 1 || h.rating === 2);
      });
      
      if (todayDifficultReview && todayDifficultReview.rating) {
        const vocabulary = dailyChat.vocabularies.find(v => v.id === review.vocabularyId);
        
        if (vocabulary) {
          difficultVocabs.push({
            vocabulary,
            review: migrateLegacyToFSRS(review),
            dailyChat,
            messages: dailyChat.messages
          });
        }
      }
    }
  }
  
  // Sort by: rating (Again=1 first, then Hard=2), then stability (lower=more urgent), then difficulty (higher=harder)
  difficultVocabs.sort((a, b) => {
    // Get today's rating for both
    const todayStr = getVietnamDateString(new Date());
    const ratingA = a.review.reviewHistory.find(h => {
      const reviewDateStr = getVietnamDateString(new Date(h.date));
      return reviewDateStr === todayStr && (h.rating === 1 || h.rating === 2);
    })?.rating || 0;
    
    const ratingB = b.review.reviewHistory.find(h => {
      const reviewDateStr = getVietnamDateString(new Date(h.date));
      return reviewDateStr === todayStr && (h.rating === 1 || h.rating === 2);
    })?.rating || 0;
    
    // First, sort by rating (1=Again comes first, then 2=Hard)
    if (ratingA !== ratingB) {
      return ratingA - ratingB;
    }
    
    // Then, sort by stability (lower stability = more urgent, comes first)
    const stabilityA = a.review.stability || 0;
    const stabilityB = b.review.stability || 0;
    if (stabilityA !== stabilityB) {
      return stabilityA - stabilityB;
    }
    
    // Finally, sort by difficulty (higher difficulty = harder, comes first)
    const difficultyA = a.review.difficulty || 5;
    const difficultyB = b.review.difficulty || 5;
    return difficultyB - difficultyA;
  });
  
  return difficultVocabs;
}

/**
 * Get count of difficult vocabularies today
 */
export function getDifficultVocabulariesCount(journal: DailyChat[]): number {
  return getDifficultVocabulariesToday(journal).length;
}

/**
 * Get ALL vocabularies that have been learned (have reviewSchedule)
 * This is for "Tổng ôn" feature - reviews all learned words, not just due ones
 */
export function getAllLearnedVocabulariesForReview(
  journal: DailyChat[]
): {
  vocabulary: VocabularyItem;
  review: VocabularyReview;
  dailyChat: DailyChat;
  messages: Message[];
}[] {
  const learnedVocabularies: {
    vocabulary: VocabularyItem;
    review: VocabularyReview;
    dailyChat: DailyChat;
    messages: Message[];
  }[] = [];
  
  for (const dailyChat of journal) {
    if (!dailyChat.reviewSchedule || !dailyChat.vocabularies) continue;
    
    for (const review of dailyChat.reviewSchedule) {
      const vocabulary = dailyChat.vocabularies.find(v => v.id === review.vocabularyId);
      
      if (vocabulary) {
        learnedVocabularies.push({
          vocabulary,
          review,
          dailyChat,
          messages: dailyChat.messages
        });
      }
    }
  }
  
  // Shuffle the array for variety
  for (let i = learnedVocabularies.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [learnedVocabularies[i], learnedVocabularies[j]] = [learnedVocabularies[j], learnedVocabularies[i]];
  }
  
  return learnedVocabularies;
}
