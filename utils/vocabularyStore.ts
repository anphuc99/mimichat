/**
 * Vocabulary Store Utilities
 * 
 * This module provides functions for working with the global VocabularyStore
 * stored in vocabulary-store.json
 */

import type {
  VocabularyItem,
  VocabularyReview,
  VocabularyProgress,
  VocabularyStore,
  StoredVocabularyItem,
  StoredVocabularyMemory,
  FSRSSettings,
  DailyChat,
  ChatJournal
} from '../types';
import { DEFAULT_FSRS_SETTINGS } from '../types';

// ============================================================================
// Vocabulary Store Operations
// ============================================================================

/**
 * Create an empty vocabulary store
 */
export function createEmptyVocabularyStore(): VocabularyStore {
  return {
    version: 1,
    vocabularies: [],
    reviews: [],
    memories: [],
    progress: {}
  };
}

/**
 * Get vocabulary by ID from store
 */
export function getVocabularyById(store: VocabularyStore, vocabularyId: string): StoredVocabularyItem | undefined {
  return store.vocabularies.find(v => v.id === vocabularyId);
}

/**
 * Get vocabulary by Korean word from store
 */
export function getVocabularyByKorean(store: VocabularyStore, korean: string): StoredVocabularyItem | undefined {
  return store.vocabularies.find(v => v.korean === korean);
}

/**
 * Get review by vocabulary ID from store
 */
export function getReviewByVocabularyId(store: VocabularyStore, vocabularyId: string): VocabularyReview | undefined {
  return store.reviews.find(r => r.vocabularyId === vocabularyId);
}

/**
 * Get memory by vocabulary ID from store
 */
export function getMemoryByVocabularyId(store: VocabularyStore, vocabularyId: string): StoredVocabularyMemory | undefined {
  return store.memories.find(m => m.vocabularyId === vocabularyId);
}

/**
 * Add a new vocabulary to the store
 */
export function addVocabulary(
  store: VocabularyStore,
  vocabulary: VocabularyItem,
  dailyChatId: string,
  storyId: string = ''
): VocabularyStore {
  // Check if vocabulary with same Korean word already exists
  const existing = store.vocabularies.find(v => v.korean === vocabulary.korean);
  if (existing) {
    console.log(`[addVocabulary] Vocabulary with korean "${vocabulary.korean}" already exists`);
    return store;
  }

  const storedVocab: StoredVocabularyItem = {
    ...vocabulary,
    storyId,
    dailyChatId,
    createdDate: new Date().toISOString()
  };

  return {
    ...store,
    vocabularies: [...store.vocabularies, storedVocab]
  };
}

/**
 * Add a manually created vocabulary (without story/dailyChat)
 */
export function addManualVocabulary(
  store: VocabularyStore,
  korean: string,
  vietnamese: string
): VocabularyStore {
  // Check if vocabulary with same Korean word already exists
  const existing = store.vocabularies.find(v => v.korean === korean);
  if (existing) {
    console.log(`[addManualVocabulary] Vocabulary with korean "${korean}" already exists`);
    return store;
  }

  const storedVocab: StoredVocabularyItem = {
    id: crypto.randomUUID(),
    korean,
    vietnamese,
    createdDate: new Date().toISOString(),
    isManuallyAdded: true
  };

  return {
    ...store,
    vocabularies: [...store.vocabularies, storedVocab]
  };
}

/**
 * Update vocabulary in store
 */
export function updateVocabulary(
  store: VocabularyStore,
  vocabularyId: string,
  updates: Partial<VocabularyItem>
): VocabularyStore {
  return {
    ...store,
    vocabularies: store.vocabularies.map(v =>
      v.id === vocabularyId ? { ...v, ...updates } : v
    )
  };
}

/**
 * Delete vocabulary and all related data from store
 */
export function deleteVocabulary(store: VocabularyStore, vocabularyId: string): VocabularyStore {
  const { [vocabularyId]: _, ...remainingProgress } = store.progress;
  return {
    ...store,
    vocabularies: store.vocabularies.filter(v => v.id !== vocabularyId),
    reviews: store.reviews.filter(r => r.vocabularyId !== vocabularyId),
    memories: store.memories.filter(m => m.vocabularyId !== vocabularyId),
    progress: remainingProgress
  };
}

/**
 * Update or add review for a vocabulary
 */
export function upsertReview(store: VocabularyStore, review: VocabularyReview): VocabularyStore {
  const existingIndex = store.reviews.findIndex(r => r.vocabularyId === review.vocabularyId);
  
  if (existingIndex === -1) {
    return {
      ...store,
      reviews: [...store.reviews, review]
    };
  }

  return {
    ...store,
    reviews: store.reviews.map((r, i) => i === existingIndex ? review : r)
  };
}

/**
 * Update or add memory for a vocabulary
 */
export function upsertMemory(store: VocabularyStore, memory: StoredVocabularyMemory): VocabularyStore {
  const existingIndex = store.memories.findIndex(m => m.vocabularyId === memory.vocabularyId);
  
  if (existingIndex === -1) {
    return {
      ...store,
      memories: [...store.memories, memory]
    };
  }

  return {
    ...store,
    memories: store.memories.map((m, i) => i === existingIndex ? memory : m)
  };
}

// ============================================================================
// Query Functions (replacement for journal-based queries)
// ============================================================================

/**
 * Get Vietnam timezone date string (YYYY-MM-DD)
 */
function getVietnamDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

/**
 * Get all vocabularies with their data for browsing/learning
 */
export function getAllVocabulariesFromStore(
  store: VocabularyStore,
  journal: ChatJournal
): {
  vocabulary: StoredVocabularyItem;
  review?: VocabularyReview;
  dailyChat?: DailyChat;
  memory?: StoredVocabularyMemory;
}[] {
  const dailyChatMap = new Map<string, DailyChat>();
  for (const dc of journal) {
    dailyChatMap.set(dc.id, dc);
  }

  return store.vocabularies.map(vocabulary => {
    const review = store.reviews.find(r => r.vocabularyId === vocabulary.id);
    const memory = store.memories.find(m => m.vocabularyId === vocabulary.id);
    const dailyChat = dailyChatMap.get(vocabulary.dailyChatId);

    return { vocabulary, review, dailyChat, memory };
  });
}

/**
 * Get vocabularies without review schedule (new cards)
 */
export function getNewVocabulariesFromStore(
  store: VocabularyStore,
  journal: ChatJournal
): {
  vocabulary: StoredVocabularyItem;
  dailyChat?: DailyChat;
  memory?: StoredVocabularyMemory;
}[] {
  const dailyChatMap = new Map<string, DailyChat>();
  for (const dc of journal) {
    dailyChatMap.set(dc.id, dc);
  }

  const vocabsWithReview = new Set(store.reviews.map(r => r.vocabularyId));

  return store.vocabularies
    .filter(v => !vocabsWithReview.has(v.id))
    .map(vocabulary => {
      const memory = store.memories.find(m => m.vocabularyId === vocabulary.id);
      const dailyChat = dailyChatMap.get(vocabulary.dailyChatId);
      return { vocabulary, dailyChat, memory };
    })
    // Sort by date (oldest first - FIFO)
    .sort((a, b) => {
      const dateA = new Date(a.vocabulary.createdDate || a.vocabulary.dailyChatId).getTime();
      const dateB = new Date(b.vocabulary.createdDate || b.vocabulary.dailyChatId).getTime();
      return dateA - dateB;
    });
}

/**
 * Get vocabularies due for review
 */
export function getVocabulariesDueFromStore(
  store: VocabularyStore,
  journal: ChatJournal,
  settings: FSRSSettings = DEFAULT_FSRS_SETTINGS
): {
  vocabulary: StoredVocabularyItem;
  review: VocabularyReview;
  dailyChat?: DailyChat;
  memory?: StoredVocabularyMemory;
}[] {
  const todayStr = getVietnamDateString(new Date());
  const dailyChatMap = new Map<string, DailyChat>();
  for (const dc of journal) {
    dailyChatMap.set(dc.id, dc);
  }

  const dueVocabularies: {
    vocabulary: StoredVocabularyItem;
    review: VocabularyReview;
    dailyChat?: DailyChat;
    memory?: StoredVocabularyMemory;
  }[] = [];

  for (const review of store.reviews) {
    const nextReviewDate = new Date(review.nextReviewDate);
    const nextReviewDateStr = getVietnamDateString(nextReviewDate);

    // Check if due (today or earlier)
    if (nextReviewDateStr <= todayStr) {
      const vocabulary = store.vocabularies.find(v => v.id === review.vocabularyId);
      if (vocabulary) {
        const memory = store.memories.find(m => m.vocabularyId === vocabulary.id);
        const dailyChat = dailyChatMap.get(vocabulary.dailyChatId);

        dueVocabularies.push({
          vocabulary,
          review,
          dailyChat,
          memory
        });
      }
    }
  }

  // Sort by lastReviewDate (most recently reviewed first)
  dueVocabularies.sort((a, b) => {
    const lastA = a.review.lastReviewDate ? new Date(a.review.lastReviewDate).getTime() : 0;
    const lastB = b.review.lastReviewDate ? new Date(b.review.lastReviewDate).getTime() : 0;
    return lastB - lastA;
  });

  // Apply maxReviewsPerDay limit
  return dueVocabularies.slice(0, settings.maxReviewsPerDay);
}

/**
 * Get difficult vocabularies rated Hard/Again today
 */
export function getDifficultVocabulariesFromStore(
  store: VocabularyStore,
  journal: ChatJournal
): {
  vocabulary: StoredVocabularyItem;
  review: VocabularyReview;
  dailyChat?: DailyChat;
  memory?: StoredVocabularyMemory;
  todayRating: 1 | 2;
}[] {
  const todayStr = getVietnamDateString(new Date());
  const dailyChatMap = new Map<string, DailyChat>();
  for (const dc of journal) {
    dailyChatMap.set(dc.id, dc);
  }

  const difficultVocabs: {
    vocabulary: StoredVocabularyItem;
    review: VocabularyReview;
    dailyChat?: DailyChat;
    memory?: StoredVocabularyMemory;
    todayRating: 1 | 2;
  }[] = [];

  for (const review of store.reviews) {
    if (!review.reviewHistory || review.reviewHistory.length === 0) continue;

    const todayDifficultReview = review.reviewHistory.find(h => {
      const reviewDateStr = getVietnamDateString(new Date(h.date));
      return reviewDateStr === todayStr && h.rating !== undefined && (h.rating === 1 || h.rating === 2);
    });

    if (todayDifficultReview && todayDifficultReview.rating) {
      const vocabulary = store.vocabularies.find(v => v.id === review.vocabularyId);
      if (vocabulary) {
        const memory = store.memories.find(m => m.vocabularyId === vocabulary.id);
        const dailyChat = dailyChatMap.get(vocabulary.dailyChatId);

        difficultVocabs.push({
          vocabulary,
          review,
          dailyChat,
          memory,
          todayRating: todayDifficultReview.rating as 1 | 2
        });
      }
    }
  }

  // Sort by rating: Again (1) first, then Hard (2)
  difficultVocabs.sort((a, b) => a.todayRating - b.todayRating);

  return difficultVocabs;
}

/**
 * Get starred vocabularies
 */
export function getStarredVocabulariesFromStore(
  store: VocabularyStore,
  journal: ChatJournal
): {
  vocabulary: StoredVocabularyItem;
  review: VocabularyReview;
  dailyChat?: DailyChat;
  memory?: StoredVocabularyMemory;
}[] {
  const dailyChatMap = new Map<string, DailyChat>();
  for (const dc of journal) {
    dailyChatMap.set(dc.id, dc);
  }

  const starredVocabs: {
    vocabulary: StoredVocabularyItem;
    review: VocabularyReview;
    dailyChat?: DailyChat;
    memory?: StoredVocabularyMemory;
  }[] = [];

  for (const review of store.reviews) {
    if (!review.isStarred) continue;

    const vocabulary = store.vocabularies.find(v => v.id === review.vocabularyId);
    if (vocabulary) {
      const memory = store.memories.find(m => m.vocabularyId === vocabulary.id);
      const dailyChat = dailyChatMap.get(vocabulary.dailyChatId);

      starredVocabs.push({
        vocabulary,
        review,
        dailyChat,
        memory
      });
    }
  }

  return starredVocabs;
}

/**
 * Get vocabulary stats
 */
export function getVocabularyStatsFromStore(
  store: VocabularyStore,
  journal: ChatJournal,
  settings: FSRSSettings = DEFAULT_FSRS_SETTINGS
): {
  totalVocabularies: number;
  withReview: number;
  withoutReview: number;
  dueToday: number;
  starredCount: number;
  difficultCount: number;
  newCardsPerDay: number;
  maxReviewsPerDay: number;
} {
  const newVocabs = getNewVocabulariesFromStore(store, journal);
  const dueReviews = getVocabulariesDueFromStore(store, journal, settings);
  const starredVocabs = getStarredVocabulariesFromStore(store, journal);
  const difficultVocabs = getDifficultVocabulariesFromStore(store, journal);

  return {
    totalVocabularies: store.vocabularies.length,
    withReview: store.reviews.length,
    withoutReview: newVocabs.length,
    dueToday: dueReviews.length,
    starredCount: starredVocabs.length,
    difficultCount: difficultVocabs.length,
    newCardsPerDay: settings.newCardsPerDay || 20,
    maxReviewsPerDay: settings.maxReviewsPerDay
  };
}

/**
 * Toggle star status for a vocabulary
 */
export function toggleVocabularyStarInStore(store: VocabularyStore, vocabularyId: string): VocabularyStore {
  const reviewIndex = store.reviews.findIndex(r => r.vocabularyId === vocabularyId);
  
  if (reviewIndex === -1) {
    // Create a new review with star
    const vocabulary = store.vocabularies.find(v => v.id === vocabularyId);
    if (!vocabulary) return store;

    const newReview: VocabularyReview = {
      vocabularyId,
      dailyChatId: vocabulary.dailyChatId,
      currentIntervalDays: 0,
      nextReviewDate: new Date().toISOString(),
      lastReviewDate: null,
      reviewHistory: [],
      stability: 0,
      difficulty: 5,
      lapses: 0,
      isStarred: true
    };

    return {
      ...store,
      reviews: [...store.reviews, newReview]
    };
  }

  return {
    ...store,
    reviews: store.reviews.map((r, i) =>
      i === reviewIndex ? { ...r, isStarred: !r.isStarred } : r
    )
  };
}

/**
 * Find vocabulary with all related data
 */
export function findVocabularyWithDataFromStore(
  store: VocabularyStore,
  journal: ChatJournal,
  vocabularyId: string
): {
  vocabulary: StoredVocabularyItem;
  review?: VocabularyReview;
  dailyChat?: DailyChat;
  memory?: StoredVocabularyMemory;
} | null {
  const vocabulary = store.vocabularies.find(v => v.id === vocabularyId);
  if (!vocabulary) return null;

  const review = store.reviews.find(r => r.vocabularyId === vocabularyId);
  const memory = store.memories.find(m => m.vocabularyId === vocabularyId);
  const dailyChat = journal.find(dc => dc.id === vocabulary.dailyChatId);

  return { vocabulary, review, dailyChat, memory };
}

/**
 * Get count of vocabularies that have a review (learned)
 */
export function getTotalLearnedFromStore(store: VocabularyStore): number {
  return store.reviews.length;
}

/**
 * Get count of due reviews
 */
export function getDueCountFromStore(
  store: VocabularyStore,
  settings: FSRSSettings = DEFAULT_FSRS_SETTINGS
): number {
  const todayStr = getVietnamDateString(new Date());
  let count = 0;

  for (const review of store.reviews) {
    const nextReviewDateStr = getVietnamDateString(new Date(review.nextReviewDate));
    if (nextReviewDateStr <= todayStr) {
      count++;
    }
  }

  return Math.min(count, settings.maxReviewsPerDay);
}

/**
 * Get count of difficult vocabularies today
 */
export function getDifficultCountFromStore(store: VocabularyStore): number {
  const todayStr = getVietnamDateString(new Date());
  let count = 0;

  for (const review of store.reviews) {
    if (!review.reviewHistory || review.reviewHistory.length === 0) continue;

    const hasToday = review.reviewHistory.some(h => {
      const reviewDateStr = getVietnamDateString(new Date(h.date));
      return reviewDateStr === todayStr && h.rating !== undefined && (h.rating === 1 || h.rating === 2);
    });

    if (hasToday) count++;
  }

  return count;
}

/**
 * Get count of starred vocabularies
 */
export function getStarredCountFromStore(store: VocabularyStore): number {
  return store.reviews.filter(r => r.isStarred).length;
}
