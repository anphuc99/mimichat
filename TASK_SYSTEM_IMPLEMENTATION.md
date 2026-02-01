# Task System Implementation - Streak Logic

## Overview
Implemented a task-based streak system where users must complete all daily tasks to maintain their streak. The streak is only counted when:
1. **Learn at least 20 new words** (từ mới)
2. **Complete all vocabulary reviews** (reviewDueCount = 0)

## Changes Made

### 1. Types Update (`types.ts`)
Added a new interface to track task progress:

```typescript
export interface TaskProgress {
  learnedCount: number;        // Words learned today
  reviewDueCount: number;      // Words still due for review
}

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  taskProgress?: TaskProgress;  // Task progress for the current day
}
```

### 2. Streak Manager Enhancement (`utils/streakManager.ts`)

#### New Functions:
- **`areAllTasksCompleted()`** - Checks if both learning (≥20 words) and review (=0 due) tasks are completed
- **`updateTaskProgress()`** - Updates task progress values

#### Modified Function:
- **`updateStreak()`** - Now only increments streak when `areAllTasksCompleted()` returns true
  - If tasks not completed, updates `lastActivityDate` but doesn't increase streak count
  - Only increments when both conditions are met

#### Initialization:
- **`initializeStreak()`** - Now initializes with `taskProgress: { learnedCount: 0, reviewDueCount: 0 }`

### 3. VocabularyCollectionScene Updates (`components/VocabularyCollectionScene.tsx`)

#### Updated Interface:
```typescript
interface VocabularyCollectionSceneProps {
  onBack: () => void;
  onStreakUpdate?: (learnedCount: number, reviewDueCount: number) => void;
  // ... other props
}
```

#### Updated Streak Callbacks:
- **When learning a word is rated**: Passes current `learnedCount` and remaining `reviewDueCount`
- **When reviewing a word is rated**: Calculates and passes remaining due review count

```typescript
// Example from handleQuizRating
if (onStreakUpdate) {
  const reviewDueCount = dueReviews.filter(r => {
    const nextReview = new Date(r.review.nextReviewDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return nextReview <= today;
  }).length;
  onStreakUpdate(newData.todayLearnedCount, reviewDueCount);
}
```

### 4. StreakDisplay Component Enhancement (`components/StreakDisplay.tsx`)

#### New Task Progress Section:
Displays a visual indicator of task completion:
```
📋 Nhiệm vụ hôm nay:
  📖 Học từ mới: X/20
  🔄 Ôn tập: [✓ Hoàn thành or X còn lại]
```

#### Updated Status Messages:
- ✅ "Hoàn thành tất cả nhiệm vụ!" when tasks are done
- ⏳ "Chưa hoàn thành nhiệm vụ hôm nay" when tasks incomplete

#### Color Coding:
- Green text when task completed
- Gray text when task incomplete

### 5. App.tsx Update (`App.tsx`)

#### Updated handleStreakUpdate Function:
```typescript
const handleStreakUpdate = useCallback(
  async (
    activityType: 'chat' | 'review' | 'learn',
    learnedCount?: number,
    reviewDueCount?: number
  ) => {
    // Updates task progress if provided
    // Then checks if all tasks completed before incrementing streak
    // ...
  },
  [streak]
);
```

## How It Works

### Daily Task Flow:
1. User opens vocabulary collection scene
2. System tracks `learnedCount` and `reviewDueCount` for the day
3. When user completes a learning/review action:
   - Task progress is updated
   - Callback is triggered with current counts
4. Streak update is called with task progress:
   - If learned ≥20 AND reviews=0: Streak increments
   - Otherwise: Last activity date updates but streak doesn't change
5. UI updates to show task progress and streak status

### Task Progress Persistence:
- Task progress is saved in the `StreakData` object
- Synced to server with streak data
- Resets daily based on `lastActivityDate`

## Server Data Structure
The streak data saved to server now includes:
```json
{
  "currentStreak": 5,
  "longestStreak": 10,
  "lastActivityDate": "2026-02-01",
  "taskProgress": {
    "learnedCount": 20,
    "reviewDueCount": 0
  }
}
```

## User Experience Benefits
- ✅ Clear visual feedback on task progress
- ✅ Motivates users to complete both learning AND review
- ✅ Prevents "gaming" the streak with only one task
- ✅ Shows exactly what needs to be done to maintain streak
- ✅ Task requirements are transparent (20 words + 0 due reviews)

## Edge Cases Handled
- ✅ Task progress tracked separately per day
- ✅ Resets when date changes
- ✅ Handles initial streak (first time reaching targets)
- ✅ Handles streak breaking and resuming
- ✅ Preserves task progress when loading from server
