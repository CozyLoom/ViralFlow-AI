import React, { useState, useEffect } from 'react';
import { Copy, Check, Loader2 } from 'lucide-react';
import { CaptionsResponse } from '../types/creator';
import { parseApiJson } from '../utils/api';

interface CaptionsStudioProps {
  initialSummary?: string;
  result: CaptionsResponse | null;
  onResult: (data: CaptionsResponse, title: string, platform: string) => void;
}

type CaptionTab = 'tiktok' | 'instagram' | 'youtube';

export const CaptionsStudio: React.FC<CaptionsStudioProps> = ({
  initialSummary = '',
  result,
  onResult,
}) => {
  const [videoSummary, setVideoSummary] = useState(initialSummary);
  const [niche, setNiche] = useState('');
  const [goal, setGoal] = useState('Maximize saves and shares');
  const [cta, setCta] = useState('');
  const [activeTab, setActiveTab] = useState<CaptionTab>('tiktok');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (initialSummary) setVideoSummary(initialSummary);
  }, [initialSummary]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoSummary.trim()) {
      setError('Describe your video or paste a transcript to generate captions.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/generate/captions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoSummary, niche, goal, cta }),
      });
      const data = await parseApiJson<CaptionsResponse>(res, 'Failed to generate captions.');
      onResult(
        data,
        videoSummary.trim().slice(0, 48),
        'TikTok · Instagram · YouTube'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate captions.');
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left Input Form */}
      <section className="xl:col-span-5 bg-[#0F172A] border border-slate-800 rounded-xl p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-50">Caption & SEO Brief</h2>
          <p className="text-sm text-slate-400 mt-1">
            Generate platform-native captions, search keywords, and strategic hashtags for all three networks at once.
          </p>
        </div>

        <form onSubmit={handleGenerate} className="space-y-4">
          <div>
            <label htmlFor="cap-summary" className="block text-sm font-medium text-slate-200 mb-1.5">
              Video summary or spoken transcript
            </label>
            <textarea
              id="cap-summary"
              rows={5}
              value={videoSummary}
              onChange={(e) => setVideoSummary(e.target.value)}
              placeholder="Paste your script or describe what happens in the video, key takeaways, and why viewers care..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-rose-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cap-niche" className="block text-sm font-medium text-slate-200 mb-1.5">
                Creator niche
              </label>
              <input
                id="cap-niche"
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="e.g., Tech reviews, Fitness, SaaS"
                className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-rose-500"
              />
            </div>

            <div>
              <label htmlFor="cap-goal" className="block text-sm font-medium text-slate-200 mb-1.5">
                Optimization goal
              </label>
              <select
                id="cap-goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-rose-500"
              >
                <option value="Maximize saves and shares">Maximize saves and shares</option>
                <option value="Drive comments and debate">Drive comments and debate</option>
                <option value="Rank in TikTok & YouTube Search">Rank in TikTok & YouTube Search</option>
                <option value="Convert profile clicks / link-in-bio">Convert profile clicks</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="cap-cta" className="block text-sm font-medium text-slate-200 mb-1.5">
              Call-to-action prompt (optional)
            </label>
            <input
              id="cap-cta"
              type="text"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              placeholder='e.g., Comment "CHECKLIST" for the full PDF'
              className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-rose-500"
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
            {loading ? 'Writing platform captions...' : 'Generate Captions & Hashtags'}
          </button>
        </form>
      </section>

      {/* Right Platform Output */}
      <section className="xl:col-span-7 bg-[#0F172A] border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">Platform Copy</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Tailored copy lengths, search terms, and hashtag clusters
            </p>
          </div>

          <div className="inline-flex items-center gap-1 p-1 bg-slate-950/80 border border-slate-800 rounded-lg">
            {(
              [
                { id: 'tiktok', label: 'TikTok' },
                { id: 'instagram', label: 'Instagram Reels' },
                { id: 'youtube', label: 'YouTube' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === tab.id
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-6 space-y-4 animate-pulse">
            <div className="h-4 w-40 bg-slate-800 rounded" />
            <div className="h-28 bg-slate-800/60 rounded-lg" />
            <div className="h-16 bg-slate-800/60 rounded-lg" />
          </div>
        ) : result ? (
          <div className="divide-y divide-slate-800">
            {activeTab === 'tiktok' && (
              <>
                <div className="p-6">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <span className="text-xs font-medium text-slate-400 tabular-nums">
                      TikTok Caption · {result.tiktok.caption.length} chars
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyText(
                          'tt-all',
                          `${result.tiktok.caption}\n\n${result.tiktok.hashtags.join(' ')}`
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                    >
                      {copiedKey === 'tt-all' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedKey === 'tt-all' ? 'Copied' : 'Copy Caption + Tags'}
                    </button>
                  </div>
                  <p className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap">
                    {result.tiktok.caption}
                  </p>
                </div>

                <div className="p-6">
                  <div className="flex items-center justify-between gap-4 mb-2.5">
                    <span className="text-xs font-medium text-slate-400">
                      Search SEO Keywords
                    </span>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    {result.tiktok.seoKeywords.join(' · ')}
                  </p>
                </div>

                <div className="p-6">
                  <div className="flex items-center justify-between gap-4 mb-2.5">
                    <span className="text-xs font-medium text-slate-400 tabular-nums">
                      Hashtags ({result.tiktok.hashtags.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => copyText('tt-tags', result.tiktok.hashtags.join(' '))}
                      className="text-xs font-medium text-rose-400 hover:text-rose-300 whitespace-nowrap shrink-0"
                    >
                      {copiedKey === 'tt-tags' ? 'Copied hashtags' : 'Copy hashtags'}
                    </button>
                  </div>
                  <p className="font-mono text-sm text-slate-200 leading-relaxed">
                    {result.tiktok.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join('  ')}
                  </p>
                </div>
              </>
            )}

            {activeTab === 'instagram' && (
              <>
                <div className="p-6 bg-slate-950/50">
                  <span className="block text-xs font-medium text-slate-400 mb-1.5">
                    Before-the-Fold First Line
                  </span>
                  <p className="text-sm font-semibold text-slate-50">
                    {result.instagram.firstLineHook}
                  </p>
                </div>

                <div className="p-6">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <span className="text-xs font-medium text-slate-400 tabular-nums">
                      Instagram Reels Caption · {result.instagram.caption.length} chars
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyText(
                          'ig-all',
                          `${result.instagram.firstLineHook}\n\n${result.instagram.caption}\n\n${result.instagram.hashtags.join(' ')}`
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                    >
                      {copiedKey === 'ig-all' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedKey === 'ig-all' ? 'Copied' : 'Copy Full Post'}
                    </button>
                  </div>
                  <p className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap">
                    {result.instagram.caption}
                  </p>
                </div>

                <div className="p-6">
                  <div className="flex items-center justify-between gap-4 mb-2.5">
                    <span className="text-xs font-medium text-slate-400 tabular-nums">
                      Hashtags ({result.instagram.hashtags.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => copyText('ig-tags', result.instagram.hashtags.join(' '))}
                      className="text-xs font-medium text-rose-400 hover:text-rose-300 whitespace-nowrap shrink-0"
                    >
                      {copiedKey === 'ig-tags' ? 'Copied hashtags' : 'Copy hashtags'}
                    </button>
                  </div>
                  <p className="font-mono text-sm text-slate-200 leading-relaxed">
                    {result.instagram.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join('  ')}
                  </p>
                </div>
              </>
            )}

            {activeTab === 'youtube' && (
              <>
                <div className="p-6">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <span className="text-xs font-medium text-slate-400 tabular-nums">
                      Video Title · {result.youtube.title.length} / 100 chars
                    </span>
                    <button
                      type="button"
                      onClick={() => copyText('yt-title', result.youtube.title)}
                      className="text-xs font-medium text-rose-400 hover:text-rose-300 whitespace-nowrap shrink-0"
                    >
                      {copiedKey === 'yt-title' ? 'Copied title' : 'Copy title'}
                    </button>
                  </div>
                  <p className="text-base font-semibold text-slate-50">{result.youtube.title}</p>
                </div>

                <div className="p-6">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <span className="text-xs font-medium text-slate-400">Description</span>
                    <button
                      type="button"
                      onClick={() => copyText('yt-desc', result.youtube.description)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                    >
                      {copiedKey === 'yt-desc' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedKey === 'yt-desc' ? 'Copied' : 'Copy Description'}
                    </button>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {result.youtube.description}
                  </p>
                </div>

                <div className="p-6">
                  <div className="flex items-center justify-between gap-4 mb-2.5">
                    <span className="text-xs font-medium text-slate-400">
                      YouTube Studio Tags (Comma-Separated)
                    </span>
                    <button
                      type="button"
                      onClick={() => copyText('yt-tags', result.youtube.tags.join(', '))}
                      className="text-xs font-medium text-rose-400 hover:text-rose-300 whitespace-nowrap shrink-0"
                    >
                      {copiedKey === 'yt-tags' ? 'Copied tags' : 'Copy comma list'}
                    </button>
                  </div>
                  <p className="font-mono text-xs text-slate-300 leading-relaxed">
                    {result.youtube.tags.join(', ')}
                  </p>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="px-6 py-16 text-center max-w-md mx-auto">
            <h3 className="text-base font-semibold text-slate-100">Cross-platform captions</h3>
            <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
              Summarize your video on the left to generate tailored copy, search keywords, and hashtags for TikTok, Instagram Reels, and YouTube.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
