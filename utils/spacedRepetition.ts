import type { VocabularyReview, VocabularyItem, FSRSRating, FSRSSettings } from '../types';
import { DEFAULT_FSRS_SETTINGS } from '../types';
import { fsrs, createEmptyCard, Rating, State, type Card, type Grade, type FSRS } from 'ts-fsrs';

// ============================================================================
// FSRS (Free Spaced Repetition Scheduler) Algorithm Implementation
// Using ts-fsrs library for accurate calculations
// ============================================================================

const fsrsCache = new Map<number, FSRS>();

function getFsrsScheduler(settings?: FSRSSettings): FSRS {
  const desiredRetention = settings?.desiredRetention ?? DEFAULT_FSRS_SETTINGS.desiredRetention;
  const normalized = Math.max(0.5, Math.min(0.97, desiredRetention));
  const key = Number(normalized.toFixed(3));
  if (!fsrsCache.has(key)) {
    fsrsCache.set(key, fsrs({ request_retention: normalized }));
  }
  return fsrsCache.get(key)!;
}

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
export function calculateNewCardInterval(rating: FSRSRating, settings?: FSRSSettings): number {
  const newCard = createEmptyCard();
  const scheduler = getFsrsScheduler(settings);
  const result = scheduler.repeat(newCard, new Date());
  const grade = mapRatingToTsFsrs(rating);
  return result[grade].card.scheduled_days;
}

/**
 * @deprecated Kept for backward compatibility - ts-fsrs handles this internally
 */
export function getInitialStability(rating: FSRSRating, settings?: FSRSSettings): number {
  const card = createEmptyCard();
  const scheduler = getFsrsScheduler(settings);
  const result = scheduler.repeat(card, new Date())[mapRatingToTsFsrs(rating)].card;
  return result.stability;
}

/**
 * @deprecated Kept for backward compatibility - ts-fsrs handles this internally
 */
export function getInitialDifficulty(rating: FSRSRating, settings?: FSRSSettings): number {
  const card = createEmptyCard();
  const scheduler = getFsrsScheduler(settings);
  const result = scheduler.repeat(card, new Date())[mapRatingToTsFsrs(rating)].card;
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
  const scheduler = getFsrsScheduler(settings);
  
  // Convert to ts-fsrs Card format
  const card = reviewToCard(review);
  
  // Get scheduling options for all ratings
  const schedulingCards = scheduler.repeat(card, now);
  
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
