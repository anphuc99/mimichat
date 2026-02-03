import { ElevenLabsClient } from "elevenlabs";
import * as fs from "fs";
import { Readable } from "stream";
import dotenv from "dotenv";
import { promisify } from "util";
const writeFile = promisify(fs.writeFile);

dotenv.config();

// ElevenLabs Voice interface from API
export interface ElevenLabsVoice {
    voice_id: string;
    name: string;
    category?: string;
    description?: string;
    labels?: Record<string, string>;
    preview_url?: string;
}

// Fallback voices when API fails (user's custom voices from their account)
const FALLBACK_VOICES: ElevenLabsVoice[] = [
    { voice_id: "Lb7qkOn5hF8p7qfCDH8q", name: "Annie", labels: { gender: "female" } },
    { voice_id: "uyVNoMrnUku1dZyVEXwD", name: "AnaKim", labels: { gender: "female" } },
    { voice_id: "KlstlYt9VVf3zgie2Oht", name: "Sola", labels: { gender: "female" } },
    { voice_id: "sf8Bpb1IU97NI9BHSMRf", name: "RosaOh", labels: { gender: "female" } },
    { voice_id: "2l8KWWxnmNRrrIQ984DO", name: "Beomjiun", labels: { gender: "male" } },
    { voice_id: "IfMPqjWHWsif8Cy8DjRX", name: "AgongKigong", labels: { gender: "male" } },
    { voice_id: "BaW4Cx7nYOh1XNVQBrK2", name: "Seojin", labels: { gender: "female" } },
    { voice_id: "m3gJBS8OofDJfycyA2Ip", name: "Taehyung", labels: { gender: "male" } },
    { voice_id: "iWLjl1zCuqXRkW6494ve", name: "Jiso", labels: { gender: "female" } },
    { voice_id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", labels: { gender: "female" } },
    { voice_id: "8jHHF8rMqMlg8if2mOUe", name: "HaAnim", labels: { gender: "female" } },
    { voice_id: "kcQkGnn0HAT2JRDQ4Ljp", name: "Latima", labels: { gender: "female" } },
    { voice_id: "WZlYpi1yf6zJhNWXih74", name: "Hope", labels: { gender: "female" } },
    { voice_id: "8kgj5469z1URcH4MB2G4", name: "Sakuya", labels: { gender: "female" } },
    { voice_id: "fUjY9K2nAIwlALOwSiwc", name: "Yui", labels: { gender: "female" } },
    { voice_id: "KgETZ36CCLD1Cob4xpkv", name: "Romaco", labels: { gender: "male" } },
    { voice_id: "hMK7c1GPJmptCzI4bQIu", name: "Sameno", labels: { gender: "male" } },
    { voice_id: "vGQNBgLaiM3EdZtxIiuY", name: "Aerisita", labels: { gender: "female" } },
];

// Cập nhật danh sách cảm xúc mở rộng
export type Emotion = 
    | "Neutral" | "Happy" | "Sad" | "Angry" | "Scared" | "Shy"
    | "Disgusted" | "Surprised" | "Whisper" | "Shouting" | "Excited" | "Serious" | "Affectionate";

// Pitch levels for voice modulation
export type PitchLevel = "low" | "medium" | "high";

interface VoiceSettings {
    speed?: number;
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
}

export class ElevenLabsService {
    private client: ElevenLabsClient | null = null;
    private cachedVoices: ElevenLabsVoice[] | null = null;
    private voicesCacheTime: number = 0;
    private CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
    private isAvailable: boolean = false;

    constructor() {
        if (!process.env.ELEVENLABS_API_KEY) {
            console.warn("⚠️ Missing ELEVENLABS_API_KEY - ElevenLabs TTS will be disabled");
            return;
        }
        this.client = new ElevenLabsClient({
            apiKey: process.env.ELEVENLABS_API_KEY,
        });
        this.isAvailable = true;
        console.log("✅ ElevenLabs service initialized");
    }

    public isServiceAvailable(): boolean {
        return this.isAvailable;
    }

    // Fetch only custom voices from ElevenLabs account (exclude default/premade voices)
    public async getVoices(): Promise<ElevenLabsVoice[]> {
        if (!this.client) {
            return [];
        }

        // NOTE: Voice caching disabled by request (always fetch fresh)

        try {
            // Use show_legacy=true to get all voices including older ones
            const response = await this.client.voices.getAll({ show_legacy: true });
            
            // Log all voices for debugging
            console.log("📋 All voices from ElevenLabs:", response.voices.map((v: any) => ({
                name: v.name,
                category: v.category,
                sharing: v.sharing,
                is_owner: v.is_owner
            })));
            
            // Filter: exclude only ElevenLabs default premade voices
            // Keep: cloned, generated, professional, and any voice shared/added to library
            const customVoices = response.voices.filter((v: any) => {
                const category = (v.category || "").toLowerCase();
                // Exclude premade (ElevenLabs default voices)
                if (category === "premade") return false;
                // Include everything else (cloned, generated, professional, shared library voices)
                return true;
            });
            
            this.cachedVoices = customVoices.map((v: any) => ({
                voice_id: v.voice_id,
                name: v.name,
                category: v.category,
                description: v.description,
                labels: v.labels,
                preview_url: v.preview_url
            }));
            const categories = response.voices.reduce((acc: Record<string, number>, v: any) => {
                const key = (v.category || "unknown").toLowerCase();
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {});

            const sampleFlags = response.voices.slice(0, 5).map((v: any) => ({
                name: v.name,
                category: v.category,
                is_owner: v.is_owner,
                is_favorite: v.is_favorite,
                labels: v.labels
            }));

            console.log(`✅ Fetched ${this.cachedVoices.length} custom voices from ElevenLabs (filtered from ${response.voices.length} total)`);
            console.log("🧾 ElevenLabs categories:", categories);
            console.log("🧪 ElevenLabs voice flags sample:", sampleFlags);
            return this.cachedVoices;
        } catch (error) {
            console.error("❌ Failed to fetch ElevenLabs voices:", error);
            // Return fallback voices when API fails (e.g., missing permissions)
            console.log("📋 Using fallback voice list");
            return FALLBACK_VOICES;
        }
    }

    // Get voice ID by name
    public async getVoiceIdByName(name: string): Promise<string | null> {
        const voices = await this.getVoices();
        const voice = voices.find(v => v.name.toLowerCase() === name.toLowerCase() || v.voice_id === name);
        return voice?.voice_id || null;
    }

    // --- EMOTION SETTINGS WITH PITCH ADJUSTMENT ---
    private getEmotionalSettings(emotion: Emotion, pitch: PitchLevel = "medium"): VoiceSettings {
        // Base settings by emotion
        let settings: VoiceSettings;
        
        switch (emotion) {
            // --- Nhóm Tiêu cực ---
            case "Angry": 
                settings = { speed: 0.8, stability: 0.5, similarity_boost: 0.8, style: 0.6, use_speaker_boost: true };
                break;
            case "Shouting": // Hét: Stability cực thấp để giọng vỡ, gắt
                settings = { speed: 0.6, stability: 0.5, similarity_boost: 0.9, style: 1.0, use_speaker_boost: true };
                break;
            case "Disgusted": // Khinh bỉ: Style cao để nhấn nhá sự ghê tởm
                settings = { speed: 0.7, stability: 0.5, similarity_boost: 0.7, style: 0.8, use_speaker_boost: true };
                break;
            case "Serious": // Nghiêm túc (Mẹ/Linh): Stability cao để giọng lạnh, đều
                settings = { speed: 0.7, stability: 0.85, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true };
                break;

            // --- Nhóm Tích cực/Năng lượng ---
            case "Happy": 
                settings = { speed: 0.8, stability: 0.60, similarity_boost: 0.8, style: 0.65, use_speaker_boost: true };
                break;
            case "Excited": // Hào hứng (Klee): Style cao, stability trung bình để giọng nảy
                settings = { speed: 0.8, stability: 0.50, similarity_boost: 0.8, style: 0.9, use_speaker_boost: true };
                break;
            
            // --- Nhóm Yếu đuối/Nhẹ nhàng ---
            case "Sad":   
                settings = { speed: 0.7, stability: 0.5, similarity_boost: 0.7, style: 0.3, use_speaker_boost: true };
                break;
            case "Scared": 
                settings = { speed: 0.7, stability: 0.5, similarity_boost: 0.6, style: 0.8, use_speaker_boost: true };
                break;
            case "Shy":
                settings = { speed: 0.7, stability: 0.55, similarity_boost: 0.9, style: 0.1, use_speaker_boost: true };
                break;
            case "Whisper": // Thì thầm: Cần stability cao để rõ chữ, không bị noise
                settings = { speed: 0.7, stability: 0.80, similarity_boost: 0.6, style: 0.0, use_speaker_boost: true };
                break;
            case "Affectionate": // Nũng nịu: Stability cao để giọng ấm áp, mượt mà
                settings = { speed: 0.7, stability: 0.80, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true };
                break;

            case "Surprised": 
                settings = { speed: 0.7, stability: 0.50, similarity_boost: 0.7, style: 0.7, use_speaker_boost: true };
                break;

            default: // Neutral
                settings = { speed: 0.7, stability: 0.75, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true };
        }

        // Adjust settings based on pitch level
        // Low pitch: increase stability, decrease style for deeper voice
        // High pitch: decrease stability slightly, increase style for brighter voice
        switch (pitch) {
            case "low":
                settings.stability = Math.min(1.0, settings.stability + 0.1);
                settings.style = Math.max(0, settings.style - 0.15);
                break;
            case "high":
                settings.stability = Math.max(0, settings.stability - 0.05);
                settings.style = Math.min(1.0, settings.style + 0.1);
                break;
            // medium: no adjustment
        }

        return settings;
    }

    public async generateAudio(
        text: string, 
        voiceId: string, 
        emotion: Emotion = "Neutral", 
        outputFilePath: string,
        pitch: PitchLevel = "medium"
    ): Promise<string> {
        if (!this.client) {
            throw new Error("ElevenLabs service not available - missing API key");
        }
        if (!voiceId) throw new Error(`Missing Voice ID`);

        const voiceSettings = this.getEmotionalSettings(emotion, pitch);
        const promptText = text;

        console.log(`🎙️ [${voiceId} | ${emotion} | ${pitch}]: ${promptText}`);

        try {
            const audio = await this.client.generate({
                voice: voiceId,
                text: promptText,
                model_id: "eleven_flash_v2_5",
                voice_settings: voiceSettings,
                output_format: "mp3_44100_128"
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