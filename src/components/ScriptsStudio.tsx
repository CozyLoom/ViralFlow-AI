import React, { useState, useEffect, useRef } from 'react';
import { Copy, Check, Loader2, Play, Pause, ArrowRight, Download } from 'lucide-react';
import { BillingStatus, Platform, VideoScriptResponse } from '../types/creator';
import {
  downloadTextFile,
  formatMinutesSeconds,
  formatScriptForClipboard,
} from '../utils/exportHelpers';
import { ApiRequestError, apiFetch, parseApiJson } from '../utils/api';

interface ScriptsStudioProps {
  initialTopic?: string;
  initialPlatform?: Platform;
  initialKeyPoints?: string;
  result: VideoScriptResponse | null;
  onResult: (data: VideoScriptResponse, title: string, platform: string) => void;
  onSendToCaptions: (summary: string) => void;
  onSendToSubtitles: (transcript: string, durationSec: number) => void;
  onBillingUpdate?: (billing: BillingStatus) => void;
  onRequireUpgrade?: () => void;
}

const DURATIONS = [
  { label: '30s Short', value: 30 },
  { label: '45s Reel', value: 45 },
  { label: '60s Short', value: 60 },
  { label: '3m Deep Dive', value: 180 },
  { label: '8m YouTube', value: 480 },
];

export const ScriptsStudio: React.FC<ScriptsStudioProps> = ({
  initialTopic = '',
  initialPlatform = 'TikTok',
  initialKeyPoints = '',
  result,
  onResult,
  onSendToCaptions,
  onSendToSubtitles,
  onBillingUpdate,
  onRequireUpgrade,
}) => {
  const [topic, setTopic] = useState(initialTopic);
  const [platform, setPlatform] = useState<Platform>(initialPlatform);
  const [durationSec, setDurationSec] = useState<number>(45);
  const [tone, setTone] = useState('Conversational & High-Retention');
  const [keyPoints, setKeyPoints] = useState(initialKeyPoints);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Teleprompter state
  const [teleprompterOpen, setTeleprompterOpen] = useState(false);
  const [prompterPlaying, setPrompterPlaying] = useState(false);
  const [prompterSpeed, setPrompterSpeed] = useState(1.2);
  const [prompterFontSize, setPrompterFontSize] = useState(30);
  const prompterRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialTopic) setTopic(initialTopic);
  }, [initialTopic]);

  useEffect(() => {
    if (initialPlatform) setPlatform(initialPlatform);
  }, [initialPlatform]);

  useEffect(() => {
    if (initialKeyPoints) setKeyPoints(initialKeyPoints);
  }, [initialKeyPoints]);

  useEffect(() => {
    if (!teleprompterOpen || !prompterPlaying) return;
    const interval = window.setInterval(() => {
      if (prompterRef.current) {
        prompterRef.current.scrollTop += prompterSpeed;
      }
    }, 30);
    return () => window.clearInterval(interval);
  }, [teleprompterOpen, prompterPlaying, prompterSpeed]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) {
      setError('Enter a video concept or title to write a script.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/generate/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, platform, durationSec, tone, keyPoints }),
      });
      const raw = await parseApiJson<VideoScriptResponse & { billing?: BillingStatus }>(
        res,
        'Failed to write video script.'
      );
      const { billing, ...data } = raw;
      if (billing) onBillingUpdate?.(billing);
      onResult(data, data.title || topic.trim(), platform);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.billing) onBillingUpdate?.(err.billing);
        if (err.status === 402 || err.code === 'TRIAL_EXHAUSTED') {
          onRequireUpgrade?.();
        }
      }
      setError(err instanceof Error ? err.message : 'Unable to generate script.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyScript = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(formatScriptForClipboard(result));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const getPlainSpokenTranscript = (script: VideoScriptResponse) =>
    script.beats.map((b) => b.spokenLine).join(' ');

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left Brief Column */}
      <section className="xl:col-span-4 bg-[#0F172A] border border-slate-800 rounded-xl p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-50">Script Parameters</h2>
          <p className="text-sm text-slate-400 mt-1">
            Generate beat-by-beat spoken scripts with camera framing and B-roll cues.
          </p>
        </div>

        <form onSubmit={handleGenerate} className="space-y-4">
          <div>
            <label htmlFor="script-topic" className="block text-sm font-medium text-slate-200 mb-1.5">
              Video concept or working title
            </label>
            <textarea
              id="script-topic"
              rows={3}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., 3 lighting mistakes making your talking-head videos look flat..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-rose-500"
            />
          </div>

          <div>
            <label htmlFor="script-platform" className="block text-sm font-medium text-slate-200 mb-1.5">
              Platform format
            </label>
            <select
              id="script-platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-rose-500"
            >
              <option value="TikTok">TikTok (Vertical 9:16)</option>
              <option value="Instagram Reels">Instagram Reels (Vertical 9:16)</option>
              <option value="YouTube Shorts">YouTube Shorts (Vertical 9:16)</option>
              <option value="YouTube Long-Form">YouTube Long-Form (16:9)</option>
            </select>
          </div>

          <div>
            <span className="block text-sm font-medium text-slate-200 mb-1.5">Target runtime</span>
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDurationSec(d.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                    durationSec === d.value
                      ? 'bg-rose-600 text-white border-rose-500'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="script-tone" className="block text-sm font-medium text-slate-200 mb-1.5">
              Narrative style
            </label>
            <select
              id="script-tone"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-rose-500"
            >
              <option value="Conversational & High-Retention">Conversational & High-Retention</option>
              <option value="Fast-Paced Listicle">Fast-Paced Listicle</option>
              <option value="Documentary Storytelling">Documentary Storytelling</option>
              <option value="Step-by-Step Tutorial">Step-by-Step Tutorial</option>
            </select>
          </div>

          <div>
            <label htmlFor="script-keypoints" className="block text-sm font-medium text-slate-200 mb-1.5">
              Opening hook or must-include points
            </label>
            <textarea
              id="script-keypoints"
              rows={3}
              value={keyPoints}
              onChange={(e) => setKeyPoints(e.target.value)}
              placeholder="Optional: paste a chosen hook, product name, or specific story beat..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-rose-500"
            />
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
            {loading ? 'Writing script...' : 'Create Video Script'}
          </button>
        </form>
      </section>

      {/* Right Script Workspace */}
      <section className="xl:col-span-8 bg-[#0F172A] border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">
              {result ? result.title : 'Production Script'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
              {result
                ? `${result.targetPlatform} · ${formatMinutesSeconds(result.estimatedDurationSec)} runtime · ${result.beats.length} beats`
                : 'Structured production sheet with timestamps and B-roll cues'}
            </p>
          </div>

          {result && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setTeleprompterOpen((v) => !v);
                  setPrompterPlaying(false);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  teleprompterOpen
                    ? 'bg-rose-600 text-white border-rose-500'
                    : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                }`}
              >
                {teleprompterOpen ? 'Production Sheet' : 'Teleprompter'}
              </button>
              <button
                type="button"
                onClick={handleCopyScript}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    `${result.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-script.txt`,
                    formatScriptForClipboard(result)
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Export .TXT
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-6 space-y-4 animate-pulse">
            <div className="h-5 w-2/3 bg-slate-800 rounded" />
            <div className="h-24 bg-slate-800/60 rounded-lg" />
            <div className="h-24 bg-slate-800/60 rounded-lg" />
            <div className="h-24 bg-slate-800/60 rounded-lg" />
          </div>
        ) : result ? (
          teleprompterOpen ? (
            <div className="bg-[#060911] text-slate-100">
              <div className="px-6 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setPrompterPlaying((p) => !p)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    {prompterPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    {prompterPlaying ? 'Pause Scroll' : 'Start Scroll'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPrompterPlaying(false);
                      if (prompterRef.current) prompterRef.current.scrollTop = 0;
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    Reset Top
                  </button>
                </div>

                <div className="flex items-center gap-5 text-xs text-slate-300 tabular-nums">
                  <label className="flex items-center gap-2">
                    <span>Speed</span>
                    <input
                      type="range"
                      min={0.5}
                      max={3}
                      step={0.1}
                      value={prompterSpeed}
                      onChange={(e) => setPrompterSpeed(Number(e.target.value))}
                      className="accent-rose-500"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <span>Size {prompterFontSize}px</span>
                    <input
                      type="range"
                      min={22}
                      max={46}
                      step={2}
                      value={prompterFontSize}
                      onChange={(e) => setPrompterFontSize(Number(e.target.value))}
                      className="accent-rose-500"
                    />
                  </label>
                </div>
              </div>

              <div
                ref={prompterRef}
                className="h-[460px] overflow-y-auto px-8 sm:px-14 py-12 space-y-8 leading-relaxed"
                style={{ fontSize: `${prompterFontSize}px` }}
              >
                {result.beats.map((beat, idx) => (
                  <p key={idx} className="font-medium tracking-wide text-slate-100">
                    <span className="block font-mono text-xs text-rose-400 mb-1 uppercase tracking-wider">
                      {beat.timestamp} · {beat.section}
                    </span>
                    {beat.spokenLine}
                  </p>
                ))}
                <div className="h-40" />
              </div>
            </div>
          ) : (
            <div>
              {/* Summary & Retention Structure */}
              <div className="px-6 py-4 bg-slate-950/60 border-b border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="block text-xs font-medium text-slate-400 mb-1">Retention Loop</span>
                  <p className="text-slate-200">{result.retentionLoop}</p>
                </div>
                <div>
                  <span className="block text-xs font-medium text-slate-400 mb-1">Call to Action</span>
                  <p className="text-slate-200">{result.callToAction}</p>
                </div>
              </div>

              {/* Beats Table */}
              <div className="divide-y divide-slate-800">
                {result.beats.map((beat, index) => (
                  <div key={index} className="px-6 py-4 grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-3">
                      <span className="font-mono text-xs font-medium text-rose-400 tabular-nums">
                        {beat.timestamp}
                      </span>
                      <p className="text-sm font-semibold text-slate-100 mt-0.5">{beat.section}</p>
                    </div>
                    <div className="md:col-span-5">
                      <span className="block text-xs font-medium text-slate-400 mb-1">Spoken Line</span>
                      <p className="text-sm text-slate-100 leading-relaxed">{beat.spokenLine}</p>
                    </div>
                    <div className="md:col-span-4 space-y-2 text-xs">
                      <div>
                        <span className="block font-medium text-slate-400 mb-0.5">Visual Framing</span>
                        <p className="text-slate-300 leading-relaxed">{beat.visualAction}</p>
                      </div>
                      <div>
                        <span className="block font-medium text-slate-400 mb-0.5">B-Roll Cue</span>
                        <p className="text-slate-400 leading-relaxed">{beat.bRollCue}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer Handoff Bar */}
              <div className="px-6 py-4 bg-slate-950/60 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <p className="text-xs text-slate-400 max-w-xl">
                  <span className="font-semibold text-slate-200">Pacing Note:</span> {result.pacingNotes}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSendToCaptions(getPlainSpokenTranscript(result))}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                  >
                    Write Captions
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onSendToSubtitles(getPlainSpokenTranscript(result), result.estimatedDurationSec)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    Generate Subtitles
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="px-6 py-16 text-center max-w-md mx-auto">
            <h3 className="text-base font-semibold text-slate-100">Ready to draft your script</h3>
            <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
              Specify your concept and target runtime on the left to generate a timestamped production script with a built-in teleprompter.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
