import React, { useState } from 'react';
import { ArrowRight, Zap, FileText, Hash, Captions, Scissors, Film } from 'lucide-react';
import { Platform, StudioModule } from '../types/creator';

interface StudioOverviewProps {
  onSelectModule: (module: StudioModule) => void;
  onQuickLaunchHooks: (topic: string, platform: Platform) => void;
}

export const StudioOverview: React.FC<StudioOverviewProps> = ({
  onSelectModule,
  onQuickLaunchHooks,
}) => {
  const [quickTopic, setQuickTopic] = useState('');
  const [quickPlatform, setQuickPlatform] = useState<Platform>('TikTok');
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  const markImgError = (key: string) => {
    setImgErrors((prev) => ({ ...prev, [key]: true }));
  };

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTopic.trim()) {
      onSelectModule('hooks');
      return;
    }
    onQuickLaunchHooks(quickTopic.trim(), quickPlatform);
  };

  return (
    <div className="space-y-10">
      {/* Flagship 16:9 Cinema Hero */}
      <section className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#0D121C]">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-5 p-8 sm:p-10 flex flex-col justify-between gap-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                <span>TikTok</span>
                <span aria-hidden="true">·</span>
                <span>Instagram Reels</span>
                <span aria-hidden="true">·</span>
                <span>YouTube 4K</span>
              </div>

              <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-50 leading-[1.1]">
                Every frame, hook, and cut in one production suite.
              </h2>

              <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-md">
                Write scroll-stopping hooks, film with a calibrated teleprompter, pace crisp 9:16 subtitles, and carve long-form shoots into standalone vertical clips.
              </p>
            </div>

            <form onSubmit={handleQuickSubmit} className="space-y-3">
              <label htmlFor="overview-quick-topic" className="block text-xs font-medium text-slate-400">
                Start a new production brief
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  id="overview-quick-topic"
                  type="text"
                  value={quickTopic}
                  onChange={(e) => setQuickTopic(e.target.value)}
                  placeholder="Enter a video idea to draft hooks..."
                  className="flex-1 rounded-lg border border-white/10 bg-[#070A10] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 transition-colors whitespace-nowrap shrink-0"
                >
                  Launch Studio
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-1 p-1 bg-[#070A10] border border-white/10 rounded-lg w-fit">
                {(['TikTok', 'Instagram Reels', 'YouTube Shorts'] as Platform[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setQuickPlatform(p)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      quickPlatform === p
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </form>
          </div>

          <div className="lg:col-span-7 relative min-h-[320px] lg:min-h-[460px] bg-[#070A10]">
            {!imgErrors.hero ? (
              <img
                src="/src/assets/images/studio_hero_cinema_1795500268220.jpg"
                alt="Flagship dark cinema filming and 4K color grading studio"
                referrerPolicy="no-referrer"
                onError={() => markImgError('hero')}
                className="w-full h-full lg:h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-slate-900 via-[#0D121C] to-black flex flex-col items-center justify-center p-8 text-center">
                <Film className="w-10 h-10 text-slate-500 mb-3" />
                <span className="text-sm text-slate-400">Cinema Production Suite</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0D121C] via-transparent to-transparent pointer-events-none hidden lg:block" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
            <div className="absolute bottom-5 left-6 right-6 flex flex-wrap items-end justify-between gap-4 pointer-events-none">
              <div>
                <p className="text-xs font-medium text-slate-300">Studio Pipeline</p>
                <p className="text-sm font-semibold text-white mt-0.5">
                  4K Master Capture · Vertical 9:16 Delivery
                </p>
              </div>
              <span className="font-mono text-xs text-slate-300 tabular-nums">
                3840 × 2160 · 24fps
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Asymmetric Production Suite Gallery */}
      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="font-display text-2xl font-semibold text-slate-50">
              Production Suites
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              Select a workspace module below to write, time, caption, or repurpose your next shoot.
            </p>
          </div>
          <span className="text-xs text-slate-400 tabular-nums">
            5 integrated tools · Cross-module handoff
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
          {/* Card 1: Short Clips Repurposer (Wide 4:3) */}
          <button
            type="button"
            onClick={() => onSelectModule('clips')}
            className="md:col-span-7 group relative rounded-2xl overflow-hidden border border-white/10 bg-[#0D121C] text-left flex flex-col justify-end min-h-[340px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            {!imgErrors.podcast ? (
              <img
                src="/src/assets/images/podcast_suite_session_1795500269499.jpg"
                alt="Two creators recording a long-form video podcast in a sound-treated studio"
                referrerPolicy="no-referrer"
                onError={() => markImgError('podcast')}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-black" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/15" />
            <div className="relative p-7 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <Scissors className="w-4 h-4 text-rose-400" />
                <span>01. Long-to-Short Repurposer</span>
                <span aria-hidden="true">·</span>
                <span>9:16 Cut Sheet</span>
              </div>
              <h4 className="font-display text-2xl font-semibold text-white">
                Turn long interviews and 4K videos into standalone vertical clips
              </h4>
              <p className="text-sm text-slate-300 max-w-xl leading-relaxed">
                Extract timestamped 20–58s highlights with opening hook overlays, retention rationale, and ready-to-post captions.
              </p>
            </div>
          </button>

          {/* Card 2: Subtitle Studio (Vertical 9:16) */}
          <button
            type="button"
            onClick={() => onSelectModule('subtitles')}
            className="md:col-span-5 group relative rounded-2xl overflow-hidden border border-white/10 bg-[#0D121C] text-left flex flex-col justify-end min-h-[340px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            {!imgErrors.reel1 ? (
              <img
                src="/src/assets/images/creator_reel_studio_1795500269560.jpg"
                alt="Creator speaking into a broadcast condenser microphone in vertical 9:16 framing"
                referrerPolicy="no-referrer"
                onError={() => markImgError('reel1')}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-black" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/15" />
            <div className="relative p-7 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <Captions className="w-4 h-4 text-rose-400" />
                <span>02. Subtitle Studio</span>
                <span aria-hidden="true">·</span>
                <span>.SRT & .VTT</span>
              </div>
              <h4 className="font-display text-2xl font-semibold text-white">
                Frame-synced captions & live 9:16 monitor
              </h4>
              <p className="text-sm text-slate-300 leading-relaxed">
                Transcribe audio or paste scripts to edit timed cues with Kinetic, Broadcast, and Minimal styles.
              </p>
            </div>
          </button>

          {/* Card 3: Viral Hooks (4:3 Cinema Optics) */}
          <button
            type="button"
            onClick={() => onSelectModule('hooks')}
            className="md:col-span-4 group relative rounded-2xl overflow-hidden border border-white/10 bg-[#0D121C] text-left flex flex-col justify-end min-h-[290px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            {!imgErrors.optics ? (
              <img
                src="/src/assets/images/cinema_optics_desk_1795500270761.jpg"
                alt="Cinema prime lenses and calibrated waveform monitor on a production console"
                referrerPolicy="no-referrer"
                onError={() => markImgError('optics')}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-black" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/50 to-black/20" />
            <div className="relative p-6 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <Zap className="w-4 h-4 text-rose-400" />
                <span>03. Viral Hooks</span>
              </div>
              <h4 className="font-display text-xl font-semibold text-white">
                First 3-second openers & visual cues
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                Psychological hook angles paired with on-screen text and camera blocking.
              </p>
            </div>
          </button>

          {/* Card 4: Video Scripts (Vertical Overhead Rig) */}
          <button
            type="button"
            onClick={() => onSelectModule('scripts')}
            className="md:col-span-4 group relative rounded-2xl overflow-hidden border border-white/10 bg-[#0D121C] text-left flex flex-col justify-end min-h-[290px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            {!imgErrors.overhead ? (
              <img
                src="/src/assets/images/overhead_rig_reel_1795500269759.jpg"
                alt="Creator filming overhead B-roll under a studio cinema rig"
                referrerPolicy="no-referrer"
                onError={() => markImgError('overhead')}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-black" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/50 to-black/20" />
            <div className="relative p-6 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <FileText className="w-4 h-4 text-rose-400" />
                <span>04. Video Scripts</span>
              </div>
              <h4 className="font-display text-xl font-semibold text-white">
                Beat-by-beat sheets & teleprompter
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                Timestamped spoken lines, B-roll callouts, and an auto-scrolling teleprompter.
              </p>
            </div>
          </button>

          {/* Card 5: Captions & Tags (Architectural Card) */}
          <button
            type="button"
            onClick={() => onSelectModule('captions')}
            className="md:col-span-4 group relative rounded-2xl overflow-hidden border border-white/10 bg-[#0D121C] text-left flex flex-col justify-end min-h-[290px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            {!imgErrors.preview ? (
              <img
                src="/src/assets/images/studio_preview_frame_1795421850856.jpg"
                alt="Filmmaker at studio desk with broadcast microphone"
                referrerPolicy="no-referrer"
                onError={() => markImgError('preview')}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-black" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/55 to-black/20" />
            <div className="relative p-6 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <Hash className="w-4 h-4 text-rose-400" />
                <span>05. Captions & Tags</span>
              </div>
              <h4 className="font-display text-xl font-semibold text-white">
                Platform-native SEO & hashtags
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                Tailored copy for TikTok Search, Instagram Reels, and YouTube Studio tags.
              </p>
            </div>
          </button>
        </div>
      </section>
    </div>
  );
};
