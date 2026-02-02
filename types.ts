
export type Sender = 'user' | 'bot';

export interface RelationInfo {
  opinion: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  closeness?: number;
}

// ElevenLabs Voice Settings - configurable per character
export interface VoiceSettings {
  speed: number;           // 0.25 - 4.0, default 0.8
  stability: number;       // 0 - 1, default 0.8
  similarity_boost: number; // 0 - 1, default 0.75
  style: number;           // 0 - 1, default 0.3
  use_speaker_boost: boolean; // default true
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  speed: 0.8,
  stability: 0.8,
  similarity_boost: 0.75,
  style: 0.3,
  use_speaker_boost: true,
};

export interface Character {
  id: string;
  name: string;
  personality: string;
  appearance?: string;
  gender: 'male' | 'female';
  voiceName?: string;
  pitch?: number;
  speakingRate?: number;
  avatar?: string;
  relations?: { [targetCharacterId: string]: RelationInfo };
  userOpinion?: RelationInfo;
  voiceSettings?: VoiceSettings; // ElevenLabs voice settings
}

export type ChatType = 'public' | 'private';

export interface Message {
  id: string;
  text: string;
  sender: Sender;
  characterName?: string;
  audioData?: string;
  translation?: string;
  isError?: boolean;
  rawText?: string;
  imageUrl?: string;
  // Voice message fields
  kind?: 'text' | 'voice';
  audioId?: string; // GUID from server for user voice messages
  audioDuration?: number; // Duration in seconds
  transcript?: string; // Transcribed text from Gemini
  // Private chat fields
  chatType?: ChatType; // 'public' (default) or 'private'
  privateWithCharacterId?: string; // Character ID for private chat
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

// FSRS Rating: 1=Again (Quên), 2=Hard (Nhớ qua ký ức), 3=Good (Nhớ ngay), 4=Easy (Rất dễ)
export type FSRSRating = 1 | 2 | 3 | 4;

// Vocabulary Difficulty Rating from user during learning
export type VocabularyDifficultyRating = 'very_easy' | 'easy' | 'medium' | 'hard';

export interface FSRSSettings {
  maxReviewsPerDay: number; // Default: 50
  newCardsPerDay: number; // Default: 20 - Số từ mới thêm mỗi ngày
  desiredRetention: number; // Default: 0.9 (90%)
}

export const DEFAULT_FSRS_SETTINGS: FSRSSettings = {
  maxReviewsPerDay: 50,
  newCardsPerDay: 20,
  desiredRetention: 0.9
};

// FSRS Default Parameters (v4)
export const FSRS_PARAMS = {
  w: [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755],
  DECAY: -0.5,
  FACTOR: 0.9 ** (1 / -0.5) - 1 // ≈ 19/81
};

export interface VocabularyReview {
  vocabularyId: string;
  dailyChatId: string;
  currentIntervalDays: number; // Legacy - kept for backward compatibility
  nextReviewDate: string; // ISO date
  lastReviewDate: string | null; // null nếu chưa ôn lần nào
  reviewHistory: {
    date: string;
    correctCount: number;
    incorrectCount: number;
    intervalBefore: number;
    intervalAfter: number;
    // FSRS fields (optional for backward compatibility)
    rating?: FSRSRating;
    stabilityBefore?: number;
    stabilityAfter?: number;
    difficultyBefore?: number;
    difficultyAfter?: number;
    retrievability?: number;
  }[];
  // FSRS fields
  stability?: number; // S: Days until R drops to 90%. Higher = better retention
  difficulty?: number; // D: [1, 10]. Higher = harder to remember
  lapses?: number; // Number of times rated "Again"
  // Card direction preference: 'kr-vn' = Korean→Vietnamese, 'vn-kr' = Vietnamese→Korean
  cardDirection?: 'kr-vn' | 'vn-kr';
  // Star/Favorite marking
  isStarred?: boolean; // User can mark important/favorite words
}

export interface VocabularyProgress {
  vocabularyId: string;
  correctCount: number;
  incorrectCount: number;
  lastPracticed: string;
  needsReview: boolean;
  reviewAttempts: number;
}

// Vocabulary Memory Entry - User's personal memory associated with a vocabulary
export interface VocabularyMemoryEntry {
  vocabularyId: string;
  userMemory: string; // User's personal memory/association with this word
  linkedMessageIds: string[]; // Message IDs where this word appears
  linkedDailyChatId: string; // Daily chat ID where the memory was created
  createdDate: string; // ISO date when memory was created
  updatedDate?: string; // ISO date when memory was last updated
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
  // Reference to vocabulary IDs in global vocabulary-store.json
  vocabularyIds?: string[];
}

export type ChatJournal = DailyChat[];

// ============================================================================
// Story Vocabulary Store - Centralized vocabulary storage per story
// ============================================================================

/**
 * Extended vocabulary item with storyId and dailyChatId reference
 * Stored in global vocabulary store (vocabulary-store.json)
 */
export interface StoredVocabularyItem extends VocabularyItem {
  storyId?: string; // Reference to the story where this vocabulary was created (optional for manually added)
  dailyChatId?: string; // Reference to the daily chat where this vocabulary was created (optional for manually added)
  createdDate?: string; // ISO date when vocabulary was created
  isManuallyAdded?: boolean; // True if added manually without a story
}

/**
 * Extended memory entry with no need for linkedDailyChatId (vocabulary already has it)
 */
export interface StoredVocabularyMemory {
  vocabularyId: string;
  userMemory: string;
  linkedMessageIds: string[];
  createdDate: string;
  updatedDate?: string;
}

/**
 * Global Vocabulary Store - All vocabulary data from ALL stories in one file
 * Stored as vocabulary-store.json in the data folder
 */
export interface VocabularyStore {
  version: number; // Store format version
  // All vocabularies from all stories
  vocabularies: StoredVocabularyItem[];
  // All review schedules (FSRS data)
  reviews: VocabularyReview[];
  // All user memories
  memories: StoredVocabularyMemory[];
  // All progress data (indexed by vocabularyId)
  progress: { [vocabularyId: string]: VocabularyProgress };
}

export interface TaskProgress {
  learnedCount: number;        // Words learned today
  reviewDueCount: number;      // Words still due for review
}

export interface DailyTaskItem {
  id: string; // 'learn' or 'review'
  type: 'count' | 'completed';
  target: number;
  label: string;
  enabled: boolean;
}

export type DailyTaskConfig = DailyTaskItem[];

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null; // ISO date string (YYYY-MM-DD)
  taskProgress?: TaskProgress;  // Task progress for the current day
  lastProgressDate?: string | null; // Date when taskProgress was last updated (important for partial progress persistence)
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
  version: 6;
  journal: ChatJournal;
  characters: Character[];
  activeCharacterIds: string[];
  context: string;
  relationshipSummary?: string;
  currentLevel?: KoreanLevel;
  pendingReviewVocabularyIds?: string[]; // IDs of vocabularies being reviewed in current chat session
  realtimeContext?: string; // Ngữ cảnh realtime có thể thay đổi trong lúc chat
  storyPlot?: string; // Mô tả cốt truyện
  fsrsSettings?: FSRSSettings; // FSRS algorithm settings
  chatReviewVocabularies?: VocabularyItem[]; // Manually selected vocabularies for chat review
  // Note: vocabularyStore is now a separate global file (vocabulary-store.json)
}

// Story types for multi-story support
export interface StoryMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  charactersPreview: string[]; // First 3 character names for preview
  messageCount: number;
}

export interface StoriesIndex {
  stories: StoryMeta[];
  lastOpenedStoryId?: string;
}

// Vocabulary Collection Types (Thu thập từ vựng)
export interface CollectionVocabularyItem {
  id: string;
  korean: string;
  vietnamese: string;
}

export interface CollectionReview {
  vocabularyId: string;
  currentIntervalDays: number;
  nextReviewDate: string; // ISO date
  lastReviewDate: string | null;
  reviewHistory: {
    date: string;
    rating: FSRSRating;
    stabilityBefore: number;
    stabilityAfter: number;
    difficultyBefore: number;
    difficultyAfter: number;
  }[];
  stability?: number;
  difficulty?: number;
  lapses?: number;
}

export interface CollectionSettings {
  wordsPerDay: number; // 10-200
  requestRetention: number; // 0.7-0.97 (70%-97%) - Tỉ lệ ghi nhớ mong muốn
}

export interface CollectionData {
  settings: CollectionSettings;
  reviews: CollectionReview[];
  skippedIds: string[]; // Vocabulary IDs skipped by user manually
  lastStudyDate: string; // ISO date (YYYY-MM-DD)
  todayLearnedCount: number; // Reset when date changes
  difficultToday: string[]; // Vocabulary IDs rated "hard" or "again" today
}

// AI Assistant Types
export interface AIAssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  droppedMessage?: Message; // Message dropped from chat for explanation
  timestamp: number;
}

export interface VocabularyWithStability {
  korean: string;
  stability: number;
}