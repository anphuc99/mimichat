// ---------------------------
// IMPORTS
// ---------------------------
import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import fs, { unlink, unlinkSync } from "fs";
import path from "path";
// import ffmpeg from "fluent-ffmpeg";
// import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import os from "os";
import { Readable } from "stream";
import { textToSpeech } from "./modules/openai.js";  
import GeminiService from "./modules/geminiService";
import AdmZip from "adm-zip";

import { google } from 'googleapis';
import { pipeline } from 'stream/promises';


const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || ''; 

// ---------------------------
// FIX __dirname trong ESM
// ---------------------------
const __dirname = process.cwd();

// ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Initialize or load persistent JWT secret
const jwtSecretPath = path.join(__dirname, "jwt_secret.key");
let JWT_SECRET: string;
const SERVER_HOST = "https://mimichat.io.vn";

if (fs.existsSync(jwtSecretPath)) {
  JWT_SECRET = fs.readFileSync(jwtSecretPath, "utf-8");
  console.log("Loaded existing JWT secret");
} else {
  JWT_SECRET = generateMD5Hash(crypto.randomUUID() + Date.now().toString());
  fs.writeFileSync(jwtSecretPath, JWT_SECRET);
  console.log("Created new JWT secret");
}

const app = express();
const port = process.env.PORT || 3002;

if (process.env.NODE_ENV === "dev")
{
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

// ---------------------------
// Types
// ---------------------------
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// Helpers
function generateMD5Hash(inputString: string) {
  return crypto.createHash("md5").update(inputString).digest("hex");
}

function cleanBase64(dataUrl: string) {
  return dataUrl.replace(/^data:.*;base64,/, "");
}

// ---------------------------
// Middleware
// ---------------------------
app.use(cors());
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ limit: "500mb", extended: true }));

// Serve static files from public directory with correct MIME types
app.use(express.static(path.join(__dirname, "/public/dist"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    }
  }
}));

// JWT middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  // Skip JWT check for health, login, static files and root
  // startAudioCleanupScheduler();
  if (!req.path.startsWith("/api")) {
    return next();
  }

  if(req.path === "/api/login") return next();

  if(req.path === "/api/deploy-server") return next();

  if(req.path === "/api/deploy-client") return next();

  if(req.path.startsWith("/api/get-audio")) return next();

  if(req.path === "/api/get-data") return next();

  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
});

// ---------------------------
// Routes
// ---------------------------
app.get("/", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "/public/dist/index.html"));
});

app.post("/api/login", (req: Request, res: Response) => {
  const { token } = req.body;
  if (token === process.env.CLIENT_TOKEN) {
    const user = { id: "user1" };
    const accessToken = jwt.sign(user, JWT_SECRET, { expiresIn: "365d" });
    res.json({ accessToken });
  } else {
    res.status(401).send("Unauthorized");
  }
});

app.get("/api/verify", (req: Request, res: Response) => {
  res.json({ verify: true, user: req.user });
});

app.get("/api/get-api-key", (req: Request, res: Response) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });
  res.json({ apiKey });
});

app.get("/health", async (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// ---------------------------
// Load JSON data
// ---------------------------
app.get("/api/data", (req: Request, res: Response) => {  
  getData(req, res); 
});

app.get("/api/get-data", (req: Request, res: Response) => {
  if (req.query.key !== process.env.SERVER_API_KEY) {
    return res.status(403).json({ error: "Invalid API key" });
  }

  try {
    const dataDir = path.join(__dirname, "data");
    if (!fs.existsSync(dataDir)) {
      return res.status(404).json({ error: "Data folder not found" });
    }

    // Create zip file on disk first
    const tmpZipPath = path.join(__dirname, `data-${Date.now()}.zip`);
    const zip = new AdmZip();
    zip.addLocalFolder(dataDir, "data");
    zip.writeZip(tmpZipPath);

    const stat = fs.statSync(tmpZipPath);
    
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="data.zip"');
    res.setHeader("Content-Length", stat.size.toString());

    // Stream the file
    const readStream = fs.createReadStream(tmpZipPath);
    readStream.pipe(res);
    
    // Clean up temp file after streaming
    readStream.on("end", () => {
      fs.unlink(tmpZipPath, () => {});
    });
    
    readStream.on("error", (err) => {
      fs.unlink(tmpZipPath, () => {});
      res.status(500).end();
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Failed to create zip" });
  }
});

const getData = (req: Request, res: Response) => {
  try {
    const dataPath = path.join(__dirname, "data", "data.json");

    if (!fs.existsSync(dataPath)) {
      return res.status(404).json({ error: "Data file not found" });
    }

    const raw = fs.readFileSync(dataPath, "utf-8");
    const parsed = JSON.parse(raw);

    return res.json(parsed);
  } catch {
    return res.status(500).json({ error: "Failed to read data file" });
  }
}

// ---------------------------
// Story Management APIs
// ---------------------------
interface StoryMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  charactersPreview: string[];
  messageCount: number;
}

interface StoriesIndex {
  stories: StoryMeta[];
  lastOpenedStoryId?: string;
}

const STORIES_DIR = path.join(__dirname, "data", "stories");
const STORIES_INDEX_PATH = path.join(__dirname, "data", "stories-index.json");

// Ensure data directory exists first
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ensure stories directory exists
if (!fs.existsSync(STORIES_DIR)) {
  fs.mkdirSync(STORIES_DIR, { recursive: true });
}

// Initialize stories index if not exists
if (!fs.existsSync(STORIES_INDEX_PATH)) {
  // Migrate existing data.json to first story if exists
  const oldDataPath = path.join(__dirname, "data", "data.json");
  if (fs.existsSync(oldDataPath)) {
    const oldData = JSON.parse(fs.readFileSync(oldDataPath, "utf-8"));
    const storyId = crypto.randomUUID();
    const storyMeta: StoryMeta = {
      id: storyId,
      name: "Câu chuyện đầu tiên",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      charactersPreview: (oldData.characters || []).slice(0, 3).map((c: any) => c.name),
      messageCount: (oldData.journal || []).reduce((sum: number, dc: any) => sum + (dc.messages?.length || 0), 0)
    };
    
    // Save story data
    fs.writeFileSync(path.join(STORIES_DIR, `${storyId}.json`), JSON.stringify(oldData, null, 2));
    
    // Create index
    const index: StoriesIndex = {
      stories: [storyMeta],
      lastOpenedStoryId: storyId
    };
    fs.writeFileSync(STORIES_INDEX_PATH, JSON.stringify(index, null, 2));
  } else {
    // Create empty index
    const index: StoriesIndex = { stories: [] };
    fs.writeFileSync(STORIES_INDEX_PATH, JSON.stringify(index, null, 2));
  }
}

const getStoriesIndex = (): StoriesIndex => {
  if (!fs.existsSync(STORIES_INDEX_PATH)) {
    return { stories: [] };
  }
  return JSON.parse(fs.readFileSync(STORIES_INDEX_PATH, "utf-8"));
};

const saveStoriesIndex = (index: StoriesIndex) => {
  fs.writeFileSync(STORIES_INDEX_PATH, JSON.stringify(index, null, 2));
};

// ---------------------------
// Streak Management (separate file)
// ---------------------------
interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
}

const STREAK_PATH = path.join(__dirname, "data", "streak.json");

// Initialize streak file if not exists
if (!fs.existsSync(STREAK_PATH)) {
  const defaultStreak: StreakData = {
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: null
  };
  fs.writeFileSync(STREAK_PATH, JSON.stringify(defaultStreak, null, 2));
}

const getStreak = (): StreakData => {
  if (!fs.existsSync(STREAK_PATH)) {
    return { currentStreak: 0, longestStreak: 0, lastActivityDate: null };
  }
  const data = JSON.parse(fs.readFileSync(STREAK_PATH, "utf-8"));
  // Remove streakHistory if exists (migration)
  const { streakHistory, ...streakWithoutHistory } = data;
  return streakWithoutHistory;
};

const saveStreak = (streak: StreakData) => {
  fs.writeFileSync(STREAK_PATH, JSON.stringify(streak, null, 2));
};

// GET /api/streak - Get streak data
app.get("/api/streak", (req: Request, res: Response) => {
  try {
    const streak = getStreak();
    res.json(streak);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to load streak" });
  }
});

// PUT /api/streak - Update streak data
app.put("/api/streak", (req: Request, res: Response) => {
  try {
    const streakData = req.body as StreakData;
    saveStreak(streakData);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to save streak" });
  }
});

// GET /api/stories - List all stories
app.get("/api/stories", (req: Request, res: Response) => {
  try {
    const index = getStoriesIndex();
    res.json(index);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to load stories" });
  }
});

// GET /api/story/:id - Get a specific story
app.get("/api/story/:id", (req: Request, res: Response) => {
  try {
    const storyId = req.params.id;
    const storyPath = path.join(STORIES_DIR, `${storyId}.json`);
    
    if (!fs.existsSync(storyPath)) {
      return res.status(404).json({ error: "Story not found" });
    }
    
    const data = JSON.parse(fs.readFileSync(storyPath, "utf-8"));
    
    // Update last opened story
    const index = getStoriesIndex();
    index.lastOpenedStoryId = storyId;
    saveStoriesIndex(index);
    
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to load story" });
  }
});

// POST /api/story - Create a new story
app.post("/api/story", (req: Request, res: Response) => {
  try {
    const { name, data, currentLevel } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Story name is required" });
    }
    
    const storyId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    // Default data for a new story (streak is now in separate file)
    const storyData = data || {
      version: 5,
      journal: [{
        id: Date.now().toString(),
        date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }),
        summary: '',
        messages: []
      }],
      characters: [
        { 
          id: 'mimi', 
          name: 'Mimi', 
          personality: 'a Korean girl. She must only speak Korean in very short and simple sentences (max 5 words). Her personality is cheerful, playful, and a bit stubborn.', 
          gender: 'female', 
          voiceName: 'Kore', 
          pitch: 5.0, 
          speakingRate: 1.1,
          relations: {},
          userOpinion: { opinion: '', sentiment: 'neutral', closeness: 0 },
        }
      ],
      activeCharacterIds: ['mimi'],
      context: "at Mimi's house",
      relationshipSummary: '',
      currentLevel: currentLevel || 'A1'
    };
    
    // Save story data
    fs.writeFileSync(path.join(STORIES_DIR, `${storyId}.json`), JSON.stringify(storyData, null, 2));
    
    // Update index
    const index = getStoriesIndex();
    const storyMeta: StoryMeta = {
      id: storyId,
      name: name.trim(),
      createdAt: now,
      updatedAt: now,
      charactersPreview: (storyData.characters || []).slice(0, 3).map((c: any) => c.name),
      messageCount: 0
    };
    index.stories.push(storyMeta);
    index.lastOpenedStoryId = storyId;
    saveStoriesIndex(index);
    
    res.json({ success: true, story: storyMeta });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to create story" });
  }
});

// PUT /api/story/:id - Update story data
app.put("/api/story/:id", (req: Request, res: Response) => {
  try {
    const storyId = req.params.id;
    const { data, name } = req.body;
    
    const storyPath = path.join(STORIES_DIR, `${storyId}.json`);
    
    if (!fs.existsSync(storyPath)) {
      return res.status(404).json({ error: "Story not found" });
    }
    
    // Save story data
    if (data) {
      fs.writeFileSync(storyPath, JSON.stringify(data, null, 2));
    }
    
    // Update index
    const index = getStoriesIndex();
    const storyIndex = index.stories.findIndex(s => s.id === storyId);
    if (storyIndex !== -1) {
      index.stories[storyIndex].updatedAt = new Date().toISOString();
      
      if (name) {
        index.stories[storyIndex].name = name.trim();
      }
      
      if (data) {
        index.stories[storyIndex].charactersPreview = (data.characters || []).slice(0, 3).map((c: any) => c.name);
        index.stories[storyIndex].messageCount = (data.journal || []).reduce((sum: number, dc: any) => sum + (dc.messages?.length || 0), 0);
      }
      
      saveStoriesIndex(index);
    }
    
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to update story" });
  }
});

// DELETE /api/story/:id - Delete a story
app.delete("/api/story/:id", (req: Request, res: Response) => {
  try {
    const storyId = req.params.id;
    const storyPath = path.join(STORIES_DIR, `${storyId}.json`);
    
    // Delete story file
    if (fs.existsSync(storyPath)) {
      fs.unlinkSync(storyPath);
    }
    
    // Update index
    const index = getStoriesIndex();
    index.stories = index.stories.filter(s => s.id !== storyId);
    
    // Update last opened if deleted
    if (index.lastOpenedStoryId === storyId) {
      index.lastOpenedStoryId = index.stories.length > 0 ? index.stories[0].id : undefined;
    }
    
    saveStoriesIndex(index);
    
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to delete story" });
  }
});

// PUT /api/story/:id/name - Rename story
app.put("/api/story/:id/name", (req: Request, res: Response) => {
  try {
    const storyId = req.params.id;
    const { name } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Story name is required" });
    }
    
    const index = getStoriesIndex();
    const storyIndex = index.stories.findIndex(s => s.id === storyId);
    
    if (storyIndex === -1) {
      return res.status(404).json({ error: "Story not found" });
    }
    
    index.stories[storyIndex].name = name.trim();
    index.stories[storyIndex].updatedAt = new Date().toISOString();
    saveStoriesIndex(index);
    
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to rename story" });
  }
});

// ---------------------------
// Serve audio files

// Tạo thư mục tạm để chứa file đang tải dở
const TEMP_DIR = path.join(__dirname, "temp_audio");
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const drive = google.drive({
  version: 'v3',
  auth: GOOGLE_API_KEY
});


app.get("/api/audio/:filename", async (req: Request, res: Response) => {
  const filename = req.params.filename;
  if (!filename) return res.status(400).json({ error: "Filename required" });

  const safeName = path.basename(filename);
  const audioDir = path.join(__dirname, "data", "audio");
  
  const mimeMap: Record<string, string> = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".webm": "audio/webm",
  };
  
  // List of extensions to check
  const extensions = ['.mp3', '.wav', '.webm', '.m4a', '.ogg'];
  
  try {
    // --- BƯỚC 1: KIỂM TRA FILE TRÊN SERVER TRƯỚC ---
    for (const ext of extensions) {
      const localFilePath = path.join(audioDir, safeName + ext);
      if (fs.existsSync(localFilePath)) {
        console.log(`Found audio on server: ${safeName}${ext}`);
        res.setHeader("Content-Type", mimeMap[ext] || "application/octet-stream");
        res.setHeader("Content-Disposition", `inline; filename="${path.basename(localFilePath)}"`);
        const stream = fs.createReadStream(localFilePath);
        stream.on("error", () => res.status(500).end());
        return stream.pipe(res);
      }
    }

    // --- BƯỚC 2: NẾU KHÔNG CÓ TRÊN SERVER THÌ TÌM TRÊN GOOGLE DRIVE ---
    console.log(`Audio not found on server, searching on Google Drive: ${safeName}`);

    const uniqueTempName = `${safeName}-${Date.now()}`;
    let tempFilePath = "";

    // Tìm file tên gốc (bỏ cái đuôi timestamp đi)
    const query = `'${DRIVE_FOLDER_ID}' in parents and (name = '${safeName}.mp3' or name = '${safeName}.wav' or name = '${safeName}.webm') and trashed = false`;
    const driveRes = await drive.files.list({
      q: query,
      fields: 'files(id, name, mimeType)',
      pageSize: 1
    });

    const files = driveRes.data.files;
    if (!files || files.length === 0) {
      return res.status(404).json({ error: "File not found on server or Google Drive" });
    }

    const file = files[0];
    const fileExt = path.extname(file.name!).toLowerCase();
    
    // Cập nhật đường dẫn file tạm với đuôi file chính xác
    tempFilePath = path.join(TEMP_DIR, uniqueTempName + fileExt);

    console.log(`Downloading from Google Drive to Temp: ${tempFilePath}...`);

    // --- BƯỚC 3: TẢI VỀ SERVER (CHỜ 100%) ---
    await downloadFileToTemp(file.id!, tempFilePath);

    // --- BƯỚC 4: GỬI FILE CHO CLIENT VÀ XÓA SAU KHI GỬI ---
    res.download(tempFilePath, safeName + fileExt, (err) => {
      if (err) {
        console.error("Client download error:", err);
      } else {
        console.log("Client finished downloading.");
      }

      // Dù thành công hay thất bại, đều xóa file tạm
      cleanupFile(tempFilePath);
    });

  } catch (error) {
    console.error("Process Error:", error);
    
    if (!res.headersSent) {
      return res.status(500).json({ error: "Server Error" });
    }
  }
});

// Hàm hỗ trợ: Tải file từ Drive vào thư mục Temp
const downloadFileToTemp = async (fileId: string, destPath: string): Promise<void> => {
  const res = await drive.files.get(
    { fileId: fileId, alt: 'media' },
    { responseType: 'stream' }
  );

  const dest = fs.createWriteStream(destPath);
  await pipeline(res.data, dest);
};

// Hàm hỗ trợ: Xóa file an toàn
const cleanupFile = (filePath: string) => {
  if (fs.existsSync(filePath)) {
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) console.error(`Failed to delete temp file: ${filePath}`, unlinkErr);
      else console.log(`Deleted temp file: ${filePath}`);
    });
  }
};

// ---------------------------
// Serve avatar files
// ---------------------------
app.use('/avatars', express.static(path.join(__dirname, 'public/avatars')));
app.use('/imgMessage', express.static(path.join(__dirname, 'public/imgMessage')));
app.use('/memoryImages', express.static(path.join(__dirname, 'public/memoryImages')));

app.post("/api/upload-avatar", (req: Request, res: Response) => {
  try {
    const { image, filename, characterName } = req.body;
    if (!image) return res.status(400).json({ error: "No image data provided" });

    // Ensure avatar directory exists
    const avatarDir = path.join(__dirname, "public/avatars");
    if (!fs.existsSync(avatarDir)) {
      fs.mkdirSync(avatarDir, { recursive: true });
    }

    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: "Invalid base64 string" });
    }

    const type = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    
    let ext = "png";
    if (type === "image/jpeg") ext = "jpg";
    else if (type === "image/gif") ext = "gif";
    else if (type === "image/webp") ext = "webp";
    else if (type === "image/svg+xml") ext = "svg";

    let safeFilename;
    if (characterName && typeof characterName === 'string' && characterName.trim()) {
        // Sanitize character name to create a safe filename
        // Replace non-alphanumeric characters (except - and _) with _
        // Also handle Vietnamese characters if needed, but for safety let's stick to basic sanitization or allow unicode
        // Simple approach: Replace anything that isn't a word char, whitespace or hyphen with nothing, then replace spaces with _
        const sanitized = characterName
            .trim()
            .replace(/[^\w\s\-\u00C0-\u1EFF]/g, '') // Keep letters (incl. Vietnamese), numbers, spaces, -
            .replace(/\s+/g, '_'); // Replace spaces with _
            
        safeFilename = `${sanitized}.${ext}`;
    } else {
        safeFilename = filename ? path.basename(filename) : `avatar-${Date.now()}.${ext}`;
    }

    const finalPath = path.join(avatarDir, safeFilename);

    fs.writeFileSync(finalPath, buffer);

    const avatarUrl = `/avatars/${safeFilename}`;
    res.json({ success: true, url: avatarUrl, filename: safeFilename });
  } catch (error: any) {
    console.error("Avatar upload failed:", error);
    res.status(500).json({ error: "Failed to upload avatar" });
  }
});

app.post("/api/upload-image-message", (req: Request, res: Response) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: "No image data provided" });

    // Ensure imgMessage directory exists
    const imgDir = path.join(__dirname, "public/imgMessage");
    if (!fs.existsSync(imgDir)) {
      fs.mkdirSync(imgDir, { recursive: true });
    }

    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: "Invalid base64 string" });
    }

    const type = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    
    let ext = "png";
    if (type === "image/jpeg") ext = "jpg";
    else if (type === "image/gif") ext = "gif";
    else if (type === "image/webp") ext = "webp";

    const filename = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`;
    const finalPath = path.join(imgDir, filename);

    fs.writeFileSync(finalPath, buffer);

    const imageUrl = `/imgMessage/${filename}`;
    res.json({ success: true, url: imageUrl, filename: filename });
  } catch (error: any) {
    console.error("Image message upload failed:", error);
    res.status(500).json({ error: "Failed to upload image message" });
  }
});

// Upload memory image for vocabulary memory editor
app.post("/api/upload-memory-image", (req: Request, res: Response) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: "No image data provided" });

    // Ensure memoryImages directory exists
    const imgDir = path.join(__dirname, "public/memoryImages");
    if (!fs.existsSync(imgDir)) {
      fs.mkdirSync(imgDir, { recursive: true });
    }

    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: "Invalid base64 string" });
    }

    const type = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    
    let ext = "png";
    if (type === "image/jpeg") ext = "jpg";
    else if (type === "image/gif") ext = "gif";
    else if (type === "image/webp") ext = "webp";

    const filename = `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`;
    const finalPath = path.join(imgDir, filename);

    fs.writeFileSync(finalPath, buffer);

    const imageUrl = `/memoryImages/${filename}`;
    res.json({ success: true, url: imageUrl, filename: filename });
  } catch (error: any) {
    console.error("Memory image upload failed:", error);
    res.status(500).json({ error: "Failed to upload memory image" });
  }
});

// ---------------------------
// Convert WAV → MP3
// ---------------------------
// async function convertBase64WavToMp3(base64String: string, outputName: string) {
//   if (!base64String) throw new Error("Missing WAV data");

//   base64String = cleanBase64(base64String);

//   const tmpDir = os.tmpdir();
//   const tmpWavPath = path.join(tmpDir, `tmp-${crypto.randomUUID()}.wav`);
//   const mp3Path = path.join(__dirname, `data/audio/${outputName}.mp3`);

//   await fs.promises.writeFile(tmpWavPath, Buffer.from(base64String, "base64"));

//   await new Promise<void>((resolve, reject) => {
//     ffmpeg(tmpWavPath)
//       .toFormat("mp3")
//       .on("end", resolve)
//       .on("error", reject)
//       .save(mp3Path);
//   });

//   fs.promises.unlink(tmpWavPath).catch(() => {});
// }

// async function convertWavToMp3(path:string) {
//   await new Promise<void>((resolve, reject) => {
//     ffmpeg(path)
//       .toFormat("mp3")
//       .on("end", resolve)
//       .on("error", reject)
//       .save(path.replace('.wav', '.mp3'));
//   });
// }

app.post("/api/upload-audio", async (req: Request, res: Response) => {
  const { base64WavData, mimeType } = req.body;

  if (!base64WavData) {
    return res.status(400).json({ error: "Missing base64WavData" });
  }

  try {
    const outputName = crypto.randomUUID();
    
    // Ensure audio directory exists
    const audioDir = path.join(__dirname, "data", "audio");
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    // Clean base64 string (remove data URL prefix if present)
    const cleanBase64 = base64WavData.replace(/^data:audio\/\w+;base64,/, '');
    
    // Determine file extension based on mimeType or default to webm
    let ext = 'webm';
    if (mimeType) {
      if (mimeType.includes('webm')) ext = 'webm';
      else if (mimeType.includes('mp4') || mimeType.includes('m4a')) ext = 'm4a';
      else if (mimeType.includes('wav')) ext = 'wav';
      else if (mimeType.includes('ogg')) ext = 'ogg';
      else if (mimeType.includes('mpeg') || mimeType.includes('mp3')) ext = 'mp3';
    }
    
    // Convert base64 to buffer and save
    const buffer = Buffer.from(cleanBase64, 'base64');
    const audioPath = path.join(audioDir, `${outputName}.${ext}`);
    
    fs.writeFileSync(audioPath, buffer);
    console.log(`Audio saved: ${audioPath}`);

    res.json({
      success: true,
      data: outputName,
      message: "Audio uploaded successfully",
    });
  } catch (e: any) {
    console.error("Upload audio error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------
// Declare global for chat sessions
// ---------------------------
declare global {
  var chatSessions: Map<string, any>;
}
interface ChatMessage {
  role: 'user' | 'model';
  parts: [{ text: string }];
}

interface ChatRequest {
  messages: ChatMessage[];
  systemPrompt?: string;
  options?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
  };
}

// POST /api/chat - Chat with AI
app.post("/api/chat", async (req: Request, res: Response) => {
  try {
    const { messages, systemPrompt, options }: ChatRequest = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages array is required and cannot be empty" });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    const geminiService = new GeminiService(apiKey);
    const response = await geminiService.chat(messages, systemPrompt, options);

    res.json({ 
      success: true, 
      response,
      usage: {
        model: "gemini-1.5-flash"
      }
    });
  } catch (error: any) {
    console.error("Chat API error:", error);
    res.status(500).json({ error: error.message || "Chat request failed" });
  }
});

// POST /api/chat/stream - Stream chat with AI
app.post("/api/chat/stream", async (req: Request, res: Response) => {
  try {
    const { messages, systemPrompt, options }: ChatRequest = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages array is required and cannot be empty" });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    // Set headers for server-sent events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });

    const geminiService = new GeminiService(apiKey);
    const stream = await geminiService.streamChat(messages, systemPrompt, options);

    let fullResponse = '';
    
    try {
      for await (const chunk of stream) {
        fullResponse += chunk;
        // Send chunk as server-sent event
        res.write(`data: ${JSON.stringify({ chunk, type: 'chunk' })}\n\n`);
      }

      // Send completion event
      res.write(`data: ${JSON.stringify({ 
        type: 'done', 
        fullResponse,
        usage: { model: "gemini-1.5-flash" }
      })}\n\n`);
      
    } catch (streamError: any) {
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: streamError.message 
      })}\n\n`);
    }

    res.end();
  } catch (error: any) {
    console.error("Stream chat API error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Stream chat request failed" });
    }
  }
});

// POST /api/generate-text - Generate text with AI
app.post("/api/generate-text", async (req: Request, res: Response) => {
  try {
    const { prompt, systemPrompt, options } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: "Prompt is required and must be a string" });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    const geminiService = new GeminiService(apiKey);
    const response = await geminiService.generateText(prompt, systemPrompt, options);

    res.json({ 
      success: true, 
      response,
      usage: {
        model: "gemini-1.5-flash"
      }
    });
  } catch (error: any) {
    console.error("Generate text API error:", error);
    res.status(500).json({ error: error.message || "Text generation failed" });
  }
});

// POST /api/gemini/init-chat - Initialize chat session
app.post("/api/gemini/init-chat", async (req: Request, res: Response) => {
  try {
    const { activeCharacters, context, history, contextSummary, relationshipSummary, level } = req.body;

    if (!activeCharacters || !Array.isArray(activeCharacters)) {
      return res.status(400).json({ error: "activeCharacters is required and must be an array" });
    }

    if (!context || typeof context !== 'string') {
      return res.status(400).json({ error: "context is required and must be a string" });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    const geminiService = new GeminiService(apiKey);
    const chatSession = await geminiService.initChat(
      activeCharacters,
      context,
      history || [],
      contextSummary || '',
      relationshipSummary || '',
      level || 'A1'
    );

    // Store session in memory with a session ID
    const sessionId = crypto.randomUUID();
    // You might want to store this in Redis or a database for production
    global.chatSessions = global.chatSessions || new Map();
    global.chatSessions.set(sessionId, { chatSession, geminiService });

    res.json({ 
      success: true, 
      sessionId,
      message: "Chat session initialized successfully"
    });
  } catch (error: any) {
    console.error("Init chat API error:", error);
    res.status(500).json({ error: error.message || "Failed to initialize chat" });
  }
});

// POST /api/gemini/send-message - Send message to chat session
app.post("/api/gemini/send-message", async (req: Request, res: Response) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: "sessionId is required" });
    }

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: "message is required" });
    }

    global.chatSessions = global.chatSessions || new Map();
    const session = global.chatSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: "Chat session not found" });
    }

    const response = await session.geminiService.sendMessage(session.chatSession, message);

    res.json({ 
      success: true, 
      response
    });
  } catch (error: any) {
    console.error("Send message API error:", error);
    res.status(500).json({ error: error.message || "Failed to send message" });
  }
});

// POST /api/gemini/init-auto-chat - Initialize auto chat session
app.post("/api/gemini/init-auto-chat", async (req: Request, res: Response) => {
  try {
    const { characters, context, topic, level, history, vocabulary } = req.body;

    if (!characters || !Array.isArray(characters)) {
      return res.status(400).json({ error: "characters is required and must be an array" });
    }

    if (!context || typeof context !== 'string') {
      return res.status(400).json({ error: "context is required and must be a string" });
    }

    if (!topic || typeof topic !== 'string') {
      return res.status(400).json({ error: "topic is required and must be a string" });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    const geminiService = new GeminiService(apiKey);
    const chatSession = await geminiService.initAutoChatSession(
      characters,
      context,
      topic,
      level || 'A1',
      history || [],
      vocabulary || []
    );

    // Store session in memory with a session ID
    const sessionId = crypto.randomUUID();
    global.chatSessions = global.chatSessions || new Map();
    global.chatSessions.set(sessionId, { chatSession, geminiService });

    res.json({ 
      success: true, 
      sessionId,
      message: "Auto chat session initialized successfully"
    });
  } catch (error: any) {
    console.error("Init auto chat API error:", error);
    res.status(500).json({ error: error.message || "Failed to initialize auto chat" });
  }
});

// POST /api/gemini/send-auto-chat - Send command to auto chat session
app.post("/api/gemini/send-auto-chat", async (req: Request, res: Response) => {
  try {
    const { sessionId, command } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: "sessionId is required" });
    }

    if (!command || typeof command !== 'string') {
      return res.status(400).json({ error: "command is required" });
    }

    global.chatSessions = global.chatSessions || new Map();
    const session = global.chatSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: "Chat session not found" });
    }

    const response = await session.geminiService.sendAutoChatMessage(session.chatSession, command);

    res.json({ 
      success: true, 
      response
    });
  } catch (error: any) {
    console.error("Send auto chat API error:", error);
    res.status(500).json({ error: error.message || "Failed to send auto chat command" });
  }
});

// POST /api/gemini/translate-text - Translate and explain Korean text
app.post("/api/gemini/translate-text", async (req: Request, res: Response) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: "text is required and must be a string" });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    const geminiService = new GeminiService(apiKey);
    const response = await geminiService.translateAndExplainText(text);

    res.json({ 
      success: true, 
      response
    });
  } catch (error: any) {
    console.error("Translate text API error:", error);
    res.status(500).json({ error: error.message || "Failed to translate text" });
  }
});

// POST /api/gemini/translate-word - Translate Korean word
app.post("/api/gemini/translate-word", async (req: Request, res: Response) => {
  try {
    const { word } = req.body;

    if (!word || typeof word !== 'string') {
      return res.status(400).json({ error: "word is required and must be a string" });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    const geminiService = new GeminiService(apiKey);
    const response = await geminiService.translateWord(word);

    res.json({ 
      success: true, 
      response
    });
  } catch (error: any) {
    console.error("Translate word API error:", error);
    res.status(500).json({ error: error.message || "Failed to translate word" });
  }
});

// POST /api/gemini/summarize-conversation - Summarize conversation
app.post("/api/gemini/summarize-conversation", async (req: Request, res: Response) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages is required and must be an array" });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    const geminiService = new GeminiService(apiKey);
    const response = await geminiService.summarizeConversation(messages);

    res.json({ 
      success: true, 
      response
    });
  } catch (error: any) {
    console.error("Summarize conversation API error:", error);
    res.status(500).json({ error: error.message || "Failed to summarize conversation" });
  }
});

// POST /api/gemini/generate-character-thoughts - Generate character thoughts
app.post("/api/gemini/generate-character-thoughts", async (req: Request, res: Response) => {
  try {
    const { messages, characters } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages is required and must be an array" });
    }

    if (!characters || !Array.isArray(characters)) {
      return res.status(400).json({ error: "characters is required and must be an array" });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    const geminiService = new GeminiService(apiKey);
    const response = await geminiService.generateCharacterThoughts(messages, characters);

    res.json({ 
      success: true, 
      response
    });
  } catch (error: any) {
    console.error("Generate character thoughts API error:", error);
    res.status(500).json({ error: error.message || "Failed to generate character thoughts" });
  }
});

// POST /api/gemini/generate-tone - Generate tone description
app.post("/api/gemini/generate-tone", async (req: Request, res: Response) => {
  try {
    const { text, character } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: "text is required and must be a string" });
    }

    if (!character || typeof character !== 'object') {
      return res.status(400).json({ error: "character is required and must be an object" });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    const geminiService = new GeminiService(apiKey);
    const response = await geminiService.generateToneDescription(text, character);

    res.json({ 
      success: true, 
      response
    });
  } catch (error: any) {
    console.error("Generate tone API error:", error);
    res.status(500).json({ error: error.message || "Failed to generate tone" });
  }
});

// POST /api/gemini/generate-relationship-summary - Generate relationship summary
app.post("/api/gemini/generate-relationship-summary", async (req: Request, res: Response) => {
  try {
    const { messages, characters, currentSummary } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages is required and must be an array" });
    }

    if (!characters || !Array.isArray(characters)) {
      return res.status(400).json({ error: "characters is required and must be an array" });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    const geminiService = new GeminiService(apiKey);
    const response = await geminiService.generateRelationshipSummary(messages, characters, currentSummary || '');

    res.json({ 
      success: true, 
      response
    });
  } catch (error: any) {
    console.error("Generate relationship summary API error:", error);
    res.status(500).json({ error: error.message || "Failed to generate relationship summary" });
  }
});

// POST /api/gemini/generate-vocabulary - Generate vocabulary from conversation
app.post("/api/gemini/generate-vocabulary", async (req: Request, res: Response) => {
  try {
    const { messages, level, existingVocabularies } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages is required and must be an array" });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    const geminiService = new GeminiService(apiKey);
    const response = await geminiService.generateVocabulary(
      messages, 
      level || 'A1', 
      existingVocabularies || []
    );

    res.json({ 
      success: true, 
      response
    });
  } catch (error: any) {
    console.error("Generate vocabulary API error:", error);
    res.status(500).json({ error: error.message || "Failed to generate vocabulary" });
  }
});

// DELETE /api/gemini/session/:sessionId - Delete chat session
app.delete("/api/gemini/session/:sessionId", (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    global.chatSessions = global.chatSessions || new Map();
    
    if (global.chatSessions.has(sessionId)) {
      global.chatSessions.delete(sessionId);
      res.json({ success: true, message: "Session deleted successfully" });
    } else {
      res.status(404).json({ error: "Session not found" });
    }
  } catch (error: any) {
    console.error("Delete session API error:", error);
    res.status(500).json({ error: error.message || "Failed to delete session" });
  }
});

// ---------------------------
// Save JSON data
// ---------------------------
app.post("/api/save-data", (req: Request, res: Response) => {
  const { data } = req.body;

  if (!data) return res.status(400).json({ error: "Missing data" });

  fs.writeFile(
    path.join(__dirname, "data", "data.json"),
    JSON.stringify(data, null, 2),
    "utf-8",
    (err) => {
      if (err) return res.status(500).json({ error: "Failed to save data" });
      res.json({ success: true });
    }
  );
});

// Load audio list từ file vào Set để kiểm tra nhanh
const AUDIO_LIST_PATH = path.join(__dirname, "audio-list.txt");

function loadAudioList(): Set<string> {
  try {
    if (fs.existsSync(AUDIO_LIST_PATH)) {
      const content = fs.readFileSync(AUDIO_LIST_PATH, "utf-8");
      return new Set(content.split("\n").map(id => id.trim()).filter(id => id.length > 0));
    }
  } catch (e) {
    console.error("Failed to load audio list:", e);
  }
  return new Set();
}

function addToAudioList(audioId: string): void {
  try {
    const audioListSet = loadAudioList();
    if (!audioListSet.has(audioId)) {
      fs.appendFileSync(AUDIO_LIST_PATH, audioId + "\n", "utf-8");
    }
  } catch (e) {
    console.error("Failed to add to audio list:", e);
  }
}

app.get("/api/text-to-speech", async (req: Request, res: Response) => {
  const text = req.query.text as string;
  const voice = (req.query.voice as string) || "echo";  
  const format = "mp3";
  const instructions = (req.query.instructions as string) || undefined;  
  const force = req.query.force === 'true';
  const output = crypto.createHash("md5").update(normalizeText(text) + voice + normalizeText(instructions)).digest("hex");
  if(!force && fs.existsSync(path.join(__dirname, "data/audio", output + "." + format))) {
    return res.json({ success: true, output });
  }
  else if (fs.existsSync(path.join(__dirname, "data/audio", output + "." + format))){
    await unlinkSync(path.join(__dirname, "data/audio", output + "." + format));
  }
  try {    
    const result = await textToSpeech(text, voice, format, output, instructions);
    // await convertWavToMp3(path.join(__dirname, "data/audio", output + ".wav"))
    // unlink(path.join(__dirname, "data/audio", output + ".wav"), () => {});
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "TTS failed" });
  }
});

const normalizeText = (text: string): string => {
  if (!text) return "";

  // 3. QUAN TRỌNG NHẤT: Xóa tất cả ký tự KHÔNG PHẢI là chữ cái (Hàn/Anh) hoặc số
  // Regex này giữ lại: Chữ Hàn (\u3131-\uD79D), Chữ Anh (a-zA-Z), Số (0-9)
  // Loại bỏ: ! ? . , ~ @ # $ % ^ & * và Khoảng trắng
  let clean = text.replace(/[^a-zA-Z0-9\u3131-\uD79D]/g, "");

  // 4. Chuyển về chữ thường (để "Oppa" và "oppa" là 1)
  return clean.toLowerCase();
};

// ---------------------------
// Deployment endpoints
// ---------------------------
app.post("/api/deploy-server", async (req: Request, res: Response) => {
  const { token, fileContent } = req.body;
  if (token !== process.env.DEPLOY_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!fileContent) {
    return res.status(400).json({ error: "Missing fileContent" });
  }

  try {
    const appJsPath = path.join(__dirname, "app.js");

    // Write new content
    fs.writeFileSync(appJsPath, fileContent, "utf-8");
    console.log("Deployment successful - app.js updated");

    res.json({ 
      success: true, 
      message: "Deployment successful. Please restart the server manually." 
    });
  } catch (error: any) {
    console.error("Deployment failed:", error);
    res.status(500).json({ error: "Deployment failed: " + error.message });
  }
});

app.post("/api/deploy-client", async (req: Request, res: Response) => {
  const { token, zipData } = req.body;
  if (token !== process.env.DEPLOY_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!zipData) {
    return res.status(400).json({ error: "Missing zipData (base64 encoded zip file)" });
  }

  try {
    const publicDistPath = path.join(__dirname, "public", "dist");

    // Remove existing dist folder
    if (fs.existsSync(publicDistPath)) {
      fs.rmSync(publicDistPath, { recursive: true, force: true });
    }

    // Create new dist folder
    fs.mkdirSync(publicDistPath, { recursive: true });

    // Decode base64 zip data
    const zipBuffer = Buffer.from(zipData, "base64");
    
    // Extract zip
    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(publicDistPath, true);
    
    console.log("Client deployment successful - public/dist updated");

    res.json({ 
      success: true, 
      message: "Client deployment successful. Files updated in public/dist." 
    });
  } catch (error: any) {
    console.error("Client deployment failed:", error);
    res.status(500).json({ error: "Client deployment failed: " + error.message });
  }
});

// ---------------------------
// Start server
// ---------------------------
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

// ---------------------------
// Audio Cleanup Scheduler
// ---------------------------
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

const NEXT_CLEANUP_PATH = path.join(__dirname, "data", "next_audio_cleanup.json");
const CLEANUP_LOCK_PATH = path.join(__dirname, "data", "cleanup.lock");
// Protect these audio base-names from deletion (voice samples / built-in voices)
const PROTECTED_AUDIO_NAMES = new Set<string>([
  'alloy', 'ballad', 'coral', 'cedar', 'echo', 'fable', 'marin', 'nova', 'onyx'
]);

function getNextCleanupTime(): number {
  try {
    if (!fs.existsSync(NEXT_CLEANUP_PATH)) return 0;
    const raw = fs.readFileSync(NEXT_CLEANUP_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return typeof parsed.nextCleanup === 'number' ? parsed.nextCleanup : 0;
  } catch (e) {
    console.error('Failed to read next cleanup time:', e);
    return 0;
  }
}

function setNextCleanupTime(ts: number) {
  try {
    fs.writeFileSync(NEXT_CLEANUP_PATH, JSON.stringify({ nextCleanup: ts }, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to write next cleanup time:', e);
  }
}

function lockExists(): boolean {
  try {
    return fs.existsSync(CLEANUP_LOCK_PATH);
  } catch (e) {
    return false;
  }
}

function createLock() {
  try {
    fs.writeFileSync(CLEANUP_LOCK_PATH, JSON.stringify({ pid: process.pid, ts: Date.now() }), 'utf-8');
  } catch (e) {
    console.error('Failed to create cleanup lock:', e);
  }
}

function removeLock() {
  try {
    if (fs.existsSync(CLEANUP_LOCK_PATH)) fs.unlinkSync(CLEANUP_LOCK_PATH);
  } catch (e) {
    console.error('Failed to remove cleanup lock:', e);
  }
}

function getAllUsedAudioFromStories(): Set<string> {
  const usedAudios = new Set<string>();
  
  try {
    // Get all story files
    if (!fs.existsSync(STORIES_DIR)) {
      return usedAudios;
    }
    
    const storyFiles = fs.readdirSync(STORIES_DIR).filter(f => f.endsWith('.json'));
    
    for (const storyFile of storyFiles) {
      try {
        const storyPath = path.join(STORIES_DIR, storyFile);
        const storyData = JSON.parse(fs.readFileSync(storyPath, 'utf-8'));

        // Recursively scan the story object for any `audioData` properties
        const scanForAudio = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;

          if (Array.isArray(obj)) {
            for (const item of obj) scanForAudio(item);
            return;
          }

          for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (key === 'audioData' && typeof val === 'string' && val) {
              usedAudios.add(val);
            } else if (typeof val === 'object' && val !== null) {
              scanForAudio(val);
            }
          }
        };

        scanForAudio(storyData);
      } catch (e) {
        console.error(`Error reading story file ${storyFile}:`, e);
      }
    }
    
    // Also check old data.json if exists
    const oldDataPath = path.join(__dirname, "data", "data.json");
    if (fs.existsSync(oldDataPath)) {
      try {
        const oldData = JSON.parse(fs.readFileSync(oldDataPath, 'utf-8'));
        // Reuse the same recursive scanner to collect any audioData fields
        const scanForAudio = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;

          if (Array.isArray(obj)) {
            for (const item of obj) scanForAudio(item);
            return;
          }

          for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (key === 'audioData' && typeof val === 'string' && val) {
              usedAudios.add(val);
            } else if (typeof val === 'object' && val !== null) {
              scanForAudio(val);
            }
          }
        };

        scanForAudio(oldData);
      } catch (e) {
        console.error('Error reading old data.json:', e);
      }
    }
  } catch (e) {
    console.error('Error getting used audios:', e);
  }
  
  return usedAudios;
}

function cleanupUnusedAudio(): { deleted: number; errors: number; totalFiles: number } {
  const result = { deleted: 0, errors: 0, totalFiles: 0 };
  
  const audioDir = path.join(__dirname, "data", "audio");
  
  if (!fs.existsSync(audioDir)) {
    console.log('Audio directory does not exist, skipping cleanup');
    return result;
  }
  
  try {
    // Get all used audio references
    const usedAudios = getAllUsedAudioFromStories();
    console.log(`Found ${usedAudios.size} audio references in use`);
    
    // Get all audio files
    const audioFiles = fs.readdirSync(audioDir);
    result.totalFiles = audioFiles.length;
    
    for (const audioFile of audioFiles) {
      // Get filename without extension
      const fileNameWithoutExt = path.basename(audioFile, path.extname(audioFile));
      
      // Check if this audio is being used
      // Skip deletion if the audio is referenced OR is a protected voice sample
      if (usedAudios.has(fileNameWithoutExt) || PROTECTED_AUDIO_NAMES.has(fileNameWithoutExt)) {
        if (PROTECTED_AUDIO_NAMES.has(fileNameWithoutExt)) {
          console.log(`Skipping protected audio file: ${audioFile}`);
        }
        continue;
      }

      if (!usedAudios.has(fileNameWithoutExt)) {
        try {
          const filePath = path.join(audioDir, audioFile);
          fs.unlinkSync(filePath);
          result.deleted++;
          console.log(`Deleted unused audio: ${audioFile}`);
        } catch (e) {
          result.errors++;
          console.error(`Error deleting audio file ${audioFile}:`, e);
        }
      }
    }
    
    console.log(`Audio cleanup completed: ${result.deleted} deleted, ${result.errors} errors, ${result.totalFiles} total files`);
  } catch (e) {
    console.error('Error during audio cleanup:', e);
  }
  
  return result;
}

function startAudioCleanupScheduler() {
  // Initialize persistent next-cleanup timestamp if missing.
  const next = getNextCleanupTime();
  if (!next || next <= 0) {
    const initial = Date.now() + CLEANUP_INTERVAL_MS;
    setNextCleanupTime(initial);
    const result = cleanupUnusedAudio();
    console.log(`Initial audio cleanup done: ${result.deleted} deleted, ${result.errors} errors, ${result.totalFiles} total files`);
    console.log('Initialized next audio cleanup time:', new Date(initial).toISOString());
  } else {
    console.log('Next audio cleanup scheduled at', new Date(next).toISOString());
  }

  console.log('Audio cleanup is now on-demand: each API request checks whether cleanup is due');
}

// // Middleware: on each API request check if it's time to run cleanup. If due, trigger it once
// // and persist the next scheduled time to disk. Cleanup runs in background and does not
// // block the request-response cycle.
// app.use((req: Request, res: Response, next: NextFunction) => {
//   try {
//     if (!req.path.startsWith('/api')) return next();

//     const nextTs = getNextCleanupTime();
//     const now = Date.now();

//     if (nextTs && now >= nextTs) {
//       // If a lock exists, someone else is already cleaning up
//       if (lockExists()) {
//         return next();
//       }

//       // Create lock and run cleanup asynchronously
//       createLock();

//       (async () => {
//         try {
//           console.log('Cleanup due: running cleanupUnusedAudio() now');
//           const result = cleanupUnusedAudio();
//           const newNext = Date.now() + CLEANUP_INTERVAL_MS;
//           setNextCleanupTime(newNext);
//           console.log(`Cleanup finished. Deleted=${result.deleted} errors=${result.errors}. Next at ${new Date(newNext).toISOString()}`);
//         } catch (e) {
//           console.error('Error during on-demand audio cleanup:', e);
//         } finally {
//           removeLock();
//         }
//       })();
//     }
//   } catch (e) {
//     console.error('Error checking audio cleanup schedule:', e);
//   }

//   return next();
// });

// Manual cleanup endpoint (for admin use)
app.post("/api/cleanup-audio", (req: Request, res: Response) => {
  try {
    console.log('Manual audio cleanup triggered');
    const result = cleanupUnusedAudio();
    res.json({ 
      success: true, 
      message: `Audio cleanup completed`,
      deleted: result.deleted,
      errors: result.errors,
      totalFiles: result.totalFiles
    });
  } catch (error: any) {
    console.error("Audio cleanup failed:", error);
    res.status(500).json({ error: error.message || "Audio cleanup failed" });
  }
});

// Fallback: redirect all non-API routes to root
app.get("*", (req: Request, res: Response) => {
  if (!req.path.startsWith("/api")) {
    res.sendFile(path.join(__dirname, "/public/dist/index.html"));
  }
});
