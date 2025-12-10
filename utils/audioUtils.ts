
/**
 * Helper to convert base64 string to Uint8Array
 */
export const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

/**
 * Creates a standard WAV header for raw PCM data.
 * Gemini TTS default: 24000Hz, 1 Channel (Mono), 16-bit PCM.
 */
export const createWavHeader = (length: number, sampleRate: number = 24000, numChannels: number = 1): Uint8Array => {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);
  
  // RIFF chunk
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(view, 8, 'WAVE');
  
  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  
  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, length, true);
  
  return new Uint8Array(buffer);
};

/**
 * Decodes Gemini's Raw PCM (16-bit 24kHz) into an AudioBuffer.
 */
export const decodeRawPCM = async (
  base64Data: string,
  audioContext: AudioContext
): Promise<AudioBuffer> => {
  const uint8Array = base64ToUint8Array(base64Data);
  const int16Array = new Int16Array(uint8Array.buffer);
  
  const sampleRate = 24000; // Fixed for Gemini
  const numChannels = 1;
  
  const buffer = audioContext.createBuffer(numChannels, int16Array.length, sampleRate);
  const channelData = buffer.getChannelData(0);
  
  for (let i = 0; i < int16Array.length; i++) {
    // Normalize 16-bit integer to float [-1, 1]
    channelData[i] = int16Array[i] / 32768.0; 
  }
  
  return buffer;
};

/**
 * Resamples an audio buffer to change pitch/speed.
 * Used to create Child/Elder voices from standard voices.
 */
export const resampleAudioBuffer = async (
    buffer: AudioBuffer,
    speed: number
): Promise<AudioBuffer> => {
    if (speed === 1.0) return buffer;

    // We use OfflineAudioContext to render the audio at a new speed
    const newDuration = buffer.duration / speed;
    const offlineCtx = new OfflineAudioContext(
        buffer.numberOfChannels,
        newDuration * buffer.sampleRate, // Total frames
        buffer.sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = speed;
    source.connect(offlineCtx.destination);
    source.start(0);

    return await offlineCtx.startRendering();
};

/**
 * Merges multiple AudioBuffers with individual delays.
 */
export const mergeAudioBuffers = (
  items: { buffer: AudioBuffer; delay: number }[],
  audioContext: AudioContext
): AudioBuffer => {
  // 1. Calculate total length
  let totalLength = 0;
  items.forEach((item, index) => {
    totalLength += item.buffer.length;
    // Add delay after segment, unless it's the very last one (optional, usually good to have trailing silence or just between)
    // Here we add delay AFTER each segment as requested
    const delaySamples = Math.floor(item.delay * audioContext.sampleRate);
    totalLength += delaySamples;
  });

  if (totalLength === 0) {
     return audioContext.createBuffer(1, 1, audioContext.sampleRate);
  }

  // 2. Create output buffer
  const result = audioContext.createBuffer(
    1, // Force Mono
    totalLength,
    audioContext.sampleRate
  );
  const outputData = result.getChannelData(0);

  // 3. Merge
  let offset = 0;
  for (const item of items) {
    // Handle channel data (mix down to mono if needed, or just take ch 0)
    const inputData = item.buffer.getChannelData(0); // Take first channel
    
    // Copy data
    outputData.set(inputData, offset);
    offset += inputData.length;

    // Add silence (delay)
    // Data is already 0 initialized, just move offset
    const delaySamples = Math.floor(item.delay * audioContext.sampleRate);
    offset += delaySamples;
  }

  return result;
};

/**
 * Converts an AudioBuffer to a WAV Blob.
 */
export const bufferToWav = (buffer: AudioBuffer): Blob => {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArray = new ArrayBuffer(length);
  const view = new DataView(bufferArray);
  const channels = [];
  let i;
  let pos = 0;

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit 

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for (i = 0; i < buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  let sampleIndex = 0;
  while (sampleIndex < buffer.length) {
    for (i = 0; i < numOfChan; i++) {
      let sample = channels[i][sampleIndex];
      // clamp
      sample = Math.max(-1, Math.min(1, sample));
      // scale to 16-bit signed int
      sample = (sample < 0 ? sample * 32768 : sample * 32767);
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    sampleIndex++;
  }

  return new Blob([bufferArray], { type: 'audio/wav' });
};
