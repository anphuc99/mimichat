import React, { useState, useRef, useEffect } from 'react';

interface RealtimeContextEditorProps {
  realtimeContext: string;
  onContextChange: (context: string) => void;
  isEditing: boolean;
  onEditingChange: (isEditing: boolean) => void;
  disabled?: boolean;
}

export const RealtimeContextEditor: React.FC<RealtimeContextEditorProps> = ({
  realtimeContext,
  onContextChange,
  isEditing,
  onEditingChange,
  disabled = false,
}) => {
  const [tempContext, setTempContext] = useState(realtimeContext);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    setTempContext(realtimeContext);
  }, [realtimeContext]);

  const handleSave = () => {
    onContextChange(tempContext);
    onEditingChange(false);
  };

  const handleCancel = () => {
    setTempContext(realtimeContext);
    onEditingChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (!isEditing) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg">
        <span className="text-amber-600 text-sm">📍</span>
        <div className="flex-1 min-w-0">
          {realtimeContext ? (
            <span className="text-sm text-amber-800 truncate block">{realtimeContext}</span>
          ) : (
            <span className="text-sm text-amber-500 italic">Chưa có ngữ cảnh realtime</span>
          )}
        </div>
        <button
          onClick={() => !disabled && onEditingChange(true)}
          disabled={disabled}
          className="px-2 py-1 text-xs bg-white border border-amber-300 rounded-md hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
          title="Chỉnh sửa ngữ cảnh realtime"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          Sửa
        </button>
        {realtimeContext && (
          <button
            onClick={() => !disabled && onContextChange('')}
            disabled={disabled}
            className="p-1 text-amber-400 hover:text-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Xóa ngữ cảnh"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-amber-600 text-sm">📍</span>
        <span className="text-sm font-medium text-amber-800">Ngữ cảnh realtime</span>
      </div>

      {/* Custom input */}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={tempContext}
          onChange={(e) => setTempContext(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nhập ngữ cảnh... (ví dụ: Đang đi mua sắm với bạn)"
          className="flex-1 px-3 py-2 text-sm border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
        />
        <button
          onClick={handleSave}
          className="px-3 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
        >
          ✓
        </button>
        <button
          onClick={handleCancel}
          className="px-3 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
        >
          ✕
        </button>
      </div>

      <p className="text-xs text-amber-600 italic">
        💡 Ngữ cảnh này sẽ được gửi kèm với tin nhắn để AI hiểu tình huống hiện tại của bạn.
      </p>
    </div>
  );
};

export default RealtimeContextEditor;
