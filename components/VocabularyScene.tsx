import React, { useState, useEffect } from 'react';
import type { VocabularyItem, QuizState, Message } from '../types';
import { generateMeaningQuiz, generateFillBlankQuiz, shouldStartReview, type MeaningQuiz, type FillBlankQuiz } from '../utils/vocabularyQuiz';

interface VocabularySceneProps {
  vocabularies: VocabularyItem[];
  messages: Message[];
  quizState: QuizState;
  onUpdateQuizState: (state: QuizState) => void;
  onViewContext: (vocabulary: VocabularyItem, usageIndex: number) => void;
  onComplete: () => void;
  onBack: () => void;
  onReplayAudio: (audioData: string, characterName?: string) => void;
}

export const VocabularyScene: React.FC<VocabularySceneProps> = ({
  vocabularies,
  messages,
  quizState,
  onUpdateQuizState,
  onViewContext,
  onComplete,
  onBack,
  onReplayAudio
}) => {
  const [currentQuiz, setCurrentQuiz] = useState<MeaningQuiz | FillBlankQuiz | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  // Get current vocabulary list (review mode or normal mode)
  const getCurrentVocabularies = (): VocabularyItem[] => {
    if (quizState.reviewMode) {
      return quizState.wrongVocabs;
    }
    return vocabularies;
  };

  const currentVocabs = getCurrentVocabularies();
  const currentVocab = currentVocabs[quizState.currentVocabIndex];

  // Calculate total quizzes (2 per vocabulary)
  const totalQuizzes = currentVocabs.length * 2;
  const completedCount = quizState.completedQuizzes.filter(q => {
    const vocabIds = currentVocabs.map(v => v.id);
    return vocabIds.includes(q.vocabularyId);
  }).length;

  // Generate quiz when vocab or quiz type changes
  useEffect(() => {
    if (!currentVocab) {
      // All quizzes completed
      onComplete();
      return;
    }

    try {
      if (quizState.currentQuizType === 'meaning') {
        const quiz = generateMeaningQuiz(currentVocab, vocabularies);
        setCurrentQuiz(quiz);
      } else {
        const quiz = generateFillBlankQuiz(currentVocab, messages, vocabularies);
        setCurrentQuiz(quiz);
      }
      setSelectedAnswer(null);
      setShowResult(false);
    } catch (error) {
      console.error('Failed to generate quiz:', error);
      // If fill-blank fails, skip to next vocab
      handleNext();
    }
  }, [quizState.currentVocabIndex, quizState.currentQuizType, currentVocab]);

  const handleAnswerSelect = (index: number) => {
    if (showResult) return; // Already answered
    setSelectedAnswer(index);
  };

  const handleSubmit = () => {
    if (selectedAnswer === null || !currentQuiz) return;

    const correct = selectedAnswer === currentQuiz.correctIndex;
    setIsCorrect(correct);
    setShowResult(true);

    // Record the result
    const newCompletedQuizzes = [
      ...quizState.completedQuizzes,
      {
        vocabularyId: currentVocab.id,
        quizType: quizState.currentQuizType,
        isCorrect: correct,
        timestamp: new Date().toISOString()
      }
    ];

    // If incorrect and not already in wrongVocabs, add it
    let newWrongVocabs = [...quizState.wrongVocabs];
    if (!correct && !newWrongVocabs.find(v => v.id === currentVocab.id)) {
      newWrongVocabs.push(currentVocab);
    }

    // Set reviewStartTime if this is the first wrong answer
    let newReviewStartTime = quizState.reviewStartTime;
    if (!correct && !newReviewStartTime) {
      newReviewStartTime = Date.now();
    }

    onUpdateQuizState({
      ...quizState,
      completedQuizzes: newCompletedQuizzes,
      wrongVocabs: newWrongVocabs,
      reviewStartTime: newReviewStartTime
    });
  };

  const handleNext = () => {
    if (!showResult) return;

    // Determine next quiz
    if (quizState.currentQuizType === 'meaning') {
      // Move to fill-blank for same vocabulary
      onUpdateQuizState({
        ...quizState,
        currentQuizType: 'fill-blank'
      });
    } else {
      // Move to next vocabulary, back to meaning quiz
      const nextIndex = quizState.currentVocabIndex + 1;

      // Check if we should start review mode
      if (nextIndex >= currentVocabs.length) {
        if (!quizState.reviewMode && shouldStartReview(quizState) && quizState.wrongVocabs.length > 0) {
          // Start review mode
          onUpdateQuizState({
            ...quizState,
            currentVocabIndex: 0,
            currentQuizType: 'meaning',
            reviewMode: true
          });
          return;
        }
        // All done
        onComplete();
        return;
      }

      onUpdateQuizState({
        ...quizState,
        currentVocabIndex: nextIndex,
        currentQuizType: 'meaning'
      });
    }
  };

  const handleViewContext = () => {
    if (!currentVocab) return;
    onViewContext(currentVocab, 0);
  };

  if (!currentVocab || !currentQuiz) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <svg className="animate-spin h-10 w-10 text-blue-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-4 text-gray-600">Đang tải bài tập...</p>
        </div>
      </div>
    );
  }

  const isMeaningQuiz = quizState.currentQuizType === 'meaning';
  const fillBlankQuiz = !isMeaningQuiz ? (currentQuiz as FillBlankQuiz) : null;

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white p-4 shadow-lg">
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
            {quizState.reviewMode ? (
              <span className="bg-orange-500 text-white px-3 py-1 rounded-full text-sm font-semibold">
                🔄 Ôn tập
              </span>
            ) : (
              <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-semibold">
                🆕 Học mới
              </span>
            )}
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
      </header>

      {/* Quiz Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">
            {isMeaningQuiz ? (
              <>Nghĩa của <span className="text-purple-600">"{currentVocab.korean}"</span> là gì?</>
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
                  const message = messages.find(m => m.id === fillBlankQuiz.messageId);
                  if (message?.audioData) {
                    onReplayAudio(message.audioData, message.characterName);
                  }
                }}
                className="w-full py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium flex items-center justify-center space-x-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                <span>Nghe câu này</span>
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
                buttonClass += "bg-purple-100 border-purple-500 text-purple-800";
              } else {
                buttonClass += "bg-white border-gray-300 hover:border-purple-400 hover:bg-purple-50";
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
            className="w-full py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
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
