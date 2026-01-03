import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useEditor, EditorContent, Node, mergeAttributes, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import type { VocabularyItem, VocabularyMemoryEntry, ChatJournal, DailyChat, Character } from '../types';
import { formatJournalForSearch, searchConversations, SearchResult } from '../utils/storySearch';
import { searchVocabularyInJournal } from '../services/geminiService';
import HTTPService from '../services/HTTPService';
import JournalPreviewModal from './JournalPreviewModal';

interface LinkedMessage {
  messageId: string;
  text: string;
  characterName: string;
  dailyChatId: string;
  date: string;
  audioData?: string;
}

interface VocabularyMemoryEditorProps {
  vocabulary: VocabularyItem;
  journal: ChatJournal;
  characters: Character[];
  existingMemory?: VocabularyMemoryEntry;
  dailyChat: DailyChat;
  onSave: (memory: VocabularyMemoryEntry) => void;
  onCancel: () => void;
  onPlayAudio?: (audioData: string, characterName?: string) => void;
  onTranslate?: (text: string) => Promise<string>;
}

// Custom Message Block Node for TipTap
const MessageBlockComponent = ({ node, deleteNode, extension }: any) => {
  const { messageId, text, characterName, date, audioData } = node.attrs;
  const onPlayAudio = extension.options.onPlayAudio;

  return (
    <NodeViewWrapper className="message-node-wrapper" data-type="message-block" draggable="true" data-drag-handle>
      <div className="message-block" contentEditable={false}>
        <div className="message-block-header">
          <div className="drag-handle" data-drag-handle>⋮⋮</div>
          <span className="character-badge">👤 {characterName}</span>
          <span className="date-badge">📅 {date}</span>
          {audioData && onPlayAudio && (
            <button 
              className="audio-btn"
              onClick={() => onPlayAudio(audioData, characterName)}
              title="Nghe âm thanh"
            >
              🔊
            </button>
          )}
          <button 
            className="remove-message-btn"
            onClick={deleteNode}
            title="Xóa tin nhắn"
          >
            ✕
          </button>
        </div>
        <div className="message-block-text">{text}</div>
      </div>
    </NodeViewWrapper>
  );
};

// Create custom TipTap node for message blocks
const createMessageBlockExtension = (onPlayAudio?: (audioData: string, characterName?: string) => void) => {
  return Node.create({
    name: 'messageBlock',
    group: 'block',
    atom: true,
    draggable: true,

    addOptions() {
      return {
        onPlayAudio: onPlayAudio
      };
    },

    addAttributes() {
      return {
        messageId: { default: '' },
        text: { default: '' },
        characterName: { default: '' },
        dailyChatId: { default: '' },
        date: { default: '' },
        audioData: { default: null }
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-type="message-block"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'message-block' })];
    },

    addNodeView() {
      return ReactNodeViewRenderer(MessageBlockComponent);
    }
  });
};

// Parse saved memory to TipTap JSON format
const parseMemoryToTipTap = (
  userMemory: string,
  linkedMessageIds: string[],
  journal: ChatJournal
): any => {
  const messagesMap = new Map<string, LinkedMessage>();
  for (const dc of journal) {
    for (const msg of dc.messages) {
      if (linkedMessageIds.includes(msg.id)) {
        messagesMap.set(msg.id, {
          messageId: msg.id,
          text: msg.text,
          characterName: msg.sender === 'user' ? 'User' : (msg.characterName || 'Bot'),
          dailyChatId: dc.id,
          date: dc.date,
          audioData: msg.audioData
        });
      }
    }
  }

  const content: any[] = [];
  // Parse both [MSG:id] and [IMG:base64] patterns
  const regex = /\[(MSG|IMG):([^\]]+)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(userMemory)) !== null) {
    if (match.index > lastIndex) {
      const textContent = userMemory.slice(lastIndex, match.index).trim();
      if (textContent) {
        content.push({
          type: 'paragraph',
          content: [{ type: 'text', text: textContent }]
        });
      }
    }

    const type = match[1];
    const value = match[2];

    if (type === 'MSG') {
      const linkedMsg = messagesMap.get(value);
      if (linkedMsg) {
        content.push({
          type: 'messageBlock',
          attrs: linkedMsg
        });
      }
    } else if (type === 'IMG') {
      content.push({
        type: 'image',
        attrs: { src: value }
      });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < userMemory.length) {
    const textContent = userMemory.slice(lastIndex).trim();
    if (textContent) {
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: textContent }]
      });
    }
  }

  if (content.length === 0) {
    content.push({ type: 'paragraph' });
  }

  return { type: 'doc', content };
};

// Serialize TipTap content back to storage format
const serializeTipTapContent = (json: any): { text: string; messageIds: string[] } => {
  let text = '';
  const messageIds: string[] = [];

  if (!json?.content) return { text: '', messageIds: [] };

  for (const node of json.content) {
    if (node.type === 'paragraph') {
      const paragraphText = node.content?.map((n: any) => n.text || '').join('') || '';
      if (paragraphText) {
        text += (text ? '\n' : '') + paragraphText;
      }
    } else if (node.type === 'messageBlock') {
      const msgId = node.attrs?.messageId;
      if (msgId) {
        text += `[MSG:${msgId}]`;
        if (!messageIds.includes(msgId)) {
          messageIds.push(msgId);
        }
      }
    } else if (node.type === 'image') {
      const src = node.attrs?.src;
      if (src) {
        text += `[IMG:${src}]`;
      }
    }
  }

  return { text, messageIds };
};

// Detect if running on mobile
const isMobile = () => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
};

// Cached search result with additional info
interface CachedSearchResult extends SearchResult {
  audioData?: string;
}

export const VocabularyMemoryEditor: React.FC<VocabularyMemoryEditorProps> = ({
  vocabulary,
  journal,
  characters,
  existingMemory,
  dailyChat,
  onSave,
  onCancel,
  onPlayAudio,
  onTranslate
}) => {
  // Search state - cached results persist
  const [searchResults, setSearchResults] = useState<CachedSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [mobile, setMobile] = useState(isMobile);
  const [draggedResult, setDraggedResult] = useState<CachedSearchResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Journal preview state
  const [previewJournal, setPreviewJournal] = useState<{ dailyChat: DailyChat; messageId: string } | null>(null);
  
  // Detect mobile/desktop
  useEffect(() => {
    const handleResize = () => setMobile(isMobile());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Create message block extension with audio callback
  const MessageBlockExtension = useMemo(
    () => createMessageBlockExtension(onPlayAudio),
    [onPlayAudio]
  );

  // Parse initial content
  const initialContent = useMemo(() => {
    if (existingMemory?.userMemory) {
      return parseMemoryToTipTap(
        existingMemory.userMemory,
        existingMemory.linkedMessageIds || [],
        journal
      );
    }
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }, [existingMemory, journal]);

  // Initialize TipTap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: 'Viết ký ức của bạn ở đây...',
        emptyEditorClass: 'is-editor-empty',
      }),
      MessageBlockExtension,
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          class: 'memory-image',
        },
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
      },
    },
  });

  // Get current linked message IDs from editor content
  const getLinkedMessageIds = useCallback((): string[] => {
    if (!editor) return [];
    const json = editor.getJSON();
    const ids: string[] = [];
    
    const traverse = (node: any) => {
      if (node.type === 'messageBlock' && node.attrs?.messageId) {
        if (!ids.includes(node.attrs.messageId)) {
          ids.push(node.attrs.messageId);
        }
      }
      if (node.content) {
        node.content.forEach(traverse);
      }
    };
    
    traverse(json);
    return ids;
  }, [editor]);

  // Get audio data from original message
  const getAudioForResult = useCallback((result: SearchResult): string | null => {
    const dc = journal[result.journalIndex];
    if (!dc) return null;
    const message = dc.messages[result.messageIndex];
    return message?.audioData || null;
  }, [journal]);

  // AI Search for vocabulary
  const handleSearch = useCallback(async () => {
    setIsSearching(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      const formattedJournal = formatJournalForSearch(journal);
      
      console.log('Searching for:', vocabulary.korean);
      console.log('Journal entries:', formattedJournal.entries.length);
      
      const searchPattern = await searchVocabularyInJournal(vocabulary.korean, formattedJournal.text);
      
      console.log('AI returned pattern:', searchPattern);
      
      let results: SearchResult[];
      // Use the pattern if available, otherwise use the original word
      const patternToUse = searchPattern || vocabulary.korean;
      console.log('Using pattern:', patternToUse);
      
      results = searchConversations(formattedJournal, patternToUse, 50);
      
      console.log('Search results count:', results.length);
      if (results.length > 0) {
        console.log('First result:', results[0]);
      }

      // Enrich results with audio data
      const enrichedResults: CachedSearchResult[] = results.map(r => ({
        ...r,
        audioData: getAudioForResult(r) || undefined
      }));

      setSearchResults(enrichedResults);
      
      if (results.length === 0) {
        setSearchError(`Không tìm thấy "${vocabulary.korean}" trong lịch sử hội thoại.`);
      }
    } catch (err) {
      console.error('Search error:', err);
      setSearchError('Lỗi khi tìm kiếm. Vui lòng thử lại.');
    } finally {
      setIsSearching(false);
    }
  }, [journal, vocabulary, getAudioForResult]);

  // Open journal preview
  const openJournalPreview = useCallback((result: CachedSearchResult) => {
    const dc = journal[result.journalIndex];
    if (!dc) return;
    
    const message = dc.messages[result.messageIndex];
    if (!message) return;
    
    setPreviewJournal({ dailyChat: dc, messageId: message.id });
  }, [journal]);

  // Insert message into editor
  const insertMessage = useCallback((result: CachedSearchResult) => {
    if (!editor) return;

    const dc = journal[result.journalIndex];
    if (!dc) return;

    const message = dc.messages[result.messageIndex];
    if (!message) return;

    // Insert message block followed by an empty paragraph so cursor has a place to land
    editor
      .chain()
      .focus()
      .insertContent([
        {
          type: 'messageBlock',
          attrs: {
            messageId: message.id,
            text: result.text,
            characterName: result.characterName,
            dailyChatId: result.dailyChatId,
            date: result.date,
            audioData: message.audioData || null
          }
        },
        {
          type: 'paragraph'
        }
      ])
      .run();

    if (mobile) {
      setShowMobileSearch(false);
    }
  }, [editor, journal, mobile]);

  // Handle drag start
  const handleDragStart = useCallback((e: React.DragEvent, result: CachedSearchResult) => {
    setDraggedResult(result);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', result.text);
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggedResult(null);
  }, []);

  // Handle image upload
  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn file ảnh.');
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Ảnh quá lớn. Vui lòng chọn ảnh dưới 5MB.');
      return;
    }

    // Convert to base64 for upload
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      
      try {
        // Upload to server
        const response = await HTTPService.post('/api/upload-memory-image', { image: base64 });
        
        if (response.ok && response.data?.success && response.data?.url) {
          // Insert image with full URL (prepend baseUrl for dev mode)
          const imageUrl = response.data.url.startsWith('http') 
            ? response.data.url 
            : HTTPService.getBaseUrl() + response.data.url;
          editor.chain().focus().setImage({ src: imageUrl }).run();
        } else {
          console.error('Upload failed:', response);
          alert('Lỗi khi tải ảnh lên server: ' + (response.error || response.data?.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('Upload image error:', error);
        alert('Lỗi khi tải ảnh lên server.');
      }
    };
    reader.readAsDataURL(file);

    // Reset input
    e.target.value = '';
  }, [editor]);

  // Trigger image upload
  const triggerImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Save the memory
  const handleSave = useCallback(() => {
    if (!editor) return;

    const json = editor.getJSON();
    const { text, messageIds } = serializeTipTapContent(json);

    const hasContent = text.trim() || messageIds.length > 0;

    if (!hasContent) {
      alert('Vui lòng nhập ký ức của bạn với từ này.');
      return;
    }

    const memory: VocabularyMemoryEntry = {
      vocabularyId: vocabulary.id,
      userMemory: text,
      linkedMessageIds: messageIds,
      linkedDailyChatId: dailyChat.id,
      createdDate: existingMemory?.createdDate || new Date().toISOString(),
      updatedDate: new Date().toISOString()
    };

    onSave(memory);
  }, [editor, vocabulary.id, dailyChat.id, existingMemory, onSave]);

  // Render search panel content
  const renderSearchContent = () => (
    <div className="search-panel-content">
      {/* Search Button */}
      {!hasSearched && (
        <button 
          className="ai-search-btn"
          onClick={handleSearch}
          disabled={isSearching}
        >
          {isSearching ? (
            <>
              <span className="spinner"></span>
              Đang tìm kiếm...
            </>
          ) : (
            <>🤖 Tìm với AI</>
          )}
        </button>
      )}

      {/* Re-search button if already searched */}
      {hasSearched && !isSearching && (
        <button 
          className="re-search-btn"
          onClick={handleSearch}
        >
          🔄 Tìm lại
        </button>
      )}

      {/* Loading */}
      {isSearching && (
        <div className="search-loading">
          <span className="spinner large"></span>
          <p>Đang tìm các biến thể từ...</p>
        </div>
      )}

      {/* Error */}
      {searchError && (
        <div className="search-error">⚠️ {searchError}</div>
      )}

      {/* Results */}
      {searchResults.length > 0 && (
        <div className="search-results">
          <div className="results-header">
            📝 {searchResults.length} kết quả
            {!mobile && <span className="drag-hint">Kéo thả để chèn</span>}
          </div>
          
          <div className="results-list">
            {searchResults.map((result, index) => {
              return (
                <div 
                  key={`${result.dailyChatId}-${result.messageIndex}-${index}`} 
                  className={`result-item ${draggedResult === result ? 'dragging' : ''}`}
                  draggable={!mobile}
                  onDragStart={(e) => handleDragStart(e, result)}
                  onDragEnd={handleDragEnd}
                >
                  <div className="result-meta">
                    <span className="result-character">👤 {result.characterName}</span>
                    <span className="result-date">📅 {result.date}</span>
                    {result.audioData && onPlayAudio && (
                      <button
                        className="audio-btn-small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlayAudio(result.audioData!, result.characterName);
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
                      className="view-journal-btn"
                      onClick={() => openJournalPreview(result)}
                      title="Xem toàn bộ cuộc hội thoại"
                    >
                      📖 Xem
                    </button>
                    <button 
                      className="insert-result-btn"
                      onClick={() => insertMessage(result)}
                    >
                      {mobile ? '+ Chèn' : '+ Chèn vào'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No results */}
      {hasSearched && searchResults.length === 0 && !searchError && !isSearching && (
        <div className="no-results">
          <p>Không tìm thấy kết quả.</p>
        </div>
      )}
    </div>
  );

  return (
    <div className={`vocabulary-memory-editor ${mobile ? 'mobile' : 'desktop'}`}>
      {/* Header */}
      <div className="editor-header">
        <h3>📝 {existingMemory ? 'Chỉnh sửa' : 'Tạo'} ký ức</h3>
        <div className="vocab-badge">
          <span className="vocab-korean">{vocabulary.korean}</span>
          <span className="vocab-vietnamese">{vocabulary.vietnamese}</span>
        </div>
        <button className="close-btn" onClick={onCancel}>✕</button>
      </div>

      {/* Main Content - Split Layout on Desktop */}
      <div className="editor-main">
        {/* Editor Section */}
        <div className="editor-section">
          {/* Toolbar */}
          <div className="editor-toolbar">
            <span className="toolbar-label">💭 Ký ức</span>
            <div className="toolbar-actions">
              {mobile && (
                <button 
                  className="mobile-search-btn"
                  onClick={() => setShowMobileSearch(true)}
                >
                  🔍 Tìm tin nhắn ({searchResults.length})
                </button>
              )}
              <button
                className="format-btn"
                onClick={() => editor?.chain().focus().toggleBold().run()}
                data-active={editor?.isActive('bold')}
                title="Đậm"
              >
                <strong>B</strong>
              </button>
              <button
                className="format-btn"
                onClick={() => editor?.chain().focus().toggleItalic().run()}
                data-active={editor?.isActive('italic')}
                title="Nghiêng"
              >
                <em>I</em>
              </button>
              <button
                className="format-btn image-btn"
                onClick={triggerImageUpload}
                title="Chèn ảnh"
              >
                🖼️
              </button>
              {/* Hidden file input for image upload */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                style={{ display: 'none' }}
              />
            </div>
          </div>

          {/* TipTap Editor */}
          <div 
            className={`editor-container ${draggedResult ? 'drop-target' : ''}`}
            onDragOver={(e) => {
              if (draggedResult) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }
            }}
            onDrop={(e) => {
              if (draggedResult) {
                e.preventDefault();
                insertMessage(draggedResult);
                setDraggedResult(null);
              }
            }}
          >
            <EditorContent editor={editor} />
            {draggedResult && (
              <div className="drop-overlay">
                <span>📥 Thả để chèn tin nhắn</span>
              </div>
            )}
          </div>

          {/* Tips */}
          <div className="editor-tips">
            {mobile 
              ? '💡 Nhấn "Tìm tin nhắn" để thêm ngữ cảnh, 🖼️ để chèn ảnh'
              : '💡 Kéo tin nhắn từ bên phải hoặc nhấn 🖼️ để chèn ảnh'
            }
          </div>
        </div>

        {/* Search Panel - Desktop Only */}
        {!mobile && (
          <div className="search-panel">
            <div className="search-panel-header">
              <h4>🔍 Tin nhắn liên quan</h4>
              <span className="vocab-target">{vocabulary.korean}</span>
            </div>
            {renderSearchContent()}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="editor-actions">
        <button className="cancel-btn" onClick={onCancel}>
          Hủy
        </button>
        <button className="save-btn" onClick={handleSave}>
          💾 Lưu ký ức
        </button>
      </div>

      {/* Mobile Search Modal */}
      {mobile && showMobileSearch && (
        <div className="mobile-search-modal">
          <div className="modal-overlay" onClick={() => setShowMobileSearch(false)} />
          <div className="modal-content">
            <div className="modal-header">
              <h4>🔍 Tìm: {vocabulary.korean}</h4>
              <button className="modal-close" onClick={() => setShowMobileSearch(false)}>✕</button>
            </div>
            {renderSearchContent()}
          </div>
        </div>
      )}

      {/* Journal Preview Modal */}
      {previewJournal && (
        <JournalPreviewModal
          dailyChat={previewJournal.dailyChat}
          characters={characters}
          highlightMessageId={previewJournal.messageId}
          onClose={() => setPreviewJournal(null)}
          onPlayAudio={onPlayAudio}
          onTranslate={onTranslate}
        />
      )}

      <style>{`
        .vocabulary-memory-editor {
          display: flex;
          flex-direction: column;
          height: 100%;
          max-height: 100vh;
          background: #1a1a2e;
          border-radius: 12px;
          overflow: hidden;
        }

        /* Header */
        .editor-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: #16213e;
          border-bottom: 1px solid #0f3460;
          flex: 0 0 auto;
        }

        .editor-header h3 {
          margin: 0;
          color: #fff;
          font-size: 16px;
          white-space: nowrap;
        }

        .vocab-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 12px;
          background: rgba(233, 69, 96, 0.15);
          border-radius: 20px;
          border: 1px solid rgba(233, 69, 96, 0.3);
        }

        .vocab-badge .vocab-korean {
          color: #e94560;
          font-weight: 600;
          font-size: 14px;
        }

        .vocab-badge .vocab-vietnamese {
          color: #888;
          font-size: 12px;
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

        /* Main Layout - CRITICAL: must not grow beyond available space */
        .editor-main {
          flex: 1 1 0;
          display: flex;
          overflow: hidden;
          min-height: 0;
          max-height: calc(100% - 120px);
        }

        /* Desktop: Split Layout */
        .desktop .editor-main {
          flex-direction: row;
        }

        .desktop .editor-section {
          flex: 1 1 0;
          display: flex;
          flex-direction: column;
          min-width: 0;
          min-height: 0;
          border-right: 1px solid #0f3460;
          overflow: hidden;
        }

        .desktop .search-panel {
          width: 320px;
          flex: 0 0 320px;
          display: flex;
          flex-direction: column;
          background: #16213e;
          overflow: hidden;
        }

        /* Mobile: Full Width */
        .mobile .editor-main {
          flex-direction: column;
        }

        .mobile .editor-section {
          flex: 1 1 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-height: 0;
        }

        /* Editor Toolbar */
        .editor-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: #1e2a4a;
          border-bottom: 1px solid #0f3460;
          flex: 0 0 auto;
        }

        .toolbar-label {
          color: #aaa;
          font-size: 13px;
        }

        .toolbar-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .format-btn {
          background: #2a2a4a;
          color: #aaa;
          border: none;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
        }

        .format-btn:hover {
          background: #3a3a5a;
          color: #fff;
        }

        .format-btn[data-active="true"] {
          background: #667eea;
          color: #fff;
        }

        .mobile-search-btn {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
        }

        /* Editor Container - scrollable area */
        .editor-container {
          flex: 1 1 0;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 16px;
          background: #0f1629;
          position: relative;
          min-height: 0;
        }

        .editor-container.drop-target {
          background: rgba(102, 126, 234, 0.1);
        }

        .drop-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(102, 126, 234, 0.2);
          border: 2px dashed #667eea;
          border-radius: 8px;
          pointer-events: none;
        }

        .drop-overlay span {
          background: #667eea;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 500;
        }

        /* TipTap Editor */
        .tiptap-editor {
          min-height: 80px;
          outline: none;
          color: #fff;
          font-size: 15px;
          line-height: 1.7;
        }

        .tiptap-editor p {
          margin: 0 0 12px 0;
        }

        .tiptap-editor.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #555;
          pointer-events: none;
          height: 0;
        }

        /* Message Block in Editor */
        .message-node-wrapper {
          margin: 12px 0;
        }

        .message-block {
          background: linear-gradient(135deg, #1e2a4a 0%, #1a2744 100%);
          border: 1px solid #2a3a5a;
          border-left: 4px solid #667eea;
          border-radius: 10px;
          padding: 12px;
          cursor: grab;
        }

        .message-block:hover {
          border-color: #667eea;
          box-shadow: 0 4px 20px rgba(102, 126, 234, 0.2);
        }

        .message-block-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          flex-wrap: wrap;
        }

        .drag-handle {
          cursor: grab;
          color: #666;
          font-size: 14px;
          padding: 2px 4px;
          border-radius: 4px;
          user-select: none;
          letter-spacing: -2px;
        }

        .drag-handle:hover {
          background: rgba(102, 126, 234, 0.2);
          color: #a8b4ff;
        }

        .drag-handle:active {
          cursor: grabbing;
        }

        .message-node-wrapper[draggable="true"] {
          transition: opacity 0.2s;
        }

        .message-node-wrapper.ProseMirror-selectednode .message-block {
          outline: 2px solid #667eea;
          outline-offset: 2px;
        }

        .character-badge {
          background: rgba(102, 126, 234, 0.2);
          color: #a8b4ff;
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
        }

        .date-badge {
          color: #666;
          font-size: 10px;
        }

        .audio-btn {
          background: rgba(102, 126, 234, 0.2);
          border: none;
          cursor: pointer;
          padding: 3px 6px;
          font-size: 12px;
          border-radius: 4px;
        }

        .audio-btn:hover {
          background: rgba(102, 126, 234, 0.4);
        }

        .remove-message-btn {
          margin-left: auto;
          background: rgba(233, 69, 96, 0.1);
          border: none;
          color: #e94560;
          font-size: 12px;
          cursor: pointer;
          padding: 3px 6px;
          border-radius: 4px;
        }

        .remove-message-btn:hover {
          background: rgba(233, 69, 96, 0.3);
        }

        .message-block-text {
          color: #ddd;
          font-size: 13px;
          line-height: 1.5;
          padding: 8px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 6px;
        }

        .message-block.ProseMirror-selectednode {
          outline: 2px solid #667eea;
        }

        /* Image styles */
        .memory-image {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 8px 0;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .memory-image:hover {
          box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3);
        }

        .memory-image.ProseMirror-selectednode {
          outline: 3px solid #667eea;
          outline-offset: 2px;
        }

        .image-btn {
          font-size: 14px !important;
        }

        /* Editor Tips */
        .editor-tips {
          padding: 8px 12px;
          background: rgba(102, 126, 234, 0.08);
          color: #888;
          font-size: 11px;
          border-top: 1px solid #0f3460;
          flex: 0 0 auto;
        }

        /* Search Panel */
        .search-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          border-bottom: 1px solid #0f3460;
          flex: 0 0 auto;
        }

        .search-panel-header h4 {
          margin: 0;
          color: #fff;
          font-size: 14px;
        }

        .vocab-target {
          color: #e94560;
          font-size: 13px;
          font-weight: 500;
        }

        /* Search panel content - scrollable */
        .search-panel-content {
          flex: 1 1 0;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 12px;
          min-height: 0;
        }

        .ai-search-btn {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .ai-search-btn:disabled {
          opacity: 0.7;
        }

        .re-search-btn {
          width: 100%;
          padding: 8px;
          background: #2a2a4a;
          color: #aaa;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          margin-bottom: 12px;
        }

        .re-search-btn:hover {
          background: #3a3a5a;
          color: #fff;
        }

        .search-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px;
          color: #888;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .spinner.large {
          width: 32px;
          height: 32px;
          border-width: 3px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .search-error {
          padding: 12px;
          background: rgba(233, 69, 96, 0.1);
          color: #e94560;
          border-radius: 6px;
          font-size: 13px;
        }

        .search-results {
          margin-top: 12px;
        }

        .results-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: #4ade80;
          font-size: 13px;
          margin-bottom: 10px;
        }

        .drag-hint {
          color: #666;
          font-size: 11px;
        }

        .results-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .result-item {
          background: #1a1a2e;
          border-radius: 8px;
          padding: 10px;
          cursor: grab;
          border: 1px solid transparent;
          transition: all 0.2s;
        }

        .result-item:hover {
          border-color: #667eea;
          background: #1e2a4a;
        }

        .result-item.linked {
          opacity: 0.6;
          cursor: default;
        }

        .result-item.dragging {
          opacity: 0.5;
          transform: scale(0.98);
        }

        .result-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
          font-size: 11px;
          color: #888;
        }

        .audio-btn-small {
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px 4px;
          font-size: 12px;
          border-radius: 3px;
        }

        .audio-btn-small:hover {
          background: rgba(102, 126, 234, 0.3);
        }

        .result-text {
          color: #ccc;
          font-size: 13px;
          line-height: 1.4;
          margin-bottom: 8px;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .result-actions {
          display: flex;
          gap: 6px;
        }

        .view-journal-btn {
          flex: 1;
          padding: 6px;
          background: rgba(74, 222, 128, 0.15);
          color: #4ade80;
          border: 1px solid rgba(74, 222, 128, 0.3);
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .view-journal-btn:hover {
          background: rgba(74, 222, 128, 0.3);
        }

        .insert-result-btn {
          flex: 1;
          padding: 6px;
          background: rgba(102, 126, 234, 0.2);
          color: #a8b4ff;
          border: 1px solid rgba(102, 126, 234, 0.3);
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .insert-result-btn:hover {
          background: rgba(102, 126, 234, 0.4);
        }

        .linked-badge {
          display: block;
          text-align: center;
          color: #4ade80;
          font-size: 12px;
          padding: 6px;
        }

        .no-results {
          text-align: center;
          color: #666;
          padding: 24px;
          font-size: 13px;
        }

        /* Action Buttons - FIXED at bottom */
        .editor-actions {
          display: flex;
          gap: 12px;
          padding: 12px 16px;
          background: #16213e;
          border-top: 1px solid #0f3460;
          flex: 0 0 auto;
        }

        .cancel-btn {
          flex: 1;
          padding: 12px;
          background: #333;
          color: #fff;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
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
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }

        .save-btn:hover {
          opacity: 0.9;
        }

        /* Mobile Search Modal */
        .mobile-search-modal {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: flex-end;
        }

        .modal-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
        }

        .modal-content {
          position: relative;
          width: 100%;
          max-height: 80vh;
          background: #1a1a2e;
          border-radius: 16px 16px 0 0;
          display: flex;
          flex-direction: column;
          animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          border-bottom: 1px solid #0f3460;
        }

        .modal-header h4 {
          margin: 0;
          color: #fff;
          font-size: 16px;
        }

        .modal-close {
          background: none;
          border: none;
          color: #888;
          font-size: 20px;
          cursor: pointer;
        }

        .modal-content .search-panel-content {
          max-height: 60vh;
          overflow-y: auto;
        }

        /* ProseMirror */
        .ProseMirror {
          outline: none;
        }

        .ProseMirror ::selection {
          background: rgba(102, 126, 234, 0.4);
        }
      `}</style>
    </div>
  );
};

export default VocabularyMemoryEditor;
