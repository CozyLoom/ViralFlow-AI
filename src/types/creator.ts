export type Platform = 'TikTok' | 'Instagram Reels' | 'YouTube Shorts' | 'YouTube Long-Form';

export type StudioModule =
  | 'overview'
  | 'hooks'
  | 'scripts'
  | 'captions'
  | 'subtitles'
  | 'clips'
  | 'subscription';

export interface HookItem {
  id: string;
  angle: string;
  spokenHook: string;
  onScreenText: string;
  visualDirection: string;
  targetPlatform: string;
  retentionTrigger: string;
  estimatedSeconds: number;
}

export interface HooksResponse {
  topicSummary: string;
  hooks: HookItem[];
}

export interface ScriptBeat {
  timestamp: string;
  section: string;
  spokenLine: string;
  visualAction: string;
  bRollCue: string;
}

export interface VideoScriptResponse {
  title: string;
  targetPlatform: string;
  estimatedDurationSec: number;
  hook: string;
  retentionLoop: string;
  beats: ScriptBeat[];
  callToAction: string;
  pacingNotes: string;
}

export interface CaptionsResponse {
  tiktok: {
    caption: string;
    seoKeywords: string[];
    hashtags: string[];
  };
  instagram: {
    firstLineHook: string;
    caption: string;
    hashtags: string[];
  };
  youtube: {
    title: string;
    description: string;
    tags: string[];
  };
}

export interface SubtitleCue {
  index: number;
  startTime: string; // HH:MM:SS,mmm or MM:SS.mmm
  endTime: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
  emphasisWords: string[];
}

export interface SubtitlesResponse {
  detectedLanguage: string;
  transcript: string;
  cues: SubtitleCue[];
}

export interface ShortClipSegment {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  startSeconds: number;
  endSeconds: number;
  durationSec: number;
  hookOverlay: string;
  transcriptExcerpt: string;
  whyItWorks: string;
  recommendedPlatforms: string[];
  suggestedCaption: string;
  hashtags: string[];
}

export interface ClipsResponse {
  sourceSummary: string;
  clips: ShortClipSegment[];
}

export interface SavedSessionItem {
  id: string;
  module: StudioModule;
  title: string;
  platform: string;
  createdAt: string;
  data: HooksResponse | VideoScriptResponse | CaptionsResponse | SubtitlesResponse | ClipsResponse;
}

export type PlanStatus = 'inactive' | 'active' | 'past_due' | 'canceled';

export interface BillingManagementUrls {
  updatePaymentMethod?: string | null;
  cancel?: string | null;
}

export interface BillingStatus {
  workspaceId: string;
  isSubscribed: boolean;
  planStatus: PlanStatus;
  customerEmail: string | null;
  paddleCustomerId?: string | null;
  paddleSubscriptionId?: string | null;
  lastTransactionId?: string | null;
  nextBilledAt?: string | null;
  cancelAt?: string | null;
  managementUrls?: BillingManagementUrls | null;
  updatedAt?: string;
  token?: string;
}

