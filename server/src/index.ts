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
import { textToSpeech } from "./modules/openai.js";

// ---------------------------
// FIX __dirname trong ESM
// ---------------------------
const __dirname = process.cwd();

// ffmpeg.setFfmpegPath(ffmpegInstaller.path);

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

  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    const jwtSecretPath = path.join(__dirname, "/jwt_secret.key");
    
    if (!fs.existsSync(jwtSecretPath)) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const jwtSecret = fs.readFileSync(jwtSecretPath, "utf-8");
    const user = jwt.verify(token, jwtSecret);
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

    const jwt_secret = generateMD5Hash(crypto.randomUUID());
    fs.writeFileSync("jwt_secret.key", jwt_secret);

    const accessToken = jwt.sign(user, jwt_secret, { expiresIn: "7d" });
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
});

// ---------------------------
// Serve audio files
// ---------------------------
app.get("/api/audio/:filename", (req: Request, res: Response) => {
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
  const output = (req.query.output as string) || crypto.randomUUID();
  const instructions = (req.query.instructions as string) || undefined;
  try {    
    const result = await textToSpeech(text, voice, format, output, instructions);
    // await convertWavToMp3(path.join(__dirname, "data/audio", output + ".wav"))
    // unlink(path.join(__dirname, "data/audio", output + ".wav"), () => {});
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "TTS failed" });
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
