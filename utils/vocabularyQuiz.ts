import type { VocabularyItem, VocabularyProgress, QuizState, Message } from '../types';

export interface MeaningQuiz {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface FillBlankQuiz {
  messageId: string;
  originalText: string;
  blankedText: string;
  options: string[];
  correctIndex: number;
}

/**
 * Generate a meaning quiz question (Korean word -> Vietnamese meaning)
 */
export function generateMeaningQuiz(
  vocab: VocabularyItem,
  allVocabs: VocabularyItem[]
): MeaningQuiz {
  // Get 3 random wrong answers from other vocabularies
  const otherVocabs = allVocabs.filter(v => v.id !== vocab.id);
  const wrongAnswers = shuffleArray(otherVocabs)
    .slice(0, 3)
    .map(v => v.vietnamese);

  // Add correct answer
  const allOptions = [...wrongAnswers, vocab.vietnamese];
  const shuffledOptions = shuffleArray(allOptions);
  const correctIndex = shuffledOptions.indexOf(vocab.vietnamese);

  return {
    question: `Nghĩa của "${vocab.korean}" là gì?`,
    options: shuffledOptions,
    correctIndex
  };
}

/**
 * Generate a fill-in-the-blank quiz question
 */
export function generateFillBlankQuiz(
  vocab: VocabularyItem,
  messages: Message[],
  allVocabs: VocabularyItem[]
): FillBlankQuiz {
  // Safety check for usageMessageIds
  if (!vocab.usageMessageIds || vocab.usageMessageIds.length === 0) {
    throw new Error('No usage message IDs found for vocabulary');
  }
  
  // Get messages containing the vocabulary that have audio
  const usageMessages = messages.filter(m => 
    vocab.usageMessageIds.includes(m.id) && m.audioData
  );
  
  if (usageMessages.length === 0) {
    throw new Error('No usage messages with audio found for vocabulary');
  }

  const selectedMessage = usageMessages[Math.floor(Math.random() * usageMessages.length)];
  const originalText = selectedMessage.text;

  // Replace the vocabulary word with blank
  const blankedText = originalText.replace(vocab.korean, '___');

  // Get 3 random wrong answers (Korean words from other vocabularies)
  const otherVocabs = allVocabs.filter(v => v.id !== vocab.id);
  const wrongAnswers = shuffleArray(otherVocabs)
    .slice(0, 3)
    .map(v => v.korean);

  // Add correct answer
  const allOptions = [...wrongAnswers, vocab.korean];
  const shuffledOptions = shuffleArray(allOptions);
  const correctIndex = shuffledOptions.indexOf(vocab.korean);

  return {
    messageId: selectedMessage.id,
    originalText,
    blankedText,
    options: shuffledOptions,
    correctIndex
  };
}

/**
 * Check if it's time to start review mode
 */
export function shouldStartReview(quizState: QuizState): boolean {
  // If no wrong vocabs, no need to review
  if (quizState.wrongVocabs.length === 0) {
    return false;
  }

  // If already in review mode, stay in review mode
  if (quizState.reviewMode) {
    return true;
  }

  // Start review if 5 minutes have passed since first wrong answer
  if (quizState.reviewStartTime) {
    const fiveMinutesInMs = 5 * 60 * 1000;
    const timePassed = Date.now() - quizState.reviewStartTime;
    return timePassed >= fiveMinutesInMs;
  }

  return false;
}

/**
 * Check if a vocabulary can be reviewed again (max 3 attempts)
 */
export function canReviewAgain(progress: VocabularyProgress): boolean {
  return progress.reviewAttempts < 3;
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
 * Calculate vocabulary progress after quiz completion
 */
export function calculateProgress(
  vocabularyId: string,
  quizResults: { vocabularyId: string; quizType: string; isCorrect: boolean }[],
  existingProgress?: VocabularyProgress
): VocabularyProgress {
  const vocabResults = quizResults.filter(r => r.vocabularyId === vocabularyId);
  const correctCount = vocabResults.filter(r => r.isCorrect).length;
  const incorrectCount = vocabResults.filter(r => !r.isCorrect).length;
  const needsReview = incorrectCount > 0;

  return {
    vocabularyId,
    correctCount: (existingProgress?.correctCount || 0) + correctCount,
    incorrectCount: (existingProgress?.incorrectCount || 0) + incorrectCount,
    lastPracticed: new Date().toISOString(),
    needsReview,
    reviewAttempts: existingProgress?.reviewAttempts || 0
  };
}
