import React, { useState, useCallback } from 'react';
import type { VocabularyItem, VocabularyReview, VocabularyMemoryEntry, FSRSRating, FSRSSettings } from '../types';
import { DEFAULT_FSRS_SETTINGS } from '../types';
import { updateFSRSAfterReview, calculateRetrievability } from '../utils/spacedRepetition';

interface VocabularyMemoryFlashcardProps {
  vocabulary: VocabularyItem;
  review: VocabularyReview;
  memory?: VocabularyMemoryEntry;
  settings?: FSRSSettings;
  onReviewComplete: (updatedReview: VocabularyReview, rating: FSRSRating) => void;
  onSkip: () => void;
  currentIndex: number;
  totalCount: number;
}

type FlashcardState = 'word' | 'memory' | 'answer';

export const VocabularyMemoryFlashcard: React.FC<VocabularyMemoryFlashcardProps> = ({
  vocabulary,
  review,
  memory,
  settings = DEFAULT_FSRS_SETTINGS,
  onReviewComplete,
  onSkip,
  currentIndex,
  totalCount
}) => {
  const [state, setState] = useState<FlashcardState>('word');
  const [isAnimating, setIsAnimating] = useState(false);

  // Calculate current retrievability for display
  const getRetrievabilityInfo = useCallback(() => {
    if (!review.stability || review.stability === 0) {
      return { percentage: 0, status: 'new', color: '#888' };
    }

    const lastReview = review.lastReviewDate ? new Date(review.lastReviewDate) : new Date();
    const now = new Date();
    const elapsedDays = Math.max(0, (now.getTime() - lastReview.getTime()) / (1000 * 60 * 60 * 24));
    const r = calculateRetrievability(review.stability, elapsedDays);
    const percentage = Math.round(r * 100);

    let status = '';
    let color = '';
    if (percentage >= 90) {
      status = 'strong';
      color = '#4ade80';
    } else if (percentage >= 70) {
      status = 'good';
      color = '#facc15';
    } else if (percentage >= 50) {
      status = 'weak';
      color = '#fb923c';
    } else {
      status = 'critical';
      color = '#ef4444';
    }

    return { percentage, status, color };
  }, [review]);

  const retrievabilityInfo = getRetrievabilityInfo();

  // Handle showing memory
  const handleShowMemory = useCallback(() => {
    setIsAnimating(true);
    setTimeout(() => {
      setState('memory');
      setIsAnimating(false);
    }, 150);
  }, []);

  // Handle showing answer
  const handleShowAnswer = useCallback(() => {
    setIsAnimating(true);
    setTimeout(() => {
      setState('answer');
      setIsAnimating(false);
    }, 150);
  }, []);

  // Handle rating
  const handleRating = useCallback((rating: FSRSRating) => {
    const updatedReview = updateFSRSAfterReview(review, rating, settings);
    onReviewComplete(updatedReview, rating);
    
    // Reset state for next card
    setState('word');
  }, [review, settings, onReviewComplete]);

  // Get rating button info
  const getRatingInfo = (rating: FSRSRating) => {
    switch (rating) {
      case 1: // Again
        return {
          label: '😔 Quên',
          sublabel: '~1 ngày',
          color: '#ef4444',
          bgColor: 'rgba(239, 68, 68, 0.2)'
        };
      case 2: // Hard
        return {
          label: '🤔 Nhớ qua ký ức',
          sublabel: `~${Math.max(1, Math.round((review.stability || 1) * 0.6))} ngày`,
          color: '#fb923c',
          bgColor: 'rgba(251, 146, 60, 0.2)'
        };
      case 3: // Good
        return {
          label: '😊 Nhớ ngay',
          sublabel: `~${Math.max(1, Math.round((review.stability || 1) * 1.5))} ngày`,
          color: '#4ade80',
          bgColor: 'rgba(74, 222, 128, 0.2)'
        };
    }
  };

  return (
    <div className="vocabulary-memory-flashcard">
      {/* Progress */}
      <div className="flashcard-progress">
        <div className="progress-text">
          {currentIndex + 1} / {totalCount}
        </div>
        <div className="progress-bar">
          <div 
            className="progress-fill"
            style={{ width: `${((currentIndex + 1) / totalCount) * 100}%` }}
          />
        </div>
      </div>

      {/* Card */}
      <div className={`flashcard ${isAnimating ? 'animating' : ''}`}>
        {/* Retrievability Badge */}
        {review.stability !== undefined && review.stability > 0 && (
          <div 
            className="retrievability-badge"
            style={{ borderColor: retrievabilityInfo.color }}
          >
            <span style={{ color: retrievabilityInfo.color }}>
              {retrievabilityInfo.percentage}%
            </span>
            <span className="badge-label">khả năng nhớ</span>
          </div>
        )}

        {/* Card Content */}
        <div className="card-content">
          {/* Word - Always visible */}
          <div className="word-section">
            <div className="korean-word">{vocabulary.korean}</div>
          </div>

          {/* Memory - Visible in 'memory' and 'answer' states */}
          {(state === 'memory' || state === 'answer') && (
            <div className="memory-section">
              {memory ? (
                <>
                  <div className="section-label">💭 Ký ức của bạn:</div>
                  <div className="memory-text">{memory.userMemory}</div>
                </>
              ) : (
                <div className="no-memory">
                  <span>📝 Chưa có ký ức</span>
                  <span className="hint">Bạn có thể thêm ký ức sau khi ôn tập</span>
                </div>
              )}
            </div>
          )}

          {/* Answer - Visible in 'answer' state */}
          {state === 'answer' && (
            <div className="answer-section">
              <div className="section-label">📖 Nghĩa:</div>
              <div className="vietnamese-word">{vocabulary.vietnamese}</div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="card-actions">
          {state === 'word' && (
            <>
              <button 
                className="action-btn memory-btn"
                onClick={handleShowMemory}
              >
                💭 Xem ký ức
              </button>
              <button 
                className="action-btn answer-btn"
                onClick={handleShowAnswer}
              >
                👁️ Xem đáp án
              </button>
            </>
          )}

          {state === 'memory' && (
            <button 
              className="action-btn answer-btn full-width"
              onClick={handleShowAnswer}
            >
              👁️ Xem đáp án
            </button>
          )}

          {state === 'answer' && (
            <div className="rating-buttons">
              {([1, 2, 3] as FSRSRating[]).map(rating => {
                const info = getRatingInfo(rating);
                return (
                  <button
                    key={rating}
                    className="rating-btn"
                    style={{ 
                      borderColor: info.color,
                      backgroundColor: info.bgColor
                    }}
                    onClick={() => handleRating(rating)}
                  >
                    <span className="rating-label">{info.label}</span>
                    <span className="rating-sublabel">{info.sublabel}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Skip Button */}
      <button className="skip-btn" onClick={onSkip}>
        Bỏ qua →
      </button>

      {/* Stats */}
      <div className="card-stats">
        <div className="stat-item">
          <span className="stat-label">Stability</span>
          <span className="stat-value">{(review.stability || 0).toFixed(1)} ngày</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Difficulty</span>
          <span className="stat-value">{(review.difficulty || 5).toFixed(1)}/10</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Lapses</span>
          <span className="stat-value">{review.lapses || 0}</span>
        </div>
      </div>

      <style>{`
        .vocabulary-memory-flashcard {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px;
          min-height: 100%;
        }

        .flashcard-progress {
          width: 100%;
          max-width: 400px;
          margin-bottom: 20px;
        }

        .progress-text {
          text-align: center;
          color: #888;
          font-size: 14px;
          margin-bottom: 8px;
        }

        .progress-bar {
          height: 4px;
          background: #333;
          border-radius: 2px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #667eea, #764ba2);
          border-radius: 2px;
          transition: width 0.3s ease;
        }

        .flashcard {
          width: 100%;
          max-width: 400px;
          background: #16213e;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          transition: transform 0.15s ease, opacity 0.15s ease;
          position: relative;
        }

        .flashcard.animating {
          transform: scale(0.98);
          opacity: 0.8;
        }

        .retrievability-badge {
          position: absolute;
          top: -12px;
          right: 20px;
          background: #1a1a2e;
          border: 2px solid;
          border-radius: 20px;
          padding: 4px 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .retrievability-badge span:first-child {
          font-size: 16px;
          font-weight: bold;
        }

        .badge-label {
          font-size: 10px;
          color: #888 !important;
        }

        .card-content {
          min-height: 200px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .word-section {
          text-align: center;
          padding: 20px 0;
        }

        .korean-word {
          font-size: 48px;
          color: #fff;
          font-weight: bold;
        }

        .memory-section {
          padding: 16px;
          background: rgba(102, 126, 234, 0.1);
          border-radius: 12px;
          border-left: 3px solid #667eea;
        }

        .section-label {
          font-size: 12px;
          color: #888;
          margin-bottom: 8px;
        }

        .memory-text {
          color: #ddd;
          font-size: 15px;
          line-height: 1.6;
        }

        .no-memory {
          display: flex;
          flex-direction: column;
          align-items: center;
          color: #666;
          padding: 8px;
        }

        .no-memory .hint {
          font-size: 12px;
          margin-top: 4px;
        }

        .answer-section {
          padding: 16px;
          background: rgba(74, 222, 128, 0.1);
          border-radius: 12px;
          border-left: 3px solid #4ade80;
          text-align: center;
        }

        .vietnamese-word {
          font-size: 24px;
          color: #4ade80;
          font-weight: 600;
        }

        .card-actions {
          margin-top: 24px;
          display: flex;
          gap: 12px;
        }

        .action-btn {
          flex: 1;
          padding: 14px 16px;
          border: none;
          border-radius: 10px;
          font-size: 15px;
          cursor: pointer;
          transition: transform 0.2s, opacity 0.2s;
        }

        .action-btn:hover {
          transform: translateY(-2px);
        }

        .action-btn:active {
          transform: translateY(0);
        }

        .memory-btn {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .answer-btn {
          background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
          color: #000;
        }

        .action-btn.full-width {
          flex: none;
          width: 100%;
        }

        .rating-buttons {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
        }

        .rating-btn {
          width: 100%;
          padding: 14px 16px;
          background: transparent;
          border: 2px solid;
          border-radius: 10px;
          cursor: pointer;
          transition: transform 0.2s, background 0.2s;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .rating-btn:hover {
          transform: translateY(-2px);
        }

        .rating-label {
          font-size: 16px;
          color: #fff;
        }

        .rating-sublabel {
          font-size: 12px;
          color: #888;
          margin-top: 2px;
        }

        .skip-btn {
          margin-top: 16px;
          padding: 8px 16px;
          background: none;
          border: none;
          color: #666;
          font-size: 14px;
          cursor: pointer;
          transition: color 0.2s;
        }

        .skip-btn:hover {
          color: #888;
        }

        .card-stats {
          margin-top: 24px;
          display: flex;
          gap: 20px;
          padding: 12px 20px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .stat-label {
          font-size: 11px;
          color: #666;
          text-transform: uppercase;
        }

        .stat-value {
          font-size: 14px;
          color: #aaa;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
};

export default VocabularyMemoryFlashcard;
