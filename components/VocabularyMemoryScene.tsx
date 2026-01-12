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
  migrateLegacyToFSRS,
  getNewVocabulariesWithoutReview,
  getVocabularyStats,
  calculateNewCardInterval,
  getDifficultVocabulariesToday
} from '../utils/spacedRepetition';
import VocabularyMemoryFlashcard from './VocabularyMemoryFlashcard';
import VocabularyMemoryEditor from './VocabularyMemoryEditor';
import HTTPService from '../services/HTTPService';

// Helper function to escape HTML
const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

type Tab = 'new' | 'review' | 'difficult' | 'learn';

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
  const [editingVocab, setEditingVocab] = useState<{
    vocabulary: VocabularyItem;
    dailyChatId: string;
    korean: string;
    vietnamese: string;
  } | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'with-memory' | 'without-memory' | 'learned' | 'not-learned'>('all');
  
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

  // Get vocabulary stats
  const vocabStats = useMemo(() => {
    return getVocabularyStats(journal, fsrsSettings);
  }, [journal, fsrsSettings]);

  // Get new vocabularies without review
  const newVocabularies = useMemo(() => {
    return getNewVocabulariesWithoutReview(journal);
  }, [journal]);

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
    } else if (filterMode === 'learned') {
      filtered = filtered.filter(v => v.review !== undefined);
    } else if (filterMode === 'not-learned') {
      filtered = filtered.filter(v => v.review === undefined);
    }

    return filtered;
  }, [allVocabularies, filterText, filterMode]);

  // Get due reviews
  const dueReviews = useMemo(() => {
    return getVocabulariesDueForMemoryReview(journal, fsrsSettings);
  }, [journal, fsrsSettings]);

  // Get difficult vocabularies (Hard/Again rated today)
  const difficultVocabularies = useMemo(() => {
    return getDifficultVocabulariesToday(journal);
  }, [journal]);

  // Initialize review queue when switching to review tab (NO auto-add - user learns new words in New tab)
  useEffect(() => {
    if (activeTab === 'review' && reviewQueue.length === 0 && dueReviews.length > 0) {
      // Keep sorted order (already sorted by nextReviewDate - most overdue first)
      setReviewQueue([...dueReviews]);
      setCurrentReviewIndex(0);
      setReviewSessionStats({ total: dueReviews.length, remembered: 0, forgot: 0 });
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

  // Handle card direction change - save immediately to journal
  const handleCardDirectionChange = useCallback((direction: 'kr-vn' | 'vn-kr') => {
    const currentItem = reviewQueue[currentReviewIndex];
    if (!currentItem) return;

    // Update journal with new card direction
    const updatedJournal = journal.map(dc => {
      if (dc.id === currentItem.dailyChat.id && dc.reviewSchedule) {
        const newSchedule = dc.reviewSchedule.map(r => 
          r.vocabularyId === currentItem.review.vocabularyId 
            ? { ...r, cardDirection: direction }
            : r
        );
        return { ...dc, reviewSchedule: newSchedule };
      }
      return dc;
    });
    
    onUpdateJournal(updatedJournal);

    // Also update the review queue so the change persists in current session
    const updatedQueue = [...reviewQueue];
    updatedQueue[currentReviewIndex] = {
      ...updatedQueue[currentReviewIndex],
      review: { ...updatedQueue[currentReviewIndex].review, cardDirection: direction }
    };
    setReviewQueue(updatedQueue);
  }, [journal, onUpdateJournal, reviewQueue, currentReviewIndex]);

  // Handle reset FSRS - reset stability and difficulty
  const handleResetFSRS = useCallback((resetReview: VocabularyReview) => {
    const currentItem = reviewQueue[currentReviewIndex];
    if (!currentItem) return;

    // Update journal with reset review data
    const updatedJournal = journal.map(dc => {
      if (dc.id === currentItem.dailyChat.id && dc.reviewSchedule) {
        const newSchedule = dc.reviewSchedule.map(r => 
          r.vocabularyId === resetReview.vocabularyId ? resetReview : r
        );
        return { ...dc, reviewSchedule: newSchedule };
      }
      return dc;
    });
    
    onUpdateJournal(updatedJournal);

    // Also update the review queue so the change persists in current session
    const updatedQueue = [...reviewQueue];
    updatedQueue[currentReviewIndex] = {
      ...updatedQueue[currentReviewIndex],
      review: resetReview
    };
    setReviewQueue(updatedQueue);
  }, [journal, onUpdateJournal, reviewQueue, currentReviewIndex]);

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

  // Handle delete vocabulary
  const handleDeleteVocabulary = useCallback((vocabularyId: string, dailyChatId: string) => {
    if (!window.confirm('Bạn có chắc muốn xóa từ vựng này? Hành động này không thể hoàn tác.')) {
      return;
    }

    const updatedJournal = journal.map(dc => {
      if (dc.id === dailyChatId) {
        return {
          ...dc,
          // Remove from vocabularies
          vocabularies: dc.vocabularies?.filter(v => v.id !== vocabularyId) || [],
          // Remove from review schedule
          reviewSchedule: dc.reviewSchedule?.filter(r => r.vocabularyId !== vocabularyId) || [],
          // Remove from vocabulary memories
          vocabularyMemories: dc.vocabularyMemories?.filter(m => m.vocabularyId !== vocabularyId) || []
        };
      }
      return dc;
    });

    onUpdateJournal(updatedJournal);
  }, [journal, onUpdateJournal]);

  // Handle edit vocabulary
  const handleEditVocabulary = useCallback((vocabulary: VocabularyItem, dailyChatId: string) => {
    setEditingVocab({
      vocabulary,
      dailyChatId,
      korean: vocabulary.korean,
      vietnamese: vocabulary.vietnamese
    });
  }, []);

  // Handle save edited vocabulary
  const handleSaveEditedVocabulary = useCallback(() => {
    if (!editingVocab) return;
    
    const { vocabulary, dailyChatId, korean, vietnamese } = editingVocab;
    
    if (!korean.trim() || !vietnamese.trim()) {
      alert('Vui lòng nhập đầy đủ từ vựng và nghĩa.');
      return;
    }

    const updatedJournal = journal.map(dc => {
      if (dc.id === dailyChatId) {
        return {
          ...dc,
          vocabularies: dc.vocabularies?.map(v => 
            v.id === vocabulary.id 
              ? { ...v, korean: korean.trim(), vietnamese: vietnamese.trim() }
              : v
          ) || []
        };
      }
      return dc;
    });

    onUpdateJournal(updatedJournal);
    setEditingVocab(null);
  }, [editingVocab, journal, onUpdateJournal]);

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
          <label>Số từ MỚI thêm mỗi ngày</label>
          <input
            type="range"
            min="0"
            max="500"
            value={tempSettings.newCardsPerDay || 20}
            onChange={(e) => setTempSettings(prev => ({
              ...prev,
              newCardsPerDay: parseInt(e.target.value)
            }))}
          />
          <span className="setting-value">{tempSettings.newCardsPerDay || 20}</span>
        </div>
        
        <div className="setting-item">
          <label>Số từ ÔN tối đa mỗi ngày</label>
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

  // State for new words tab
  const [newWordsQueue, setNewWordsQueue] = useState<{
    vocabulary: VocabularyItem;
    dailyChat: DailyChat;
    memory?: VocabularyMemoryEntry;
  }[]>([]);
  const [currentNewWordIndex, setCurrentNewWordIndex] = useState(0);
  const [newWordState, setNewWordState] = useState<'word' | 'memory' | 'answer'>('word');
  const [newWordsSessionStats, setNewWordsSessionStats] = useState({
    total: 0,
    learned: 0
  });
  const [isNewWordsComplete, setIsNewWordsComplete] = useState(false);
  const [showNewWordMemoryPopup, setShowNewWordMemoryPopup] = useState(false);
  const [showSearchPopup, setShowSearchPopup] = useState(false);
  const [searchWord, setSearchWord] = useState<string>('');
  const [selectedNewWordCharacterId, setSelectedNewWordCharacterId] = useState<string>(characters[0]?.id || '');
  const [isNewWordGeneratingAudio, setIsNewWordGeneratingAudio] = useState(false);
  const [newWordUserAnswer, setNewWordUserAnswer] = useState('');
  const [newWordAnswerResult, setNewWordAnswerResult] = useState<'correct' | 'incorrect' | null>(null);
  // Card direction: 'kr-vn' = Korean front, Vietnamese answer | 'vn-kr' = Vietnamese front, Korean answer
  // Default to 'kr-vn' for new words (no saved preference yet)
  const [newWordCardDirection, setNewWordCardDirection] = useState<'kr-vn' | 'vn-kr'>('kr-vn');
  // Whether the front word is revealed (initially hidden, click to reveal)
  const [isNewWordRevealed, setIsNewWordRevealed] = useState(false);

  // State for difficult words tab (Hard/Again rated today)
  const [difficultQueue, setDifficultQueue] = useState<{
    vocabulary: VocabularyItem;
    review: VocabularyReview;
    dailyChat: DailyChat;
    memory?: VocabularyMemoryEntry;
    todayRating: 1 | 2;
  }[]>([]);
  const [currentDifficultIndex, setCurrentDifficultIndex] = useState(0);
  const [difficultWordState, setDifficultWordState] = useState<'word' | 'memory' | 'answer'>('word');
  const [difficultSessionStats, setDifficultSessionStats] = useState({
    total: 0,
    practiced: 0
  });
  const [isDifficultComplete, setIsDifficultComplete] = useState(false);
  const [showDifficultMemoryPopup, setShowDifficultMemoryPopup] = useState(false);
  const [selectedDifficultCharacterId, setSelectedDifficultCharacterId] = useState<string>(characters[0]?.id || '');
  const [isDifficultGeneratingAudio, setIsDifficultGeneratingAudio] = useState(false);
  const [difficultUserAnswer, setDifficultUserAnswer] = useState('');
  const [difficultAnswerResult, setDifficultAnswerResult] = useState<'correct' | 'incorrect' | null>(null);
  const [difficultCardDirection, setDifficultCardDirection] = useState<'kr-vn' | 'vn-kr'>('kr-vn');
  const [isDifficultWordRevealed, setIsDifficultWordRevealed] = useState(false);

  // Initialize new words queue when switching to new tab
  useEffect(() => {
    if (activeTab === 'new' && newWordsQueue.length === 0 && newVocabularies.length > 0) {
      const toLearn = newVocabularies.slice(0, fsrsSettings.newCardsPerDay || 20);
      setNewWordsQueue(toLearn);
      setCurrentNewWordIndex(0);
      setNewWordState('word');
      setNewWordsSessionStats({ total: toLearn.length, learned: 0 });
      setIsNewWordsComplete(false);
      setIsNewWordRevealed(false);
    }
  }, [activeTab, newVocabularies, newWordsQueue.length, fsrsSettings.newCardsPerDay]);

  // Initialize difficult queue when switching to difficult tab
  useEffect(() => {
    if (activeTab === 'difficult' && difficultQueue.length === 0 && difficultVocabularies.length > 0) {
      setDifficultQueue([...difficultVocabularies]);
      setCurrentDifficultIndex(0);
      setDifficultWordState('word');
      setDifficultSessionStats({ total: difficultVocabularies.length, practiced: 0 });
      setIsDifficultComplete(false);
      setIsDifficultWordRevealed(false);
    }
  }, [activeTab, difficultVocabularies, difficultQueue.length]);

  // Reset isNewWordRevealed when switching to next word
  useEffect(() => {
    setIsNewWordRevealed(false);
  }, [currentNewWordIndex]);

  // Reset isDifficultWordRevealed when switching to next difficult word
  useEffect(() => {
    setIsDifficultWordRevealed(false);
  }, [currentDifficultIndex]);

  // Auto-select first character if none selected
  useEffect(() => {
    if (!selectedNewWordCharacterId && characters.length > 0) {
      setSelectedNewWordCharacterId(characters[0].id);
    }
    if (!selectedDifficultCharacterId && characters.length > 0) {
      setSelectedDifficultCharacterId(characters[0].id);
    }
  }, [characters, selectedNewWordCharacterId, selectedDifficultCharacterId]);

  // Handle audio button clicks in memory HTML
  const handleNewWordMemoryClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('memory-audio-btn')) {
      e.preventDefault();
      e.stopPropagation();
      const msgId = target.getAttribute('data-msg-id');
      const characterName = target.getAttribute('data-character');
      if (msgId && onPlayAudio) {
        // Find message from entire journal
        for (const dc of journal) {
          const msg = dc.messages.find(m => m.id === msgId);
          if (msg?.audioData) {
            onPlayAudio(msg.audioData, characterName || undefined);
            break;
          }
        }
      }
    }
  }, [onPlayAudio, journal]);

  // Process memory HTML for current new word - same as VocabularyMemoryFlashcard
  const newWordProcessedMemoryHtml = useMemo(() => {
    if (newWordsQueue.length === 0 || currentNewWordIndex >= newWordsQueue.length) return '';
    const currentItem = newWordsQueue[currentNewWordIndex];
    if (!currentItem.memory?.userMemory) return '';
    
    const baseUrl = HTTPService.getBaseUrl();
    let html = '';
    const userMemory = currentItem.memory.userMemory;
    
    // Build message lookup map from entire journal (not just currentItem.dailyChat)
    const messagesMap = new Map<string, { text: string; characterName: string; date: string; audioData?: string }>();
    for (const dc of journal) {
      for (const msg of dc.messages) {
        messagesMap.set(msg.id, {
          text: msg.text,
          characterName: msg.sender === 'user' ? 'Bạn' : (msg.characterName || 'Bot'),
          date: dc.date,
          audioData: msg.audioData
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
          const audioButton = linkedMsg.audioData 
            ? `<button class="memory-audio-btn" data-msg-id="${value}" data-character="${escapeHtml(linkedMsg.characterName)}" title="Phát âm thanh">🔊</button>`
            : '';
          html += `
            <div class="message-block">
              <div class="message-block-header">
                <span class="character-badge">👤 ${escapeHtml(linkedMsg.characterName)}</span>
                <span class="date-badge">📅 ${escapeHtml(linkedMsg.date)}</span>
                ${audioButton}
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
  }, [newWordsQueue, currentNewWordIndex, journal]);

  // Search for word usage in entire journal - unified for both tabs
  const searchWordUsageResults = useMemo(() => {
    if (!searchWord) return [];
    if (!journal || journal.length === 0) return [];
    
    const results: {
      message: typeof journal[0]['messages'][0];
      dailyChat: typeof journal[0];
    }[] = [];
    
    for (const dc of journal) {
      for (const message of dc.messages) {
        if (message.text.includes(searchWord)) {
          results.push({ message, dailyChat: dc });
        }
      }
    }
    
    return results;
  }, [journal, searchWord]);

  // Get word usage count for current new word (for button display)
  const currentNewWordUsageCount = useMemo(() => {
    if (newWordsQueue.length === 0 || currentNewWordIndex >= newWordsQueue.length) return 0;
    if (!journal || journal.length === 0) return 0;
    
    const koreanWord = newWordsQueue[currentNewWordIndex].vocabulary.korean;
    let count = 0;
    
    for (const dc of journal) {
      for (const message of dc.messages) {
        if (message.text.includes(koreanWord)) {
          count++;
        }
      }
    }
    
    return count;
  }, [journal, newWordsQueue, currentNewWordIndex]);

  // Get word usage count for current review word (for button display)
  const currentReviewWordUsageCount = useMemo(() => {
    if (reviewQueue.length === 0 || currentReviewIndex >= reviewQueue.length) return 0;
    if (!journal || journal.length === 0) return 0;
    
    const koreanWord = reviewQueue[currentReviewIndex].vocabulary.korean;
    let count = 0;
    
    for (const dc of journal) {
      for (const message of dc.messages) {
        if (message.text.includes(koreanWord)) {
          count++;
        }
      }
    }
    
    return count;
  }, [journal, reviewQueue, currentReviewIndex]);

  // Handle pronunciation for new word
  const handleNewWordPronounce = useCallback(async () => {
    if (!onGenerateAudio || !onPlayAudio || isNewWordGeneratingAudio) return;
    if (newWordsQueue.length === 0 || currentNewWordIndex >= newWordsQueue.length) return;
    
    const currentItem = newWordsQueue[currentNewWordIndex];
    const selectedChar = characters.find(c => c.id === selectedNewWordCharacterId);
    const voiceName = selectedChar?.voiceName || 'echo';
    
    setIsNewWordGeneratingAudio(true);
    try {
      const audioData = await onGenerateAudio(currentItem.vocabulary.korean, 'slowly and clearly', voiceName);
      if (audioData) {
        onPlayAudio(audioData, selectedChar?.name);
      }
    } catch (error) {
      console.error('Failed to generate pronunciation:', error);
    } finally {
      setIsNewWordGeneratingAudio(false);
    }
  }, [onGenerateAudio, onPlayAudio, newWordsQueue, currentNewWordIndex, characters, selectedNewWordCharacterId, isNewWordGeneratingAudio]);

  // Handle rating for new word
  const handleNewWordRating = useCallback((rating: FSRSRating) => {
    const currentItem = newWordsQueue[currentNewWordIndex];
    if (!currentItem) return;

    // Create initial review with the rating
    // Use FSRS to calculate the actual interval
    const now = new Date();
    const intervalDays = calculateNewCardInterval(rating);
    const initialStability = intervalDays;
    const initialDifficulty = rating === 4 ? 1 : rating === 3 ? 3 : rating === 2 ? 5 : 7;
    
    const nextReviewDate = new Date(now);
    nextReviewDate.setDate(now.getDate() + intervalDays);

    const newReview: VocabularyReview = {
      vocabularyId: currentItem.vocabulary.id,
      dailyChatId: currentItem.dailyChat.id,
      currentIntervalDays: intervalDays,
      nextReviewDate: nextReviewDate.toISOString(),
      lastReviewDate: now.toISOString(),
      reviewHistory: [{
        date: now.toISOString(),
        correctCount: rating >= 2 ? 1 : 0,
        incorrectCount: rating === 1 ? 1 : 0,
        intervalBefore: 0,
        intervalAfter: intervalDays,
        rating,
        stabilityBefore: 0,
        stabilityAfter: initialStability,
        difficultyBefore: 5,
        difficultyAfter: initialDifficulty,
        retrievability: 1
      }],
      stability: initialStability,
      difficulty: initialDifficulty,
      lapses: rating === 1 ? 1 : 0,
      // Save card direction preference
      cardDirection: newWordCardDirection
    };

    // Update journal with new review
    const updatedJournal = journal.map(dc => {
      if (dc.id === currentItem.dailyChat.id) {
        return {
          ...dc,
          reviewSchedule: [...(dc.reviewSchedule || []), newReview]
        };
      }
      return dc;
    });
    
    onUpdateJournal(updatedJournal);

    // Update stats
    setNewWordsSessionStats(prev => {
      const newLearned = prev.learned + 1;
      // Update streak when learned at least 10 words
      if (newLearned >= 10) {
        onStreakUpdate?.();
      }
      return {
        ...prev,
        learned: newLearned
      };
    });

    // Move to next word
    setNewWordState('word');
    setNewWordUserAnswer('');
    setNewWordAnswerResult(null);
    setIsNewWordRevealed(false);
    if (currentNewWordIndex < newWordsQueue.length - 1) {
      setCurrentNewWordIndex(prev => prev + 1);
    } else {
      setIsNewWordsComplete(true);
    }
  }, [journal, onUpdateJournal, newWordsQueue, currentNewWordIndex, onStreakUpdate, newWordCardDirection]);

  // Get word usage count for current difficult word
  const currentDifficultWordUsageCount = useMemo(() => {
    if (difficultQueue.length === 0 || currentDifficultIndex >= difficultQueue.length) return 0;
    if (!journal || journal.length === 0) return 0;
    
    const koreanWord = difficultQueue[currentDifficultIndex].vocabulary.korean;
    let count = 0;
    
    for (const dc of journal) {
      for (const message of dc.messages) {
        if (message.text.includes(koreanWord)) {
          count++;
        }
      }
    }
    
    return count;
  }, [journal, difficultQueue, currentDifficultIndex]);

  // Handle pronunciation for difficult word
  const handleDifficultPronounce = useCallback(async () => {
    if (!onGenerateAudio || !onPlayAudio || isDifficultGeneratingAudio) return;
    if (difficultQueue.length === 0 || currentDifficultIndex >= difficultQueue.length) return;
    
    const currentItem = difficultQueue[currentDifficultIndex];
    const selectedChar = characters.find(c => c.id === selectedDifficultCharacterId);
    const voiceName = selectedChar?.voiceName || 'echo';
    
    setIsDifficultGeneratingAudio(true);
    try {
      const audioData = await onGenerateAudio(currentItem.vocabulary.korean, 'slowly and clearly', voiceName);
      if (audioData) {
        onPlayAudio(audioData, selectedChar?.name);
      }
    } catch (error) {
      console.error('Failed to generate pronunciation:', error);
    } finally {
      setIsDifficultGeneratingAudio(false);
    }
  }, [onGenerateAudio, onPlayAudio, difficultQueue, currentDifficultIndex, characters, selectedDifficultCharacterId, isDifficultGeneratingAudio]);

  // Handle "Got it" for difficult word - NO FSRS update, just move to next
  const handleDifficultGotIt = useCallback(() => {
    // Update stats
    setDifficultSessionStats(prev => ({
      ...prev,
      practiced: prev.practiced + 1
    }));

    // Move to next word - NO FSRS update
    setDifficultWordState('word');
    setDifficultUserAnswer('');
    setDifficultAnswerResult(null);
    setIsDifficultWordRevealed(false);
    if (currentDifficultIndex < difficultQueue.length - 1) {
      setCurrentDifficultIndex(prev => prev + 1);
    } else {
      setIsDifficultComplete(true);
    }
  }, [difficultQueue.length, currentDifficultIndex]);

  // Handle "Nhớ" (Remember) - remove from queue and move to next
  const handleDifficultRemember = useCallback(() => {
    setDifficultSessionStats(prev => ({
      ...prev,
      practiced: prev.practiced + 1
    }));

    // Remove current item from queue
    const newQueue = [...difficultQueue];
    newQueue.splice(currentDifficultIndex, 1);
    setDifficultQueue(newQueue);

    // Reset state for next card
    setDifficultWordState('word');
    setDifficultUserAnswer('');
    setDifficultAnswerResult(null);
    setIsDifficultWordRevealed(false);

    // Check if complete
    if (newQueue.length === 0) {
      setIsDifficultComplete(true);
    }
    // currentDifficultIndex stays same (next item shifts into this position)
    // but if we're at the end, we need to go back
    else if (currentDifficultIndex >= newQueue.length) {
      setCurrentDifficultIndex(newQueue.length - 1);
    }
  }, [difficultQueue, currentDifficultIndex]);

  // Handle "Quên" (Forgot) - move to end of queue
  const handleDifficultForgot = useCallback(() => {
    // Move current item to end of queue
    const newQueue = [...difficultQueue];
    const currentItem = newQueue.splice(currentDifficultIndex, 1)[0];
    newQueue.push(currentItem);
    setDifficultQueue(newQueue);

    // Reset state for next card
    setDifficultWordState('word');
    setDifficultUserAnswer('');
    setDifficultAnswerResult(null);
    setIsDifficultWordRevealed(false);

    // If we were at the last item (now moved to end), wrap around
    if (currentDifficultIndex >= newQueue.length - 1) {
      // Stay at same index, next item shifted into position
    }
    // currentDifficultIndex stays same (next item shifts into this position)
  }, [difficultQueue, currentDifficultIndex]);

  // Process memory HTML for difficult word
  const difficultProcessedMemoryHtml = useMemo(() => {
    if (difficultQueue.length === 0 || currentDifficultIndex >= difficultQueue.length) return '';
    const currentItem = difficultQueue[currentDifficultIndex];
    if (!currentItem.memory?.userMemory) return '';
    
    const baseUrl = HTTPService.getBaseUrl();
    let html = '';
    const userMemory = currentItem.memory.userMemory;
    
    const messagesMap = new Map<string, { text: string; characterName: string; date: string; audioData?: string }>();
    for (const dc of journal) {
      for (const msg of dc.messages) {
        messagesMap.set(msg.id, {
          text: msg.text,
          characterName: msg.sender === 'user' ? 'Bạn' : (msg.characterName || 'Bot'),
          date: dc.date,
          audioData: msg.audioData
        });
      }
    }
    
    const regex = /\[(MSG|IMG):([^\]]+)\]/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(userMemory)) !== null) {
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
          const audioButton = linkedMsg.audioData 
            ? `<button class="memory-audio-btn" data-msg-id="${value}" data-character="${escapeHtml(linkedMsg.characterName)}" title="Phát âm thanh">🔊</button>`
            : '';
          html += `
            <div class="message-block">
              <div class="message-block-header">
                <span class="character-badge">👤 ${escapeHtml(linkedMsg.characterName)}</span>
                <span class="date-badge">📅 ${escapeHtml(linkedMsg.date)}</span>
                ${audioButton}
              </div>
              <div class="message-text">${escapeHtml(linkedMsg.text)}</div>
            </div>
          `;
        }
      } else if (type === 'IMG') {
        let imgSrc = value;
        if (imgSrc.startsWith('/')) {
          imgSrc = baseUrl + imgSrc;
        } else if (imgSrc.startsWith('http://localhost')) {
          imgSrc = imgSrc.replace(/http:\/\/localhost:\d+/, baseUrl);
        }
        html += `<div class="memory-image"><img src="${imgSrc}" alt="Memory image" /></div>`;
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < userMemory.length) {
      const textContent = userMemory.slice(lastIndex).trim();
      if (textContent) {
        html += `<p>${escapeHtml(textContent)}</p>`;
      }
    }

    return html || '<p class="empty-memory">Chưa có nội dung</p>';
  }, [difficultQueue, currentDifficultIndex, journal]);

  // Handle memory click for difficult word
  const handleDifficultMemoryClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('memory-audio-btn')) {
      e.preventDefault();
      e.stopPropagation();
      const msgId = target.getAttribute('data-msg-id');
      const characterName = target.getAttribute('data-character');
      if (msgId && onPlayAudio) {
        for (const dc of journal) {
          const msg = dc.messages.find(m => m.id === msgId);
          if (msg?.audioData) {
            onPlayAudio(msg.audioData, characterName || undefined);
            break;
          }
        }
      }
    }
  }, [onPlayAudio, journal]);

  // Render new words tab
  const renderNewWordsTab = () => {
    if (newVocabularies.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <h3>Không có từ mới</h3>
          <p>Tất cả từ vựng đã được thêm vào hệ thống ôn tập.</p>
        </div>
      );
    }

    if (isNewWordsComplete) {
      return (
        <div className="session-complete">
          <div className="complete-icon">🎉</div>
          <h3>Hoàn thành học từ mới!</h3>
          <div className="complete-stats">
            <p>Đã học <strong>{newWordsSessionStats.learned}</strong> từ mới</p>
          </div>
          <button 
            className="restart-btn"
            onClick={() => {
              setNewWordsQueue([]);
              setIsNewWordsComplete(false);
            }}
          >
            Học thêm từ mới
          </button>
          <button 
            className="go-review-btn"
            onClick={() => setActiveTab('review')}
          >
            Chuyển sang ôn tập →
          </button>
        </div>
      );
    }

    if (newWordsQueue.length === 0) {
      return (
        <div className="loading-state">
          <p>Đang tải từ mới...</p>
        </div>
      );
    }

    const currentItem = newWordsQueue[currentNewWordIndex];
    
    return (
      <div className="new-words-tab">
        {/* Progress */}
        <div className="flashcard-progress">
          <div className="progress-text">
            {currentNewWordIndex + 1} / {newWordsQueue.length}
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill new-word"
              style={{ width: `${((currentNewWordIndex + 1) / newWordsQueue.length) * 100}%` }}
            />
          </div>
        </div>

        {/* New Word Card */}
        <div className="new-word-card flashcard">
          <div className="new-badge">🆕 Từ mới</div>
          
          {/* Card Content */}
          <div className="card-content">
            {/* Direction Toggle */}
            <div className="direction-toggle">
              <button
                className={`toggle-btn ${newWordCardDirection === 'kr-vn' ? 'active' : ''}`}
                onClick={() => setNewWordCardDirection('kr-vn')}
              >
                🇰🇷→🇻🇳
              </button>
              <button
                className={`toggle-btn ${newWordCardDirection === 'vn-kr' ? 'active' : ''}`}
                onClick={() => setNewWordCardDirection('vn-kr')}
              >
                🇻🇳→🇰🇷
              </button>
            </div>

            {/* Front of card - Question with Audio First */}
            <div className="word-section">
              <div className="section-label">
                {newWordCardDirection === 'vn-kr' ? '📖 Nghĩa tiếng Việt:' : '🇰🇷 Từ tiếng Hàn:'}
              </div>
              
              {/* Audio button - Always visible on front */}
              {newWordState === 'word' && onGenerateAudio && onPlayAudio && (
                <div className="front-audio-section">
                  <button
                    className="front-pronounce-btn"
                    onClick={handleNewWordPronounce}
                    disabled={isNewWordGeneratingAudio}
                    title="Nghe phát âm"
                  >
                    {isNewWordGeneratingAudio ? '⏳ Đang tạo...' : '🔊 Nghe phát âm'}
                  </button>
                  <select
                    className="front-character-select"
                    value={selectedNewWordCharacterId}
                    onChange={(e) => setSelectedNewWordCharacterId(e.target.value)}
                  >
                    {characters.map(char => (
                      <option key={char.id} value={char.id}>
                        {char.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              {/* Word - Hidden until revealed */}
              <div 
                className={`${newWordCardDirection === 'vn-kr' ? 'vietnamese-word-front' : 'korean-word-front'} ${!isNewWordRevealed && newWordState === 'word' ? 'word-hidden' : ''}`}
                onClick={() => !isNewWordRevealed && newWordState === 'word' && setIsNewWordRevealed(true)}
              >
                {!isNewWordRevealed && newWordState === 'word' ? (
                  <span className="reveal-hint">👆 Bấm để xem chữ</span>
                ) : (
                  newWordCardDirection === 'vn-kr' ? currentItem.vocabulary.vietnamese : currentItem.vocabulary.korean
                )}
              </div>
            </div>

            {/* Answer Input - Visible in 'word' state */}
            {newWordState === 'word' && (
              <div className="answer-input-section">
                <div className="section-label">
                  {newWordCardDirection === 'vn-kr' ? '✍️ Điền từ tiếng Hàn:' : '✍️ Điền nghĩa tiếng Việt:'}
                </div>
                <input
                  type="text"
                  className={newWordCardDirection === 'vn-kr' ? 'korean-input' : 'vietnamese-input'}
                  value={newWordUserAnswer}
                  onChange={(e) => setNewWordUserAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newWordUserAnswer.trim()) {
                      const normalizedUserAnswer = newWordUserAnswer.trim().toLowerCase();
                      const correctAnswer = newWordCardDirection === 'vn-kr' ? currentItem.vocabulary.korean : currentItem.vocabulary.vietnamese;
                      const normalizedCorrectAnswer = correctAnswer.trim().toLowerCase();
                      setNewWordAnswerResult(normalizedUserAnswer === normalizedCorrectAnswer ? 'correct' : 'incorrect');
                      setNewWordState('answer');
                    }
                  }}
                  placeholder={newWordCardDirection === 'vn-kr' ? 'Nhập từ tiếng Hàn...' : 'Nhập nghĩa tiếng Việt...'}
                  autoFocus
                />
              </div>
            )}

            {/* Memory section - visible in 'memory' and 'answer' states */}
            {(newWordState === 'memory' || newWordState === 'answer') && (
              <div className="memory-section">
                {currentItem.memory ? (
                  <>
                    <div className="section-header">
                      <div className="section-label">💭 Ký ức của bạn:</div>
                      <button 
                        className="expand-memory-btn"
                        onClick={() => setShowNewWordMemoryPopup(true)}
                        title="Xem đầy đủ"
                      >
                        🔍 Xem đầy đủ
                      </button>
                    </div>
                    <div 
                      className="memory-text memory-preview"
                      onClick={handleNewWordMemoryClick}
                      dangerouslySetInnerHTML={{ __html: newWordProcessedMemoryHtml }}
                    />
                  </>
                ) : (
                  <div className="no-memory">
                    <span>📝 Chưa có ký ức</span>
                    <button 
                      className="add-memory-btn"
                      onClick={() => {
                        setSelectedVocabulary({
                          vocabulary: currentItem.vocabulary,
                          dailyChat: currentItem.dailyChat,
                          memory: currentItem.memory
                        });
                        setActiveTab('learn');
                      }}
                    >
                      ✏️ Thêm ký ức ngay
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Answer - visible in 'answer' state (Back of card) */}
            {newWordState === 'answer' && (
              <div className="answer-section">
                <div className="section-label">
                  {newWordCardDirection === 'vn-kr' ? '🇰🇷 Đáp án tiếng Hàn:' : '📖 Đáp án tiếng Việt:'}
                </div>
                <div className={`${newWordCardDirection === 'vn-kr' ? 'korean-word-answer' : 'vietnamese-word-answer'} ${newWordAnswerResult === 'correct' ? 'correct' : newWordAnswerResult === 'incorrect' ? 'incorrect' : ''}`}>
                  {newWordCardDirection === 'vn-kr' ? currentItem.vocabulary.korean : currentItem.vocabulary.vietnamese}
                </div>
                
                {/* Show user's answer comparison */}
                {newWordUserAnswer && newWordAnswerResult && (
                  <div className={`user-answer-result ${newWordAnswerResult}`}>
                    {newWordAnswerResult === 'correct' ? (
                      <span>✅ Chính xác! Bạn đã nhập: {newWordUserAnswer}</span>
                    ) : (
                      <span>❌ Bạn đã nhập: <span className="wrong-answer">{newWordUserAnswer}</span></span>
                    )}
                  </div>
                )}
                
                {/* Pronunciation controls */}
                {onGenerateAudio && onPlayAudio && characters.length > 0 && (
                  <div className="pronunciation-controls">
                    <select
                      className="character-select"
                      value={selectedNewWordCharacterId}
                      onChange={(e) => setSelectedNewWordCharacterId(e.target.value)}
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
                      onClick={handleNewWordPronounce}
                      disabled={isNewWordGeneratingAudio || !selectedNewWordCharacterId}
                      title="Nghe phát âm"
                    >
                      {isNewWordGeneratingAudio ? '⏳' : '🔊'}
                    </button>
                  </div>
                )}
                
                {/* Search word in story button */}
                {journal && journal.length > 0 && (
                  <button
                    className="search-word-btn"
                    onClick={() => {
                      setSearchWord(currentItem.vocabulary.korean);
                      setShowSearchPopup(true);
                    }}
                    title={`Tìm "${currentItem.vocabulary.korean}" trong story`}
                  >
                    🔍 Tìm trong story ({currentNewWordUsageCount})
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="card-actions">
            {newWordState === 'word' && (
              <>
                <button 
                  className="action-btn memory-btn"
                  onClick={() => setNewWordState('memory')}
                >
                  💭 Xem ký ức
                </button>
                <button 
                  className="action-btn answer-btn"
                  onClick={() => {
                    const normalizedUserAnswer = newWordUserAnswer.trim().toLowerCase();
                    const correctAnswer = newWordCardDirection === 'vn-kr' ? currentItem.vocabulary.korean : currentItem.vocabulary.vietnamese;
                    const normalizedCorrectAnswer = correctAnswer.trim().toLowerCase();
                    setNewWordAnswerResult(normalizedUserAnswer === normalizedCorrectAnswer ? 'correct' : 'incorrect');
                    setNewWordState('answer');
                  }}
                >
                  ✅ Kiểm tra đáp án
                </button>
              </>
            )}

            {newWordState === 'memory' && (
              <button 
                className="action-btn answer-btn full-width"
                onClick={() => {
                  const normalizedUserAnswer = newWordUserAnswer.trim().toLowerCase();
                  const correctAnswer = newWordCardDirection === 'vn-kr' ? currentItem.vocabulary.korean : currentItem.vocabulary.vietnamese;
                  const normalizedCorrectAnswer = correctAnswer.trim().toLowerCase();
                  setNewWordAnswerResult(normalizedUserAnswer === normalizedCorrectAnswer ? 'correct' : 'incorrect');
                  setNewWordState('answer');
                }}
              >
                ✅ Kiểm tra đáp án
              </button>
            )}

            {newWordState === 'answer' && (
              <div className="rating-buttons">
                <button 
                  className="rating-btn"
                  style={{ borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.2)' }}
                  onClick={() => handleNewWordRating(1)}
                >
                  <span className="rating-label">😰 Khó</span>
                  <span className="rating-sublabel">~{Math.round(calculateNewCardInterval(1))} ngày</span>
                </button>
                <button 
                  className="rating-btn"
                  style={{ borderColor: '#fb923c', backgroundColor: 'rgba(251, 146, 60, 0.2)' }}
                  onClick={() => handleNewWordRating(2)}
                >
                  <span className="rating-label">🤔 Bình thường</span>
                  <span className="rating-sublabel">~{Math.round(calculateNewCardInterval(2))} ngày</span>
                </button>
                <button 
                  className="rating-btn"
                  style={{ borderColor: '#4ade80', backgroundColor: 'rgba(74, 222, 128, 0.2)' }}
                  onClick={() => handleNewWordRating(3)}
                >
                  <span className="rating-label">😊 Dễ</span>
                  <span className="rating-sublabel">~{Math.round(calculateNewCardInterval(3))} ngày</span>
                </button>
                <button 
                  className="rating-btn"
                  style={{ borderColor: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.2)' }}
                  onClick={() => handleNewWordRating(4)}
                >
                  <span className="rating-label">🤩 Rất dễ</span>
                  <span className="rating-sublabel">~{Math.round(calculateNewCardInterval(4))} ngày</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Skip */}
        <button 
          className="skip-btn"
          onClick={() => {
            setNewWordState('word');
            if (currentNewWordIndex < newWordsQueue.length - 1) {
              setCurrentNewWordIndex(prev => prev + 1);
            } else {
              setIsNewWordsComplete(true);
            }
          }}
        >
          Bỏ qua →
        </button>

        {/* Memory Popup Modal */}
        {showNewWordMemoryPopup && currentItem.memory && (
          <div className="memory-popup-overlay" onClick={() => setShowNewWordMemoryPopup(false)}>
            <div className="memory-popup" onClick={e => e.stopPropagation()}>
              <div className="memory-popup-header">
                <div className="memory-popup-title">
                  <span className="popup-word">{currentItem.vocabulary.korean}</span>
                </div>
                <button className="popup-close-btn" onClick={() => setShowNewWordMemoryPopup(false)}>✕</button>
              </div>
              <div className="memory-popup-content">
                <div 
                  className="memory-full-content"
                  onClick={handleNewWordMemoryClick}
                  dangerouslySetInnerHTML={{ __html: newWordProcessedMemoryHtml }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render difficult words tab (Hard/Again rated today - NO FSRS update)
  const renderDifficultTab = () => {
    if (difficultVocabularies.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon">✨</div>
          <h3>Không có từ khó</h3>
          <p>Bạn chưa có từ nào được đánh dấu "Khó" hoặc "Quên" hôm nay.</p>
          <p className="hint">Hãy ôn tập trước, những từ khó sẽ xuất hiện ở đây!</p>
        </div>
      );
    }

    if (isDifficultComplete) {
      return (
        <div className="session-complete">
          <div className="complete-icon">💪</div>
          <h3>Hoàn thành ôn từ khó!</h3>
          <div className="complete-stats">
            <p>Đã luyện tập <strong>{difficultSessionStats.practiced}</strong> từ khó</p>
          </div>
          <button 
            className="restart-btn"
            onClick={() => {
              setDifficultQueue([]);
              setIsDifficultComplete(false);
            }}
          >
            🔄 Luyện lại
          </button>
          <button 
            className="go-review-btn"
            onClick={() => setActiveTab('review')}
          >
            Tiếp tục ôn tập →
          </button>
        </div>
      );
    }

    if (difficultQueue.length === 0) {
      return (
        <div className="loading-state">
          <div className="loading-spinner">⏳</div>
        </div>
      );
    }

    const currentItem = difficultQueue[currentDifficultIndex];
    
    return (
      <div className="difficult-words-tab">
        {/* Progress */}
        <div className="flashcard-progress">
          <div className="progress-text">
            {currentDifficultIndex + 1} / {difficultQueue.length}
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill difficult"
              style={{ width: `${((currentDifficultIndex + 1) / difficultQueue.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Difficult Word Card */}
        <div className="difficult-word-card flashcard">
          <div className="difficult-badge">
            {currentItem.todayRating === 1 ? '😔 Quên' : '🤔 Khó'}
          </div>
          
          {/* Card Content */}
          <div className="card-content">
            {/* Direction Toggle */}
            <div className="direction-toggle">
              <button
                className={`toggle-btn ${difficultCardDirection === 'kr-vn' ? 'active' : ''}`}
                onClick={() => setDifficultCardDirection('kr-vn')}
              >
                🇰🇷→🇻🇳
              </button>
              <button
                className={`toggle-btn ${difficultCardDirection === 'vn-kr' ? 'active' : ''}`}
                onClick={() => setDifficultCardDirection('vn-kr')}
              >
                🇻🇳→🇰🇷
              </button>
            </div>

            {/* Front of card - Question with Audio First */}
            <div className="word-section">
              <div className="section-label">
                {difficultCardDirection === 'vn-kr' ? '📖 Nghĩa tiếng Việt:' : '🇰🇷 Từ tiếng Hàn:'}
              </div>
              
              {/* Audio button - Always visible on front */}
              {difficultWordState === 'word' && onGenerateAudio && onPlayAudio && (
                <div className="front-audio-section">
                  <button
                    className="front-pronounce-btn"
                    onClick={handleDifficultPronounce}
                    disabled={isDifficultGeneratingAudio}
                    title="Nghe phát âm"
                  >
                    {isDifficultGeneratingAudio ? '⏳ Đang tạo...' : '🔊 Nghe phát âm'}
                  </button>
                  <select
                    className="front-character-select"
                    value={selectedDifficultCharacterId}
                    onChange={(e) => setSelectedDifficultCharacterId(e.target.value)}
                  >
                    {characters.map(char => (
                      <option key={char.id} value={char.id}>
                        {char.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              {/* Word - Hidden until revealed */}
              <div 
                className={`${difficultCardDirection === 'vn-kr' ? 'vietnamese-word-front' : 'korean-word-front'} ${!isDifficultWordRevealed && difficultWordState === 'word' ? 'word-hidden' : ''}`}
                onClick={() => !isDifficultWordRevealed && difficultWordState === 'word' && setIsDifficultWordRevealed(true)}
              >
                {!isDifficultWordRevealed && difficultWordState === 'word' ? (
                  <span className="reveal-hint">👆 Bấm để xem chữ</span>
                ) : (
                  difficultCardDirection === 'vn-kr' ? currentItem.vocabulary.vietnamese : currentItem.vocabulary.korean
                )}
              </div>
            </div>

            {/* Answer Input - Visible in 'word' state */}
            {difficultWordState === 'word' && (
              <div className="answer-input-section">
                <div className="section-label">
                  {difficultCardDirection === 'vn-kr' ? '✍️ Điền từ tiếng Hàn:' : '✍️ Điền nghĩa tiếng Việt:'}
                </div>
                <input
                  type="text"
                  className={difficultCardDirection === 'vn-kr' ? 'korean-input' : 'vietnamese-input'}
                  value={difficultUserAnswer}
                  onChange={(e) => setDifficultUserAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && difficultUserAnswer.trim()) {
                      const normalizedUserAnswer = difficultUserAnswer.trim().toLowerCase();
                      const correctAnswer = difficultCardDirection === 'vn-kr' ? currentItem.vocabulary.korean : currentItem.vocabulary.vietnamese;
                      const normalizedCorrectAnswer = correctAnswer.trim().toLowerCase();
                      setDifficultAnswerResult(normalizedUserAnswer === normalizedCorrectAnswer ? 'correct' : 'incorrect');
                      setDifficultWordState('answer');
                    }
                  }}
                  placeholder={difficultCardDirection === 'vn-kr' ? 'Nhập từ tiếng Hàn...' : 'Nhập nghĩa tiếng Việt...'}
                  autoFocus
                />
              </div>
            )}

            {/* Memory section - visible in 'memory' and 'answer' states */}
            {(difficultWordState === 'memory' || difficultWordState === 'answer') && (
              <div className="memory-section">
                {currentItem.memory ? (
                  <>
                    <div className="section-header">
                      <div className="section-label">💭 Ký ức của bạn:</div>
                      <button 
                        className="expand-memory-btn"
                        onClick={() => setShowDifficultMemoryPopup(true)}
                        title="Xem đầy đủ"
                      >
                        🔍 Xem đầy đủ
                      </button>
                    </div>
                    <div 
                      className="memory-text memory-preview"
                      onClick={handleDifficultMemoryClick}
                      dangerouslySetInnerHTML={{ __html: difficultProcessedMemoryHtml }}
                    />
                  </>
                ) : (
                  <div className="no-memory">
                    <span>📝 Chưa có ký ức</span>
                  </div>
                )}
              </div>
            )}

            {/* Answer - visible in 'answer' state (Back of card) */}
            {difficultWordState === 'answer' && (
              <div className="answer-section">
                <div className="section-label">
                  {difficultCardDirection === 'vn-kr' ? '🇰🇷 Đáp án tiếng Hàn:' : '📖 Đáp án tiếng Việt:'}
                </div>
                <div className={`${difficultCardDirection === 'vn-kr' ? 'korean-word-answer' : 'vietnamese-word-answer'} ${difficultAnswerResult === 'correct' ? 'correct' : difficultAnswerResult === 'incorrect' ? 'incorrect' : ''}`}>
                  {difficultCardDirection === 'vn-kr' ? currentItem.vocabulary.korean : currentItem.vocabulary.vietnamese}
                </div>
                
                {/* Show user's answer comparison */}
                {difficultUserAnswer && difficultAnswerResult && (
                  <div className={`user-answer-result ${difficultAnswerResult}`}>
                    {difficultAnswerResult === 'correct' ? (
                      <span>✅ Chính xác! Bạn đã nhập: {difficultUserAnswer}</span>
                    ) : (
                      <span>❌ Bạn đã nhập: <span className="wrong-answer">{difficultUserAnswer}</span></span>
                    )}
                  </div>
                )}
                
                {/* Search word in story button */}
                {journal && journal.length > 0 && (
                  <button
                    className="search-word-btn"
                    onClick={() => {
                      setSearchWord(currentItem.vocabulary.korean);
                      setShowSearchPopup(true);
                    }}
                    title={`Tìm "${currentItem.vocabulary.korean}" trong story`}
                  >
                    🔍 Tìm trong story ({currentDifficultWordUsageCount})
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="card-actions">
            {difficultWordState === 'word' && (
              <>
                <button 
                  className="action-btn memory-btn"
                  onClick={() => setDifficultWordState('memory')}
                >
                  💭 Xem ký ức
                </button>
                <button 
                  className="action-btn answer-btn"
                  onClick={() => {
                    const normalizedUserAnswer = difficultUserAnswer.trim().toLowerCase();
                    const correctAnswer = difficultCardDirection === 'vn-kr' ? currentItem.vocabulary.korean : currentItem.vocabulary.vietnamese;
                    const normalizedCorrectAnswer = correctAnswer.trim().toLowerCase();
                    setDifficultAnswerResult(normalizedUserAnswer === normalizedCorrectAnswer ? 'correct' : 'incorrect');
                    setDifficultWordState('answer');
                  }}
                >
                  ✅ Kiểm tra đáp án
                </button>
              </>
            )}

            {difficultWordState === 'memory' && (
              <button 
                className="action-btn answer-btn full-width"
                onClick={() => {
                  const normalizedUserAnswer = difficultUserAnswer.trim().toLowerCase();
                  const correctAnswer = difficultCardDirection === 'vn-kr' ? currentItem.vocabulary.korean : currentItem.vocabulary.vietnamese;
                  const normalizedCorrectAnswer = correctAnswer.trim().toLowerCase();
                  setDifficultAnswerResult(normalizedUserAnswer === normalizedCorrectAnswer ? 'correct' : 'incorrect');
                  setDifficultWordState('answer');
                }}
              >
                ✅ Kiểm tra đáp án
              </button>
            )}

            {difficultWordState === 'answer' && (
              <div className="difficult-rating-buttons">
                <button 
                  className="action-btn forgot-btn"
                  onClick={handleDifficultForgot}
                >
                  😔 Quên
                </button>
                <button 
                  className="action-btn remember-btn"
                  onClick={handleDifficultRemember}
                >
                  😊 Nhớ
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Skip */}
        <button 
          className="skip-btn"
          onClick={() => {
            setDifficultWordState('word');
            setDifficultUserAnswer('');
            setDifficultAnswerResult(null);
            setIsDifficultWordRevealed(false);
            if (currentDifficultIndex < difficultQueue.length - 1) {
              setCurrentDifficultIndex(prev => prev + 1);
            } else {
              setIsDifficultComplete(true);
            }
          }}
        >
          Bỏ qua →
        </button>

        {/* Memory Popup Modal */}
        {showDifficultMemoryPopup && currentItem.memory && (
          <div className="memory-popup-overlay" onClick={() => setShowDifficultMemoryPopup(false)}>
            <div className="memory-popup" onClick={e => e.stopPropagation()}>
              <div className="memory-popup-header">
                <div className="memory-popup-title">
                  <span className="popup-word">{currentItem.vocabulary.korean}</span>
                </div>
                <button className="popup-close-btn" onClick={() => setShowDifficultMemoryPopup(false)}>✕</button>
              </div>
              <div className="memory-popup-content">
                <div 
                  className="memory-full-content"
                  onClick={handleDifficultMemoryClick}
                  dangerouslySetInnerHTML={{ __html: difficultProcessedMemoryHtml }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

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
              className={`filter-btn ${filterMode === 'learned' ? 'active' : ''}`}
              onClick={() => setFilterMode('learned')}
            >
              Đã học ({allVocabularies.filter(v => v.review).length})
            </button>
            <button 
              className={`filter-btn ${filterMode === 'not-learned' ? 'active' : ''}`}
              onClick={() => setFilterMode('not-learned')}
            >
              Chưa học ({allVocabularies.filter(v => !v.review).length})
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
              >
                <div className="vocab-main" onClick={() => setSelectedVocabulary(item)}>
                  <span className="vocab-korean">{item.vocabulary.korean}</span>
                  <span className="vocab-vietnamese">{item.vocabulary.vietnamese}</span>
                </div>
                
                {/* FSRS Stats */}
                <div className="vocab-fsrs-stats">
                  {item.review ? (
                    <>
                      <span className="fsrs-stat" title="Stability">S: {item.review.stability?.toFixed(1) || '0'}</span>
                      <span className="fsrs-stat" title="Difficulty">D: {item.review.difficulty?.toFixed(1) || '5'}</span>
                    </>
                  ) : (
                    <span className="fsrs-new-badge">🆕 New</span>
                  )}
                </div>

                {/* Direction Toggle */}
                {item.review && (
                  <div className="vocab-direction-toggle">
                    <button
                      className={`mini-toggle-btn ${(item.review.cardDirection || 'kr-vn') === 'kr-vn' ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Update direction to kr-vn
                        const updatedJournal = journal.map(dc => {
                          if (dc.id === item.dailyChat.id && dc.reviewSchedule) {
                            const newSchedule = dc.reviewSchedule.map(r => 
                              r.vocabularyId === item.vocabulary.id 
                                ? { ...r, cardDirection: 'kr-vn' as const }
                                : r
                            );
                            return { ...dc, reviewSchedule: newSchedule };
                          }
                          return dc;
                        });
                        onUpdateJournal(updatedJournal);
                      }}
                      title="Hàn → Việt"
                    >
                      🇰🇷
                    </button>
                    <button
                      className={`mini-toggle-btn ${item.review.cardDirection === 'vn-kr' ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Update direction to vn-kr
                        const updatedJournal = journal.map(dc => {
                          if (dc.id === item.dailyChat.id && dc.reviewSchedule) {
                            const newSchedule = dc.reviewSchedule.map(r => 
                              r.vocabularyId === item.vocabulary.id 
                                ? { ...r, cardDirection: 'vn-kr' as const }
                                : r
                            );
                            return { ...dc, reviewSchedule: newSchedule };
                          }
                          return dc;
                        });
                        onUpdateJournal(updatedJournal);
                      }}
                      title="Việt → Hàn"
                    >
                      🇻🇳
                    </button>
                  </div>
                )}

                {/* Reset FSRS Button */}
                {item.review && (
                  <button
                    className="vocab-reset-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('Bạn có chắc muốn reset lại lịch ôn cho từ này?')) {
                        const resetReview: VocabularyReview = {
                          ...item.review!,
                          stability: 0,
                          difficulty: 5,
                          currentIntervalDays: 1,
                          nextReviewDate: new Date().toISOString(),
                          lapses: 0
                        };
                        const updatedJournal = journal.map(dc => {
                          if (dc.id === item.dailyChat.id && dc.reviewSchedule) {
                            const newSchedule = dc.reviewSchedule.map(r => 
                              r.vocabularyId === item.vocabulary.id ? resetReview : r
                            );
                            return { ...dc, reviewSchedule: newSchedule };
                          }
                          return dc;
                        });
                        onUpdateJournal(updatedJournal);
                      }
                    }}
                    title="Reset lịch ôn"
                  >
                    🔄
                  </button>
                )}

                {/* Edit Vocabulary Button */}
                <button
                  className="vocab-edit-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditVocabulary(item.vocabulary, item.dailyChat.id);
                  }}
                  title="Sửa từ vựng"
                >
                  ✏️
                </button>

                {/* Delete Vocabulary Button */}
                <button
                  className="vocab-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteVocabulary(item.vocabulary.id, item.dailyChat.id);
                  }}
                  title="Xóa từ vựng"
                >
                  🗑️
                </button>

                <div className="vocab-status" onClick={() => setSelectedVocabulary(item)}>
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
        onSearchWord={() => {
          setSearchWord(currentItem.vocabulary.korean);
          setShowSearchPopup(true);
        }}
        onCardDirectionChange={handleCardDirectionChange}
        onResetFSRS={handleResetFSRS}
        wordUsageCount={currentReviewWordUsageCount}
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

      {/* Stats Bar */}
      <div className="stats-bar">
        <div className="stat-item">
          <span className="stat-label">Đang học</span>
          <span className="stat-value">{vocabStats.withReview}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Chờ thêm</span>
          <span className="stat-value">{vocabStats.withoutReview}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Ôn hôm nay</span>
          <span className="stat-value">{dueReviews.length}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Từ mới/ngày</span>
          <span className="stat-value">{fsrsSettings.newCardsPerDay || 20}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'new' ? 'active' : ''}`}
          onClick={() => setActiveTab('new')}
        >
          🆕 Từ mới
          {newVocabularies.length > 0 && (
            <span className="badge new">{Math.min(newVocabularies.length, fsrsSettings.newCardsPerDay || 20)}</span>
          )}
        </button>
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
          className={`tab ${activeTab === 'difficult' ? 'active' : ''}`}
          onClick={() => setActiveTab('difficult')}
        >
          🔥 Từ khó
          {difficultVocabularies.length > 0 && (
            <span className="badge difficult">{difficultVocabularies.length}</span>
          )}
        </button>
        <button 
          className={`tab ${activeTab === 'learn' ? 'active' : ''}`}
          onClick={() => setActiveTab('learn')}
        >
          ✏️ Ký ức
        </button>
      </div>

      {/* Content */}
      <div className="tab-content">
        {activeTab === 'new' ? renderNewWordsTab() : 
         activeTab === 'difficult' ? renderDifficultTab() :
         activeTab === 'learn' ? renderLearnTab() : renderReviewTab()}
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

      {/* Search Word Usage Popup - Unified for both new words and review tabs */}
      {showSearchPopup && searchWord && (
        <div className="search-popup-overlay" onClick={() => setShowSearchPopup(false)}>
          <div className="search-popup" onClick={e => e.stopPropagation()}>
            <div className="search-popup-header">
              <div className="search-popup-title">
                🔍 "{searchWord}" trong story
              </div>
              <button className="popup-close-btn" onClick={() => setShowSearchPopup(false)}>✕</button>
            </div>
            <div className="search-popup-results">
              {searchWordUsageResults.length === 0 ? (
                <div className="no-results">
                  Không tìm thấy "{searchWord}" trong story nào
                </div>
              ) : (
                <div className="results-list">
                  <div className="results-count">
                    Tìm thấy {searchWordUsageResults.length} lần sử dụng
                  </div>
                  {searchWordUsageResults.map((result, index) => {
                    const dateStr = new Date(result.dailyChat.date).toLocaleDateString('vi-VN');
                    const characterName = result.message.characterName || (result.message.sender === 'user' ? 'Bạn' : 'Bot');
                    const text = result.message.text;
                    // Highlight the searched word
                    const highlightedText = text.replace(
                      new RegExp(`(${searchWord})`, 'g'),
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

      {/* Edit Vocabulary Modal */}
      {editingVocab && (
        <div className="edit-vocab-modal-overlay" onClick={() => setEditingVocab(null)}>
          <div className="edit-vocab-modal" onClick={e => e.stopPropagation()}>
            <div className="edit-vocab-header">
              <h3>✏️ Sửa từ vựng</h3>
              <button className="popup-close-btn" onClick={() => setEditingVocab(null)}>✕</button>
            </div>
            <div className="edit-vocab-content">
              <div className="edit-vocab-field">
                <label>Tiếng Hàn:</label>
                <input
                  type="text"
                  value={editingVocab.korean}
                  onChange={(e) => setEditingVocab(prev => prev ? { ...prev, korean: e.target.value } : null)}
                  placeholder="Nhập từ tiếng Hàn..."
                  autoFocus
                />
              </div>
              <div className="edit-vocab-field">
                <label>Nghĩa tiếng Việt:</label>
                <input
                  type="text"
                  value={editingVocab.vietnamese}
                  onChange={(e) => setEditingVocab(prev => prev ? { ...prev, vietnamese: e.target.value } : null)}
                  placeholder="Nhập nghĩa tiếng Việt..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveEditedVocabulary();
                    }
                  }}
                />
              </div>
            </div>
            <div className="edit-vocab-actions">
              <button className="cancel-btn" onClick={() => setEditingVocab(null)}>Hủy</button>
              <button className="save-btn" onClick={handleSaveEditedVocabulary}>Lưu</button>
            </div>
          </div>
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

        /* Stats Bar */
        .stats-bar {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          background: #16213e;
          border-bottom: 1px solid #0f3460;
          gap: 16px;
          flex-wrap: wrap;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .stat-label {
          font-size: 11px;
          color: #888;
        }

        .stat-value {
          font-size: 28px;
          font-weight: bold;
          color: #fff;
        }

        .add-new-btn {
          margin-left: auto;
          padding: 8px 16px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: none;
          border-radius: 20px;
          color: white;
          font-size: 13px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .add-new-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
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

        .tab .badge.new {
          background: #28a745;
        }

        .tab .badge.difficult {
          background: #ff6b35;
        }

        .tab-content {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        /* New Words Tab */
        .new-words-tab {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px;
          overflow-y: auto;
        }

        /* Difficult Words Tab */
        .difficult-words-tab {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px;
          overflow-y: auto;
        }

        .difficult-word-card {
          width: 100%;
          max-width: 400px;
          background: #16213e;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
        }

        .difficult-badge {
          background: linear-gradient(135deg, #ff6b35, #e94560);
          color: white;
          padding: 6px 16px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: bold;
        }

        .progress-fill.difficult {
          background: linear-gradient(90deg, #ff6b35, #e94560);
        }

        .got-it-btn {
          background: linear-gradient(135deg, #28a745, #20c997) !important;
          color: white !important;
        }

        .got-it-btn:hover {
          opacity: 0.9;
        }

        /* Difficult rating buttons */
        .difficult-rating-buttons {
          display: flex;
          gap: 12px;
          width: 100%;
        }

        .forgot-btn {
          flex: 1;
          background: linear-gradient(135deg, #ef4444, #dc2626) !important;
          color: white !important;
          padding: 14px !important;
          font-size: 16px !important;
        }

        .forgot-btn:hover {
          opacity: 0.9;
          transform: scale(1.02);
        }

        .remember-btn {
          flex: 1;
          background: linear-gradient(135deg, #4ade80, #22c55e) !important;
          color: white !important;
          padding: 14px !important;
          font-size: 16px !important;
        }

        .remember-btn:hover {
          opacity: 0.9;
          transform: scale(1.02);
        }

        .new-word-card {
          width: 100%;
          max-width: 400px;
          background: #16213e;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
        }

        .new-badge {
          background: linear-gradient(135deg, #28a745, #20c997);
          color: white;
          padding: 6px 16px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: bold;
        }

        .word-display {
          text-align: center;
          padding: 20px 0;
        }

        .word-display .korean-word {
          font-size: 48px;
          color: #fff;
          font-weight: bold;
        }

        .memory-preview-section {
          width: 100%;
          padding: 12px;
          background: rgba(102, 126, 234, 0.1);
          border-radius: 10px;
          border-left: 3px solid #667eea;
        }

        .memory-preview-section .section-label {
          font-size: 12px;
          color: #888;
          margin-bottom: 8px;
        }

        .memory-preview-text {
          color: #ddd;
          font-size: 14px;
          line-height: 1.5;
          max-height: 100px;
          overflow: hidden;
        }

        .memory-preview-text img {
          max-width: 100%;
          border-radius: 6px;
          margin: 4px 0;
        }

        .new-word-actions {
          display: flex;
          gap: 10px;
          width: 100%;
        }

        .show-answer-btn {
          flex: 1;
          padding: 14px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 14px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .show-answer-btn:hover {
          transform: scale(1.02);
          box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
        }

        .add-memory-btn {
          padding: 14px 16px;
          background: rgba(102, 126, 234, 0.2);
          border: 1px solid #667eea;
          border-radius: 12px;
          color: #667eea;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .add-memory-btn:hover {
          background: rgba(102, 126, 234, 0.3);
        }

        .answer-display {
          text-align: center;
          padding: 16px;
          background: rgba(74, 222, 128, 0.1);
          border-radius: 12px;
          width: 100%;
        }

        .answer-display .vietnamese-word {
          font-size: 24px;
          color: #4ade80;
          font-weight: bold;
        }

        .difficulty-question {
          text-align: center;
          color: #888;
          font-size: 14px;
        }

        .difficulty-question p {
          margin: 0;
        }

        .rating-buttons.horizontal {
          display: flex;
          flex-direction: row;
          gap: 8px;
          width: 100%;
        }

        .rating-btn {
          flex: 1;
          padding: 12px 8px;
          border: 2px solid;
          border-radius: 10px;
          background: transparent;
          cursor: pointer;
          transition: transform 0.2s, background 0.2s;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .rating-btn:hover {
          transform: translateY(-2px);
        }

        .rating-btn.hard {
          border-color: #ef4444;
          background: rgba(239, 68, 68, 0.1);
        }

        .rating-btn.hard:hover {
          background: rgba(239, 68, 68, 0.2);
        }

        .rating-btn.medium {
          border-color: #fb923c;
          background: rgba(251, 146, 60, 0.1);
        }

        .rating-btn.medium:hover {
          background: rgba(251, 146, 60, 0.2);
        }

        .rating-btn.easy {
          border-color: #4ade80;
          background: rgba(74, 222, 128, 0.1);
        }

        .rating-btn.easy:hover {
          background: rgba(74, 222, 128, 0.2);
        }

        .rating-label {
          font-size: 13px;
          color: #fff;
        }

        .rating-sublabel {
          font-size: 11px;
          color: #888;
          margin-top: 2px;
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

        .progress-fill.new-word {
          background: linear-gradient(90deg, #28a745, #20c997);
        }

        /* Memory section for new words */
        .memory-section {
          width: 100%;
          background: rgba(102, 126, 234, 0.1);
          border-radius: 12px;
          padding: 16px;
          border-left: 3px solid #667eea;
        }

        .memory-section .section-label {
          font-size: 12px;
          color: #888;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .memory-text {
          color: #ddd;
          font-size: 14px;
          line-height: 1.6;
        }

        .memory-text img {
          max-width: 100%;
          border-radius: 8px;
          margin: 8px 0;
        }

        .memory-text p {
          margin: 8px 0;
        }

        .no-memory {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          color: #888;
        }

        .add-memory-btn-inline {
          padding: 8px 16px;
          background: rgba(102, 126, 234, 0.2);
          border: 1px dashed #667eea;
          border-radius: 8px;
          color: #667eea;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .add-memory-btn-inline:hover {
          background: rgba(102, 126, 234, 0.3);
          border-style: solid;
        }

        /* Direction toggle */
        .direction-toggle {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .toggle-btn {
          padding: 6px 12px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.05);
          color: #888;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .toggle-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #aaa;
        }

        .toggle-btn.active {
          background: linear-gradient(135deg, #667eea, #764ba2);
          border-color: #667eea;
          color: #fff;
        }

        /* Korean word front (for kr-vn mode) */
        .korean-word-front {
          font-size: 36px;
          color: #fff;
          font-weight: bold;
          margin-top: 8px;
        }

        /* Vietnamese word front (for vn-kr mode) */
        .vietnamese-word-front {
          font-size: 28px;
          color: #4ade80;
          font-weight: bold;
          margin-top: 8px;
        }

        /* Front audio section - Audio first, word hidden */
        .front-audio-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }

        .front-pronounce-btn {
          width: 100%;
          padding: 16px 24px;
          font-size: 20px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          border: none;
          border-radius: 12px;
          color: #fff;
          cursor: pointer;
          transition: all 0.2s;
          font-weight: bold;
        }

        .front-pronounce-btn:hover:not(:disabled) {
          transform: scale(1.02);
          box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
        }

        .front-pronounce-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .front-character-select {
          padding: 8px 16px;
          font-size: 14px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.05);
          color: #ccc;
          cursor: pointer;
          outline: none;
        }

        .word-hidden {
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2));
          border: 2px dashed rgba(102, 126, 234, 0.5);
          border-radius: 12px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .word-hidden:hover {
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.3), rgba(118, 75, 162, 0.3));
          border-color: rgba(102, 126, 234, 0.7);
        }

        .reveal-hint {
          color: #888;
          font-size: 16px;
          font-weight: normal;
        }

        /* Answer input section */
        .answer-input-section {
          width: 100%;
          padding: 16px;
          background: rgba(102, 126, 234, 0.1);
          border-radius: 12px;
        }

        .korean-input {
          width: 100%;
          padding: 14px 16px;
          font-size: 24px;
          text-align: center;
          border: 2px solid rgba(102, 126, 234, 0.3);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
          outline: none;
          margin-top: 8px;
          transition: border-color 0.2s;
          box-sizing: border-box;
        }

        .korean-input:focus {
          border-color: #667eea;
        }

        .korean-input::placeholder {
          color: #666;
        }

        /* Korean word answer display */
        .korean-word-answer {
          font-size: 36px;
          font-weight: bold;
          margin-top: 8px;
          padding: 12px;
          border-radius: 12px;
          text-align: center;
        }

        .korean-word-answer.correct {
          color: #4ade80;
          background: rgba(74, 222, 128, 0.1);
        }

        .korean-word-answer.incorrect {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.1);
        }

        /* Vietnamese word answer display */
        .vietnamese-word-answer {
          font-size: 24px;
          font-weight: bold;
          margin-top: 8px;
          padding: 12px;
          border-radius: 12px;
          text-align: center;
        }

        .vietnamese-word-answer.correct {
          color: #4ade80;
          background: rgba(74, 222, 128, 0.1);
        }

        .vietnamese-word-answer.incorrect {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.1);
        }

        /* Vietnamese input */
        .vietnamese-input {
          width: 100%;
          padding: 14px 16px;
          font-size: 18px;
          text-align: center;
          border: 2px solid rgba(74, 222, 128, 0.3);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
          outline: none;
          margin-top: 8px;
          transition: border-color 0.2s;
          box-sizing: border-box;
        }

        .vietnamese-input:focus {
          border-color: #4ade80;
        }

        .vietnamese-input::placeholder {
          color: #666;
        }

        /* User answer result feedback */
        .user-answer-result {
          text-align: center;
          padding: 10px;
          border-radius: 8px;
          margin-top: 12px;
          font-size: 14px;
        }

        .user-answer-result.correct {
          background: rgba(74, 222, 128, 0.2);
          color: #4ade80;
        }

        .user-answer-result.incorrect {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }

        .user-answer-result .wrong-answer {
          text-decoration: line-through;
          opacity: 0.7;
        }

        /* Answer section */
        .answer-section {
          width: 100%;
          text-align: center;
          padding: 16px;
          background: rgba(74, 222, 128, 0.1);
          border-radius: 12px;
        }

        .answer-section .section-label {
          font-size: 12px;
          color: #888;
          margin-bottom: 8px;
        }

        .answer-section .vietnamese-word {
          font-size: 24px;
          color: #4ade80;
          font-weight: bold;
        }

        /* Card actions */
        .card-actions {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .action-btn {
          padding: 14px 20px;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .action-btn:hover {
          transform: scale(1.02);
        }

        .action-btn.memory-btn {
          background: rgba(102, 126, 234, 0.2);
          border: 1px solid #667eea;
          color: #667eea;
        }

        .action-btn.memory-btn:hover {
          background: rgba(102, 126, 234, 0.3);
        }

        .action-btn.answer-btn {
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
        }

        .action-btn.answer-btn:hover {
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
        }

        .action-btn.full-width {
          width: 100%;
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

        .go-review-btn {
          margin-top: 12px;
          padding: 12px 24px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 14px;
          cursor: pointer;
          transition: transform 0.2s;
        }

        .go-review-btn:hover {
          transform: scale(1.05);
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
          gap: 6px;
          flex-wrap: wrap;
        }

        .filter-btn {
          flex: 0 1 auto;
          padding: 6px 10px;
          background: #16213e;
          border: 1px solid #0f3460;
          border-radius: 6px;
          color: #888;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
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

        /* FSRS Stats in Learn Tab */
        .vocab-fsrs-stats {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin-left: 8px;
          padding: 4px 8px;
          background: rgba(102, 126, 234, 0.1);
          border-radius: 6px;
          min-width: 60px;
        }

        .fsrs-stat {
          font-size: 11px;
          color: #888;
          font-family: monospace;
        }

        .fsrs-new-badge {
          font-size: 12px;
          color: #4ade80;
          white-space: nowrap;
        }

        /* Direction Toggle in Learn Tab */
        .vocab-direction-toggle {
          display: flex;
          gap: 4px;
          margin-left: 8px;
        }

        .mini-toggle-btn {
          width: 28px;
          height: 28px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.05);
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .mini-toggle-btn:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .mini-toggle-btn.active {
          background: linear-gradient(135deg, #667eea, #764ba2);
          border-color: #667eea;
        }

        /* Reset Button in Learn Tab */
        .vocab-reset-btn {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #ef4444;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
          margin-left: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .vocab-reset-btn:hover {
          background: rgba(239, 68, 68, 0.3);
          transform: rotate(180deg);
        }

        /* Edit Button in Learn Tab */
        .vocab-edit-btn {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.2);
          color: #3b82f6;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
          margin-left: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.6;
        }

        .vocab-edit-btn:hover {
          background: rgba(59, 130, 246, 0.25);
          border-color: rgba(59, 130, 246, 0.4);
          opacity: 1;
          transform: scale(1.1);
        }

        .vocab-item:hover .vocab-edit-btn {
          opacity: 1;
        }

        /* Delete Button in Learn Tab */
        .vocab-delete-btn {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          background: rgba(220, 38, 38, 0.1);
          border: 1px solid rgba(220, 38, 38, 0.2);
          color: #dc2626;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
          margin-left: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.6;
        }

        .vocab-delete-btn:hover {
          background: rgba(220, 38, 38, 0.25);
          border-color: rgba(220, 38, 38, 0.4);
          opacity: 1;
          transform: scale(1.1);
        }

        .vocab-item:hover .vocab-delete-btn {
          opacity: 1;
        }

        /* Edit Vocabulary Modal */
        .edit-vocab-modal-overlay {
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
          padding: 20px;
        }

        .edit-vocab-modal {
          background: linear-gradient(135deg, #1e1e3f, #2d2d5a);
          border-radius: 16px;
          width: 100%;
          max-width: 400px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
        }

        .edit-vocab-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .edit-vocab-header h3 {
          margin: 0;
          color: #fff;
          font-size: 18px;
        }

        .edit-vocab-content {
          padding: 20px;
        }

        .edit-vocab-field {
          margin-bottom: 16px;
        }

        .edit-vocab-field:last-child {
          margin-bottom: 0;
        }

        .edit-vocab-field label {
          display: block;
          color: rgba(255, 255, 255, 0.7);
          font-size: 13px;
          margin-bottom: 6px;
        }

        .edit-vocab-field input {
          width: 100%;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          color: #fff;
          font-size: 16px;
          outline: none;
          transition: all 0.2s;
          box-sizing: border-box;
        }

        .edit-vocab-field input:focus {
          border-color: #667eea;
          background: rgba(255, 255, 255, 0.15);
        }

        .edit-vocab-field input::placeholder {
          color: rgba(255, 255, 255, 0.4);
        }

        .edit-vocab-actions {
          display: flex;
          gap: 12px;
          padding: 16px 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          justify-content: flex-end;
        }

        .edit-vocab-actions .cancel-btn {
          padding: 10px 20px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: rgba(255, 255, 255, 0.8);
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .edit-vocab-actions .cancel-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .edit-vocab-actions .save-btn {
          padding: 10px 24px;
          border-radius: 8px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          border: none;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .edit-vocab-actions .save-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .empty-state {
          padding: 40px;
          text-align: center;
          color: #888;
        }

        .empty-state .empty-icon {
          font-size: 64px;
          margin-bottom: 16px;
        }

        .empty-state h3 {
          color: #fff;
          margin: 0 0 8px 0;
        }

        .empty-state p {
          color: #888;
          margin: 4px 0;
        }

        /* Session Complete */
        .session-complete {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px;
          text-align: center;
        }

        .session-complete .complete-icon {
          font-size: 64px;
          margin-bottom: 16px;
        }

        .session-complete h3 {
          color: #fff;
          margin: 0 0 16px 0;
          font-size: 24px;
        }

        .session-complete .complete-stats {
          margin-bottom: 24px;
        }

        .session-complete .complete-stats p {
          color: #ccc;
          font-size: 16px;
        }

        .session-complete .complete-stats strong {
          color: #4ade80;
          font-size: 20px;
        }

        .session-complete .restart-btn {
          padding: 12px 24px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          margin-bottom: 12px;
          transition: all 0.2s;
        }

        .session-complete .restart-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
        }

        .session-complete .go-review-btn {
          padding: 12px 24px;
          background: transparent;
          border: 2px solid #667eea;
          border-radius: 12px;
          color: #667eea;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.2s;
        }

        .session-complete .go-review-btn:hover {
          background: rgba(102, 126, 234, 0.1);
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
          font-size: 24px;
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

        /* Popup styles for new words tab - same as VocabularyMemoryFlashcard */
        .memory-popup-overlay,
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

        .memory-popup,
        .search-popup {
          background: #1a1a2e;
          border-radius: 16px;
          width: 100%;
          max-width: 500px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .memory-popup-header,
        .search-popup-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: #16213e;
          border-bottom: 1px solid #0f3460;
        }

        .memory-popup-title,
        .search-popup-title {
          color: #fff;
          font-size: 16px;
          font-weight: 500;
        }

        .popup-word {
          color: #667eea;
          font-weight: bold;
        }

        .popup-close-btn {
          background: none;
          border: none;
          color: #888;
          font-size: 20px;
          cursor: pointer;
          padding: 4px 8px;
        }

        .popup-close-btn:hover {
          color: #fff;
        }

        .memory-popup-content,
        .search-popup-results {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }

        .memory-full-content {
          color: #ddd;
          line-height: 1.8;
        }

        .memory-full-content img {
          max-width: 100%;
          border-radius: 8px;
          margin: 12px 0;
        }

        .memory-full-content p {
          margin: 12px 0;
        }

        .memory-full-content .message-block {
          background: rgba(102, 126, 234, 0.1);
          border-radius: 8px;
          padding: 12px;
          margin: 12px 0;
        }

        .memory-full-content .message-block-header {
          display: flex;
          gap: 12px;
          margin-bottom: 8px;
          align-items: center;
        }

        .memory-full-content .character-badge,
        .memory-full-content .date-badge {
          font-size: 12px;
          color: #888;
        }

        .memory-full-content .memory-audio-btn {
          background: rgba(102, 126, 234, 0.3);
          border: none;
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 12px;
          cursor: pointer;
          margin-left: auto;
          transition: background 0.2s;
        }

        .memory-full-content .memory-audio-btn:hover {
          background: rgba(102, 126, 234, 0.5);
        }

        .memory-full-content .message-text {
          color: #fff;
        }

        .no-results {
          text-align: center;
          color: #888;
          padding: 40px 20px;
        }

        .results-count {
          font-size: 14px;
          color: #667eea;
          margin-bottom: 16px;
        }

        .search-result-item {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 12px;
        }

        .result-meta {
          display: flex;
          gap: 12px;
          margin-bottom: 8px;
        }

        .result-character {
          color: #667eea;
          font-weight: 500;
          font-size: 13px;
        }

        .result-date {
          color: #888;
          font-size: 12px;
        }

        .result-text {
          color: #ddd;
          font-size: 14px;
          line-height: 1.5;
        }

        .result-text .highlight-word {
          background: rgba(102, 126, 234, 0.4);
          color: #fff;
          padding: 1px 3px;
          border-radius: 3px;
        }

        .result-play-btn {
          margin-top: 8px;
          background: rgba(102, 126, 234, 0.2);
          border: 1px solid #667eea;
          color: #667eea;
          padding: 4px 12px;
          border-radius: 6px;
          cursor: pointer;
        }

        .result-play-btn:hover {
          background: rgba(102, 126, 234, 0.3);
        }

        /* Word section styling for new words - same as flashcard */
        .word-section {
          text-align: center;
          padding: 12px 0;
        }

        .word-section .korean-word {
          font-size: 42px;
          color: #fff;
          font-weight: bold;
          margin-bottom: 16px;
        }

        .pronunciation-controls {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }

        .character-select {
          padding: 8px 12px;
          background: #16213e;
          border: 1px solid #0f3460;
          border-radius: 8px;
          color: #fff;
          font-size: 13px;
          cursor: pointer;
        }

        .character-select:focus {
          outline: none;
          border-color: #667eea;
        }

        .pronounce-btn {
          padding: 8px 16px;
          background: rgba(102, 126, 234, 0.2);
          border: 1px solid #667eea;
          border-radius: 8px;
          color: #667eea;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .pronounce-btn:hover:not(:disabled) {
          background: rgba(102, 126, 234, 0.3);
        }

        .pronounce-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .search-word-btn {
          display: inline-block;
          padding: 8px 16px;
          background: rgba(102, 126, 234, 0.1);
          border: 1px solid rgba(102, 126, 234, 0.3);
          border-radius: 20px;
          color: #667eea;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .search-word-btn:hover {
          background: rgba(102, 126, 234, 0.2);
          border-color: #667eea;
        }

        /* Section header with expand button */
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }

        .expand-memory-btn {
          background: rgba(102, 126, 234, 0.2);
          border: 1px solid #667eea;
          color: #667eea;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .expand-memory-btn:hover {
          background: rgba(102, 126, 234, 0.3);
        }

        /* Memory preview - truncated */
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
          background: linear-gradient(transparent, rgba(26, 26, 46, 0.9));
          pointer-events: none;
        }

        /* Card content wrapper */
        .card-content {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        /* Rating buttons - horizontal like flashcard */
        .rating-buttons {
          display: flex;
          gap: 8px;
          width: 100%;
        }

        /* Message block styling inside memory */
        .message-block {
          background: rgba(102, 126, 234, 0.15);
          border-radius: 8px;
          padding: 10px 12px;
          margin: 8px 0;
        }

        .message-block-header {
          display: flex;
          gap: 10px;
          margin-bottom: 6px;
          align-items: center;
        }

        .message-block .character-badge,
        .message-block .date-badge {
          font-size: 11px;
          color: #888;
        }

        .memory-audio-btn {
          background: rgba(102, 126, 234, 0.3);
          border: none;
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 12px;
          cursor: pointer;
          margin-left: auto;
          transition: background 0.2s;
        }

        .memory-audio-btn:hover {
          background: rgba(102, 126, 234, 0.5);
        }

        .message-block .message-text {
          color: #ddd;
          font-size: 13px;
        }

        /* Memory image */
        .memory-image {
          margin: 8px 0;
        }

        .memory-image img {
          max-width: 100%;
          border-radius: 8px;
        }
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

        /* Auto Add Modal */
        .auto-add-modal {
          text-align: center;
        }

        .auto-add-info {
          margin: 16px 0;
        }

        .auto-add-info p {
          margin: 4px 0;
          color: #fff;
        }

        .auto-add-info .hint {
          font-size: 12px;
          color: #888;
        }

        .difficulty-select {
          margin: 20px 0;
        }

        .difficulty-select label {
          display: block;
          color: #aaa;
          font-size: 14px;
          margin-bottom: 12px;
        }

        .difficulty-buttons {
          display: flex;
          gap: 8px;
        }

        .diff-btn {
          flex: 1;
          padding: 12px 8px;
          border: 2px solid transparent;
          border-radius: 8px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
          color: #fff;
        }

        .diff-btn.easy {
          background: rgba(40, 167, 69, 0.2);
          border-color: #28a745;
        }

        .diff-btn.easy.active {
          background: #28a745;
        }

        .diff-btn.medium {
          background: rgba(255, 193, 7, 0.2);
          border-color: #ffc107;
        }

        .diff-btn.medium.active {
          background: #ffc107;
          color: #000;
        }

        .diff-btn.hard {
          background: rgba(220, 53, 69, 0.2);
          border-color: #dc3545;
        }

        .diff-btn.hard.active {
          background: #dc3545;
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
