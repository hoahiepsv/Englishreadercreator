
import React, { useMemo, useEffect, useState, useRef } from 'react';
import { Segment, InputType, VoiceName } from '../types';
import { extractTextFromMedia, generateSpeech } from '../services/geminiService';
import { Trash2, FileText, Type, Upload, Music, Loader2, Download, PlayCircle, Clock, Scissors, Pause, Play, RotateCcw } from 'lucide-react';
import { base64ToUint8Array, createWavHeader, decodeRawPCM, resampleAudioBuffer, bufferToWav, trimAudioBuffer } from '../utils/audioUtils';

interface SegmentItemProps {
  segment: Segment;
  onChange: (id: string, updates: Partial<Segment>) => void;
  onRemove: (id: string) => void;
  index: number;
  apiKey: string; // Add apiKey prop
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

const SegmentItem: React.FC<SegmentItemProps> = ({ segment, onChange, onRemove, index, apiKey }) => {
  const [isProcessingDownload, setIsProcessingDownload] = useState(false);
  const [showTrimmer, setShowTrimmer] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [currentPlayTime, setCurrentPlayTime] = useState(0); // For visual playhead
  
  // Trimmer State
  const rulerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // For Waveform
  const audioPreviewRef = useRef<HTMLAudioElement>(null);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);

  // 1. Handle Audio Source for Playback
  const audioSrc = useMemo(() => {
    if (segment.inputType === InputType.AUDIO && segment.uploadedAudioURL) {
        return segment.uploadedAudioURL;
    }

    if (segment.audioBase64) {
        try {
            const pcmData = base64ToUint8Array(segment.audioBase64);
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
               URL.revokeObjectURL(audioSrc);
          }
      }
  }, [audioSrc]);

  // Monitor preview playback for trimming limits and Update Playhead
  useEffect(() => {
      const audio = audioPreviewRef.current;
      if (!audio) return;

      const handleTimeUpdate = () => {
          setCurrentPlayTime(audio.currentTime);

          // Only enforce trim end if we are in "Preview Mode" (playing)
          // Use a small buffer (0.1s) to prevent loop glitches
          if (isPlayingPreview && segment.trimEnd !== undefined) {
              if (audio.currentTime >= segment.trimEnd) {
                  audio.pause();
                  setIsPlayingPreview(false);
                  audio.currentTime = segment.trimStart || 0;
              }
          }
      };

      const handleEnded = () => {
          setIsPlayingPreview(false);
          audio.currentTime = segment.trimStart || 0;
      };

      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleEnded);
      
      return () => {
          audio.removeEventListener('timeupdate', handleTimeUpdate);
          audio.removeEventListener('ended', handleEnded);
      };
  }, [isPlayingPreview, segment.trimStart, segment.trimEnd]);

  // --- Waveform Rendering Logic ---
  useEffect(() => {
    if (!showTrimmer || !audioSrc || !canvasRef.current) return;

    const drawWaveform = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Reset canvas
        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;
        canvas.width = width;
        canvas.height = height;
        ctx.clearRect(0, 0, width, height);

        // Show loading state roughly
        ctx.fillStyle = "#e2e8f0";
        ctx.fillRect(0, height/2 - 1, width, 2);

        try {
            // Fetch and decode audio data
            const response = await fetch(audioSrc);
            const arrayBuffer = await response.arrayBuffer();
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

            // Draw
            const channelData = audioBuffer.getChannelData(0);
            const step = Math.ceil(channelData.length / width);
            const amp = height / 2;
            
            ctx.fillStyle = '#60a5fa'; // Primary-400 (Blue)

            for (let i = 0; i < width; i++) {
                let min = 1.0;
                let max = -1.0;
                for (let j = 0; j < step; j++) {
                    const datum = channelData[i * step + j];
                    if (datum < min) min = datum;
                    if (datum > max) max = datum;
                }
                
                // Prevent flat lines
                if (max === min) {
                    min = -0.01;
                    max = 0.01;
                }
                
                // Draw bar
                const y = (1 + min) * amp;
                const h = Math.max(1, (max - min) * amp);
                ctx.fillRect(i, y, 1, h);
            }
            
            // Close context to save memory
            audioCtx.close();

        } catch (e) {
            console.error("Failed to draw waveform", e);
        }
    };

    drawWaveform();

    // Re-draw on resize
    const resizeObserver = new ResizeObserver(() => drawWaveform());
    if (canvasRef.current) resizeObserver.observe(canvasRef.current);
    return () => resizeObserver.disconnect();

  }, [showTrimmer, audioSrc]);


  // Handle OCR/Text Input File
  const handleOcrFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!apiKey) {
        onChange(segment.id, { error: "Please enter your API Key at the top of the page first." });
        return;
    }

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
            const extracted = await extractTextFromMedia(base64Data, file.type, apiKey);
            onChange(segment.id, { isExtracting: false, textRaw: extracted });
        } catch (err: any) {
            onChange(segment.id, { isExtracting: false, error: `Extraction failed: ${err.message}` });
        }
    };
    reader.readAsDataURL(file);
  };

  // Handle Audio File Upload and Get Duration
  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const url = URL.createObjectURL(file);
      const tempAudio = new Audio(url);
      
      tempAudio.onloadedmetadata = () => {
          onChange(segment.id, {
              fileName: file.name,
              audioBase64: "FILE", 
              uploadedAudioURL: url,
              error: undefined,
              duration: tempAudio.duration,
              trimStart: 0,
              trimEnd: tempAudio.duration
          });
      };
      
      // Fallback if metadata fails to load quickly
      tempAudio.onerror = () => {
           onChange(segment.id, {
              fileName: file.name,
              audioBase64: "FILE", 
              uploadedAudioURL: url,
              error: "Could not load audio metadata."
          });
      };
  };

  const handleGenerateAudio = async () => {
    if (!apiKey) {
        onChange(segment.id, { error: "Please enter your API Key at the top of the page first." });
        return;
    }

    if (!segment.textRaw.trim()) {
        onChange(segment.id, { error: "Please enter some text first." });
        return;
    }

    onChange(segment.id, { isGeneratingAudio: true, error: undefined, audioBase64: null });

    try {
        const audioData = await generateSpeech(segment.textRaw, segment.voice, apiKey);
        onChange(segment.id, { isGeneratingAudio: false, audioBase64: audioData });
    } catch (err: any) {
        onChange(segment.id, { isGeneratingAudio: false, error: `TTS failed: ${err.message}` });
    }
  };

  const handleDownloadSingle = async () => {
    if (segment.inputType === InputType.AUDIO && segment.uploadedAudioURL) {
        // For uploaded files, if trimmed, we need to process it first
        if (segment.trimStart !== undefined && segment.trimEnd !== undefined && segment.duration && (segment.trimStart > 0 || segment.trimEnd < segment.duration)) {
             setIsProcessingDownload(true);
             try {
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                const response = await fetch(segment.uploadedAudioURL);
                const arrayBuffer = await response.arrayBuffer();
                const decoded = await audioContext.decodeAudioData(arrayBuffer);
                const trimmed = trimAudioBuffer(decoded, segment.trimStart, segment.trimEnd);
                
                const wavBlob = bufferToWav(trimmed);
                const url = URL.createObjectURL(wavBlob);
                
                const link = document.createElement("a");
                link.href = url;
                link.download = `trimmed_${segment.fileName || 'audio.wav'}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(url), 100);
             } catch(e) {
                 console.error(e);
             } finally {
                 setIsProcessingDownload(false);
             }
             return;
        }

        const link = document.createElement("a");
        link.href = segment.uploadedAudioURL;
        link.download = segment.fileName || `segment_${index + 1}.mp3`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
    }

    if (segment.audioBase64) {
        setIsProcessingDownload(true);
        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            const rawBuffer = await decodeRawPCM(segment.audioBase64, audioContext);
            const processedBuffer = await resampleAudioBuffer(rawBuffer, segment.speed);
            const wavBlob = bufferToWav(processedBuffer);
            const url = URL.createObjectURL(wavBlob);
            
            const link = document.createElement("a");
            link.href = url;
            link.download = `segment_${index + 1}_${segment.voice}.wav`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            setTimeout(() => URL.revokeObjectURL(url), 100);
        } catch (e) {
            console.error("Download processing failed", e);
            onChange(segment.id, { error: "Failed to prepare download." });
        } finally {
            setIsProcessingDownload(false);
        }
    }
  };

  // --- Trimming Logic ---
  
  // Seek Handler (Click on Ruler)
  const handleRulerSeek = (e: React.MouseEvent) => {
    if (!rulerRef.current || !segment.duration || !audioPreviewRef.current) return;
    
    // Don't seek if dragging handles
    if (isDragging) return;

    const rect = rulerRef.current.getBoundingClientRect();
    const clientX = e.clientX;
    let percentage = (clientX - rect.left) / rect.width;
    percentage = Math.max(0, Math.min(1, percentage));
    
    const newTime = percentage * segment.duration;
    
    // Update Audio Position
    audioPreviewRef.current.currentTime = newTime;
    setCurrentPlayTime(newTime);
  };

  useEffect(() => {
    const handleUp = () => setIsDragging(null);
    const handleMove = (e: MouseEvent | TouchEvent) => {
        if(isDragging) {
            if (!rulerRef.current || !segment.duration) return;
            const rect = rulerRef.current.getBoundingClientRect();
            // @ts-ignore
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            let percentage = (clientX - rect.left) / rect.width;
            percentage = Math.max(0, Math.min(1, percentage));
            const newTime = percentage * segment.duration;
            
            if (isDragging === 'start') {
                const currentEnd = segment.trimEnd ?? segment.duration;
                if (newTime < currentEnd - 0.5) { 
                    onChange(segment.id, { trimStart: newTime });
                }
            } else if (isDragging === 'end') {
                const currentStart = segment.trimStart ?? 0;
                if (newTime > currentStart + 0.5) {
                    onChange(segment.id, { trimEnd: newTime });
                }
            }
        }
    }

    if (isDragging) {
        window.addEventListener('mouseup', handleUp);
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('touchend', handleUp);
        window.addEventListener('touchmove', handleMove);
    }
    return () => {
        window.removeEventListener('mouseup', handleUp);
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('touchend', handleUp);
        window.removeEventListener('touchmove', handleMove);
    }
  }, [isDragging, segment.duration, segment.trimStart, segment.trimEnd]);

  const togglePreviewTrim = () => {
      if (!audioPreviewRef.current) return;
      
      if (isPlayingPreview) {
          audioPreviewRef.current.pause();
          setIsPlayingPreview(false);
      } else {
          // If playhead is outside trimmed region, reset to start.
          // Otherwise play from current playhead position to allow resuming.
          const start = segment.trimStart || 0;
          const end = segment.trimEnd || segment.duration || 0;
          
          if (currentPlayTime < start || currentPlayTime >= end) {
               audioPreviewRef.current.currentTime = start;
          }
          
          audioPreviewRef.current.play();
          setIsPlayingPreview(true);
      }
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
                    audioBase64: null 
                });
                return;
            }
        }
      }
  };

  // Calculate percentages for ruler
  const startPct = segment.duration ? ((segment.trimStart || 0) / segment.duration) * 100 : 0;
  const endPct = segment.duration ? ((segment.trimEnd ?? segment.duration) / segment.duration) * 100 : 100;
  const widthPct = endPct - startPct;
  const playheadPct = segment.duration ? (currentPlayTime / segment.duration) * 100 : 0;

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
                <div className="space-y-4">
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:bg-slate-50 transition-colors relative h-32 flex flex-col items-center justify-center">
                        <input 
                            type="file" 
                            accept="audio/*" 
                            onChange={handleAudioFileChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="space-y-2 pointer-events-none">
                            <Upload className="mx-auto text-slate-400" size={28} />
                            <p className="text-slate-600 font-medium">{segment.fileName || "Click to upload Audio File (MP3, WAV)"}</p>
                        </div>
                    </div>

                    {segment.uploadedAudioURL && segment.duration && (
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                             <div className="flex items-center justify-between mb-2">
                                 <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                                     <Scissors size={14} /> Trim Audio
                                 </span>
                                 <button 
                                    onClick={() => setShowTrimmer(!showTrimmer)}
                                    className="text-xs text-primary-600 hover:underline"
                                 >
                                     {showTrimmer ? 'Hide Trimmer' : 'Edit Length'}
                                 </button>
                             </div>
                             
                             {showTrimmer && (
                                 <div className="animate-in fade-in slide-in-from-top-2">
                                     <div className="flex justify-between items-center text-xs text-slate-500 mb-1 font-mono">
                                         <span>Start: {(segment.trimStart || 0).toFixed(1)}s</span>
                                         <span className="text-primary-600 font-bold bg-primary-50 px-2 rounded">Current: {currentPlayTime.toFixed(1)}s</span>
                                         <span>End: {(segment.trimEnd || segment.duration).toFixed(1)}s</span>
                                     </div>
                                     
                                     {/* Ruler Track */}
                                     <div 
                                        ref={rulerRef}
                                        onClick={handleRulerSeek}
                                        className="relative h-16 bg-slate-100 rounded-md mb-3 select-none touch-none overflow-hidden cursor-crosshair group/ruler border border-slate-300"
                                        title="Click to seek"
                                     >
                                         {/* WAVEFORM CANVAS */}
                                         <canvas 
                                            ref={canvasRef}
                                            className="absolute inset-0 w-full h-full pointer-events-none opacity-80"
                                         />

                                         {/* Unselected Regions (Dimmed Overlay) */}
                                         <div className="absolute inset-y-0 left-0 bg-slate-900/40 pointer-events-none z-10" style={{ width: `${startPct}%` }} />
                                         <div className="absolute inset-y-0 right-0 bg-slate-900/40 pointer-events-none z-10" style={{ width: `${100 - endPct}%` }} />

                                         {/* Selected Region Highlight */}
                                         <div 
                                            className="absolute inset-y-0 border-x-2 border-primary-500 pointer-events-none z-10"
                                            style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                                         />

                                         {/* Playhead */}
                                         <div 
                                            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none transition-all duration-75 ease-linear shadow-[0_0_4px_rgba(255,0,0,0.5)]"
                                            style={{ left: `${playheadPct}%` }}
                                         >
                                             <div className="absolute -top-1 -left-1.5 w-4 h-3 bg-red-500 text-[8px] text-white flex items-center justify-center rounded-sm opacity-0 group-hover/ruler:opacity-100">
                                                 ▼
                                             </div>
                                         </div>

                                         {/* Handles */}
                                         {/* Start Handle */}
                                         <div 
                                            className="absolute top-0 bottom-0 w-6 -ml-3 flex items-center justify-center cursor-ew-resize z-40 group hover:scale-110 transition-transform"
                                            style={{ left: `${startPct}%` }}
                                            onMouseDown={(e) => { e.stopPropagation(); setIsDragging('start'); }}
                                            onTouchStart={(e) => { e.stopPropagation(); setIsDragging('start'); }}
                                            onClick={(e) => e.stopPropagation()}
                                         >
                                             <div className="h-10 w-4 bg-primary-600 rounded shadow-md ring-2 ring-white flex items-center justify-center">
                                                 <div className="w-0.5 h-4 bg-white/50 rounded-full" />
                                             </div>
                                         </div>

                                         {/* End Handle */}
                                         <div 
                                            className="absolute top-0 bottom-0 w-6 -ml-3 flex items-center justify-center cursor-ew-resize z-40 group hover:scale-110 transition-transform"
                                            style={{ left: `${endPct}%` }}
                                            onMouseDown={(e) => { e.stopPropagation(); setIsDragging('end'); }}
                                            onTouchStart={(e) => { e.stopPropagation(); setIsDragging('end'); }}
                                            onClick={(e) => e.stopPropagation()}
                                         >
                                             <div className="h-10 w-4 bg-primary-600 rounded shadow-md ring-2 ring-white flex items-center justify-center">
                                                <div className="w-0.5 h-4 bg-white/50 rounded-full" />
                                             </div>
                                         </div>
                                     </div>

                                     {/* Preview Controls */}
                                     <div className="flex gap-2">
                                         <button 
                                            onClick={togglePreviewTrim}
                                            className="flex-1 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-semibold hover:bg-slate-50 flex items-center justify-center gap-2"
                                         >
                                             {isPlayingPreview ? <Pause size={12} /> : <Play size={12} />}
                                             {isPlayingPreview ? 'Pause' : 'Test Trim / Play'}
                                         </button>
                                         <button 
                                            onClick={() => onChange(segment.id, { trimStart: 0, trimEnd: segment.duration })}
                                            className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs hover:bg-slate-50"
                                            title="Reset Trim"
                                         >
                                             <RotateCcw size={14} />
                                         </button>
                                     </div>
                                     {/* Hidden Audio Element for Logic */}
                                     <audio ref={audioPreviewRef} src={audioSrc || undefined} className="hidden" />
                                 </div>
                             )}
                        </div>
                    )}
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
                        disabled={segment.isGeneratingAudio || !segment.textRaw || !apiKey}
                        title={!apiKey ? "Enter API Key first" : ""}
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
                        
                        {/* 
                           If showing trimmer, we use the trimmer controls. 
                           If not showing trimmer, we show standard audio controls.
                        */}
                        {!showTrimmer && (
                            <audio 
                                controls 
                                src={audioSrc} 
                                onPlay={(e) => {
                                    if (segment.inputType !== InputType.AUDIO) {
                                        e.currentTarget.playbackRate = segment.speed; 
                                    }
                                }}
                                className="w-full h-8 mb-2"
                            />
                        )}

                        {showTrimmer && (
                            <div className="bg-slate-100 p-2 rounded text-center text-xs text-slate-500 italic mb-2">
                                Use controls above to preview trim
                            </div>
                        )}

                        <button
                            onClick={handleDownloadSingle}
                            disabled={isProcessingDownload}
                            className="w-full py-1.5 px-3 border border-slate-300 text-slate-600 rounded-md text-xs hover:bg-white hover:text-primary-600 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                        >
                            {isProcessingDownload ? <Loader2 size={14} className="animate-spin"/> : <Download size={14} />}
                            Download Segment
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

// Simple icon for Reset
const RotateCcw: React.FC<{size?:number}> = ({size=16}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12"/><path d="M3 5v7h7"/></svg>
);

export default SegmentItem;
