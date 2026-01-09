import React, { useState, useEffect, useMemo } from 'react';
import type { VocabularyItem, DailyChat, VocabularyReview } from '../types';

interface VocabularyWithReview {
  vocab: VocabularyItem;
  review?: VocabularyReview;
}

interface ChatVocabularyModalProps {
  isOpen: boolean;
  onClose: () => void;
  journal: DailyChat[];
  selectedVocabularies: VocabularyItem[];
  onVocabulariesChange: (vocabularies: VocabularyItem[]) => void;
}

export const ChatVocabularyModal: React.FC<ChatVocabularyModalProps> = ({
  isOpen,
  onClose,
  journal,
  selectedVocabularies,
  onVocabulariesChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [manualKorean, setManualKorean] = useState('');
  const [manualVietnamese, setManualVietnamese] = useState('');

  // Get all vocabularies from journal with their review data, sorted by difficulty (high) and stability (low)
  const allVocabulariesWithReview = useMemo(() => {
    const vocabMap = new Map<string, VocabularyWithReview>();
    
    for (const dailyChat of journal) {
      if (dailyChat.vocabularies) {
        for (const vocab of dailyChat.vocabularies) {
          if (!vocabMap.has(vocab.korean)) {
            // Find review for this vocabulary
            const review = dailyChat.reviewSchedule?.find(r => r.vocabularyId === vocab.id);
            vocabMap.set(vocab.korean, { vocab, review });
          }
        }
      }
    }
    
    // Sort by: 1) difficulty DESC (highest first), 2) stability ASC (lowest first)
    return Array.from(vocabMap.values()).sort((a, b) => {
      const diffA = a.review?.difficulty ?? 5; // Default difficulty is 5
      const diffB = b.review?.difficulty ?? 5;
      const stabA = a.review?.stability ?? 0;
      const stabB = b.review?.stability ?? 0;
      
      // First sort by difficulty (descending - highest first)
      if (diffB !== diffA) {
        return diffB - diffA;
      }
      // Then by stability (ascending - lowest first)
      return stabA - stabB;
    });
  }, [journal]);

  // Get just the vocabulary items for compatibility
  const allVocabularies = useMemo(() => {
    return allVocabulariesWithReview.map(item => item.vocab);
  }, [allVocabulariesWithReview]);

  // Filter vocabularies by search query
  const filteredVocabularies = useMemo(() => {
    if (!searchQuery.trim()) return allVocabulariesWithReview;
    const query = searchQuery.toLowerCase().trim();
    return allVocabulariesWithReview.filter(
      (item) =>
        item.vocab.korean.toLowerCase().includes(query) ||
        item.vocab.vietnamese.toLowerCase().includes(query)
    );
  }, [allVocabulariesWithReview, searchQuery]);

  // Check if a vocabulary is selected
  const isSelected = (vocab: VocabularyItem) => {
    return selectedVocabularies.some((v) => v.korean === vocab.korean);
  };

  // Toggle vocabulary selection
  const toggleVocabulary = (vocab: VocabularyItem) => {
    if (isSelected(vocab)) {
      onVocabulariesChange(
        selectedVocabularies.filter((v) => v.korean !== vocab.korean)
      );
    } else {
      onVocabulariesChange([...selectedVocabularies, vocab]);
    }
  };

  // Add manual vocabulary (supports multiple words separated by comma)
  const handleAddManual = () => {
    if (!manualKorean.trim()) return;

    // Split by comma and filter empty strings
    const koreanWords = manualKorean
      .split(',')
      .map(word => word.trim())
      .filter(word => word.length > 0);

    if (koreanWords.length === 0) return;

    const newVocabs: VocabularyItem[] = [];
    
    for (const korean of koreanWords) {
      // Check if already exists in selected
      if (selectedVocabularies.some((v) => v.korean === korean)) {
        continue;
      }
      // Check if already added in this batch
      if (newVocabs.some((v) => v.korean === korean)) {
        continue;
      }
      
      // Try to find meaning from existing vocabularies
      const existingVocab = allVocabularies.find(v => v.korean === korean);
      
      newVocabs.push({
        id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        korean: korean,
        vietnamese: existingVocab?.vietnamese || manualVietnamese.trim() || '(chưa có nghĩa)',
      });
    }

    if (newVocabs.length > 0) {
      onVocabulariesChange([...selectedVocabularies, ...newVocabs]);
    }

    setManualKorean('');
    setManualVietnamese('');
  };

  // Remove a vocabulary from selection
  const removeVocabulary = (vocab: VocabularyItem) => {
    onVocabulariesChange(
      selectedVocabularies.filter((v) => v.korean !== vocab.korean)
    );
  };

  // Clear all selections
  const clearAll = () => {
    onVocabulariesChange([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
              Từ vựng ôn tập trong chat
            </h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/20 rounded-full transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <p className="text-sm text-white/80 mt-1">
            Chọn từ vựng để AI lồng ghép vào cuộc hội thoại
          </p>
        </div>

        {/* Selected Vocabularies */}
        {selectedVocabularies.length > 0 && (
          <div className="p-3 bg-emerald-50 border-b border-emerald-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-emerald-800">
                Đã chọn ({selectedVocabularies.length}):
              </span>
              <button
                onClick={clearAll}
                className="text-xs text-red-600 hover:text-red-700 hover:underline"
              >
                Xóa tất cả
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedVocabularies.map((vocab) => (
                <span
                  key={vocab.korean}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-800 rounded-full text-sm"
                >
                  <strong>{vocab.korean}</strong>
                  <span className="text-emerald-600">({vocab.vietnamese})</span>
                  <button
                    onClick={() => removeVocabulary(vocab)}
                    className="ml-1 p-0.5 hover:bg-emerald-200 rounded-full transition-colors"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Manual Input */}
        <div className="p-3 bg-gray-50 border-b border-gray-200">
          <div className="text-sm font-semibold text-gray-700 mb-2">
            ✍️ Thêm từ thủ công:
            <span className="text-xs font-normal text-gray-500 ml-2">
              (dùng dấu phẩy để thêm nhiều từ: 사랑, 행복, 친구)
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualKorean}
              onChange={(e) => setManualKorean(e.target.value)}
              placeholder="Tiếng Hàn (vd: 사랑, 행복, 친구)"
              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddManual();
                }
              }}
            />
            <input
              type="text"
              value={manualVietnamese}
              onChange={(e) => setManualVietnamese(e.target.value)}
              placeholder="Nghĩa (tùy chọn)"
              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddManual();
                }
              }}
            />
            <button
              onClick={handleAddManual}
              disabled={!manualKorean.trim()}
              className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-200">
          <div className="relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm từ vựng đã học..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Vocabulary List */}
        <div className="flex-1 overflow-y-auto p-3">
          {allVocabularies.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-12 w-12 mx-auto mb-3 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
              <p className="font-medium">Chưa có từ vựng nào</p>
              <p className="text-sm mt-1">
                Bạn có thể thêm từ thủ công ở trên
              </p>
            </div>
          ) : filteredVocabularies.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>Không tìm thấy từ vựng phù hợp</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredVocabularies.map((item) => (
                <button
                  key={item.vocab.korean}
                  onClick={() => toggleVocabulary(item.vocab)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${
                    isSelected(item.vocab)
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'hover:bg-gray-100 border border-transparent'
                  }`}
                >
                  <div className="flex-1">
                    <div>
                      <span className="font-medium">{item.vocab.korean}</span>
                      <span className="text-gray-500 ml-2">
                        ({item.vocab.vietnamese})
                      </span>
                    </div>
                    {/* Display difficulty and stability info */}
                    {item.review && (
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                        <span title="Độ khó (1-10)">
                          📊 {(item.review.difficulty ?? 5).toFixed(1)}
                        </span>
                        <span title="Độ ổn định (ngày)">
                          💪 {(item.review.stability ?? 0).toFixed(0)}d
                        </span>
                      </div>
                    )}
                  </div>
                  {isSelected(item.vocab) && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-emerald-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {selectedVocabularies.length > 0
                ? `${selectedVocabularies.length} từ sẽ được lồng ghép vào chat`
                : 'Chưa chọn từ nào'}
            </span>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-emerald-500 text-white font-medium rounded-lg hover:bg-emerald-600 transition-colors"
            >
              Xong
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
