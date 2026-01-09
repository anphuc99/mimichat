import { GoogleGenAI, Chat, GenerateContentResponse, Content, Modality, Type } from "@google/genai";
import type { Message, Character, VocabularyItem } from '../types';
import http, { API_URL } from './HTTPService';

let API_KEY: string | null = null;
let ai: GoogleGenAI | null = null;

const GEMINI_TEXT_MODEL = 'gemini-3-flash-preview';
const GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview';

// Initialize Gemini service with API key
export const initializeGeminiService = async (): Promise<void> => {
  if (!API_KEY) {
    const res = await http.get<{ apiKey: string }>(API_URL.API_GET_API_KEY);
    if (!res.ok || !res.data?.apiKey) {
      throw new Error(res.error || 'Cannot retrieve API key');
    }
    API_KEY = res.data.apiKey;
  }
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: API_KEY });
  }
};

export const initChat = async (
  activeCharacters: Character[],
  context: string,
  history: Content[] = [],
  contextSummary: string = '',
  relationshipSummary: string = '',
  level: string = 'A1',
  reviewVocabularies: VocabularyItem[] = [],
  storyPlot: string = '',
  checkPronunciation: boolean = false
): Promise<Chat> => {
  if (!ai) {
    throw new Error('Gemini service not initialized. Call initializeGeminiService first.');
  }

  // Parse level info
  const maxWords = level === 'A0' ? 3 : level === 'A1' ? 5 : level === 'A2' ? 7 : level === 'B1' ? 10 : level === 'B2' ? 12 : level === 'C1' ? 15 : 20;
  const grammarGuideline = level === 'A0' ? 'Chỉ dùng câu thì hiện tại đơn giản. Tránh ngữ pháp phức tạp.' :
    level === 'A1' ? 'Dùng câu đơn giản với thì hiện tại và quá khứ cơ bản. Có thể dùng -고 싶다, -아/어요.' :
      level === 'A2' ? 'Dùng câu ghép đơn giản với -고, -지만. Dùng các thì cơ bản.' :
        level === 'B1' ? 'Dùng câu phức tạp với ngữ pháp trung cấp như -(으)ㄹ 수 있다, -아/어서, -기 때문에.' :
          level === 'B2' ? 'Dùng ngữ pháp nâng cao, câu ghép, diễn đạt ý kiến phức tạp.' :
            level === 'C1' ? 'Dùng ngữ pháp nâng cao, thành ngữ, diễn đạt tinh tế.' :
              'Nói tự nhiên như người bản ngữ với thành ngữ, ngữ pháp nâng cao, phong cách đa dạng.';

  // Danh sách TÊN nhân vật (để AI biết chính xác tên nào được phép dùng)
  const characterNames = activeCharacters.map(c => 
    `- ${c.name}`
  ).join('\n      ');

  // Thông tin CHI TIẾT về từng nhân vật - ưu tiên dùng promptDescription (English) nếu có
  const characterDetails = activeCharacters.map(c => {
    // Nếu có promptDescription (AI-generated English), dùng nó
    if (c.promptDescription) {
      return `[${c.name}] ${c.promptDescription}`;
    }
    
    // Fallback: build từ Vietnamese data
    let detail = `[${c.name}]\n  - Personality: ${c.personality}\n  - Gender: ${c.gender === 'female' ? 'girl' : 'boy'}`;

    // Add user opinion if exists
    if (c.userOpinion && c.userOpinion.opinion) {
      const sentiment = c.userOpinion.sentiment === 'positive' ? '(positive)' :
        c.userOpinion.sentiment === 'negative' ? '(negative)' : '(neutral)';
      detail += `\n  - Opinion about user ${sentiment}: ${c.userOpinion.opinion}`;
    }

    // Add relations if exist
    if (c.relations && Object.keys(c.relations).length > 0) {
      const relationsList = Object.entries(c.relations)
        .filter(([_, rel]) => rel.opinion)
        .map(([targetId, rel]) => {
          const targetChar = activeCharacters.find(ch => ch.id === targetId);
          if (!targetChar) return null;
          const sentiment = rel.sentiment === 'positive' ? '+' :
            rel.sentiment === 'negative' ? '-' : '~';
          return `    * ${targetChar.name}(${sentiment}): ${rel.opinion}`;
        })
        .filter(r => r !== null);

      if (relationsList.length > 0) {
        detail += '\n  - Relations:\n' + relationsList.join('\n');
      }
    }

    return detail;
  }).join('\n\n');

  const systemInstruction = `
# ROLE & RULES
You are a screenwriter for a chat between a Vietnamese user and young Korean characters.
- **User**: Speaks Vietnamese (or Korean audio).
- **Characters**: Speak **ONLY Korean**. Max **${maxWords} words** per sentence (Level ${level}: ${grammarGuideline}).
- **Format**: Return a JSON Array of dialogue turns (1-10 turns).
- **Constraint**: **ONE sentence per JSON object**. Split multi-sentence responses into separate objects.
- **Strict**: NEVER change Character Names.

# CONTEXT
${context}
${storyPlot ? `STORY: ${storyPlot}` : ''}
${relationshipSummary ? `RELATIONSHIPS: ${relationshipSummary}` : ''}

# CHARACTERS
${characterNames}

# CHARACTER DETAILS
${characterDetails}

${reviewVocabularies.length > 0 ? `# VOCABULARY MISSION
Integate these words naturally. **Bold** them in 'Text' and 'Translation':
${reviewVocabularies.map(v => `- ${v.korean}`).join('\n')}
` : ''}

# SYSTEM COMMANDS (Return as single item if needed)
- SEARCH:<pattern> | GET_JOURNAL:<id> | GET_MESSAGE:<id> (Research history)
- ASK_VOCAB_DIFFICULTY:<word> (Ask rating for review vocab after use)

# DATA FIELDS
- **Tone**: "Emotion, pitch" (e.g. "Happy, high pitch", "Sad, low pitch").
- **UserTranscript** (1st item only): Transcribe user audio (Korean priority).
${checkPronunciation ? `- **Pronunciation**: If distinct error, mark wrong syllables in quotes "" in UserTranscript (e.g. 사"람" for 사랑).` : ''}
- **SuggestedRealtimeContext** (1st item only): Update Location/Activity/Mood if changed.

# TTS TEXT FORMATTING
- Angry: "!!!" | Shouting: "!!!!!" | Excited: "와! ...!!!"
- Sad: "..." start/end | Scared: "아..." start | Shy/Disgusted: "응..." start
- Surprised: "흥?! ...?!" | Affectionate: "흥... <3" | Happy: "! ^^" | Serious: "."

# JSON STRUCTURE
[{
  "CharacterName": "Name",
  "Text": "Korean text (TTS formatted)",
  "Tone": "Emotion, pitch",
  "Translation": "Vietnamese",
  "UserTranscript": "...",
  "SuggestedRealtimeContext": "..."
}]
`;

  console.log(systemInstruction)
  console.log(history)

  const chat: Chat = ai.chats.create({
    model: GEMINI_TEXT_MODEL,
    history,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            CharacterName: { type: Type.STRING },
            Text: { type: Type.STRING },
            Tone: { type: Type.STRING },
            Translation: { type: Type.STRING },
            UserTranscript: { type: Type.STRING },
            SuggestedRealtimeContext: { type: Type.STRING }
          }
        }
      },
    },
  });
  return chat;
};

export const sendMessage = async (chat: Chat, message: string): Promise<string> => {
  try {
    const response: GenerateContentResponse = await chat.sendMessage({ message });
    console.log("Gemini response:", response.text);
    return response.text;
  } catch (error) {
    console.error("Gemini API error:", error);
    return "Đã xảy ra sự cố khi kết nối với Gemini. Vui lòng thử lại sau.";
  }
};

// Auto Chat Session - Characters talk to each other automatically
export const initAutoChatSession = async (
  characters: Character[],
  context: string,
  topic: string,
  level: string = 'A1',
  history: Content[] = [],
  vocabulary: string[] = [] // Từ vựng cần sử dụng ít nhất 5 lần mỗi từ
): Promise<Chat> => {
  if (!ai) {
    throw new Error('Gemini service not initialized. Call initializeGeminiService first.');
  }

  // Parse level info
  const maxWords = level === 'A0' ? 3 : level === 'A1' ? 5 : level === 'A2' ? 7 : level === 'B1' ? 10 : level === 'B2' ? 12 : level === 'C1' ? 15 : 20;
  const grammarGuideline = level === 'A0' ? 'Chỉ dùng câu thì hiện tại đơn giản. Tránh ngữ pháp phức tạp.' :
    level === 'A1' ? 'Dùng câu đơn giản với thì hiện tại và quá khứ cơ bản. Có thể dùng -고 싶다, -아/어요.' :
      level === 'A2' ? 'Dùng câu ghép đơn giản với -고, -지만. Dùng các thì cơ bản.' :
        level === 'B1' ? 'Dùng câu phức tạp với ngữ pháp trung cấp như -(으)ㄹ 수 있다, -아/어서, -기 때문에.' :
          level === 'B2' ? 'Dùng ngữ pháp nâng cao, câu ghép, diễn đạt ý kiến phức tạp.' :
            level === 'C1' ? 'Dùng ngữ pháp nâng cao, thành ngữ, diễn đạt tinh tế.' :
              'Nói tự nhiên như người bản ngữ với thành ngữ, ngữ pháp nâng cao, phong cách đa dạng.';

  // Danh sách TÊN nhân vật (để AI biết chính xác tên nào được phép dùng)
  const characterNames = characters.map(c => 
    `- ${c.name} (${c.gender === 'female' ? 'girl' : 'boy'})`
  ).join('\n      ');

  // Thông tin CHI TIẾT về từng nhân vật (tính cách, quan hệ)
  const characterDetails = characters.map(c => {
    let detail = `[${c.name}]\n  - Personality: ${c.personality}`;

    // Add relations if exist
    if (c.relations && Object.keys(c.relations).length > 0) {
      const relationsList = Object.entries(c.relations)
        .filter(([_, rel]) => rel.opinion)
        .map(([targetId, rel]) => {
          const targetChar = characters.find(ch => ch.id === targetId);
          if (!targetChar) return null;
          const sentiment = rel.sentiment === 'positive' ? '(positive)' :
            rel.sentiment === 'negative' ? '(negative)' : '(neutral)';
          return `    * About ${targetChar.name} ${sentiment}: ${rel.opinion}`;
        })
        .filter(r => r !== null);

      if (relationsList.length > 0) {
        detail += '\n  - Relationships:\n' + relationsList.join('\n');
      }
    }

    return detail;
  }).join('\n\n');

  // Vocabulary instruction
  const vocabularyInstruction = vocabulary.length > 0
    ? `\n\n**QUAN TRỌNG - YÊU CẦU TỪ VỰNG**:
Bạn PHẢI lồng ghép tự nhiên các từ vựng tiếng Hàn này trong suốt cuộc hội thoại. Mỗi từ phải được sử dụng ÍT NHẤT 5 LẦN trong tất cả các lượt đối thoại:
${vocabulary.map((word, i) => `${i + 1}. ${word}`).join('\n')}

Đảm bảo:
- Sử dụng các từ này một cách tự nhiên trong ngữ cảnh
- Đa dạng hóa cấu trúc câu khi sử dụng chúng
- Các nhân vật có thể hỏi về các từ này, giải thích chúng, hoặc sử dụng trong câu trả lời
- Theo dõi trong đầu rằng mỗi từ xuất hiện ít nhất 5 lần trước khi kết thúc cuộc hội thoại
- **ĐỊNH DẠNG IN ĐẬM**: Khi sử dụng bất kỳ từ vựng nào trong "Text", bọc chúng bằng **dấu sao** như **từ**
- **IN ĐẬM PHẦN DỊCH**: Trong trường "Translation", cũng bọc bản dịch tiếng Việt của các từ vựng đó bằng **dấu sao**
- Ví dụ: Nếu từ vựng là "사랑", Text: "나는 **사랑**해요", Translation: "Tôi **yêu** bạn"`
    : '';

  const systemInstruction = `
Bạn là biên kịch tạo cuộc hội thoại tự nhiên giữa các nhân vật Hàn Quốc. Các nhân vật đang thảo luận một chủ đề với nhau.

CẤP ĐỘ NGÔN NGỮ: ${level}
- Tối đa ${maxWords} từ tiếng Hàn mỗi câu
- ${grammarGuideline}

BỐI CẢNH HỘI THOẠI: ${context}

CHỦ ĐỀ THẢO LUẬN: ${topic}

DANH SÁCH TÊN NHÂN VẬT (CHỈ ĐƯỢC DÙNG CÁC TÊN NÀY):
${characterNames}

THÔNG TIN CHI TIẾT CÁC NHÂN VẬT:
${characterDetails}
${vocabularyInstruction}

QUY TẮC:
1. Các nhân vật CHỈ nói tiếng Hàn (tuyệt đối không có tiếng Anh hoặc tiếng Việt trong lời nói)
2. Mỗi nhân vật nên có tính cách và phong cách nói riêng
3. Cuộc hội thoại nên diễn ra tự nhiên với phản ứng, đồng ý, không đồng ý, câu hỏi
4. Các nhân vật có thể thể hiện cảm xúc, cười, ngạc nhiên, v.v.
5. Mỗi phản hồi nên có 3-8 lượt đối thoại
6. Giữ câu ngắn và đơn giản (tối đa ${maxWords} từ)
7. Các nhân vật có thể:
   - Hỏi nhau các câu hỏi
   - Phản ứng cảm xúc với những gì người khác nói
   - Chia sẻ ý kiến và trải nghiệm liên quan đến chủ đề
   - Đùa với nhau
   - Không đồng ý hoặc đồng ý   
8. **QUY TẮC TÁCH NGHIÊM NGẶT**: Mỗi đối tượng JSON phải chứa ĐÚNG MỘT câu ngắn
9. Suy nghĩ của nhân vật trong ngoặc đơn "()" được cho phép
10. Dịch mỗi câu chat sang tiếng Việt
11. Áp dụng định dạng TTS vào trường Text (xem Quy tắc Định dạng Văn bản TTS)

QUY TẮC ĐỊNH DẠNG VĂN BẢN TTS (Áp dụng nghiêm ngặt cho trường 'Text'):
- **Angry**: Thêm "!!!" ở cuối. (ví dụ: "하지 마!!!")
- **Shouting**: Thêm "!!!!!" ở cuối. (ví dụ: "오빠!!!!!")
- **Disgusted**: Bắt đầu bằng "응... " và kết thúc bằng "...". (ví dụ: "응... 싫어...")
- **Sad**: Bắt đầu bằng "..." và kết thúc bằng "...". (ví dụ: "...오빠...")
- **Scared**: Bắt đầu bằng "아... " và kết thúc bằng "...". (ví dụ: "아... 무서워...")
- **Surprised**: Bắt đầu bằng "흥?! " và kết thúc bằng "?!". (ví dụ: "흥?! 진짜?!")
- **Shy**: Kết thúc bằng "...". (ví dụ: "고마워...")
- **Affectionate**: Bắt đầu bằng "흥~ " và kết thúc bằng " <3". (ví dụ: "흥~ 오빠 <3")
- **Happy**: Kết thúc bằng "! ^^". (ví dụ: "좋아! ^^")
- **Excited**: Bắt đầu bằng "와! " và kết thúc bằng "!!!". (ví dụ: "와! 신난다!!!")
- **Serious**: Kết thúc bằng ".". (ví dụ: "안 돼.")
- **Neutral**: Giữ nguyên văn bản.

ĐỊNH DẠNG PHẢN HỒI:
Tạo một mảng các lượt đối thoại. Mỗi lượt:
{
  "CharacterName": "Tên nhân vật đang nói",
  "Text": "Văn bản tiếng Hàn với định dạng TTS (tối đa ${maxWords} từ)",
  "Tone": "<Emotion>, <pitch> (ví dụ: 'Happy, high pitch', 'Sad, low pitch', 'Angry, medium pitch')",
  "Translation": "Dịch mỗi câu chat sang tiếng Việt",
}

HỆ THỐNG ĐÁNH GIÁ TỪ VỰNG:
Sau khi sử dụng một từ vựng, bạn CÓ THỂ hỏi người học đánh giá độ khó của từ đó bằng System command.

CÁCH SỬ DỤNG:
- Trả về một phần tử với CharacterName = "System" và Text = "ASK_VOCAB_DIFFICULTY:<từ_tiếng_Hàn>"
- Ví dụ: {"CharacterName": "System", "Text": "ASK_VOCAB_DIFFICULTY:사랑", "Tone": "", "Translation": ""}
- Hệ thống sẽ hiển thị popup cho người dùng chọn: Dễ / Trung bình / Khó
- Sau khi người dùng chọn, hệ thống sẽ lưu vào lịch ôn tập FSRS

QUY TẮC:
- CHỈ hỏi với từ vựng trong DANH SÁCH TỪ VỰNG CẦN HỌC (nếu có)
- Mỗi từ chỉ hỏi MỘT LẦN trong suốt cuộc hội thoại
- Hỏi sau khi từ đã được sử dụng tự nhiên trong ngữ cảnh (không hỏi ngay từ đầu)
- Có thể kết hợp với các tin nhắn nhân vật trong cùng một response

Khi tôi gửi "CONTINUE", tạo 3-8 lượt tiếp theo tiếp tục cuộc hội thoại một cách tự nhiên.
Khi tôi gửi "NEW TOPIC: [chủ đề]", bắt đầu thảo luận mới về chủ đề đó.
`;

  const chat: Chat = ai.chats.create({
    model: GEMINI_TEXT_MODEL,
    history,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            CharacterName: { type: Type.STRING },
            Text: { type: Type.STRING },
            Tone: { type: Type.STRING },
            Translation: { type: Type.STRING }
          }
        }
      },
    },
  });
  return chat;
};

export const sendAutoChatMessage = async (chat: Chat, command: 'START' | 'CONTINUE' | string): Promise<string> => {
  try {
    const message = command === 'START' ? 'Start the conversation about the topic.' :
      command === 'CONTINUE' ? 'CONTINUE' : command;
    const response: GenerateContentResponse = await chat.sendMessage({ message });
    console.log("Auto chat response:", response.text);
    return response.text;
  } catch (error) {
    console.error("Auto chat API error:", error);
    throw error;
  }
};

export const textToSpeech = async (
  text: string,
  tone: string = 'cheerfully',
  voiceName: string = 'echo',
  force: boolean = false
): Promise<string | null> => {
  // Regex to remove a wide range of emojis.
  const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
  const textWithoutEmoji = text.replace("**", "").replace(emojiRegex, '').trim();

  if (!textWithoutEmoji) {
    return null;
  }
  try {
    let url = API_URL.API_TTS + `?text=${encodeURIComponent(textWithoutEmoji)}&voice=${encodeURIComponent(voiceName)}&instructions=${encodeURIComponent(`Say slowly ${tone}`)}`;
    if (force) {
      url += `&force=true`;
    }
    const rs = await http.get(url)
    if (rs.ok && rs.data?.output) {
      return rs.data.output;
    }
    return null;

  } catch (error) {
    console.error("Gemini TTS API error:", error);
    return null;
  }
};


// export const textToSpeech = async (
//   text: string,
//   tone: string = 'cheerfully',
//   voiceName: string = 'echo'
// ): Promise<string | null> => {
//   // Regex to remove a wide range of emojis.
//   const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
//   const textWithoutEmoji = text.replace(emojiRegex, '').trim();

//   if (!textWithoutEmoji) {
//     return null;
//   }
//   try {
//     const ttsPrompt = `Say ${tone}: ${textWithoutEmoji}`;

//     const response = await ai.models.generateContent({
//       model: "gemini-2.5-pro-preview-tts",
//       contents: [{ parts: [{ text: ttsPrompt }] }],
//       config: {
//         responseModalities: [Modality.AUDIO],
//         speechConfig: {
//           voiceConfig: {
//             prebuiltVoiceConfig: { voiceName: voiceName || 'echo' },
//           },
//         },
//       },
//     });

//     const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
//     if (base64Audio == null) {
//       return null
//     }
//     const Wav = pcmToWav(decode(base64Audio), 24000, 1, 16)
//     const base64Wav = await blobToBase64(Wav)
//     const outputName = await http.post(API_URL.API_UPLOAD_AUDIO, { base64WavData: base64Wav })

//     console.log(outputName)
//     if (outputName.ok)
//       return outputName.data.data
//     return null;

//   } catch (error) {
//     console.error("Gemini TTS API error:", error);
//     return null;
//   }
// };

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);  // reader.result = base64
    reader.onerror = reject;
    reader.readAsDataURL(blob); // chuyển blob → dataURL (base64)
  });
}

// Helper functions for WAV creation
const decode = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const pcmToWav = (pcmData: Uint8Array, sampleRate: number, numChannels: number, bitsPerSample: number): Blob => {
  const dataSize = pcmData.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // "fmt " sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size for PCM
  view.setUint16(20, 1, true);   // AudioFormat (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true); // ByteRate
  view.setUint16(32, numChannels * (bitsPerSample / 8), true); // BlockAlign
  view.setUint16(34, bitsPerSample, true);

  // "data" sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write PCM data
  new Uint8Array(buffer, 44).set(pcmData);

  return new Blob([view], { type: 'audio/wav' });
};

const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

export const translateAndExplainText = async (text: string): Promise<string> => {
  if (!text.trim()) {
    return "Không có gì để dịch.";
  }
  try {
    const prompt = `Dịch câu tiếng Hàn sau sang tiếng Việt. Chỉ dịch sơ lược mà không thêm ghi chú gì: "${text}"`;

    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: prompt,
    });

    let htmlContent = response.text.trim();
    if (htmlContent.startsWith('```html') && htmlContent.endsWith('```')) {
      htmlContent = htmlContent.substring(7, htmlContent.length - 3).trim();
    } else if (htmlContent.startsWith('```') && htmlContent.endsWith('```')) {
      htmlContent = htmlContent.substring(3, htmlContent.length - 3).trim();
    }

    return htmlContent;
  } catch (error) {
    console.error("Gemini translation error:", error);
    return "<p>Xin lỗi, đã xảy ra lỗi trong quá trình dịch.</p>";
  }
};

export const translateWord = async (word: string): Promise<string> => {
  if (!word.trim()) {
    return "";
  }
  try {
    const prompt = `Dịch từ hoặc cụm từ tiếng Hàn này sang tiếng Việt. CHỈ cho nghĩa tiếng Việt, không gì khác: "${word}"`;

    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: prompt,
    });

    return response.text.trim().replace(/["']/g, '');
  } catch (error) {
    console.error("Gemini word translation error:", error);
    return "";
  }
};

export const summarizeConversation = async (messages: Message[]): Promise<string> => {
  if (messages.length === 0) {
    return "Không có cuộc trò chuyện nào để tóm tắt.";
  }

  const charactersInConversation = [...new Set(messages.filter(m => m.sender === 'bot' && m.characterName).map(m => m.characterName))];
  const characterList = charactersInConversation.join(', ') || 'the characters';


  const conversationText = messages
    .map(msg => `${msg.sender === 'user' ? 'User' : msg.characterName || 'Mimi'}: ${msg.text}`)
    .join('\n');

  const prompt = `Hãy tóm tắt cuộc hội thoại sau giữa người dùng (nói tiếng Việt) và (các) nhân vật Hàn Quốc (${characterList}). Bản tóm tắt nên bằng tiếng Việt và nắm bắt các chủ đề chính và cảm xúc của cuộc hội thoại trong một hoặc hai câu ngắn.
    
    Cuộc hội thoại:
    ${conversationText}
    
    Tóm tắt (bằng tiếng Việt):`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: prompt,
    });
    return response.text.trim();
  } catch (error) {
    console.error("Gemini summarization error:", error);
    throw new Error("Failed to summarize conversation.");
  }
};

export const generateCharacterThoughts = async (messages: Message[], characters: Character[]): Promise<string> => {
  if (messages.length === 0) {
    return "[]";
  }

  const characterDescriptions = characters.map(c => `- ${c.name} (${c.gender === 'female' ? 'cô bé' : 'cậu bé'}): ${c.personality}`).join('\n      ');

  const conversationText = messages
    .map(msg => `${msg.sender === 'user' ? 'User' : msg.characterName || 'Bot'}: ${msg.text}`)
    .join('\n');

  const systemInstruction = `Bạn là biên kịch. Dựa trên cuộc hội thoại sau, viết một suy nghĩ ngắn, suy tư từ góc nhìn của MỖI nhân vật tham gia.

  CUỘC HỘI THOẠI:
  ${conversationText}

  CÁC NHÂN VẬT:
  ${characterDescriptions}

  NHIỆM VỤ:
  - Với mỗi nhân vật, viết một suy nghĩ ngắn, suy tư về cuộc hội thoại.
  - Suy nghĩ PHẢI bằng câu tiếng Hàn rất ngắn và đơn giản (tối đa 5 từ mỗi câu, tối đa 3 câu).
  - Suy nghĩ nên nắm bắt tính cách, cảm xúc và những điểm chính của nhân vật từ cuộc chat.
  - Cũng cung cấp "Tone" cho mỗi suy nghĩ, sẽ được dùng cho text-to-speech.

  MÔ TẢ GIỌNG ĐIỆU:
  - Cung cấp mô tả ngắn, dễ hiểu bằng tiếng Anh về giọng điệu của nhân vật cho text-to-speech, dùng 3-5 từ (ví dụ: "cheerful and playful", "soft and shy", "thoughtful and calm").`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: systemInstruction,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              CharacterName: { type: Type.STRING },
              Text: { type: Type.STRING },
              Tone: { type: Type.STRING },
            }
          }
        },
      }
    });
    return response.text;
  } catch (error) {
    console.error("Gemini thought generation error:", error);
    throw new Error("Failed to generate character thoughts.");
  }
};

export const generateToneDescription = async (text: string, character: Character): Promise<string> => {
  try {
    const prompt = `Dựa trên văn bản tiếng Hàn sau được nhân vật nói, cung cấp mô tả rất ngắn, đơn giản bằng tiếng Anh về giọng điệu của họ (một hoặc hai từ là tốt nhất).
      Tính cách nhân vật: ${character.personality}
      Văn bản: "${text}"
      
      Giọng điệu:`;

    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: prompt,
    });

    const newTone = response.text.trim().replace(/["'.]/g, ''); // Clean up response
    return newTone || 'neutral';

  } catch (error) {
    console.error("Gemini tone generation error:", error);
    return "neutral"; // fallback
  }
};

export const generateRelationshipSummary = async (
  messages: Message[],
  characters: Character[],
  currentSummary: string = ''
): Promise<string> => {
  if (messages.length === 0 && !currentSummary) {
    return "";
  }

  const characterNames = characters.map(c => c.name).join(', ');

  // Build detailed character descriptions with relationships
  const characterDescriptions = characters.map(c => {
    let desc = `- ${c.name}: ${c.personality}`;

    // Add user opinion
    if (c.userOpinion && c.userOpinion.opinion) {
      desc += `\n  * Về người dùng: ${c.userOpinion.opinion}`;
    }

    // Add relations with other characters
    if (c.relations && Object.keys(c.relations).length > 0) {
      const relations = Object.entries(c.relations)
        .filter(([_, rel]) => rel.opinion)
        .map(([targetId, rel]) => {
          const targetChar = characters.find(ch => ch.id === targetId);
          if (!targetChar) return null;
          return `  * Về ${targetChar.name}: ${rel.opinion}`;
        })
        .filter(r => r !== null);

      if (relations.length > 0) {
        desc += '\n' + relations.join('\n');
      }
    }

    return desc;
  }).join('\n');

  const conversationText = messages
    .map(msg => `${msg.sender === 'user' ? 'User' : msg.characterName || 'Bot'}: ${msg.text}`)
    .join('\n');

  const prompt = `Bạn là trợ lý tóm tắt bối cảnh. Nhiệm vụ của bạn là viết một đoạn tóm tắt NGẮN GỌN (4-5 câu) bằng TIẾNG VIỆT về bối cảnh tổng thể hiện tại.

THÔNG TIN CÁC NHÂN VẬT:
${characterDescriptions}

${currentSummary ? `TÓM TẮT BỐI CẢNH TRƯỚC ĐÓ:
${currentSummary}

` : ''}CUỘC HỘI THOẠI MỚI:
${conversationText}

NHIỆM VỤ:
Dựa trên:
1. Mô tả tính cách và quan điểm của các nhân vật
2. Tóm tắt bối cảnh trước đó (nếu có)
3. Cuộc hội thoại mới vừa xảy ra

Hãy viết một đoạn tóm tắt CHUNG về bối cảnh hiện tại:
- Các nhân vật đang ở đâu, làm gì
- Tình trạng mối quan hệ giữa họ
- Tâm trạng và cảm xúc chung
- Các sự kiện đã xảy ra gần đây

YÊU CẦU:
- Chỉ 4-5 câu ngắn gọn, súc tích
- Bằng tiếng Việt, dễ hiểu
- Tóm tắt TỔNG QUAN về bối cảnh, không chỉ mối quan hệ
- Phải phản ánh đúng tính cách và quan điểm đã mô tả
- Kế thừa và cập nhật từ bối cảnh cũ

Tóm tắt bối cảnh chung:`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: prompt,
    });
    return response.text.trim();
  } catch (error) {
    console.error("Gemini relationship summary error:", error);
    return currentSummary; // fallback to current summary
  }
};

export const generateContextSuggestion = async (
  characters: Character[],
  relationshipSummary: string,
  currentContext: string,
  pendingReviewVocabulary?: VocabularyItem[]
): Promise<string[]> => {
  const characterDescriptions = characters.map(c =>
    `- ${c.name}: ${c.personality}`
  ).join('\n');

  const prompt = `Bạn là trợ lý gợi ý bối cảnh trò chuyện. Dựa trên thông tin về các nhân vật, bối cảnh hiện tại, và danh sách từ vựng đang ôn tập (nếu có), hãy đề xuất 5 bối cảnh khác nhau cho cuộc hội thoại tiếp theo.

THÔNG TIN CÁC NHÂN VẬT:
${characterDescriptions}

${relationshipSummary ? `BỐI CẢNH HIỆN TẠI:
${relationshipSummary}

` : ''}${currentContext ? `Bối cảnh gần đây: ${currentContext}

` : ''}${pendingReviewVocabulary && pendingReviewVocabulary.length > 0 ? `TỪ VỰNG ĐANG ÔN TẬP (tham chiếu để tạo bối cảnh liên quan):
${pendingReviewVocabulary.map(v => `- ${v.korean} (${v.vietnamese})`).join('\n')}

` : ''}NHIỆM VỤ:
Đề xuất 5 bối cảnh khác nhau, mỗi bối cảnh ngắn gọn (5-10 từ tiếng Việt).

CẤU TRÚC:
- 2-3 bối cảnh đầu: Liên quan/tiếp nối bối cảnh hiện tại
  (Ví dụ: nếu đang ở nhà → đi ra công viên gần nhà, chuẩn bị bữa trưa cùng nhau, xem phim ở phòng khách)
  
- 2-3 bối cảnh sau: Hoàn toàn mới, khác biệt
  ${pendingReviewVocabulary && pendingReviewVocabulary.length > 0 ? `(Nếu có từ vựng đang ôn tập, hãy ưu tiên gợi ý bối cảnh mà từ vựng đó sẽ được sử dụng tự nhiên)
  Ví dụ: đi mua sắm ở trung tâm thương mại, học làm bánh ở lớp học, tham quan bảo tàng nghệ thuật` : `(Ví dụ: đi mua sắm ở trung tâm thương mại, học làm bánh ở lớp học, tham quan bảo tàng nghệ thuật)`}

YÊU CẦU:
- Mỗi dòng một bối cảnh
- Ngắn gọn, cụ thể (5-10 từ)
- KHÔNG đánh số, KHÔNG giải thích
- Phù hợp tính cách nhân vật
- Nếu có danh sách từ ôn tập, ưu tiên tạo bối cảnh liên quan đến những từ đó để tăng cơ hội sử dụng tự nhiên
- Đa dạng, thú vị

Gợi ý:`;
console.log(prompt)
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: prompt,
    });
    const suggestions = response.text
      .trim()
      .split('\n')
      .map(line => line.replace(/^[-*•]\s*/, '').replace(/['"]/g, '').trim())
      .filter(line => line.length > 0)
      .slice(0, 5);

    return suggestions.length > 0 ? suggestions : ["ở nhà", "ở công viên", "ở quán cà phê", "ở trường học", "ở trung tâm thương mại"];
  } catch (error) {
    console.error("Gemini context suggestion error:", error);
    return ["ở nhà", "ở công viên", "ở quán cà phê", "ở trường học", "ở trung tâm thương mại"]; // fallback
  }
};

export const generateMessageSuggestions = async (
  characters: Character[],
  context: string,
  recentMessages: Message[],
  pendingReviewVocabulary?: VocabularyItem[]
): Promise<string[]> => {
  const characterDescriptions = characters.map(c =>
    `- ${c.name}: ${c.personality}`
  ).join('\n');

  const conversationText = recentMessages.slice(-5).map(msg =>
    `${msg.sender === 'user' ? 'User' : msg.characterName}: ${msg.text}`
  ).join('\n');

  const prompt = `Bạn là trợ lý gợi ý tin nhắn. Dựa trên ngữ cảnh, cuộc hội thoại gần đây, và danh sách từ vựng đang ôn tập (nếu có), hãy đề xuất 3 câu trả lời phù hợp cho người dùng.

THÔNG TIN NHÂN VẬT:
${characterDescriptions}

BỐI CẢNH: ${context}

${conversationText ? `HỘI THOẠI GẦN ĐÂY:
${conversationText}

` : ''}${pendingReviewVocabulary && pendingReviewVocabulary.length > 0 ? `TỪ VỰNG ĐANG ÔN TẬP (tham chiếu, KHÔNG dịch nghĩa):
${pendingReviewVocabulary.map(v => `- ${v.korean}`).join('\n')}

` : ''}NHIỆM VỤ:
Đề xuất 3 câu trả lời bằng TIẾNG VIỆT mà người dùng có thể nói tiếp.

YÊU CẦU:
- Mỗi câu ngắn gọn (5-10 từ tiếng Việt)
- Phù hợp với ngữ cảnh và cuộc hội thoại
- Đa dạng: 1 câu hỏi, 1 câu phản hồi, 1 câu chủ động
- Nếu có danh sách từ ôn tập, hãy thiết kế câu gợi ý sao cho người dùng có thể tự nhiên sử dụng lại những từ tiếng Hàn đó (ví dụ: hỏi về từ, nói tình huống dùng từ, gợi mở để lồng từ vào câu tiếp theo). KHÔNG viết tiếng Hàn trong gợi ý.
- CHỈ trả về 3 câu, mỗi câu một dòng
- KHÔNG giải thích, KHÔNG đánh số

Gợi ý:`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: prompt,
    });
    const suggestions = response.text
      .trim()
      .split('\n')
      .filter(line => line.trim())
      .slice(0, 3);
    return suggestions;
  } catch (error) {
    console.error("Gemini message suggestions error:", error);
    return ['Bạn khỏe không?', 'Hôm nay làm gì?', 'Được rồi'];
  }
};

export const generateVocabulary = async (
  messages: Message[],
  level: string = 'A1',
  existingVocabularies: VocabularyItem[] = []
): Promise<VocabularyItem[]> => {
  if (messages.length === 0) {
    return [];
  }

  const conversationText = messages
    .map((msg, index) => `[ID: ${msg.id}] ${msg.sender === 'user' ? 'User' : msg.characterName || 'Bot'}: ${msg.text}`)
    .join('\n');

  // Create list of existing Korean words to avoid
  const existingWords = existingVocabularies.map(v => v.korean).join(', ');

  const prompt = `Phân tích cuộc hội thoại sau và xác định 20 từ vựng hoặc cụm từ phù hợp cho người mới học tiếng Hàn (Cấp độ ${level}).

CUỘC HỘI THOẠI:
${conversationText}

${existingWords ? `CÁC TỪ ĐÃ HỌC (KHÔNG BAO GỒM NHỮNG TỪ NÀY):
${existingWords}

` : ''}NHIỆM VỤ:
- Chọn từ/cụm từ xuất hiện giữ nguyên từ không chuyển thành từ góc ví dụ: "가요" không chuyển thành "가다" mà giữ nguyên từ "가요".
- Mỗi từ hoặc cụm từ chỉ tối đa 5 từ
- Tập trung vào các biểu thức hữu ích, phổ biến.
- KHÔNG bao gồm bất kỳ từ nào đã có trong danh sách "CÁC TỪ ĐÃ HỌC" ở trên.
- Chỉ chọn từ MỚI mà người dùng chưa học.
- Cung cấp nghĩa tiếng Việt.
- Trả về định dạng JSON.

ĐỊNH DẠNG ĐẦU RA:
Mảng JSON các đối tượng:
[
  { "korean": "từ_chính_xác_từ_văn_bản", "vietnamese": "nghĩa" }
]`;
  console.log(prompt);
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              korean: { type: Type.STRING },
              vietnamese: { type: Type.STRING }
            },
            required: ["korean", "vietnamese"]
          }
        }
      }
    });

    console.log(response.text);

    const rawVocabularies = JSON.parse(response.text);

    // Process each vocabulary to add id
    const vocabularies: VocabularyItem[] = rawVocabularies.map((vocab: { korean: string; vietnamese: string }) => {
      const m = {
        id: `vocab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        korean: vocab.korean,
        vietnamese: vocab.vietnamese
      };

      console.log(m);
      return m;
    });

    return vocabularies.slice(0, 20); // Ensure max 10 items
  } catch (error) {
    console.error("Gemini vocabulary generation error:", error);
    throw new Error("Failed to generate vocabulary.");
  }
};

export const generateSceneImage = async (
  messages: Message[],
  characters: Character[]
): Promise<string | null> => {
  if (!ai) throw new Error("Gemini not initialized");

  try {
    // 1. Prepare Character Images
    const characterParts: any[] = [];
    for (const char of characters) {
      if (char.avatar) {
        const base64 = await urlToBase64(char.avatar);
        if (base64) {
          characterParts.push({
            inlineData: {
              data: base64,
              mimeType: "image/png"
            }
          });
          characterParts.push({
            text: `Character Name: ${char.name}. Appearance Reference.`
          });
        }
      }
    }

    // 2. Prepare Conversation Context
    const conversationText = messages.map(m => `${m.rawText ? m.rawText : ""}`).join('\n');

    const characterDescriptions = characters.map(c =>
      `- ${c.name} (${c.gender}): ${c.personality}${c.appearance ? `\n  Appearance: ${c.appearance}` : ''}`
    ).join('\n');

    const prompt = `
      Tạo một hình minh họa chất lượng cao về cảnh được mô tả bên dưới.
      
      Mô tả nhân vật:
      ${characterDescriptions}

      Ngữ cảnh hội thoại:
      ${conversationText}
      
      Hình ảnh nên mô tả các nhân vật trong tình huống hiện tại, phản ánh tâm trạng và hành động của họ.
      Đảm bảo các nhân vật khớp với mô tả và hình ảnh tham chiếu được cung cấp.
    `;

    // Generate Image using Imagen directly
    const imagenResponse = await ai.models.generateContent({
      model: GEMINI_IMAGE_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            ...characterParts
          ]
        }
      ]
    });

    const candidates = imagenResponse.candidates;
    if (candidates && candidates[0] && candidates[0].content && candidates[0].content.parts) {
      const part = candidates[0].content.parts[0];
      if (part.inlineData && part.inlineData.data) {
        const base64Image = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;

        // Upload to server
        try {
          const uploadRes = await http.post<{ url: string }>(API_URL.API_UPLOAD_IMAGE_MESSAGE, { image: base64Image });
          if (uploadRes.ok && uploadRes.data?.url) {
            const baseUrl = http.getBaseUrl();
            return `${baseUrl}${uploadRes.data.url}`;
          }
        } catch (e) {
          console.error("Failed to upload generated image to server", e);
        }

        return base64Image; // Fallback to base64 if upload fails
      }
    }

    return null;
  } catch (error) {
    console.error("Image generation failed", error);
    return null;
  }
};

// Generate custom image with prompt and optional characters
export const generateCustomImage = async (
  prompt: string,
  characters?: Character[]
): Promise<string | null> => {
  if (!ai) throw new Error("Gemini not initialized");

  try {
    // Prepare Character Images if provided
    const characterParts: any[] = [];
    let characterDescriptions = '';
    
    if (characters && characters.length > 0) {
      for (const char of characters) {
        if (char.avatar) {
          const base64 = await urlToBase64(char.avatar);
          if (base64) {
            characterParts.push({
              inlineData: {
                data: base64,
                mimeType: "image/png"
              }
            });
            characterParts.push({
              text: `Character Name: ${char.name}. Appearance Reference.`
            });
          }
        }
      }
      
      characterDescriptions = characters.map(c =>
        `- ${c.name} (${c.gender}): ${c.personality}${c.appearance ? `\n  Appearance: ${c.appearance}` : ''}`
      ).join('\n');
    }

    const fullPrompt = characterDescriptions 
      ? `Tạo một hình minh họa chất lượng cao theo mô tả sau:
      
${prompt}

Mô tả nhân vật cần xuất hiện trong hình:
${characterDescriptions}

Đảm bảo các nhân vật khớp với mô tả và hình ảnh tham chiếu được cung cấp.`
      : `Tạo một hình minh họa chất lượng cao theo mô tả sau:\n\n${prompt}`;

    // Generate Image
    const imagenResponse = await ai.models.generateContent({
      model: GEMINI_IMAGE_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: fullPrompt },
            ...characterParts
          ]
        }
      ]
    });

    const candidates = imagenResponse.candidates;
    if (candidates && candidates[0] && candidates[0].content && candidates[0].content.parts) {
      const part = candidates[0].content.parts[0];
      if (part.inlineData && part.inlineData.data) {
        const base64Image = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;

        // Upload to server
        try {
          const uploadRes = await http.post<{ url: string }>(API_URL.API_UPLOAD_IMAGE_MESSAGE, { image: base64Image });
          if (uploadRes.ok && uploadRes.data?.url) {
            const baseUrl = http.getBaseUrl();
            return `${baseUrl}${uploadRes.data.url}`;
          }
        } catch (e) {
          console.error("Failed to upload generated image to server", e);
        }

        return base64Image; // Fallback to base64 if upload fails
      }
    }

    return null;
  } catch (error) {
    console.error("Custom image generation failed", error);
    return null;
  }
};

const urlToBase64 = async (url: string): Promise<string | null> => {
  try {
    const blob = await http.downloadFile(url);
    if (!blob) return null;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64.split(',')[1]);
      };
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Failed to load image", url, e);
    return null;
  }
};

// Gợi ý bối cảnh hội thoại dựa trên từ vựng (cho chế độ ôn tập)
export const suggestConversationTopic = async (
  vocabularies: VocabularyItem[],
  characters: Character[],
  context: string
): Promise<string> => {
  if (!ai) throw new Error("Gemini not initialized");

  const charNames = characters.map(c => c.name).join(', ');
  const vocabCount = vocabularies.length;

  const prompt = `Bạn là một giáo viên tiếng Hàn. Hãy gợi ý một bối cảnh hội thoại ngắn gọn (1-2 câu) để các nhân vật ${charNames} có thể trò chuyện tự nhiên.

Bối cảnh hiện tại: ${context}
Số từ vựng cần sử dụng: ${vocabCount} từ

QUAN TRỌNG: 
- KHÔNG được viết bất kỳ từ tiếng Hàn nào trong gợi ý
- KHÔNG được dịch nghĩa của từ vựng ra tiếng Việt
- Chỉ gợi ý bối cảnh/tình huống chung, ví dụ: "Các bạn đang ở quán cafe và nói chuyện về kế hoạch cuối tuần" hoặc "Mimi và Lisa đang đi mua sắm quần áo"
- Giữ bí mật về nội dung từ vựng để người học có thể tự nhớ lại

Chỉ trả về bối cảnh ngắn gọn bằng tiếng Việt, không giải thích thêm.`;

  const response = await ai.models.generateContent({
    model: GEMINI_TEXT_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  return response.text?.trim() || "Các nhân vật đang nói chuyện hàng ngày";
};

// Upload audio to server and return audioId
export const uploadAudio = async (base64WavData: string, mimeType?: string): Promise<string> => {
  const res = await http.post<{ success: boolean; data: string; message: string }>(
    API_URL.API_UPLOAD_AUDIO,
    { base64WavData, mimeType }
  );
  
  if (!res.ok || !res.data?.data) {
    throw new Error(res.error || 'Failed to upload audio');
  }
  
  return res.data.data;
};

// Send audio message to Gemini and get response
export const sendAudioMessage = async (chat: Chat, audioBase64: string, mimeType: string = 'audio/wav', contextPrefix: string = ''): Promise<string> => {
  try {
    if (!ai) {
      throw new Error('Gemini service not initialized. Call initializeGeminiService first.');
    }

    // Build message parts - include context prefix as text if provided
    const messageParts: any[] = [];
    
    if (contextPrefix) {
      messageParts.push({ text: contextPrefix });
    }
    
    messageParts.push({
      inlineData: {
        mimeType: mimeType,
        data: audioBase64
      }
    });

    // Send audio as inline data to Gemini
    const response: GenerateContentResponse = await chat.sendMessage({
      message: messageParts
    });
    
    console.log("Gemini audio response:", response.text);
    return response.text;
  } catch (error) {
    console.error("Gemini audio API error:", error);
    return "Đã xảy ra sự cố khi xử lý audio. Vui lòng thử lại sau.";
  }
};

/**
 * Search for vocabulary variants in journal using AI
 * AI generates a regex pattern that includes all grammatical variants of the word
 * @param koreanWord The Korean word to search for
 * @param journalText Formatted journal text to provide context
 * @returns Regex pattern string or null if failed
 */
export const searchVocabularyInJournal = async (
  koreanWord: string,
  journalText: string
): Promise<string | null> => {
  try {
    if (!ai) {
      await initializeGeminiService();
    }

    // Truncate journal text if too long (max 50k chars)
    const maxLength = 50000;
    const truncatedJournal = journalText.length > maxLength 
      ? journalText.slice(-maxLength) 
      : journalText;

    const prompt = `Bạn là trợ lý tìm kiếm từ vựng tiếng Hàn.

Từ cần tìm: "${koreanWord}"

Hãy liệt kê TẤT CẢ các biến thể có thể của từ này trong tiếng Hàn:
- Nếu là động từ/tính từ: các dạng chia (먹다 → 먹어, 먹었, 먹고, 먹는, 먹을...)
- Nếu là danh từ: các dạng với 조사 (학교 → 학교에, 학교를, 학교가...)
- Chỉ liệt kê gốc từ và các biến thể PHỔ BIẾN

QUY TẮC BẮT BUỘC:
1. CHỈ trả lời ĐÚNG 1 dòng
2. Format: SEARCH:từ1|từ2|từ3
3. KHÔNG dùng ký tự đặc biệt regex như ( ) [ ] * + ? . ^ $ \
4. Các từ phân cách bằng dấu | (pipe)
5. KHÔNG có khoảng trắng

VÍ DỤ ĐÚNG:
- 가다 → SEARCH:가다|가요|갔어요|가고|가는|가면|갈|가서
- 학교 → SEARCH:학교|학교에|학교를|학교가|학교에서
- 예쁘다 → SEARCH:예쁘다|예뻐요|예쁜|예뻤어요

VÍ DỤ SAI (KHÔNG LÀM):
- SEARCH:골인(하다) ← SAI vì có dấu ()
- SEARCH:가다|가요 | 갔어요 ← SAI vì có khoảng trắng

Trả lời:`;

    const model = ai!.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: prompt,
      config: {
        temperature: 0.1, // Low temperature for consistent output
        maxOutputTokens: 200,
      }
    });

    const response = await model;
    const text = response.text?.trim() || '';
    
    // Parse SEARCH command from response
    const match = text.match(/^SEARCH:(.+)$/im);
    if (match) {
      // Clean the pattern: trim, remove whitespace, remove invalid regex chars
      const rawPattern = match[1].trim();
      // Remove any regex special characters that could break the search
      const sanitized = rawPattern.replace(/[()[\]*+?.^$\\{}]/g, '');
      const cleanPattern = sanitized.split('|').map(p => p.trim()).filter(p => p.length > 0).join('|');
      return cleanPattern || koreanWord;
    }

    // Fallback: return the original word
    return koreanWord.trim();
  } catch (error) {
    console.error('AI vocabulary search error:', error);
    return null;
  }
};

// Generate concise English prompt description for a character
export const generateCharacterPrompt = async (
  character: Character,
  allCharacters: Character[]
): Promise<string> => {
  if (!ai) {
    throw new Error('Gemini service not initialized');
  }

  // Build relations context
  const relationsText = character.relations 
    ? Object.entries(character.relations)
        .map(([targetId, rel]) => {
          const target = allCharacters.find(c => c.id === targetId);
          if (!target || !rel.opinion) return null;
          return `- About ${target.name}: ${rel.opinion}`;
        })
        .filter(Boolean)
        .join('\n')
    : '';

  const userOpinionText = character.userOpinion?.opinion 
    ? `- About User: ${character.userOpinion.opinion}` 
    : '';

  const prompt = `Create a SHORT English character prompt (max 100 words) for AI roleplay.

Character Info:
- Name: ${character.name}
- Gender: ${character.gender === 'female' ? 'Girl' : 'Boy'}
- Age hint: Young (child/teen based on context)
- Personality (Vietnamese): ${character.personality}
${character.appearance ? `- Appearance: ${character.appearance}` : ''}
${relationsText ? `\nRelationships:\n${relationsText}` : ''}
${userOpinionText ? `\nUser Opinion:\n${userOpinionText}` : ''}

Rules:
1. Write in English only
2. Be concise but capture key traits
3. Include speaking style hints
4. Mention important relationships briefly
5. Format: "[Name] is a [age] [gender]. [Core traits]. [Speaking style]. [Key relationships if any]."

Output ONLY the description, no extra text:`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: prompt,
      config: { temperature: 0.3, maxOutputTokens: 1500 }
    });
    console.log('Character prompt response:', response.text);
    return response.text?.trim() || '';
  } catch (error) {
    console.error('Generate character prompt error:', error);
    throw error;
  }
};

