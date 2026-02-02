import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChatJournal,
  DailyChat,
  Message,
  FSRSRating,
  TranslationDrillSettings,
  TranslationDrillStore,
  TranslationReview,
  StoredTranslationCard
} from '../types';
import { DEFAULT_FSRS_SETTINGS } from '../types';
import {
  findMessageById,
  getDueTranslationReviews,
  getRecentBotMessages,
  getTodayTranslationCount,
  getTranslationReviewByMessageId,
  getTranslationReviewDueCount,
  initializeTranslationReview,
  removeTranslationReview,
  upsertTranslationReview,
  getStoredTranslationCard,
  ensureStoredTranslationCard,
  updateStoredTranslationCardTranslation
} from '../utils/translationDrillStore';
import { updateFSRSReview } from '../utils/spacedRepetition';

interface TranslationDrillProps {
  journal: ChatJournal;
  translationStore: TranslationDrillStore;
  settings: TranslationDrillSettings;
  onSettingsChange: (settings: TranslationDrillSettings) => void;
  onUpdateStore: (store: TranslationDrillStore) => void;
  onBack: () => void;
  onTranslate: (text: string) => Promise<string>;
  onStoreTranslation: (messageId: string, translation: string, dailyChatId?: string) => void;
  onProgressChange: (todayCount: number) => void;
  currentStoryId?: string | null;
  currentStoryName?: string;
  onPlayAudio: (audioData: string, characterName?: string) => void | Promise<void>;
}

type DrillCard = {
  cardData: StoredTranslationCard;
  review?: TranslationReview;
  hasLiveMessage: boolean;
  liveDailyChatId?: string;
};

const clampRetention = (value: number) => Math.max(0.7, Math.min(0.95, value));

const ratingOptions: { value: FSRSRating; label: string; helper: string; accent: string }[] = [
  { value: 1, label: 'Again', helper: 'Quên sạch, cần học lại', accent: 'border-red-200 text-red-600 hover:bg-red-50' },
  { value: 2, label: 'Hard', helper: 'Nhớ loáng thoáng, khá khó', accent: 'border-amber-200 text-amber-600 hover:bg-amber-50' },
  { value: 3, label: 'Good', helper: 'Nhớ được, hơi do dự', accent: 'border-emerald-200 text-emerald-600 hover:bg-emerald-50' },
  { value: 4, label: 'Easy', helper: 'Rất dễ, nhớ ngay', accent: 'border-blue-200 text-blue-600 hover:bg-blue-50' }
];

const REVIEW_DELAY_AFTER_AGAIN = 10;
const REVIEW_DELAY_AFTER_HARD = 15;

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const TranslationDrill: React.FC<TranslationDrillProps> = ({
  journal,
  translationStore,
  settings,
  onSettingsChange,
  onUpdateStore,
  onBack,
  onTranslate,
  onStoreTranslation,
  onProgressChange,
  currentStoryId,
  currentStoryName,
  onPlayAudio,
}) => {
  const [currentCard, setCurrentCard] = useState<DrillCard | null>(null);
  const [isLoadingCard, setIsLoadingCard] = useState(true);
  const [isFetchingTranslation, setIsFetchingTranslation] = useState(false);
  const [isRating, setIsRating] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [revealedText, setRevealedText] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [loadToken, setLoadToken] = useState(1);
  const [reviewCooldowns, setReviewCooldowns] = useState<Record<string, number>>({});
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const fsrsSettings = useMemo(() => ({
    ...DEFAULT_FSRS_SETTINGS,
    desiredRetention: clampRetention(settings.desiredRetention)
  }), [settings.desiredRetention]);

  const todayCount = useMemo(() => getTodayTranslationCount(translationStore), [translationStore]);
  const dueCount = useMemo(() => getTranslationReviewDueCount(translationStore), [translationStore]);
  const totalCards = translationStore.cards?.length || 0;

  const journalRef = useRef(journal);
  const translationStoreRef = useRef(translationStore);
  const fsrsSettingsRef = useRef(fsrsSettings);
  const skippedIdsRef = useRef(skippedIds);
  const reviewCooldownsRef = useRef(reviewCooldowns);
  const storyIdRef = useRef(currentStoryId);
  const storyNameRef = useRef(currentStoryName);
  const autoRefreshInitialized = useRef(false);

  useEffect(() => {
    journalRef.current = journal;
  }, [journal]);

  useEffect(() => {
    translationStoreRef.current = translationStore;
  }, [translationStore]);

  useEffect(() => {
    fsrsSettingsRef.current = fsrsSettings;
  }, [fsrsSettings]);

  useEffect(() => {
    skippedIdsRef.current = skippedIds;
  }, [skippedIds]);

  useEffect(() => {
    storyIdRef.current = currentStoryId;
  }, [currentStoryId]);

  useEffect(() => {
    storyNameRef.current = currentStoryName;
  }, [currentStoryName]);

  useEffect(() => {
    reviewCooldownsRef.current = reviewCooldowns;
  }, [reviewCooldowns]);

  const requestNextCard = useCallback(() => {
    setLoadToken(prev => prev + 1);
  }, []);

  const decrementReviewCooldowns = useCallback(() => {
    const current = reviewCooldownsRef.current;
    if (!current || Object.keys(current).length === 0) {
      return current;
    }
    let mutated = false;
    const next: Record<string, number> = {};
    Object.entries(current).forEach(([id, remaining]) => {
      const updated = remaining - 1;
      if (updated > 0) {
        next[id] = updated;
      }
      if (updated !== remaining) {
        mutated = true;
      }
    });
    if (mutated) {
      reviewCooldownsRef.current = next;
      setReviewCooldowns(next);
      return next;
    }
    return current;
  }, []);

  const registerReviewCooldown = useCallback((reviewId: string, rating: FSRSRating, nextReviewDate?: string | null) => {
    if (!nextReviewDate) return;
    let cooldown = 0;
    if (rating === 1) cooldown = REVIEW_DELAY_AFTER_AGAIN;
    if (rating === 2) cooldown = REVIEW_DELAY_AFTER_HARD;
    if (!cooldown) return;

    const targetDate = new Date(nextReviewDate);
    if (!isSameDay(targetDate, new Date())) return;

    setReviewCooldowns(prev => {
      const next = { ...prev, [reviewId]: cooldown };
      reviewCooldownsRef.current = next;
      return next;
    });
  }, []);

  const clearReviewCooldown = useCallback((reviewId: string) => {
    if (!reviewCooldownsRef.current[reviewId]) return;
    setReviewCooldowns(prev => {
      if (!prev[reviewId]) return prev;
      const next = { ...prev };
      delete next[reviewId];
      reviewCooldownsRef.current = next;
      return next;
    });
  }, []);

  const hydrateCard = useCallback((card: DrillCard | null) => {
    setCurrentCard(card);
    setIsRevealed(false);
    setRevealedText(card?.cardData.translation || null);
    setStatusMessage(null);
    setErrorMessage(null);
  }, []);

  const selectNextCard = useCallback(() => {
    const journalData = journalRef.current || [];
    if (journalData.length === 0) {
      hydrateCard(null);
      setIsLoadingCard(false);
      return;
    }

    const cooldownsSnapshot = decrementReviewCooldowns() || reviewCooldownsRef.current || {};
    let workingStore: TranslationDrillStore = translationStoreRef.current;
    let storeChanged = false;

    const applyStoreUpdate = (nextStore: TranslationDrillStore) => {
      if (nextStore !== workingStore) {
        workingStore = nextStore;
        storeChanged = true;
        translationStoreRef.current = nextStore;
      }
    };

    const meta = { storyId: storyIdRef.current || undefined, storyName: storyNameRef.current };

    const finalizeSelection = (card: DrillCard | null) => {
      hydrateCard(card);
      setIsLoadingCard(false);
      if (storeChanged) {
        onUpdateStore(workingStore);
      }
    };

    const fsrsConfig = fsrsSettingsRef.current;
    const currentSkipped = skippedIdsRef.current;

    const dueQueue = getDueTranslationReviews(workingStore, fsrsConfig);
    for (const review of dueQueue) {
      if (cooldownsSnapshot[review.vocabularyId]) {
        continue;
      }
      let storedCard = getStoredTranslationCard(workingStore, review.vocabularyId);
      let liveDailyChatId: string | undefined;

      if (!storedCard) {
        const found = findMessageById(journalData, review.vocabularyId);
        if (found) {
          liveDailyChatId = found.dailyChat.id;
          applyStoreUpdate(ensureStoredTranslationCard(workingStore, found.message, found.dailyChat, meta));
          storedCard = getStoredTranslationCard(workingStore, review.vocabularyId);
        }
      } else {
        const found = findMessageById(journalData, review.vocabularyId);
        if (found) {
          liveDailyChatId = found.dailyChat.id;
        }
      }

      if (!storedCard) {
        applyStoreUpdate(removeTranslationReview(workingStore, review.vocabularyId));
        clearReviewCooldown(review.vocabularyId);
        continue;
      }

      clearReviewCooldown(review.vocabularyId);
      finalizeSelection({ cardData: storedCard, review, hasLiveMessage: Boolean(liveDailyChatId), liveDailyChatId });
      return;
    }

    const candidates = getRecentBotMessages(journalData, 5)
      .filter(entry => entry.message.text && entry.message.text.trim().length > 0)
      .filter(entry => !getTranslationReviewByMessageId(workingStore, entry.message.id))
      .filter(entry => !currentSkipped.has(entry.message.id));

    if (candidates.length === 0) {
      finalizeSelection(null);
      return;
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    applyStoreUpdate(ensureStoredTranslationCard(workingStore, pick.message, pick.dailyChat, meta));
    const storedCard = getStoredTranslationCard(workingStore, pick.message.id);
    if (!storedCard) {
      finalizeSelection(null);
      return;
    }

    finalizeSelection({ cardData: storedCard, hasLiveMessage: true, liveDailyChatId: pick.dailyChat.id });
  }, [hydrateCard, onUpdateStore, decrementReviewCooldowns, clearReviewCooldown]);

  useEffect(() => {
    setIsLoadingCard(true);
    selectNextCard();
  }, [loadToken, selectNextCard]);

  useEffect(() => {
    if (!autoRefreshInitialized.current) {
      autoRefreshInitialized.current = true;
      return;
    }
    requestNextCard();
  }, [journal, currentStoryId, currentStoryName, requestNextCard]);

  const handlePlayAudio = useCallback(async () => {
    if (!currentCard?.cardData.audioData || isPlayingAudio) return;
    setErrorMessage(null);
    try {
      setIsPlayingAudio(true);
      debugger
      await onPlayAudio(currentCard.cardData.audioData, currentCard.cardData.characterName);
    } catch (error) {
      console.error('Failed to play translation audio', error);
      setErrorMessage('Không phát được âm thanh cho đoạn này.');
    } finally {
      setIsPlayingAudio(false);
    }
  }, [currentCard, isPlayingAudio, onPlayAudio]);

  const handleReveal = useCallback(async () => {
    if (!currentCard || isRevealed || isFetchingTranslation) return;
    setErrorMessage(null);

    if (revealedText) {
      setIsRevealed(true);
      return;
    }

    setIsFetchingTranslation(true);
    try {
      const translation = await onTranslate(currentCard.cardData.text);
      setRevealedText(translation);
      setIsRevealed(true);
      if (currentCard.hasLiveMessage && currentCard.liveDailyChatId) {
        onStoreTranslation(currentCard.cardData.messageId, translation, currentCard.liveDailyChatId);
      }
      const updatedStore = updateStoredTranslationCardTranslation(translationStore, currentCard.cardData.messageId, translation);
      if (updatedStore !== translationStore) {
        translationStoreRef.current = updatedStore;
        onUpdateStore(updatedStore);
      }
      setCurrentCard(prev => prev ? { ...prev, cardData: { ...prev.cardData, translation } } : prev);
    } catch (error) {
      console.error('Failed to fetch translation', error);
      setErrorMessage('Không thể dịch đoạn này, thử lại một lúc nữa.');
    } finally {
      setIsFetchingTranslation(false);
    }
  }, [currentCard, isRevealed, isFetchingTranslation, revealedText, onTranslate, onStoreTranslation, translationStore, onUpdateStore]);

  const handleRating = useCallback(async (rating: FSRSRating) => {
    if (!currentCard || !isRevealed || isRating) return;

    setIsRating(true);
    try {
      let review = currentCard.review;
      if (!review) {
        const fallbackDailyChatId = currentCard.cardData.dailyChatId || currentCard.liveDailyChatId || 'global';
        review = initializeTranslationReview(currentCard.cardData.messageId, fallbackDailyChatId);
      }
      const updatedReview = updateFSRSReview(review, rating, fsrsSettings);
      const updatedStore = upsertTranslationReview(translationStore, updatedReview);
      translationStoreRef.current = updatedStore;
      onUpdateStore(updatedStore);
      onProgressChange(getTodayTranslationCount(updatedStore));
      registerReviewCooldown(updatedReview.vocabularyId, rating, updatedReview.nextReviewDate);
      setStatusMessage(`Đã lưu: ${ratingOptions.find(option => option.value === rating)?.label || rating}`);
      setSkippedIds(prev => {
        const next = new Set(prev);
        next.delete(currentCard.cardData.messageId);
        skippedIdsRef.current = next;
        return next;
      });
      requestNextCard();
    } catch (error) {
      console.error('Failed to rate translation card', error);
      setErrorMessage('Không thể lưu đánh giá, thử lại nhé.');
    } finally {
      setIsRating(false);
    }
  }, [currentCard, isRevealed, isRating, fsrsSettings, translationStore, onUpdateStore, onProgressChange, requestNextCard, registerReviewCooldown]);

  const handleSkip = useCallback(() => {
    if (!currentCard) return;
    if (currentCard.review) {
      setErrorMessage('Không thể bỏ qua thẻ đến hạn. Hãy chọn mức độ nhớ.');
      return;
    }
    setSkippedIds(prev => {
      const next = new Set(prev);
      next.add(currentCard.cardData.messageId);
      skippedIdsRef.current = next;
      return next;
    });
    setStatusMessage('Đã bỏ qua đoạn này. Lấy đoạn khác...');
    setIsLoadingCard(true);
    requestNextCard();
  }, [currentCard, requestNextCard]);

  const handleRetentionChange = (value: number) => {
    const normalized = clampRetention(value / 100);
    onSettingsChange({ desiredRetention: normalized });
  };

  const cardMeta = currentCard ? {
    typeLabel: currentCard.review ? 'Thẻ ôn tập' : 'Thẻ mới',
    date: currentCard.cardData.dailyChatDate
      ? new Date(currentCard.cardData.dailyChatDate).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
      : null,
    summary: currentCard.cardData.dailyChatSummary || 'Chưa có tóm tắt'
  } : null;

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-50 via-white to-white">
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
        <button
          onClick={onBack}
          className="px-3 py-2 rounded-full border border-slate-300 text-slate-600 hover:bg-slate-100 text-sm font-medium"
        >
          ← Quay lại nhật ký
        </button>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-400">Luyện dịch nhanh</p>
          <p className="text-lg font-semibold text-slate-700">Ngẫu nhiên trong 5 đoạn chat gần nhất</p>
        </div>
      </header>

      <section className="px-4 py-3 border-b border-slate-100 bg-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1">
            <div className="flex items-center justify-between text-sm text-slate-600 mb-1">
              <span>Mức ghi nhớ mong muốn</span>
              <span className="font-semibold text-slate-800">{Math.round(fsrsSettings.desiredRetention * 100)}%</span>
            </div>
            <input
              type="range"
              min={70}
              max={95}
              step={1}
              value={Math.round(fsrsSettings.desiredRetention * 100)}
              onChange={(event) => handleRetentionChange(Number(event.target.value))}
              className="w-full accent-purple-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              Điều chỉnh để cân bằng giữa độ khó và khoảng cách ôn tập (70-95%).
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-xl px-3 py-2 text-center">
              <p className="text-xs text-slate-500">Đã luyện hôm nay</p>
              <p className="text-lg font-semibold text-emerald-600">{todayCount}</p>
            </div>
            <div className="bg-slate-50 rounded-xl px-3 py-2 text-center">
              <p className="text-xs text-slate-500">Đang đến hạn</p>
              <p className={`text-lg font-semibold ${dueCount > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>{dueCount}</p>
            </div>
            <div className="bg-slate-50 rounded-xl px-3 py-2 text-center">
              <p className="text-xs text-slate-500">Tổng thẻ</p>
              <p className="text-lg font-semibold text-slate-700">{totalCards}</p>
            </div>
          </div>
        </div>
      </section>

      <main className="flex-1 overflow-y-auto p-4">
        {isLoadingCard ? (
          <div className="flex flex-col items-center justify-center h-96 text-slate-500">
            <div className="animate-spin h-10 w-10 border-4 border-slate-200 border-t-purple-500 rounded-full mb-4" />
            <p>Đang chọn đoạn hội thoại...</p>
          </div>
        ) : currentCard ? (
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <span className={`text-xs font-semibold tracking-wide px-3 py-1 rounded-full ${currentCard.review ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {cardMeta?.typeLabel}
                </span>
                <div className="text-right text-xs text-slate-500">
                  <p>{cardMeta?.date || 'Không rõ ngày'}</p>
                  <p className="truncate max-w-xs">{cardMeta?.summary}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <p className="text-2xl font-semibold text-slate-800 leading-relaxed whitespace-pre-line flex-1">
                  {currentCard.cardData.text}
                </p>
                {currentCard.cardData.audioData && (
                  <button
                    onClick={handlePlayAudio}
                    disabled={isPlayingAudio}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                    aria-label="Nghe âm thanh đoạn hội thoại"
                  >
                    <span>{isPlayingAudio ? 'Đang phát...' : 'Nghe audio'}</span>
                  </button>
                )}
              </div>

              <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <button
                  onClick={handleReveal}
                  disabled={isRevealed || isFetchingTranslation}
                  className={`w-full px-4 py-2 rounded-2xl font-medium ${isRevealed ? 'bg-emerald-600 text-white cursor-default' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'} disabled:opacity-50`}
                >
                  {isRevealed ? 'Đã hiển thị bản dịch' : isFetchingTranslation ? 'Đang dịch...' : 'Hiện bản dịch'}
                </button>
                {isRevealed && (
                  <div className="mt-4 text-lg text-slate-700 leading-relaxed whitespace-pre-line">
                    {revealedText || 'Chưa có bản dịch cho đoạn này.'}
                  </div>
                )}
              </div>

              <div className="mt-6">
                <p className="text-sm text-slate-500 mb-2">Đánh giá mức độ nhớ (hiện bản dịch trước khi chọn)</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {ratingOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => handleRating(option.value)}
                      disabled={!isRevealed || isRating}
                      className={`px-3 py-3 rounded-2xl border text-left transition ${option.accent} disabled:opacity-50`}
                    >
                      <p className="font-semibold">{option.label}</p>
                      <p className="text-xs text-slate-500 mt-1">{option.helper}</p>
                    </button>
                  ))}
                </div>
              </div>

              {!currentCard.review && (
                <div className="mt-4 text-right">
                  <button
                    onClick={handleSkip}
                    className="text-sm text-slate-500 hover:text-slate-700 underline"
                  >
                    Bỏ qua đoạn này
                  </button>
                </div>
              )}
            </div>

            {(statusMessage || errorMessage) && (
              <div className={`rounded-2xl px-4 py-3 text-sm ${errorMessage ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                {errorMessage || statusMessage}
              </div>
            )}

            <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Mẹo ghi nhớ</h3>
              <ul className="text-sm text-slate-500 list-disc pl-5 space-y-1">
                <li>Tập trung vào ý chính của câu tiếng Hàn trước khi xem đáp án.</li>
                <li>So sánh bản dịch thực tế với suy nghĩ của bạn và tìm điểm chênh.</li>
                <li>Đánh giá trung thực để FSRS sắp xếp lại lịch ôn phù hợp.</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-96 text-center text-slate-500">
            <p className="text-xl font-semibold text-slate-700 mb-2">Chưa có đoạn nào để luyện</p>
            <p>Hãy trò chuyện thêm với Mimi để tạo thêm dữ liệu, hoặc chờ tới lượt ôn tiếp theo.</p>
          </div>
        )}
      </main>
    </div>
  );
};
