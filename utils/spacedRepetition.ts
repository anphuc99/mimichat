import type { VocabularyReview, VocabularyItem, DailyChat, Message } from '../types';

/**
 * Calculate next interval based on current interval and incorrect count
 * Logic:
 * - If currentInterval = 0: nextInterval = 4 (fallback, shouldn't happen normally)
 * - Otherwise: nextInterval = currentInterval * 2 - incorrectCount
 * - Minimum interval = 1 day
 * 
 * Example:
 * - After learning: currentInterval = 4
 * - 1st review (correct): 4 * 2 - 0 = 8 days
 * - 2nd review (1 wrong): 8 * 2 - 1 = 15 days
 * - 3rd review (correct): 15 * 2 - 0 = 30 days
 */
export function calculateNextInterval(currentInterval: number, incorrectCount: number): number {
  let baseInterval: number;
  
  if (currentInterval === 0) {
    // First review
    baseInterval = 4;
  } else {
    // Double the current interval
    baseInterval = currentInterval * 2;
  }
  
  // Apply penalty (subtract incorrect count)
  const actualInterval = baseInterval - incorrectCount;
  
  // Minimum 1 day
  return Math.max(1, actualInterval);
}

/**
 * Initialize a new VocabularyReview when vocabulary is first created
 */
export function initializeVocabularyReview(
  vocab: VocabularyItem,
  dailyChatId: string
): VocabularyReview {
  const today = new Date();
  const firstReviewDate = new Date(today);
  firstReviewDate.setDate(today.getDate() + 1); // First review in 4 days
  
  return {
    vocabularyId: vocab.id,
    dailyChatId: dailyChatId,
    currentIntervalDays: 1, // First interval is 4 days
    nextReviewDate: firstReviewDate.toISOString(),
    lastReviewDate: null,
    reviewHistory: [],
    totalReviews: 0
  };
}

/**
 * Update review schedule after completing a quiz
 */
export function updateReviewAfterQuiz(
  review: VocabularyReview,
  correctCount: number,
  incorrectCount: number
): VocabularyReview {
  const now = new Date();
  const intervalBefore = review.currentIntervalDays;
  
  // Calculate next interval
  // Nếu là lần học đầu tiên (intervalBefore = 0), áp dụng penalty ngay
  // nextInterval = 4 - incorrectCount (tối thiểu là 1)
  // Nếu đã học rồi, áp dụng công thức gấp đôi trừ penalty
  let nextInterval: number;
  if (intervalBefore === 0) {
    // Học mới: bắt đầu từ 4 ngày, trừ đi số câu sai
    nextInterval = Math.max(1, 4 - incorrectCount);
  } else {
    // Ôn lại: gấp đôi interval hiện tại, trừ đi số câu sai
    nextInterval = calculateNextInterval(intervalBefore, incorrectCount);
  }
  
  // Calculate next review date
  const nextReviewDate = new Date(now);
  nextReviewDate.setDate(now.getDate() + nextInterval);
  
  // Add to history
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
    reviewHistory: [...review.reviewHistory, newHistoryEntry],
    totalReviews: review.totalReviews + 1
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
 */
export function getVocabulariesDueForReview(journal: DailyChat[]): {
  vocabulary: VocabularyItem;
  review: VocabularyReview;
  dailyChat: DailyChat;
  messages: Message[];
}[] {
  const todayStr = getVietnamDateString(new Date());
  
  const dueVocabularies: {
    vocabulary: VocabularyItem;
    review: VocabularyReview;
    dailyChat: DailyChat;
    messages: Message[];
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
            dailyChat,
            messages: dailyChat.messages
          });
        }
      }
    }
  }
  
  // Shuffle the array to randomize the order and limit to 20 words
  const shuffled = shuffleArray(dueVocabularies);
  return shuffled.slice(0, 5);
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
  
  // Shuffle and return up to 5
  const shuffled = shuffleArray(dueVocabularies);
  return shuffled.slice(0, 5);
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
