import { ElevenLabsClient } from "elevenlabs";
import * as fs from "fs";
import { Readable } from "stream";
import dotenv from "dotenv";
import { promisify } from "util";
const writeFile = promisify(fs.writeFile);

dotenv.config();

export const CHARACTER_VOICES = {
    Annie: "Lb7qkOn5hF8p7qfCDH8q", 
    AnaKim: "uyVNoMrnUku1dZyVEXwD",
    Sola: "KlstlYt9VVf3zgie2Oht",
    RosaOh: "sf8Bpb1IU97NI9BHSMRf", 
    Beomjiun: "2l8KWWxnmNRrrIQ984DO", 
    AgongKigong:   "IfMPqjWHWsif8Cy8DjRX",
    Seojin: "BaW4Cx7nYOh1XNVQBrK2",
    Taehyung:  "m3gJBS8OofDJfycyA2Ip",
    Jiso: "iWLjl1zCuqXRkW6494ve",
    Alice: "Xb7hH8MSUJpSbSDYk0k2",
    HaAnim: "8jHHF8rMqMlg8if2mOUe",
    Latima: "kcQkGnn0HAT2JRDQ4Ljp",
    Hope: "WZlYpi1yf6zJhNWXih74",
    Sakuya: "8kgj5469z1URcH4MB2G4",
    Yui: "fUjY9K2nAIwlALOwSiwc",
    Romaco: "KgETZ36CCLD1Cob4xpkv",
    Sameno: "hMK7c1GPJmptCzI4bQIu",
    Aerisita: "vGQNBgLaiM3EdZtxIiuY",
};

export type CharacterName = keyof typeof CHARACTER_VOICES;

// Cập nhật danh sách cảm xúc mở rộng
export type Emotion = 
    | "Neutral" | "Happy" | "Sad" | "Angry" | "Scared" | "Shy"
    | "Disgusted" | "Surprised" | "Whisper" | "Shouting" | "Excited" | "Serious" | "Affectionate";

interface VoiceSettings {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
}

export class ElevenLabsService {
    private client: ElevenLabsClient;

    constructor() {
        if (!process.env.ELEVENLABS_API_KEY) {
            throw new Error("Missing ELEVENLABS_API_KEY");
        }
        this.client = new ElevenLabsClient({
            apiKey: process.env.ELEVENLABS_API_KEY,
        });
    }

    // --- 2. MA TRẬN CẢM XÚC NÂNG CAO ---
    private getEmotionalSettings(emotion: Emotion): VoiceSettings {
        switch (emotion) {
            // --- Nhóm Tiêu cực ---
            case "Angry": 
                return { stability: 0.35, similarity_boost: 0.8, style: 0.6, use_speaker_boost: true };
            case "Shouting": // Hét: Stability cực thấp để giọng vỡ, gắt
                return { stability: 0.15, similarity_boost: 0.9, style: 1.0, use_speaker_boost: true };
            case "Disgusted": // Khinh bỉ: Style cao để nhấn nhá sự ghê tởm
                return { stability: 0.45, similarity_boost: 0.7, style: 0.8, use_speaker_boost: true };
            case "Serious": // Nghiêm túc (Mẹ/Linh): Stability cao để giọng lạnh, đều
                return { stability: 0.85, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true };

            // --- Nhóm Tích cực/Năng lượng ---
            case "Happy": 
                return { stability: 0.60, similarity_boost: 0.8, style: 0.65, use_speaker_boost: true };
            case "Excited": // Hào hứng (Klee): Style cao, stability trung bình để giọng nảy
                return { stability: 0.50, similarity_boost: 0.8, style: 0.9, use_speaker_boost: true };
            
            // --- Nhóm Yếu đuối/Nhẹ nhàng ---
            case "Sad":   
                return { stability: 0.40, similarity_boost: 0.7, style: 0.3, use_speaker_boost: true };
            case "Scared": 
                return { stability: 0.30, similarity_boost: 0.6, style: 0.8, use_speaker_boost: true };
            case "Shy":
                return { stability: 0.55, similarity_boost: 0.9, style: 0.1, use_speaker_boost: true };
            case "Whisper": // Thì thầm: Cần stability cao để rõ chữ, không bị noise
                return { stability: 0.80, similarity_boost: 0.6, style: 0.0, use_speaker_boost: true };
            case "Affectionate": // Nũng nịu: Stability cao để giọng ấm áp, mượt mà
                return { stability: 0.80, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true };

            case "Surprised": 
                return { stability: 0.40, similarity_boost: 0.7, style: 0.7, use_speaker_boost: true };

            default: // Neutral
                return { stability: 0.75, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true };
        }
    }

    public async generateAudio(
        text: string, 
        character: CharacterName, 
        emotion: Emotion = "Neutral", 
        outputFilePath: string
    ): Promise<string> {
        const voiceId = CHARACTER_VOICES[character];
        if (!voiceId) throw new Error(`Missing Voice ID for: ${character}`);

        const voiceSettings = this.getEmotionalSettings(emotion);
        const promptText = text;

        console.log(`🎙️ [${character} | ${emotion}]: ${promptText}`);

        try {
            const audio = await this.client.generate({
                voice: voiceId,
                text: promptText, // Text đã hack dấu câu
                model_id: "eleven_multilingual_v2",
                voice_settings: voiceSettings,
                output_format: "mp3_44100_128" 
                // KHÔNG thêm stream: true ở đây để nó trả về Buffer trọn vẹn
            });

            let buffer: Buffer;
            if (Buffer.isBuffer(audio)) {
                buffer = audio;
            } else if (audio instanceof Readable) {
                const chunks: Buffer[] = [];
                for await (const chunk of audio) {
                    chunks.push(Buffer.from(chunk));
                }
                buffer = Buffer.concat(chunks);
            } else if (typeof (audio as any).getReader === 'function') {
                const reader = (audio as any).getReader();
                const chunks: Buffer[] = [];
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(Buffer.from(value));
                }
                buffer = Buffer.concat(chunks);
            } else {
                buffer = Buffer.from(audio as any);
            }

            await writeFile(outputFilePath, buffer);
            console.log(`✅ Đã lưu: ${outputFilePath}`);
            return outputFilePath;
        } catch (error) {
            console.error("❌ TTS Error:", error);
            throw error;
        }
    }
}