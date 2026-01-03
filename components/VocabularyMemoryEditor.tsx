import React, { useState, useCallback } from 'react';
import type { VocabularyItem, VocabularyMemoryEntry, ChatJournal, DailyChat } from '../types';
import { SearchResult } from '../utils/storySearch';
import VocabularyMemorySearch from './VocabularyMemorySearch';

interface VocabularyMemoryEditorProps {
  vocabulary: VocabularyItem;
  journal: ChatJournal;
  existingMemory?: VocabularyMemoryEntry;
  dailyChat: DailyChat; // The daily chat that contains this vocabulary
  onSave: (memory: VocabularyMemoryEntry) => void;
  onCancel: () => void;
}

export const VocabularyMemoryEditor: React.FC<VocabularyMemoryEditorProps> = ({
  vocabulary,
  journal,
  existingMemory,
  dailyChat,
  onSave,
  onCancel
}) => {
  const [userMemory, setUserMemory] = useState(existingMemory?.userMemory || '');
  const [linkedMessages, setLinkedMessages] = useState<{
    messageId: string;
    text: string;
    characterName: string;
    dailyChatId: string;
    date: string;
  }[]>(() => {
    // Initialize from existing memory if present
    if (existingMemory?.linkedMessageIds?.length) {
      // Try to find the messages in journal
      const messages: typeof linkedMessages = [];
      for (const dc of journal) {
        for (const msg of dc.messages) {
          if (existingMemory.linkedMessageIds.includes(msg.id)) {
            messages.push({
              messageId: msg.id,
              text: msg.text,
              characterName: msg.sender === 'user' ? 'User' : (msg.characterName || 'Bot'),
              dailyChatId: dc.id,
              date: dc.date
            });
          }
        }
      }
      return messages;
    }
    return [];
  });
  const [showSearch, setShowSearch] = useState(false);
  const [contextText, setContextText] = useState<string>('');

  // Handle message selection from search
  const handleSelectMessage = useCallback((result: SearchResult, context: string) => {
    // Find the actual message to get its ID
    const dc = journal[result.journalIndex];
    if (!dc) return;

    const message = dc.messages[result.messageIndex];
    if (!message) return;

    // Check if already linked
    if (linkedMessages.some(m => m.messageId === message.id)) {
      setShowSearch(false);
      return;
    }

    setLinkedMessages(prev => [...prev, {
      messageId: message.id,
      text: result.text,
      characterName: result.characterName,
      dailyChatId: result.dailyChatId,
      date: result.date
    }]);
    setContextText(context);
    setShowSearch(false);
  }, [journal, linkedMessages]);

  // Remove a linked message
  const handleRemoveLinkedMessage = useCallback((messageId: string) => {
    setLinkedMessages(prev => prev.filter(m => m.messageId !== messageId));
  }, []);

  // Save the memory
  const handleSave = useCallback(() => {
    if (!userMemory.trim()) {
      alert('Vui lòng nhập ký ức của bạn với từ này.');
      return;
    }

    const memory: VocabularyMemoryEntry = {
      vocabularyId: vocabulary.id,
      userMemory: userMemory.trim(),
      linkedMessageIds: linkedMessages.map(m => m.messageId),
      linkedDailyChatId: dailyChat.id,
      createdDate: existingMemory?.createdDate || new Date().toISOString(),
      updatedDate: new Date().toISOString()
    };

    onSave(memory);
  }, [vocabulary.id, userMemory, linkedMessages, dailyChat.id, existingMemory, onSave]);

  if (showSearch) {
    return (
      <VocabularyMemorySearch
        journal={journal}
        vocabulary={vocabulary}
        onSelectMessage={handleSelectMessage}
        onClose={() => setShowSearch(false)}
      />
    );
  }

  return (
    <div className="vocabulary-memory-editor">
      {/* Header */}
      <div className="editor-header">
        <h3>📝 {existingMemory ? 'Chỉnh sửa' : 'Tạo'} ký ức cho từ</h3>
        <button className="close-btn" onClick={onCancel}>✕</button>
      </div>

      {/* Vocabulary Info */}
      <div className="vocab-info">
        <div className="vocab-korean">{vocabulary.korean}</div>
        <div className="vocab-vietnamese">{vocabulary.vietnamese}</div>
      </div>

      {/* Linked Messages */}
      <div className="linked-messages-section">
        <div className="section-header">
          <span>🔗 Tin nhắn liên quan</span>
          <button 
            className="add-link-btn"
            onClick={() => setShowSearch(true)}
          >
            + Tìm kiếm
          </button>
        </div>

        {linkedMessages.length > 0 ? (
          <div className="linked-messages-list">
            {linkedMessages.map((msg) => (
              <div key={msg.messageId} className="linked-message">
                <div className="message-content">
                  <span className="message-meta">{msg.date} - {msg.characterName}</span>
                  <span className="message-text">{msg.text}</span>
                </div>
                <button 
                  className="remove-btn"
                  onClick={() => handleRemoveLinkedMessage(msg.messageId)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-links">
            <p>Chưa có tin nhắn nào được liên kết.</p>
            <p className="hint">Nhấn "Tìm kiếm" để tìm các tin nhắn có chứa từ này.</p>
          </div>
        )}

        {/* Context Preview */}
        {contextText && (
          <div className="context-preview">
            <div className="context-header">📖 Ngữ cảnh:</div>
            <pre>{contextText}</pre>
          </div>
        )}
      </div>

      {/* Memory Input */}
      <div className="memory-input-section">
        <label className="section-header">
          💭 Ký ức của bạn
          <span className="hint">(Ghi lại cảm xúc, sự kiện, hoặc liên tưởng giúp bạn nhớ từ này)</span>
        </label>
        <textarea
          className="memory-textarea"
          value={userMemory}
          onChange={(e) => setUserMemory(e.target.value)}
          placeholder="Ví dụ: Từ này xuất hiện khi Mimi giận dữ vì tôi quên sinh nhật cô ấy. Cảnh tượng Mimi khóc làm tôi nhớ mãi..."
          rows={5}
        />
      </div>

      {/* Action Buttons */}
      <div className="editor-actions">
        <button className="cancel-btn" onClick={onCancel}>
          Hủy
        </button>
        <button 
          className="save-btn" 
          onClick={handleSave}
          disabled={!userMemory.trim()}
        >
          💾 Lưu ký ức
        </button>
      </div>

      <style>{`
        .vocabulary-memory-editor {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #1a1a2e;
          border-radius: 12px;
          overflow: hidden;
        }

        .editor-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          background: #16213e;
          border-bottom: 1px solid #0f3460;
        }

        .editor-header h3 {
          margin: 0;
          color: #fff;
          font-size: 18px;
        }

        .close-btn {
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

        .vocab-info {
          padding: 20px;
          text-align: center;
          background: linear-gradient(135deg, #16213e 0%, #1a1a2e 100%);
          border-bottom: 1px solid #0f3460;
        }

        .vocab-korean {
          font-size: 32px;
          color: #e94560;
          font-weight: bold;
          margin-bottom: 8px;
        }

        .vocab-vietnamese {
          font-size: 18px;
          color: #888;
        }

        .linked-messages-section {
          padding: 16px;
          border-bottom: 1px solid #0f3460;
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
          color: #fff;
          font-size: 14px;
          font-weight: 500;
        }

        .section-header .hint {
          display: block;
          font-weight: normal;
          font-size: 12px;
          color: #888;
          margin-top: 4px;
        }

        .add-link-btn {
          padding: 6px 12px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .add-link-btn:hover {
          background: #5a6fd6;
        }

        .linked-messages-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 150px;
          overflow-y: auto;
        }

        .linked-message {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 10px;
          background: #16213e;
          border-radius: 8px;
        }

        .message-content {
          flex: 1;
          min-width: 0;
        }

        .message-meta {
          display: block;
          font-size: 11px;
          color: #888;
          margin-bottom: 4px;
        }

        .message-text {
          display: block;
          font-size: 13px;
          color: #fff;
          word-break: break-word;
        }

        .remove-btn {
          background: none;
          border: none;
          color: #666;
          font-size: 14px;
          cursor: pointer;
          padding: 2px 6px;
          flex-shrink: 0;
        }

        .remove-btn:hover {
          color: #e94560;
        }

        .no-links {
          padding: 16px;
          text-align: center;
          color: #888;
          background: #16213e;
          border-radius: 8px;
        }

        .no-links p {
          margin: 4px 0;
        }

        .no-links .hint {
          font-size: 12px;
          color: #666;
        }

        .context-preview {
          margin-top: 12px;
          padding: 12px;
          background: #0f1629;
          border-radius: 8px;
        }

        .context-header {
          color: #667eea;
          font-size: 12px;
          margin-bottom: 8px;
        }

        .context-preview pre {
          margin: 0;
          color: #aaa;
          font-size: 11px;
          line-height: 1.5;
          white-space: pre-wrap;
          font-family: inherit;
          max-height: 100px;
          overflow-y: auto;
        }

        .memory-input-section {
          padding: 16px;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .memory-input-section label {
          display: block;
          margin-bottom: 8px;
        }

        .memory-textarea {
          flex: 1;
          min-height: 100px;
          padding: 12px;
          background: #16213e;
          border: 1px solid #0f3460;
          border-radius: 8px;
          color: #fff;
          font-size: 14px;
          line-height: 1.5;
          resize: none;
        }

        .memory-textarea:focus {
          outline: none;
          border-color: #667eea;
        }

        .memory-textarea::placeholder {
          color: #555;
        }

        .editor-actions {
          display: flex;
          gap: 12px;
          padding: 16px;
          background: #16213e;
          border-top: 1px solid #0f3460;
        }

        .cancel-btn {
          flex: 1;
          padding: 12px;
          background: #333;
          color: #fff;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .cancel-btn:hover {
          background: #444;
        }

        .save-btn {
          flex: 2;
          padding: 12px;
          background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
          color: #000;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .save-btn:hover:not(:disabled) {
          opacity: 0.9;
        }

        .save-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default VocabularyMemoryEditor;
