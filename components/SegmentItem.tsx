
import React, { useMemo, useEffect, useState } from 'react';
import { Segment, InputType, VoiceName } from '../types';
import { extractTextFromMedia, generateSpeech } from '../services/geminiService';
import { Trash2, FileText, Type, Upload, Music, Loader2, Download, PlayCircle, Clock } from 'lucide-react';
import { base64ToUint8Array, createWavHeader } from '../utils/audioUtils';

interface SegmentItemProps {
  segment: Segment;
  onChange: (id: string, updates: Partial<Segment>) => void;
  onRemove: (id: string) => void;
  index: number;
}

// Extended voice presets using Speed/Pitch shifting
const VOICE_PRESETS = [
    { label: "--- CHILDREN ---", options: [
        { id: 'boy_1', label: 'Little Boy', voice: VoiceName.Puck, speed: 1.2 },
        { id: 'girl_1', label: 'Little Girl', voice: VoiceName.Kore, speed: 1.25 },
        { id: 'boy_teen', label: 'Teen Boy', voice: VoiceName.Fenrir, speed: 1.1 },
        { id: 'girl_teen', label: 'Teen Girl', voice: VoiceName.Zephyr, speed: 1.15 },
    ]},
    { label: "--- ADULTS (Standard) ---", options: [
        { id: 'man_1', label: 'Man (Neutral)', voice: VoiceName.Puck, speed: 1.0 },
        { id: 'man_2', label: 'Man (Deep)', voice: VoiceName.Charon, speed: 1.0 },
        { id: 'man_3', label: 'Man (Bass)', voice: VoiceName.Fenrir, speed: 1.0 },
        { id: 'woman_1', label: 'Woman (Calm)', voice: VoiceName.Kore, speed: 1.0 },
        { id: 'woman_2', label: 'Woman (Bright)', voice: VoiceName.Zephyr, speed: 1.0 },
    ]},
    { label: "--- ELDERS ---", options: [
        { id: 'old_man_1', label: 'Old Man (Wise)', voice: VoiceName.Charon, speed: 0.9 },
        { id: 'old_man_2', label: 'Grandpa (Slow)', voice: VoiceName.Fenrir, speed: 0.85 },
        { id: 'old_woman_1', label: 'Grandma', voice: VoiceName.Kore, speed: 0.9 },
        { id: 'old_woman_2', label: 'Old Woman (Slow)', voice: VoiceName.Zephyr, speed: 0.85 },
    ]}
];

const SegmentItem: React.FC<SegmentItemProps> = ({ segment, onChange, onRemove, index }) => {
  
  // 1. Handle Audio Source for Playback
  // If it's a Gemini TTS result (Raw PCM), we need to wrap it in WAV.
  // If it's an uploaded Audio File, we use the object URL directly.
  const audioSrc = useMemo(() => {
    if (segment.inputType === InputType.AUDIO && segment.uploadedAudioURL) {
        return segment.uploadedAudioURL;
    }

    if (segment.audioBase64) {
        try {
            const pcmData = base64ToUint8Array(segment.audioBase64);
            // Apply header for preview
            const header = createWavHeader(pcmData.length);
            const wavData = new Uint8Array(header.length + pcmData.length);
            wavData.set(header);
            wavData.set(pcmData, header.length);
            const blob = new Blob([wavData], { type: 'audio/wav' });
            return URL.createObjectURL(blob);
        } catch (e) {
            console.error("Error creating audio blob", e);
            return null;
        }
    }
    return null;
  }, [segment.audioBase64, segment.uploadedAudioURL, segment.inputType]);

  // Clean up URL on unmount or change
  useEffect(() => {
      return () => {
          if (audioSrc && !segment.uploadedAudioURL) {
               // Only revoke generated blobs, not user file uploads managed elsewhere (though cleaner to revoke all)
               URL.revokeObjectURL(audioSrc);
          }
      }
  }, [audioSrc]);

  // Handle OCR/Text Input File
  const handleOcrFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
        const base64String = reader.result as string;
        const base64Data = base64String.split(',')[1];
        onChange(segment.id, {
            isExtracting: true,
            fileData: base64Data,
            fileName: file.name,
            fileMimeType: file.type,
            error: undefined
        });

        try {
            const extracted = await extractTextFromMedia(base64Data, file.type);
            onChange(segment.id, { isExtracting: false, textRaw: extracted });
        } catch (err: any) {
            onChange(segment.id, { isExtracting: false, error: `Extraction failed: ${err.message}` });
        }
    };
    reader.readAsDataURL(file);
  };

  // Handle Audio File Upload
  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const url = URL.createObjectURL(file);
      onChange(segment.id, {
          fileName: file.name,
          audioBase64: "FILE", // Marker to know we have a file
          uploadedAudioURL: url,
          error: undefined
      });
  };

  const handleGenerateAudio = async () => {
    if (!segment.textRaw.trim()) {
        onChange(segment.id, { error: "Please enter some text first." });
        return;
    }

    onChange(segment.id, { isGeneratingAudio: true, error: undefined, audioBase64: null });

    try {
        const audioData = await generateSpeech(segment.textRaw, segment.voice);
        onChange(segment.id, { isGeneratingAudio: false, audioBase64: audioData });
    } catch (err: any) {
        onChange(segment.id, { isGeneratingAudio: false, error: `TTS failed: ${err.message}` });
    }
  };

  const handleDownloadSingle = () => {
      if (!audioSrc) return;
      const link = document.createElement("a");
      link.href = audioSrc;
      link.download = `segment_${index + 1}.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // Find current preset ID based on voice and speed
  const currentPresetId = useMemo(() => {
      for (const group of VOICE_PRESETS) {
          for (const opt of group.options) {
              if (opt.voice === segment.voice && Math.abs(opt.speed - segment.speed) < 0.01) {
                  return opt.id;
              }
          }
      }
      return 'man_1'; // Default
  }, [segment.voice, segment.speed]);

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value;
      for (const group of VOICE_PRESETS) {
        for (const opt of group.options) {
            if (opt.id === id) {
                onChange(segment.id, { 
                    voice: opt.voice, 
                    speed: opt.speed, 
                    audioBase64: null // Reset audio if voice changes
                });
                return;
            }
        }
      }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 transition-all hover:shadow-md">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold text-primary-700 flex items-center gap-2">
            <span className="bg-primary-100 text-primary-800 text-xs font-bold px-2 py-1 rounded-full">#{index + 1}</span>
            Segment
        </h3>
        <button 
            onClick={() => onRemove(segment.id)}
            className="text-slate-400 hover:text-red-500 transition-colors p-1"
            title="Remove segment"
        >
            <Trash2 size={20} />
        </button>
      </div>

      {/* Input Type Selector */}
      <div className="flex flex-wrap gap-4 mb-4 border-b border-slate-100 pb-4">
            <label className={`flex items-center gap-2 cursor-pointer transition-colors ${segment.inputType === InputType.TEXT ? 'text-primary-600 font-bold' : 'text-slate-500 hover:text-primary-500'}`}>
                <input 
                    type="radio" 
                    name={`type-${segment.id}`} 
                    checked={segment.inputType === InputType.TEXT}
                    onChange={() => onChange(segment.id, { inputType: InputType.TEXT })}
                    className="hidden"
                />
                <Type size={18} /> Direct Text
            </label>
            <label className={`flex items-center gap-2 cursor-pointer transition-colors ${segment.inputType === InputType.FILE ? 'text-primary-600 font-bold' : 'text-slate-500 hover:text-primary-500'}`}>
                <input 
                    type="radio" 
                    name={`type-${segment.id}`} 
                    checked={segment.inputType === InputType.FILE}
                    onChange={() => onChange(segment.id, { inputType: InputType.FILE })}
                    className="hidden"
                />
                <FileText size={18} /> Extract from Image/PDF
            </label>
            <label className={`flex items-center gap-2 cursor-pointer transition-colors ${segment.inputType === InputType.AUDIO ? 'text-primary-600 font-bold' : 'text-slate-500 hover:text-primary-500'}`}>
                <input 
                    type="radio" 
                    name={`type-${segment.id}`} 
                    checked={segment.inputType === InputType.AUDIO}
                    onChange={() => onChange(segment.id, { inputType: InputType.AUDIO })}
                    className="hidden"
                />
                <Music size={18} /> Upload Audio File
            </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left: Input Content */}
        <div className="md:col-span-7 space-y-4">
            
            {/* TEXT INPUT */}
            {segment.inputType === InputType.TEXT && (
                <textarea
                    className="w-full h-40 p-4 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none bg-white text-black font-medium leading-relaxed"
                    placeholder="Enter English text here..."
                    value={segment.textRaw}
                    onChange={(e) => onChange(segment.id, { textRaw: e.target.value })}
                />
            )}

            {/* OCR FILE INPUT */}
            {segment.inputType === InputType.FILE && (
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:bg-slate-50 transition-colors relative h-40 flex flex-col items-center justify-center">
                    {segment.isExtracting ? (
                         <div className="flex flex-col items-center justify-center py-4">
                             <Loader2 className="animate-spin text-primary-500 mb-2" size={32} />
                             <p className="text-sm text-slate-600">Reading document...</p>
                         </div>
                    ) : (
                        <>
                            <input 
                                type="file" 
                                accept="application/pdf,image/png,image/jpeg,image/webp" 
                                onChange={handleOcrFileChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="space-y-2 pointer-events-none">
                                <FileText className="mx-auto text-slate-400" size={32} />
                                <p className="text-slate-600 font-medium">{segment.fileName || "Click to upload PDF or Image"}</p>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* AUDIO FILE INPUT */}
            {segment.inputType === InputType.AUDIO && (
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:bg-slate-50 transition-colors relative h-40 flex flex-col items-center justify-center">
                    <input 
                        type="file" 
                        accept="audio/*" 
                        onChange={handleAudioFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                     <div className="space-y-2 pointer-events-none">
                        <Upload className="mx-auto text-slate-400" size={32} />
                        <p className="text-slate-600 font-medium">{segment.fileName || "Click to upload Audio File (MP3, WAV)"}</p>
                    </div>
                </div>
            )}

            {/* Editable OCR Result */}
            {segment.inputType === InputType.FILE && !segment.isExtracting && segment.textRaw && (
                 <div className="mt-2 animate-in fade-in">
                    <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Extracted Text</label>
                    <textarea
                        className="w-full h-32 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm bg-white text-black"
                        value={segment.textRaw}
                        onChange={(e) => onChange(segment.id, { textRaw: e.target.value })}
                    />
                 </div>
            )}
        </div>

        {/* Right: Settings & Output */}
        <div className="md:col-span-5 flex flex-col justify-between bg-slate-50 rounded-lg p-4 border border-slate-100">
            <div className="space-y-5">
                
                {/* Voice Selection (Only for Text/OCR) */}
                {segment.inputType !== InputType.AUDIO && (
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Select Voice Persona</label>
                        <select 
                            value={currentPresetId} 
                            onChange={handlePresetChange}
                            className="w-full p-2 border border-slate-300 rounded-md bg-white text-slate-800 focus:ring-2 focus:ring-primary-500 outline-none"
                        >
                            {VOICE_PRESETS.map((group, gIdx) => (
                                <optgroup key={gIdx} label={group.label}>
                                    {group.options.map(opt => (
                                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                        <p className="text-xs text-slate-500 mt-1">Includes Age & Gender variations.</p>
                    </div>
                )}

                {/* Delay Setting */}
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center justify-between">
                        <span className="flex items-center gap-1"><Clock size={14}/> Delay after segment</span>
                        <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-xs">{segment.delay}s</span>
                    </label>
                    <input 
                        type="range" 
                        min="0" 
                        max="5" 
                        step="0.5" 
                        value={segment.delay}
                        onChange={(e) => onChange(segment.id, { delay: parseFloat(e.target.value) })}
                        className="w-full h-2 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-primary-600"
                    />
                </div>

                {/* Generate Button (Only for Text/OCR) */}
                {segment.inputType !== InputType.AUDIO && (
                    <button
                        onClick={handleGenerateAudio}
                        disabled={segment.isGeneratingAudio || !segment.textRaw}
                        className="w-full py-2.5 px-4 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95"
                    >
                        {segment.isGeneratingAudio ? (
                            <Loader2 className="animate-spin" size={18} />
                        ) : (
                            <PlayCircle size={18} />
                        )}
                        {segment.isGeneratingAudio ? 'Generating...' : 'Generate Voice'}
                    </button>
                )}
            </div>

            {/* Audio Player */}
            <div className="mt-6 pt-4 border-t border-slate-200">
                 {segment.error && (
                    <p className="text-red-500 text-sm mb-2">{segment.error}</p>
                 )}
                 {audioSrc ? (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Preview Segment</p>
                        <audio 
                            controls 
                            src={audioSrc} 
                            // Note: We use playbackRate for previewing the speed change in real-time without full processing
                            // But for merging, we use the resampleAudioBuffer function.
                            onPlay={(e) => {
                                if (segment.inputType !== InputType.AUDIO) {
                                    e.currentTarget.playbackRate = segment.speed; 
                                }
                            }}
                            className="w-full h-8 mb-2"
                        />
                        <button
                            onClick={handleDownloadSingle}
                            className="w-full py-1.5 px-3 border border-slate-300 text-slate-600 rounded-md text-xs hover:bg-white hover:text-primary-600 flex items-center justify-center gap-2 transition-colors"
                        >
                            <Download size={14} /> Download Segment
                        </button>
                    </div>
                 ) : (
                    <div className="text-center text-slate-400 py-4 text-xs italic">
                        {segment.inputType === InputType.AUDIO 
                            ? (segment.uploadedAudioURL ? 'Ready' : 'Upload a file to play')
                            : 'Generate audio to preview'
                        }
                    </div>
                 )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default SegmentItem;
