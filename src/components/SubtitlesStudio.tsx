import React, { useState, useEffect, useRef } from 'react';
import { Upload, Download, Play, Pause, Loader2, Trash2, Video } from 'lucide-react';
import { BillingStatus, SubtitleCue, SubtitlesResponse } from '../types/creator';
import {
  buildSrtContent,
  buildVttContent,
  downloadTextFile,
  formatMinutesSeconds,
} from '../utils/exportHelpers';
import { ApiRequestError, getAuthHeaders, parseApiJson } from '../utils/api';
import creatorReelImg from '../assets/images/creator_reel_studio_1795500269560.jpg';
import overheadRigImg from '../assets/images/overhead_rig_reel_1795500269759.jpg';
import studioPreviewFrameImg from '../assets/images/studio_preview_frame_1795421850856.jpg';

interface SubtitlesStudioProps {
  initialTranscript?: string;
  initialDurationSec?: number;
  result: SubtitlesResponse | null;
  onResult: (data: SubtitlesResponse, title: string, platform: string) => void;
  onBillingUpdate?: (billing: BillingStatus) => void;
  onRequireUpgrade?: () => void;
}

type InputMode = 'upload' | 'transcript';
type SubtitleVisualStyle = 'broadcast' | 'kinetic' | 'minimal';

export const SubtitlesStudio: React.FC<SubtitlesStudioProps> = ({
  initialTranscript = '',
  initialDurationSec = 45,
  result,
  onResult,
  onBillingUpdate,
  onRequireUpgrade,
}) => {
  const [inputMode, setInputMode] = useState<InputMode>(initialTranscript ? 'transcript' : 'upload');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [transcriptText, setTranscriptText] = useState(initialTranscript);
  const [durationSec, setDurationSec] = useState(initialDurationSec);
  const [maxWordsPerCue, setMaxWordsPerCue] = useState(6);
  const [language, setLanguage] = useState('English');

  const [cues, setCues] = useState<SubtitleCue[]>(result?.cues || []);
  const [visualStyle, setVisualStyle] = useState<SubtitleVisualStyle>('kinetic');
  const [referenceScene, setReferenceScene] = useState<'condenser' | 'overhead' | 'desk'>('condenser');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewImgError, setPreviewImgError] = useState(false);

  const REFERENCE_SCENES = {
    condenser: {
      label: 'Studio Mic',
      src: creatorReelImg,
      alt: 'Vertical 9:16 creator speaking into studio condenser mic',
    },
    overhead: {
      label: 'Overhead Rig',
      src: overheadRigImg,
      alt: 'Vertical 9:16 creator filming desk shot under overhead cinema rig',
    },
    desk: {
      label: 'Desk Frame',
      src: studioPreviewFrameImg,
      alt: 'Vertical 9:16 creator at minimalist oak desk',
    },
  } as const;

  // Sync playback state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isSimPlaying, setIsSimPlaying] = useState(false);

  useEffect(() => {
    if (initialTranscript) {
      setTranscriptText(initialTranscript);
      setInputMode('transcript');
    }
  }, [initialTranscript]);

  useEffect(() => {
    if (initialDurationSec) setDurationSec(initialDurationSec);
  }, [initialDurationSec]);

  useEffect(() => {
    if (result?.cues) {
      setCues(result.cues);
    }
  }, [result]);

  useEffect(() => {
    return () => {
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    };
  }, [mediaUrl]);

  // Simulated timer playback when previewing without an uploaded video
  useEffect(() => {
    if (!isSimPlaying || (mediaFile && mediaFile.type.startsWith('video/'))) return;
    const maxTime = cues.length > 0 ? cues[cues.length - 1].endSeconds : durationSec;
    const id = window.setInterval(() => {
      setCurrentTime((prev) => {
        if (prev + 0.1 >= maxTime) {
          setIsSimPlaying(false);
          return 0;
        }
        return Number((prev + 0.1).toFixed(2));
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [isSimPlaying, cues, durationSec, mediaFile]);

  const handleFileChange = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError('File exceeds the 20 MB upload limit. Please compress your clip or paste the transcript text.');
      return;
    }
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    const objectUrl = URL.createObjectURL(file);
    setMediaFile(file);
    setMediaUrl(objectUrl);
    setCurrentTime(0);
    setError(null);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMode === 'upload' && !mediaFile) {
      setError('Select a video or audio file first, or switch to Paste Transcript.');
      return;
    }
    if (inputMode === 'transcript' && !transcriptText.trim()) {
      setError('Paste your spoken script or transcript text to generate timed cues.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let res: Response;
      if (inputMode === 'upload' && mediaFile) {
        const formData = new FormData();
        formData.append('media', mediaFile);
        formData.append('maxWordsPerCue', String(maxWordsPerCue));
        formData.append('language', language);
        res = await fetch('/api/generate/subtitles', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData,
        });
      } else {
        res = await fetch('/api/generate/subtitles', {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ transcriptText, durationSec, maxWordsPerCue, language }),
        });
      }

      const raw = await parseApiJson<SubtitlesResponse & { billing?: BillingStatus }>(
        res,
        'Failed to generate subtitles.'
      );
      const { billing, ...typed } = raw;
      if (billing) onBillingUpdate?.(billing);
      setCues(typed.cues);
      setCurrentTime(0);
      onResult(
        typed,
        mediaFile ? mediaFile.name : transcriptText.trim().slice(0, 42),
        `${typed.detectedLanguage} · ${typed.cues.length} cues`
      );
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.billing) onBillingUpdate?.(err.billing);
        if (err.status === 402 || err.code === 'TRIAL_EXHAUSTED') {
          onRequireUpgrade?.();
        }
      }
      setError(err instanceof Error ? err.message : 'Subtitle generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const updateCueText = (index: number, nextText: string) => {
    setCues((prev) => prev.map((c, i) => (i === index ? { ...c, text: nextText } : c)));
  };

  const seekToCue = (seconds: number) => {
    setCurrentTime(seconds);
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => {});
    } else if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      audioRef.current.play().catch(() => {});
    } else {
      setIsSimPlaying(true);
    }
  };

  const activeCue = cues.find(
    (c) => currentTime >= c.startSeconds && currentTime <= c.endSeconds
  ) || (cues.length > 0 && currentTime === 0 ? cues[0] : null);

  const renderStyledCueText = (cue: SubtitleCue) => {
    const words = cue.text.split(' ');
    const emphasisLower = new Set((cue.emphasisWords || []).map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, '')));
    return words.map((word, i) => {
      const clean = word.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isEmphasized = emphasisLower.has(clean);
      if (visualStyle === 'kinetic') {
        return (
          <span
            key={i}
            className={isEmphasized ? 'text-amber-300 font-extrabold' : 'text-white font-extrabold'}
          >
            {word}{' '}
          </span>
        );
      }
      return <span key={i}>{word} </span>;
    });
  };

  const maxTimelineSeconds =
    cues.length > 0 ? cues[cues.length - 1].endSeconds : durationSec;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left Column: Input + Subtitle Style Controls */}
      <section className="xl:col-span-4 bg-[#0F172A] border border-slate-800 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Subtitle Source</h2>
          <p className="text-sm text-slate-400 mt-1">
            Transcribe uploaded clips or pace an existing script into editable SRT & VTT files.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950/80 border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setInputMode('upload')}
            className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              inputMode === 'upload'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Upload Media
          </button>
          <button
            type="button"
            onClick={() => setInputMode('transcript')}
            className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              inputMode === 'transcript'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Paste Transcript
          </button>
        </div>

        <form onSubmit={handleGenerate} className="space-y-4">
          {inputMode === 'upload' ? (
            <div>
              <label
                htmlFor="subtitle-media-input"
                className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/60 px-4 py-6 text-center cursor-pointer hover:border-rose-500 hover:bg-rose-950/20 transition-colors"
              >
                <Upload className="w-5 h-5 text-slate-400 mb-2" />
                <span className="text-sm font-medium text-slate-200">
                  {mediaFile ? mediaFile.name : 'Choose MP4, MOV, WebM, MP3, or WAV'}
                </span>
                <span className="text-xs text-slate-400 mt-1 tabular-nums">
                  {mediaFile
                    ? `${(mediaFile.size / (1024 * 1024)).toFixed(2)} MB · Ready to transcribe`
                    : 'Direct upload up to 20 MB'}
                </span>
                <input
                  id="subtitle-media-input"
                  type="file"
                  accept="video/*,audio/*"
                  onChange={(e) => handleFileChange(e.target.files?.[0])}
                  className="sr-only"
                />
              </label>

              {mediaFile && (
                <button
                  type="button"
                  onClick={() => {
                    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
                    setMediaFile(null);
                    setMediaUrl(null);
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove file
                </button>
              )}

              {mediaUrl && mediaFile?.type.startsWith('audio/') && (
                <audio
                  ref={audioRef}
                  src={mediaUrl}
                  controls
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  className="w-full mt-3"
                />
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label htmlFor="sub-transcript" className="block text-sm font-medium text-slate-200 mb-1.5">
                  Spoken script or transcript
                </label>
                <textarea
                  id="sub-transcript"
                  rows={5}
                  value={transcriptText}
                  onChange={(e) => setTranscriptText(e.target.value)}
                  placeholder="Paste your spoken lines here. Gemini will split them into punchy short-form subtitle blocks..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-rose-500"
                />
              </div>

              <div>
                <label htmlFor="sub-duration" className="block text-sm font-medium text-slate-200 mb-1.5 tabular-nums">
                  Estimated video length ({durationSec}s)
                </label>
                <input
                  id="sub-duration"
                  type="range"
                  min={15}
                  max={180}
                  step={5}
                  value={durationSec}
                  onChange={(e) => setDurationSec(Number(e.target.value))}
                  className="w-full accent-rose-500"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sub-words" className="block text-sm font-medium text-slate-200 mb-1.5">
                Words per cue
              </label>
              <select
                id="sub-words"
                value={maxWordsPerCue}
                onChange={(e) => setMaxWordsPerCue(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-rose-500"
              >
                <option value={4}>3–4 words (Fast)</option>
                <option value={6}>5–6 words (Standard)</option>
                <option value={9}>7–9 words (Sentence)</option>
              </select>
            </div>

            <div>
              <label htmlFor="sub-lang" className="block text-sm font-medium text-slate-200 mb-1.5">
                Language
              </label>
              <input
                id="sub-lang"
                type="text"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-rose-500"
              />
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-red-500/40 bg-red-950/50 px-3.5 py-2.5 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Generating timed cues...' : 'Generate Subtitles'}
          </button>
        </form>
      </section>

      {/* Right Column: Live 9:16 Monitor + Editable Cue List */}
      <section className="xl:col-span-8 bg-[#0F172A] border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">Subtitle Studio & Export</h2>
            <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
              {cues.length > 0
                ? `${cues.length} time-coded cues · Click any row to preview or edit inline`
                : 'Preview caption styles in 9:16 and export .SRT / .VTT files'}
            </p>
          </div>

          {cues.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => downloadTextFile('subtitles.srt', buildSrtContent(cues))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Download .SRT
              </button>
              <button
                type="button"
                onClick={() => downloadTextFile('subtitles.vtt', buildVttContent(cues), 'text/vtt')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-500 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Download .VTT
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
          {/* 9:16 Vertical Monitor */}
          <div className="lg:col-span-5 p-6 flex flex-col items-center bg-slate-950/60">
            <div className="w-full max-w-[260px] mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">9:16 Caption Preview</span>
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                {formatMinutesSeconds(currentTime)}
              </span>
            </div>

            <div className="relative w-full max-w-[260px] aspect-[9/16] rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
              {mediaUrl && mediaFile?.type.startsWith('video/') ? (
                <video
                  ref={videoRef}
                  src={mediaUrl}
                  playsInline
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  className="w-full h-full object-cover"
                />
              ) : !previewImgError ? (
                <img
                  src={REFERENCE_SCENES[referenceScene].src}
                  alt={REFERENCE_SCENES[referenceScene].alt}
                  referrerPolicy="no-referrer"
                  onError={() => setPreviewImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-950 flex flex-col items-center justify-center p-6 text-center">
                  <Video className="w-8 h-8 text-slate-400 mb-2" />
                  <span className="text-xs text-slate-300">Vertical 9:16 Monitor</span>
                </div>
              )}

              {/* Contrast Scrim */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/25 pointer-events-none" />

              {/* Live Caption Overlay */}
              <div className="absolute inset-x-4 bottom-12 flex justify-center pointer-events-none">
                {activeCue ? (
                  <div
                    className={`text-center transition-all ${
                      visualStyle === 'kinetic'
                        ? 'text-lg leading-tight uppercase tracking-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]'
                        : visualStyle === 'broadcast'
                        ? 'bg-black/85 text-white px-3 py-1.5 rounded text-sm font-semibold leading-snug'
                        : 'text-sm font-medium text-white/95 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]'
                    }`}
                  >
                    {renderStyledCueText(activeCue)}
                  </div>
                ) : (
                  <span className="text-xs text-white/80 bg-black/60 px-2.5 py-1 rounded">
                    Subtitles appear here
                  </span>
                )}
              </div>
            </div>

            {/* Playback & Style Controls */}
            <div className="w-full max-w-[260px] mt-4 space-y-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={cues.length === 0 && !mediaUrl}
                  onClick={() => {
                    if (videoRef.current) {
                      if (videoRef.current.paused) videoRef.current.play();
                      else videoRef.current.pause();
                    } else if (audioRef.current) {
                      if (audioRef.current.paused) audioRef.current.play();
                      else audioRef.current.pause();
                    } else {
                      setIsSimPlaying((p) => !p);
                    }
                  }}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 disabled:opacity-40 shrink-0"
                  aria-label="Play or pause preview"
                >
                  {isSimPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={Math.max(maxTimelineSeconds, 1)}
                  step={0.1}
                  value={currentTime}
                  disabled={cues.length === 0 && !mediaUrl}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setCurrentTime(val);
                    if (videoRef.current) videoRef.current.currentTime = val;
                    if (audioRef.current) audioRef.current.currentTime = val;
                  }}
                  className="flex-1 accent-rose-500"
                  aria-label="Preview scrubber"
                />
              </div>

              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
                {(
                  [
                    { id: 'kinetic', label: 'Kinetic' },
                    { id: 'broadcast', label: 'Broadcast' },
                    { id: 'minimal', label: 'Minimal' },
                  ] as const
                ).map((styleOption) => (
                  <button
                    key={styleOption.id}
                    type="button"
                    onClick={() => setVisualStyle(styleOption.id)}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      visualStyle === styleOption.id
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {styleOption.label}
                  </button>
                ))}
              </div>

              {!mediaUrl && (
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
                  {(['condenser', 'overhead', 'desk'] as const).map((sceneKey) => (
                    <button
                      key={sceneKey}
                      type="button"
                      onClick={() => {
                        setReferenceScene(sceneKey);
                        setPreviewImgError(false);
                      }}
                      className={`py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 truncate ${
                        referenceScene === sceneKey
                          ? 'bg-rose-600/20 text-rose-300'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {REFERENCE_SCENES[sceneKey].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cue Timeline List */}
          <div className="lg:col-span-7 flex flex-col max-h-[620px]">
            {loading ? (
              <div className="p-6 space-y-3 animate-pulse">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="h-12 bg-slate-800/60 rounded-lg" />
                ))}
              </div>
            ) : cues.length > 0 ? (
              <div className="divide-y divide-slate-800 overflow-y-auto flex-1">
                {cues.map((cue, idx) => {
                  const isActive =
                    currentTime >= cue.startSeconds && currentTime <= cue.endSeconds;
                  return (
                    <div
                      key={cue.index ?? idx}
                      className={`px-5 py-3.5 transition-colors ${
                        isActive ? 'bg-rose-500/15' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <button
                          type="button"
                          onClick={() => seekToCue(cue.startSeconds)}
                          className="font-mono text-xs text-slate-400 hover:text-rose-400 tabular-nums transition-colors"
                        >
                          #{String(idx + 1).padStart(2, '0')} · {cue.startTime} → {cue.endTime}
                        </button>
                        <span className="text-xs text-slate-500 tabular-nums">
                          {(cue.endSeconds - cue.startSeconds).toFixed(1)}s
                        </span>
                      </div>
                      <input
                        type="text"
                        value={cue.text}
                        onChange={(e) => updateCueText(idx, e.target.value)}
                        aria-label={`Edit subtitle cue ${idx + 1}`}
                        className="w-full rounded-md border border-transparent hover:border-slate-700 focus:border-rose-500 focus:bg-slate-900 bg-transparent px-2 py-1 text-sm font-medium text-slate-100 focus:outline-none transition-colors"
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-6 py-20 text-center max-w-sm mx-auto">
                <h3 className="text-base font-semibold text-slate-100">No subtitle cues yet</h3>
                <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
                  Upload a video or audio clip—or paste your spoken script—to generate editable, time-coded subtitles ready for CapCut, Premiere, or YouTube Studio.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
