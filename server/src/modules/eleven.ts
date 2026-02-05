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

type ElevenLabsVoiceSettingsPayload = {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
    speed?: number;
};

// Custom voice settings from client (optional override)
export interface CustomVoiceSettings {
    speed?: number;
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
}

// Default voice settings
const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
    speed: 1.0,
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.3,
    use_speaker_boost: true,
};

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

    // --- EMOTION-BASED SETTINGS ADJUSTMENT ---
    // Tinh chỉnh settings dựa trên cảm xúc, chỉ tăng/giảm delta từ base settings
    private adjustSettingsForEmotion(
        baseSettings: VoiceSettings, 
        emotion: Emotion, 
        pitch: PitchLevel = "medium"
    ): VoiceSettings {
        // Clone settings để không modify original
        const settings: VoiceSettings = { ...baseSettings };
        
        // Helper để clamp giá trị trong khoảng [0, 1]
        const clamp = (val: number, min: number = 0, max: number = 1) => Math.max(min, Math.min(max, val));
        
        // Điều chỉnh theo cảm xúc (delta-based)
        switch (emotion) {
            // --- Nhóm Tiêu cực ---
            case "Angry": 
                // Giận dữ: giảm stability, tăng style để giọng gắt hơn
                settings.stability = clamp(settings.stability - 0.15);
                settings.style = clamp(settings.style + 0.25);
                settings.speed = clamp((settings.speed ?? 1.0) + 0.1, 0.25, 2.0);
                break;
                
            case "Shouting":
                // Hét: stability thấp nhất, style cao nhất
                settings.stability = clamp(settings.stability - 0.25);
                settings.style = clamp(settings.style + 0.4);
                settings.speed = clamp((settings.speed ?? 1.0) - 0.1, 0.25, 2.0);
                break;
                
            case "Disgusted":
                // Khinh bỉ: giảm stability, tăng style
                settings.stability = clamp(settings.stability - 0.15);
                settings.style = clamp(settings.style + 0.3);
                break;
                
            case "Serious":
                // Nghiêm túc: tăng stability để giọng đều, giảm style
                settings.stability = clamp(settings.stability + 0.15);
                settings.style = clamp(settings.style - 0.2);
                settings.speed = clamp((settings.speed ?? 1.0) - 0.05, 0.25, 2.0);
                break;

            // --- Nhóm Tích cực/Năng lượng ---
            case "Happy": 
                // Vui vẻ: tăng style, tăng speed một chút
                settings.style = clamp(settings.style + 0.2);
                settings.speed = clamp((settings.speed ?? 1.0) + 0.05, 0.25, 2.0);
                break;
                
            case "Excited":
                // Hào hứng: tăng style mạnh, giảm stability để giọng năng động
                settings.stability = clamp(settings.stability - 0.1);
                settings.style = clamp(settings.style + 0.35);
                settings.speed = clamp((settings.speed ?? 1.0) + 0.1, 0.25, 2.0);
                break;
            
            // --- Nhóm Yếu đuối/Nhẹ nhàng ---
            case "Sad":
                // Buồn: giảm speed, giảm style, giữ stability
                settings.style = clamp(settings.style - 0.1);
                settings.speed = clamp((settings.speed ?? 1.0) - 0.1, 0.25, 2.0);
                break;
                
            case "Scared":
                // Sợ hãi: giảm stability để giọng run, tăng style
                settings.stability = clamp(settings.stability - 0.2);
                settings.style = clamp(settings.style + 0.25);
                break;
                
            case "Shy":
                // Ngại ngùng: tăng stability, giảm style, giảm speed
                settings.stability = clamp(settings.stability + 0.1);
                settings.style = clamp(settings.style - 0.15);
                settings.speed = clamp((settings.speed ?? 1.0) - 0.05, 0.25, 2.0);
                break;
                
            case "Whisper":
                // Thì thầm: tăng stability cao để rõ chữ, giảm style về 0
                settings.stability = clamp(settings.stability + 0.2);
                settings.style = clamp(settings.style - 0.3);
                settings.speed = clamp((settings.speed ?? 1.0) - 0.1, 0.25, 2.0);
                break;
                
            case "Affectionate":
                // Nũng nịu/âu yếm: tăng stability, tăng style vừa phải
                settings.stability = clamp(settings.stability + 0.1);
                settings.style = clamp(settings.style + 0.15);
                break;

            case "Surprised":
                // Ngạc nhiên: giảm stability, tăng style
                settings.stability = clamp(settings.stability - 0.15);
                settings.style = clamp(settings.style + 0.25);
                break;

            // Neutral: không điều chỉnh
            default:
                break;
        }

        // Điều chỉnh theo pitch
        switch (pitch) {
            case "low":
                // Giọng trầm: tăng stability, giảm style
                settings.stability = clamp(settings.stability + 0.08);
                settings.style = clamp(settings.style - 0.1);
                break;
            case "high":
                // Giọng cao: giảm stability một chút, tăng style
                settings.stability = clamp(settings.stability - 0.05);
                settings.style = clamp(settings.style + 0.08);
                break;
            // medium: không điều chỉnh
        }

        return settings;
    }

    public async generateAudio(
        text: string, 
        voiceId: string, 
        emotion: Emotion = "Neutral", 
        outputFilePath: string,
        pitch: PitchLevel = "medium",
        customSettings?: CustomVoiceSettings
    ): Promise<string> {
        if (!this.client) {
            throw new Error("ElevenLabs service not available - missing API key");
        }
        if (!voiceId) throw new Error(`Missing Voice ID`);

        const clamp01 = (val: number) => Math.max(0, Math.min(1, val));
        const clampSpeed = (val: number) => Math.max(0.25, Math.min(2.0, val));

        // Merge custom settings with defaults (base settings từ character)
        // NOTE: stability/similarity_boost/style của ElevenLabs phải nằm trong [0, 1]
        const baseSettings: VoiceSettings = {
            speed: clampSpeed(customSettings?.speed ?? DEFAULT_VOICE_SETTINGS.speed ?? 0.8),
            stability: clamp01(customSettings?.stability ?? DEFAULT_VOICE_SETTINGS.stability),
            similarity_boost: clamp01(customSettings?.similarity_boost ?? DEFAULT_VOICE_SETTINGS.similarity_boost),
            style: clamp01(customSettings?.style ?? DEFAULT_VOICE_SETTINGS.style),
            use_speaker_boost: Boolean(customSettings?.use_speaker_boost ?? DEFAULT_VOICE_SETTINGS.use_speaker_boost),
        };

        // Điều chỉnh settings theo cảm xúc và pitch
        // (sau điều chỉnh vẫn clamp lại để không bao giờ <0 hoặc >1)
        const adjusted = this.adjustSettingsForEmotion(baseSettings, emotion, pitch);
        const voiceSettings: VoiceSettings = {
            ...adjusted,
            speed: adjusted.speed !== undefined ? clampSpeed(adjusted.speed) : undefined,
            stability: clamp01(adjusted.stability),
            similarity_boost: clamp01(adjusted.similarity_boost),
            style: clamp01(adjusted.style),
            use_speaker_boost: Boolean(adjusted.use_speaker_boost),
        };

        const voiceSettingsPayload: ElevenLabsVoiceSettingsPayload = {
            stability: voiceSettings.stability,
            similarity_boost: voiceSettings.similarity_boost,
            style: voiceSettings.style,
            use_speaker_boost: voiceSettings.use_speaker_boost,
            speed: voiceSettings.speed,
        };

        const promptText = text;

        console.log(`🎙️ [${voiceId} | ${emotion} | ${pitch}]: ${promptText}`);
        console.log(`🎛️ Base Settings:`, baseSettings);
        console.log(`🎭 Adjusted for ${emotion}:`, voiceSettings);

        try {
            const audio = await this.client.generate({
                voice: voiceId,
                text: promptText,
                model_id: "eleven_multilingual_v2",
                voice_settings: voiceSettingsPayload,
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