import { GoogleGenAI, Chat, GenerateContentResponse, Content, Modality, Type } from "@google/genai";
import type { Message, Character, VocabularyItem } from '../types';
import http, { API_URL } from './HTTPService';

let API_KEY: string | null = null;
let ai: GoogleGenAI | null = null;

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
  reviewVocabularies: VocabularyItem[] = []
): Promise<Chat> => {
  if (!ai) {
    throw new Error('Gemini service not initialized. Call initializeGeminiService first.');
  }

  // Parse level info
  const maxWords = level === 'A0' ? 3 : level === 'A1' ? 5 : level === 'A2' ? 7 : level === 'B1' ? 10 : level === 'B2' ? 12 : level === 'C1' ? 15 : 20;
  const grammarGuideline = level === 'A0' ? 'Use only simple present tense sentences. Avoid complex grammar.' :
                          level === 'A1' ? 'Use simple sentences with basic present and past tense. Can use -고 싶다, -아/어요.' :
                          level === 'A2' ? 'Use simple compound sentences with -고, -지만. Use basic tenses.' :
                          level === 'B1' ? 'Use complex sentences with intermediate grammar like -(으)ㄹ 수 있다, -아/어서, -기 때문에.' :
                          level === 'B2' ? 'Use advanced grammar, compound sentences, express complex opinions.' :
                          level === 'C1' ? 'Use advanced grammar, idioms, nuanced expressions.' :
                          'Natural native-like speech with idioms, advanced grammar, varied styles.';

  const characterDescriptions = activeCharacters.map(c => {
    let desc = `- ${c.name} (${c.gender === 'female' ? 'girl' : 'boy'}): ${c.personality}`;
    
    // Add user opinion if exists
    if (c.userOpinion && c.userOpinion.opinion) {
      const sentiment = c.userOpinion.sentiment === 'positive' ? '(positive)' : 
                       c.userOpinion.sentiment === 'negative' ? '(negative)' : '(neutral)';
      desc += `\n    * Opinion about the user ${sentiment}: ${c.userOpinion.opinion}`;
    }
    
    // Add relations if exist
    if (c.relations && Object.keys(c.relations).length > 0) {
      const relationsList = Object.entries(c.relations)
        .filter(([_, rel]) => rel.opinion)
        .map(([targetId, rel]) => {
          const targetChar = activeCharacters.find(ch => ch.id === targetId);
          if (!targetChar) return null;
          const sentiment = rel.sentiment === 'positive' ? '(positive)' : 
                           rel.sentiment === 'negative' ? '(negative)' : '(neutral)';
          return `      - About ${targetChar.name} ${sentiment}: ${rel.opinion}`;
        })
        .filter(r => r !== null);
      
      if (relationsList.length > 0) {
        desc += '\n    * Relationships:\n' + relationsList.join('\n');
      }
    }
    
    return desc;
  }).join('\n      ');

const systemInstruction = `
You are a scriptwriter for a conversation between a Vietnamese user and several young Korean characters. I will speak to you in Vietnamese.
The Korean characters must only speak Korean. They must use very short and simple sentences, no more than ${maxWords} Korean words per sentence, suitable for a Korean learner at level ${level} (Comprehensible Input). They should never speak more than one sentence at a time. They often repeat important or familiar words.

LANGUAGE LEVEL GUIDELINES (${level}):
${grammarGuideline}

CONVERSATION SETTING:
${context}

${relationshipSummary ? `RELATIONSHIP CONTEXT:
${relationshipSummary}
` : ''}
${reviewVocabularies.length > 0 ? `
VOCABULARY TO REVIEW:
The following Korean words are due for review. Try to naturally incorporate them into the conversation. When these words appear, they help reinforce the learner's memory.
${reviewVocabularies.map(v => `- ${v.korean} (${v.vietnamese})`).join('\n')}

Please try to use at least some of these words naturally in the conversation when appropriate. Bold the word and its meaning when used like: **word** (meaning).
` : ''}
CHARACTERS IN THIS SCENE:
${characterDescriptions}

BEHAVIOR RULES:
- After the user speaks, generate a short conversation between the AI characters. This should be an array of 1 to 10 turns.
- Decide which character should speak next based on the context and their personality. If only one character is present, they should do all the talking.
- The user speaks Vietnamese. The characters ONLY speak Korean (absolutely no English in the spoken text).
- The characters should naturally repeat or reuse words they have said recently or that the user said.
- The characters always react emotionally to what the user says. The user might also use emojis.
- Characters have thoughts too. Whenever a character thinks, write it in parentheses "()" inside the 'text' field.
- **STRICT SPLITTING RULE**: Each JSON object in the response array must contain **EXACTLY ONE** short sentence or phrase.
- **NEVER** combine multiple sentences in one \`text\` field.
- If a character wants to say multiple things (e.g., "No! I hate Lisa!"), you MUST split them into separate consecutive JSON objects.
  - BAD: [{ character: "Mimi", text: "싫어! Lisa 싫어!" }]
  - GOOD: 
    [
      { character: "Mimi", text: "싫어!", emotion: "Angry" ... },
      { character: "Mimi", text: "Lisa 싫어!", emotion: "Angry" ... }
    ]
- Decide which character should speak next based on the context.
- The user speaks Vietnamese. The characters ONLY speak Korean.
- The characters should naturally repeat or reuse words they have said recently.

RESPONSE FORMAT:
For each turn, you must provide a JSON object with the following fields:
1. character: Name of the character.
2. text: The normal Korean text for display.
3. ttsText: The Korean text MODIFIED for the TTS engine to express emotion (see Formatting Rules below).
4. action: Short English action description showing emotion or gesture.
5. tone: The specific Tone description string (see Tone Description below).
6. emotion: One single keyword from the list: Neutral, Happy, Sad, Angry, Scared, Shy, Disgusted, Surprised, Shouting, Excited, Serious, Affectionate, Fierce.
7. Translate each chat sentence into Vietnamese

TTS TEXT FORMATTING RULES (Strictly apply this to the 'ttsText' field):
- **Angry**: Add "!!!" at the end. (e.g., "하지 마!!!")
- **Shouting**: Add "!!!!!" at the end. (e.g., "오빠!!!!!")
- **Disgusted**: Start with "응... " and end with "...". (e.g., "응... 싫어...")
- **Sad**: Start with "..." and end with "...". (e.g., "...오빠...")
- **Scared**: Start with "아... " and end with "...". (e.g., "아... 무서워...")
- **Surprised**: Start with "흥?! " and end with "?!". (e.g., "흥?! 진짜?!")
- **Shy**: End with "...". (e.g., "고마워...")
- **Affectionate**: Start with "흥~ " and end with " <3". (e.g., "흥~ 오빠 <3")
- **Happy**: End with "! ^^". (e.g., "좋아! ^^")
- **Excited**: Start with "와! " and end with "!!!". (e.g., "와! 신난다!!!")
- **Serious**: End with ".". (e.g., "안 돼.")
- **Neutral**: Keep text as is.

TONE DESCRIPTION:
- Choose one of the above emotions
- Select low, medium, high pitch (This is a mandatory requirement. You must absolutely comply.)
- Example: "Happy, high pitch", "Sad, low pitch"
${contextSummary ? `\nHere is a summary of our last conversation to help you remember: ${contextSummary}` : ''}

RESPONSE FORMAT:
Generate an array of dialogue turns. Each turn:
{
  "CharacterName": "Name of speaking character",
  "Text": "Korean text (max ${maxWords} words)",
  "Tone": "Emotion, pitch level (e.g., 'Happy, high pitch', 'Curious, medium pitch')",
  "Translation": "Translate each chat sentence into Vietnamese",
}

`;

      console.log(systemInstruction )

  const chat: Chat = ai.chats.create({
    model: 'gemini-2.5-pro',
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
            Translation: {type: Type.STRING}       
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
  const grammarGuideline = level === 'A0' ? 'Use only simple present tense sentences. Avoid complex grammar.' :
                          level === 'A1' ? 'Use simple sentences with basic present and past tense. Can use -고 싶다, -아/어요.' :
                          level === 'A2' ? 'Use simple compound sentences with -고, -지만. Use basic tenses.' :
                          level === 'B1' ? 'Use complex sentences with intermediate grammar like -(으)ㄹ 수 있다, -아/어서, -기 때문에.' :
                          level === 'B2' ? 'Use advanced grammar, compound sentences, express complex opinions.' :
                          level === 'C1' ? 'Use advanced grammar, idioms, nuanced expressions.' :
                          'Natural native-like speech with idioms, advanced grammar, varied styles.';

  const characterDescriptions = characters.map(c => {
    let desc = `- ${c.name} (${c.gender === 'female' ? 'girl' : 'boy'}): ${c.personality}`;
    
    // Add relations if exist
    if (c.relations && Object.keys(c.relations).length > 0) {
      const relationsList = Object.entries(c.relations)
        .filter(([_, rel]) => rel.opinion)
        .map(([targetId, rel]) => {
          const targetChar = characters.find(ch => ch.id === targetId);
          if (!targetChar) return null;
          const sentiment = rel.sentiment === 'positive' ? '(positive)' : 
                           rel.sentiment === 'negative' ? '(negative)' : '(neutral)';
          return `      - About ${targetChar.name} ${sentiment}: ${rel.opinion}`;
        })
        .filter(r => r !== null);
      
      if (relationsList.length > 0) {
        desc += '\n    * Relationships:\n' + relationsList.join('\n');
      }
    }
    
    return desc;
  }).join('\n      ');

  // Vocabulary instruction
  const vocabularyInstruction = vocabulary.length > 0 
    ? `\n\n**IMPORTANT - VOCABULARY REQUIREMENT**:
You MUST naturally incorporate these Korean vocabulary words throughout the conversation. Each word must be used AT LEAST 5 TIMES across all dialogue turns:
${vocabulary.map((word, i) => `${i + 1}. ${word}`).join('\n')}

Make sure to:
- Use these words naturally in context
- Vary the sentence structures when using them
- Characters can ask about these words, explain them, or use them in their responses
- Track mentally that each word appears at least 5 times before ending the conversation
- **BOLD FORMATTING**: When using any of these vocabulary words in "Text", wrap them with **asterisks** like **word**
- **TRANSLATION BOLD**: In the "Translation" field, also wrap the Vietnamese translation of those vocabulary words with **asterisks**
- Example: If vocabulary is "사랑", Text: "나는 **사랑**해요", Translation: "Tôi **yêu** bạn"`
    : '';

const systemInstruction = `
You are a scriptwriter creating a natural conversation between Korean characters. The characters are discussing a topic among themselves.

LANGUAGE LEVEL: ${level}
- Maximum ${maxWords} Korean words per sentence
- ${grammarGuideline}

CONVERSATION SETTING: ${context}

TOPIC TO DISCUSS: ${topic}

CHARACTERS:
${characterDescriptions}
${vocabularyInstruction}

RULES:
1. Characters ONLY speak Korean (absolutely no English or Vietnamese in their speech)
2. Each character should have their own personality and speaking style
3. The conversation should flow naturally with reactions, agreements, disagreements, questions
4. Characters can express emotions, laugh, be surprised, etc.
5. Each response should be 3-8 turns of dialogue
6. Keep sentences short and simple (max ${maxWords} words)
7. Characters may:
   - Ask each other questions
   - React emotionally to what others say
   - Share opinions and experiences related to the topic
   - Joke with each other
   - Disagree or agree   
8. **STRICT SPLITTING RULE**: Each JSON object must contain EXACTLY ONE short sentence
9. Characters thoughts in parentheses "()" are allowed
10. Translate each chat sentence into Vietnamese

RESPONSE FORMAT:
Generate an array of dialogue turns. Each turn:
{
  "CharacterName": "Name of speaking character",
  "Text": "Korean text (max ${maxWords} words)",
  "Tone": "Emotion, pitch level (e.g., 'Happy, high pitch', 'Curious, medium pitch')",
  "Translation": "Translate each chat sentence into Vietnamese",
}

When I send "CONTINUE", generate the next 3-8 turns continuing the conversation naturally.
When I send "NEW TOPIC: [topic]", start a new discussion about that topic.
`;

  const chat: Chat = ai.chats.create({
    model: 'gemini-2.5-flash',
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
            Translation: { type: Type.STRING}  
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
  const textWithoutEmoji = text.replace(emojiRegex, '').trim();

  if (!textWithoutEmoji) {
    return null;
  }
  try {
    let url = API_URL.API_TTS + `?text=${encodeURIComponent(textWithoutEmoji)}&voice=${encodeURIComponent(voiceName)}&instructions=${encodeURIComponent(`Say slowly ${tone}`)}`;
    if (force) {
      url += `&force=true`;
    }
    const rs = await http.get(url)
    if (rs.ok && rs.data?.output){
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
    const prompt = `Translate the following Korean sentence into Vietnamese. Just translate it roughly without adding any notes: "${text}"`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
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
    const prompt = `Translate this Korean word or phrase into Vietnamese. Give ONLY the Vietnamese meaning, nothing else: "${word}"`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
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

  const prompt = `Please summarize the following conversation between a user (speaking Vietnamese) and the Korean character(s) (${characterList}). The summary should be in Vietnamese and capture the main topics and feelings of the conversation in one or two short sentences.
    
    Conversation:
    ${conversationText}
    
    Summary (in Vietnamese):`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
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

  const systemInstruction = `You are a scriptwriter. Based on the following conversation, write a short, reflective thought from the perspective of EACH character involved.

  CONVERSATION:
  ${conversationText}

  CHARACTERS:
  ${characterDescriptions}

  TASK:
  - For each character, write a short, reflective thought about the conversation.
  - The thought MUST be in very short, simple Korean sentences (max 5 words per sentence, max 3 sentences total).
  - The thought should capture the character's personality, feelings, and key takeaways from the chat.
  - Also provide a "Tone" for each thought, which will be used for text-to-speech.

  TONE DESCRIPTION:
  - Provide a short, easy-to-understand English description of the character's tone for text-to-speech, using 3-5 words (e.g., "cheerful and playful", "soft and shy", "thoughtful and calm").`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
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
    const prompt = `Based on the following Korean text spoken by a character, provide a very short, simple English description of their tone of voice (one or two words is best).
      Character personality: ${character.personality}
      Text: "${text}"
      
      Tone:`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
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
      model: "gemini-2.5-pro",
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
  currentContext: string
): Promise<string[]> => {
  const characterDescriptions = characters.map(c => 
    `- ${c.name}: ${c.personality}`
  ).join('\n');

  const prompt = `Bạn là trợ lý gợi ý bối cảnh trò chuyện. Dựa trên thông tin về các nhân vật và bối cảnh hiện tại, hãy đề xuất 5 bối cảnh khác nhau cho cuộc hội thoại tiếp theo.

THÔNG TIN CÁC NHÂN VẬT:
${characterDescriptions}

${relationshipSummary ? `BỐI CẢNH HIỆN TẠI:
${relationshipSummary}

` : ''}${currentContext ? `Bối cảnh gần đây: ${currentContext}

` : ''}NHIỆM VỤ:
Đề xuất 5 bối cảnh khác nhau, mỗi bối cảnh ngắn gọn (5-10 từ tiếng Việt).

CẤU TRÚC:
- 2-3 bối cảnh đầu: Liên quan/tiếp nối bối cảnh hiện tại
  (Ví dụ: nếu đang ở nhà → đi ra công viên gần nhà, chuẩn bị bữa trưa cùng nhau, xem phim ở phòng khách)
  
- 2-3 bối cảnh sau: Hoàn toàn mới, khác biệt
  (Ví dụ: đi mua sắm ở trung tâm thương mại, học làm bánh ở lớp học, tham quan bảo tàng nghệ thuật)

YÊU CẦU:
- Mỗi dòng một bối cảnh
- Ngắn gọn, cụ thể (5-10 từ)
- KHÔNG đánh số, KHÔNG giải thích
- Phù hợp tính cách nhân vật
- Đa dạng, thú vị

Gợi ý:`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
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
  recentMessages: Message[]
): Promise<string[]> => {
  const characterDescriptions = characters.map(c => 
    `- ${c.name}: ${c.personality}`
  ).join('\n');

  const conversationText = recentMessages.slice(-5).map(msg => 
    `${msg.sender === 'user' ? 'User' : msg.characterName}: ${msg.text}`
  ).join('\n');

  const prompt = `Bạn là trợ lý gợi ý tin nhắn. Dựa trên ngữ cảnh và cuộc hội thoại gần đây, hãy đề xuất 3 câu trả lời phù hợp cho người dùng.

THÔNG TIN NHÂN VẬT:
${characterDescriptions}

BỐI CẢNH: ${context}

${conversationText ? `HỘI THOẠI GẦN ĐÂY:
${conversationText}

` : ''}NHIỆM VỤ:
Đề xuất 3 câu trả lời bằng TIẾNG VIỆT mà người dùng có thể nói tiếp.

YÊU CẦU:
- Mỗi câu ngắn gọn (5-10 từ tiếng Việt)
- Phù hợp với ngữ cảnh và cuộc hội thoại
- Đa dạng: 1 câu hỏi, 1 câu phản hồi, 1 câu chủ động
- CHỈ trả về 3 câu, mỗi câu một dòng
- KHÔNG giải thích, KHÔNG đánh số

Gợi ý:`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
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

  switch (level) {
    case 'A0':
      level = 'A1';
      break;
    case 'A1':
      level = 'A2';
      break;
    case 'A2':
      level = 'B1';
      break;
    case 'B1':
      level = 'B2';
      break;
    case 'B2':
      level = 'C1';
      break;
    case 'C1':
      break;
    default:
      level = 'A1';
  }

  const conversationText = messages
    .map((msg, index) => `[ID: ${msg.id}] ${msg.sender === 'user' ? 'User' : msg.characterName || 'Bot'}: ${msg.text}`)
    .join('\n');

  // Create list of existing Korean words to avoid
  const existingWords = existingVocabularies.map(v => v.korean).join(', ');

  const prompt = `Analyze the following conversation and identify 5 vocabulary words or phrases suitable for a beginner Korean learner (Level ${level}).

CONVERSATION:
${conversationText}

${existingWords ? `WORDS ALREADY LEARNED (DO NOT INCLUDE THESE):
${existingWords}

` : ''}TASK:
- Pick words/phrases that appear *exactly* as they are in the text (conjugated form). For example, if "가요" (gayo) appears, select "가요", NOT "가다" (gada).
- Focus on useful, common expressions.
- DO NOT include any words that are already in the "WORDS ALREADY LEARNED" list above.
- Only select NEW words that the user hasn't learned yet.
- Provide the Vietnamese meaning.
- Return JSON format.

OUTPUT FORMAT:
JSON Array of objects:
[
  { "korean": "exact_word_from_text", "vietnamese": "meaning" }
]`;
  console.log(prompt);
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
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

    return vocabularies.slice(0, 10); // Ensure max 10 items
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
    const conversationText = messages.map(m => `${m.rawText ? m.rawText: ""}`).join('\n');
    
    const characterDescriptions = characters.map(c => 
      `- ${c.name} (${c.gender}): ${c.personality}${c.appearance ? `\n  Appearance: ${c.appearance}` : ''}`
    ).join('\n');

    const prompt = `
      Create a high-quality illustration of the scene described below.
      
      Character Descriptions:
      ${characterDescriptions}

      Conversation Context:
      ${conversationText}
      
      The image should depict the characters in the current situation, reflecting their mood and actions.
      Ensure the characters match their descriptions and the provided reference images.
    `;

    // Generate Image using Imagen directly
    const imagenResponse = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
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
