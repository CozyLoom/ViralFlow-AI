import { SubtitleCue, ShortClipSegment, VideoScriptResponse } from '../types/creator';

export function buildSrtContent(cues: SubtitleCue[]): string {
  return cues
    .map((cue, idx) => {
      const start = cue.startTime.includes(',') ? cue.startTime : formatSecondsToSrt(cue.startSeconds);
      const end = cue.endTime.includes(',') ? cue.endTime : formatSecondsToSrt(cue.endSeconds);
      return `${idx + 1}\n${start} --> ${end}\n${cue.text}\n`;
    })
    .join('\n');
}

export function buildVttContent(cues: SubtitleCue[]): string {
  const body = cues
    .map((cue, idx) => {
      const start = formatSecondsToVtt(cue.startSeconds);
      const end = formatSecondsToVtt(cue.endSeconds);
      return `${idx + 1}\n${start} --> ${end}\n${cue.text}\n`;
    })
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

export function formatSecondsToSrt(totalSeconds: number): string {
  const safe = Math.max(0, Number.isFinite(totalSeconds) ? totalSeconds : 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function formatSecondsToVtt(totalSeconds: number): string {
  return formatSecondsToSrt(totalSeconds).replace(',', '.');
}

export function formatMinutesSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function downloadTextFile(filename: string, content: string, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function formatScriptForClipboard(script: VideoScriptResponse): string {
  const lines: string[] = [
    `TITLE: ${script.title}`,
    `PLATFORM: ${script.targetPlatform} · EST. DURATION: ${script.estimatedDurationSec}s`,
    '',
    `OPENING HOOK: ${script.hook}`,
    `RETENTION LOOP: ${script.retentionLoop}`,
    '',
    'BEAT-BY-BEAT SCRIPT:',
    ...script.beats.map(
      (b) =>
        `[${b.timestamp}] (${b.section})\nSpoken: ${b.spokenLine}\nVisual: ${b.visualAction}\nB-Roll: ${b.bRollCue}\n`
    ),
    `CALL TO ACTION: ${script.callToAction}`,
    `PACING NOTES: ${script.pacingNotes}`,
  ];
  return lines.join('\n');
}

export function formatClipsBrief(clips: ShortClipSegment[], sourceSummary: string): string {
  const header = `VIRALFLOW AI — SHORT CLIPS EXPORT\nSummary: ${sourceSummary}\n\n`;
  const body = clips
    .map(
      (c, i) =>
        `CLIP ${i + 1}: ${c.title}\nTimecode: ${c.startTime} - ${c.endTime} (${c.durationSec}s)\nPlatforms: ${c.recommendedPlatforms.join(', ')}\nHook Overlay: ${c.hookOverlay}\nExcerpt: ${c.transcriptExcerpt}\nWhy It Works: ${c.whyItWorks}\nCaption: ${c.suggestedCaption} ${c.hashtags.join(' ')}\n`
    )
    .join('\n----------------------------------------\n\n');
  return header + body;
}
