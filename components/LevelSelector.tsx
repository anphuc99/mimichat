import React, { useState } from 'react';
import { KoreanLevel, KOREAN_LEVELS, LevelInfo } from '../types';

interface LevelSelectorProps {
  currentLevel: KoreanLevel;
  onLevelChange: (level: KoreanLevel) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const LevelSelector: React.FC<LevelSelectorProps> = ({
  currentLevel,
  onLevelChange,
  isOpen,
  onClose
}) => {
  const [selectedLevel, setSelectedLevel] = useState<KoreanLevel>(currentLevel);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onLevelChange(selectedLevel);
    onClose();
  };

  const getLevelColor = (level: KoreanLevel): string => {
    const colors = {
      'A0': 'from-green-400 to-green-500',
      'A1': 'from-green-500 to-emerald-500',
      'A2': 'from-blue-400 to-blue-500',
      'B1': 'from-blue-500 to-indigo-500',
      'B2': 'from-purple-400 to-purple-500',
      'C1': 'from-orange-400 to-red-500',
      'C2': 'from-red-500 to-pink-600'
    };
    return colors[level];
  };

  const levels: KoreanLevel[] = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-1">Chọn Trình Độ</h2>
              <p className="text-indigo-100 text-sm">Điều chỉnh độ khó của cuộc hội thoại</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Level Grid */}
        <div className="p-6 space-y-3">
          {levels.map((level) => {
            const levelInfo = KOREAN_LEVELS[level];
            const isSelected = selectedLevel === level;
            const isCurrent = currentLevel === level;

            return (
              <button
                key={level}
                onClick={() => setSelectedLevel(level)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50 shadow-lg scale-[1.02]'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Level Badge */}
                  <div className={`flex-shrink-0 w-16 h-16 rounded-xl bg-gradient-to-br ${getLevelColor(level)} flex items-center justify-center text-white font-bold text-xl shadow-md`}>
                    {level}
                  </div>

                  {/* Level Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-gray-800 text-lg">
                        {levelInfo.name}
                      </h3>
                      {isCurrent && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                          Hiện tại
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-2">
                      {levelInfo.description}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-md">
                        📝 Max {levelInfo.maxWords} từ/câu
                      </span>
                      <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded-md">
                        {levelInfo.grammarComplexity.split('.')[0]}
                      </span>
                    </div>
                  </div>

                  {/* Selection Indicator */}
                  <div className="flex-shrink-0 flex items-center">
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-500'
                        : 'border-gray-300'
                    }`}>
                      {isSelected && (
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-gray-50 p-6 rounded-b-2xl border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-100 transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg"
          >
            Xác Nhận
          </button>
        </div>
      </div>
    </div>
  );
};
