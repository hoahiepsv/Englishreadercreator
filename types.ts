
export enum InputType {
  TEXT = 'TEXT',
  FILE = 'FILE', // OCR (Image/PDF)
  AUDIO = 'AUDIO' // Uploaded Audio
}

export enum VoiceName {
  Puck = 'Puck',   // Male, Tenor
  Charon = 'Charon', // Male, Deep
  Kore = 'Kore',   // Female, Alto
  Fenrir = 'Fenrir', // Male, Bass
  Zephyr = 'Zephyr' // Female, Soprano
}

export interface VoicePersona {
  id: string;
  name: string;
  baseVoice: string;
  playbackRate: number;
  gender: string;
  ageGroup: string;
}

export interface Segment {
  id: string;
  inputType: InputType;
  
  // Text/OCR
  textRaw: string; 
  fileData?: string; 
  fileMimeType?: string;
  fileName?: string;
  isExtracting: boolean;
  
  // Audio Generation/Upload
  isGeneratingAudio: boolean;
  audioBase64: string | null; // Raw PCM (from Gemini) or Base64 encoded file (from Upload)
  uploadedAudioURL?: string; // For playing back uploaded files directly
  
  // Audio Trimming
  duration?: number; // Total duration in seconds
  trimStart?: number; // Start time in seconds
  trimEnd?: number; // End time in seconds

  // Configuration
  voice: VoiceName;
  speed: number; // 1.0 = Normal, >1.0 = Younger/Faster, <1.0 = Older/Slower
  delay: number; // Seconds of silence after this segment
  
  error?: string;
}
