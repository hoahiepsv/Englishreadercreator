import { VoicePersona } from './types';

// Gemini Voices: Puck, Charon, Kore, Fenrir, Zephyr
// We create personas by adjusting the playback rate.

export const VOICE_PERSONAS: VoicePersona[] = [
  // Children (Higher pitch, faster speed)
  { id: 'child_f_1', name: 'Lucy (Child)', baseVoice: 'Kore', playbackRate: 1.25, gender: 'Female', ageGroup: 'Child' },
  { id: 'child_m_1', name: 'Timmy (Child)', baseVoice: 'Puck', playbackRate: 1.25, gender: 'Male', ageGroup: 'Child' },
  
  // Adults (Normal pitch/speed)
  { id: 'adult_f_1', name: 'Sarah (Adult)', baseVoice: 'Kore', playbackRate: 1.0, gender: 'Female', ageGroup: 'Adult' },
  { id: 'adult_m_1', name: 'James (Adult)', baseVoice: 'Puck', playbackRate: 1.0, gender: 'Male', ageGroup: 'Adult' },
  { id: 'adult_f_2', name: 'Emma (Adult)', baseVoice: 'Zephyr', playbackRate: 1.0, gender: 'Female', ageGroup: 'Adult' },
  { id: 'adult_m_2', name: 'Michael (Adult)', baseVoice: 'Fenrir', playbackRate: 1.0, gender: 'Male', ageGroup: 'Adult' },
  { id: 'adult_m_3', name: 'David (Adult)', baseVoice: 'Charon', playbackRate: 1.0, gender: 'Male', ageGroup: 'Adult' },

  // Elderly (Lower pitch, slower speed)
  { id: 'elderly_f_1', name: 'Grandma Mary', baseVoice: 'Zephyr', playbackRate: 0.85, gender: 'Female', ageGroup: 'Elderly' },
  { id: 'elderly_m_1', name: 'Grandpa Joe', baseVoice: 'Fenrir', playbackRate: 0.85, gender: 'Male', ageGroup: 'Elderly' },
  { id: 'elderly_m_2', name: 'Mr. Smith', baseVoice: 'Charon', playbackRate: 0.8, gender: 'Male', ageGroup: 'Elderly' },
];

export const DEFAULT_SAMPLE_RATE = 24000;
