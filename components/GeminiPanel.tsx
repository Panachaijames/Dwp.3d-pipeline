"use client";

import React, { useState, useEffect } from 'react';
import { generateConsultation, generateConceptImage, generateVideoPreview } from '../services/geminiService';
import { PhaseId } from '../types';
import { Send, Loader2, Play, Image as ImageIcon, Sparkles, Wand2, Maximize2, X, AlertCircle, Download, Copy, CheckCircle2 } from 'lucide-react';
import { WhiteModelDecoder } from './WhiteModelDecoder';
import { StyleLens } from './StyleLens';
import { supabase } from '@/services/supabaseClient';

interface GeminiPanelProps {
  phaseId: PhaseId;
  toolName: string;
  onClose: () => void;
}

import { useAuth } from '../contexts/AuthContext';

export const GeminiPanel: React.FC<GeminiPanelProps> = ({ phaseId, toolName, onClose }) => {
  const { user } = useAuth();
  // Special Handling for Custom Apps
  if (toolName === 'WhiteModelDecoder') {
    return <WhiteModelDecoder />;
  }

  if (toolName === 'StyleLens') {
    return <StyleLens />;
  }

  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resultType, setResultType] = useState<'text' | 'image' | 'video'>('text');
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // New State for Enhanced Features
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [modelType, setModelType] = useState<'imagen' | 'nano-banana'>('imagen');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Clear state when tool changes
  useEffect(() => {
    setPrompt('');
    setResult(null);
    setError(null);
    setIsLoading(false);
  }, [toolName, phaseId]);

  // Configure UI based on phase/tool
  const getConfig = () => {
    switch (phaseId) {
      case 'modeling':
        return {
          placeholder: 'Imagine a futuristic parametric tower with glass facade...',
          btnText: 'Generate Concept',
          type: 'image',
          icon: <Wand2 size={18} className="text-purple-400" />,
          desc: 'Generate high-fidelity architectural concepts using Imagen 3 model.'
        };
      case 'lighting':
        return {
          placeholder: 'Describe the mood: Cinematic, Golden Hour, foggy...',
          btnText: 'Generate Lighting Setup',
          systemPrompt: 'You are a master lighting artist (Gaffer) for 3D rendering. Suggest detailed lighting setups including HDRI types, Key/Fill/Rim light intensity ratios, color temperatures, and shadow softness.',
          type: 'text',
          icon: <Sparkles size={18} className="text-amber-400" />,
          desc: 'Get professional V-Ray/Corona lighting parameters.'
        };
      case 'material':
        return {
          placeholder: 'Describe material: Aged brass with patina and scratches...',
          btnText: 'Generate PBR Specs',
          systemPrompt: 'You are a Texture Artist. Provide PBR material values (Albedo, Roughness, Metalness, Normal strength) for the described material.',
          type: 'text',
          icon: <Sparkles size={18} className="text-pink-400" />,
          desc: 'Instant PBR values for realistic shaders.'
        };
      case 'rendering':
        return {
          placeholder: 'Describe the scene to render...',
          btnText: 'Generate Nano Frame',
          type: 'image',
          icon: <ImageIcon size={18} className="text-blue-400" />,
          desc: 'Fast architectural concept renders.'
        };
      case 'animation':
        return {
          placeholder: 'Describe the camera movement and scene action...',
          btnText: 'Generate Veo Preview',
          type: 'video',
          icon: <Play size={18} className="text-green-400" />,
          desc: 'Preview camera moves with Veo generative video.'
        };
      default:
        return { placeholder: 'Ask Gemini...', btnText: 'Send', type: 'text', icon: <Sparkles size={18} />, desc: 'AI Assistant' };
    }
  };

  const config = getConfig();

  const handleAction = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      if (config.type === 'text') {
        const text = await generateConsultation(prompt, config.systemPrompt || '');
        setResult(text);
        setResultType('text');
      } else if (config.type === 'image') {
        // Concept Gen: Pass model type and optional image
        const imgUrl = await generateConceptImage(prompt, modelType, selectedImage || undefined);
        setResult(imgUrl);
        setResultType('image');

        // Auto-save to Gallery
        if (user?.email) {
          const { error: dbError } = await supabase.from('creations').insert({
            type: 'image',
            url: imgUrl,
            prompt: prompt,
            model: modelType === 'imagen' ? 'Imagen 3' : 'Nano Banana',
            user_id: user.email
          });
          if (dbError) console.error("Auto-save failed:", dbError);
        }
      } else if (config.type === 'video') {
        // ... existing video logic ...
        const response = await fetch('/api/video-gen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            aspectRatio,
            imageInput: selectedImage || undefined
          })
        });

        const data = await response.json();

        if (!response.ok) {
          // ... existing error handling ...
          let errorMsg = data.error || 'Unknown error';
          if (data.vertexError) errorMsg += `\n\nVertex AI: ${data.vertexError}`;
          setError(errorMsg);
        } else if (data.videoUrl) {
          setResult(data.videoUrl);
          setResultType('video');

          // Auto-save to Gallery
          if (user?.email) {
            const { error: dbError } = await supabase.from('creations').insert({
              type: 'video',
              url: data.videoUrl,
              prompt: prompt,
              model: 'Veo',
              user_id: user.email
            });
            if (dbError) console.error("Auto-save failed:", dbError);
          }

        } else {
          setError('No video URL returned');
        }
      }

      // Handle Image Auto-Save (Moved out of if/else for image type)
      if (config.type === 'image' && resultType === 'image') {
        // Note: result is set in the block above, but state updates are async. 
        // Better to capture the URL in a local var. 
        // Refactoring slightly to ensure we have the URL.
      }
    } catch (err: any) {
      console.error("GeminiPanel Action Error:", err);
      setError(err.message || err.toString() || 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (result && (resultType === 'image' || resultType === 'video')) {
      // Check if it's a data URI or a URL
      const link = document.createElement('a');
      link.href = result;
      link.download = `gemini-gen-${Date.now()}.${resultType === 'video' ? 'mp4' : 'png'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleCopy = () => {
    if (result && resultType === 'text') {
      navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Modern UI Implementation
  return (
    <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950/50 backdrop-blur-xl shadow-2xl transition-all duration-500">

      {/* Dynamic Backgrounds */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px] -z-10 pointer-events-none mix-blend-screen" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-[100px] -z-10 pointer-events-none mix-blend-screen" />

      <div className="p-8 md:p-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-inner">
              {config.icon}
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                {toolName}
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white uppercase tracking-widest">
                  PRO
                </span>
              </h3>
              <p className="text-zinc-400 text-sm mt-1 font-medium">{config.desc}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Interaction Area */}
        <div className="relative group">
          <div className={`
                absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-blue-500 rounded-2xl opacity-20 group-hover:opacity-40 transition duration-500 blur
                ${isLoading ? 'animate-pulse opacity-60' : ''}
            `} />

          <div className="relative bg-zinc-900 rounded-2xl flex flex-col gap-2 p-2">

            {/* Concept Gen Controls */}
            {phaseId === 'modeling' && (
              <div className="flex items-center gap-3 px-2 py-1 border-b border-zinc-800 pb-2 mb-1">
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Model:</span>
                <div className="flex bg-zinc-950 p-1 rounded-lg">
                  <button
                    onClick={() => setModelType('imagen')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${modelType === 'imagen' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    Imagen
                  </button>
                  <button
                    onClick={() => setModelType('nano-banana')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${modelType === 'nano-banana' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    Nano Banana
                  </button>
                </div>

                {modelType === 'nano-banana' && (
                  <div className="flex items-center gap-2 ml-auto">
                    <input
                      type="file"
                      accept="image/*"
                      id="image-upload"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setSelectedImage(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <label
                      htmlFor="image-upload"
                      className="cursor-pointer flex items-center gap-1.5 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
                    >
                      <ImageIcon size={12} />
                      {selectedImage ? 'Image Selected' : 'Add Image'}
                    </label>
                    {selectedImage && (
                      <button
                        onClick={() => setSelectedImage(null)}
                        className="p-1 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 rounded-md"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Video Gen Controls */}
            {phaseId === 'animation' && (
              <>
                <div className="flex items-center gap-3 px-2 py-1 border-b border-zinc-800 pb-2 mb-1">
                  <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Aspect Ratio:</span>
                  <div className="flex bg-zinc-950 p-1 rounded-lg">
                    <button
                      onClick={() => setAspectRatio('16:9')}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${aspectRatio === '16:9' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      16:9 (Landscape)
                    </button>
                    <button
                      onClick={() => setAspectRatio('9:16')}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${aspectRatio === '9:16' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      9:16 (Portrait)
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-1 px-2 pb-1 border-b border-zinc-800">
                  <input
                    type="file"
                    accept="image/*"
                    id="video-image-upload"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setSelectedImage(reader.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  <label
                    htmlFor="video-image-upload"
                    className="cursor-pointer flex items-center gap-1.5 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
                  >
                    <ImageIcon size={12} />
                    {selectedImage ? 'Reference Image Selected' : 'Add Reference Image'}
                  </label>
                  {selectedImage && (
                    <button
                      onClick={() => setSelectedImage(null)}
                      className="p-1 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 rounded-md"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </>
            )}

            <div className="flex flex-col md:flex-row gap-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={config.placeholder}
                className="w-full bg-transparent border-none text-zinc-100 placeholder-zinc-500 focus:ring-0 resize-none h-[60px] md:h-auto py-3 px-4 min-h-[60px]"
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAction();
                  }
                }}
              />

              <button
                onClick={handleAction}
                disabled={isLoading || !prompt.trim()}
                className={`
                          shrink-0 h-[50px] px-6 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-300
                          ${isLoading || !prompt.trim()
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-white text-black hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] active:scale-95'
                  }
                      `}
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    {config.type === 'text' && <Sparkles size={18} />}
                    {config.type === 'image' && <Wand2 size={18} />}
                    {config.type === 'video' && <Play size={18} fill="currentColor" />}
                    <span className="hidden md:inline">{config.btnText}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Cost / Status Indicator */}
        <div className="flex items-center justify-between mt-3 px-1">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
            <div className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`} />
            {isLoading ? 'Processing Request...' : 'System Ready'}
          </div>
          <div className="text-xs text-zinc-600 font-mono">
            Model: {config.type === 'image' ? (modelType === 'imagen' ? 'Imagen 3.0' : 'Gemini 3 Pro (Nano)') : config.type === 'video' ? 'Veo 4K' : 'Gemini 3 Pro'}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={18} />
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        {/* Output Area */}
        {result && (
          <div className="mt-8 pt-8 border-t border-zinc-800/50 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">
                Generated Output
              </h4>
              {(resultType === 'image' || resultType === 'video') && (
                <button
                  onClick={() => setIsFullscreen(true)}
                  className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-white transition-colors bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-3 py-1.5 rounded-lg"
                >
                  <Maximize2 size={12} />
                  Fullscreen
                </button>
              )}

              <div className="flex items-center gap-2">
                {(resultType === 'image') && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-3 py-1.5 rounded-lg"
                  >
                    <Download size={12} />
                    Download
                  </button>
                )}
                {(resultType === 'text') && (
                  <button
                    onClick={handleCopy}
                    className={`flex items-center gap-1.5 text-xs font-medium transition-colors bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-3 py-1.5 rounded-lg ${copied ? 'text-green-400' : 'text-zinc-400 hover:text-white'}`}
                  >
                    {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Copy Text'}
                  </button>
                )}
              </div>
            </div>

            {/* Content Container */}
            <div className="bg-black/40 rounded-2xl overflow-hidden border border-zinc-800">

              {resultType === 'text' && (
                <div className="p-6 text-zinc-300 leading-relaxed font-light whitespace-pre-wrap">
                  {result}
                </div>
              )}

              {resultType === 'image' && (
                <div className="relative group cursor-pointer" onClick={() => setIsFullscreen(true)}>
                  <img src={result} alt="Generated Concept" className="w-full h-auto object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="px-4 py-2 bg-white/10 backdrop-blur-md rounded-full text-white text-sm font-medium border border-white/20">
                      Click to Expand
                    </span>
                  </div>
                </div>
              )}

              {resultType === 'video' && (
                result.startsWith('gs://') ? (
                  <div className="p-8 bg-zinc-900 border border-zinc-700 border-dashed rounded-xl text-center">
                    <div className="w-12 h-12 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Sparkles size={24} />
                    </div>
                    <h4 className="text-white font-medium mb-1">Video Generated Successfully!</h4>
                    <p className="text-zinc-400 text-xs mb-4 font-mono break-all">{result}</p>
                    <p className="text-zinc-500 text-xs">
                      Note: Playback requires Google Cloud Storage signed URLs.
                      <br />The file is safely stored in your project bucket.
                    </p>
                  </div>
                ) : (
                  <div className="relative w-full aspect-video bg-black group">
                    <video
                      id="generated-video-result"
                      src={result}
                      controls
                      className="w-full h-full"
                      crossOrigin="anonymous"
                    />

                    {/* Extend Video Controls Overlay */}
                    <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="bg-black/80 backdrop-blur-md p-3 rounded-xl border border-zinc-700 shadow-xl">
                        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-2">Extend Video</p>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={async () => {
                              try {
                                const video = document.getElementById('generated-video-result') as HTMLVideoElement;
                                if (!video) return;

                                // Capture last frame
                                const canvas = document.createElement('canvas');
                                canvas.width = video.videoWidth;
                                canvas.height = video.videoHeight;
                                const ctx = canvas.getContext('2d');
                                video.currentTime = video.duration; // Seek to end

                                // Wait for seek
                                await new Promise(resolve => {
                                  const onSeek = () => {
                                    video.removeEventListener('seeked', onSeek);
                                    resolve(true);
                                  };
                                  video.addEventListener('seeked', onSeek);
                                });

                                ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
                                const frameData = canvas.toDataURL('image/png');

                                // Update State to use this frame
                                setSelectedImage(frameData);
                                setPrompt(prev => prev + " (Continuing action)");
                                // Optional: Scroll up to confirm
                                setError(null);
                              } catch (e) {
                                console.error("Frame capture failed", e);
                                setError("Could not capture video frame. Security restriction?");
                              }
                            }}
                            className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-xs font-medium transition-colors"
                          >
                            <Sparkles size={12} />
                            <span>Use Last Frame as Input</span>
                          </button>
                          <p className="text-[10px] text-zinc-500 leading-tight max-w-[150px]">
                            Click to capture the final frame and use it to generate the next segment.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Overlay */}
      {
        isFullscreen && (resultType === 'image' || resultType === 'video') && (
          <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex items-center justify-center animate-in fade-in duration-300">
            <button
              onClick={() => setIsFullscreen(false)}
              className="absolute top-6 right-6 p-3 bg-zinc-900/80 hover:bg-zinc-800 text-white rounded-full transition-all border border-zinc-800 hover:border-zinc-600 group"
            >
              <X size={24} className="group-hover:rotate-90 transition-transform duration-300" />
            </button>

            <div className="max-w-[95vw] max-h-[90vh] p-2">
              {resultType === 'image' && (
                <img src={result!} alt="Fullscreen" className="max-w-full max-h-[90vh] rounded-lg shadow-2xl" />
              )}
              {resultType === 'video' && (
                !result.startsWith('gs://') ? (
                  <video controls autoPlay loop className="max-w-full max-h-[90vh] rounded-lg shadow-2xl">
                    <source src={result} type="video/mp4" />
                  </video>
                ) : (
                  <div className="text-white text-center">Video stored at {result}</div>
                )
              )}
            </div>
          </div>
        )
      }
    </div >
  );
};
