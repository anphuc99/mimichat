// ---------------------------
// IMPORTS
// ---------------------------
import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import fs, { unlink } from "fs";
import path from "path";
// import ffmpeg from "fluent-ffmpeg";
// import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import os from "os";
import { Readable } from "stream";
import { textToSpeech } from "./modules/openai.js";
import AdmZip from "adm-zip";

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
// Serve audio files
app.get("/api/audio/:filename",async (req: Request, res: Response) => {  
  GetAudioMimeType(req, res);
});

const GetAudioMimeType = (req: Request, res: Response)  => {
  const requested = req.params.filename;
  if (!requested) return res.status(400).json({ error: "Filename required" });

  const safeName = path.basename(requested);
  const baseDir = path.join(__dirname, "data/audio");
  
  // Try to find file with .mp3 or .wav extension
  let filePath = path.join(baseDir, safeName + ".mp3");
  if (!fs.existsSync(filePath)) {
    filePath = path.join(baseDir, safeName + ".wav");
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Audio file not found" });
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".webm": "audio/webm",
  };

  res.setHeader("Content-Type", mimeMap[ext] || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${path.basename(filePath)}"`);

  const stream = fs.createReadStream(filePath);
  stream.on("error", () => res.status(500).end());
  stream.pipe(res);
}

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
  const { base64WavData } = req.body;

  try {
    const outputName = crypto.randomUUID();
    // await convertBase64WavToMp3(base64WavData, outputName);

    res.json({
      success: true,
      data: outputName,
      message: "Audio converted successfully",
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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

app.get("/api/text-to-speech", async (req: Request, res: Response) => {
  const text = req.query.text as string;
  const voice = (req.query.voice as string) || "echo";
  console.log(voice)
  const format = "wav";
  const instructions = (req.query.instructions as string) || undefined;
  const output = crypto.createHash("md5").update(normalizeText(text) + voice + instructions).digest("hex");
  if(fs.existsSync(path.join(__dirname, "data/audio", output + "." + format))) {
    return res.json({ success: true, output });
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
  
  // 1. Xóa các chỉ dẫn trong ngoặc đơn nếu có, ví dụ: (shy), (whisper)
  let clean = text.replace(/\(.*\)/g, "");

  // 2. Xóa các từ đệm tiếng Anh thường gặp ở đầu câu (theo rule bài trước)
  // Nếu bạn muốn cache chặt chẽ hơn, có thể bỏ bước này, nhưng khuyên nên giữ để tối ưu
  clean = clean.replace(/^(Ugh|Ah|Wow|Hmm|Huh)\.\.\./i, "");

  // 3. QUAN TRỌNG NHẤT: Xóa tất cả ký tự KHÔNG PHẢI là chữ cái (Hàn/Anh) hoặc số
  // Regex này giữ lại: Chữ Hàn (\u3131-\uD79D), Chữ Anh (a-zA-Z), Số (0-9)
  // Loại bỏ: ! ? . , ~ @ # $ % ^ & * và Khoảng trắng
  clean = clean.replace(/[^a-zA-Z0-9\u3131-\uD79D]/g, "");

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

// Fallback: redirect all non-API routes to root
app.get("*", (req: Request, res: Response) => {
  if (!req.path.startsWith("/api")) {
    res.sendFile(path.join(__dirname, "/public/dist/index.html"));
  }
});
