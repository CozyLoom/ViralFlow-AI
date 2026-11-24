import React, { useState, useEffect, useRef } from 'react';
import { Upload, Download, Play, Pause, Loader2, Trash2, ArrowRight, Film } from 'lucide-react';
import { ClipsResponse, ShortClipSegment } from '../types/creator';
import {
  downloadTextFile,
  formatClipsBrief,
  formatMinutesSeconds,
} from '../utils/exportHelpers';
import { parseApiJson } from '../utils/api';
import creatorReelImg from '../assets/images/creator_reel_studio_1795500269560.jpg';
import overheadRigImg from '../assets/images/overhead_rig_reel_1795500269759.jpg';
import studioPreviewFrameImg from '../assets/images/studio_preview_frame_1795421850856.jpg';

interface ClipsStudioProps {
  result: ClipsResponse | null;
  onResult: (data: ClipsResponse, title: string, platform: string) => void;
  onSendToCaptions: (summary: string) => void;
}

type ClipInputMode = 'transcript' | 'upload';

const LONG_VIDEO_PRESET = `[00:00] Welcome back to the studio. Today I want to break down why 90% of creator sponsorships fall apart before the creator even sends a rate card.
[01:12] Most creators pitch "reach" and subscriber counts. Brands in 2026 do not buy impressions anymore—they buy predictable conversion or creative assets they can run as paid ads.
[02:05] Here is the exact shift that tripled our average deal size from $1,500 to $4,800: stop selling a single 60-second mention and start packaging "Usage Rights + 3 Hook Variations."
[04:30] Let me walk through a real negotiation from last Tuesday. A productivity software brand offered $1,200 for one Instagram Reel. Instead of saying no, I asked what their target cost per signup was and offered 30-day whitelisting rights plus two vertical hook cuts.
[06:18] Another trap is sending a 12-page media kit PDF. Nobody in a brand marketing team opens a 14MB PDF on mobile. Send a 3-sentence email with two links to your highest-retention videos and one clear angle for their product.
[08:40] Finally, let's talk about exclusivity clauses. Never agree to a 90-day category-wide exclusivity for free—exclusivity should add at least 35% per month to your base rate.`;

export const ClipsStudio: React.FC<ClipsStudioProps> = ({
  result,
  onResult,
  onSendToCaptions,
}) => {
  const [inputMode, setInputMode] = useState<ClipInputMode>('transcript');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState('');
  const [totalDurationMinutes, setTotalDurationMinutes] = useState(10);
  const [targetClipCount, setTargetClipCount] = useState(4);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [referenceScene, setReferenceScene] = useState<'condenser' | 'overhead' | 'desk'>('overhead');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewImgError, setPreviewImgError] = useState(false);

  const REFERENCE_SCENES = {
    overhead: {
      label: 'Overhead Rig',
      src: overheadRigImg,
      alt: 'Vertical 9:16 creator filming desk shot under overhead cinema rig',
    },
    condenser: {
      label: 'Studio Mic',
      src: creatorReelImg,
      alt: 'Vertical 9:16 creator speaking into studio condenser mic',
    },
    desk: {
      label: 'Desk Frame',
      src: studioPreviewFrameImg,
      alt: 'Vertical 9:16 creator at minimalist oak desk',
    },
  } as const;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlayingClip, setIsPlayingClip] = useState(false);

  useEffect(() => {
    if (result?.clips?.length && !selectedClipId) {
      setSelectedClipId(result.clips[0].id);
    }
  }, [result, selectedClipId]);

  useEffect(() => {
    return () => {
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    };
  }, [mediaUrl]);

  const activeClip: ShortClipSegment | null =
    result?.clips.find((c) => c.id === selectedClipId) || result?.clips[0] || null;

  const handleFileChange = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError('File exceeds the 20 MB upload limit. Paste a timestamped transcript for longer videos.');
      return;
    }
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    setMediaFile(file);
    setMediaUrl(URL.createObjectURL(file));
    setError(null);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMode === 'upload' && !mediaFile) {
      setError('Select a video or audio file first, or paste a long-form transcript.');
      return;
    }
    if (inputMode === 'transcript' && !sourceText.trim()) {
      setError('Paste a long-form video transcript or timestamped outline to extract clips.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let res: Response;
      if (inputMode === 'upload' && mediaFile) {
        const formData = new FormData();
        formData.append('media', mediaFile);
        formData.append('targetClipCount', String(targetClipCount));
        res = await fetch('/api/generate/clips', {
          method: 'POST',
          body: formData,
        });
      } else {
        res = await fetch('/api/generate/clips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceText,
            totalDurationMinutes,
            targetClipCount,
          }),
        });
      }

      const typed = await parseApiJson<ClipsResponse>(res, 'Failed to extract short clips.');
      if (typed.clips.length > 0) {
        setSelectedClipId(typed.clips[0].id);
      }
      onResult(
        typed,
        mediaFile ? mediaFile.name : 'Long-Form Repurpose',
        `${typed.clips.length} short clips`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clip extraction failed.');
    } finally {
      setLoading(false);
    }
  };

  const previewSegment = (clip: ShortClipSegment) => {
    setSelectedClipId(clip.id);
    if (videoRef.current) {
      videoRef.current.currentTime = clip.startSeconds;
      videoRef.current.play().catch(() => {});
      setIsPlayingClip(true);
    }
  };

  const handleVideoTimeUpdate = () => {
    if (!videoRef.current || !activeClip) return;
    if (videoRef.current.currentTime >= activeClip.endSeconds) {
      videoRef.current.currentTime = activeClip.startSeconds;
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left Column: Long-Form Source */}
      <section className="xl:col-span-4 bg-[#0F172A] border border-slate-800 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Long-Form Source</h2>
          <p className="text-sm text-slate-400 mt-1">
            Identify standalone 20–58s vertical moments from YouTube videos, podcasts, or interviews.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950/80 border border-slate-800 rounded-lg">
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
        </div>

        <form onSubmit={handleGenerate} className="space-y-4">
          {inputMode === 'upload' ? (
            <div>
              <label
                htmlFor="clips-media-input"
                className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/60 px-4 py-6 text-center cursor-pointer hover:border-rose-500 hover:bg-rose-950/20 transition-colors"
              >
                <Upload className="w-5 h-5 text-slate-400 mb-2" />
                <span className="text-sm font-medium text-slate-200">
                  {mediaFile ? mediaFile.name : 'Upload video or podcast audio'}
                </span>
                <span className="text-xs text-slate-400 mt-1 tabular-nums">
                  {mediaFile
                    ? `${(mediaFile.size / (1024 * 1024)).toFixed(2)} MB`
                    : 'MP4, MOV, WebM, MP3 up to 20 MB'}
                </span>
                <input
                  id="clips-media-input"
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
                  Remove media
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="clips-source" className="text-sm font-medium text-slate-200">
                  Transcript or outline
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setSourceText(LONG_VIDEO_PRESET);
                    setTotalDurationMinutes(10);
                    setError(null);
                  }}
                  className="text-xs font-medium text-rose-400 hover:text-rose-300 whitespace-nowrap shrink-0"
                >
                  Load sample podcast
                </button>
              </div>
              <textarea
                id="clips-source"
                rows={7}
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder="Paste your YouTube transcript, podcast notes, or timestamped outline..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-rose-500"
              />

              <div>
                <label htmlFor="clips-duration" className="block text-sm font-medium text-slate-200 mb-1.5 tabular-nums">
                  Source length ({totalDurationMinutes} min)
                </label>
                <input
                  id="clips-duration"
                  type="range"
                  min={2}
                  max={90}
                  step={1}
                  value={totalDurationMinutes}
                  onChange={(e) => setTotalDurationMinutes(Number(e.target.value))}
                  className="w-full accent-rose-500"
                />
              </div>
            </div>
          )}

          <div>
            <span className="block text-sm font-medium text-slate-200 mb-1.5">Clips to extract</span>
            <div className="inline-flex items-center gap-1 p-1 bg-slate-950/80 border border-slate-800 rounded-lg">
              {[3, 4, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTargetClipCount(n)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                    targetClipCount === n
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {n} clips
                </button>
              ))}
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
            {loading ? 'Extracting high-retention clips...' : 'Find Short Clips'}
          </button>
        </form>
      </section>

      {/* Right Column: Extracted Clips + 9:16 Vertical Framing Preview */}
      <section className="xl:col-span-8 bg-[#0F172A] border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">Short Clip Cut Sheet</h2>
            <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
              {result
                ? `${result.clips.length} standalone clips identified · Select a clip to inspect framing`
                : 'Select or upload a long video to generate cut markers and vertical overlays'}
            </p>
          </div>

          {result && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    'short-clips-brief.txt',
                    formatClipsBrief(result.clips, result.sourceSummary)
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Export Cut Brief
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    'clip-markers.json',
                    JSON.stringify(result, null, 2),
                    'application/json'
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-500 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Markers .JSON
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-6 space-y-4 animate-pulse">
            <div className="h-5 w-1/2 bg-slate-800 rounded" />
            <div className="h-32 bg-slate-800/60 rounded-lg" />
            <div className="h-32 bg-slate-800/60 rounded-lg" />
          </div>
        ) : result && result.clips.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
            {/* Clip List */}
            <div className="lg:col-span-7 divide-y divide-slate-800">
              {result.clips.map((clip, idx) => {
                const isSelected = activeClip?.id === clip.id;
                return (
                  <article
                    key={clip.id || idx}
                    className={`p-5 transition-colors cursor-pointer ${
                      isSelected ? 'bg-rose-500/15' : 'hover:bg-slate-800/40'
                    }`}
                    onClick={() => previewSegment(clip)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 text-xs text-slate-400 tabular-nums">
                        <span className="font-mono font-semibold text-rose-400">
                          Clip {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-slate-200">
                          {clip.startTime} – {clip.endTime}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{clip.durationSec}s</span>
                        <span aria-hidden="true">·</span>
                        <span>{clip.recommendedPlatforms.join(', ')}</span>
                      </div>
                    </div>

                    <h3 className="text-base font-semibold text-slate-50 mb-2">{clip.title}</h3>

                    <p className="text-xs text-slate-300 leading-relaxed mb-3">
                      {clip.transcriptExcerpt}
                    </p>

                    <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-slate-400">
                        <strong className="text-slate-200">Why it retains:</strong> {clip.whyItWorks}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSendToCaptions(`${clip.title}. ${clip.transcriptExcerpt}`);
                        }}
                        className="inline-flex items-center gap-1 font-medium text-rose-400 hover:text-rose-300 whitespace-nowrap shrink-0"
                      >
                        Draft Caption
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* 9:16 Vertical Framing Inspector */}
            <div className="lg:col-span-5 p-6 bg-slate-950/60 flex flex-col items-center">
              {activeClip && (
                <>
                  <div className="w-full max-w-[250px] flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-slate-300">9:16 Vertical Crop</span>
                    <span className="font-mono text-xs text-slate-400 tabular-nums">
                      {formatMinutesSeconds(activeClip.startSeconds)}–{formatMinutesSeconds(activeClip.endSeconds)}
                    </span>
                  </div>

                  <div className="relative w-full max-w-[250px] aspect-[9/16] rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
                    {mediaUrl && mediaFile?.type.startsWith('video/') ? (
                      <video
                        ref={videoRef}
                        src={mediaUrl}
                        playsInline
                        onTimeUpdate={handleVideoTimeUpdate}
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
                        <Film className="w-8 h-8 text-slate-400 mb-2" />
                        <span className="text-xs text-slate-300">9:16 Clip Frame</span>
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/45 pointer-events-none" />

                    {/* Hook Overlay */}
                    <div className="absolute inset-x-4 top-8 text-center pointer-events-none">
                      <span className="inline-block bg-white text-slate-950 px-3 py-1.5 rounded-md text-xs font-bold leading-snug shadow-sm">
                        {activeClip.hookOverlay}
                      </span>
                    </div>

                    {/* Caption Preview */}
                    <div className="absolute inset-x-4 bottom-5 text-left pointer-events-none space-y-1">
                      <p className="text-xs text-white/95 font-medium line-clamp-2">
                        {activeClip.suggestedCaption}
                      </p>
                      <p className="font-mono text-[13px] text-white/75 truncate">
                        {activeClip.hashtags.join(' ')}
                      </p>
                    </div>
                  </div>

                  {mediaUrl && mediaFile?.type.startsWith('video/') ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!videoRef.current) return;
                        if (videoRef.current.paused) {
                          if (
                            videoRef.current.currentTime < activeClip.startSeconds ||
                            videoRef.current.currentTime >= activeClip.endSeconds
                          ) {
                            videoRef.current.currentTime = activeClip.startSeconds;
                          }
                          videoRef.current.play();
                          setIsPlayingClip(true);
                        } else {
                          videoRef.current.pause();
                          setIsPlayingClip(false);
                        }
                      }}
                      className="mt-4 w-full max-w-[250px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs font-semibold hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                    >
                      {isPlayingClip ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      {isPlayingClip ? 'Pause Segment' : 'Loop Clip Segment'}
                    </button>
                  ) : (
                    <div className="mt-4 w-full max-w-[250px] grid grid-cols-3 gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
                      {(['overhead', 'condenser', 'desk'] as const).map((sceneKey) => (
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
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="px-6 py-16 text-center max-w-md mx-auto">
            <h3 className="text-base font-semibold text-slate-100">Repurpose long-form video</h3>
            <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
              Paste a podcast or YouTube transcript—or upload a video file—to extract self-contained vertical clips with timecodes, hook overlays, and captions.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
