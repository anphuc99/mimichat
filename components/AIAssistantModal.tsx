import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Message, AIAssistantMessage, VocabularyWithStability } from '../types';
import { sendAssistantMessageStream, createAssistantChat } from '../services/geminiService';
import type { Chat } from '@google/genai';

interface AIAssistantModalProps {
  isOpen: boolean;
  onToggle: () => void;
  vocabularies: VocabularyWithStability[];
  getChatHistory: () => string; // Function to get full chat history for #read command
  currentLevel: string;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({
  isOpen,
  onToggle,
  vocabularies,
  getChatHistory,
  currentLevel,
}) => {
  const [messages, setMessages] = useState<AIAssistantMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [droppedMessage, setDroppedMessage] = useState<Message | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string>(''); // For streaming effect
  
  const chatRef = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Initialize chat session when modal opens
  useEffect(() => {
    if (isOpen && !chatRef.current) {
      initializeChat();
    }
  }, [isOpen, vocabularies]);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const initializeChat = async () => {
    try {
      chatRef.current = await createAssistantChat(vocabularies, currentLevel);
    } catch (error) {
      console.error('Failed to initialize AI Assistant chat:', error);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() && !droppedMessage) return;
    if (isLoading) return;

    let messageToSend = inputText.trim();
    let displayMessage = messageToSend;

    // Handle #read command - inject full chat history
    if (messageToSend.toLowerCase().includes('#read')) {
      const chatHistory = getChatHistory();
      messageToSend = messageToSend.replace(/#read/gi, '').trim();
      messageToSend = `[CHAT HISTORY START]\n${chatHistory}\n[CHAT HISTORY END]\n\n${messageToSend || 'Hãy đọc lịch sử chat và đưa ra hướng dẫn cho tôi.'}`;
      displayMessage = `#read ${displayMessage.replace(/#read/gi, '').trim() || '(Đọc lịch sử chat)'}`;
    }

    // Handle dropped message - request explanation
    if (droppedMessage) {
      const droppedText = droppedMessage.text;
      const droppedChar = droppedMessage.characterName || 'Unknown';
      messageToSend = `[DROPPED MESSAGE]\nCharacter: ${droppedChar}\nText: ${droppedText}\n[END DROPPED MESSAGE]\n\n${messageToSend || 'Hãy dịch và giải thích từ vựng, ngữ pháp, cách sử dụng của câu này.'}`;
      displayMessage = displayMessage || '(Giải thích câu được kéo vào)';
    }

    // Add user message to UI
    const userMessage: AIAssistantMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: displayMessage,
      droppedMessage: droppedMessage || undefined,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setDroppedMessage(null);
    setIsLoading(true);

    try {
      // Initialize chat if not exists
      if (!chatRef.current) {
        await initializeChat();
      }

      // Create placeholder for streaming message
      const assistantMessageId = (Date.now() + 1).toString();
      setStreamingContent('');

      // Stream the response
      const finalText = await sendAssistantMessageStream(
        chatRef.current!,
        messageToSend,
        (chunk, fullText) => {
          setStreamingContent(fullText);
        }
      );
      
      // After streaming completes, add the final message
      const assistantMessage: AIAssistantMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: finalText,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMessage]);
      setStreamingContent('');
    } catch (error) {
      console.error('AI Assistant error:', error);
      const errorMessage: AIAssistantMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại.',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
      setStreamingContent('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    try {
      const messageData = e.dataTransfer.getData('application/json');
      if (messageData) {
        const message: Message = JSON.parse(messageData);
        setDroppedMessage(message);
        inputRef.current?.focus();
      }
    } catch (error) {
      console.error('Failed to parse dropped message:', error);
    }
  }, []);

  const clearDroppedMessage = () => {
    setDroppedMessage(null);
  };

  const clearChat = () => {
    setMessages([]);
    chatRef.current = null;
    initializeChat();
  };

  // Floating button when closed
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-40 right-4 z-50 w-14 h-14 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center text-white hover:scale-110"
        title="AI Learning Assistant"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      </button>
    );
  }

  return (
    <div 
      className="fixed bottom-24 right-4 z-50 w-96 h-[500px] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-200"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="p-3 border-b bg-gradient-to-r from-purple-500 to-pink-500 text-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <h3 className="font-bold">AI Learning Assistant</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearChat}
            className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
            title="Xóa lịch sử chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
            title="Đóng"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-purple-500/20 z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-white p-4 rounded-xl shadow-lg text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-purple-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-purple-600 font-medium">Thả tin nhắn vào đây</p>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-sm mb-2">Chào bạn! Tôi là trợ lý học tiếng Hàn.</p>
            <div className="text-xs space-y-1 text-gray-400">
              <p>• Gõ <span className="bg-purple-100 text-purple-600 px-1 rounded">#read</span> để tôi đọc lịch sử chat</p>
              <p>• Kéo tin nhắn vào đây để tôi giải thích</p>
              <p>• Hỏi tôi cách viết câu trả lời tiếng Hàn</p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] p-3 rounded-xl ${
                msg.role === 'user'
                  ? 'bg-purple-500 text-white rounded-br-none'
                  : 'bg-gray-100 text-gray-800 rounded-bl-none'
              }`}
            >
              {/* Show dropped message preview */}
              {msg.droppedMessage && (
                <div className="mb-2 p-2 bg-white/20 rounded-lg text-xs">
                  <p className="opacity-75 mb-1">📌 Tin nhắn được kéo vào:</p>
                  <p className="font-medium">"{msg.droppedMessage.text}"</p>
                  {msg.droppedMessage.characterName && (
                    <p className="opacity-75 mt-1">- {msg.droppedMessage.characterName}</p>
                  )}
                </div>
              )}
              {msg.role === 'user' ? (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <div className="text-sm prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-strong:text-purple-700 prose-code:bg-purple-100 prose-code:text-purple-800 prose-code:px-1 prose-code:rounded">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming message */}
        {streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[85%] p-3 rounded-xl bg-gray-100 text-gray-800 rounded-bl-none">
              <div className="text-sm prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-strong:text-purple-700 prose-code:bg-purple-100 prose-code:text-purple-800 prose-code:px-1 prose-code:rounded">
                <ReactMarkdown>{streamingContent}</ReactMarkdown>
                <span className="inline-block w-2 h-4 bg-purple-500 animate-pulse ml-0.5"></span>
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator (only when not streaming) */}
        {isLoading && !streamingContent && (
          <div className="flex justify-start">
            <div className="bg-gray-100 p-3 rounded-xl rounded-bl-none">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Dropped message preview */}
      {droppedMessage && (
        <div className="mx-3 mb-2 p-2 bg-purple-50 border border-purple-200 rounded-lg flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-purple-600 font-medium mb-1">📌 Tin nhắn sẽ được giải thích:</p>
            <p className="text-sm text-gray-800 truncate">"{droppedMessage.text}"</p>
            {droppedMessage.characterName && (
              <p className="text-xs text-gray-500">- {droppedMessage.characterName}</p>
            )}
          </div>
          <button
            onClick={clearDroppedMessage}
            className="p-1 hover:bg-purple-200 rounded-full transition-colors flex-shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="p-3 border-t bg-gray-50">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={droppedMessage ? "Thêm câu hỏi (tùy chọn)..." : "Hỏi gì đó... (gõ #read để đọc lịch sử)"}
            className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            rows={2}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || (!inputText.trim() && !droppedMessage)}
            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIAssistantModal;
