import Fuse from 'fuse.js';
import type { ChatJournal, DailyChat, Message } from '../types';

export interface SearchResult {
  journalIndex: number;
  messageIndex: number;
  characterName: string;
  text: string;
  dailyChatId: string;
  date: string;
}

export interface FormattedJournal {
  text: string;
  entries: {
    journalIndex: number;
    dailyChatId: string;
    date: string;
    messages: {
      messageIndex: number;
      characterName: string;
      text: string;
    }[];
  }[];
}

/**
 * Format entire journal into a readable text format for AI context
 * Format:
 * -------Journal 1 (2024-01-01)------
 * [1] Mimi: 안녕하세요!
 * [2] User: Xin chào
 * ...
 */
export function formatJournalForSearch(journal: ChatJournal): FormattedJournal {
  const entries: FormattedJournal['entries'] = [];
  let fullText = '';

  journal.forEach((dailyChat, journalIndex) => {
    const entry: FormattedJournal['entries'][0] = {
      journalIndex,
      dailyChatId: dailyChat.id,
      date: dailyChat.date,
      messages: []
    };

    fullText += `\n-------Journal ${journalIndex + 1} (${dailyChat.date})------\n`;

    dailyChat.messages.forEach((msg, msgIndex) => {
      const characterName = msg.sender === 'user' ? 'User' : (msg.characterName || 'Bot');
      const text = msg.text;

      entry.messages.push({
        messageIndex: msgIndex,
        characterName,
        text
      });

      fullText += `[${msgIndex + 1}] ${characterName}: ${text}\n`;
    });

    entries.push(entry);
  });

  return { text: fullText, entries };
}

/**
 * Search conversations using regex pattern
 * Supports multiple patterns with | (OR) operator
 * Example: "재미있|좋아|싫어" will match any of these words
 */
export function searchConversations(
  formattedJournal: FormattedJournal,
  pattern: string,
  maxResults: number = 20
): SearchResult[] {
  const results: SearchResult[] = [];

  try {
    // Trim and clean pattern (remove whitespace from start/end and around | separators)
    const cleanPattern = pattern.trim().split('|').map(p => p.trim()).filter(p => p.length > 0).join('|');
    if (!cleanPattern) return results;
    
    // Create regex from pattern (case-insensitive)
    const regex = new RegExp(cleanPattern, 'gi');

    for (const entry of formattedJournal.entries) {
      for (const msg of entry.messages) {
        if (regex.test(msg.text)) {
          results.push({
            journalIndex: entry.journalIndex,
            messageIndex: msg.messageIndex,
            characterName: msg.characterName,
            text: msg.text,
            dailyChatId: entry.dailyChatId,
            date: entry.date
          });

          // Reset regex lastIndex for next test
          regex.lastIndex = 0;

          if (results.length >= maxResults) {
            return results;
          }
        }
      }
    }
  } catch (e) {
    // If regex is invalid, fallback to simple string search
    const patterns = pattern.split('|').map(p => p.trim().toLowerCase());
    
    for (const entry of formattedJournal.entries) {
      for (const msg of entry.messages) {
        const textLower = msg.text.toLowerCase();
        if (patterns.some(p => textLower.includes(p))) {
          results.push({
            journalIndex: entry.journalIndex,
            messageIndex: msg.messageIndex,
            characterName: msg.characterName,
            text: msg.text,
            dailyChatId: entry.dailyChatId,
            date: entry.date
          });

          if (results.length >= maxResults) {
            return results;
          }
        }
      }
    }
  }

  return results;
}

/**
 * Fuzzy search using Fuse.js for more flexible matching
 */
export function fuzzySearchConversations(
  formattedJournal: FormattedJournal,
  query: string,
  maxResults: number = 20
): SearchResult[] {
  // Flatten all messages for Fuse.js
  const allMessages: (SearchResult & { id: string })[] = [];
  
  for (const entry of formattedJournal.entries) {
    for (const msg of entry.messages) {
      allMessages.push({
        id: `${entry.journalIndex}-${msg.messageIndex}`,
        journalIndex: entry.journalIndex,
        messageIndex: msg.messageIndex,
        characterName: msg.characterName,
        text: msg.text,
        dailyChatId: entry.dailyChatId,
        date: entry.date
      });
    }
  }

  const fuse = new Fuse(allMessages, {
    keys: ['text', 'characterName'],
    threshold: 0.4, // Lower = more strict matching
    includeScore: true,
    ignoreLocation: true
  });

  const fuseResults = fuse.search(query, { limit: maxResults });
  return fuseResults.map(r => r.item);
}

/**
 * Get full conversation by journal index
 * Returns null if index doesn't exist
 */
export function getConversationByIndex(
  journal: ChatJournal,
  journalIndex: number
): { dailyChat: DailyChat; formattedText: string } | null {
  if (journalIndex < 0 || journalIndex >= journal.length) {
    return null;
  }

  const dailyChat = journal[journalIndex];
  let formattedText = `-------Journal ${journalIndex + 1} (${dailyChat.date})------\n`;
  formattedText += `Summary: ${dailyChat.summary || 'N/A'}\n\n`;

  dailyChat.messages.forEach((msg, idx) => {
    const characterName = msg.sender === 'user' ? 'User' : (msg.characterName || 'Bot');
    formattedText += `[${idx + 1}] ${characterName}: ${msg.text}\n`;
  });

  return { dailyChat, formattedText };
}

/**
 * Get conversation by dailyChatId
 */
export function getConversationById(
  journal: ChatJournal,
  dailyChatId: string
): { dailyChat: DailyChat; journalIndex: number; formattedText: string } | null {
  const journalIndex = journal.findIndex(dc => dc.id === dailyChatId);
  if (journalIndex === -1) {
    return null;
  }

  const result = getConversationByIndex(journal, journalIndex);
  if (!result) return null;

  return {
    ...result,
    journalIndex
  };
}

/**
 * Format search results into readable text for AI
 * Uses global message index across all journals
 */
export function formatSearchResultsForAI(results: SearchResult[], journal?: ChatJournal): string {
  if (results.length === 0) {
    return 'Không tìm thấy kết quả nào.';
  }

  let output = `Tìm thấy ${results.length} kết quả:\n\n`;

  // Group by journal
  const grouped = new Map<number, SearchResult[]>();
  for (const r of results) {
    if (!grouped.has(r.journalIndex)) {
      grouped.set(r.journalIndex, []);
    }
    grouped.get(r.journalIndex)!.push(r);
  }

  // Calculate global message offset for each journal
  const journalOffsets = new Map<number, number>();
  if (journal) {
    let offset = 0;
    for (let ji = 0; ji < journal.length; ji++) {
      journalOffsets.set(ji, offset);
      offset += journal[ji].messages.length;
    }
  }
  
  for (const [journalIndex, msgs] of grouped) {
    const globalOffset = journalOffsets.get(journalIndex) || 0;
    output += `--- Journal ${journalIndex + 1} (${msgs[0].date}) ---\n`;
    for (const msg of msgs) {
      const globalMsgIndex = globalOffset + msg.messageIndex + 1;
      output += `[Message ${globalMsgIndex}] ${msg.characterName}: ${msg.text}\n`;
    }
    output += '\n';
  }

  output += '\n💡 Tip: Dùng GET_MESSAGE:<số> để xem các tin nhắn xung quanh một message cụ thể.';

  return output;
}

/**
 * Get messages around a specific global message index
 * Global message index counts all messages across all journals
 * Returns surrounding messages (before and after) for context
 */
export function getMessageContext(
  journal: ChatJournal,
  globalMessageIndex: number,
  contextSize: number = 5
): { found: boolean; text: string } {
  // Build a map of global index -> (journalIndex, messageIndex)
  let globalIndex = 1; // 1-based
  let targetJournalIndex = -1;
  let targetMessageIndex = -1;
  
  // First pass: find the target message
  for (let ji = 0; ji < journal.length; ji++) {
    const dailyChat = journal[ji];
    for (let mi = 0; mi < dailyChat.messages.length; mi++) {
      if (globalIndex === globalMessageIndex) {
        targetJournalIndex = ji;
        targetMessageIndex = mi;
        break;
      }
      globalIndex++;
    }
    if (targetJournalIndex !== -1) break;
  }
  
  if (targetJournalIndex === -1) {
    return { 
      found: false, 
      text: `Không tìm thấy Message ${globalMessageIndex}. Tổng số messages: ${globalIndex - 1}` 
    };
  }
  
  const dailyChat = journal[targetJournalIndex];
  const startIdx = Math.max(0, targetMessageIndex - contextSize);
  const endIdx = Math.min(dailyChat.messages.length - 1, targetMessageIndex + contextSize);
  
  let output = `--- Context xung quanh Message ${globalMessageIndex} ---\n`;
  output += `Journal ${targetJournalIndex + 1} (${dailyChat.date})\n`;
  if (dailyChat.summary) {
    output += `Summary: ${dailyChat.summary}\n`;
  }
  output += `\n`;
  
  // Calculate the global index for the start message
  let startGlobalIndex = 1;
  for (let ji = 0; ji < targetJournalIndex; ji++) {
    startGlobalIndex += journal[ji].messages.length;
  }
  startGlobalIndex += startIdx;
  
  for (let mi = startIdx; mi <= endIdx; mi++) {
    const msg = dailyChat.messages[mi];
    const characterName = msg.sender === 'user' ? 'User' : (msg.characterName || 'Bot');
    const currentGlobalIndex = startGlobalIndex + (mi - startIdx);
    const marker = mi === targetMessageIndex ? '>>>' : '   ';
    output += `${marker} [Message ${currentGlobalIndex}] ${characterName}: ${msg.text}\n`;
  }
  
  // Show if there are more messages before/after
  if (startIdx > 0) {
    output = `... (${startIdx} tin nhắn trước đó)\n\n` + output;
  }
  if (endIdx < dailyChat.messages.length - 1) {
    output += `\n... (${dailyChat.messages.length - 1 - endIdx} tin nhắn sau đó)`;
  }
  
  return { found: true, text: output };
}

/**
 * Parse System command from AI response
 * Returns null if not a valid command
 * 
 * Supported commands:
 * - SEARCH:<pattern> - Search for pattern in conversations (supports regex with |)
 * - GET_JOURNAL:<index> - Get full conversation by journal index (1-based)
 * - GET_MESSAGE:<index> - Get messages around a specific message (global index, 1-based)
 */
export function parseSystemCommand(text: string): {
  type: 'SEARCH' | 'GET_JOURNAL' | 'GET_MESSAGE';
  param: string;
} | null {
  const searchMatch = text.match(/^SEARCH:(.+)$/i);
  if (searchMatch) {
    return { type: 'SEARCH', param: searchMatch[1].trim() };
  }

  const getJournalMatch = text.match(/^GET_JOURNAL:(\d+)$/i);
  if (getJournalMatch) {
    return { type: 'GET_JOURNAL', param: getJournalMatch[1] };
  }

  const getMessageMatch = text.match(/^GET_MESSAGE:(\d+)$/i);
  if (getMessageMatch) {
    return { type: 'GET_MESSAGE', param: getMessageMatch[1] };
  }

  return null;
}

/**
 * Execute System command and return result text for AI
 */
export function executeSystemCommand(
  command: { type: 'SEARCH' | 'GET_JOURNAL' | 'GET_MESSAGE'; param: string },
  journal: ChatJournal,
  formattedJournal: FormattedJournal
): string {
  switch (command.type) {
    case 'SEARCH': {
      const results = searchConversations(formattedJournal, command.param, 15);
      return formatSearchResultsForAI(results, journal);
    }
    case 'GET_JOURNAL': {
      const index = parseInt(command.param, 10) - 1; // Convert to 0-based
      const result = getConversationByIndex(journal, index);
      if (!result) {
        return `Lỗi: Journal ${command.param} không tồn tại. Tổng số journals: ${journal.length}`;
      }
      return result.formattedText;
    }
    case 'GET_MESSAGE': {
      const globalIndex = parseInt(command.param, 10);
      const result = getMessageContext(journal, globalIndex);
      return result.text;
    }
    default:
      return 'Lỗi: Command không hợp lệ.';
  }
}
