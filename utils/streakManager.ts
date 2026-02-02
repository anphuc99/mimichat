import { StreakData, TaskProgress, DailyTaskConfig } from '../types';

/**
 * Get today's date as YYYY-MM-DD string (Vietnam timezone)
 */
function getTodayDateString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

/**
 * Parse daily tasks CSV
 */
export function parseDailyTasksCSV(csv: string): DailyTaskConfig {
  try {
    const lines = csv.split('\n').filter(l => l.trim().length > 0);
    const result: DailyTaskConfig = [];
    
    // Skip header (i=1)
    for (let i = 1; i < lines.length; i++) {
        // Simple CSV parse: split by comma, remove quotes
        const parts = lines[i].split(',').map(p => p.trim());
        if (parts.length >= 5) {
            const id = parts[0];
            const type = parts[1] as 'count' | 'completed';
            const target = parseInt(parts[2], 10);
            const label = parts[3].replace(/^"|"$/g, ''); // Remove quotes
            const enabled = parts[4].toLowerCase() === 'true';
            
            result.push({ id, type, target, label, enabled });
        }
    }
    return result;
  } catch (e) {
    console.error("Failed to parse daily tasks CSV", e);
    return [];
  }
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
    lastActivityDate: null,
    taskProgress: { learnedCount: 0, reviewDueCount: 0 },
    lastProgressDate: null
  };
}

/**
 * Check if all daily tasks are completed
 * Tasks: Defined by config or default (Learn 20, Review all)
 */
export function areAllTasksCompleted(streak: StreakData, config?: DailyTaskConfig): boolean {
  const taskProgress = streak.taskProgress;
  if (!taskProgress) return false;
  
  // Default values if no config (backward compatibility)
  if (!config || config.length === 0) {
    return taskProgress.learnedCount >= 20 && taskProgress.reviewDueCount === 0;
  }

  // Check based on config
  const learnTask = config.find(t => t.id === 'learn');
  const reviewTask = config.find(t => t.id === 'review');

  let learnComplete = true;
  if (learnTask && learnTask.enabled) {
      learnComplete = taskProgress.learnedCount >= learnTask.target;
  }

  let reviewComplete = true;
  if (reviewTask && reviewTask.enabled) {
      // For review, user typically sets target=0 (means 0 due left)
      reviewComplete = taskProgress.reviewDueCount <= reviewTask.target;
  }

  return learnComplete && reviewComplete;
}

/**
 * Update task progress
 */
export function updateTaskProgress(
  streak: StreakData,
  learnedCount: number,
  reviewDueCount: number
): StreakData {
  return {
    ...streak,
    taskProgress: {
      learnedCount,
      reviewDueCount
    },
    lastProgressDate: getTodayDateString() 
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
 * Only increments streak when all daily tasks are completed
 * Returns updated streak data and whether it's a new streak increment
 */
export function updateStreak(
  streak: StreakData,
  activityType: 'chat' | 'review' | 'learn',
  config?: DailyTaskConfig
): { updatedStreak: StreakData; isNewStreak: boolean; streakIncreased: boolean } {
  const today = getTodayDateString();
  
  // Check if all tasks are completed
  const tasksCompleted = areAllTasksCompleted(streak, config);
  
  // If already completed activity today and streak already increased, don't change anything
  if (hasActivityToday(streak) && streak.currentStreak > 0) {
    // If tasks were just completed today, we still need to increment
    const taskProgress = streak.taskProgress;
    // We assume if streak > 0 and activity today, it's maintained.
    // But what if tasks became un-completed (e.g. new reviews appeared)?
    // The current logic is: if completed once today, it's completed.
    // However, if we want to support dynamic task updates:
    // If tasks are NOT complete but we have activity today, we shouldn't have incremented?
    // Actually, "hasActivityToday" relies on lastActivityDate.
    // If we only set lastActivityDate when streak increments or maintained.
    
    // Simplification: If tasks completed now, and we haven't processed this completion yet?
    // How do we know if we processed it?
    // We check if current streak > 0.
    
    if (!tasksCompleted) {
         // Tasks no longer completed? (e.g. due count went up)
         // We don't decrement streak typically.
         return {
            updatedStreak: streak,
            isNewStreak: false,
            streakIncreased: false
        };
    }
    
    // If tasks completed, and lastActivityDate is today, we are good.
    return {
      updatedStreak: streak,
      isNewStreak: false,
      streakIncreased: false
    };
  }
  
  // If tasks not completed, only update lastActivityDate (to show activity happened?) 
  // No, if task not completed, we don't update lastActivityDate usually unless we want "partial" keep?
  // But standard streak is "all tasks done".
  // If we update lastActivityDate without increment, it might prevent increment later?
  // Let's look at logic below.
  
  if (!tasksCompleted) {
    // DO NOT update lastActivityDate if tasks not done. Otherwise next call thinks we're done for today.
    // Wait, if lastActivityDate is today, hasActivityToday returns true.
    // If we update date here, hasActivityToday becomes true next time.
    // Then next time we enter the "if (hasActivityToday)" block.
    // In that block, we check if tasksCompleted. If so, do we increment?
    // No, that block returns streakIncreased: false.
    
    // So if we update date here, we PREVENT streak increment for today later.
    // SO: Do NOT update lastActivityDate if tasks are not completed.
    return {
      updatedStreak: streak, // Don't even change date
      isNewStreak: false,
      streakIncreased: false
    };
  }
  
  // Tasks ARE completed. Process streak.
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
    
    if (daysSinceLastActivity === 0) {
      // Same day - should catch by hasActivityToday if date was set
      // If we are here, date was NOT set today (or tasks weren't complete before).
      // So this is the moment of completion.
      if (streak.currentStreak === 0) {
           newCurrentStreak = 1;
           streakIncreased = true;
           isNewStreak = true;
      } else {
          // Maintaining streak
          // If already > 0, we don't increment, just update date?
          // If daysDiff=0, we shouldn't be here if date is set.
          // Note: hasActivityToday check above handles day=0.
      }
    } else if (daysSinceLastActivity === 1) {
      // Consecutive day - increment streak
      newCurrentStreak = streak.currentStreak + 1;
      streakIncreased = true;
    } else if (daysSinceLastActivity > 1) {
      // Streak broken - reset to 1
      newCurrentStreak = 1;
      streakIncreased = true;
      isNewStreak = true;
    }
  }
  
  const newLongestStreak = Math.max(streak.longestStreak, newCurrentStreak);
  
  return {
    updatedStreak: {
      ...streak,
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
  const today = getTodayDateString();
  let updatedStreak = { ...streak };

  // Determine which date to check for progress reset.
  // We prefer lastProgressDate if available, otherwise fallback to lastActivityDate (for backward compatibility)
  // If lastActivityDate is null (new user), we don't reset.
  const progressDate = streak.lastProgressDate || streak.lastActivityDate;

  // If we have a date, and it's not today, it means the progress in taskProgress belongs to a previous day.
  // So we reset it.
  if (progressDate && progressDate !== today) {
     updatedStreak = {
       ...updatedStreak,
       taskProgress: {
         learnedCount: 0,
         reviewDueCount: streak.taskProgress?.reviewDueCount || 0 // Keep due count from store
       },
       lastProgressDate: today // Update to today so we don't reset again this session
     };
  }

  if (!streak.lastActivityDate || streak.currentStreak === 0) {
    return updatedStreak;
  }
  
  const daysSinceLastActivity = getDaysDifference(streak.lastActivityDate, today);
  
  // If more than 1 day has passed, reset streak
  if (daysSinceLastActivity > 1) {
    return {
      ...updatedStreak,
      currentStreak: 0
    };
  }
  
  return updatedStreak;
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
