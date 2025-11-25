
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

export type KoreanLevel = 'A0' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface LevelInfo {
  level: KoreanLevel;
  name: string;
  description: string;
  maxWords: number; // Max words per sentence
  grammarComplexity: string;
}

export const KOREAN_LEVELS: Record<KoreanLevel, LevelInfo> = {
  'A0': {
    level: 'A0',
    name: 'Absolute Beginner',
    description: 'Từ đơn giản, câu rất ngắn (2-3 từ)',
    maxWords: 3,
    grammarComplexity: 'Chỉ dùng câu đơn giản, hiện tại. Tránh ngữ pháp phức tạp.'
  },
  'A1': {
    level: 'A1',
    name: 'Beginner',
    description: 'Câu ngắn cơ bản (3-5 từ)',
    maxWords: 5,
    grammarComplexity: 'Câu đơn giản, thì hiện tại và quá khứ cơ bản. Có thể dùng -고 싶다, -아/어요.'
  },
  'A2': {
    level: 'A2',
    name: 'Elementary',
    description: 'Câu trung bình (5-7 từ)',
    maxWords: 7,
    grammarComplexity: 'Câu phức đơn giản, nối câu với -고, -지만. Dùng các thì cơ bản.'
  },
  'B1': {
    level: 'B1',
    name: 'Pre-Intermediate',
    description: 'Câu dài hơn (7-10 từ)',
    maxWords: 10,
    grammarComplexity: 'Câu phức, ngữ pháp trung cấp như -(으)ㄹ 수 있다, -아/어서, -기 때문에.'
  },
  'B2': {
    level: 'B2',
    name: 'Intermediate',
    description: 'Câu phức tạp (10-12 từ)',
    maxWords: 12,
    grammarComplexity: 'Ngữ pháp cao cấp hơn, câu ghép, diễn đạt ý kiến phức tạp.'
  },
  'C1': {
    level: 'C1',
    name: 'Upper Intermediate',
    description: 'Câu dài, tự nhiên (12-15 từ)',
    maxWords: 15,
    grammarComplexity: 'Ngữ pháp nâng cao, thành ngữ, diễn đạt tinh tế.'
  },
  'C2': {
    level: 'C2',
    name: 'Advanced',
    description: 'Như người bản xứ (không giới hạn)',
    maxWords: 20,
    grammarComplexity: 'Tự nhiên hoàn toàn, dùng thành ngữ, ngữ pháp nâng cao, văn phong đa dạng.'
  }
};

export interface SavedData {
  version: 5;
  journal: ChatJournal;
  characters: Character[];
  activeCharacterIds: string[];
  context: string;
  relationshipSummary?: string;
  streak?: StreakData;
  currentLevel?: KoreanLevel;
}