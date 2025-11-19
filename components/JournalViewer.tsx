
import React, { useState } from 'react';
import type { ChatJournal, DailyChat } from '../types';
import { MessageBubble } from './MessageBubble';

interface DailyEntryProps {
  dailyChat: DailyChat;
  onReplayAudio: (audioData: string, characterName?: string) => void;
  isGeneratingThoughts: string | null;
  onGenerateThoughts: (id: string) => void;
}

const DailyEntry: React.FC<DailyEntryProps> = ({ dailyChat, onReplayAudio, isGeneratingThoughts, onGenerateThoughts }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const formattedDate = new Date(dailyChat.date).toLocaleDateString('vi-VN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
      <div className="cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <p className="font-semibold text-gray-600">{formattedDate}</p>
        <p className="text-gray-800 mt-2 italic">"{dailyChat.summary}"</p>
        <div className="text-right text-sm text-blue-500 mt-2">
          {isExpanded ? 'Thu gọn' : 'Xem chi tiết...'} ({dailyChat.messages.length} tin nhắn)
        </div>
      </div>
      {isExpanded && (
        <>
          <div className="mt-4 pt-4 border-t border-gray-200 space-y-4 max-h-96 overflow-y-auto pr-2">
            {dailyChat.messages.map(message => (
              <div key={message.id}>
                   <MessageBubble 
                      message={message} 
                      onReplayAudio={onReplayAudio} 
                      onGenerateAudio={async () => {}} 
                      onTranslate={async () => ""}
                      onStoreTranslation={() => {}}
                      onRetry={() => {}}
                      isJournalView={true}
                  />
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    if (!dailyChat.characterThoughts) {
                        onGenerateThoughts(dailyChat.id);
                    }
                }}
                className="w-full px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors disabled:bg-indigo-300 disabled:cursor-wait"
                disabled={isGeneratingThoughts === dailyChat.id}
            >
                {isGeneratingThoughts === dailyChat.id
                    ? 'Đang tạo nhật ký...'
                    : dailyChat.characterThoughts
                        ? 'Nhật ký của nhân vật:'
                        : 'Xem nhân vật nghĩ gì'}
            </button>

            {isGeneratingThoughts === dailyChat.id && (
                 <div className="text-center p-4">
                    <svg className="animate-spin h-6 w-6 text-indigo-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-sm text-gray-500 mt-2">Mimi và các bạn đang suy nghĩ... Vui lòng chờ một lát.</p>
                </div>
            )}
            
            {dailyChat.characterThoughts && (
              <div className="mt-4 space-y-3">
                {dailyChat.characterThoughts.map((thought, index) => (
                  <div key={index} className="p-3 bg-indigo-50 rounded-md border border-indigo-200">
                    <div className="flex items-center space-x-2">
                      <p className="font-medium text-sm text-indigo-800">{thought.characterName}:</p>
                      {thought.audioData && (
                        <button 
                            onClick={() => onReplayAudio(thought.audioData, thought.characterName)} 
                            className="text-indigo-500 hover:text-indigo-700"
                            title="Nghe suy nghĩ"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 italic mt-1">"{thought.text}"</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

interface JournalViewerProps {
  journal: ChatJournal;
  onReplayAudio: (audioData: string, characterName?: string) => void;
  onBackToChat: () => void;
  isGeneratingThoughts: string | null;
  onGenerateThoughts: (id: string) => void;
  relationshipSummary: string;
  onUpdateRelationshipSummary: (newSummary: string) => void;
}

export const JournalViewer: React.FC<JournalViewerProps> = ({ 
    journal, 
    onReplayAudio, 
    onBackToChat, 
    isGeneratingThoughts, 
    onGenerateThoughts,
    relationshipSummary,
    onUpdateRelationshipSummary
}) => {
    const [isViewingSummary, setIsViewingSummary] = useState(false);
    const [isEditingSummary, setIsEditingSummary] = useState(false);
    const [editedSummary, setEditedSummary] = useState(relationshipSummary);
    
    const summarizedEntries = journal.filter(entry => entry.summary && entry.messages.length > 0).reverse();

    const handleSaveSummary = () => {
        onUpdateRelationshipSummary(editedSummary);
        setIsEditingSummary(false);
    };

    const handleCancelEdit = () => {
        setEditedSummary(relationshipSummary);
        setIsEditingSummary(false);
    };

    return (
        <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-700">Nhật ký trò chuyện</h2>
                <button 
                    onClick={onBackToChat} 
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                    Quay lại trò chuyện
                </button>
            </div>

            {/* Relationship Summary Section */}
            <div className="mb-6 bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-lg border border-purple-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-purple-800 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                            <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                        </svg>
                        Tóm tắt bối cảnh chung
                    </h3>
                    <div className="flex space-x-2">
                        {!isEditingSummary && (
                            <>
                                <button
                                    onClick={() => setIsViewingSummary(!isViewingSummary)}
                                    className="px-3 py-1 text-sm bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors"
                                >
                                    {isViewingSummary ? 'Ẩn' : 'Xem'}
                                </button>
                                {relationshipSummary && (
                                    <button
                                        onClick={() => {
                                            setIsEditingSummary(true);
                                            setEditedSummary(relationshipSummary);
                                        }}
                                        className="px-3 py-1 text-sm bg-indigo-500 text-white rounded-md hover:bg-indigo-600 transition-colors"
                                    >
                                        Sửa
                                    </button>
                                )}
                            </>
                        )}
                        {isEditingSummary && (
                            <>
                                <button
                                    onClick={handleSaveSummary}
                                    className="px-3 py-1 text-sm bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
                                >
                                    Lưu
                                </button>
                                <button
                                    onClick={handleCancelEdit}
                                    className="px-3 py-1 text-sm bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
                                >
                                    Hủy
                                </button>
                            </>
                        )}
                    </div>
                </div>
                
                {isViewingSummary && !isEditingSummary && (
                    <div className="mt-3 p-3 bg-white rounded-md border border-purple-100">
                        {relationshipSummary ? (
                            <p className="text-gray-700 text-sm whitespace-pre-wrap">{relationshipSummary}</p>
                        ) : (
                            <p className="text-gray-400 text-sm italic">Chưa có tóm tắt. Nhấn "Kết thúc ngày" để tạo tóm tắt tự động.</p>
                        )}
                    </div>
                )}

                {isEditingSummary && (
                    <div className="mt-3">
                        <textarea
                            value={editedSummary}
                            onChange={(e) => setEditedSummary(e.target.value)}
                            className="w-full p-3 border border-purple-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-400 text-sm"
                            rows={5}
                            placeholder="Nhập tóm tắt bối cảnh chung..."
                        />
                    </div>
                )}
            </div>

            {summarizedEntries.length > 0 ? (
                <div className="space-y-4">
                    {summarizedEntries.map(dailyChat => (
                        <DailyEntry 
                            key={dailyChat.id} 
                            dailyChat={dailyChat}
                            onReplayAudio={onReplayAudio}
                            isGeneratingThoughts={isGeneratingThoughts}
                            onGenerateThoughts={onGenerateThoughts}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center text-gray-500 mt-10">
                    <p>Chưa có mục nhật ký nào được lưu.</p>
                    <p className="text-sm">Trò chuyện với Mimi và bấm "Kết thúc ngày" để tạo bản tóm tắt đầu tiên.</p>
                </div>
            )}
        </div>
    );
};