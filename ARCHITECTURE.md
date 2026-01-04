# MimiChat - Tài liệu Kiến trúc Hệ thống

> **Mục đích**: Tài liệu này mô tả toàn bộ kiến trúc, luồng code và cách các thành phần tương tác với nhau trong ứng dụng MimiChat - ứng dụng học tiếng Hàn với AI.

---

## 📋 Mục lục

1. [Tổng quan Kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Công nghệ Sử dụng](#2-công-nghệ-sử-dụng)
3. [Cấu trúc Thư mục](#3-cấu-trúc-thư-mục)
4. [Entry Points](#4-entry-points)
5. [Core Components](#5-core-components)
6. [Services](#6-services)
7. [Utilities](#7-utilities)
8. [Server API](#8-server-api)
9. [Data Types](#9-data-types)
10. [Luồng Dữ liệu Chính](#10-luồng-dữ-liệu-chính)
11. [Tính năng AI Research System](#11-tính-năng-ai-research-system)
12. [Spaced Repetition System](#12-spaced-repetition-system)
13. [Chi tiết Components](#13-chi-tiết-components)
14. [Chi tiết App.tsx Functions](#14-chi-tiết-apptsx-functions)
15. [FSRS Algorithm](#15-fsrs-algorithm-free-spaced-repetition-scheduler)
16. [Vocabulary Memory System (Thẻ Ký ức)](#16-vocabulary-memory-system-thẻ-ký-ức)
17. [Vocabulary Memory Functions Reference](#17-vocabulary-memory-functions-reference)

---

## 1. Tổng quan Kiến trúc

MimiChat là ứng dụng học tiếng Hàn với các nhân vật AI. Kiến trúc theo mô hình **Client-Server**:

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (React + Vite)                     │
├─────────────────────────────────────────────────────────────────┤
│  index.tsx (Entry) ──► App.tsx (Main Container)                 │
│       ├── ChatWindow + MessageBubble (Chat UI)                  │
│       ├── VocabularyConversation / VocabularyScene (Học từ)     │
│       ├── JournalViewer (Lịch sử hội thoại)                     │
│       ├── ReviewScene (Ôn tập từ vựng)                          │
│       └── CharacterManager (Quản lý nhân vật)                   │
├─────────────────────────────────────────────────────────────────┤
│  SERVICES: geminiService.ts | HTTPService.ts                    │
│  UTILS: spacedRepetition.ts | streakManager.ts | storySearch.ts │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP/REST API
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (Express.js)                        │
├─────────────────────────────────────────────────────────────────┤
│  server/src/index.ts (Main API Server)                          │
│       ├── Authentication (JWT)                                  │
│       ├── Data CRUD (Story, Journal)                            │
│       ├── Audio streaming & TTS                                 │
│       └── File uploads (Avatar, Image)                          │
├─────────────────────────────────────────────────────────────────┤
│  MODULES: openai.ts (TTS) | eleven.ts (Backup TTS)              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   JSON Files        Google Drive       Gemini/OpenAI
   (data/*.json)     (Audio backup)     (AI APIs)
```

---

## 2. Công nghệ Sử dụng

| Layer | Công nghệ | Mô tả |
|-------|-----------|-------|
| **Frontend** | React 19 + TypeScript | UI Framework |
| **Build** | Vite | Fast bundler |
| **Styling** | Tailwind CSS | Utility-first CSS |
| **Backend** | Express.js + TypeScript | REST API Server |
| **AI Chat** | Google Gemini (`gemini-2.5-flash-preview-05-20`) | Conversation AI |
| **TTS** | OpenAI (`gpt-4o-mini-tts`) | Text-to-Speech |
| **Search** | Fuse.js | Fuzzy text search |
| **Spaced Repetition** | ts-fsrs | FSRS algorithm implementation |
| **Rich Text Editor** | TipTap | Memory editor with custom nodes |
| **Storage** | JSON Files | Data persistence |
| **Auth** | JWT | Token-based auth |

---

## 3. Cấu trúc Thư mục

```
mimichat/
├── index.html              # HTML entry point
├── index.tsx               # React entry point + Auth routing
├── App.tsx                 # Main application component (~3200 lines)
├── types.ts                # TypeScript interfaces
├── vite.config.ts          # Vite configuration
├── tsconfig.json           # TypeScript configuration
│
├── components/             # React components
│   ├── ChatWindow.tsx      # Khung chat chính
│   ├── ChatInput.tsx       # Input nhập tin nhắn
│   ├── ChatMessage.tsx     # Wrapper cho messages
│   ├── MessageBubble.tsx   # Bubble tin nhắn (677 lines)
│   ├── VocabularyConversation.tsx  # Học từ qua hội thoại (1682 lines)
│   ├── VocabularyScene.tsx # Quiz học từ vựng
│   ├── JournalViewer.tsx   # Xem lịch sử hội thoại (849 lines)
│   ├── ReviewScene.tsx     # Ôn tập từ vựng
│   ├── CharacterManager.tsx # Quản lý nhân vật AI (502 lines)
│   ├── AutoChatModal.tsx   # Auto chat giữa các nhân vật (474 lines)
│   ├── StreakDisplay.tsx   # Hiển thị streak
│   ├── LevelSelector.tsx   # Chọn level tiếng Hàn
│   └── ...
│
├── services/               # Business logic services
│   ├── geminiService.ts    # Gemini AI service (1224 lines)
│   └── HTTPService.ts      # HTTP client với JWT auth
│
├── utils/                  # Utility functions
│   ├── spacedRepetition.ts # Thuật toán lặp lại ngắt quãng
│   ├── streakManager.ts    # Quản lý streak học tập
│   ├── storySearch.ts      # AI research system (search, get_journal, get_message)
│   └── vocabularyQuiz.ts   # Logic quiz từ vựng
│
└── server/                 # Backend server
    ├── package.json
    ├── src/
    │   ├── index.ts        # Express server (1765 lines)
    │   └── modules/
    │       ├── openai.ts   # OpenAI TTS
    │       ├── eleven.ts   # ElevenLabs TTS (backup)
    │       └── geminiService.ts  # Server-side Gemini
    └── data/               # Data storage
        ├── data.json       # Legacy data
        ├── stories-index.json
        ├── streak.json
        └── stories/        # Story files
```

---

## 4. Entry Points

### 4.1 `index.html`
- HTML shell cơ bản
- Load Tailwind CSS từ CDN
- Import maps cho React và Google GenAI

### 4.2 `index.tsx`
```tsx
// Authentication flow
<Routes>
  <Route path="/login" element={<Login />} />
  <Route path="/*" element={
    <ProtectedRoute>
      <App />
    </ProtectedRoute>
  } />
</Routes>
```

**Luồng Auth**:
1. Kiểm tra JWT token trong localStorage
2. Nếu hợp lệ → hiển thị `<App />`
3. Nếu không → redirect về `/login`

### 4.3 `App.tsx` - Main Container

**State chính** (sử dụng `useState`):

| State | Type | Mô tả |
|-------|------|-------|
| `journal` | `DailyChat[]` | Toàn bộ lịch sử chat |
| `characters` | `Character[]` | Danh sách nhân vật AI |
| `activeCharacterIds` | `string[]` | Nhân vật đang active |
| `context` | `string` | Ngữ cảnh hiện tại |
| `realtimeContext` | `string` | Ngữ cảnh động (AI cập nhật) |
| `storyPlot` | `string` | Cốt truyện |
| `currentLevel` | `KoreanLevel` | Level tiếng Hàn (A0-C2) |
| `streak` | `StreakData` | Dữ liệu streak |
| `chatReviewVocabularies` | `VocabularyReview[]` | Từ đang ôn trong chat |
| `view` | `string` | View hiện tại (chat/journal/vocabulary/review) |

**Refs quan trọng**:
- `chatRef` - Gemini chat session instance
- `audioContextRef` - Web Audio API context
- `audioCacheRef` - Cache audio đã decode

---

## 5. Core Components

### 5.1 Chat Components

#### `ChatWindow.tsx`
- Hiển thị danh sách messages với auto-scroll
- Hiển thị vocabulary hints (từ cần ôn tập)
- Indicator "AI đang tìm kiếm..." khi AI search

#### `MessageBubble.tsx` (677 lines)
Component phức tạp nhất cho từng tin nhắn:

```
┌─────────────────────────────────────────┐
│ [Avatar] CharacterName                  │
│ ┌─────────────────────────────────────┐ │
│ │ 안녕하세요! 오늘 **날씨**가 좋아요. │ │ ← Bold = từ vựng ẩn
│ │ [🔊 Play] [📝 Translate] [✏️ Edit]  │ │
│ └─────────────────────────────────────┘ │
│ [Translation nếu có]                    │
└─────────────────────────────────────────┘
```

**Tính năng**:
- Ẩn từ vựng trong `**word**` → click để reveal
- Phát audio với voice settings của character
- Dịch theo yêu cầu
- Edit message
- Thu thập từ vựng từ text được highlight

### 5.2 Vocabulary Learning

#### `VocabularyScene.tsx` (341 lines)
Quiz interface cho học từ mới:

```
Quiz Types:
1. Meaning Quiz: 날씨 = ? [A.Thời tiết] [B.Trời] [C.Mưa] [D.Nắng]
2. Fill-Blank Quiz: 오늘 _____가 좋아요 → điền từ thiếu
```

#### `VocabularyConversation.tsx` (1682 lines)
Học từ qua hội thoại với AI:

```
┌─────────────────────────────────────────┐
│ Mode: [Passive] [Active]                │
│                                         │
│ Vocabularies: [날씨✓] [공부✓] [음식]    │ ← Toggle từ cần học
│                                         │
│ [Character 1]: 오늘 **날씨**가 좋아요   │
│ [Character 2]: 네, **공부**하기 좋네요  │
│ ...                                     │
│                                         │
│ [🎤 Voice] [💬 Type] [⏹️ Stop]          │
└─────────────────────────────────────────┘
```

**2 Modes**:
1. **Passive**: AI tự hội thoại, user nghe và học
2. **Active**: User tham gia hội thoại với AI

### 5.3 Management Components

#### `JournalViewer.tsx` (849 lines)
Xem lịch sử hội thoại:
- Expandable daily entries
- Auto-play toàn bộ audio
- Preload audio để offline
- Xem character thoughts
- Generate/edit vocabulary từ conversation

#### `CharacterManager.tsx` (502 lines)
Quản lý nhân vật AI:
```
Character Settings:
├── Name, Gender
├── Personality (prompt)
├── Voice Settings
│   ├── Voice Name (OpenAI voices)
│   ├── Pitch (0-10)
│   └── Speaking Rate (0.5-2.0)
├── Avatar (upload)
├── Relationships với nhân vật khác
└── Opinion về user
```

#### `AutoChatModal.tsx` (474 lines)
Tự động generate hội thoại:
- User nhập topic và từ vựng
- AI tự tạo hội thoại giữa các nhân vật
- Configurable số message target
- Pause/Resume functionality

---

## 6. Services

### 6.1 `geminiService.ts` (1224 lines)

**Main AI Service** - Tất cả tương tác với Gemini API:

```typescript
// Initialization
initService()           // Fetch API key, init client
initChat(params)        // Tạo chat session với system prompt

// Chat
sendMessage(chat, text) // Gửi text message
sendAudioMessage(...)   // Gửi audio → transcribe + respond

// TTS
getTextToSpeech(...)    // Generate TTS audio từ server

// Translation
getTranslation(text)    // Dịch Korean → Vietnamese

// Content Generation
generateSummary(...)    // Tóm tắt conversation
generateThoughts(...)   // Generate character thoughts
summarizeRelationships(...) // Tóm tắt relationships
generateContextSuggestions(...)   // Gợi ý context
generateMessageSuggestions(...)   // Gợi ý message cho user
generateVocabulary(...)           // Extract từ vựng từ chat
generateSceneImage(...)           // Generate hình minh họa

// Auto Chat
initAutoChatSession(...)  // Khởi tạo auto chat mode
```

**System Prompt Structure** (trong `initChat`):

```
1. THÔNG TIN CƠ BẢN
   - Level tiếng Hàn (A0-C2) với giới hạn từ/câu
   - Quy tắc TTS (emotion markers)
   
2. DANH SÁCH TÊN NHÂN VẬT
   - Chỉ tên và giới tính
   
3. THÔNG TIN CHI TIẾT NHÂN VẬT
   - Personality, relationships, opinions
   
4. VOCABULARY HINTS
   - Từ cần ôn tập trong chat
   
5. STORY PLOT
   - Cốt truyện đang diễn ra
   
6. RESEARCH SYSTEM
   - SEARCH, GET_JOURNAL, GET_MESSAGE commands
   
7. PRONUNCIATION CHECK
   - Chế độ kiểm tra phát âm
```

### 6.2 `HTTPService.ts`

HTTP Client với JWT authentication:

```typescript
const API_URL = {
  API_LOGIN: '/api/login',
  API_VERIFY: '/api/verify',
  API_GET_API_KEY: '/api/get-api-key',
  API_DATA: '/api/data',
  API_AUDIO: '/api/audio',
  API_TTS: '/api/text-to-speech',
  API_STORIES: '/api/stories',
  API_STORY: '/api/story',
  API_STREAK: '/api/streak',
  API_UPLOAD_AUDIO: '/api/upload-audio',
  API_UPLOAD_AVATAR: '/api/upload-avatar',
  API_UPLOAD_IMAGE: '/api/upload-image',
};

// Tự động attach JWT token vào mọi request
const authHeader = { Authorization: `Bearer ${token}` };
```

---

## 7. Utilities

### 7.1 `spacedRepetition.ts`

**Thuật toán Spaced Repetition**:

```
Công thức tính interval:
- Lần đầu: 1 ngày
- Các lần sau: current_interval × 2 - incorrect_count
- Minimum: 1 ngày

Ví dụ progression (không sai):
Day 0 → Day 1 → Day 2 (×2=2) → Day 4 (×2=4) → Day 8 (×2=8) → Day 16...
```

**Functions chính**:

| Function | Mô tả |
|----------|-------|
| `calculateNextInterval(current, incorrect)` | Tính interval tiếp theo |
| `initializeVocabularyReview(vocab, chatId)` | Tạo review schedule mới |
| `updateReviewAfterQuiz(review, correct, incorrect)` | Cập nhật sau quiz |
| `getVocabulariesDueForReview(journal, excludeIds)` | Lấy từ cần ôn hôm nay |
| `getRandomReviewVocabulariesForChat(journal)` | Lấy từ để hint trong chat |

### 7.2 `streakManager.ts`

Quản lý learning streak:

```typescript
interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  todayActivities: {
    chat: boolean;
    review: boolean;
    learn: boolean;
  };
}

// Functions
initializeStreak()              // Khởi tạo streak mới
updateStreak(streak, activity)  // Cập nhật sau activity
checkAndResetStreak(streak)     // Reset nếu miss ngày
hasCompletedToday(streak)       // Kiểm tra hoàn thành hôm nay
```

### 7.3 `storySearch.ts`

**AI Research System** - Cho phép AI search lịch sử:

```typescript
// Commands AI có thể dùng:
SEARCH:keyword1|keyword2   // Tìm kiếm regex
GET_JOURNAL:5              // Lấy journal số 5
GET_MESSAGE:379            // Lấy context quanh message 379

// Functions
formatJournalForSearch(journal)   // Format journal để search
searchConversations(query, journal)  // Regex search
getConversationByIndex(index, journal)  // Lấy journal by index
getMessageContext(journal, globalIndex, contextSize)  // Lấy ±5 messages
parseSystemCommand(text)          // Parse command từ AI response
executeSystemCommand(cmd, journal, formatted)  // Execute command
```

### 7.4 `vocabularyQuiz.ts`

Quiz generation:

```typescript
generateMeaningQuiz(vocab, allVocabs)  // Korean → Vietnamese MC
generateFillBlankQuiz(vocab, messages) // Fill in blank
```

---

## 8. Server API

### 8.1 Express Server (`server/src/index.ts`)

**Endpoints chính**:

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/api/login` | POST | Authenticate với token |
| `/api/verify` | GET | Verify JWT token |
| `/api/get-api-key` | GET | Lấy Gemini API key |
| `/api/data` | GET/PUT | Main data file |
| `/api/stories` | GET | List tất cả stories |
| `/api/story/:id` | GET/PUT/DELETE | Story CRUD |
| `/api/story` | POST | Tạo story mới |
| `/api/streak` | GET/PUT | Streak data |
| `/api/audio/:filename` | GET | Stream audio file |
| `/api/text-to-speech` | GET | Generate TTS |
| `/api/upload-audio` | POST | Upload user audio |
| `/api/upload-avatar` | POST | Upload avatar |
| `/api/upload-image` | POST | Upload generated image |

### 8.2 Server Modules

#### `openai.ts` - TTS Service
```typescript
textToSpeech(
  text: string,      // Text để nói (max ~180 chars)
  voice: string,     // Voice name
  format: string,    // mp3/wav
  output: string,    // Output path
  instructions: string // TTS instructions
)
// Speed: 0.8x for clarity
```

---

## 9. Data Types

### 9.1 Core Interfaces (`types.ts`)

```typescript
interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  characterName?: string;      // Tên nhân vật (nếu bot)
  audioData?: string;          // Audio file ID
  translation?: string;        // Bản dịch
  imageUrl?: string;           // URL hình (nếu là image message)
  kind?: 'text' | 'voice';     // Loại message
  transcript?: string;         // Transcription (nếu voice)
}

interface Character {
  id: string;
  name: string;
  personality: string;         // System prompt cho character
  gender: 'male' | 'female';
  voiceName?: string;          // OpenAI voice
  pitch?: number;              // Pitch adjustment (0-10)
  speakingRate?: number;       // Speed (0.5-2.0)
  avatar?: string;             // Avatar image path
  relations?: Record<string, RelationInfo>;
  userOpinion?: RelationInfo;  // Opinion về user
}

interface DailyChat {
  id: string;
  date: string;
  summary: string;
  messages: Message[];
  vocabularies?: VocabularyItem[];
  reviewSchedule?: VocabularyReview[];
  characterThoughts?: CharacterThought[];
}

interface VocabularyItem {
  id: string;
  korean: string;
  vietnamese: string;
  example?: string;
  exampleTranslation?: string;
}

interface VocabularyReview {
  vocabularyId: string;
  dailyChatId: string;
  currentIntervalDays: number;
  nextReviewDate: string;
  lastReviewDate: string | null;
  reviewHistory: ReviewHistoryEntry[];
  totalReviews: number;
}
```

### 9.2 Korean Levels

```typescript
type KoreanLevel = 'A0' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

// Level configs trong geminiService.ts
const levelConfigs = {
  'A0': { maxWords: 3,  grammar: 'Chỉ dùng câu đơn giản nhất' },
  'A1': { maxWords: 5,  grammar: 'Câu cơ bản' },
  'A2': { maxWords: 8,  grammar: 'Câu ghép đơn giản' },
  'B1': { maxWords: 12, grammar: 'Câu phức tạp hơn' },
  'B2': { maxWords: 15, grammar: 'Đa dạng cấu trúc' },
  'C1': { maxWords: 18, grammar: 'Nâng cao' },
  'C2': { maxWords: 20, grammar: 'Native level' },
};
```

---

## 10. Luồng Dữ liệu Chính

### 10.1 Chat Flow

```
┌─────────────────────────────────────────────────────────────┐
│ User types/speaks message                                   │
└─────────────────────────────┬───────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ App.handleSendMessage() / handleSendAudio()                 │
│ - Add user message to state                                 │
│ - Build messageForAI (với realtimeContext nếu có)          │
└─────────────────────────────┬───────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ geminiService.sendMessage() / sendAudioMessage()            │
│ - Gửi đến Gemini API                                        │
│ - Nhận JSON response                                        │
└─────────────────────────────┬───────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Parse AI Response                                           │
│ [{CharacterName, Text, Tone, Translation, RealtimeContext}] │
└─────────────────────────────┬───────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Check for System Commands (SEARCH, GET_JOURNAL, GET_MESSAGE)│
│ - Nếu có: executeSystemCommand() → gửi kết quả lại cho AI  │
│ - Loop tối đa 3 lần search                                  │
└─────────────────────────────┬───────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ processBotResponsesSequentially()                           │
│ - Với mỗi response:                                         │
│   1. Generate TTS audio (getTextToSpeech)                   │
│   2. Create Message object                                  │
│   3. Update state (updateCurrentChatMessages)               │
│   4. Play audio                                             │
│   5. Delay 1.2s → next message                             │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 Voice Message Flow

```
User records audio
       ▼
handleSendAudio(base64, duration)
       ▼
uploadAudio(base64) → Server saves file → returns audioId
       ▼
sendAudioMessage(chat, base64)
       ▼
Gemini transcribes audio + generates response
Response includes: { UserTranscript: "...", ... }
       ▼
Update message with transcript
       ▼
Process bot responses (same as text flow)
```

### 10.3 Vocabulary Learning Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. COLLECT VOCABULARY                                       │
│ - Auto: generateVocabulary() từ conversation                │
│ - Manual: User highlight text → collectVocabulary()         │
└─────────────────────────────┬───────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. LEARN VOCABULARY                                         │
│ - VocabularyConversation (Passive/Active mode)              │
│ - AI sử dụng từ trong hội thoại tự nhiên                    │
│ - Từ được đánh dấu **bold** để user chú ý                   │
└─────────────────────────────┬───────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. CREATE REVIEW SCHEDULE                                   │
│ - initializeVocabularyReview()                              │
│ - nextReviewDate = tomorrow                                 │
│ - currentIntervalDays = 0                                   │
└─────────────────────────────┬───────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. DAILY REVIEW                                             │
│ - getVocabulariesDueForReview() → từ cần ôn hôm nay        │
│ - ReviewScene: Quiz (Meaning + Fill-blank)                  │
│ - updateReviewAfterQuiz() → tính interval mới               │
└─────────────────────────────────────────────────────────────┘
```

### 10.4 Data Persistence Flow

```
State change (journal, characters, etc.)
       ▼
useEffect auto-save (debounced)
       ▼
HTTPService.put(API_STORY, data)
       ▼
Server saves to: server/data/stories/{storyId}.json
```

---

## 11. Tính năng AI Research System

Cho phép AI tự search lịch sử hội thoại để hiểu context:

### 11.1 Commands

| Command | Syntax | Mô tả |
|---------|--------|-------|
| SEARCH | `System: SEARCH:keyword1\|keyword2` | Regex search across journals |
| GET_JOURNAL | `System: GET_JOURNAL:5` | Lấy toàn bộ journal số 5 |
| GET_MESSAGE | `System: GET_MESSAGE:379` | Lấy ±5 messages quanh message 379 |

### 11.2 Workflow

```
User: "Nahida đã nói gì về vụ trộm?"
       ▼
AI Response: [
  { CharacterName: "System", Text: "SEARCH:trộm|도둑|증거" },
  { CharacterName: "Nahida", Text: "Để em tìm lại..." }
]
       ▼
App detects System command
       ▼
executeSystemCommand() → searchConversations()
       ▼
Results: "[Message 379] Nahida: 다 들었어. 증거를 잡아요."
       ▼
Send results back to AI
       ▼
AI Response: [
  { CharacterName: "System", Text: "GET_MESSAGE:379" }
]
       ▼
getMessageContext(379) → ±5 messages
       ▼
AI now has full context, responds naturally
```

### 11.3 Global Message Indexing

Messages được đánh số liên tục qua tất cả journals:
```
Journal 1: Message 1, 2, 3, ... 100
Journal 2: Message 101, 102, ... 200
Journal 3: Message 201, ...
```

---

## 12. Spaced Repetition System

### 12.1 Algorithm

```
┌─────────────────────────────────────────────────────────────┐
│ SPACED REPETITION FORMULA                                   │
├─────────────────────────────────────────────────────────────┤
│ First review:  interval = 1 day                             │
│ Next reviews:  interval = current × 2 - incorrectCount      │
│ Minimum:       interval = 1 day                             │
├─────────────────────────────────────────────────────────────┤
│ EXAMPLE (no mistakes):                                      │
│ Day 0: Learn word                                           │
│ Day 1: Review → next = 1×2 = 2 days                        │
│ Day 3: Review → next = 2×2 = 4 days                        │
│ Day 7: Review → next = 4×2 = 8 days                        │
│ Day 15: Review → next = 8×2 = 16 days                      │
│ Day 31: Review → next = 16×2 = 32 days (MASTERED!)         │
├─────────────────────────────────────────────────────────────┤
│ EXAMPLE (with mistakes):                                    │
│ Day 7: Review (2 mistakes) → next = 4×2 - 2 = 6 days       │
└─────────────────────────────────────────────────────────────┘
```

### 12.2 Sorting Strategy

Từ vựng được sắp xếp theo `totalReviews` (ít nhất lên đầu):
- Từ mới học (totalReviews = 0) được ưu tiên
- Từ đã ôn nhiều lần được đẩy xuống sau

### 12.3 Integration với Chat

Từ cần ôn được hint trong chat thường:
```typescript
// getRandomReviewVocabulariesForChat()
// → Lấy tối đa 20 từ due today
// → Pass vào system prompt
// → AI sử dụng trong hội thoại tự nhiên
```

---

## 📝 Notes cho Maintainers

### Code Conventions
- Components lớn (>500 lines) nên được refactor thành smaller components
- State phức tạp có thể migrate sang Zustand/Redux
- File `App.tsx` (~3200 lines) cần được split thành custom hooks

### Known Technical Debt
1. `App.tsx` quá lớn - cần extract custom hooks
2. `MessageBubble.tsx` phức tạp - cần break down
3. Server chưa có proper database - đang dùng JSON files
4. Missing unit tests

### Performance Considerations
- `formattedJournalForSearch` được memoized với useMemo
- Audio được cache trong `audioCacheRef`
- Auto-save debounced để tránh save quá nhiều

---

## 13. Chi tiết Components

### 13.1 ChatWindow.tsx

**Mục đích**: Hiển thị khung chat chính với danh sách messages và các tính năng bổ trợ.

#### Props

| Prop | Type | Mô tả |
|------|------|-------|
| `messages` | `Message[]` | Danh sách tin nhắn |
| `isLoading` | `boolean` | Đang chờ AI response |
| `isAISearching` | `boolean` | AI đang search lịch sử |
| `onReplayAudio` | `function` | Callback phát lại audio |
| `onGenerateAudio` | `function` | Callback tạo audio mới |
| `onTranslate` | `function` | Callback dịch text |
| `onStoreTranslation` | `function` | Lưu bản dịch |
| `onRetry` | `function` | Thử lại tin nhắn |
| `editingMessageId` | `string\|null` | ID tin đang edit |
| `setEditingMessageId` | `function` | Set tin đang edit |
| `onUpdateMessage` | `function` | Cập nhật user message |
| `onUpdateBotMessage` | `function` | Cập nhật bot message |
| `onRegenerateTone` | `function` | Tạo lại tone cho TTS |
| `onCollectVocabulary` | `function` | Thu thập từ vựng |
| `onRegenerateImage` | `function` | Tạo lại ảnh |
| `onDeleteMessage` | `function` | Xóa tin nhắn |
| `characters` | `Character[]` | Danh sách nhân vật |
| `reviewVocabularies` | `VocabularyItem[]` | Từ cần ôn |
| `onSuggestWithVocabulary` | `function` | Gợi ý chat với từ |

#### Sub-components

**VocabHints** - Panel hiển thị từ vựng cần ôn:
- `showPanel` state để ẩn/hiện
- Click vào từ → gọi `onSuggest` để tạo gợi ý chat

#### Internal Functions

| Function | Mô tả |
|----------|-------|
| `useEffect` (scroll) | Auto-scroll xuống khi có tin nhắn mới |

---

### 13.2 MessageBubble.tsx (677 lines)

**Mục đích**: Hiển thị một tin nhắn với đầy đủ tính năng: audio, dịch, edit, collect từ vựng.

#### Props

| Prop | Type | Mô tả |
|------|------|-------|
| `message` | `Message` | Tin nhắn cần hiển thị |
| `onReplayAudio` | `function` | Phát lại audio |
| `onGenerateAudio` | `function` | Tạo audio mới |
| `onTranslate` | `function` | Dịch text |
| `onStoreTranslation` | `function` | Lưu bản dịch |
| `onRetry` | `function` | Retry tin nhắn |
| `isJournalView` | `boolean` | Đang ở view journal |
| `editingMessageId` | `string\|null` | ID tin đang edit |
| `setEditingMessageId` | `function` | Set ID tin edit |
| `onUpdateMessage` | `function` | Update user message |
| `onUpdateBotMessage` | `function` | Update bot message |
| `onRegenerateTone` | `function` | Regenerate TTS tone |
| `onCollectVocabulary` | `function` | Thu thập từ vựng |
| `onRegenerateImage` | `function` | Regenerate hình |
| `onDeleteMessage` | `function` | Xóa tin nhắn |
| `avatarUrl` | `string` | URL avatar nhân vật |

#### State Variables

| State | Type | Mô tả |
|-------|------|-------|
| `isExpanded` | `boolean` | Đang hiển thị bản dịch |
| `isTranslating` | `boolean` | Đang dịch |
| `isCopied` | `boolean` | Đã copy vào clipboard |
| `isGeneratingAudio` | `boolean` | Đang tạo audio |
| `selectedText` | `string` | Text được bôi đen |
| `showCollectButton` | `boolean` | Hiện nút collect từ |
| `isCollecting` | `boolean` | Đang collect từ |
| `editedText` | `string` | Text đang edit |
| `editedTone` | `string` | Tone đang edit |
| `isSaving` | `boolean` | Đang lưu |
| `isRegeneratingTone` | `boolean` | Đang regen tone |
| `isRegeneratingImage` | `boolean` | Đang regen hình |

#### Internal Functions

| Function | Mô tả |
|----------|-------|
| `renderBoldText(text)` | Convert `**text**` → `<strong>` purple |
| `HiddenWordsText` | Component render từ ẩn click-to-reveal |
| `handleAudioClick()` | Phát audio hoặc generate nếu chưa có |
| `handleRegenerateAudioClick()` | Force regenerate audio |
| `handleTranslateClick()` | Dịch hoặc toggle hiển thị bản dịch |
| `handleCopyClick()` | Copy rawText vào clipboard |
| `handleStartEdit()` | Bắt đầu edit message |
| `handleSaveEdit()` | Lưu message đã edit |
| `handleCancelEdit()` | Hủy edit |
| `handleRegenToneClick()` | Tạo lại tone cho TTS |
| `handleRegenerateImageClick()` | Tạo lại hình minh họa |
| `handleTextSelection()` | Xử lý khi user bôi đen text |
| `handleCollectVocab()` | Thu thập từ vựng từ text bôi đen |
| `handleDeleteClick()` | Xóa tin nhắn |

#### Tính năng Hidden Words

```tsx
// Text: "오늘 **날씨**가 좋아요"
// → "날씨" được ẩn thành box màu xám
// → Click vào box → reveal từ với màu purple
```

---

### 13.3 ChatInput.tsx

**Mục đích**: Component input đơn giản cho chat.

#### Props

| Prop | Type | Mô tả |
|------|------|-------|
| `onSendMessage` | `function` | Callback gửi tin |
| `isLoading` | `boolean` | Đang loading |

#### Internal Functions

| Function | Mô tả |
|----------|-------|
| `handleSubmit(e)` | Submit form → gọi `onSendMessage` |
| `handleKeyDown(e)` | Enter không shift → submit |

---

### 13.4 MessageInput.tsx (333 lines)

**Mục đích**: Input nâng cao với voice recording, emoji, suggestions.

#### Props

| Prop | Type | Mô tả |
|------|------|-------|
| `onSendMessage` | `function` | Gửi text message |
| `isLoading` | `boolean` | Đang loading |
| `onSummarize` | `function` | Kết thúc ngày |
| `suggestions` | `string[]` | Gợi ý tin nhắn |
| `onGenerateSuggestions` | `function` | Tạo gợi ý |
| `isGeneratingSuggestions` | `boolean` | Đang tạo gợi ý |
| `onSendAudio` | `function` | Gửi audio message |
| `footerChildren` | `ReactNode` | Content phía dưới |

#### State Variables

| State | Type | Mô tả |
|-------|------|-------|
| `inputValue` | `string` | Giá trị input |
| `showEmojiPicker` | `boolean` | Hiện emoji picker |
| `isRecording` | `boolean` | Đang ghi âm |
| `recordingDuration` | `number` | Thời gian ghi (giây) |

#### Refs

| Ref | Mô tả |
|-----|-------|
| `mediaRecorderRef` | MediaRecorder instance |
| `audioChunksRef` | Chunks audio data |
| `recordingStartTimeRef` | Timestamp bắt đầu ghi |
| `recordingIntervalRef` | Interval cập nhật duration |

#### Internal Functions

| Function | Mô tả |
|----------|-------|
| `blobToBase64(blob)` | Convert audio blob → base64 |
| `startRecording()` | Bắt đầu ghi âm với MediaRecorder |
| `stopRecording()` | Dừng ghi và gửi audio |
| `cancelRecording()` | Hủy ghi âm |
| `formatDuration(seconds)` | Format "m:ss" |
| `handleSubmit(e)` | Submit text message |

---

### 13.5 JournalViewer.tsx (849 lines)

**Mục đích**: Xem lịch sử hội thoại với các tính năng quản lý.

#### Props

| Prop | Type | Mô tả |
|------|------|-------|
| `journal` | `DailyChat[]` | Lịch sử chat |
| `onReplayAudio` | `function` | Phát audio |
| `onPreloadAudio` | `function` | Preload audio |
| `onBackToChat` | `function` | Quay lại chat |
| `isGeneratingThoughts` | `string\|null` | ID đang tạo thoughts |
| `onGenerateThoughts` | `function` | Tạo character thoughts |
| `relationshipSummary` | `string` | Tóm tắt relationships |
| `onUpdateRelationshipSummary` | `function` | Cập nhật relationship |
| `isGeneratingVocabulary` | `string\|null` | ID đang tạo vocab |
| `onGenerateVocabulary` | `function` | Tạo từ vựng |
| `onStartVocabulary` | `function` | Bắt đầu học từ |
| `onStartReview` | `function` | Bắt đầu ôn tập |
| `reviewDueCount` | `number` | Số từ cần ôn |
| `streak` | `StreakData` | Dữ liệu streak |
| `onCollectVocabulary` | `function` | Thu thập từ |
| `onDownloadTxt` | `function` | Download txt |
| `characters` | `Character[]` | Nhân vật |
| `onTranslate` | `function` | Dịch |
| `onStoreTranslation` | `function` | Lưu dịch |
| `onUpdateDailySummary` | `function` | Sửa summary |

#### Sub-component: DailyEntry

Hiển thị một ngày hội thoại:

| State | Mô tả |
|-------|-------|
| `isExpanded` | Đang mở rộng |
| `isAutoPlaying` | Đang auto play |
| `isPreloading` | Đang preload audio |
| `isEditingSummary` | Đang edit summary |
| `editedSummary` | Nội dung summary edit |
| `currentPlayingIndex` | Index tin đang phát |

| Function | Mô tả |
|----------|-------|
| `handlePreloadAudio()` | Preload tất cả audio của ngày |
| `handleAutoPlay()` | Auto play từng tin nhắn |

---

### 13.6 VocabularyConversation.tsx (1682 lines)

**Mục đích**: Học từ vựng qua hội thoại với 2 chế độ: Passive và Active.

#### Props

| Prop | Type | Mô tả |
|------|------|-------|
| `vocabularies` | `VocabularyItem[]` | Từ vựng cần học |
| `characters` | `Character[]` | Nhân vật |
| `context` | `string` | Ngữ cảnh |
| `currentLevel` | `string` | Level tiếng Hàn |
| `onComplete` | `function` | Callback hoàn thành |
| `onBack` | `function` | Quay lại |
| `playAudio` | `function` | Phát audio |
| `isReviewMode` | `boolean` | Chế độ ôn tập |
| `reviewSchedule` | `VocabularyReview[]` | Lịch ôn |
| `relationshipSummary` | `string` | Tóm tắt relationships |
| `formattedJournalForSearch` | `FormattedJournal` | Journal đã format |
| `journal` | `DailyChat[]` | Full journal |

#### State Variables

| State | Type | Mô tả |
|-------|------|-------|
| `messages` | `Message[]` | Tin nhắn hội thoại |
| `learningMode` | `'passive'\|'active'\|null` | Chế độ học |
| `isGenerating` | `boolean` | Đang generate |
| `isPaused` | `boolean` | Đang pause |
| `currentCount` | `number` | Số tin nhắn hiện tại |
| `topic` | `string` | Chủ đề hội thoại |
| `isStarted` | `boolean` | Đã bắt đầu |
| `isCompleted` | `boolean` | Đã hoàn thành |
| `isWaitingForContinue` | `boolean` | Chờ user bấm tiếp |
| `batchCount` | `number` | Số batch đã chạy |
| `suggestedTopic` | `string` | Chủ đề AI gợi ý |
| `showMeaning` | `boolean` | Hiện nghĩa Việt |
| `selectedVocabIds` | `Set<string>` | Từ đã chọn |
| `selectedCharacterIds` | `string[]` | Nhân vật đã chọn |
| `isActiveLoading` | `boolean` | Active mode loading |
| `isAISearching` | `boolean` | AI đang search |

#### Internal Functions

| Function | Mô tả |
|----------|-------|
| `handleSystemCommand(text, count)` | Xử lý AI search command |
| `toggleCharacter(id)` | Toggle chọn nhân vật |
| `toggleVocab(id)` | Toggle chọn từ vựng |
| `toggleAllVocabs()` | Chọn/bỏ tất cả từ |
| `handleSuggestTopic()` | AI gợi ý chủ đề |
| `generateTopicFromVocabularies()` | Tạo topic từ từ vựng |
| `fetchNextBatch()` | Prefetch batch tiếp theo |
| `processBotResponsesSequentially(responses)` | Xử lý tuần tự responses |
| `startConversation()` | Bắt đầu passive mode |
| `pauseConversation()` | Pause |
| `resumeConversation()` | Resume |
| `stopConversation()` | Dừng |
| `handleComplete()` | Hoàn thành học |
| `handleContinue()` | Tiếp tục sau batch |
| `handleReplayAudio(audio, char)` | Phát lại audio |
| `handleReplayAll()` | Nghe lại toàn bộ |
| `stopReplay()` | Dừng replay |
| `startActiveLearning()` | Bắt đầu active mode |
| `processActiveBotResponses(responses)` | Xử lý active responses |
| `handleActiveSendMessage(text)` | Gửi tin active mode |
| `handleActiveSendAudio(audio, duration)` | Gửi audio active mode |

#### Batch Processing

- `MESSAGES_PER_BATCH = 10` - Dừng sau mỗi 10 tin nhắn
- User phải bấm "Tiếp tục" để xem thêm
- Prefetch batch tiếp theo khi còn 2-3 tin cuối

---

### 13.7 VocabularyScene.tsx (341 lines)

**Mục đích**: Quiz học từ vựng mới với 2 loại quiz.

#### Props

| Prop | Type | Mô tả |
|------|------|-------|
| `vocabularies` | `VocabularyItem[]` | Từ cần học |
| `messages` | `Message[]` | Messages context |
| `quizState` | `QuizState` | State quiz |
| `onUpdateQuizState` | `function` | Update state |
| `onViewContext` | `function` | Xem context |
| `onComplete` | `function` | Hoàn thành |
| `onBack` | `function` | Quay lại |
| `onReplayAudio` | `function` | Phát audio |

#### State Variables

| State | Type | Mô tả |
|-------|------|-------|
| `currentQuiz` | `MeaningQuiz\|FillBlankQuiz` | Quiz hiện tại |
| `selectedAnswer` | `number\|null` | Đáp án đã chọn |
| `showResult` | `boolean` | Hiện kết quả |
| `isCorrect` | `boolean` | Đáp án đúng |

#### Quiz Types

1. **MeaningQuiz**: Korean → Vietnamese multiple choice
2. **FillBlankQuiz**: Điền từ vào chỗ trống trong câu

#### Internal Functions

| Function | Mô tả |
|----------|-------|
| `getCurrentVocabularies()` | Lấy từ hiện tại (normal/review) |
| `handleAnswerSelect(index)` | Chọn đáp án |
| `handleSubmit()` | Submit đáp án |
| `handleNext()` | Chuyển quiz tiếp |
| `handleViewContext()` | Xem từ trong context |

---

### 13.8 ReviewScene.tsx (371 lines)

**Mục đích**: Ôn tập từ vựng với quiz ngẫu nhiên.

#### Props

| Prop | Type | Mô tả |
|------|------|-------|
| `reviewItems` | `ReviewItem[]` | Từ cần ôn |
| `onComplete` | `function` | Hoàn thành |
| `onBack` | `function` | Quay lại |
| `onReplayAudio` | `function` | Phát audio |
| `onViewContext` | `function` | Xem context |
| `characters` | `Character[]` | Nhân vật |

#### Quiz Generation

- Mỗi từ có 2 quiz: meaning + fill-blank
- Trộn ngẫu nhiên với Fisher-Yates algorithm
- Track kết quả riêng cho từng từ

#### State Variables

| State | Type | Mô tả |
|-------|------|-------|
| `currentQuizIndex` | `number` | Index quiz hiện tại |
| `currentQuiz` | `MeaningQuiz\|FillBlankQuiz` | Quiz hiện tại |
| `selectedAnswer` | `number\|null` | Đáp án đã chọn |
| `showResult` | `boolean` | Hiện kết quả |
| `isCorrect` | `boolean` | Đúng/sai |
| `results` | `Map` | Kết quả từng từ |
| `contextViewState` | `object\|null` | State context viewer |

---

### 13.9 CharacterManager.tsx (502 lines)

**Mục đích**: Quản lý nhân vật AI và cốt truyện.

#### Props

| Prop | Type | Mô tả |
|------|------|-------|
| `isOpen` | `boolean` | Đang mở |
| `onClose` | `function` | Đóng modal |
| `characters` | `Character[]` | Nhân vật |
| `setCharacters` | `function` | Update nhân vật |
| `activeCharacterIds` | `string[]` | ID active |
| `setActiveCharacterIds` | `function` | Update active |
| `textToSpeech` | `function` | TTS function |
| `playAudio` | `function` | Play audio |
| `storyPlot` | `string` | Cốt truyện |
| `setStoryPlot` | `function` | Update cốt truyện |

#### Tính năng

1. **Quản lý cốt truyện**: Textarea cho storyPlot
2. **Thêm nhân vật**: Form với name, personality, gender, voice, pitch, rate, avatar
3. **Edit nhân vật**: Inline editing với relationships và opinions
4. **Voice preview**: Test voice với settings
5. **Toggle active**: Chọn nhân vật trong cảnh

#### Voice Options

```typescript
AVAILABLE_VOICES = [
  { value: "alloy", label: "Alloy – Nữ trẻ, tự nhiên" },
  { value: "ballad", label: "Ballad – Nữ dịu dàng" },
  { value: "coral", label: "Coral – Nữ tươi sáng" },
  { value: "cedar", label: "Cedar – Nam trầm ấm" },
  // ...
];
```

#### Internal Functions

| Function | Mô tả |
|----------|-------|
| `handleFileChange(e, isNew)` | Upload avatar |
| `handleToggleActive(id)` | Toggle nhân vật active |
| `handleAddCharacter(e)` | Thêm nhân vật mới |
| `startEditing(char)` | Bắt đầu edit |
| `cancelEditing()` | Hủy edit |
| `saveChanges()` | Lưu thay đổi |
| `isPredefined(id)` | Check nhân vật mặc định |
| `deleteCharacter(id)` | Xóa nhân vật |
| `handlePreviewAudio(...)` | Preview voice |
| `updateRelationOpinion(...)` | Update relation |
| `updateUserOpinion(...)` | Update opinion về user |

---

### 13.10 AutoChatModal.tsx (474 lines)

**Mục đích**: Tự động generate hội thoại giữa các nhân vật.

#### Props

| Prop | Type | Mô tả |
|------|------|-------|
| `isOpen` | `boolean` | Đang mở |
| `onClose` | `function` | Đóng |
| `characters` | `Character[]` | Nhân vật |
| `context` | `string` | Ngữ cảnh |
| `currentLevel` | `string` | Level |
| `currentMessages` | `Message[]` | Messages hiện tại |
| `onNewMessage` | `function` | Callback tin mới |
| `playAudio` | `function` | Phát audio |
| `onGeneratingChange` | `function` | Thông báo đang generate |

#### State Variables

| State | Type | Mô tả |
|-------|------|-------|
| `topic` | `string` | Chủ đề |
| `vocabulary` | `string` | Từ vựng (comma-separated) |
| `isGenerating` | `boolean` | Đang generate |
| `isPaused` | `boolean` | Đang pause |
| `targetCount` | `number` | Số tin mục tiêu |
| `currentCount` | `number` | Số tin hiện tại |
| `generateAudio` | `boolean` | Có tạo audio |
| `messageDelay` | `number` | Delay giữa tin (giây) |

#### Internal Functions

| Function | Mô tả |
|----------|-------|
| `fetchNextBatch()` | Prefetch batch tiếp |
| `processBotResponsesSequentially(responses)` | Xử lý tuần tự |
| `startGeneration()` | Bắt đầu generate |
| `pauseGeneration()` | Pause |
| `resumeGeneration()` | Resume |
| `stopGeneration()` | Dừng |
| `handleClose()` | Đóng modal |

---

## 14. Chi tiết App.tsx Functions

### 14.1 State Initialization

| State | Type | Default | Mô tả |
|-------|------|---------|-------|
| `journal` | `DailyChat[]` | `[]` | Toàn bộ lịch sử |
| `isLoading` | `boolean` | `false` | Đang chờ AI |
| `isSummarizing` | `boolean` | `false` | Đang tóm tắt |
| `view` | `string` | `'chat'` | View hiện tại |
| `characters` | `Character[]` | `initialCharacters` | Nhân vật |
| `activeCharacterIds` | `string[]` | `['mimi']` | Nhân vật active |
| `context` | `string` | `"at Mimi's house"` | Ngữ cảnh |
| `relationshipSummary` | `string` | `''` | Tóm tắt relationships |
| `contextSuggestions` | `string[]` | `[]` | Gợi ý context |
| `messageSuggestions` | `string[]` | `[]` | Gợi ý message |
| `messageSuggestionsLocked` | `boolean` | `false` | Lock gợi ý |
| `editingMessageId` | `string\|null` | `null` | ID tin đang edit |
| `selectedDailyChatId` | `string\|null` | `null` | DailyChat đang xem |
| `vocabLearningVocabs` | `VocabularyItem[]` | `[]` | Từ đang học |
| `currentReviewItems` | `array\|null` | `null` | Từ đang ôn |
| `chatReviewVocabularies` | `array` | `[]` | Từ hint trong chat |
| `streak` | `StreakData` | `initializeStreak()` | Dữ liệu streak |
| `currentLevel` | `KoreanLevel` | `'A1'` | Level tiếng Hàn |
| `storiesIndex` | `StoriesIndex` | `{ stories: [] }` | Index truyện |
| `currentStoryId` | `string\|null` | `null` | ID truyện hiện tại |
| `realtimeContext` | `string` | `''` | Context động |
| `storyPlot` | `string` | `''` | Cốt truyện |
| `checkPronunciation` | `boolean` | `false` | Check phát âm |
| `isAISearching` | `boolean` | `false` | AI đang search |
| `isGeminiInitialized` | `boolean` | `false` | Gemini đã init |
| `isDataLoaded` | `boolean` | `false` | Data đã load |
| `isSaving` | `boolean` | `false` | Đang save |

### 14.2 Refs

| Ref | Type | Mô tả |
|-----|------|-------|
| `userPromptRef` | `string` | Text user vừa gửi |
| `chatRef` | `Chat\|null` | Gemini chat session |
| `audioContextRef` | `AudioContext\|null` | Web Audio context |
| `audioCacheRef` | `Map<string, AudioBuffer>` | Cache audio đã decode |

### 14.3 Memoized Values

| Name | Dependencies | Mô tả |
|------|--------------|-------|
| `formattedJournalForSearch` | `[journal]` | Journal đã format cho search |

### 14.4 Helper Functions

#### `getActiveCharacters()`
```typescript
// Lấy danh sách nhân vật active
const getActiveCharacters = useCallback(() => {
  return characters.filter(c => activeCharacterIds.includes(c.id));
}, [characters, activeCharacterIds]);
```

#### `getCurrentChat()`
```typescript
// Lấy DailyChat hiện tại (cuối array)
const getCurrentChat = (): DailyChat | null => {
  if (journal.length === 0) return null;
  return journal[journal.length - 1];
};
```

#### `getCurrentDailyChatId()`
```typescript
// Lấy ID của chat hiện tại
const getCurrentDailyChatId = (): string => {
  const currentChat = getCurrentChat();
  return currentChat?.id || '';
};
```

#### `restoreReviewVocabulariesFromIds(vocabIds, journalData)`
```typescript
// Khôi phục chatReviewVocabularies từ saved IDs
// Dùng khi load data
```

### 14.5 Audio Functions

#### `decode(base64): Uint8Array`
```typescript
// Decode base64 string → Uint8Array bytes
```

#### `decodeAudioData(data, ctx): Promise<AudioBuffer>`
```typescript
// Decode raw audio data (Int16) → AudioBuffer
// Sample rate: 24000Hz, mono channel
```

#### `playAudio(audioData, speakingRate?, pitch?)`
```typescript
// Phát audio file với adjustable rate và pitch
// 1. Tạo/resume AudioContext
// 2. Check cache hoặc download + decode
// 3. Tạo BufferSource với playbackRate và detune
// 4. Connect và play
```

#### `preloadAudio(audioData)`
```typescript
// Tải trước audio vào cache
// Dùng cho offline playback
```

#### `handleReplayAudio(audioData, characterName?)`
```typescript
// Phát lại audio với settings của nhân vật
```

### 14.6 State Update Functions

#### `updateJournal(updater)`
```typescript
// Wrapper để update journal state
```

#### `handleUpdateDailySummary(dailyChatId, newSummary)`
```typescript
// Cập nhật summary của một DailyChat
```

#### `handleStreakUpdate(activityType)`
```typescript
// Cập nhật streak sau activity (chat/review/learn)
// Hiện celebration nếu streak tăng
// Save streak lên server
```

#### `updateCurrentChatMessages(updater)`
```typescript
// Cập nhật messages của chat hiện tại
// updater: (prevMessages) => newMessages
```

### 14.7 AI System Command Handler

#### `handleSystemCommand(commandText, searchCount)`
```typescript
// Input: "SEARCH:keyword" hoặc "GET_JOURNAL:5" hoặc "GET_MESSAGE:379"
// Output: { result: string, newSearchCount: number } | null

// Flow:
// 1. Parse command với parseSystemCommand()
// 2. Check search limit (max 3)
// 3. Execute với executeSystemCommand()
// 4. Return result để gửi lại cho AI
```

### 14.8 Bot Response Processing

#### `processBotResponsesSequentially(responses)`
```typescript
// Xử lý tuần tự các response từ AI
// Input: [{ CharacterName, Text, Tone, Translation }]

// Flow cho mỗi response:
// 1. Lấy character info (voice, pitch, rate)
// 2. Generate TTS audio
// 3. Tạo Message object
// 4. Update UI với message
// 5. Play audio
// 6. Delay 1.2s
```

### 14.9 Message Handlers

#### `handleSendMessage(text)`
```typescript
// Gửi text message
// Flow:
// 1. Clear suggestions
// 2. Add user message to UI
// 3. Build messageForAI (với realtimeContext nếu có)
// 4. Init chat session nếu cần
// 5. Send message → nhận JSON response
// 6. Parse & validate response
// 7. Retry nếu invalid (max 20 lần)
// 8. Handle System commands (SEARCH/GET_JOURNAL/GET_MESSAGE)
//    - Max 3 searches per response
//    - Process character responses trước khi search
//    - Send search results back to AI
// 9. Update realtimeContext nếu AI suggest
// 10. Process character responses
// 11. Update streak
```

#### `handleSendAudio(audioBase64, duration)`
```typescript
// Gửi voice message
// Flow:
// 1. Upload audio lên server
// 2. Add user voice message
// 3. Send audio to Gemini (webm format)
// 4. Parse response (có UserTranscript)
// 5. Update message với transcript
// 6. Handle System commands
// 7. Process bot responses
// 8. Update streak
```

#### `handleUpdateMessage(messageId, newText)`
```typescript
// Edit user message và regenerate AI response
// Flow:
// 1. Slice messages đến trước edit point
// 2. Update UI với edited message
// 3. Rebuild chat history cho Gemini
// 4. Re-init chat session
// 5. Send edited message
// 6. Handle System commands
// 7. Process new responses
```

#### `handleUpdateBotMessage(messageId, newText, newTone)`
```typescript
// Edit bot message
// Flow:
// 1. Find message
// 2. Regenerate audio với new text/tone
// 3. Update message trong state
// 4. Play new audio
```

#### `handleRetry()`
```typescript
// Retry tin nhắn cuối
// Flow:
// 1. Find last user message
// 2. Slice messages đến user message
// 3. Update UI
// 4. Rebuild và re-init chat
// 5. Resend message
// 6. Handle System commands
// 7. Process responses
```

### 14.10 Generation Functions

#### `handleRegenerateTone(text, characterName)`
```typescript
// Tạo lại TTS tone description cho text
```

#### `handleGenerateContextSuggestion()`
```typescript
// Generate context suggestions từ AI
// Dựa trên active characters và pending vocab
```

#### `handleGenerateMessageSuggestions()`
```typescript
// Generate message suggestions cho user
```

#### `handleGenerateAudio(messageId, force?)`
```typescript
// Generate/regenerate audio cho một message
```

#### `handleGenerateAndShowThoughts(dailyChatId)`
```typescript
// Generate character thoughts cho một ngày
```

#### `handleGenerateVocabulary(dailyChatId)`
```typescript
// Auto-generate vocabulary từ conversation
```

#### `handleGenerateSceneImage()`
```typescript
// Generate ảnh minh họa cho scene hiện tại
```

#### `handleRegenerateImage(messageId)`
```typescript
// Regenerate ảnh cho một message cụ thể
```

### 14.11 Vocabulary Functions

#### `getTranslationAndExplanation(text)`
```typescript
// Dịch và giải thích Korean text
```

#### `handleStoreTranslation(messageId, translation)`
```typescript
// Lưu bản dịch vào message (current chat)
```

#### `handleStoreTranslationJournal(messageId, translation, dailyChatId)`
```typescript
// Lưu bản dịch vào message (journal view)
```

#### `handleCollectVocabulary(korean, messageId, dailyChatId)`
```typescript
// Thu thập từ vựng từ text highlight
// 1. Check duplicate
// 2. Translate word
// 3. Add to dailyChat.vocabularies
```

#### `handleStartVocabulary(dailyChatId)`
```typescript
// Bắt đầu học từ vựng cho một ngày
```

#### `handleSuggestWithVocabulary(vocabulary)`
```typescript
// Tạo message suggestions dựa trên từ vựng
// Lock suggestions để không bị thay đổi
```

#### `handleViewContext(vocabulary, usageIndex)`
```typescript
// Xem từ vựng trong context (từ vocabulary learning)
```

#### `handleViewContextFromReview(vocabulary, usageIndex)`
```typescript
// Xem từ vựng trong context (từ review mode)
```

### 14.12 Review Functions

#### `handleVocabConversationComplete(learnedVocabIds)`
```typescript
// Hoàn thành học từ vựng
// 1. Mark learned vocabs
// 2. Create/update reviewSchedule
// 3. Save to server
// 4. Update streak
// 5. Return to journal
```

#### `handleStartReview()`
```typescript
// Bắt đầu ôn tập
// 1. Get vocabularies due for review
// 2. Exclude words đang trong chatReviewVocabularies
// 3. Store in currentReviewItems
// 4. Switch to review view
```

#### `handleReviewConversationComplete(learnedVocabIds)`
```typescript
// Hoàn thành ôn tập
// 1. Create results (all correct for conversation-based)
// 2. Update reviewSchedule với spaced repetition
// 3. Save to server
// 4. Update streak
// 5. Return to journal
```

### 14.13 Day Management

#### `handleEndDay()`
```typescript
// Kết thúc ngày / Tóm tắt conversation
// Flow:
// 1. Generate summary từ AI
// 2. Generate relationship summary
// 3. Update review schedules cho từ đã dùng trong chat
// 4. Create new DailyChat
// 5. Get new review vocabularies cho chat hints
// 6. Re-init chat với summary
```

### 14.14 Story Management

#### `handleCreateStory()`
```typescript
// Tạo story mới
// 1. Create new story entry
// 2. Save to server
// 3. Load new story
```

#### `handleSwitchStory(storyId)`
```typescript
// Switch sang story khác
// 1. Save current story
// 2. Load target story
```

#### `handleDeleteStory(storyId)`
```typescript
// Xóa story
// 1. Confirm
// 2. Delete on server
// 3. Update index
// 4. Switch to another story if needed
```

#### `saveCurrentStory()`
```typescript
// Save story hiện tại lên server
```

#### `loadStory(storyId)`
```typescript
// Load story từ server
```

#### `processLoadedData(loadedData, storyId)`
```typescript
// Process data sau khi load
// 1. Parse journal, characters, settings
// 2. Restore chatReviewVocabularies
// 3. Init chat session
// 4. Update all state
```

### 14.15 Level Management

#### `handleLevelChange(newLevel)`
```typescript
// Thay đổi Korean level
// 1. Update state
// 2. Re-init chat với level mới
// 3. Save to server
```

### 14.16 Save/Load Functions

#### `handleSaveJournal()`
```typescript
// Manual save journal
```

#### `handleDownloadJournal()`
```typescript
// Download journal as JSON file
```

#### `handleDownloadTxt(dailyChatId)`
```typescript
// Download một ngày dạng plain text
```

#### `handleLoadJournal(event)`
```typescript
// Load journal từ file upload
```

#### `handleBatchDownloadStories()`
```typescript
// Download nhiều stories đã chọn
```

### 14.17 Auto Chat

#### `handleAutoChatNewMessage(message)`
```typescript
// Callback khi AutoChat tạo tin mới
// Add message vào current chat
```

### 14.18 Effects

#### Gemini Init Effect
```typescript
useEffect(() => {
  // Init Gemini service khi mount
  initService().then(() => setIsGeminiInitialized(true));
}, []);
```

#### Chat Session Init Effect
```typescript
useEffect(() => {
  // Re-init chat session khi:
  // - context thay đổi
  // - activeCharacterIds thay đổi
  // - characters thay đổi
  // - relationshipSummary thay đổi
  // - storyPlot thay đổi
  // - checkPronunciation thay đổi
}, [context, activeCharacterIds, ...]);
```

#### Data Load Effect
```typescript
useEffect(() => {
  // Load data sau khi Gemini init
  if (!isGeminiInitialized) return;
  LoadData();
}, [isGeminiInitialized]);
```

#### Auto-save Effect
```typescript
useEffect(() => {
  // Auto-save với debounce 3s
  // Trigger khi journal, characters, settings thay đổi
}, [journal, characters, ...]);
```

---

*Tài liệu được cập nhật: 01/01/2026*

---

## 15. FSRS Algorithm (Free Spaced Repetition Scheduler)

### 15.1 Tổng quan FSRS

**FSRS** là thuật toán spaced repetition hiện đại, thay thế thuật toán SM-2 truyền thống. MimiChat sử dụng thư viện **ts-fsrs** để tính toán chính xác.

```
┌─────────────────────────────────────────────────────────────────┐
│                    FSRS CORE CONCEPTS                            │
├─────────────────────────────────────────────────────────────────┤
│  STABILITY (S)                                                   │
│  - Số ngày cho đến khi xác suất nhớ giảm xuống 90%              │
│  - S cao = từ được nhớ tốt, khoảng cách ôn dài hơn              │
│  - VD: S=7 → sau 7 ngày, xác suất nhớ = 90%                     │
├─────────────────────────────────────────────────────────────────┤
│  DIFFICULTY (D)                                                  │
│  - Độ khó ghi nhớ từ [1-10]                                     │
│  - D cao = từ khó nhớ, cần ôn thường xuyên hơn                  │
│  - Tự động điều chỉnh dựa trên lịch sử ôn                       │
├─────────────────────────────────────────────────────────────────┤
│  RETRIEVABILITY (R)                                              │
│  - Xác suất có thể nhớ được tại thời điểm hiện tại              │
│  - R = (1 + FACTOR × t / S) ^ DECAY                             │
│  - Giảm dần theo thời gian kể từ lần ôn cuối                    │
└─────────────────────────────────────────────────────────────────┘
```

### 15.2 Rating System

MimiChat sử dụng 3 mức đánh giá:

| Rating | Ý nghĩa | ts-fsrs Rating | Hệ quả |
|--------|---------|----------------|--------|
| 1 - Again | 😔 Quên | `Rating.Again` | Reset stability, tăng lapses |
| 2 - Hard | 🤔 Nhớ qua ký ức | `Rating.Hard` | Tăng stability chậm |
| 3 - Good | 😊 Nhớ ngay | `Rating.Good` | Tăng stability bình thường |

### 15.3 FSRS Settings

```typescript
interface FSRSSettings {
  maxReviewsPerDay: number;  // Mặc định: 50 - Số từ ôn tối đa/ngày
  newCardsPerDay: number;    // Mặc định: 20 - Số từ mới thêm/ngày
  desiredRetention: number;  // Mặc định: 0.9 (90%) - Tỷ lệ ghi nhớ mong muốn
}
```

### 15.4 Công thức Retrievability

```
R = (1 + FACTOR × elapsed_days / S) ^ DECAY

Trong đó:
- FACTOR ≈ 19/81 ≈ 0.2346
- DECAY = -0.5
- S = Stability
- elapsed_days = Số ngày từ lần ôn cuối

Ví dụ: S = 10 ngày, elapsed = 5 ngày
R = (1 + 0.2346 × 5 / 10) ^ -0.5
R = (1 + 0.1173) ^ -0.5
R ≈ 0.946 (94.6%)
```

### 15.5 Initial Review cho Từ Mới

Khi user học từ mới trong tab "🆕 Từ mới" và đánh giá:

| Đánh giá | Interval | Initial Stability | Initial Difficulty |
|----------|----------|-------------------|-------------------|
| 😊 Dễ | 7 ngày | 7 | 3 |
| 🤔 Bình thường | 3 ngày | 3 | 5 |
| 😰 Khó | 1 ngày | 1 | 7 |

### 15.6 Main Functions

| Function | Mô tả |
|----------|-------|
| `updateFSRSReview(review, rating, settings)` | Cập nhật review sau khi đánh giá |
| `calculateRetrievability(stability, elapsedDays)` | Tính xác suất nhớ |
| `getVocabulariesDueForMemoryReview(journal, settings)` | Lấy từ cần ôn hôm nay |
| `getNewVocabulariesWithoutReview(journal)` | Lấy từ chưa có review |
| `migrateLegacyToFSRS(review)` | Chuyển đổi review cũ sang FSRS |
| `getVocabularyStats(journal, settings)` | Thống kê từ vựng |

### 15.7 FSRS Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Từ mới vào hệ thống (chưa có review)                         │
│    - Hiển thị trong tab "🆕 Từ mới"                             │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. User học và đánh giá (easy/medium/hard)                      │
│    - initializeFSRSWithDifficulty() tạo review                  │
│    - Set initial stability & difficulty                         │
│    - Calculate nextReviewDate                                   │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Đến ngày ôn → xuất hiện trong tab "📚 Ôn tập"                │
│    - getVocabulariesDueForMemoryReview() check                  │
│    - Sort by stability (thấp nhất = urgent nhất)                │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. User ôn tập và đánh giá                                      │
│    - updateFSRSReview() với rating                              │
│    - ts-fsrs tính stability mới, difficulty mới                 │
│    - Ghi vào reviewHistory                                      │
│    - Tính nextReviewDate mới                                    │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Lặp lại từ bước 3                                            │
│    - Stability tăng dần → interval dài hơn                      │
│    - Khi stability >= 30 ngày → considered "Mastered"           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 16. Vocabulary Memory System (Thẻ Ký ức)

### 16.1 Tổng quan

Vocabulary Memory System là hệ thống học từ vựng dựa trên **ký ức cá nhân**. User tạo các "memory" (liên kết, hình ảnh, câu ví dụ) cho mỗi từ vựng để dễ nhớ hơn.

```
┌─────────────────────────────────────────────────────────────────┐
│             VOCABULARY MEMORY ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  VocabularyMemoryScene.tsx (2367 lines)                         │
│       │                                                         │
│       ├── Tab "🆕 Từ mới" ────────► Học từ chưa có review       │
│       │   └── renderNewWordsTab()                               │
│       │       ├── 3 states: word → memory → answer              │
│       │       ├── Pronunciation controls                         │
│       │       ├── Search word in story popup                     │
│       │       └── Rating buttons (easy/medium/hard)             │
│       │                                                         │
│       ├── Tab "📚 Ôn tập" ────────► VocabularyMemoryFlashcard   │
│       │   └── FSRS-based review                                 │
│       │       ├── 3 states: word → memory → answer              │
│       │       ├── Retrievability badge                          │
│       │       └── Rating buttons (again/hard/good)              │
│       │                                                         │
│       └── Tab "✏️ Ký ức" ─────────► VocabularyMemoryEditor      │
│           └── Browse & edit memories                            │
│               ├── Search/filter vocabularies                    │
│               └── Rich text editor với TipTap                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 16.2 Data Structures

#### VocabularyMemoryEntry

```typescript
interface VocabularyMemoryEntry {
  vocabularyId: string;        // Link đến VocabularyItem
  userMemory: string;          // Nội dung ký ức (có thể chứa [MSG:id] và [IMG:url])
  linkedMessageIds: string[];  // IDs của messages được link
  linkedDailyChatId: string;   // DailyChat chứa memory
  createdDate: string;         // ISO date
  updatedDate?: string;        // ISO date (nếu đã update)
}
```

#### Memory Content Format

```
[MSG:messageId] - Link đến một tin nhắn trong hội thoại
[IMG:url]       - Link đến hình ảnh (có thể generate bằng AI)

Ví dụ:
"Nhớ lúc Mimi nói:
[MSG:abc123]
Và hình ảnh này giúp tôi nhớ:
[IMG:/public/imgMessage/xyz.png]
Thật dễ nhớ!"
```

### 16.3 Components Chi tiết

#### VocabularyMemoryScene.tsx (Main Scene)

| State | Type | Mô tả |
|-------|------|-------|
| `activeTab` | `'new' \| 'review' \| 'learn'` | Tab đang active |
| `newWordsQueue` | `array` | Queue từ mới đang học |
| `currentNewWordIndex` | `number` | Index từ hiện tại |
| `newWordState` | `'word' \| 'memory' \| 'answer'` | State của flashcard từ mới |
| `reviewQueue` | `array` | Queue từ cần ôn |
| `currentReviewIndex` | `number` | Index review hiện tại |
| `reviewSessionStats` | `object` | Stats của session |
| `showNewWordMemoryPopup` | `boolean` | Hiện popup xem ký ức |
| `showNewWordSearchPopup` | `boolean` | Hiện popup tìm từ |
| `selectedVocabulary` | `object \| null` | Từ được chọn để edit |

**Memoized Values:**

| Name | Mô tả |
|------|-------|
| `vocabStats` | Thống kê từ vựng (total, withReview, withoutReview, dueToday) |
| `newVocabularies` | Từ chưa có review |
| `allVocabularies` | Tất cả từ với memories |
| `filteredVocabularies` | Từ đã lọc theo filter |
| `dueReviews` | Từ cần ôn hôm nay |
| `newWordProcessedMemoryHtml` | HTML đã xử lý [MSG:][IMG:] |
| `newWordUsageResults` | Kết quả tìm từ trong journal |

#### VocabularyMemoryFlashcard.tsx (Review Card)

| State | Type | Mô tả |
|-------|------|-------|
| `state` | `'word' \| 'memory' \| 'answer'` | State của flashcard |
| `showMemoryPopup` | `boolean` | Hiện popup xem ký ức |
| `showSearchPopup` | `boolean` | Hiện popup tìm từ |
| `selectedCharacterId` | `string` | Nhân vật cho pronunciation |
| `isGeneratingAudio` | `boolean` | Đang generate audio |

**Key Features:**
- Retrievability badge (hiển thị % khả năng nhớ)
- Pronunciation controls (chọn giọng, nghe phát âm)
- Search word in story (tìm từ trong toàn bộ journal)
- Memory popup (xem đầy đủ ký ức)
- Rating buttons với FSRS integration

#### VocabularyMemoryEditor.tsx (Memory Editor)

| Tính năng | Mô tả |
|-----------|-------|
| **Rich Text Editor** | TipTap với custom nodes cho Message và Image |
| **Message Block** | Drag-drop tin nhắn từ conversation |
| **Image Support** | Upload hoặc AI-generate hình ảnh |
| **AI Search** | Tìm kiếm từ vựng trong journal |
| **Journal Preview** | Preview context của tin nhắn |

**Custom TipTap Extensions:**
- `messageBlock` - Node cho tin nhắn được link
- `Image` - Node cho hình ảnh

### 16.4 UI Flow - Tab Từ mới

```
┌─────────────────────────────────────────────────────────────────┐
│                    STATE: 'word'                                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐                                               │
│  │  🆕 Từ mới   │                                               │
│  └──────────────┘                                               │
│                                                                  │
│       무서워                                                     │ ← Korean word
│                                                                  │
│  [Chọn giọng...▼] [🔊]                                          │ ← Pronunciation
│                                                                  │
│  🔍 Tìm trong story (299)                                       │ ← Search button
│                                                                  │
│  ┌────────────────────┐ ┌────────────────────┐                  │
│  │  💭 Xem ký ức     │ │  👁️ Xem đáp án    │                  │
│  └────────────────────┘ └────────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
                              │
            Click "💭 Xem ký ức" │ Click "👁️ Xem đáp án"
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    STATE: 'memory'                               │
├─────────────────────────────────────────────────────────────────┤
│       무서워                                                     │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 💭 KÝ ỨC CỦA BẠN:                     [🔍 Xem đầy đủ] │    │
│  │ ──────────────────────────────────────────────────────── │    │
│  │ "quá dễ"                                                 │    │ ← Memory content
│  │ (hoặc: 📝 Chưa có ký ức [✏️ Thêm ký ức ngay])           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐     │
│  │               👁️ Xem đáp án                           │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    STATE: 'answer'                               │
├─────────────────────────────────────────────────────────────────┤
│       무서워                                                     │
│                                                                  │
│  ┌────────────────────────────────────┐                         │
│  │ 💭 KÝ ỨC: "quá dễ"                 │                         │
│  └────────────────────────────────────┘                         │
│                                                                  │
│  ┌────────────────────────────────────┐                         │
│  │ 📖 Nghĩa:                          │                         │
│  │     sợ quá / đáng sợ              │                         │ ← Vietnamese
│  └────────────────────────────────────┘                         │
│                                                                  │
│  ┌────────┐ ┌────────────┐ ┌────────┐                           │
│  │😰 Khó │ │🤔 Bình thường│ │😊 Dễ  │                           │ ← Rating
│  │ ~1 ngày│ │  ~3 ngày    │ │~7 ngày │                           │
│  └────────┘ └────────────┘ └────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

### 16.5 UI Flow - Tab Ôn tập

```
┌─────────────────────────────────────────────────────────────────┐
│                 REVIEW FLASHCARD                                 │
├─────────────────────────────────────────────────────────────────┤
│                                    ┌───────────┐                │
│                                    │ 96%       │                │ ← Retrievability
│                                    │khả năng nhớ│                │
│                                    └───────────┘                │
│                                                                  │
│              힘내                                                │
│                                                                  │
│  [Chọn giọng...▼] [🔊]                                          │
│                                                                  │
│  🔍 Tìm trong story (38)                                        │
│                                                                  │
│  (Click để xem memory → answer → rate)                          │
│                                                                  │
│  ┌────────┐ ┌──────────────┐ ┌──────────┐                       │
│  │😔 Quên │ │🤔Nhớ qua ký ức│ │😊Nhớ ngay │                       │ ← FSRS Rating
│  │ ~1 ngày│ │   ~X ngày     │ │  ~Y ngày  │                       │
│  └────────┘ └──────────────┘ └──────────┘                       │
├─────────────────────────────────────────────────────────────────┤
│  STATS:                                                         │
│  Stability: X.X ngày │ Difficulty: X.X/10 │ Lapses: X          │
└─────────────────────────────────────────────────────────────────┘
```

### 16.6 Memory Editor Features

```
┌─────────────────────────────────────────────────────────────────┐
│  VOCABULARY MEMORY EDITOR                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Từ: 무서워 = sợ quá                                            │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ [Bold] [Italic] [Image] [Search Message]                    ││
│  │─────────────────────────────────────────────────────────────││
│  │                                                              ││
│  │ Tôi nhớ từ này vì:                                          ││
│  │                                                              ││
│  │ ┌──────────────────────────────────────────────────────┐    ││
│  │ │ ⋮⋮ 👤 Mimi  📅 2025-12-15                      [🔊][✕]│    ││ ← Message Block
│  │ │ 무서워! 귀신이 나타났어!                              │    ││
│  │ └──────────────────────────────────────────────────────┘    ││
│  │                                                              ││
│  │ [Hình ảnh generated]                                        ││
│  │                                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  [🔍 Tìm từ trong story]                                        │ ← AI Search
│                                                                  │
│  ┌──────────────────┐ ┌──────────────────┐                      │
│  │      Hủy         │ │    💾 Lưu        │                      │
│  └──────────────────┘ └──────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

### 16.7 Data Storage Structure

```typescript
// Trong DailyChat
interface DailyChat {
  id: string;
  date: string;
  messages: Message[];
  vocabularies?: VocabularyItem[];        // Từ vựng từ conversation
  reviewSchedule?: VocabularyReview[];    // FSRS scheduling data
  vocabularyMemories?: VocabularyMemoryEntry[]; // User memories
}

// Một từ vựng hoàn chỉnh bao gồm:
// 1. VocabularyItem trong vocabularies[] - từ và nghĩa
// 2. VocabularyReview trong reviewSchedule[] - FSRS data
// 3. VocabularyMemoryEntry trong vocabularyMemories[] - ký ức cá nhân
```

### 16.8 Integration với Streak System

```typescript
// Trong handleNewWordRating()
setNewWordsSessionStats(prev => {
  const newLearned = prev.learned + 1;
  // Update streak khi học >= 10 từ mới
  if (newLearned >= 10) {
    onStreakUpdate?.();
  }
  return { ...prev, learned: newLearned };
});
```

---

## 17. Vocabulary Memory Functions Reference

### 17.1 spacedRepetition.ts Functions

| Function | Input | Output | Mô tả |
|----------|-------|--------|-------|
| `updateFSRSReview` | `(review, rating, settings)` | `VocabularyReview` | Cập nhật review với FSRS |
| `calculateRetrievability` | `(stability, elapsedDays)` | `number [0-1]` | Tính xác suất nhớ |
| `getVocabulariesDueForMemoryReview` | `(journal, settings)` | `array` | Lấy từ cần ôn |
| `getNewVocabulariesWithoutReview` | `(journal)` | `array` | Lấy từ chưa có review |
| `createInitialReview` | `(vocabulary, dailyChatId)` | `VocabularyReview` | Tạo review mới |
| `initializeFSRSWithDifficulty` | `(vocab, chatId, rating)` | `VocabularyReview` | Tạo review với rating |
| `migrateLegacyToFSRS` | `(review)` | `VocabularyReview` | Chuyển đổi legacy |
| `getVocabularyStats` | `(journal, settings)` | `stats object` | Thống kê |
| `getAllVocabulariesWithMemories` | `(journal)` | `array` | Lấy tất cả từ với memory |

### 17.2 Scene Handlers

| Handler | Mô tả |
|---------|-------|
| `handleNewWordRating(rating)` | Xử lý khi user rate từ mới |
| `handleSaveMemory(memory)` | Lưu memory mới/updated |
| `handleReviewComplete(review, rating)` | Xử lý hoàn thành review |
| `handleNewWordPronounce()` | Generate và play pronunciation |

---

*Tài liệu được cập nhật: 04/01/2026*
