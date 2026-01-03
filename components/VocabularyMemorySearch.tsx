import React, { useState, useCallback } from 'react';
import type { ChatJournal, VocabularyItem } from '../types';
import { formatJournalForSearch, searchConversations, getMessageContext, SearchResult } from '../utils/storySearch';
import { searchVocabularyInJournal } from '../services/geminiService';

interface VocabularyMemorySearchProps {
  journal: ChatJournal;
  vocabulary: VocabularyItem;
  onSelectMessage: (result: SearchResult, contextText: string) => void;
  onClose: () => void;
  onPlayAudio?: (audioData: string, characterName?: string) => void;
}

export const VocabularyMemorySearch: React.FC<VocabularyMemorySearchProps> = ({
  journal,
  vocabulary,
  onSelectMessage,
  onClose,
  onPlayAudio
}) => {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<number | null>(null);
  const [contextTexts, setContextTexts] = useState<Map<number, string>>(new Map());
  const [hasSearched, setHasSearched] = useState(false);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);

  // Get audio data from the original message
  const getAudioForResult = useCallback((result: SearchResult): string | null => {
    const dailyChat = journal[result.journalIndex];
    if (!dailyChat) return null;
    const message = dailyChat.messages[result.messageIndex];
    return message?.audioData || null;
  }, [journal]);

  // Search using AI to find word variants
  const handleAISearch = useCallback(async () => {
    setIsSearching(true);
    setError(null);
    setHasSearched(true);

    try {
      const formattedJournal = formatJournalForSearch(journal);
      
      // Call AI to get search pattern for word variants
      const searchPattern = await searchVocabularyInJournal(vocabulary.korean, formattedJournal.text);
      
      if (searchPattern) {
        // Execute search with AI-generated pattern
        const results = searchConversations(formattedJournal, searchPattern, 50);
        setSearchResults(results);
        
        if (results.length === 0) {
          setError(`Không tìm thấy "${vocabulary.korean}" trong lịch sử hội thoại.`);
        }
      } else {
        // Fallback to simple search if AI fails
        const results = searchConversations(formattedJournal, vocabulary.korean, 50);
        setSearchResults(results);
        
        if (results.length === 0) {
          setError(`Không tìm thấy "${vocabulary.korean}" trong lịch sử hội thoại.`);
        }
      }
    } catch (err) {
      console.error('Search error:', err);
      setError('Lỗi khi tìm kiếm. Vui lòng thử lại.');
    } finally {
      setIsSearching(false);
    }
  }, [journal, vocabulary]);

  // Get context around a specific message
  const handleExpandResult = useCallback((index: number, result: SearchResult) => {
    if (expandedResult === index) {
      setExpandedResult(null);
      return;
    }

    setExpandedResult(index);

    // Calculate global message index
    let globalIndex = 1;
    for (let i = 0; i < result.journalIndex; i++) {
      globalIndex += journal[i].messages.length;
    }
    globalIndex += result.messageIndex + 1;

    // Get context
    const context = getMessageContext(journal, globalIndex, 3);
    if (context.found) {
      setContextTexts(prev => new Map(prev).set(index, context.text));
    }
  }, [expandedResult, journal]);

  // Handle selecting a message for memory linking
  const handleSelectResult = useCallback((result: SearchResult) => {
    // Get context for the selected result
    let globalIndex = 1;
    for (let i = 0; i < result.journalIndex; i++) {
      globalIndex += journal[i].messages.length;
    }
    globalIndex += result.messageIndex + 1;

    const context = getMessageContext(journal, globalIndex, 5);
    onSelectMessage(result, context.found ? context.text : result.text);
  }, [journal, onSelectMessage]);

  // Handle playing audio for a result
  const handlePlayAudio = useCallback((index: number, result: SearchResult) => {
    const audioData = getAudioForResult(result);
    if (audioData && onPlayAudio) {
      setPlayingIndex(index);
      onPlayAudio(audioData, result.characterName);
      // Reset playing state after a short delay (audio playback is async)
      setTimeout(() => setPlayingIndex(null), 500);
    }
  }, [getAudioForResult, onPlayAudio]);

  return (
    <div className="vocabulary-memory-search">
      {/* Header */}
      <div className="search-header">
        <h3>🔍 Tìm kiếm: {vocabulary.korean}</h3>
        <span className="vocab-meaning">({vocabulary.vietnamese})</span>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      {/* Search Action */}
      <div className="search-action">
        <button 
          className="ai-search-btn"
          onClick={handleAISearch}
          disabled={isSearching}
        >
          {isSearching ? (
            <>
              <span className="spinner"></span>
              Đang tìm kiếm...
            </>
          ) : (
            <>🤖 Tìm với AI (bao gồm biến thể từ)</>
          )}
        </button>
        <p className="search-hint">
          AI sẽ tìm tất cả các dạng biến thể của từ (ví dụ: 먹다 → 먹어요, 먹었어요, 먹고...)
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="search-error">
          ⚠️ {error}
        </div>
      )}

      {/* Results */}
      {searchResults.length > 0 && (
        <div className="search-results">
          <div className="results-header">
            📝 Tìm thấy {searchResults.length} kết quả
          </div>
          
          <div className="results-list">
            {searchResults.map((result, index) => {
              const hasAudio = !!getAudioForResult(result);
              return (
                <div key={`${result.dailyChatId}-${result.messageIndex}`} className="result-item">
                  <div 
                    className="result-main"
                    onClick={() => handleExpandResult(index, result)}
                  >
                    <div className="result-meta">
                      <span className="result-date">📅 {result.date}</span>
                      <span className="result-character">👤 {result.characterName}</span>
                      {hasAudio && (
                        <button
                          className={`audio-btn ${playingIndex === index ? 'playing' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlayAudio(index, result);
                          }}
                          title="Nghe âm thanh"
                        >
                          🔊
                        </button>
                      )}
                    </div>
                    <div className="result-text">{result.text}</div>
                    <div className="result-actions">
                      <button 
                        className="expand-btn"
                        title={expandedResult === index ? "Thu gọn" : "Xem ngữ cảnh"}
                      >
                        {expandedResult === index ? '▲' : '▼'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Context */}
                  {expandedResult === index && contextTexts.has(index) && (
                    <div className="result-context">
                      <pre>{contextTexts.get(index)}</pre>
                      <button 
                        className="select-btn"
                        onClick={() => handleSelectResult(result)}
                      >
                        ✓ Chọn tin nhắn này để gắn ký ức
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No results message */}
      {hasSearched && searchResults.length === 0 && !error && !isSearching && (
        <div className="no-results">
          <p>Không tìm thấy kết quả nào.</p>
          <p className="hint">Từ này có thể chưa được sử dụng trong hội thoại.</p>
        </div>
      )}

      <style>{`
        .vocabulary-memory-search {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #1a1a2e;
          border-radius: 12px;
          overflow: hidden;
        }

        .search-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: #16213e;
          border-bottom: 1px solid #0f3460;
        }

        .search-header h3 {
          margin: 0;
          color: #e94560;
          font-size: 18px;
        }

        .vocab-meaning {
          color: #888;
          font-size: 14px;
        }

        .close-btn {
          margin-left: auto;
          background: none;
          border: none;
          color: #888;
          font-size: 20px;
          cursor: pointer;
          padding: 4px 8px;
        }

        .close-btn:hover {
          color: #e94560;
        }

        .search-action {
          padding: 16px;
          border-bottom: 1px solid #0f3460;
        }

        .ai-search-btn {
          width: 100%;
          padding: 12px 16px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: opacity 0.2s;
        }

        .ai-search-btn:hover:not(:disabled) {
          opacity: 0.9;
        }

        .ai-search-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .search-hint {
          margin: 8px 0 0 0;
          color: #888;
          font-size: 12px;
          text-align: center;
        }

        .search-error {
          padding: 12px 16px;
          background: rgba(233, 69, 96, 0.1);
          color: #e94560;
          margin: 8px 16px;
          border-radius: 8px;
          font-size: 14px;
        }

        .search-results {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }

        .results-header {
          color: #4ade80;
          font-size: 14px;
          margin-bottom: 12px;
        }

        .results-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .result-item {
          background: #16213e;
          border-radius: 8px;
          overflow: hidden;
        }

        .result-main {
          padding: 12px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .result-main:hover {
          background: #1a2744;
        }

        .result-meta {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
          font-size: 12px;
          color: #888;
        }

        .audio-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px 6px;
          font-size: 14px;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .audio-btn:hover {
          background: rgba(102, 126, 234, 0.3);
        }

        .audio-btn.playing {
          animation: pulse 0.5s ease-in-out;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }

        .result-text {
          color: #fff;
          font-size: 14px;
          line-height: 1.5;
        }

        .result-actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 8px;
        }

        .expand-btn {
          background: none;
          border: none;
          color: #667eea;
          cursor: pointer;
          padding: 4px 8px;
          font-size: 12px;
        }

        .result-context {
          padding: 12px;
          background: #0f1629;
          border-top: 1px solid #0f3460;
        }

        .result-context pre {
          margin: 0 0 12px 0;
          color: #ccc;
          font-size: 12px;
          line-height: 1.6;
          white-space: pre-wrap;
          font-family: inherit;
        }

        .select-btn {
          width: 100%;
          padding: 10px;
          background: #4ade80;
          color: #000;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .select-btn:hover {
          background: #22c55e;
        }

        .no-results {
          padding: 32px;
          text-align: center;
          color: #888;
        }

        .no-results p {
          margin: 8px 0;
        }

        .no-results .hint {
          font-size: 12px;
          color: #666;
        }
      `}</style>
    </div>
  );
};

export default VocabularyMemorySearch;
