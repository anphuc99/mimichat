import type {
  ChatJournal,
  DailyChat,
  Message,
  TranslationDrillStore,
  TranslationReview,
  StoredTranslationCard,
  FSRSSettings
} from '../types';
import { DEFAULT_FSRS_SETTINGS } from '../types';

const VIETNAM_TZ = 'Asia/Ho_Chi_Minh';
const TRANSLATION_STORE_VERSION = 2;

function getVietnamDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: VIETNAM_TZ });
}

export function createEmptyTranslationDrillStore(): TranslationDrillStore {
  return {
    version: TRANSLATION_STORE_VERSION,
    reviews: [],
    cards: []
  };
}

export function getStoredTranslationCard(
  store: TranslationDrillStore,
  messageId: string
): StoredTranslationCard | undefined {
  return store.cards?.find(card => card.messageId === messageId);
}

export function upsertStoredTranslationCard(
  store: TranslationDrillStore,
  card: StoredTranslationCard
): TranslationDrillStore {
  const cards = store.cards || [];
  const existingIndex = cards.findIndex(item => item.messageId === card.messageId);
  if (existingIndex === -1) {
    return {
      ...store,
      cards: [...cards, card],
      version: Math.max(store.version ?? 1, TRANSLATION_STORE_VERSION)
    };
  }
  const nextCards = [...cards];
  nextCards[existingIndex] = card;
  return {
    ...store,
    cards: nextCards,
    version: Math.max(store.version ?? 1, TRANSLATION_STORE_VERSION)
  };
}

export function buildStoredTranslationCard(
  message: Message,
  dailyChat?: DailyChat,
  meta?: { storyId?: string; storyName?: string }
): StoredTranslationCard {
  return {
    messageId: message.id,
    storyId: meta?.storyId,
    storyName: meta?.storyName,
    dailyChatId: dailyChat?.id,
    dailyChatDate: dailyChat?.date,
    dailyChatSummary: dailyChat?.summary,
    characterName: message.characterName,
    text: message.text,
    translation: message.translation,
    audioData: message.audioData,
    createdAt: new Date().toISOString()
  };
}

export function ensureStoredTranslationCard(
  store: TranslationDrillStore,
  message: Message,
  dailyChat?: DailyChat,
  meta?: { storyId?: string; storyName?: string }
): TranslationDrillStore {
  const existing = getStoredTranslationCard(store, message.id);
  if (!existing) {
    return upsertStoredTranslationCard(store, buildStoredTranslationCard(message, dailyChat, meta));
  }

  const updatedCard: StoredTranslationCard = {
    ...existing,
    storyId: existing.storyId || meta?.storyId,
    storyName: existing.storyName || meta?.storyName,
    dailyChatId: dailyChat?.id || existing.dailyChatId,
    dailyChatDate: dailyChat?.date || existing.dailyChatDate,
    dailyChatSummary: dailyChat?.summary || existing.dailyChatSummary,
    characterName: message.characterName || existing.characterName,
    text: message.text || existing.text,
    translation: message.translation ?? existing.translation,
    audioData: message.audioData || existing.audioData,
    updatedAt: new Date().toISOString()
  };

  const didChange = (
    updatedCard.storyId !== existing.storyId ||
    updatedCard.storyName !== existing.storyName ||
    updatedCard.dailyChatId !== existing.dailyChatId ||
    updatedCard.dailyChatDate !== existing.dailyChatDate ||
    updatedCard.dailyChatSummary !== existing.dailyChatSummary ||
    updatedCard.characterName !== existing.characterName ||
    updatedCard.text !== existing.text ||
    updatedCard.translation !== existing.translation ||
    updatedCard.audioData !== existing.audioData
  );

  if (!didChange) {
    return store;
  }

  return upsertStoredTranslationCard(store, updatedCard);
}

export function updateStoredTranslationCardTranslation(
  store: TranslationDrillStore,
  messageId: string,
  translation: string
): TranslationDrillStore {
  const existing = getStoredTranslationCard(store, messageId);
  if (!existing || existing.translation === translation) {
    return store;
  }
  const updated: StoredTranslationCard = {
    ...existing,
    translation,
    updatedAt: new Date().toISOString()
  };
  return upsertStoredTranslationCard(store, updated);
}

export function getTranslationReviewByMessageId(
  store: TranslationDrillStore,
  messageId: string
): TranslationReview | undefined {
  return store.reviews.find(review => review.vocabularyId === messageId);
}

export function initializeTranslationReview(
  messageId: string,
  dailyChatId: string
): TranslationReview {
  const today = new Date();
  const firstReviewDate = new Date(today);
  firstReviewDate.setDate(today.getDate() + 1);

  return {
    vocabularyId: messageId,
    dailyChatId,
    currentIntervalDays: 1,
    nextReviewDate: firstReviewDate.toISOString(),
    lastReviewDate: null,
    reviewHistory: [],
    stability: 0,
    difficulty: 5,
    lapses: 0
  };
}

export function upsertTranslationReview(
  store: TranslationDrillStore,
  review: TranslationReview
): TranslationDrillStore {
  const existingIndex = store.reviews.findIndex(r => r.vocabularyId === review.vocabularyId);

  if (existingIndex === -1) {
    return {
      ...store,
      reviews: [...store.reviews, review]
    };
  }

  const updatedReviews = [...store.reviews];
  updatedReviews[existingIndex] = review;

  return {
    ...store,
    reviews: updatedReviews
  };
}

export function removeTranslationReview(
  store: TranslationDrillStore,
  messageId: string
): TranslationDrillStore {
  const filtered = store.reviews.filter(review => review.vocabularyId !== messageId);
  if (filtered.length === store.reviews.length) {
    return store;
  }
  return {
    ...store,
    reviews: filtered
  };
}

export function getDueTranslationReviews(
  store: TranslationDrillStore,
  settings: FSRSSettings = DEFAULT_FSRS_SETTINGS
): TranslationReview[] {
  const todayStr = getVietnamDateString(new Date());
  const due = store.reviews.filter(review => {
    const nextReviewDateStr = getVietnamDateString(new Date(review.nextReviewDate));
    return nextReviewDateStr <= todayStr;
  });

  due.sort((a, b) => {
    const lastA = a.lastReviewDate ? new Date(a.lastReviewDate).getTime() : 0;
    const lastB = b.lastReviewDate ? new Date(b.lastReviewDate).getTime() : 0;
    return lastA - lastB;
  });

  return due.slice(0, settings.maxReviewsPerDay);
}

export function getTranslationReviewDueCount(store: TranslationDrillStore): number {
  return getDueTranslationReviews(store).length;
}

export function getTodayTranslationCount(store: TranslationDrillStore): number {
  const todayStr = getVietnamDateString(new Date());
  let count = 0;

  for (const review of store.reviews) {
    for (const history of review.reviewHistory) {
      const historyDate = history.date ? new Date(history.date) : null;
      if (historyDate && getVietnamDateString(historyDate) === todayStr) {
        count += 1;
      }
    }
  }

  return count;
}

export function findMessageById(
  journal: ChatJournal,
  messageId: string
): { message: Message; dailyChat: DailyChat } | null {
  for (const dailyChat of journal) {
    const message = dailyChat.messages.find(msg => msg.id === messageId);
    if (message) {
      return { message, dailyChat };
    }
  }
  return null;
}

export function getRecentBotMessages(
  journal: ChatJournal,
  chatLimit: number = 5
): { message: Message; dailyChat: DailyChat }[] {
  const recentChats = journal.slice(-chatLimit).filter(chat => chat && chat.messages?.length);
  const result: { message: Message; dailyChat: DailyChat }[] = [];

  for (const dailyChat of recentChats.reverse()) {
    for (const message of dailyChat.messages) {
      if (message.sender === 'bot' && message.text?.trim()) {
        result.push({ message, dailyChat });
      }
    }
  }

  return result;
}
