import React, { useState } from 'react';
import { Copy, Check, ArrowRight, Loader2, RotateCcw } from 'lucide-react';
import { HookItem, HooksResponse, Platform } from '../types/creator';

interface HooksStudioProps {
  initialTopic?: string;
  initialPlatform?: Platform;
  result: HooksResponse | null;
  onResult: (data: HooksResponse, title: string, platform: string) => void;
  onSendToScript: (hook: HookItem, topic: string, platform: Platform) => void;
}

const HOOK_PRESETS = [
  {
    label: 'Minimalist Camera Setup',
    topic: 'Why I sold $8,000 worth of camera gear and started filming everything on one 35mm prime lens and natural window light.',
    audience: 'Beginner & intermediate solo creators',
    tone: 'Honest & Contrarian',
  },
  {
    label: 'SaaS Cold Outreach Fix',
    topic: 'The 3-line cold email structure that took our B2B demo reply rate from 1.2% to 14% without using fake personalization.',
    audience: 'Founders & indie hackers',
    tone: 'Direct & Tactical',
  },
  {
    label: 'Home Espresso Dial-In',
    topic: 'Why your morning espresso tastes sour even with expensive beans, and the 10-second grind-size fix baristas use.',
    audience: 'Home coffee enthusiasts',
    tone: 'Crisp & Educational',
  },
];

const PLATFORMS: Platform[] = ['TikTok', 'Instagram Reels', 'YouTube Shorts'];

export const HooksStudio: React.FC<HooksStudioProps> = ({
  initialTopic = '',
  initialPlatform = 'TikTok',
  result,
  onResult,
  onSendToScript,
}) => {
  const [topic, setTopic] = useState(initialTopic);
  const [platform, setPlatform] = useState<Platform>(initialPlatform);
  const [audience, setAudience] = useState('');
  const [tone, setTone] = useState('Direct & Punchy');
  const [count, setCount] = useState<number>(6);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialTopic) setTopic(initialTopic);
  }, [initialTopic]);

  React.useEffect(() => {
    if (initialPlatform) setPlatform(initialPlatform);
  }, [initialPlatform]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) {
      setError('Enter a video topic or premise before generating hooks.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/generate/hooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, platform, audience, tone, count }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate hooks.');
      }
      onResult(data as HooksResponse, topic.trim().slice(0, 48), platform);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach generation service.');
    } finally {
      setLoading(false);
    }
  };

  const copyHook = async (hook: HookItem) => {
    const formatted = `Spoken Hook: "${hook.spokenHook}"\nOn-Screen Text: ${hook.onScreenText}\nVisual Direction: ${hook.visualDirection}`;
    await navigator.clipboard.writeText(formatted);
    setCopiedId(hook.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left Configuration Column */}
      <section className="xl:col-span-5 bg-[#0F172A] border border-slate-800 rounded-xl p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-50">Hook Brief</h2>
          <p className="text-sm text-slate-400 mt-1">
            Craft first-3-second openings paired with on-screen text and visual direction.
          </p>
        </div>

        <div className="mb-5">
          <span className="block text-xs font-medium text-slate-400 mb-2">Load an example brief</span>
          <div className="flex flex-wrap gap-2">
            {HOOK_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setTopic(preset.topic);
                  setAudience(preset.audience);
                  setTone(preset.tone);
                  setError(null);
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleGenerate} className="space-y-4">
          <div>
            <label htmlFor="hook-topic" className="block text-sm font-medium text-slate-200 mb-1.5">
              Video topic or core takeaway
            </label>
            <textarea
              id="hook-topic"
              rows={4}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Why most beginner YouTubers lose 60% of viewers in the first 5 seconds and how to fix your intro framing..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-rose-500 transition-colors"
            />
          </div>

          <div>
            <span className="block text-sm font-medium text-slate-200 mb-1.5">Target platform</span>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950/80 border border-slate-800 rounded-lg">
              {PLATFORMS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPlatform(item)}
                  className={`px-2.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 truncate ${
                    platform === item
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="hook-audience" className="block text-sm font-medium text-slate-200 mb-1.5">
                Target audience
              </label>
              <input
                id="hook-audience"
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g., Solo founders, filmmakers"
                className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-rose-500"
              />
            </div>

            <div>
              <label htmlFor="hook-tone" className="block text-sm font-medium text-slate-200 mb-1.5">
                Delivery tone
              </label>
              <select
                id="hook-tone"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-rose-500"
              >
                <option value="Direct & Punchy">Direct & Punchy</option>
                <option value="Honest & Contrarian">Honest & Contrarian</option>
                <option value="Storytelling & Curious">Storytelling & Curious</option>
                <option value="Crisp & Educational">Crisp & Educational</option>
                <option value="Urgent & High-Stakes">Urgent & High-Stakes</option>
              </select>
            </div>
          </div>

          <div>
            <span className="block text-sm font-medium text-slate-200 mb-1.5">Variations</span>
            <div className="inline-flex items-center gap-1 p-1 bg-slate-950/80 border border-slate-800 rounded-lg">
              {[4, 6, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                    count === n
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {n} hooks
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-red-500/40 bg-red-950/50 px-3.5 py-2.5 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="pt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Generating hooks...' : 'Generate Viral Hooks'}
            </button>
            {topic && (
              <button
                type="button"
                onClick={() => {
                  setTopic('');
                  setAudience('');
                  setError(null);
                }}
                aria-label="Clear form"
                className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 p-2.5 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors shrink-0"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>
      </section>

      {/* Right Results Column */}
      <section className="xl:col-span-7 bg-[#0F172A] border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">Generated Hooks</h2>
            <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
              {result
                ? `${result.hooks.length} variations · ${platform} · Ready for filming`
                : 'Enter a topic on the left to generate opening variations'}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-6 divide-y divide-slate-800">
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="py-5 first:pt-0 last:pb-0 animate-pulse space-y-3">
                <div className="h-3.5 w-48 bg-slate-800 rounded" />
                <div className="h-5 w-4/5 bg-slate-800 rounded" />
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="h-10 bg-slate-800/60 rounded" />
                  <div className="h-10 bg-slate-800/60 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : result && result.hooks.length > 0 ? (
          <div className="divide-y divide-slate-800">
            {result.hooks.map((hook, idx) => (
              <article key={hook.id || idx} className="p-6 hover:bg-slate-800/40 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
                  <div className="flex items-center gap-2 text-xs text-slate-400 tabular-nums">
                    <span className="font-mono font-medium text-slate-300">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-slate-200">{hook.angle}</span>
                    <span aria-hidden="true">·</span>
                    <span>{hook.targetPlatform}</span>
                    <span aria-hidden="true">·</span>
                    <span>{hook.estimatedSeconds}s read</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copyHook(hook)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                    >
                      {copiedId === hook.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copy
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSendToScript(
                          hook,
                          topic.trim() || result.topicSummary,
                          (hook.targetPlatform as Platform) || platform
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      Build Script
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-base font-semibold text-slate-50 leading-snug mb-4">
                  “{hook.spokenHook}”
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-800/80 text-xs">
                  <div>
                    <span className="block font-medium text-slate-400 mb-1">On-Screen Text</span>
                    <p className="text-slate-100 font-medium leading-relaxed">{hook.onScreenText}</p>
                  </div>
                  <div>
                    <span className="block font-medium text-slate-400 mb-1">Visual Direction</span>
                    <p className="text-slate-300 leading-relaxed">{hook.visualDirection}</p>
                  </div>
                  <div>
                    <span className="block font-medium text-slate-400 mb-1">Retention Trigger</span>
                    <p className="text-slate-300 leading-relaxed">{hook.retentionTrigger}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-6 py-16 text-center max-w-md mx-auto">
            <h3 className="text-base font-semibold text-slate-100">No hooks generated yet</h3>
            <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
              Describe your video idea or pick an example brief on the left to generate opening lines, text overlays, and camera cues.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
