import { GoogleGenAI, Modality } from "@google/genai";
import { VoiceName } from '../types';
import { synthesizeFallbackAudio, cleanAndNormalizeAudio } from '../utils/audioUtils';

const getClient = (apiKey?: string): GoogleGenAI | null => {
    // Prioritize user-provided key, fallback to env var
    const key = (apiKey && apiKey.trim()) || process.env.API_KEY || (process.env as any)?.GEMINI_API_KEY || '';
    if (!key) {
        return null;
    }
    try {
        return new GoogleGenAI({ apiKey: key });
    } catch (e) {
        console.warn("Failed to initialize GoogleGenAI client:", e);
        return null;
    }
};

export const extractTextFromMedia = async (
  base64Data: string,
  mimeType: string,
  apiKey?: string
): Promise<string> => {
  const ai = getClient(apiKey);
  
  if (ai) {
    try {
      // Use Flash for fast OCR/Extraction
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
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

      if (response.text) {
        return response.text;
      }
    } catch (err: any) {
      console.warn("Gemini OCR extraction failed, using fallback:", err);
    }
  }

  // Return empty string so box remains clean and blank
  return "";
};

export const generateSpeech = async (
    text: string, 
    voice: VoiceName,
    apiKey?: string
): Promise<string> => {
    const ai = getClient(apiKey);

    if (ai) {
      try {
        // Use Gemini 3.8 Flash Lite TTS
        const response = await ai.models.generateContent({
            model: "gemini-3.8-flash-lite-tts",
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
        if (audioData) {
            return cleanAndNormalizeAudio(audioData);
        }
      } catch (err: any) {
        console.warn("Gemini TTS API call failed or quota reached, using local voice synthesis fallback:", err);
      }
    }

    // Always succeed: local speech audio synthesizer fallback
    return await synthesizeFallbackAudio(text, voice);
};