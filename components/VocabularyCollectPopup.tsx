import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { Node, mergeAttributes } from '@tiptap/core';
import type { Message, Character } from '../types';
import { translateWord } from '../services/geminiService';
import HTTPService from '../services/HTTPService';

interface VocabularyCollectPopupProps {
  isOpen: boolean;
  selectedText: string;
  message: Message;
  dailyChatId: string;
  dailyChatDate: string;
  characters: Character[];
  onCollect: (korean: string, vietnamese: string, memory: string, linkedMessageIds: string[]) => Promise<void>;
  onCancel: () => void;
  onPlayAudio?: (audioData: string, characterName?: string) => void;
}

// Message Block Component for TipTap
const MessageBlockComponent = ({ node, deleteNode, extension }: any) => {
  const { messageId, text, characterName, date, audioData } = node.attrs;
  const onPlayAudio = extension.options.onPlayAudio;

  return (
    <NodeViewWrapper className="message-node-wrapper" data-type="message-block" draggable="true" data-drag-handle>
      <div className="message-block" contentEditable={false}>
        <div className="message-block-header">
          <span className="character-name">{characterName}</span>
          <span className="message-date">{date}</span>
          {audioData && onPlayAudio && (
            <button
              type="button"
              className="audio-btn"
              onClick={() => onPlayAudio(audioData, characterName)}
              title="Phát âm thanh"
            >
              🔊
            </button>
          )}
          <button
            type="button"
            className="delete-btn"
            onClick={deleteNode}
            title="Xóa"
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

export const VocabularyCollectPopup: React.FC<VocabularyCollectPopupProps> = ({
  isOpen,
  selectedText,
  message,
  dailyChatId,
  dailyChatDate,
  characters,
  onCollect,
  onCancel,
  onPlayAudio
}) => {
  const [korean, setKorean] = useState(selectedText);
  const [vietnamese, setVietnamese] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isCollecting, setIsCollecting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when popup opens
  useEffect(() => {
    if (isOpen) {
      setKorean(selectedText);
      setVietnamese('');
      setIsTranslating(false);
      setIsCollecting(false);
    }
  }, [isOpen, selectedText]);

  // Create message block extension with audio callback
  const MessageBlockExtension = useMemo(
    () => createMessageBlockExtension(onPlayAudio),
    [onPlayAudio]
  );

  // Initial content with the selected message pre-inserted
  const initialContent = useMemo(() => {
    const characterName = message.sender === 'user' ? 'User' : (message.characterName || 'Bot');
    return {
      type: 'doc',
      content: [
        {
          type: 'messageBlock',
          attrs: {
            messageId: message.id,
            text: message.text,
            characterName: characterName,
            dailyChatId: dailyChatId,
            date: dailyChatDate,
            audioData: message.audioData || null
          }
        },
        { type: 'paragraph' }
      ]
    };
  }, [message, dailyChatId, dailyChatDate]);

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
  }, [initialContent, MessageBlockExtension]);

  // Handle AI translation
  const handleTranslate = useCallback(async () => {
    if (!korean.trim() || isTranslating) return;
    
    setIsTranslating(true);
    try {
      const result = await translateWord(korean.trim());
      if (result) {
        setVietnamese(result);
      }
    } catch (error) {
      console.error('Translation error:', error);
      alert('Không thể dịch từ này.');
    } finally {
      setIsTranslating(false);
    }
  }, [korean, isTranslating]);

  // Handle image upload
  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn file ảnh.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Ảnh quá lớn. Vui lòng chọn ảnh dưới 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      
      try {
        const response = await HTTPService.post('/api/upload-memory-image', { image: base64 });
        
        if (response.ok && response.data?.success && response.data?.url) {
          editor.chain().focus().setImage({ src: response.data.url }).run();
        } else {
          alert('Lỗi khi tải ảnh lên server.');
        }
      } catch (error) {
        console.error('Upload image error:', error);
        alert('Lỗi khi tải ảnh lên server.');
      }
    };
    reader.readAsDataURL(file);

    e.target.value = '';
  }, [editor]);

  // Handle collect
  const handleCollect = useCallback(async () => {
    if (!korean.trim()) {
      alert('Vui lòng nhập từ tiếng Hàn.');
      return;
    }
    if (!vietnamese.trim()) {
      alert('Vui lòng nhập nghĩa tiếng Việt.');
      return;
    }
    if (!editor) return;

    setIsCollecting(true);
    try {
      const json = editor.getJSON();
      const { text: memoryText, messageIds } = serializeTipTapContent(json);
      
      await onCollect(korean.trim(), vietnamese.trim(), memoryText, messageIds);
    } catch (error) {
      console.error('Collect error:', error);
      alert('Có lỗi xảy ra khi thu thập từ vựng.');
    } finally {
      setIsCollecting(false);
    }
  }, [korean, vietnamese, editor, onCollect]);

  if (!isOpen) return null;

  return (
    <div className="vocab-collect-overlay">
      <div className="vocab-collect-popup" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="popup-header">
          <h3>📚 Thu thập từ vựng</h3>
          <button className="close-btn" onClick={onCancel}>✕</button>
        </div>

        {/* Content */}
        <div className="popup-content">
          {/* Korean input */}
          <div className="input-group">
            <label>Từ tiếng Hàn</label>
            <input
              type="text"
              value={korean}
              onChange={e => setKorean(e.target.value)}
              placeholder="Nhập từ tiếng Hàn..."
              className="vocab-input"
            />
          </div>

          {/* Vietnamese input with AI button */}
          <div className="input-group">
            <label>Nghĩa tiếng Việt</label>
            <div className="input-with-ai">
              <input
                type="text"
                value={vietnamese}
                onChange={e => setVietnamese(e.target.value)}
                placeholder="Nhập nghĩa tiếng Việt..."
                className="vocab-input"
              />
              <button
                type="button"
                className="ai-btn"
                onClick={handleTranslate}
                disabled={isTranslating || !korean.trim()}
                title="Dịch bằng AI"
              >
                {isTranslating ? (
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  '🤖 AI'
                )}
              </button>
            </div>
          </div>

          {/* Memory editor */}
          <div className="input-group">
            <label>Ký ức (tùy chọn)</label>
            <div className="editor-toolbar">
              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleBold().run()}
                className={`toolbar-btn ${editor?.isActive('bold') ? 'active' : ''}`}
                title="In đậm"
              >
                <strong>B</strong>
              </button>
              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleItalic().run()}
                className={`toolbar-btn ${editor?.isActive('italic') ? 'active' : ''}`}
                title="In nghiêng"
              >
                <em>I</em>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="toolbar-btn"
                title="Thêm ảnh"
              >
                🖼️
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: 'none' }}
              />
            </div>
            <div className="editor-container">
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="popup-actions">
          <button className="cancel-btn" onClick={onCancel} disabled={isCollecting}>
            Hủy
          </button>
          <button 
            className="collect-btn" 
            onClick={handleCollect}
            disabled={isCollecting || !korean.trim() || !vietnamese.trim()}
          >
            {isCollecting ? (
              <>
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Đang thu thập...
              </>
            ) : (
              <>📥 Thu thập</>
            )}
          </button>
        </div>

        <style>{`
          .vocab-collect-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 16px;
          }

          .vocab-collect-popup {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            width: 100%;
            max-width: 500px;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }

          .popup-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 20px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
          }

          .popup-header h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
          }

          .popup-header .close-btn {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
          }

          .popup-header .close-btn:hover {
            background: rgba(255, 255, 255, 0.3);
          }

          .popup-content {
            padding: 20px;
            overflow-y: auto;
            flex: 1;
          }

          .input-group {
            margin-bottom: 16px;
          }

          .input-group label {
            display: block;
            font-size: 14px;
            font-weight: 600;
            color: #374151;
            margin-bottom: 6px;
          }

          .vocab-input {
            width: 100%;
            padding: 10px 14px;
            border: 2px solid #e5e7eb;
            border-radius: 10px;
            font-size: 15px;
            transition: border-color 0.2s;
            box-sizing: border-box;
          }

          .vocab-input:focus {
            outline: none;
            border-color: #10b981;
          }

          .input-with-ai {
            display: flex;
            gap: 8px;
          }

          .input-with-ai .vocab-input {
            flex: 1;
          }

          .ai-btn {
            padding: 10px 16px;
            background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
            color: white;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: opacity 0.2s, transform 0.2s;
            white-space: nowrap;
          }

          .ai-btn:hover:not(:disabled) {
            transform: translateY(-1px);
          }

          .ai-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .editor-toolbar {
            display: flex;
            gap: 4px;
            margin-bottom: 8px;
            padding: 6px;
            background: #f3f4f6;
            border-radius: 8px;
          }

          .toolbar-btn {
            padding: 6px 10px;
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
          }

          .toolbar-btn:hover {
            background: #f9fafb;
            border-color: #d1d5db;
          }

          .toolbar-btn.active {
            background: #10b981;
            color: white;
            border-color: #10b981;
          }

          .editor-container {
            border: 2px solid #e5e7eb;
            border-radius: 10px;
            min-height: 150px;
            max-height: 250px;
            overflow-y: auto;
          }

          .editor-container .tiptap-editor {
            padding: 12px;
            min-height: 130px;
            outline: none;
          }

          .editor-container .tiptap-editor p {
            margin: 0 0 8px 0;
          }

          .editor-container .tiptap-editor p:last-child {
            margin-bottom: 0;
          }

          .editor-container .is-editor-empty:first-child::before {
            content: attr(data-placeholder);
            color: #9ca3af;
            float: left;
            height: 0;
            pointer-events: none;
          }

          /* Message Block Styles */
          .message-node-wrapper {
            margin: 8px 0;
          }

          .message-block {
            background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
            border: 1px solid #86efac;
            border-radius: 10px;
            padding: 10px 12px;
            cursor: grab;
          }

          .message-block:active {
            cursor: grabbing;
          }

          .message-block-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
            font-size: 12px;
          }

          .message-block-header .character-name {
            font-weight: 600;
            color: #059669;
          }

          .message-block-header .message-date {
            color: #6b7280;
          }

          .message-block-header .audio-btn,
          .message-block-header .delete-btn {
            margin-left: auto;
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 12px;
            transition: background 0.2s;
          }

          .message-block-header .audio-btn:hover {
            background: rgba(16, 185, 129, 0.2);
          }

          .message-block-header .delete-btn {
            margin-left: 0;
            color: #ef4444;
          }

          .message-block-header .delete-btn:hover {
            background: rgba(239, 68, 68, 0.1);
          }

          .message-block-text {
            font-size: 14px;
            color: #374151;
            line-height: 1.5;
            white-space: pre-wrap;
          }

          /* Memory Image */
          .memory-image {
            max-width: 100%;
            border-radius: 8px;
            margin: 8px 0;
          }

          .popup-actions {
            display: flex;
            gap: 12px;
            padding: 16px 20px;
            background: #f9fafb;
            border-top: 1px solid #e5e7eb;
          }

          .cancel-btn {
            flex: 1;
            padding: 12px 20px;
            background: #f3f4f6;
            color: #374151;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-size: 15px;
            font-weight: 600;
            transition: background 0.2s;
          }

          .cancel-btn:hover:not(:disabled) {
            background: #e5e7eb;
          }

          .cancel-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .collect-btn {
            flex: 1;
            padding: 12px 20px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-size: 15px;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: opacity 0.2s, transform 0.2s;
          }

          .collect-btn:hover:not(:disabled) {
            transform: translateY(-1px);
          }

          .collect-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          @media (max-width: 480px) {
            .vocab-collect-popup {
              max-height: 95vh;
              border-radius: 12px;
            }

            .popup-content {
              padding: 16px;
            }

            .input-with-ai {
              flex-direction: column;
            }

            .ai-btn {
              justify-content: center;
            }
          }
        `}</style>
      </div>
    </div>
  );
};

export default VocabularyCollectPopup;
