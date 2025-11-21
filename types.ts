
export type Sender = 'user' | 'bot';

export interface RelationInfo {
  opinion: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  closeness?: number;
}

export interface Character {
  id: string;
  name: string;
  personality: string;
  gender: 'male' | 'female';
  voiceName?: string;
  pitch?: number;
  speakingRate?: number;
  relations?: { [targetCharacterId: string]: RelationInfo };
  userOpinion?: RelationInfo;
}

export interface Message {
  id: string;
  text: string;
  sender: Sender;
  characterName?: string;
  audioData?: string;
  translation?: string;
  isError?: boolean;
  rawText?: string;
}

export interface CharacterThought {
  characterName: string;
  text: string;
  audioData?: string;
  tone: string;
}

export interface VocabularyItem {
  id: string;
  korean: string;
  vietnamese: string;
  usageMessageIds: string[];
}

export interface VocabularyReview {
  vocabularyId: string;
  dailyChatId: string;
  currentIntervalDays: number; // 0 = chưa ôn lần nào, sau đó là 4, 8, 16... (có thể bị giảm nếu incorrect)
  nextReviewDate: string; // ISO date
  lastReviewDate: string | null; // null nếu chưa ôn lần nào
  reviewHistory: {
    date: string;
    correctCount: number;
    incorrectCount: number;
    intervalBefore: number;
    intervalAfter: number;
  }[];
  totalReviews: number;
}

export interface VocabularyProgress {
  vocabularyId: string;
  correctCount: number;
  incorrectCount: number;
  lastPracticed: string;
  needsReview: boolean;
  reviewAttempts: number;
}

export interface QuizState {
  currentVocabIndex: number;
  currentQuizType: 'meaning' | 'fill-blank';
  wrongVocabs: VocabularyItem[];
  reviewMode: boolean;
  completedQuizzes: {
    vocabularyId: string;
    quizType: string;
    isCorrect: boolean;
    timestamp: string;
  }[];
  reviewStartTime: number | null;
}

export interface DailyChat {
  id: string;
  date: string;
  summary: string;
  messages: Message[];
  characterThoughts?: CharacterThought[];
  vocabularies?: VocabularyItem[];
  vocabularyProgress?: VocabularyProgress[];
  reviewSchedule?: VocabularyReview[];
}

export type ChatJournal = DailyChat[];

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null; // ISO date string (YYYY-MM-DD)
  streakHistory: {
    date: string; // ISO date string
    activityType: 'chat' | 'review' | 'learn'; // Type of activity completed
  }[];
}

export interface SavedData {
  version: 5;
  journal: ChatJournal;
  characters: Character[];
  activeCharacterIds: string[];
  context: string;
  relationshipSummary?: string;
  streak?: StreakData;
}