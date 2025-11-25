import React, { useState, useEffect, useMemo } from 'react';
import type { VocabularyItem, VocabularyReview, Message, DailyChat } from '../types';
import { generateMeaningQuiz, generateFillBlankQuiz, type MeaningQuiz, type FillBlankQuiz } from '../utils/vocabularyQuiz';
import { ChatContextViewer } from './ChatContextViewer';

interface ReviewItem {
  vocabulary: VocabularyItem;
  review: VocabularyReview;
  dailyChat: DailyChat;
  messages: Message[];
}

interface QuizItem {
  reviewItem: ReviewItem;
  quizType: 'meaning' | 'fill-blank';
}

interface ReviewSceneProps {
  reviewItems: ReviewItem[];
  onComplete: (results: { vocabularyId: string; correctCount: number; incorrectCount: number }[]) => void;
  onBack: () => void;
  onReplayAudio: (audioData: string, characterName?: string) => void;
  onViewContext: (vocabulary: VocabularyItem, usageIndex: number) => void;
}

export const ReviewScene: React.FC<ReviewSceneProps> = ({
  reviewItems,
  onComplete,
  onBack,
  onReplayAudio,
  onViewContext
}) => {
  // Create shuffled quiz list once when component mounts
  const shuffledQuizzes = useMemo(() => {
    const quizzes: QuizItem[] = [];
    
    // Create 2 quizzes for each vocabulary
    for (const item of reviewItems) {
      quizzes.push({ reviewItem: item, quizType: 'meaning' });
      quizzes.push({ reviewItem: item, quizType: 'fill-blank' });
    }
    
    // Shuffle using Fisher-Yates algorithm
    for (let i = quizzes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [quizzes[i], quizzes[j]] = [quizzes[j], quizzes[i]];
    }
    
    return quizzes;
  }, [reviewItems]);

  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [currentQuiz, setCurrentQuiz] = useState<MeaningQuiz | FillBlankQuiz | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  
  // Track results for each vocabulary
  const [results, setResults] = useState<Map<string, { correct: number; incorrect: number }>>(new Map());

  // Context view state
  const [contextViewState, setContextViewState] = useState<{
    vocabulary: VocabularyItem;
    currentUsageIndex: number;
    messages: Message[];
  } | null>(null);

  const currentQuizItem = shuffledQuizzes[currentQuizIndex];
  const totalQuizzes = shuffledQuizzes.length;
  const completedCount = currentQuizIndex;

  // Generate quiz when quiz index changes
  useEffect(() => {
    if (!currentQuizItem) {
      return;
    }

    try {
      const allVocabs = reviewItems.map(item => item.vocabulary);
      
      if (currentQuizItem.quizType === 'meaning') {
        const quiz = generateMeaningQuiz(currentQuizItem.reviewItem.vocabulary, allVocabs);
        setCurrentQuiz(quiz);
      } else {
        const quiz = generateFillBlankQuiz(
          currentQuizItem.reviewItem.vocabulary,
          currentQuizItem.reviewItem.messages,
          allVocabs
        );
        setCurrentQuiz(quiz);
      }
      setSelectedAnswer(null);
      setShowResult(false);
    } catch (error) {
      console.error('Failed to generate quiz:', error);
      handleNext();
    }
  }, [currentQuizIndex, currentQuizItem, reviewItems]);

  const handleAnswerSelect = (index: number) => {
    if (showResult) return;
    setSelectedAnswer(index);
  };

  const handleSubmit = () => {
    if (selectedAnswer === null || !currentQuiz || !currentQuizItem) return;

    const correct = selectedAnswer === currentQuiz.correctIndex;
    setIsCorrect(correct);
    setShowResult(true);

    // Update results
    const vocabId = currentQuizItem.reviewItem.vocabulary.id;
    const current = results.get(vocabId) || { correct: 0, incorrect: 0 };
    
    if (correct) {
      current.correct++;
    } else {
      current.incorrect++;
    }
    
    setResults(new Map(results.set(vocabId, current)));
  };

  const handleViewContext = () => {
    if (!currentQuizItem) return;
    // Show context locally instead of calling parent handler to preserve state
    setContextViewState({
      vocabulary: currentQuizItem.reviewItem.vocabulary,
      currentUsageIndex: 0,
      messages: currentQuizItem.reviewItem.messages
    });
  };

  const handleCloseContext = () => {
    setContextViewState(null);
  };

  const handleContextNavigate = (direction: 'prev' | 'next') => {
    if (!contextViewState) return;

    const newIndex = direction === 'prev' 
      ? Math.max(0, contextViewState.currentUsageIndex - 1)
      : contextViewState.currentUsageIndex + 1;

    setContextViewState({
      ...contextViewState,
      currentUsageIndex: newIndex
    });
  };

  const handleNext = () => {
    if (!showResult && selectedAnswer !== null) {
      handleSubmit();
      return;
    }

    // Move to next quiz
    const nextIndex = currentQuizIndex + 1;

    if (nextIndex >= shuffledQuizzes.length) {
      // All done - convert results to array and complete
      const resultsArray = Array.from(results.entries()).map(([vocabularyId, counts]) => ({
        vocabularyId,
        correctCount: counts.correct,
        incorrectCount: counts.incorrect
      }));
      onComplete(resultsArray);
      return;
    }

    setCurrentQuizIndex(nextIndex);
  };

  if (contextViewState) {
    return (
      <ChatContextViewer
        messages={contextViewState.messages}
        vocabulary={contextViewState.vocabulary}
        currentUsageIndex={contextViewState.currentUsageIndex}
        onNavigate={handleContextNavigate}
        onClose={handleCloseContext}
        onReplayAudio={onReplayAudio}
      />
    );
  }

  if (!currentQuizItem || !currentQuiz) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <svg className="animate-spin h-10 w-10 text-purple-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-4 text-gray-600">Đang tải bài ôn tập...</p>
        </div>
      </div>
    );
  }

  const isMeaningQuiz = currentQuizItem.quizType === 'meaning';
  const fillBlankQuiz = !isMeaningQuiz ? (currentQuiz as FillBlankQuiz) : null;

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={onBack}
              className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
              title="Quay lại"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <span className="bg-white/20 text-white px-3 py-1 rounded-full text-sm font-semibold">
              🔄 Ôn tập
            </span>
          </div>
          <div className="text-right">
            <div className="text-sm opacity-90">Tiến độ</div>
            <div className="text-lg font-bold">{completedCount}/{totalQuizzes}</div>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="mt-3 bg-white/30 rounded-full h-2 overflow-hidden">
          <div 
            className="bg-white h-full transition-all duration-300"
            style={{ width: `${(completedCount / totalQuizzes) * 100}%` }}
          />
        </div>

        {/* Review info */}
        <div className="mt-2 text-xs opacity-80">
          Lần ôn: {currentQuizItem.reviewItem.review.totalReviews + 1} | 
          Interval hiện tại: {currentQuizItem.reviewItem.review.currentIntervalDays} ngày
        </div>
      </header>

      {/* Quiz Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">
            {isMeaningQuiz ? (
              <>Nghĩa của <span className="text-orange-600">"{currentQuizItem.reviewItem.vocabulary.korean}"</span> là gì?</>
            ) : (
              <>Điền từ vào chỗ trống:</>
            )}
          </h2>

          {/* Fill-blank sentence display */}
          {fillBlankQuiz && fillBlankQuiz.blankedText && (
            <div className="mb-6 space-y-3">
              <div className="p-4 bg-gray-100 rounded-lg">
                <p className="text-lg text-gray-800">
                  {fillBlankQuiz.blankedText.split('___').map((part, i, arr) => (
                    <React.Fragment key={i}>
                      {part}
                      {i < arr.length - 1 && (
                        <span className="inline-block bg-yellow-200 px-3 py-1 mx-1 rounded border-2 border-yellow-400 font-bold">
                          ___
                        </span>
                      )}
                    </React.Fragment>
                  ))}
                </p>
              </div>
              <button
                onClick={() => {
                  const message = currentQuizItem.reviewItem.messages.find(m => m.id === fillBlankQuiz.messageId);
                  if (message?.audioData) {
                    onReplayAudio(message.audioData, message.characterName);
                  }
                }}
                className="w-full py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium flex items-center justify-center space-x-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                <span>🔊 Nghe câu này</span>
              </button>
            </div>
          )}

          {/* Answer options */}
          <div className="grid grid-cols-1 gap-3">
            {currentQuiz.options.map((option, index) => {
              const isSelected = selectedAnswer === index;
              const isCorrectAnswer = index === currentQuiz.correctIndex;
              const showCorrect = showResult && isCorrectAnswer;
              const showWrong = showResult && isSelected && !isCorrect;

              let buttonClass = "w-full p-4 text-left rounded-lg border-2 transition-all ";
              if (showCorrect) {
                buttonClass += "bg-green-100 border-green-500 text-green-800";
              } else if (showWrong) {
                buttonClass += "bg-red-100 border-red-500 text-red-800";
              } else if (isSelected) {
                buttonClass += "bg-orange-100 border-orange-500 text-orange-800";
              } else {
                buttonClass += "bg-white border-gray-300 hover:border-orange-400 hover:bg-orange-50";
              }

              return (
                <button
                  key={index}
                  onClick={() => handleAnswerSelect(index)}
                  disabled={showResult}
                  className={buttonClass}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-medium">{option}</span>
                    {showCorrect && <span className="text-2xl">✓</span>}
                    {showWrong && <span className="text-2xl">✗</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Result feedback */}
        {showResult && (
          <div className={`p-4 rounded-lg mb-4 ${isCorrect ? 'bg-green-100 border-2 border-green-500' : 'bg-red-100 border-2 border-red-500'}`}>
            <p className={`text-lg font-bold ${isCorrect ? 'text-green-800' : 'text-red-800'}`}>
              {isCorrect ? '✓ Chính xác!' : `✗ Sai rồi! Đáp án đúng là: ${currentQuiz.options[currentQuiz.correctIndex]}`}
            </p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="p-4 bg-gray-50 border-t border-gray-200 space-y-3">
        <button
          onClick={handleViewContext}
          className="w-full py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium flex items-center justify-center space-x-2"
        >
          <span>📖</span>
          <span>Xem trong câu</span>
        </button>

        {!showResult ? (
          <button
            onClick={handleSubmit}
            disabled={selectedAnswer === null}
            className="w-full py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Kiểm tra
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="w-full py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium flex items-center justify-center space-x-2"
          >
            <span>Tiếp theo</span>
            <span>➡️</span>
          </button>
        )}
      </div>
    </div>
  );
};
