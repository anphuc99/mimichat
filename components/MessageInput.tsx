import React, { useState, useRef, useCallback, useEffect } from 'react';

interface MessageInputProps {
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  onSummarize: () => void;
  suggestions?: string[];
  onGenerateSuggestions?: () => void;
  isGeneratingSuggestions?: boolean;
  onSendAudio?: (audioBase64: string, duration: number) => void;
  // Optional footer content to render below the input bar
  footerChildren?: React.ReactNode;
}

const EMOJIS = ['😊', '😂', '❤️', '👍', '😢', '😠', '🎉', '🤔', '👋', '🎨', '⚽', '🍰'];

// Helper function to convert audio blob to WAV format
const blobToWavBase64 = async (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const arrayBuffer = reader.result as ArrayBuffer;
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Convert to WAV
        const wavBuffer = audioBufferToWav(audioBuffer);
        const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
        
        // Convert to base64
        const wavReader = new FileReader();
        wavReader.onloadend = () => {
          const base64 = wavReader.result as string;
          // Remove data:audio/wav;base64, prefix
          const base64Data = base64.split(',')[1];
          resolve(base64Data);
        };
        wavReader.onerror = reject;
        wavReader.readAsDataURL(wavBlob);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
};

// Convert AudioBuffer to WAV ArrayBuffer
const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
  const numOfChan = 1; // Mono
  const sampleRate = 16000; // 16kHz for better compatibility
  
  // Resample to target sample rate
  const offlineContext = new OfflineAudioContext(numOfChan, buffer.duration * sampleRate, sampleRate);
  const source = offlineContext.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineContext.destination);
  source.start();
  
  // For simplicity, we'll use the original buffer data
  // In production, you'd want to properly resample
  const length = buffer.length * numOfChan * 2;
  const arrayBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(arrayBuffer);
  
  // Write WAV header
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numOfChan, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numOfChan * 2, true);
  view.setUint16(32, numOfChan * 2, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, length, true);
  
  // Write audio data
  const channelData = buffer.getChannelData(0);
  let offset = 44;
  for (let i = 0; i < channelData.length; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }
  
  return arrayBuffer;
};

export const MessageInput: React.FC<MessageInputProps> = ({ 
  onSendMessage, 
  isLoading, 
  onSummarize,
  suggestions = [],
  onGenerateSuggestions,
  isGeneratingSuggestions = false,
  onSendAudio,
  footerChildren
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  // Voice recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      recordingStartTimeRef.current = Date.now();
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        
        if (audioChunksRef.current.length > 0 && onSendAudio) {
          const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
          const duration = (Date.now() - recordingStartTimeRef.current) / 1000;
          
          try {
            const wavBase64 = await blobToWavBase64(audioBlob);
            onSendAudio(wavBase64, duration);
          } catch (error) {
            console.error('Failed to convert audio to WAV:', error);
            alert('Không thể xử lý audio. Vui lòng thử lại.');
          }
        }
        
        setIsRecording(false);
        setRecordingDuration(0);
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
          recordingIntervalRef.current = null;
        }
      };
      
      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      
      // Update duration every second
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));
      }, 1000);
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Cần quyền truy cập microphone để ghi âm. Vui lòng cho phép trong cài đặt trình duyệt.');
    }
  }, [onSendAudio]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      audioChunksRef.current = []; // Clear chunks so nothing is sent
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    }
    setIsRecording(false);
    setRecordingDuration(0);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  }, []);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSendMessage(inputValue);
      setInputValue('');
      setShowEmojiPicker(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onSendMessage(suggestion);
  };

  const handleEmojiClick = (emoji: string) => {
    setInputValue(prev => prev + emoji);
  };

  const handleLike = () => {
    onSendMessage('👍');
  }

  return (
    <div className="p-4 bg-white border-t border-gray-200 sticky bottom-0">
      {suggestions.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => handleSuggestionClick(suggestion)}
              disabled={isLoading}
              className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
       {showEmojiPicker && (
        <div className="grid grid-cols-6 gap-2 p-2 mb-2 bg-gray-100 rounded-lg">
          {EMOJIS.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleEmojiClick(emoji)}
              className="text-2xl rounded-lg hover:bg-gray-200 p-1 transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex items-center space-x-3">
        <button
            type="button"
            onClick={onSummarize}
            className="flex-shrink-0 text-gray-500 hover:text-blue-600 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
            disabled={isLoading}
            aria-label="Kết thúc ngày & Tóm tắt"
            title="Kết thúc ngày & Tóm tắt"
          >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        </button>
        {onGenerateSuggestions && (
          <button
            type="button"
            onClick={onGenerateSuggestions}
            disabled={isLoading || isGeneratingSuggestions}
            className="flex-shrink-0 text-gray-500 hover:text-purple-600 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
            aria-label="Gợi ý tin nhắn"
            title="Gợi ý tin nhắn"
          >
            {isGeneratingSuggestions ? (
              <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            )}
          </button>
        )}
        <div className="flex-1 w-full relative">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Aa"
            className="w-full pl-4 pr-10 py-2 bg-gray-100 border border-transparent rounded-full focus:outline-none focus:ring-2 focus:ring-blue-400"
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label="Chọn biểu tượng cảm xúc"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 100-2 1 1 0 000 2zm7-1a1 1 0 11-2 0 1 1 0 012 0zm-.464 5.535a.75.75 0 01.083-1.059 5.005 5.005 0 00-6.238 0 .75.75 0 01-1.141.975 6.505 6.505 0 018.103 0 .75.75 0 01-.807.084z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        
        {/* Recording UI */}
        {isRecording ? (
          <div className="flex items-center space-x-2">
            <span className="text-red-500 animate-pulse">●</span>
            <span className="text-sm font-medium text-gray-700 min-w-[40px]">
              {formatDuration(recordingDuration)}
            </span>
            <button
              type="button"
              onClick={cancelRecording}
              className="flex-shrink-0 text-gray-500 hover:text-red-600 transition-colors"
              aria-label="Huỷ ghi âm"
              title="Huỷ ghi âm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <button
              type="button"
              onClick={stopRecording}
              className="flex-shrink-0 text-blue-500 hover:text-blue-600 transition-colors"
              aria-label="Gửi tin nhắn giọng nói"
              title="Gửi tin nhắn giọng nói"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
        ) : inputValue ? (
          <button
            type="submit"
            className="flex-shrink-0 text-blue-500 hover:text-blue-600 disabled:text-gray-300 disabled:cursor-not-allowed"
            disabled={isLoading}
            aria-label="Send message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        ) : (
          <div className="flex items-center space-x-2">
            {onSendAudio && (
              <button
                type="button"
                onClick={startRecording}
                className="flex-shrink-0 text-gray-500 hover:text-red-500 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                disabled={isLoading}
                aria-label="Ghi âm"
                title="Nhấn để ghi âm (tiếng Hàn)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={handleLike}
              className="flex-shrink-0 text-blue-500 hover:text-blue-600 disabled:text-gray-300 disabled:cursor-not-allowed"
              disabled={isLoading}
              aria-label="Send like"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21.3 8.29C20.42 7.42 19.26 7 18 7h-3.42c.33-.89.51-1.85.51-2.85 0-1.28-.48-2.4-1.28-3.21-.8-.8-1.92-1.28-3.21-1.28-1.54 0-2.85.83-3.53 2.08L6 6.32V19h11.23c.91 0 1.7-.55 2.05-1.38l2.6-6.5c.34-.85.16-1.82-.48-2.83zM4 19h2V7H4v12z"/>
              </svg>
            </button>
          </div>
        )}
      </form>
      {footerChildren && (
        <div className="mt-3">
          {footerChildren}
        </div>
      )}
    </div>
  );
};