import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { 
  ChatJournal, 
  VocabularyItem, 
  VocabularyReview, 
  VocabularyMemoryEntry, 
  DailyChat,
  FSRSRating,
  FSRSSettings,
  Character
} from '../types';
import { DEFAULT_FSRS_SETTINGS } from '../types';
import { 
  getVocabulariesDueForMemoryReview, 
  getAllVocabulariesWithMemories,
  migrateLegacyToFSRS 
} from '../utils/spacedRepetition';
import VocabularyMemoryFlashcard from './VocabularyMemoryFlashcard';
import VocabularyMemoryEditor from './VocabularyMemoryEditor';

type Tab = 'learn' | 'review';

interface VocabularyMemorySceneProps {
  journal: ChatJournal;
  characters: Character[];
  fsrsSettings: FSRSSettings;
  onUpdateJournal: (updatedJournal: ChatJournal) => void;
  onUpdateSettings: (settings: FSRSSettings) => void;
  onBack: () => void;
  onPlayAudio?: (audioData: string, characterName?: string) => void;
  onGenerateAudio?: (text: string, tone: string, voiceName: string) => Promise<string | null>;
  onTranslate?: (text: string) => Promise<string>;
  onStreakUpdate?: () => void;
}

export const VocabularyMemoryScene: React.FC<VocabularyMemorySceneProps> = ({
  journal,
  characters,
  fsrsSettings,
  onUpdateJournal,
  onUpdateSettings,
  onBack,
  onPlayAudio,
  onGenerateAudio,
  onTranslate,
  onStreakUpdate
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('review');
  const [showSettings, setShowSettings] = useState(false);
  const [tempSettings, setTempSettings] = useState(fsrsSettings);
  
  // Learn tab state
  const [selectedVocabulary, setSelectedVocabulary] = useState<{
    vocabulary: VocabularyItem;
    review?: VocabularyReview;
    dailyChat: DailyChat;
    memory?: VocabularyMemoryEntry;
  } | null>(null);
  const [filterText, setFilterText] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'with-memory' | 'without-memory'>('all');
  
  // Review tab state
  const [reviewQueue, setReviewQueue] = useState<{
    vocabulary: VocabularyItem;
    review: VocabularyReview;
    dailyChat: DailyChat;
    memory?: VocabularyMemoryEntry;
  }[]>([]);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const [reviewSessionStats, setReviewSessionStats] = useState({
    total: 0,
    remembered: 0,
    forgot: 0
  });
  
  // Edit from review state - shows editor overlay while in review tab
  const [editingFromReview, setEditingFromReview] = useState(false);
  const [isReviewComplete, setIsReviewComplete] = useState(false);

  // Get all vocabularies for learn tab
  const allVocabularies = useMemo(() => {
    return getAllVocabulariesWithMemories(journal);
  }, [journal]);

  // Filter vocabularies
  const filteredVocabularies = useMemo(() => {
    let filtered = allVocabularies;

    // Filter by text
    if (filterText) {
      const searchLower = filterText.toLowerCase();
      filtered = filtered.filter(v => 
        v.vocabulary.korean.includes(filterText) ||
        v.vocabulary.vietnamese.toLowerCase().includes(searchLower)
      );
    }

    // Filter by memory status
    if (filterMode === 'with-memory') {
      filtered = filtered.filter(v => v.memory !== undefined);
    } else if (filterMode === 'without-memory') {
      filtered = filtered.filter(v => v.memory === undefined);
    }

    return filtered;
  }, [allVocabularies, filterText, filterMode]);

  // Get due reviews
  const dueReviews = useMemo(() => {
    return getVocabulariesDueForMemoryReview(journal, fsrsSettings);
  }, [journal, fsrsSettings]);

  // Initialize review queue when switching to review tab
  useEffect(() => {
    if (activeTab === 'review' && reviewQueue.length === 0 && dueReviews.length > 0) {
      // Shuffle the queue
      const shuffled = [...dueReviews].sort(() => Math.random() - 0.5);
      setReviewQueue(shuffled);
      setCurrentReviewIndex(0);
      setReviewSessionStats({ total: shuffled.length, remembered: 0, forgot: 0 });
      setIsReviewComplete(false);
    }
  }, [activeTab, dueReviews, reviewQueue.length]);

  // Handle saving memory
  const handleSaveMemory = useCallback((memory: VocabularyMemoryEntry) => {
    const updatedJournal = journal.map(dc => {
      if (dc.id === memory.linkedDailyChatId) {
        const existingMemories = dc.vocabularyMemories || [];
        const existingIndex = existingMemories.findIndex(m => m.vocabularyId === memory.vocabularyId);
        
        let newMemories: VocabularyMemoryEntry[];
        if (existingIndex >= 0) {
          newMemories = [...existingMemories];
          newMemories[existingIndex] = memory;
        } else {
          newMemories = [...existingMemories, memory];
        }
        
        return { ...dc, vocabularyMemories: newMemories };
      }
      return dc;
    });
    
    onUpdateJournal(updatedJournal);
    
    // If editing from review, update the current item in review queue with new memory
    if (editingFromReview && reviewQueue.length > 0) {
      const updatedQueue = [...reviewQueue];
      updatedQueue[currentReviewIndex] = {
        ...updatedQueue[currentReviewIndex],
        memory: memory
      };
      setReviewQueue(updatedQueue);
      setEditingFromReview(false);
    } else {
      setSelectedVocabulary(null);
    }
  }, [journal, onUpdateJournal, editingFromReview, reviewQueue, currentReviewIndex]);

  // Handle review complete
  const handleReviewComplete = useCallback((updatedReview: VocabularyReview, rating: FSRSRating) => {
    // Update journal with new review data
    const currentItem = reviewQueue[currentReviewIndex];
    
    const updatedJournal = journal.map(dc => {
      if (dc.id === currentItem.dailyChat.id && dc.reviewSchedule) {
        const newSchedule = dc.reviewSchedule.map(r => 
          r.vocabularyId === updatedReview.vocabularyId ? updatedReview : r
        );
        return { ...dc, reviewSchedule: newSchedule };
      }
      return dc;
    });
    
    onUpdateJournal(updatedJournal);
    
    // Update stats
    setReviewSessionStats(prev => ({
      ...prev,
      remembered: rating >= 2 ? prev.remembered + 1 : prev.remembered,
      forgot: rating === 1 ? prev.forgot + 1 : prev.forgot
    }));
    
    // Move to next card or complete
    if (currentReviewIndex < reviewQueue.length - 1) {
      setCurrentReviewIndex(prev => prev + 1);
    } else {
      setIsReviewComplete(true);
      // Update streak when completing review session
      onStreakUpdate?.();
    }
  }, [journal, onUpdateJournal, reviewQueue, currentReviewIndex, onStreakUpdate]);

  // Handle skip
  const handleSkip = useCallback(() => {
    if (currentReviewIndex < reviewQueue.length - 1) {
      setCurrentReviewIndex(prev => prev + 1);
    } else {
      setIsReviewComplete(true);
    }
  }, [currentReviewIndex, reviewQueue.length]);

  // Handle edit memory from review flashcard
  const handleEditMemoryFromReview = useCallback(() => {
    const currentItem = reviewQueue[currentReviewIndex];
    if (currentItem) {
      setSelectedVocabulary({
        vocabulary: currentItem.vocabulary,
        review: currentItem.review,
        dailyChat: currentItem.dailyChat,
        memory: currentItem.memory
      });
      setEditingFromReview(true);
    }
  }, [reviewQueue, currentReviewIndex]);

  // Handle cancel edit from review
  const handleCancelEditFromReview = useCallback(() => {
    setSelectedVocabulary(null);
    setEditingFromReview(false);
  }, []);

  // Handle restart review
  const handleRestartReview = useCallback(() => {
    const newDueReviews = getVocabulariesDueForMemoryReview(journal, fsrsSettings);
    if (newDueReviews.length > 0) {
      const shuffled = [...newDueReviews].sort(() => Math.random() - 0.5);
      setReviewQueue(shuffled);
      setCurrentReviewIndex(0);
      setReviewSessionStats({ total: shuffled.length, remembered: 0, forgot: 0 });
      setIsReviewComplete(false);
    }
  }, [journal, fsrsSettings]);

  // Handle save settings
  const handleSaveSettings = useCallback(() => {
    onUpdateSettings(tempSettings);
    setShowSettings(false);
  }, [tempSettings, onUpdateSettings]);

  // Render settings modal
  const renderSettingsModal = () => (
    <div className="settings-modal-overlay" onClick={() => setShowSettings(false)}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <h3>⚙️ Cài đặt FSRS</h3>
        
        <div className="setting-item">
          <label>Số từ ôn tối đa mỗi ngày</label>
          <input
            type="range"
            min="10"
            max="100"
            value={tempSettings.maxReviewsPerDay}
            onChange={(e) => setTempSettings(prev => ({
              ...prev,
              maxReviewsPerDay: parseInt(e.target.value)
            }))}
          />
          <span className="setting-value">{tempSettings.maxReviewsPerDay}</span>
        </div>
        
        <div className="setting-item">
          <label>Tỷ lệ ghi nhớ mong muốn</label>
          <input
            type="range"
            min="80"
            max="95"
            value={tempSettings.desiredRetention * 100}
            onChange={(e) => setTempSettings(prev => ({
              ...prev,
              desiredRetention: parseInt(e.target.value) / 100
            }))}
          />
          <span className="setting-value">{Math.round(tempSettings.desiredRetention * 100)}%</span>
        </div>
        
        <div className="setting-hint">
          Tỷ lệ ghi nhớ cao hơn = ôn thường xuyên hơn
        </div>
        
        <div className="settings-actions">
          <button className="cancel-btn" onClick={() => setShowSettings(false)}>Hủy</button>
          <button className="save-btn" onClick={handleSaveSettings}>Lưu</button>
        </div>
      </div>
    </div>
  );

  // Render learn tab
  const renderLearnTab = () => {
    if (selectedVocabulary) {
      return (
        <VocabularyMemoryEditor
          vocabulary={selectedVocabulary.vocabulary}
          journal={journal}
          characters={characters}
          existingMemory={selectedVocabulary.memory}
          dailyChat={selectedVocabulary.dailyChat}
          onSave={handleSaveMemory}
          onCancel={() => setSelectedVocabulary(null)}
          onPlayAudio={onPlayAudio}
          onTranslate={onTranslate}
        />
      );
    }

    return (
      <div className="learn-tab">
        {/* Filters */}
        <div className="filters">
          <input
            type="text"
            className="search-input"
            placeholder="🔍 Tìm từ vựng..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          <div className="filter-buttons">
            <button 
              className={`filter-btn ${filterMode === 'all' ? 'active' : ''}`}
              onClick={() => setFilterMode('all')}
            >
              Tất cả ({allVocabularies.length})
            </button>
            <button 
              className={`filter-btn ${filterMode === 'with-memory' ? 'active' : ''}`}
              onClick={() => setFilterMode('with-memory')}
            >
              Có ký ức ({allVocabularies.filter(v => v.memory).length})
            </button>
            <button 
              className={`filter-btn ${filterMode === 'without-memory' ? 'active' : ''}`}
              onClick={() => setFilterMode('without-memory')}
            >
              Chưa có ({allVocabularies.filter(v => !v.memory).length})
            </button>
          </div>
        </div>

        {/* Vocabulary List */}
        <div className="vocabulary-list">
          {filteredVocabularies.length === 0 ? (
            <div className="empty-state">
              <p>Không tìm thấy từ vựng nào.</p>
            </div>
          ) : (
            filteredVocabularies.map(item => (
              <div 
                key={item.vocabulary.id}
                className={`vocab-item ${item.memory ? 'has-memory' : ''}`}
                onClick={() => setSelectedVocabulary(item)}
              >
                <div className="vocab-main">
                  <span className="vocab-korean">{item.vocabulary.korean}</span>
                  <span className="vocab-vietnamese">{item.vocabulary.vietnamese}</span>
                </div>
                <div className="vocab-status">
                  {item.memory ? (
                    <span className="has-memory-badge">💭</span>
                  ) : (
                    <span className="no-memory-badge">+</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  // Render review tab
  const renderReviewTab = () => {
    if (dueReviews.length === 0 && reviewQueue.length === 0) {
      return (
        <div className="no-reviews">
          <div className="celebration">🎉</div>
          <h3>Tuyệt vời!</h3>
          <p>Không có từ nào cần ôn tập hôm nay.</p>
          <p className="hint">Quay lại vào ngày mai để tiếp tục.</p>
        </div>
      );
    }

    if (isReviewComplete) {
      return (
        <div className="review-complete">
          <div className="celebration">✨</div>
          <h3>Hoàn thành!</h3>
          <div className="session-stats">
            <div className="stat">
              <span className="stat-value">{reviewSessionStats.total}</span>
              <span className="stat-label">Tổng từ</span>
            </div>
            <div className="stat remembered">
              <span className="stat-value">{reviewSessionStats.remembered}</span>
              <span className="stat-label">Nhớ</span>
            </div>
            <div className="stat forgot">
              <span className="stat-value">{reviewSessionStats.forgot}</span>
              <span className="stat-label">Quên</span>
            </div>
          </div>
          
          {dueReviews.length > 0 && (
            <button className="restart-btn" onClick={handleRestartReview}>
              Ôn thêm ({dueReviews.length} từ)
            </button>
          )}
        </div>
      );
    }

    const currentItem = reviewQueue[currentReviewIndex];
    if (!currentItem) {
      return <div>Loading...</div>;
    }

    return (
      <VocabularyMemoryFlashcard
        vocabulary={currentItem.vocabulary}
        review={migrateLegacyToFSRS(currentItem.review)}
        memory={currentItem.memory}
        dailyChat={currentItem.dailyChat}
        journal={journal}
        settings={fsrsSettings}
        characters={characters}
        onReviewComplete={handleReviewComplete}
        onSkip={handleSkip}
        onEditMemory={!currentItem.memory ? handleEditMemoryFromReview : undefined}
        onGenerateAudio={onGenerateAudio}
        onPlayAudio={onPlayAudio}
        currentIndex={currentReviewIndex}
        totalCount={reviewQueue.length}
      />
    );
  };

  return (
    <div className="vocabulary-memory-scene">
      {/* Header */}
      <div className="scene-header">
        <button className="back-btn" onClick={onBack}>
          ← Quay lại
        </button>
        <h2>🧠 Ký ức từ vựng</h2>
        <button className="settings-btn" onClick={() => setShowSettings(true)}>
          ⚙️
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'review' ? 'active' : ''}`}
          onClick={() => setActiveTab('review')}
        >
          📚 Ôn tập
          {dueReviews.length > 0 && (
            <span className="badge">{dueReviews.length}</span>
          )}
        </button>
        <button 
          className={`tab ${activeTab === 'learn' ? 'active' : ''}`}
          onClick={() => setActiveTab('learn')}
        >
          ✏️ Học & Tạo ký ức
        </button>
      </div>

      {/* Content */}
      <div className="tab-content">
        {activeTab === 'learn' ? renderLearnTab() : renderReviewTab()}
      </div>

      {/* Settings Modal */}
      {showSettings && renderSettingsModal()}

      {/* Edit Memory from Review Overlay */}
      {editingFromReview && selectedVocabulary && (
        <div className="edit-from-review-overlay">
          <div className="edit-from-review-header">
            <button className="close-edit-btn" onClick={handleCancelEditFromReview}>
              ← Quay lại ôn tập
            </button>
            <span>Thêm ký ức cho: {selectedVocabulary.vocabulary.korean}</span>
          </div>
          <VocabularyMemoryEditor
            vocabulary={selectedVocabulary.vocabulary}
            dailyChat={selectedVocabulary.dailyChat}
            journal={journal}
            characters={characters}
            existingMemory={selectedVocabulary.memory}
            onSave={handleSaveMemory}
            onCancel={handleCancelEditFromReview}
          />
        </div>
      )}

      <style>{`
        .vocabulary-memory-scene {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #1a1a2e;
        }

        .scene-header {
          display: flex;
          align-items: center;
          padding: 16px;
          background: #16213e;
          border-bottom: 1px solid #0f3460;
        }

        .back-btn {
          background: none;
          border: none;
          color: #667eea;
          font-size: 14px;
          cursor: pointer;
          padding: 8px 12px;
          margin-right: 12px;
        }

        .back-btn:hover {
          color: #8b9cf4;
        }

        .scene-header h2 {
          flex: 1;
          margin: 0;
          color: #fff;
          font-size: 18px;
        }

        .settings-btn {
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          padding: 8px;
        }

        .tabs {
          display: flex;
          background: #16213e;
          border-bottom: 1px solid #0f3460;
        }

        .tab {
          flex: 1;
          padding: 14px;
          background: none;
          border: none;
          color: #888;
          font-size: 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: color 0.2s, background 0.2s;
          border-bottom: 2px solid transparent;
        }

        .tab:hover {
          color: #aaa;
          background: rgba(255, 255, 255, 0.03);
        }

        .tab.active {
          color: #fff;
          border-bottom-color: #667eea;
        }

        .tab .badge {
          background: #e94560;
          color: white;
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 10px;
        }

        .tab-content {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        /* Learn Tab */
        .learn-tab {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .filters {
          padding: 16px;
          border-bottom: 1px solid #0f3460;
        }

        .search-input {
          width: 100%;
          padding: 12px 16px;
          background: #16213e;
          border: 1px solid #0f3460;
          border-radius: 8px;
          color: #fff;
          font-size: 14px;
          margin-bottom: 12px;
        }

        .search-input:focus {
          outline: none;
          border-color: #667eea;
        }

        .filter-buttons {
          display: flex;
          gap: 8px;
        }

        .filter-btn {
          flex: 1;
          padding: 8px 12px;
          background: #16213e;
          border: 1px solid #0f3460;
          border-radius: 6px;
          color: #888;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .filter-btn:hover {
          border-color: #667eea;
        }

        .filter-btn.active {
          background: #667eea;
          border-color: #667eea;
          color: white;
        }

        .vocabulary-list {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          padding-bottom: 80px;
        }

        .vocab-item {
          display: flex;
          align-items: center;
          padding: 14px;
          background: #16213e;
          border-radius: 10px;
          margin-bottom: 8px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .vocab-item:hover {
          background: #1a2744;
        }

        .vocab-item.has-memory {
          border-left: 3px solid #667eea;
        }

        .vocab-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .vocab-korean {
          font-size: 18px;
          color: #fff;
          font-weight: 500;
        }

        .vocab-vietnamese {
          font-size: 14px;
          color: #888;
        }

        .vocab-status {
          margin-left: 12px;
        }

        .has-memory-badge {
          font-size: 20px;
        }

        .no-memory-badge {
          display: inline-block;
          width: 24px;
          height: 24px;
          line-height: 22px;
          text-align: center;
          background: #333;
          color: #666;
          border-radius: 50%;
          font-size: 16px;
        }

        .empty-state {
          padding: 40px;
          text-align: center;
          color: #888;
        }

        /* Review Tab */
        .no-reviews, .review-complete {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px;
          text-align: center;
        }

        .celebration {
          font-size: 64px;
          margin-bottom: 16px;
        }

        .no-reviews h3, .review-complete h3 {
          color: #fff;
          margin: 0 0 8px 0;
        }

        .no-reviews p, .review-complete p {
          color: #888;
          margin: 4px 0;
        }

        .hint {
          font-size: 14px;
          color: #666;
        }

        .session-stats {
          display: flex;
          gap: 32px;
          margin: 24px 0;
        }

        .stat {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .stat-value {
          font-size: 32px;
          font-weight: bold;
          color: #fff;
        }

        .stat-label {
          font-size: 12px;
          color: #888;
          margin-top: 4px;
        }

        .stat.remembered .stat-value {
          color: #4ade80;
        }

        .stat.forgot .stat-value {
          color: #ef4444;
        }

        .restart-btn {
          margin-top: 16px;
          padding: 12px 24px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          cursor: pointer;
        }

        .restart-btn:hover {
          opacity: 0.9;
        }

        /* Settings Modal */
        .settings-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .settings-modal {
          background: #16213e;
          border-radius: 16px;
          padding: 24px;
          width: 90%;
          max-width: 400px;
        }

        .settings-modal h3 {
          margin: 0 0 20px 0;
          color: #fff;
        }

        .setting-item {
          margin-bottom: 20px;
        }

        .setting-item label {
          display: block;
          color: #aaa;
          font-size: 14px;
          margin-bottom: 8px;
        }

        .setting-item input[type="range"] {
          width: calc(100% - 50px);
          margin-right: 10px;
        }

        .setting-value {
          color: #667eea;
          font-weight: bold;
        }

        .setting-hint {
          font-size: 12px;
          color: #666;
          margin-bottom: 20px;
        }

        .settings-actions {
          display: flex;
          gap: 12px;
        }

        .settings-actions .cancel-btn {
          flex: 1;
          padding: 12px;
          background: #333;
          color: #fff;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }

        .settings-actions .save-btn {
          flex: 1;
          padding: 12px;
          background: #667eea;
          color: #fff;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }

        /* Edit from Review Overlay */
        .edit-from-review-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: #1a1a2e;
          z-index: 1000;
          display: flex;
          flex-direction: column;
        }

        .edit-from-review-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: #16213e;
          border-bottom: 1px solid #0f3460;
          color: #fff;
          font-size: 14px;
        }

        .close-edit-btn {
          background: none;
          border: none;
          color: #667eea;
          font-size: 14px;
          cursor: pointer;
          padding: 8px 12px;
        }

        .close-edit-btn:hover {
          color: #8b9cf4;
        }

        .edit-from-review-overlay .vocabulary-memory-editor {
          flex: 1;
          overflow: auto;
        }
      `}</style>
    </div>
  );
};

export default VocabularyMemoryScene;
