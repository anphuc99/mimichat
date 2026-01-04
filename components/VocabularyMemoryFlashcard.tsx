import React, { useState, useCallback, useMemo } from 'react';
import type { VocabularyItem, VocabularyReview, VocabularyMemoryEntry, FSRSRating, FSRSSettings, DailyChat, Character, ChatJournal } from '../types';
import { DEFAULT_FSRS_SETTINGS } from '../types';
import { updateFSRSReview, calculateRetrievability } from '../utils/spacedRepetition';
import HTTPService from '../services/HTTPService';

// Helper function to escape HTML
const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

interface VocabularyMemoryFlashcardProps {
  vocabulary: VocabularyItem;
  review: VocabularyReview;
  memory?: VocabularyMemoryEntry;
  dailyChat?: DailyChat;
  journal?: ChatJournal;
  settings?: FSRSSettings;
  characters?: Character[];
  onReviewComplete: (updatedReview: VocabularyReview, rating: FSRSRating) => void;
  onSkip: () => void;
  onEditMemory?: () => void;
  onGenerateAudio?: (text: string, tone: string, voiceName: string) => Promise<string | null>;
  onPlayAudio?: (audioData: string, characterName?: string) => void;
  currentIndex: number;
  totalCount: number;
}

type FlashcardState = 'word' | 'memory' | 'answer';

export const VocabularyMemoryFlashcard: React.FC<VocabularyMemoryFlashcardProps> = ({
  vocabulary,
  review,
  memory,
  dailyChat,
  journal = [],
  settings = DEFAULT_FSRS_SETTINGS,
  characters = [],
  onReviewComplete,
  onSkip,
  onEditMemory,
  onGenerateAudio,
  onPlayAudio,
  currentIndex,
  totalCount
}) => {
  const [state, setState] = useState<FlashcardState>('word');
  const [isAnimating, setIsAnimating] = useState(false);
  const [showMemoryPopup, setShowMemoryPopup] = useState(false);
  const [showSearchPopup, setShowSearchPopup] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('');
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

  // Convert memory format [MSG:id][IMG:url] to HTML
  const processedMemoryHtml = useMemo(() => {
    if (!memory?.userMemory) return '';
    
    const baseUrl = HTTPService.getBaseUrl();
    let html = '';
    const userMemory = memory.userMemory;
    
    // Build message lookup map from dailyChat
    const messagesMap = new Map<string, { text: string; characterName: string; date: string }>();
    if (dailyChat) {
      for (const msg of dailyChat.messages) {
        messagesMap.set(msg.id, {
          text: msg.text,
          characterName: msg.sender === 'user' ? 'Bạn' : (msg.characterName || 'Bot'),
          date: dailyChat.date
        });
      }
    }
    
    // Parse [MSG:id] and [IMG:url] patterns
    const regex = /\[(MSG|IMG):([^\]]+)\]/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(userMemory)) !== null) {
      // Add text before this match
      if (match.index > lastIndex) {
        const textContent = userMemory.slice(lastIndex, match.index).trim();
        if (textContent) {
          html += `<p>${escapeHtml(textContent)}</p>`;
        }
      }

      const type = match[1];
      const value = match[2];

      if (type === 'MSG') {
        const linkedMsg = messagesMap.get(value);
        if (linkedMsg) {
          html += `
            <div class="message-block">
              <div class="message-block-header">
                <span class="character-badge">👤 ${escapeHtml(linkedMsg.characterName)}</span>
                <span class="date-badge">📅 ${escapeHtml(linkedMsg.date)}</span>
              </div>
              <div class="message-text">${escapeHtml(linkedMsg.text)}</div>
            </div>
          `;
        }
      } else if (type === 'IMG') {
        // Fix URL for dev mode
        let imgSrc = value;
        if (imgSrc.startsWith('/')) {
          imgSrc = baseUrl + imgSrc;
        } else if (imgSrc.startsWith('http://localhost')) {
          // Replace localhost URL with current baseUrl
          imgSrc = imgSrc.replace(/http:\/\/localhost:\d+/, baseUrl);
        }
        html += `<div class="memory-image"><img src="${imgSrc}" alt="Memory image" /></div>`;
      }

      lastIndex = regex.lastIndex;
    }

    // Add remaining text after last match
    if (lastIndex < userMemory.length) {
      const textContent = userMemory.slice(lastIndex).trim();
      if (textContent) {
        html += `<p>${escapeHtml(textContent)}</p>`;
      }
    }

    return html || '<p class="empty-memory">Chưa có nội dung</p>';
  }, [memory?.userMemory, dailyChat]);

  // Search for word usage in entire journal
  const wordUsageResults = useMemo(() => {
    if (!journal || journal.length === 0) return [];
    
    const koreanWord = vocabulary.korean;
    const results: {
      message: typeof journal[0]['messages'][0];
      dailyChat: typeof journal[0];
    }[] = [];
    
    for (const dc of journal) {
      for (const message of dc.messages) {
        if (message.text.includes(koreanWord)) {
          results.push({ message, dailyChat: dc });
        }
      }
    }
    
    return results;
  }, [journal, vocabulary.korean]);

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

  // Handle rating - use unified FSRS logic (same as ASK_VOCAB_DIFFICULTY)
  const handleRating = useCallback((rating: FSRSRating) => {
    const updatedReview = updateFSRSReview(review, rating, settings);
    onReviewComplete(updatedReview, rating);
    
    // Reset state for next card
    setState('word');
  }, [review, settings, onReviewComplete]);

  // Handle pronunciation
  const handlePronounce = useCallback(async () => {
    if (!onGenerateAudio || !onPlayAudio || isGeneratingAudio) return;
    
    const selectedChar = characters.find(c => c.id === selectedCharacterId);
    const voiceName = selectedChar?.voiceName || 'echo';
    
    setIsGeneratingAudio(true);
    try {
      // Use 'slowly and clearly' tone for vocabulary pronunciation
      const audioData = await onGenerateAudio(vocabulary.korean, 'slowly and clearly', voiceName);
      if (audioData) {
        onPlayAudio(audioData, selectedChar?.name);
      }
    } catch (error) {
      console.error('Failed to generate pronunciation:', error);
    } finally {
      setIsGeneratingAudio(false);
    }
  }, [onGenerateAudio, onPlayAudio, vocabulary.korean, characters, selectedCharacterId, isGeneratingAudio]);

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
            
            {/* Pronunciation controls */}
            {onGenerateAudio && onPlayAudio && characters.length > 0 && (
              <div className="pronunciation-controls">
                <select
                  className="character-select"
                  value={selectedCharacterId}
                  onChange={(e) => setSelectedCharacterId(e.target.value)}
                >
                  <option value="">Chọn giọng...</option>
                  {characters.map(char => (
                    <option key={char.id} value={char.id}>
                      {char.name}
                    </option>
                  ))}
                </select>
                <button
                  className="pronounce-btn"
                  onClick={handlePronounce}
                  disabled={isGeneratingAudio || !selectedCharacterId}
                  title="Nghe phát âm"
                >
                  {isGeneratingAudio ? '⏳' : '🔊'}
                </button>
              </div>
            )}
            
            {/* Search word in story button */}
            {journal && journal.length > 0 && (
              <button
                className="search-word-btn"
                onClick={() => setShowSearchPopup(true)}
                title={`Tìm "${vocabulary.korean}" trong story`}
              >
                🔍 Tìm trong story ({wordUsageResults.length})
              </button>
            )}
          </div>

          {/* Memory - Visible in 'memory' and 'answer' states */}
          {(state === 'memory' || state === 'answer') && (
            <div className="memory-section">
              {memory ? (
                <>
                  <div className="section-header">
                    <div className="section-label">💭 Ký ức của bạn:</div>
                    <button 
                      className="expand-memory-btn"
                      onClick={() => setShowMemoryPopup(true)}
                      title="Xem đầy đủ"
                    >
                      🔍 Xem đầy đủ
                    </button>
                  </div>
                  <div 
                    className="memory-text memory-preview"
                    dangerouslySetInnerHTML={{ __html: processedMemoryHtml }}
                  />
                </>
              ) : (
                <div className="no-memory">
                  <span>📝 Chưa có ký ức</span>
                  {onEditMemory ? (
                    <button className="add-memory-btn" onClick={onEditMemory}>
                      ✏️ Thêm ký ức ngay
                    </button>
                  ) : (
                    <span className="hint">Bạn có thể thêm ký ức sau khi ôn tập</span>
                  )}
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

      {/* Memory Popup Modal */}
      {showMemoryPopup && memory && (
        <div className="memory-popup-overlay" onClick={() => setShowMemoryPopup(false)}>
          <div className="memory-popup" onClick={e => e.stopPropagation()}>
            <div className="memory-popup-header">
              <div className="memory-popup-title">
                <span className="popup-word">{vocabulary.korean}</span>
              </div>
              <button className="popup-close-btn" onClick={() => setShowMemoryPopup(false)}>✕</button>
            </div>
            <div className="memory-popup-content">
              <div 
                className="memory-full-content"
                dangerouslySetInnerHTML={{ __html: processedMemoryHtml }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Search Word Usage Popup */}
      {showSearchPopup && (
        <div className="search-popup-overlay" onClick={() => setShowSearchPopup(false)}>
          <div className="search-popup" onClick={e => e.stopPropagation()}>
            <div className="search-popup-header">
              <div className="search-popup-title">
                🔍 "{vocabulary.korean}" trong story
              </div>
              <button className="popup-close-btn" onClick={() => setShowSearchPopup(false)}>✕</button>
            </div>
            <div className="search-popup-results">
              {wordUsageResults.length === 0 ? (
                <div className="no-results">
                  Không tìm thấy "{vocabulary.korean}" trong story nào
                </div>
              ) : (
                <div className="results-list">
                  <div className="results-count">
                    Tìm thấy {wordUsageResults.length} lần sử dụng
                  </div>
                  {wordUsageResults.map((result, index) => {
                    const dateStr = new Date(result.dailyChat.date).toLocaleDateString('vi-VN');
                    const characterName = result.message.speaker;
                    const text = result.message.text;
                    // Highlight the searched word
                    const highlightedText = text.replace(
                      new RegExp(`(${vocabulary.korean})`, 'g'),
                      '<mark class="highlight-word">$1</mark>'
                    );
                    
                    return (
                      <div key={index} className="search-result-item">
                        <div className="result-meta">
                          <span className="result-character">{characterName}</span>
                          <span className="result-date">{dateStr}</span>
                        </div>
                        <div 
                          className="result-text"
                          dangerouslySetInnerHTML={{ __html: highlightedText }}
                        />
                        {result.message.audioData && onPlayAudio && (
                          <button
                            className="result-play-btn"
                            onClick={() => onPlayAudio(result.message.audioData!, characterName)}
                            title="Nghe audio"
                          >
                            🔊
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .vocabulary-memory-flashcard {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px;
          min-height: 100%;
          overflow-y: auto;
          padding-bottom: 40px;
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
          min-height: 150px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .word-section {
          text-align: center;
          padding: 16px 0;
        }

        .korean-word {
          font-size: 42px;
          color: #fff;
          font-weight: bold;
        }

        .pronunciation-controls {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
        }

        .character-select {
          padding: 8px 12px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #fff;
          font-size: 14px;
          cursor: pointer;
          min-width: 140px;
        }

        .character-select option {
          background: #1a1a2e;
          color: #fff;
        }

        .pronounce-btn {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea, #764ba2);
          border: none;
          font-size: 20px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .pronounce-btn:hover:not(:disabled) {
          transform: scale(1.1);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .pronounce-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .memory-section {
          padding: 16px;
          background: rgba(102, 126, 234, 0.1);
          border-radius: 12px;
          border-left: 3px solid #667eea;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .section-label {
          font-size: 12px;
          color: #888;
        }

        .expand-memory-btn {
          background: rgba(102, 126, 234, 0.3);
          border: none;
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 12px;
          color: #aaa;
          cursor: pointer;
          transition: all 0.2s;
        }

        .expand-memory-btn:hover {
          background: rgba(102, 126, 234, 0.5);
          color: #fff;
        }

        .memory-text {
          color: #ddd;
          font-size: 15px;
          line-height: 1.6;
        }

        .memory-preview {
          max-height: 120px;
          overflow: hidden;
          position: relative;
        }

        .memory-preview::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 40px;
          background: linear-gradient(transparent, rgba(22, 33, 62, 0.95));
          pointer-events: none;
        }

        /* Memory content styles for both preview and popup */
        .memory-text p,
        .memory-full-content p {
          margin: 0 0 8px 0;
        }

        .memory-text img,
        .memory-full-content img {
          max-width: 100%;
          border-radius: 8px;
          margin: 8px 0;
        }

        .memory-text .message-block,
        .memory-full-content .message-block {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 12px;
          margin: 8px 0;
          border-left: 3px solid #667eea;
        }

        .memory-text .message-block .character-badge,
        .memory-full-content .message-block .character-badge {
          color: #667eea;
          font-size: 12px;
          margin-right: 8px;
        }

        .memory-text .message-block .date-badge,
        .memory-full-content .message-block .date-badge {
          color: #888;
          font-size: 11px;
        }

        .memory-text .message-block .message-text,
        .memory-full-content .message-block .message-text {
          margin-top: 8px;
          color: #ccc;
        }

        /* Memory Popup Modal */
        .memory-popup-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .memory-popup {
          background: #1a1a2e;
          border-radius: 16px;
          width: 100%;
          max-width: 600px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }

        .memory-popup-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .memory-popup-title {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .popup-word {
          font-size: 28px;
          font-weight: bold;
          color: #fff;
        }

        .popup-meaning {
          font-size: 16px;
          color: #4ade80;
        }

        .popup-close-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          color: #888;
          font-size: 18px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .popup-close-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          color: #fff;
        }

        .memory-popup-content {
          padding: 20px;
          overflow-y: auto;
          flex: 1;
        }

        .memory-full-content {
          color: #ddd;
          font-size: 16px;
          line-height: 1.7;
        }

        .memory-full-content img {
          max-width: 100%;
          border-radius: 12px;
          margin: 12px 0;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
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

        .no-memory .add-memory-btn {
          margin-top: 8px;
          padding: 8px 16px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .no-memory .add-memory-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
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
          flex-direction: row;
          gap: 8px;
          width: 100%;
        }

        .rating-btn {
          flex: 1;
          padding: 12px 8px;
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
          font-size: 13px;
          color: #fff;
          text-align: center;
        }

        .rating-sublabel {
          font-size: 11px;
          color: #888;
          margin-top: 2px;
        }

        .skip-btn {
          margin-top: 12px;
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
          margin-top: 16px;
          display: flex;
          gap: 16px;
          padding: 10px 16px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          font-size: 12px;
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

        /* Search word button */
        .search-word-btn {
          margin-top: 12px;
          padding: 8px 16px;
          background: rgba(74, 222, 128, 0.15);
          border: 1px solid rgba(74, 222, 128, 0.3);
          border-radius: 20px;
          color: #4ade80;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .search-word-btn:hover {
          background: rgba(74, 222, 128, 0.25);
          border-color: rgba(74, 222, 128, 0.5);
        }

        /* Search popup */
        .search-popup-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .search-popup {
          background: #1a1a2e;
          border-radius: 16px;
          width: 100%;
          max-width: 500px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          animation: slideUp 0.3s ease;
        }

        .search-popup-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .search-popup-title {
          font-size: 18px;
          font-weight: bold;
          color: #fff;
        }

        .search-popup-results {
          padding: 16px;
          overflow-y: auto;
          flex: 1;
        }

        .no-results {
          text-align: center;
          color: #888;
          padding: 40px 20px;
        }

        .results-count {
          font-size: 13px;
          color: #888;
          margin-bottom: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .results-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .search-result-item {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 12px;
          position: relative;
        }

        .result-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .result-character {
          font-size: 14px;
          font-weight: 600;
          color: #667eea;
        }

        .result-date {
          font-size: 12px;
          color: #666;
        }

        .result-text {
          color: #ddd;
          font-size: 15px;
          line-height: 1.5;
        }

        .highlight-word {
          background: rgba(74, 222, 128, 0.3);
          color: #4ade80;
          padding: 0 4px;
          border-radius: 4px;
        }

        .result-play-btn {
          position: absolute;
          right: 12px;
          bottom: 12px;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(102, 126, 234, 0.3);
          border: none;
          cursor: pointer;
          font-size: 16px;
          transition: all 0.2s;
        }

        .result-play-btn:hover {
          background: rgba(102, 126, 234, 0.5);
        }
      `}</style>
    </div>
  );
};

export default VocabularyMemoryFlashcard;
