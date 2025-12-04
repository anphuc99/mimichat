import { StreakData } from '../types';

/**
 * Get today's date as YYYY-MM-DD string (Vietnam timezone)
 */
function getTodayDateString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

/**
 * Get date difference in days
 */
function getDaysDifference(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Initialize streak data
 */
export function initializeStreak(): StreakData {
  return {
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: null
  };
}

/**
 * Check if user completed activity today
 */
export function hasActivityToday(streak: StreakData): boolean {
  if (!streak.lastActivityDate) return false;
  const today = getTodayDateString();
  return streak.lastActivityDate === today;
}

/**
 * Update streak after completing an activity
 * Returns updated streak data and whether it's a new streak increment
 */
export function updateStreak(
  streak: StreakData,
  activityType: 'chat' | 'review' | 'learn'
): { updatedStreak: StreakData; isNewStreak: boolean; streakIncreased: boolean } {
  const today = getTodayDateString();
  
  // If already completed activity today, don't change anything
  if (hasActivityToday(streak)) {
    return {
      updatedStreak: streak,
      isNewStreak: false,
      streakIncreased: false
    };
  }
  
  let newCurrentStreak = streak.currentStreak;
  let streakIncreased = false;
  let isNewStreak = false;
  
  // Check if this is first activity or streak was broken
  if (!streak.lastActivityDate) {
    // First activity ever
    newCurrentStreak = 1;
    streakIncreased = true;
    isNewStreak = true;
  } else {
    const daysSinceLastActivity = getDaysDifference(streak.lastActivityDate, today);
    
    if (daysSinceLastActivity === 1) {
      // Consecutive day - increment streak
      newCurrentStreak = streak.currentStreak + 1;
      streakIncreased = true;
    } else if (daysSinceLastActivity > 1) {
      // Streak broken - reset to 1
      newCurrentStreak = 1;
      streakIncreased = true;
      isNewStreak = true;
    }
    // If daysSinceLastActivity === 0, it means same day (already handled above)
  }
  
  const newLongestStreak = Math.max(streak.longestStreak, newCurrentStreak);
  
  return {
    updatedStreak: {
      currentStreak: newCurrentStreak,
      longestStreak: newLongestStreak,
      lastActivityDate: today
    },
    isNewStreak,
    streakIncreased
  };
}

/**
 * Check if streak should be reset (called on app load)
 * Returns updated streak if needed
 */
export function checkStreakStatus(streak: StreakData): StreakData {
  if (!streak.lastActivityDate || streak.currentStreak === 0) {
    return streak;
  }
  
  const today = getTodayDateString();
  const daysSinceLastActivity = getDaysDifference(streak.lastActivityDate, today);
  
  // If more than 1 day has passed, reset streak
  if (daysSinceLastActivity > 1) {
    return {
      ...streak,
      currentStreak: 0
    };
  }
  
  return streak;
}

/**
 * Get streak status for display
 */
export function getStreakStatus(streak: StreakData): {
  current: number;
  longest: number;
  isActiveToday: boolean;
  daysUntilBreak: number;
} {
  const isActiveToday = hasActivityToday(streak);
  const today = getTodayDateString();
  
  let daysUntilBreak = 1;
  if (streak.lastActivityDate) {
    const daysSince = getDaysDifference(streak.lastActivityDate, today);
    daysUntilBreak = daysSince === 0 ? 1 : 0;
  }
  
  return {
    current: streak.currentStreak,
    longest: streak.longestStreak,
    isActiveToday,
    daysUntilBreak
  };
}
