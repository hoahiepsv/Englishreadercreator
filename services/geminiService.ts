import { GoogleGenAI, Modality } from "@google/genai";
import { VoiceName } from '../types';

const getClient = (apiKey?: string) => {
    // Prioritize user-provided key, fallback to env var
    const key = apiKey || process.env.API_KEY;
    if (!key) {
        throw new Error("API Key is missing. Please enter your Gemini API Key.");
    }
    return new GoogleGenAI({ apiKey: key });
}

export const extractTextFromMedia = async (
  base64Data: string,
  mimeType: string,
  apiKey?: string
): Promise<string> => {
  const ai = getClient(apiKey);
  
  // Use Flash for fast OCR/Extraction
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        },
        {
            text: "Extract all the English text from this document or image accurately. Do not add any conversational filler. Just return the text."
        }
      ]
    }
  });

  return response.text || "";
};

export const generateSpeech = async (
    text: string, 
    voice: VoiceName,
    apiKey?: string
): Promise<string> => {
    const ai = getClient(apiKey);

    // Use TTS preview model
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice },
              },
          },
        },
      });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
        throw new Error("No audio data generated");
    }
    return audioData;
}