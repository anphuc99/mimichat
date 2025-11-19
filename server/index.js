const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const os = require('os');
const { randomUUID } = require('crypto');
const fscb = require('fs');




ffmpeg.setFfmpegPath(ffmpegPath);

require('dotenv').config();

function generateMD5Hash(inputString) {
  const hash = crypto.createHash('md5');
  hash.update(inputString);
  return hash.digest('hex'); // 'hex' for hexadecimal representation
}


const app = express();
const port = 3002;


app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use(cors());
app.use(express.json());

// JWT auth middleware (skip /login)
app.use((req, res, next) => {
  // Cho phép truy cập public vào /login và /health
  if (true) return next();
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = authHeader.substring(7);
  try {

    const jwt_secret = fs.readFileSync('jwt_secret.key', 'utf-8');
    const decoded = jwt.verify(token, jwt_secret);
    req.user = decoded; // attach decoded payload for downstream handlers
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});

app.get('/', (req, res) => {
  res.json({ message: 'Hello from protected server!', user: req.user });
});

// Login lấy JWT
app.post('/api/login', (req, res) => {
  const { token } = req.body;

  if (token === process.env.CLIENT_TOKEN) {
    const user = { id: 'user1' }; // Example user
    const jwt_secret = generateMD5Hash(crypto.randomUUID());
    fs.writeFileSync('jwt_secret.key', jwt_secret);
    const accessToken = jwt.sign(user, jwt_secret, { expiresIn: '7d' });

    res.json({ accessToken });
  } else {
    res.status(401).send('Unauthorized');
  }
});

// Route verify để client gọi kiểm tra token
app.get('/api/verify', (req, res) => {
  // Nếu tới được đây tức middleware đã xác thực
  return res.status(200).json({ verify: true, message: 'Token is valid', user: req.user });
});

app.get('/api/get-api-key', (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }
  res.json({ apiKey });
});

// Health check public
app.get('/health', (_, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/data', (req, res) => {
  try {
    const dataPath = path.join(__dirname, 'data', 'data.json');
    if (!fs.existsSync(dataPath)) {
      return res.status(404).json({ error: 'Data file not found.' });
    }
    const raw = fs.readFileSync(dataPath, 'utf-8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return res.status(500).json({ error: 'Invalid JSON format in data file.' });
    }
    return res.json(parsed);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to read data file.' });
  }
});

// Serve audio files (protected). Place audio files in /server/audio
app.get('/api/audio/:filename', (req, res) => {
  try {
    const requested = req.params.filename;
    if (!requested) return res.status(400).json({ error: 'Filename required' });
    // Prevent path traversal
    const safeName = path.basename(requested);
    const audioDir = path.join(__dirname, 'data/audio');
    const filePath = path.join(audioDir, safeName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Audio file not found' });
    }

    const ext = path.extname(safeName).toLowerCase();
    const mimeMap = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.webm': 'audio/webm'
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);

    // Stream the file to avoid loading whole file in memory
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.status(500).end());
    stream.pipe(res);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to serve audio file' });
  }
});

app.post('/api/upload-audio', async (req, res) => {
  const { base64WavData } = req.body;
  try {
    const outputName = randomUUID()
    await convertBase64WavToMp3(base64WavData, outputName);
    return res.json({ success: true, data: outputName, message: 'Audio converted and saved as MP3.' });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to convert audio: ' + e.message });
  }
});


// Convert a base64-encoded WAV string to MP3.
// base64String: the WAV file content in base64 (no data URI prefix required)
// outputName: desired base filename (without extension)
// options: { saveMp3: boolean, returnBase64: boolean }
async function convertBase64WavToMp3(base64String, outputName) {

  if (!base64String) throw new Error('Missing base64 WAV data');
  if (!outputName) outputName = `audio_${Date.now()}`;

  base64String = cleanBase64(base64String)

  const tmpDir = os.tmpdir();
  const tmpWavPath = path.join(tmpDir, `tmp-${randomUUID()}.wav`);
  const mp3Path = path.join(__dirname, `data/audio/${outputName}.mp3`);

  // Write temporary WAV file
  await fscb.promises.writeFile(tmpWavPath, Buffer.from(base64String, 'base64'));

  await new Promise((resolve, reject) => {
    ffmpeg(tmpWavPath)
      .toFormat('mp3')
      .on('end', resolve)
      .on('error', reject)
      .save(mp3Path);
  });

  // Remove temp wav
  fscb.promises.unlink(tmpWavPath).catch(() => { });
}

function cleanBase64(dataUrl) {
  return dataUrl.replace(/^data:.*;base64,/, "");
}


app.post('/api/save-data', async (req, res) => {
  const { data } = req.body;
  if (!data) {
    return res.status(400).json({ error: 'Missing data in request body.' });
  }
  fs.writeFile(path.join(__dirname, 'data', 'data.json'), JSON.stringify(data, null, 2), 'utf-8', (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to save data.' });
    }
    else{
      return res.json({ success: true, message: 'Đã lưu dữ liệu thành công.' })
    }
  })
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
