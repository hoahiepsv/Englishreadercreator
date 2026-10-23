

import React, { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Segment, InputType, VoiceName } from './types';
import SegmentItem from './components/SegmentItem';
import { Plus, Download, Play, Layers, AlertCircle, Loader2, Key, Save, CheckCircle2, X } from 'lucide-react';
import { decodeRawPCM, mergeAudioBuffers, bufferToWav, resampleAudioBuffer, convertSampleRate, trimAudioBuffer } from './utils/audioUtils';

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

  // Optional Custom API Key State
  const [apiKey, setApiKey] = useState<string>('');
  const [isApiKeySaved, setIsApiKeySaved] = useState<boolean>(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);

  // Load API Key from local storage on mount (if user previously entered one)
  useEffect(() => {
    const storedKey = localStorage.getItem('user_gemini_api_key');
    if (storedKey) {
        setApiKey(storedKey);
        setIsApiKeySaved(true);
    }
  }, []);

  const handleSaveApiKey = () => {
      if(apiKey.trim()) {
          localStorage.setItem('user_gemini_api_key', apiKey.trim());
          setIsApiKeySaved(true);
          setShowApiKeyModal(false);
      }
  };

  const handleClearApiKey = () => {
      localStorage.removeItem('user_gemini_api_key');
      setApiKey('');
      setIsApiKeySaved(false);
      setShowApiKeyModal(false);
  };

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

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    setSegments(prev => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
    setPreviewUrl(null);
  };

  const handleMoveDown = (index: number) => {
    if (index >= segments.length - 1) return;
    setSegments(prev => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
    setPreviewUrl(null);
  };

  const handleGeneratePreview = async () => {
    // Check if we have content
    const validSegments = segments.filter(s => 
        (s.inputType === InputType.AUDIO && s.uploadedAudioURL) || 
        (s.inputType !== InputType.AUDIO && s.audioBase64)
    );

    if (validSegments.length === 0) {
        setGlobalError("Vui lòng bấm 'Generate Voice' cho từng phân đoạn hoặc tải lên file âm thanh trước khi xem trước.");
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
                 // Decode might return varying sample rates (44.1k, 48k)
                 const decoded = await audioContext.decodeAudioData(arrayBuffer);
                 
                 // Apply Trimming if set
                 let processed = decoded;
                 if (seg.trimStart !== undefined && seg.trimEnd !== undefined) {
                     processed = trimAudioBuffer(decoded, seg.trimStart, seg.trimEnd);
                 }

                 // Normalize to 24000Hz to match Gemini TTS output for clean merging
                 buffer = await convertSampleRate(processed, 24000);
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
        setGlobalError("Không thể xử lý âm thanh. Vui lòng kiểm tra lại các phân đoạn.");
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
      <header className="bg-primary-600 text-white shadow-md sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex flex-col md:flex-row justify-between items-center gap-3">
            <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2.5 rounded-xl shadow-inner">
                    <Layers size={26} className="text-white" />
                </div>
                <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-xl md:text-2xl font-black tracking-tight uppercase">ENGLISH READER CREATER</h1>
                      <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-400/40 text-[11px] font-semibold">
                        <CheckCircle2 size={12} className="text-emerald-300" /> Sẵn sàng hoạt động
                      </span>
                    </div>
                    <p className="text-primary-100 text-xs font-medium tracking-wide opacity-95">Professional English Speech Assembly</p>
                    <p className="text-white text-[10px] mt-0.5 opacity-80 font-mono">Create by Lê Hòa Hiệp - 0983.676.470</p>
                </div>
            </div>
            
            <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                 {/* Optional API Key Button - Never forced */}
                 <button 
                    onClick={() => setShowApiKeyModal(!showApiKeyModal)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-xs font-medium rounded-lg border border-white/20 transition-colors shadow-sm"
                    title="Cài đặt khóa API (Tùy chọn, không bắt buộc)"
                 >
                     <Key size={14} />
                     <span>{isApiKeySaved ? 'API Key (Đang dùng)' : 'API Key (Tùy chọn)'}</span>
                 </button>

                <div className="hidden md:block text-right bg-primary-700/40 px-3.5 py-1.5 rounded-lg border border-primary-500/30">
                    <p className="text-[10px] font-bold text-primary-200 tracking-wider">LICENSED TO</p>
                    <p className="text-xs font-bold text-white">Lê Hòa Hiệp</p>
                </div>
            </div>
        </div>
      </header>

      {/* Optional Custom API Key Modal/Card */}
      {showApiKeyModal && (
          <div className="bg-white border-b border-primary-200 shadow-md p-4 animate-in slide-in-from-top-4 transition-all">
              <div className="container mx-auto max-w-4xl relative">
                  <button 
                    onClick={() => setShowApiKeyModal(false)}
                    className="absolute right-0 top-0 text-slate-400 hover:text-slate-600 p-1"
                    title="Đóng"
                  >
                    <X size={18} />
                  </button>
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-4 pr-8">
                      <div className="bg-primary-50 p-3 rounded-full text-primary-600 shrink-0">
                          <Key size={22} />
                      </div>
                      <div className="flex-grow w-full">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-bold text-slate-800">Khóa Gemini API (Tùy chọn / Optional)</h3>
                            <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.2 rounded font-medium">Không bắt buộc</span>
                          </div>
                          <p className="text-xs text-slate-600 mb-2">
                            Ứng dụng <strong>hoạt động hoàn toàn bình thường mà không cần điền API key</strong>. Bạn chỉ cần điền nếu muốn dùng hạn mức Gemini cá nhân của riêng mình.
                          </p>
                          <input 
                              type="password" 
                              placeholder="Dán Gemini API Key cá nhân của bạn tại đây (nếu muốn)..." 
                              value={apiKey}
                              onChange={(e) => setApiKey(e.target.value)}
                              className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white"
                          />
                      </div>
                      <div className="flex gap-2 w-full md:w-auto shrink-0">
                        <button 
                          onClick={handleSaveApiKey}
                          disabled={!apiKey.trim()}
                          className="flex-1 md:flex-none px-4 py-2 bg-primary-600 text-white rounded-lg text-xs font-bold hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                            <Save size={14} /> Lưu Key
                        </button>
                        {isApiKeySaved && (
                          <button 
                            onClick={handleClearApiKey}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                          >
                            Xóa Key
                          </button>
                        )}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Main Content */}
      <main className="flex-grow container mx-auto px-4 py-6 max-w-4xl">
        
        {globalError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                <AlertCircle size={20} className="shrink-0" />
                <span className="text-sm font-medium">{globalError}</span>
            </div>
        )}

        {/* Segments List */}
        <div className="space-y-6 mb-28">
            {segments.map((seg, index) => (
                <SegmentItem 
                    key={seg.id} 
                    index={index}
                    segment={seg} 
                    onChange={handleSegmentChange} 
                    onRemove={handleRemoveSegment}
                    onMoveUp={() => handleMoveUp(index)}
                    onMoveDown={() => handleMoveDown(index)}
                    isFirst={index === 0}
                    isLast={index === segments.length - 1}
                    apiKey={apiKey}
                />
            ))}

             {/* Add Button */}
            <button 
                onClick={handleAddSegment}
                className="w-full py-4 border-2 border-dashed border-primary-300 bg-white hover:bg-primary-50/50 text-primary-600 rounded-xl font-bold transition-all flex items-center justify-center gap-2 group shadow-sm hover:border-primary-500"
            >
                <div className="bg-primary-100 p-2 rounded-full group-hover:bg-primary-200 transition-colors">
                    <Plus size={22} />
                </div>
                Thêm phân đoạn tiếp theo (Add Next Segment)
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
