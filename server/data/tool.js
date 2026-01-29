/**
 * Migration Tool: Gom tất cả vocabulary từ các stories vào một file vocabulary-store.json
 * 
 * Usage: 
 *   node tool.js          - Migrate vocabularies to vocabulary-store.json
 *   node tool.js --clean  - Clean stories (remove old vocab data, keep only vocabularyIds)
 *   node tool.js --all    - Do both: migrate then clean
 * 
 * Tool sẽ:
 * 1. Quét tất cả stories trong folder stories/
 * 2. Gom tất cả vocabularies, reviews, memories, progress vào vocabulary-store.json
 * 3. Loại bỏ trùng lặp (theo korean word)
 * 4. (--clean) Xóa vocabularies, vocabularyProgress, vocabularyMemories, reviewSchedule, vocabularyStore 
 *    khỏi story files, chỉ giữ vocabularyIds
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORIES_DIR = path.join(__dirname, 'stories');
const VOCAB_STORE_PATH = path.join(__dirname, 'vocabulary-store.json');

// ============================================================================
// Types & Helpers
// ============================================================================

function createEmptyVocabularyStore() {
  return {
    vocabularies: [],
    reviews: [],
    memories: [],
    progress: []
  };
}

function loadVocabularyStore() {
  if (fs.existsSync(VOCAB_STORE_PATH)) {
    return JSON.parse(fs.readFileSync(VOCAB_STORE_PATH, 'utf-8'));
  }
  return createEmptyVocabularyStore();
}

function saveVocabularyStore(store) {
  fs.writeFileSync(VOCAB_STORE_PATH, JSON.stringify(store, null, 2));
}

// ============================================================================
// Migration Functions
// ============================================================================

/**
 * Extract vocabularies from a single story
 */
function extractVocabulariesFromStory(storyData, storyId) {
  const result = {
    vocabularies: [],
    reviews: [],
    memories: [],
    progress: []
  };

  // Check if story has old structure (vocab in journal)
  if (storyData.journal) {
    for (const dailyChat of storyData.journal) {
      // Extract vocabularies
      if (dailyChat.vocabularies && dailyChat.vocabularies.length > 0) {
        for (const vocab of dailyChat.vocabularies) {
          result.vocabularies.push({
            ...vocab,
            storyId: storyId,
            dailyChatId: dailyChat.id,
            createdDate: dailyChat.date
          });
        }
      }

      // Extract reviews
      if (dailyChat.reviewSchedule && dailyChat.reviewSchedule.length > 0) {
        for (const review of dailyChat.reviewSchedule) {
          result.reviews.push({
            ...review,
            storyId: storyId
          });
        }
      }

      // Extract memories
      if (dailyChat.vocabularyMemories && dailyChat.vocabularyMemories.length > 0) {
        for (const memory of dailyChat.vocabularyMemories) {
          result.memories.push({
            vocabularyId: memory.vocabularyId,
            userMemory: memory.userMemory,
            linkedMessageIds: memory.linkedMessageIds,
            createdDate: memory.createdDate,
            updatedDate: memory.updatedDate,
            storyId: storyId
          });
        }
      }

      // Extract progress
      if (dailyChat.vocabularyProgress && dailyChat.vocabularyProgress.length > 0) {
        for (const progress of dailyChat.vocabularyProgress) {
          result.progress.push({
            ...progress,
            storyId: storyId
          });
        }
      }
    }
  }

  // Check if story already has new structure (vocabularyStore)
  if (storyData.vocabularyStore) {
    const store = storyData.vocabularyStore;
    
    if (store.vocabularies) {
      for (const vocab of store.vocabularies) {
        result.vocabularies.push({
          ...vocab,
          storyId: storyId
        });
      }
    }
    
    if (store.reviews) {
      for (const review of store.reviews) {
        result.reviews.push({
          ...review,
          storyId: storyId
        });
      }
    }
    
    if (store.memories) {
      for (const memory of store.memories) {
        result.memories.push({
          ...memory,
          storyId: storyId
        });
      }
    }
    
    if (store.progress) {
      for (const progress of store.progress) {
        result.progress.push({
          ...progress,
          storyId: storyId
        });
      }
    }
  }

  return result;
}

/**
 * Merge vocabularies, removing duplicates by korean word
 */
function mergeVocabularies(existing, newItems) {
  const seenKorean = new Map(); // korean -> item
  
  // Add existing first
  for (const item of existing) {
    if (!seenKorean.has(item.korean)) {
      seenKorean.set(item.korean, item);
    }
  }
  
  // Add new items (skip duplicates)
  let duplicateCount = 0;
  for (const item of newItems) {
    if (!seenKorean.has(item.korean)) {
      seenKorean.set(item.korean, item);
    } else {
      duplicateCount++;
    }
  }
  
  return {
    items: Array.from(seenKorean.values()),
    duplicateCount
  };
}

/**
 * Merge reviews, keeping the one with more history
 */
function mergeReviews(existing, newItems) {
  const seenVocabId = new Map(); // vocabularyId -> item
  
  for (const item of existing) {
    seenVocabId.set(item.vocabularyId, item);
  }
  
  let duplicateCount = 0;
  for (const item of newItems) {
    if (!seenVocabId.has(item.vocabularyId)) {
      seenVocabId.set(item.vocabularyId, item);
    } else {
      duplicateCount++;
      // Keep the one with more review history
      const existing = seenVocabId.get(item.vocabularyId);
      if ((item.reviewHistory?.length || 0) > (existing.reviewHistory?.length || 0)) {
        seenVocabId.set(item.vocabularyId, item);
      }
    }
  }
  
  return {
    items: Array.from(seenVocabId.values()),
    duplicateCount
  };
}

/**
 * Merge memories, keeping the latest updated one
 */
function mergeMemories(existing, newItems) {
  const seenVocabId = new Map();
  
  for (const item of existing) {
    seenVocabId.set(item.vocabularyId, item);
  }
  
  let duplicateCount = 0;
  for (const item of newItems) {
    if (!seenVocabId.has(item.vocabularyId)) {
      seenVocabId.set(item.vocabularyId, item);
    } else {
      duplicateCount++;
      const existing = seenVocabId.get(item.vocabularyId);
      if ((item.updatedDate || item.createdDate) > (existing.updatedDate || existing.createdDate)) {
        seenVocabId.set(item.vocabularyId, item);
      }
    }
  }
  
  return {
    items: Array.from(seenVocabId.values()),
    duplicateCount
  };
}

/**
 * Merge progress
 */
function mergeProgress(existing, newItems) {
  const seenVocabId = new Map();
  
  for (const item of existing) {
    seenVocabId.set(item.vocabularyId, item);
  }
  
  let duplicateCount = 0;
  for (const item of newItems) {
    if (!seenVocabId.has(item.vocabularyId)) {
      seenVocabId.set(item.vocabularyId, item);
    } else {
      duplicateCount++;
    }
  }
  
  return {
    items: Array.from(seenVocabId.values()),
    duplicateCount
  };
}

// ============================================================================
// Main
// ============================================================================

function main() {
  console.log('=== Vocabulary Store Migration Tool ===\n');
  
  // Load existing vocabulary store
  let store = loadVocabularyStore();
  console.log('Existing vocabulary-store.json:');
  console.log(`  Vocabularies: ${store.vocabularies?.length || 0}`);
  console.log(`  Reviews: ${store.reviews?.length || 0}`);
  console.log(`  Memories: ${store.memories?.length || 0}`);
  console.log(`  Progress: ${store.progress?.length || 0}`);
  console.log('');
  
  // Find all story files
  if (!fs.existsSync(STORIES_DIR)) {
    console.error('Error: stories/ folder not found');
    process.exit(1);
  }
  
  const storyFiles = fs.readdirSync(STORIES_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('.backup'));
  
  console.log(`Found ${storyFiles.length} story files\n`);
  
  // Collect all vocabularies from all stories
  let allVocabularies = [];
  let allReviews = [];
  let allMemories = [];
  let allProgress = [];
  
  for (const file of storyFiles) {
    const storyPath = path.join(STORIES_DIR, file);
    const storyId = file.replace('.json', '');
    
    console.log(`Processing: ${file}`);
    
    try {
      const storyData = JSON.parse(fs.readFileSync(storyPath, 'utf-8'));
      const extracted = extractVocabulariesFromStory(storyData, storyId);
      
      console.log(`  Vocabularies: ${extracted.vocabularies.length}`);
      console.log(`  Reviews: ${extracted.reviews.length}`);
      console.log(`  Memories: ${extracted.memories.length}`);
      console.log(`  Progress: ${extracted.progress.length}`);
      
      allVocabularies = allVocabularies.concat(extracted.vocabularies);
      allReviews = allReviews.concat(extracted.reviews);
      allMemories = allMemories.concat(extracted.memories);
      allProgress = allProgress.concat(extracted.progress);
      
    } catch (error) {
      console.error(`  Error: ${error.message}`);
    }
    console.log('');
  }
  
  console.log('=== Merging data ===\n');
  
  // Merge with existing store
  const vocabResult = mergeVocabularies(store.vocabularies || [], allVocabularies);
  const reviewResult = mergeReviews(store.reviews || [], allReviews);
  const memoryResult = mergeMemories(store.memories || [], allMemories);
  const progressResult = mergeProgress(store.progress || [], allProgress);
  
  console.log(`Vocabularies: ${vocabResult.items.length} (${vocabResult.duplicateCount} duplicates removed)`);
  console.log(`Reviews: ${reviewResult.items.length} (${reviewResult.duplicateCount} duplicates merged)`);
  console.log(`Memories: ${memoryResult.items.length} (${memoryResult.duplicateCount} duplicates merged)`);
  console.log(`Progress: ${progressResult.items.length} (${progressResult.duplicateCount} duplicates merged)`);
  
  // Create final store
  const finalStore = {
    vocabularies: vocabResult.items,
    reviews: reviewResult.items,
    memories: memoryResult.items,
    progress: progressResult.items,
    lastUpdated: new Date().toISOString()
  };
  
  // Backup existing file
  if (fs.existsSync(VOCAB_STORE_PATH)) {
    const backupPath = VOCAB_STORE_PATH.replace('.json', '.backup.json');
    fs.copyFileSync(VOCAB_STORE_PATH, backupPath);
    console.log(`\nBackup created: vocabulary-store.backup.json`);
  }
  
  // Save
  saveVocabularyStore(finalStore);
  console.log(`\n✓ Saved to vocabulary-store.json`);
  
  console.log('\n=== Final Statistics ===');
  console.log(`Total vocabularies: ${finalStore.vocabularies.length}`);
  console.log(`Total reviews: ${finalStore.reviews.length}`);
  console.log(`Total memories: ${finalStore.memories.length}`);
  console.log(`Total progress: ${finalStore.progress.length}`);
}

/**
 * Clean story files - remove old vocabulary data, keep only vocabularyIds
 */
function cleanStories() {
  console.log('=== Cleaning Story Files ===\n');
  
  // Get all story files
  const storyFiles = fs.readdirSync(STORIES_DIR).filter(f => f.endsWith('.json'));
  console.log(`Found ${storyFiles.length} story files\n`);
  
  for (const file of storyFiles) {
    const storyPath = path.join(STORIES_DIR, file);
    
    console.log(`Cleaning: ${file}`);
    
    try {
      const storyData = JSON.parse(fs.readFileSync(storyPath, 'utf-8'));
      let modified = false;
      
      // Remove vocabularyStore from story level
      if (storyData.vocabularyStore !== undefined) {
        delete storyData.vocabularyStore;
        modified = true;
        console.log('  - Removed vocabularyStore');
      }
      
      // Clean journal entries
      if (storyData.journal) {
        for (const dailyChat of storyData.journal) {
          // Extract vocabularyIds from vocabularies if not already present
          if (dailyChat.vocabularies && dailyChat.vocabularies.length > 0) {
            if (!dailyChat.vocabularyIds || dailyChat.vocabularyIds.length === 0) {
              dailyChat.vocabularyIds = dailyChat.vocabularies.map(v => v.id);
            }
          }
          
          // Remove all legacy fields (including empty arrays)
          if (dailyChat.vocabularies !== undefined) {
            delete dailyChat.vocabularies;
            modified = true;
          }
          if (dailyChat.vocabularyProgress !== undefined) {
            delete dailyChat.vocabularyProgress;
            modified = true;
          }
          if (dailyChat.vocabularyMemories !== undefined) {
            delete dailyChat.vocabularyMemories;
            modified = true;
          }
          if (dailyChat.reviewSchedule !== undefined) {
            delete dailyChat.reviewSchedule;
            modified = true;
          }
        }
      }
      
      if (modified) {
        // Backup original
        const backupPath = storyPath.replace('.json', '.backup.json');
        if (!fs.existsSync(backupPath)) {
          fs.copyFileSync(storyPath, backupPath);
          console.log(`  - Created backup: ${file.replace('.json', '.backup.json')}`);
        }
        
        // Save cleaned version
        fs.writeFileSync(storyPath, JSON.stringify(storyData, null, 2));
        console.log('  ✓ Cleaned and saved');
      } else {
        console.log('  - Already clean, no changes needed');
      }
      
    } catch (error) {
      console.error(`  Error: ${error.message}`);
    }
    console.log('');
  }
  
  console.log('=== Story Cleaning Complete ===');
}

// Parse command line args
const args = process.argv.slice(2);
const shouldMigrate = args.length === 0 || args.includes('--all');
const shouldClean = args.includes('--clean') || args.includes('--all');

if (shouldMigrate) {
  main();
}

if (shouldClean) {
  if (shouldMigrate) {
    console.log('\n' + '='.repeat(60) + '\n');
  }
  cleanStories();
}

if (!shouldMigrate && !shouldClean) {
  console.log('Usage:');
  console.log('  node tool.js          - Migrate vocabularies to vocabulary-store.json');
  console.log('  node tool.js --clean  - Clean stories (remove old vocab data)');
  console.log('  node tool.js --all    - Do both: migrate then clean');
}
