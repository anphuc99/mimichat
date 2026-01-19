import OpenAI from "openai";
import fs from "fs";
import path from "path";
import "dotenv/config";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate TTS audio using OpenAI
 * @param text      - nội dung cần convert
 * @param voice     - giọng đọc ("alloy", "verse", "ember"...)
 * @param format    - định dạng âm thanh ("wav", "mp3")
 * @param output    - đường dẫn file lưu output
 */
export async function textToSpeech(
  text: string,
  voice: string = "alloy",
  format: "wav" | "mp3" = "mp3",
  output: string = "output",
  instructions?: string
) {
  if (!text) throw new Error("Missing text input for TTS");

  // Giới hạn text ~180 ký tự (~10 giây audio)
  const MAX_CHARS = 180;
  let finalText = text.trim();
  
  if (finalText.length > MAX_CHARS) {
    finalText = finalText.substring(0, MAX_CHARS);
    // Cắt tại dấu câu hoặc khoảng trắng cuối cùng
    const lastBreak = Math.max(
      finalText.lastIndexOf('。'),
      finalText.lastIndexOf('.'),
      finalText.lastIndexOf('!'),
      finalText.lastIndexOf('?'),
      finalText.lastIndexOf(','),
      finalText.lastIndexOf(' ')
    );
    if (lastBreak > MAX_CHARS * 0.5) {
      finalText = finalText.substring(0, lastBreak + 1);
    }
  }
  
  if (!/[.!?。！？]$/.test(finalText)) {
    finalText += '.';
  }

  const response = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts-2025-03-20",
    input: finalText,
    voice: voice,
    response_format: format,
    instructions: instructions,
    speed: 0.8, 
  });
  console.log("OpenAI TTS response received");
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(path.join(process.cwd(), "data/audio", output + "." + format), buffer);

  return {
    success: true,
    output,
  };
}
