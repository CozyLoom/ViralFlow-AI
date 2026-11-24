import React, { useState, useEffect } from 'react';
import {
  LayoutGrid,
  Zap,
  FileText,
  Hash,
  Captions,
  Scissors,
  Menu,
  X,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  CaptionsResponse,
  ClipsResponse,
  HookItem,
  HooksResponse,
  Platform,
  SavedSessionItem,
  StudioModule,
  SubtitlesResponse,
  VideoScriptResponse,
} from './types/creator';
import { StudioOverview } from './components/StudioOverview';
import { HooksStudio } from './components/HooksStudio';
import { ScriptsStudio } from './components/ScriptsStudio';
import { CaptionsStudio } from './components/CaptionsStudio';
import { SubtitlesStudio } from './components/SubtitlesStudio';
import { ClipsStudio } from './components/ClipsStudio';

const STORAGE_KEY = 'viralflow_session_history_v1';

const NAV_ITEMS: Array<{
  id: StudioModule;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Studio Overview', subtitle: '4K suites & quick launch', icon: LayoutGrid },
  { id: 'hooks', label: 'Viral Hooks', subtitle: 'First 3-second openers', icon: Zap },
  { id: 'scripts', label: 'Video Scripts', subtitle: 'Beat-by-beat & teleprompter', icon: FileText },
  { id: 'captions', label: 'Captions & Tags', subtitle: 'TikTok, Reels & YouTube SEO', icon: Hash },
  { id: 'subtitles', label: 'Subtitle Studio', subtitle: 'Timed cues, .SRT & .VTT', icon: Captions },
  { id: 'clips', label: 'Short Clips', subtitle: 'Long-to-short repurposer', icon: Scissors },
];

export default function App() {
  const [activeModule, setActiveModule] = useState<StudioModule>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  // Module results state
  const [hooksResult, setHooksResult] = useState<HooksResponse | null>(null);
  const [scriptResult, setScriptResult] = useState<VideoScriptResponse | null>(null);
  const [captionsResult, setCaptionsResult] = useState<CaptionsResponse | null>(null);
  const [subtitlesResult, setSubtitlesResult] = useState<SubtitlesResponse | null>(null);
  const [clipsResult, setClipsResult] = useState<ClipsResponse | null>(null);

  // Cross-module handoff state
  const [hookDraftTopic, setHookDraftTopic] = useState('');
  const [hookDraftPlatform, setHookDraftPlatform] = useState<Platform>('TikTok');
  const [scriptDraftTopic, setScriptDraftTopic] = useState('');
  const [scriptDraftPlatform, setScriptDraftPlatform] = useState<Platform>('TikTok');
  const [scriptDraftKeyPoints, setScriptDraftKeyPoints] = useState('');
  const [captionDraftSummary, setCaptionDraftSummary] = useState('');
  const [subtitleDraftTranscript, setSubtitleDraftTranscript] = useState('');
  const [subtitleDraftDuration, setSubtitleDraftDuration] = useState(45);

  // Saved session history
  const [history, setHistory] = useState<SavedSessionItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as SavedSessionItem[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 12)));
    } catch {
      // Ignore storage quota errors
    }
  }, [history]);

  const recordHistory = (
    module: StudioModule,
    title: string,
    platform: string,
    data: SavedSessionItem['data']
  ) => {
    const entry: SavedSessionItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      module,
      title: title || 'Untitled Project',
      platform,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      data,
    };
    setHistory((prev) => [entry, ...prev].slice(0, 12));
  };

  const loadHistoryItem = (item: SavedSessionItem) => {
    setActiveModule(item.module);
    if (item.module === 'hooks') setHooksResult(item.data as HooksResponse);
    if (item.module === 'scripts') setScriptResult(item.data as VideoScriptResponse);
    if (item.module === 'captions') setCaptionsResult(item.data as CaptionsResponse);
    if (item.module === 'subtitles') setSubtitlesResult(item.data as SubtitlesResponse);
    if (item.module === 'clips') setClipsResult(item.data as ClipsResponse);
    setMobileMenuOpen(false);
  };

  const handleResetActiveDraft = () => {
    if (activeModule === 'overview') {
      setActiveModule('hooks');
      return;
    }
    if (activeModule === 'hooks') {
      setHooksResult(null);
      setHookDraftTopic('');
    }
    if (activeModule === 'scripts') {
      setScriptResult(null);
      setScriptDraftTopic('');
      setScriptDraftKeyPoints('');
    }
    if (activeModule === 'captions') {
      setCaptionsResult(null);
      setCaptionDraftSummary('');
    }
    if (activeModule === 'subtitles') {
      setSubtitlesResult(null);
      setSubtitleDraftTranscript('');
    }
    if (activeModule === 'clips') setClipsResult(null);
  };

  const activeNav = NAV_ITEMS.find((n) => n.id === activeModule) || NAV_ITEMS[0];

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-[#0B0F19] border-r border-white/10">
      {/* Brand Zone */}
      <div className="h-[68px] px-6 flex items-center justify-between border-b border-white/10 shrink-0">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveModule('overview');
          }}
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          ViralFlow AI
        </a>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1.5 text-slate-400 hover:text-white"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Primary Tools Navigation */}
      <div className="px-3 py-5 flex-1 overflow-y-auto space-y-6">
        <nav aria-label="Creator tools" className="space-y-1">
          <span className="block px-3 pb-2 text-xs font-medium text-slate-400">
            Production Workspace
          </span>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveModule(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  isActive
                    ? 'bg-rose-500/15 text-rose-300'
                    : 'text-slate-200 hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-rose-400' : 'text-slate-400'
                  }`}
                />
                <div className="min-w-0">
                  <span className="block text-sm font-medium leading-tight whitespace-nowrap truncate">
                    {item.label}
                  </span>
                  <span
                    className={`block text-[13px] truncate mt-0.5 ${
                      isActive ? 'text-rose-200/75' : 'text-slate-400'
                    }`}
                  >
                    {item.subtitle}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Recent Creations */}
        <div className="pt-4 border-t border-white/10">
          <div className="px-3 pb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Recent Drafts</span>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setHistory([])}
                className="text-xs text-slate-400 hover:text-slate-200"
                aria-label="Clear recent drafts"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {history.length > 0 ? (
            <div className="space-y-1">
              {history.slice(0, 6).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => loadHistoryItem(item)}
                  className="w-full px-3 py-2 rounded-lg text-left hover:bg-white/[0.05] transition-colors"
                >
                  <span className="block text-xs font-medium text-slate-200 truncate">
                    {item.title}
                  </span>
                  <span className="block text-[13px] text-slate-400 truncate tabular-nums">
                    {NAV_ITEMS.find((n) => n.id === item.module)?.label} · {item.createdAt}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="px-3 text-xs text-slate-400 leading-relaxed">
              Generated hooks, scripts, subtitles, and clips appear here.
            </p>
          )}
        </div>
      </div>

      {/* Creator Workspace Footer */}
      <div className="p-4 border-t border-white/10 flex items-center gap-3 shrink-0">
        {!avatarError ? (
          <img
            src="/src/assets/images/creator_avatar_1795421850716.jpg"
            alt="Creator workspace profile"
            referrerPolicy="no-referrer"
            onError={() => setAvatarError(true)}
            className="w-9 h-9 rounded-full object-cover border border-white/15 shrink-0"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-slate-800 text-slate-200 text-xs font-semibold flex items-center justify-center shrink-0">
            VF
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-100 truncate">Creator Studio</p>
          <p className="text-[13px] text-slate-400 truncate">TikTok · Reels · Shorts</p>
        </div>
      </div>
    </div>
  );

  return (
    <div id="top" className="min-h-screen flex bg-[#070A10] text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[276px] shrink-0 sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/75"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="h-[68px] px-4 sm:px-8 bg-[#0B0F19]/95 backdrop-blur-sm border-b border-white/10 flex items-center justify-between gap-8 shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-300 hover:text-white"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <button
                type="button"
                onClick={() => setActiveModule('overview')}
                className="text-slate-400 hover:text-white hidden sm:inline whitespace-nowrap shrink-0 transition-colors"
              >
                Studio
              </button>
              <span className="text-slate-600 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-display text-base sm:text-lg font-semibold text-white truncate">
                {activeNav.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleResetActiveDraft}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              {activeModule === 'overview' ? 'New Project' : 'New Draft'}
            </button>
          </div>
        </header>

        {/* Active Module Viewport */}
        <main className="flex-1 p-4 sm:p-8 max-w-[1440px] w-full mx-auto">
          {activeModule === 'overview' && (
            <StudioOverview
              onSelectModule={(mod) => setActiveModule(mod)}
              onQuickLaunchHooks={(topic, platform) => {
                setHookDraftTopic(topic);
                setHookDraftPlatform(platform);
                setActiveModule('hooks');
              }}
            />
          )}

          {activeModule === 'hooks' && (
            <HooksStudio
              initialTopic={hookDraftTopic}
              initialPlatform={hookDraftPlatform}
              result={hooksResult}
              onResult={(data, title, platform) => {
                setHooksResult(data);
                recordHistory('hooks', title, platform, data);
              }}
              onSendToScript={(hook: HookItem, topic: string, platform: Platform) => {
                setScriptDraftTopic(topic);
                setScriptDraftPlatform(platform);
                setScriptDraftKeyPoints(
                  `Opening Hook: "${hook.spokenHook}"\nOn-Screen Text: ${hook.onScreenText}\nVisual Direction: ${hook.visualDirection}`
                );
                setActiveModule('scripts');
              }}
            />
          )}

          {activeModule === 'scripts' && (
            <ScriptsStudio
              initialTopic={scriptDraftTopic}
              initialPlatform={scriptDraftPlatform}
              initialKeyPoints={scriptDraftKeyPoints}
              result={scriptResult}
              onResult={(data, title, platform) => {
                setScriptResult(data);
                recordHistory('scripts', title, platform, data);
              }}
              onSendToCaptions={(summary) => {
                setCaptionDraftSummary(summary);
                setActiveModule('captions');
              }}
              onSendToSubtitles={(transcript, duration) => {
                setSubtitleDraftTranscript(transcript);
                setSubtitleDraftDuration(duration);
                setActiveModule('subtitles');
              }}
            />
          )}

          {activeModule === 'captions' && (
            <CaptionsStudio
              initialSummary={captionDraftSummary}
              result={captionsResult}
              onResult={(data, title, platform) => {
                setCaptionsResult(data);
                recordHistory('captions', title, platform, data);
              }}
            />
          )}

          {activeModule === 'subtitles' && (
            <SubtitlesStudio
              initialTranscript={subtitleDraftTranscript}
              initialDurationSec={subtitleDraftDuration}
              result={subtitlesResult}
              onResult={(data, title, platform) => {
                setSubtitlesResult(data);
                recordHistory('subtitles', title, platform, data);
              }}
            />
          )}

          {activeModule === 'clips' && (
            <ClipsStudio
              result={clipsResult}
              onResult={(data, title, platform) => {
                setClipsResult(data);
                recordHistory('clips', title, platform, data);
              }}
              onSendToCaptions={(summary) => {
                setCaptionDraftSummary(summary);
                setActiveModule('captions');
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
