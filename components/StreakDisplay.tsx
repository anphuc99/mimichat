import React from 'react';
import { StreakData } from '../types';
import { getStreakStatus } from '../utils/streakManager';

interface StreakDisplayProps {
  streak: StreakData;
  compact?: boolean;
}

export const StreakDisplay: React.FC<StreakDisplayProps> = ({ streak, compact = false }) => {
  const status = getStreakStatus(streak);
  
  // Determine fire color based on streak length
  const getFireEmoji = (streakCount: number) => {
    if (streakCount >= 100) return '🔥🔥🔥';
    if (streakCount >= 50) return '🔥🔥';
    if (streakCount >= 7) return '🔥';
    return '🔥';
  };
  
  const getStreakColor = (streakCount: number) => {
    if (streakCount >= 100) return 'from-purple-500 to-pink-500';
    if (streakCount >= 50) return 'from-orange-500 to-red-500';
    if (streakCount >= 30) return 'from-yellow-500 to-orange-500';
    if (streakCount >= 7) return 'from-yellow-400 to-orange-400';
    return 'from-orange-300 to-yellow-300';
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-full border border-orange-200">
        <span className="text-lg animate-pulse">{getFireEmoji(status.current)}</span>
        <span className="font-bold text-orange-600">{status.current}</span>
        {status.isActiveToday && (
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 border-2 border-orange-100">
      {/* Main Streak Counter */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-3 mb-2">
          <span className="text-5xl animate-bounce" style={{ animationDuration: '1.5s' }}>
            {getFireEmoji(status.current)}
          </span>
          <div className={`text-6xl font-bold bg-gradient-to-r ${getStreakColor(status.current)} bg-clip-text text-transparent`}>
            {status.current}
          </div>
        </div>
        <div className="text-gray-600 font-medium">
          {status.current === 0 ? 'Bắt đầu chuỗi streak!' : `ngày liên tiếp`}
        </div>
      </div>

      {/* Status Indicator */}
      <div className="flex justify-center mb-4">
        {status.isActiveToday ? (
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 rounded-full border border-green-200">
            <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-green-700 font-medium">Hoàn thành hôm nay! 🎉</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 rounded-full border border-orange-200">
            <span className="w-3 h-3 bg-orange-500 rounded-full animate-pulse"></span>
            <span className="text-orange-700 font-medium">Chưa hoàn thành hôm nay</span>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${getStreakColor(status.current)} transition-all duration-500 ${
              status.isActiveToday ? 'animate-pulse' : ''
            }`}
            style={{ width: status.isActiveToday ? '100%' : '0%' }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
        <div className="text-center">
          <div className="text-2xl font-bold text-orange-500">{status.current}</div>
          <div className="text-xs text-gray-500">Hiện tại</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-500">{status.longest}</div>
          <div className="text-xs text-gray-500">Kỷ lục</div>
        </div>
      </div>

      {/* Milestones */}
      {status.current > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="text-xs text-gray-500 text-center mb-2">Cột mốc tiếp theo:</div>
          <div className="flex justify-center gap-2">
            {[7, 30, 50, 100].map((milestone) => {
              const isReached = status.current >= milestone;
              const isNext = status.current < milestone;
              return (
                <div
                  key={milestone}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isReached
                      ? 'bg-gradient-to-r from-orange-400 to-yellow-400 text-white shadow-md'
                      : isNext && milestone === [7, 30, 50, 100].find(m => m > status.current)
                      ? 'bg-orange-100 text-orange-600 ring-2 ring-orange-300 animate-pulse'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {milestone}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Motivational Message */}
      {!status.isActiveToday && status.current > 0 && (
        <div className="mt-4 p-3 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-lg border border-orange-200">
          <p className="text-sm text-center text-orange-700">
            💪 Đừng để chuỗi {status.current} ngày mất đi! Học ngay hôm nay!
          </p>
        </div>
      )}
    </div>
  );
};
