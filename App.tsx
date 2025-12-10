
import React, { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Segment, InputType, VoiceName } from './types';
import SegmentItem from './components/SegmentItem';
import { Plus, Download, Play, Layers, AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import { decodeRawPCM, mergeAudioBuffers, bufferToWav, resampleAudioBuffer } from './utils/audioUtils';

const App: React.FC = () => {
  const [segments, setSegments] = useState<Segment[]>([
    {
      id: uuidv4(),
      inputType: InputType.TEXT,
      textRaw: '',
      isExtracting: false,
      isGeneratingAudio: false,
      audioBase64: null,
      voice: VoiceName.Puck,
      speed: 1.0,
      delay: 1.0
    }
  ]);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Invalidate preview when segments change
  const handleSegmentChange = (id: string, updates: Partial<Segment>) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
    }
  };

  const handleAddSegment = () => {
    setSegments(prev => [
      ...prev,
      {
        id: uuidv4(),
        inputType: InputType.TEXT,
        textRaw: '',
        isExtracting: false,
        isGeneratingAudio: false,
        audioBase64: null,
        voice: VoiceName.Puck,
        speed: 1.0,
        delay: 1.0
      }
    ]);
    setPreviewUrl(null);
  };

  const handleRemoveSegment = (id: string) => {
    if (segments.length === 1) return;
    setSegments(prev => prev.filter(s => s.id !== id));
    setPreviewUrl(null);
  };

  const handleGeneratePreview = async () => {
    // Check if we have content
    const validSegments = segments.filter(s => 
        (s.inputType === InputType.AUDIO && s.uploadedAudioURL) || 
        (s.inputType !== InputType.AUDIO && s.audioBase64)
    );

    if (validSegments.length === 0) {
        setGlobalError("Please generate audio or upload files for your segments first.");
        return;
    }

    setIsProcessing(true);
    setGlobalError(null);

    try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        const mergeList: { buffer: AudioBuffer; delay: number }[] = [];

        for (const seg of segments) {
            let buffer: AudioBuffer | null = null;

            // Case A: Uploaded File
            if (seg.inputType === InputType.AUDIO && seg.uploadedAudioURL) {
                 const response = await fetch(seg.uploadedAudioURL);
                 const arrayBuffer = await response.arrayBuffer();
                 buffer = await audioContext.decodeAudioData(arrayBuffer);
            } 
            // Case B: Gemini Generated (Raw PCM)
            else if (seg.audioBase64) {
                 const rawBuffer = await decodeRawPCM(seg.audioBase64, audioContext);
                 // Resample if speed != 1.0 (for Kids/Elders voices)
                 buffer = await resampleAudioBuffer(rawBuffer, seg.speed);
            }

            if (buffer) {
                mergeList.push({ buffer, delay: seg.delay });
            }
        }

        if (mergeList.length === 0) throw new Error("No audio data could be processed.");

        const mergedBuffer = mergeAudioBuffers(mergeList, audioContext);
        const blob = bufferToWav(mergedBuffer);
        const url = URL.createObjectURL(blob);
        
        setPreviewUrl(url);

    } catch (error: any) {
        console.error(error);
        setGlobalError("Failed to process audio. Ensure all files are valid.");
    } finally {
        setIsProcessing(false);
    }
  };

  const handleDownload = () => {
      if (!previewUrl) return;
      const link = document.createElement('a');
      link.href = previewUrl;
      link.download = `english-reader-full-${Date.now()}.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-primary-600 text-white shadow-lg sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex flex-col md:flex-row justify-between items-center gap-4 md:gap-0">
            <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg">
                    <Layers size={28} className="text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">ENGLISH READER CREATOR</h1>
                    <p className="text-primary-100 text-xs font-medium tracking-wide opacity-90">Professional Text-to-Speech Assembly</p>
                    <p className="text-white text-[10px] mt-0.5 opacity-80 font-mono">Create by Lê Hòa Hiệp - 0983.676.470</p>
                </div>
            </div>
            <div className="hidden md:block text-right bg-primary-700/30 px-4 py-2 rounded-lg border border-primary-500/30">
                <p className="text-xs font-bold text-primary-200">LICENSED TO</p>
                <p className="text-sm font-bold text-white">Lê Hòa Hiệp</p>
            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow container mx-auto px-4 py-8 max-w-4xl">
        
        {globalError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                <AlertCircle size={20} />
                {globalError}
            </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-primary-100 p-6 mb-8">
            <h2 className="text-lg font-bold text-slate-800 mb-2">Instructions</h2>
            <ul className="list-disc list-inside text-slate-600 space-y-1 text-sm">
                <li>Choose <strong>Direct Text</strong>, <strong>Image/PDF</strong>, or <strong>Upload Audio</strong> for each segment.</li>
                <li>For Text: Pick a voice persona (Child, Adult, Elder) and generate.</li>
                <li>Set the <strong>Delay</strong> to control silence after the segment.</li>
                <li>Click <strong>Preview All</strong> to merge and listen, then Download.</li>
            </ul>
        </div>

        {/* Segments List */}
        <div className="space-y-6 mb-24">
            {segments.map((seg, index) => (
                <SegmentItem 
                    key={seg.id} 
                    index={index}
                    segment={seg} 
                    onChange={handleSegmentChange} 
                    onRemove={handleRemoveSegment}
                />
            ))}

             {/* Add Button */}
            <button 
                onClick={handleAddSegment}
                className="w-full py-4 border-2 border-dashed border-primary-300 text-primary-600 rounded-xl font-bold hover:bg-primary-50 hover:border-primary-500 transition-all flex items-center justify-center gap-2 group"
            >
                <div className="bg-primary-100 p-2 rounded-full group-hover:bg-primary-200 transition-colors">
                    <Plus size={24} />
                </div>
                Add Next Segment
            </button>
        </div>

      </main>

      {/* Bottom Sticky Control Panel */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] p-4 z-40">
        <div className="container mx-auto max-w-4xl flex flex-col md:flex-row items-center justify-between gap-4">
            
            {/* Audio Player Preview */}
            <div className="flex-grow w-full md:w-auto flex items-center gap-4 bg-slate-50 rounded-lg p-2 border border-slate-200">
                {previewUrl ? (
                    <audio controls src={previewUrl} className="w-full h-10 outline-none" autoPlay />
                ) : (
                    <div className="w-full text-center text-slate-400 text-sm italic py-2">
                        Preview will appear here...
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
                <button 
                    onClick={handleGeneratePreview}
                    disabled={isProcessing}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg font-bold hover:bg-primary-700 transition-colors shadow-md disabled:opacity-70 disabled:cursor-not-allowed min-w-[160px]"
                >
                    {isProcessing ? <Loader2 className="animate-spin" /> : <Play size={20} fill="currentColor" />}
                    {isProcessing ? 'Merging...' : (previewUrl ? 'Refresh Preview' : 'Preview All')}
                </button>

                {previewUrl && (
                    <button 
                        onClick={handleDownload}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 transition-colors shadow-md animate-in fade-in slide-in-from-right-4"
                    >
                        <Download size={20} />
                        Download
                    </button>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default App;
