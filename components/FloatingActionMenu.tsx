import React, { useState } from 'react';

interface FloatingActionMenuProps {
    onStartCollection?: () => void;
    onStartMemory?: () => void;
    onStartStarredReview?: () => void;
    onStartReview: () => void;
    starredCount?: number;
    reviewDueCount: number;
}

export const FloatingActionMenu: React.FC<FloatingActionMenuProps> = ({
    onStartCollection,
    onStartMemory,
    onStartStarredReview,
    onStartReview,
    starredCount,
    reviewDueCount,
}) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="fixed bottom-60 right-4 z-50 flex flex-col items-end gap-3 pointer-events-none">
            {/* Menu Items */}
            <div className={`flex flex-col gap-3 items-end transition-all duration-300 origin-bottom ${
                isOpen 
                    ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' 
                    : 'opacity-0 scale-90 translate-y-8 pointer-events-none h-0 overflow-hidden'
            }`}>
                 {onStartCollection && (
                    <button 
                        onClick={() => {
                            onStartCollection();
                            setIsOpen(false);
                        }}
                        className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-full shadow-lg hover:from-emerald-600 hover:to-teal-700 hover:scale-105 transition-all flex items-center space-x-2 whitespace-nowrap"
                        title="Thu thập từ vựng - Học từ mới từ kho từ vựng"
                    >
                        <span>📚</span>
                        <span className="font-medium">Thu thập</span>
                    </button>
                )}
                {onStartMemory && (
                    <button 
                        onClick={() => {
                            onStartMemory();
                            setIsOpen(false);
                        }}
                        className="px-4 py-2 bg-purple-500 text-white rounded-full shadow-lg hover:bg-purple-600 hover:scale-105 transition-all flex items-center space-x-2 whitespace-nowrap"
                        title="Ký ức từ vựng - Học & ôn tập với ký ức cá nhân"
                    >
                        <span>🧠</span>
                        <span className="font-medium">Ký ức</span>
                    </button>
                )}
                {onStartStarredReview && (
                    <button 
                        onClick={() => {
                            onStartStarredReview();
                            setIsOpen(false);
                        }}
                        className="relative px-4 py-2 bg-yellow-500 text-white rounded-full shadow-lg hover:bg-yellow-600 hover:scale-105 transition-all flex items-center space-x-2 whitespace-nowrap"
                        title="Học từ đã đánh dấu sao"
                    >
                        <span>⭐</span>
                        <span className="font-medium">Từ sao</span>
                        {starredCount !== undefined && starredCount > 0 && (
                            <span className="absolute -top-2 -right-2 bg-yellow-700 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center border-2 border-white">
                                {starredCount}
                            </span>
                        )}
                    </button>
                )}
                <button 
                    onClick={() => {
                        onStartReview();
                        setIsOpen(false);
                    }}
                    className="relative px-4 py-2 bg-orange-500 text-white rounded-full shadow-lg hover:bg-orange-600 hover:scale-105 transition-all flex items-center space-x-2 whitespace-nowrap"
                >
                    <span>🔄</span>
                    <span className="font-medium">Tổng ôn</span>
                    {reviewDueCount > 0 && (
                        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center border-2 border-white">
                            {reviewDueCount}
                        </span>
                    )}
                </button>
            </div>

            {/* Main Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`pointer-events-auto w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white transition-all duration-300 hover:scale-110 z-50 ${
                    isOpen 
                        ? 'bg-gray-600 rotate-45' 
                        : 'bg-gradient-to-r from-blue-500 to-indigo-600 rotate-0'
                }`}
                title="Menu học tập"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                
                {/* Badge for total notifications */}
                {!isOpen && (reviewDueCount > 0 || (starredCount || 0) > 0) && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center border-2 border-white">
                        {reviewDueCount + (starredCount || 0)}
                    </span>
                )}
            </button>
        </div>
    );
};
