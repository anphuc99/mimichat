import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { DailyChat, Message, Character } from '../types';
import { avatar as defaultAvatar } from './avatar';
import HTTPService from '../services/HTTPService';

interface JournalPreviewModalProps {
  dailyChat: DailyChat;
  characters: Character[];
  highlightMessageId?: string;
  onClose: () => void;
  onPlayAudio?: (audioData: string, characterName?: string) => void;
  onTranslate?: (text: string) => Promise<string>;
}

export const JournalPreviewModal: React.FC<JournalPreviewModalProps> = ({
  dailyChat,
  characters,
  highlightMessageId,
  onClose,
  onPlayAudio,
  onTranslate
}) => {
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [expandedTranslations, setExpandedTranslations] = useState<Set<string>>(new Set());
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto scroll to highlighted message
  useEffect(() => {
    if (highlightMessageId && highlightRef.current) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [highlightMessageId]);

  // Get character by name
  const getCharacter = useCallback((name: string): Character | undefined => {
    return characters.find(c => c.name === name);
  }, [characters]);

  // Get avatar URL
  const getAvatarUrl = useCallback((characterName?: string): string => {
    if (!characterName) return defaultAvatar;
    const char = getCharacter(characterName);
    if (char?.avatar) {
      // Handle relative URLs in dev mode
      if (char.avatar.startsWith('/')) {
        return HTTPService.getBaseUrl() + char.avatar;
      }
      return char.avatar;
    }
    return defaultAvatar;
  }, [getCharacter]);

  // Handle translate
  const handleTranslate = useCallback(async (message: Message) => {
    const msgId = message.id;
    
    // Toggle if already translated
    if (translations[msgId] || message.translation) {
      setExpandedTranslations(prev => {
        const newSet = new Set(prev);
        if (newSet.has(msgId)) {
          newSet.delete(msgId);
        } else {
          newSet.add(msgId);
        }
        return newSet;
      });
      return;
    }

    if (!onTranslate) return;

    setTranslatingId(msgId);
    setExpandedTranslations(prev => new Set(prev).add(msgId));
    
    try {
      const result = await onTranslate(message.text);
      setTranslations(prev => ({ ...prev, [msgId]: result }));
    } catch (error) {
      console.error('Translation failed:', error);
      setTranslations(prev => ({ ...prev, [msgId]: 'Lỗi dịch' }));
    } finally {
      setTranslatingId(null);
    }
  }, [translations, onTranslate]);

  // Handle play audio
  const handlePlayAudio = useCallback((message: Message) => {
    if (message.audioData && onPlayAudio) {
      onPlayAudio(message.audioData, message.characterName);
    }
  }, [onPlayAudio]);

  // Show character info
  const handleShowCharacterInfo = useCallback((characterName: string) => {
    const char = getCharacter(characterName);
    if (char) {
      setSelectedCharacter(char);
    }
  }, [getCharacter]);

  return (
    <div className="journal-preview-modal">
      <div className="modal-backdrop" onClick={onClose} />
      
      <div className="modal-container">
        {/* Header */}
        <div className="modal-header">
          <div className="header-info">
            <h3>📅 {dailyChat.date}</h3>
            <span className="message-count">{dailyChat.messages.length} tin nhắn</span>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Summary if available */}
        {dailyChat.summary && (
          <div className="daily-summary">
            <span className="summary-label">📝 Tóm tắt:</span>
            <span className="summary-text">{dailyChat.summary}</span>
          </div>
        )}

        {/* Messages */}
        <div className="messages-container" ref={containerRef}>
          {dailyChat.messages.map((message, index) => {
            const isUser = message.sender === 'user';
            const isHighlighted = message.id === highlightMessageId;
            const avatarUrl = isUser ? defaultAvatar : getAvatarUrl(message.characterName);
            const translation = translations[message.id] || message.translation;
            const isExpanded = expandedTranslations.has(message.id);
            const isTranslating = translatingId === message.id;

            return (
              <div
                key={message.id}
                ref={isHighlighted ? highlightRef : undefined}
                className={`message-row ${isUser ? 'user' : 'bot'} ${isHighlighted ? 'highlighted' : ''}`}
              >
                {/* Avatar */}
                {!isUser && (
                  <div 
                    className="avatar-container"
                    onClick={() => message.characterName && handleShowCharacterInfo(message.characterName)}
                    title={`Xem thông tin ${message.characterName}`}
                  >
                    <img src={avatarUrl} alt={message.characterName || 'Bot'} className="avatar" />
                    <span className="character-name">{message.characterName}</span>
                  </div>
                )}

                {/* Message bubble */}
                <div className={`message-bubble ${isUser ? 'user-bubble' : 'bot-bubble'}`}>
                  {/* Image if exists */}
                  {message.imageUrl && (
                    <img 
                      src={message.imageUrl.startsWith('/') ? HTTPService.getBaseUrl() + message.imageUrl : message.imageUrl} 
                      alt="Message" 
                      className="message-image"
                    />
                  )}
                  
                  {/* Text */}
                  <div className="message-text">{message.text}</div>

                  {/* Translation */}
                  {isExpanded && (
                    <div className="translation-box">
                      {isTranslating ? (
                        <span className="translating">Đang dịch...</span>
                      ) : (
                        <span className="translation-text">{translation}</span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="message-actions">
                    {/* Translate button */}
                    <button 
                      className={`action-btn ${isExpanded ? 'active' : ''}`}
                      onClick={() => handleTranslate(message)}
                      title="Dịch"
                    >
                      🌐
                    </button>

                    {/* Audio button */}
                    {message.audioData && (
                      <button 
                        className="action-btn"
                        onClick={() => handlePlayAudio(message)}
                        title="Nghe"
                      >
                        🔊
                      </button>
                    )}
                  </div>
                </div>

                {/* User avatar */}
                {isUser && (
                  <div className="avatar-container user-avatar">
                    <img src={defaultAvatar} alt="User" className="avatar" />
                    <span className="character-name">Bạn</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Character Info Modal */}
      {selectedCharacter && (
        <div className="character-info-modal">
          <div className="character-info-backdrop" onClick={() => setSelectedCharacter(null)} />
          <div className="character-info-content">
            <div className="character-info-header">
              <img 
                src={selectedCharacter.avatar ? 
                  (selectedCharacter.avatar.startsWith('/') ? HTTPService.getBaseUrl() + selectedCharacter.avatar : selectedCharacter.avatar)
                  : defaultAvatar
                } 
                alt={selectedCharacter.name} 
                className="character-avatar-large"
              />
              <div className="character-info-name">
                <h4>{selectedCharacter.name}</h4>
                <span className="gender">{selectedCharacter.gender === 'female' ? '👩' : '👨'}</span>
              </div>
              <button className="close-info-btn" onClick={() => setSelectedCharacter(null)}>✕</button>
            </div>

            <div className="character-info-body">
              <div className="info-section">
                <label>🎭 Tính cách:</label>
                <p>{selectedCharacter.personality}</p>
              </div>

              {selectedCharacter.appearance && (
                <div className="info-section">
                  <label>👗 Ngoại hình:</label>
                  <p>{selectedCharacter.appearance}</p>
                </div>
              )}

              {selectedCharacter.userOpinion && selectedCharacter.userOpinion.opinion && (
                <div className="info-section">
                  <label>💭 Suy nghĩ về bạn:</label>
                  <p className={`opinion ${selectedCharacter.userOpinion.sentiment || 'neutral'}`}>
                    {selectedCharacter.userOpinion.opinion}
                  </p>
                  {selectedCharacter.userOpinion.closeness !== undefined && (
                    <div className="closeness-bar">
                      <span>Độ thân thiết:</span>
                      <div className="bar-container">
                        <div 
                          className="bar-fill" 
                          style={{ width: `${Math.min(100, Math.max(0, selectedCharacter.userOpinion.closeness))}%` }}
                        />
                      </div>
                      <span>{selectedCharacter.userOpinion.closeness}%</span>
                    </div>
                  )}
                </div>
              )}

              {selectedCharacter.voiceName && (
                <div className="info-section">
                  <label>🎤 Giọng nói:</label>
                  <p>{selectedCharacter.voiceName}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .journal-preview-modal {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .modal-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
        }

        .modal-container {
          position: relative;
          width: 90%;
          max-width: 600px;
          max-height: 85vh;
          background: #1a1a2e;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: #16213e;
          border-bottom: 1px solid #0f3460;
        }

        .header-info h3 {
          margin: 0;
          color: #fff;
          font-size: 16px;
        }

        .message-count {
          color: #888;
          font-size: 12px;
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

        .daily-summary {
          padding: 12px 20px;
          background: rgba(102, 126, 234, 0.1);
          border-bottom: 1px solid #0f3460;
        }

        .summary-label {
          color: #667eea;
          font-size: 12px;
          font-weight: 600;
        }

        .summary-text {
          color: #aaa;
          font-size: 13px;
          margin-left: 8px;
        }

        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .message-row {
          display: flex;
          gap: 10px;
          align-items: flex-start;
        }

        .message-row.user {
          flex-direction: row-reverse;
        }

        .message-row.highlighted {
          animation: highlightPulse 2s ease-out;
        }

        @keyframes highlightPulse {
          0%, 100% { background: transparent; }
          20%, 80% { background: rgba(102, 126, 234, 0.2); border-radius: 12px; }
        }

        .avatar-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          transition: transform 0.2s;
        }

        .avatar-container:hover {
          transform: scale(1.05);
        }

        .avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid #0f3460;
        }

        .character-name {
          color: #888;
          font-size: 10px;
          max-width: 60px;
          text-align: center;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .message-bubble {
          max-width: 70%;
          padding: 12px 16px;
          border-radius: 16px;
          position: relative;
        }

        .bot-bubble {
          background: #16213e;
          border: 1px solid #0f3460;
          border-radius: 16px 16px 16px 4px;
        }

        .user-bubble {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 16px 16px 4px 16px;
        }

        .message-image {
          max-width: 100%;
          border-radius: 8px;
          margin-bottom: 8px;
        }

        .message-text {
          color: #eee;
          font-size: 14px;
          line-height: 1.5;
          word-break: break-word;
        }

        .translation-box {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(255,255,255,0.1);
        }

        .translating {
          color: #888;
          font-style: italic;
          font-size: 13px;
        }

        .translation-text {
          color: #a8b4ff;
          font-size: 13px;
        }

        .message-actions {
          display: flex;
          gap: 4px;
          margin-top: 8px;
        }

        .action-btn {
          background: rgba(255,255,255,0.1);
          border: none;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .action-btn:hover {
          background: rgba(255,255,255,0.2);
        }

        .action-btn.active {
          background: rgba(102, 126, 234, 0.3);
        }

        /* Character Info Modal */
        .character-info-modal {
          position: fixed;
          inset: 0;
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .character-info-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
        }

        .character-info-content {
          position: relative;
          width: 90%;
          max-width: 400px;
          background: #1e2a4a;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        }

        .character-info-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: #16213e;
          border-bottom: 1px solid #0f3460;
        }

        .character-avatar-large {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          object-fit: cover;
          border: 3px solid #667eea;
        }

        .character-info-name {
          flex: 1;
        }

        .character-info-name h4 {
          margin: 0;
          color: #fff;
          font-size: 18px;
        }

        .gender {
          font-size: 16px;
        }

        .close-info-btn {
          background: none;
          border: none;
          color: #888;
          font-size: 18px;
          cursor: pointer;
        }

        .character-info-body {
          padding: 16px;
          max-height: 300px;
          overflow-y: auto;
        }

        .info-section {
          margin-bottom: 16px;
        }

        .info-section:last-child {
          margin-bottom: 0;
        }

        .info-section label {
          display: block;
          color: #667eea;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 6px;
        }

        .info-section p {
          margin: 0;
          color: #ccc;
          font-size: 13px;
          line-height: 1.5;
        }

        .opinion.positive {
          color: #4ade80;
        }

        .opinion.negative {
          color: #f87171;
        }

        .closeness-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
          font-size: 12px;
          color: #888;
        }

        .bar-container {
          flex: 1;
          height: 8px;
          background: #0f3460;
          border-radius: 4px;
          overflow: hidden;
        }

        .bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #667eea, #e94560);
          border-radius: 4px;
          transition: width 0.3s;
        }
      `}</style>
    </div>
  );
};

export default JournalPreviewModal;
