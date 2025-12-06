import { GoogleGenerativeAI, GenerativeModel, ChatSession, Content } from "@google/generative-ai";
import crypto from "crypto";

interface ChatMessage {
  role: 'user' | 'model';
  parts: [{ text: string }];
}

interface ChatOptions {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
}

interface Character {
  id: string;
  name: string;
  personality: string;
  gender: string;
  voiceName?: string;
  relations?: Record<string, any>;
  userOpinion?: {
    opinion: string;
    sentiment: string;
    closeness: number;
  };
  appearance?: string;
  avatar?: string;
}

interface Message {
  id: string;
  text: string;
  rawText?: string;
  sender: 'user' | 'bot';
  characterName?: string;
  timestamp: number;
}

interface VocabularyItem {
  id: string;
  korean: string;
  vietnamese: string;
  usages: any[];
  createdAt: string;
}

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash" 
    });
  }

  async initChat(
    activeCharacters: Character[],
    context: string,
    history: Content[] = [],
    contextSummary: string = '',
    relationshipSummary: string = '',
    level: string = 'A1'
  ): Promise<ChatSession> {
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
          .filter(([_, rel]: [string, any]) => rel.opinion)
          .map(([targetId, rel]: [string, any]) => {
            const targetChar = activeCharacters.find(ch => ch.id === targetId);
            return targetChar ? `${targetChar.name}: ${rel.opinion}` : null;
          })
          .filter(r => r !== null);
        
        if (relationsList.length > 0) {
          desc += `\n    * Relations: ${relationsList.join(', ')}`;
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

RESPONSE FORMAT:
Generate an array of dialogue turns. Each turn:
{
  "CharacterName": "Name of speaking character",
  "Text": "Korean text (max ${maxWords} words)",
  "Tone": "Emotion, pitch level (e.g., 'Happy, high pitch', 'Curious, medium pitch')",
  "Translation": "Translate each chat sentence into Vietnamese",
}

${contextSummary ? `\nHere is a summary of our last conversation to help you remember: ${contextSummary}` : ''}
`;

    const chat = this.model.startChat({
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048,
        responseMimeType: "application/json"
      },
      history,
      systemInstruction
    });
    
    return chat;
  }

  async sendMessage(chat: ChatSession, message: string): Promise<string> {
    try {
      const response = await chat.sendMessage(message);
      const responseText = response.response.text();
      console.log("Gemini response:", responseText);
      return responseText;
    } catch (error) {
      console.error("Gemini API error:", error);
      return "Đã xảy ra sự cố khi kết nối với Gemini. Vui lòng thử lại sau.";
    }
  }

  async initAutoChatSession(
    characters: Character[],
    context: string,
    topic: string,
    level: string = 'A1',
    history: Content[] = [],
    vocabulary: string[] = []
  ): Promise<ChatSession> {
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
      
      if (c.relations && Object.keys(c.relations).length > 0) {
        const relationsList = Object.entries(c.relations)
          .filter(([_, rel]: [string, any]) => rel.opinion)
          .map(([targetId, rel]: [string, any]) => {
            const targetChar = characters.find(ch => ch.id === targetId);
            return targetChar ? `${targetChar.name}: ${rel.opinion}` : null;
          })
          .filter(r => r !== null);
        
        if (relationsList.length > 0) {
          desc += `\n    * Relations: ${relationsList.join(', ')}`;
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

    const chat = this.model.startChat({
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048,
        responseMimeType: "application/json"
      },
      history,
      systemInstruction
    });
    
    return chat;
  }

  async sendAutoChatMessage(chat: ChatSession, command: 'START' | 'CONTINUE' | string): Promise<string> {
    try {
      const message = command === 'START' ? 'Start the conversation about the topic.' :
                      command === 'CONTINUE' ? 'CONTINUE' : command;
      const response = await chat.sendMessage(message);
      const responseText = response.response.text();
      console.log("Auto chat response:", responseText);
      return responseText;
    } catch (error) {
      console.error("Auto chat API error:", error);
      throw error;
    }
  }

  async translateAndExplainText(text: string): Promise<string> {
    if (!text.trim()) {
      return "Không có gì để dịch.";
    }
    try {
      const prompt = `Translate the following Korean sentence into Vietnamese. Just translate it roughly without adding any notes: "${text}"`;

      const response = await this.model.generateContent(prompt);
      const result = await response.response;
      
      let htmlContent = result.text().trim();
      if (htmlContent.startsWith('```html') && htmlContent.endsWith('```')) {
        htmlContent = htmlContent.slice(7, -3).trim();
      } else if (htmlContent.startsWith('```') && htmlContent.endsWith('```')) {
        htmlContent = htmlContent.slice(3, -3).trim();
      }

      return htmlContent;
    } catch (error) {
      console.error("Gemini translation error:", error);
      return "<p>Xin lỗi, đã xảy ra lỗi trong quá trình dịch.</p>";
    }
  }

  async translateWord(word: string): Promise<string> {
    if (!word.trim()) {
      return "";
    }
    try {
      const prompt = `Translate this Korean word or phrase into Vietnamese. Give ONLY the Vietnamese meaning, nothing else: "${word}"`;

      const response = await this.model.generateContent(prompt);
      const result = await response.response;

      return result.text().trim().replace(/["']/g, '');
    } catch (error) {
      console.error("Gemini word translation error:", error);
      return "";
    }
  }

  async summarizeConversation(messages: Message[]): Promise<string> {
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
      const response = await this.model.generateContent(prompt);
      const result = await response.response;
      return result.text().trim();
    } catch (error) {
      console.error("Gemini summarization error:", error);
      throw new Error("Failed to summarize conversation.");
    }
  }

  async generateCharacterThoughts(messages: Message[], characters: Character[]): Promise<string> {
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
      const response = await this.model.generateContent({
        contents: [{ role: "user", parts: [{ text: systemInstruction }] }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      });
      const result = await response.response;
      return result.text();
    } catch (error) {
      console.error("Gemini thought generation error:", error);
      throw new Error("Failed to generate character thoughts.");
    }
  }

  async generateToneDescription(text: string, character: Character): Promise<string> {
    try {
      const prompt = `Based on the following Korean text spoken by a character, provide a very short, simple English description of their tone of voice (one or two words is best).
        Character personality: ${character.personality}
        Text: "${text}"
        
        Tone:`;

      const response = await this.model.generateContent(prompt);
      const result = await response.response;

      const newTone = result.text().trim().replace(/["'.]/g, ''); // Clean up response
      return newTone || 'neutral';

    } catch (error) {
      console.error("Gemini tone generation error:", error);
      return "neutral"; // fallback
    }
  }

  async generateRelationshipSummary(
    messages: Message[], 
    characters: Character[],
    currentSummary: string = ''
  ): Promise<string> {
    if (messages.length === 0 && !currentSummary) {
      return "";
    }

    const characterNames = characters.map(c => c.name).join(', ');
    
    // Build detailed character descriptions with relationships
    const characterDescriptions = characters.map(c => {
      let desc = `- ${c.name}: ${c.personality}`;
      
      // Add user opinion
      if (c.userOpinion && c.userOpinion.opinion) {
        desc += `\n  * Quan điểm về user: ${c.userOpinion.opinion}`;
      }
      
      // Add relations with other characters
      if (c.relations && Object.keys(c.relations).length > 0) {
        const relationsList = Object.entries(c.relations)
          .filter(([_, rel]: [string, any]) => rel.opinion)
          .map(([targetId, rel]: [string, any]) => {
            const targetChar = characters.find(ch => ch.id === targetId);
            return targetChar ? `${targetChar.name}: ${rel.opinion}` : null;
          })
          .filter(r => r !== null);
        
        if (relationsList.length > 0) {
          desc += `\n  * Quan hệ: ${relationsList.join(', ')}`;
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
      const response = await this.model.generateContent(prompt);
      const result = await response.response;
      return result.text().trim();
    } catch (error) {
      console.error("Gemini relationship summary error:", error);
      return currentSummary; // fallback to current summary
    }
  }

  async generateVocabulary(
    messages: Message[],
    level: string = 'A1',
    existingVocabularies: VocabularyItem[] = []
  ): Promise<VocabularyItem[]> {
    if (messages.length === 0) {
      return [];
    }

    const conversationText = messages
      .map((msg) => `[ID: ${msg.id}] ${msg.sender === 'user' ? 'User' : msg.characterName || 'Bot'}: ${msg.text}`)
      .join('\n');

    // Create list of existing Korean words to avoid
    const existingWords = existingVocabularies.map(v => v.korean).join(', ');

    const prompt = `Analyze the following conversation and identify 5-10 vocabulary words or phrases suitable for a beginner Korean learner (Level ${level}).

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

    try {
      const response = await this.model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      });
      const result = await response.response;
      const rawVocabularies = JSON.parse(result.text());
      
      // Process each vocabulary to add id
      const vocabularies: VocabularyItem[] = rawVocabularies.map((vocab: { korean: string; vietnamese: string }) => ({
        id: crypto.randomUUID(),
        korean: vocab.korean,
        vietnamese: vocab.vietnamese,
        usages: [],
        createdAt: new Date().toISOString()
      }));

      return vocabularies.slice(0, 10); // Ensure max 10 items
    } catch (error) {
      console.error("Gemini vocabulary generation error:", error);
      throw new Error("Failed to generate vocabulary.");
    }
  }

  // Basic chat and generation methods for backward compatibility
  async chat(
    messages: ChatMessage[],
    systemPrompt?: string,
    options: ChatOptions = {}
  ): Promise<string> {
    try {
      const defaultOptions = {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048,
        ...options
      };

      const generationConfig = {
        temperature: defaultOptions.temperature,
        topP: defaultOptions.topP,
        topK: defaultOptions.topK,
        maxOutputTokens: defaultOptions.maxOutputTokens,
      };

      // Prepare chat history
      const history = messages.map(msg => ({
        role: msg.role,
        parts: msg.parts
      }));

      // Start chat session
      const chatSession = this.model.startChat({
        generationConfig,
        history: history.slice(0, -1), // All messages except the last one
        systemInstruction: systemPrompt
      });

      // Get the last message (user's current input)
      const lastMessage = history[history.length - 1];
      if (!lastMessage || lastMessage.role !== 'user') {
        throw new Error('Last message must be from user');
      }

      const result = await chatSession.sendMessage(lastMessage.parts[0].text);
      const response = await result.response;
      
      return response.text();
    } catch (error: any) {
      console.error('Gemini API error:', error);
      throw new Error(`Gemini API failed: ${error.message}`);
    }
  }

  async generateText(
    prompt: string, 
    systemPrompt?: string,
    options: ChatOptions = {}
  ): Promise<string> {
    try {
      const messages: ChatMessage[] = [
        { role: 'user', parts: [{ text: prompt }] }
      ];

      return await this.chat(messages, systemPrompt, options);
    } catch (error: any) {
      console.error('Gemini generate text error:', error);
      throw new Error(`Gemini generate text failed: ${error.message}`);
    }
  }

  async streamChat(
    messages: ChatMessage[],
    systemPrompt?: string,
    options: ChatOptions = {}
  ): Promise<AsyncIterable<string>> {
    try {
      const defaultOptions = {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048,
        ...options
      };

      const generationConfig = {
        temperature: defaultOptions.temperature,
        topP: defaultOptions.topP,
        topK: defaultOptions.topK,
        maxOutputTokens: defaultOptions.maxOutputTokens,
      };

      // Prepare chat history
      const history = messages.map(msg => ({
        role: msg.role,
        parts: msg.parts
      }));

      // Start chat session
      const chatSession = this.model.startChat({
        generationConfig,
        history: history.slice(0, -1), // All messages except the last one
        systemInstruction: systemPrompt
      });

      // Get the last message (user's current input)
      const lastMessage = history[history.length - 1];
      if (!lastMessage || lastMessage.role !== 'user') {
        throw new Error('Last message must be from user');
      }

      const result = await chatSession.sendMessageStream(lastMessage.parts[0].text);

      return this.createStreamIterator(result.stream);
    } catch (error: any) {
      console.error('Gemini stream chat error:', error);
      throw new Error(`Gemini stream chat failed: ${error.message}`);
    }
  }

  private async* createStreamIterator(stream: any): AsyncIterable<string> {
    for await (const chunk of stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        yield chunkText;
      }
    }
  }
}

export default GeminiService;