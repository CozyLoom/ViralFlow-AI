import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB limit for inline multimodal media
  },
});

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('MISSING_API_KEY: GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function handleApiError(res: Response, error: unknown, context: string) {
  console.error(`[ViralFlow API Error - ${context}]:`, error);
  const message = error instanceof Error ? error.message : 'Unexpected server error.';

  if (message.includes('MISSING_API_KEY')) {
    return res.status(500).json({
      error: 'Gemini API key is missing. Please add GEMINI_API_KEY in Settings > Secrets.',
    });
  }
  if (message.includes('403') || message.includes('PERMISSION_DENIED') || message.includes('API_KEY_INVALID')) {
    return res.status(403).json({
      error: 'Gemini API key was rejected. Please verify your key in Settings > Secrets.',
    });
  }
  if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
    return res.status(429).json({
      error: 'API rate limit or quota reached. Please wait a moment and try again.',
    });
  }
  if (message.includes('File too large') || message.includes('LIMIT_FILE_SIZE')) {
    return res.status(413).json({
      error: 'Uploaded media exceeds the 20 MB direct-upload limit. Please compress the file or paste the transcript text instead.',
    });
  }

  return res.status(500).json({
    error: `Failed to ${context}. ${message}`,
  });
}

function parseJsonSafe<T>(rawText: string | undefined, fallbackError: string): T {
  if (!rawText) {
    throw new Error(fallbackError);
  }
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned) as T;
}

// 1. Viral Video Hooks Generator
app.post('/api/generate/hooks', async (req: Request, res: Response) => {
  try {
    const { topic, platform, audience, tone, count = 6 } = req.body ?? {};
    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return res.status(400).json({ error: 'Please enter a video topic or idea.' });
    }

    const ai = getAiClient();
    const prompt = `You are a viral short-form video strategist for TikTok, Instagram Reels, and YouTube Shorts.
Generate ${Math.min(Math.max(Number(count) || 6, 3), 10)} distinct, scroll-stopping opening hooks (first 3 seconds) for this video idea:

Video Topic: ${topic.trim()}
Primary Platform: ${platform || 'TikTok'}
Target Audience: ${audience?.trim() || 'General creators & curious viewers'}
Tone / Style: ${tone || 'Direct & Punchy'}

Each hook must use a different psychological angle (e.g., Contrarian Truth, Curiosity Gap, Specific Mistake, Visual Pattern Interrupt, Relatable Confession, High-Stakes Result).
Keep spoken lines natural, punchy, and under 18 words so a creator can deliver them in 2–4 seconds.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topicSummary: { type: Type.STRING },
            hooks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  angle: { type: Type.STRING },
                  spokenHook: { type: Type.STRING },
                  onScreenText: { type: Type.STRING },
                  visualDirection: { type: Type.STRING },
                  targetPlatform: { type: Type.STRING },
                  retentionTrigger: { type: Type.STRING },
                  estimatedSeconds: { type: Type.NUMBER },
                },
                required: [
                  'id',
                  'angle',
                  'spokenHook',
                  'onScreenText',
                  'visualDirection',
                  'targetPlatform',
                  'retentionTrigger',
                  'estimatedSeconds',
                ],
              },
            },
          },
          required: ['topicSummary', 'hooks'],
        },
      },
    });

    const data = parseJsonSafe(response.text, 'No hook data returned from Gemini.');
    res.json(data);
  } catch (error) {
    handleApiError(res, error, 'generate viral hooks');
  }
});

// 2. Video Script Writer
app.post('/api/generate/script', async (req: Request, res: Response) => {
  try {
    const { topic, platform, durationSec = 45, tone, keyPoints } = req.body ?? {};
    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return res.status(400).json({ error: 'Please describe the video concept or title.' });
    }

    const ai = getAiClient();
    const targetDuration = Math.min(Math.max(Number(durationSec) || 45, 15), 600);
    const prompt = `You are an expert creator scriptwriter and director.
Write a complete, production-ready video script tailored for ${platform || 'TikTok'}.

Topic / Premise: ${topic.trim()}
Target Duration: ${targetDuration} seconds
Tone: ${tone || 'Conversational & High-Retention'}
Key Points to Cover: ${keyPoints?.trim() || 'Cover the sharpest insights, clear examples, and an engaging payoff.'}

Structure the script with exact timestamps (00:00, 00:03, etc.), a high-retention opening hook, a re-hook / retention loop, tightly paced body beats with explicit visual directions and B-roll cues, and a clear call to action.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            targetPlatform: { type: Type.STRING },
            estimatedDurationSec: { type: Type.NUMBER },
            hook: { type: Type.STRING },
            retentionLoop: { type: Type.STRING },
            beats: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  timestamp: { type: Type.STRING },
                  section: { type: Type.STRING },
                  spokenLine: { type: Type.STRING },
                  visualAction: { type: Type.STRING },
                  bRollCue: { type: Type.STRING },
                },
                required: ['timestamp', 'section', 'spokenLine', 'visualAction', 'bRollCue'],
              },
            },
            callToAction: { type: Type.STRING },
            pacingNotes: { type: Type.STRING },
          },
          required: [
            'title',
            'targetPlatform',
            'estimatedDurationSec',
            'hook',
            'retentionLoop',
            'beats',
            'callToAction',
            'pacingNotes',
          ],
        },
      },
    });

    const data = parseJsonSafe(response.text, 'No script returned from Gemini.');
    res.json(data);
  } catch (error) {
    handleApiError(res, error, 'create video script');
  }
});

// 3. Captions & Hashtags Generator
app.post('/api/generate/captions', async (req: Request, res: Response) => {
  try {
    const { videoSummary, niche, goal, cta } = req.body ?? {};
    if (!videoSummary || typeof videoSummary !== 'string' || !videoSummary.trim()) {
      return res.status(400).json({ error: 'Please provide a summary or transcript of your video.' });
    }

    const ai = getAiClient();
    const prompt = `You are a cross-platform social media growth strategist.
Write optimized captions, titles, SEO keywords, and strategic hashtags for TikTok, Instagram Reels, and YouTube based on this video:

Video Summary / Transcript: ${videoSummary.trim()}
Creator Niche: ${niche?.trim() || 'Creator Education & Storytelling'}
Post Goal: ${goal || 'Maximize saves, shares, and comments'}
Desired Call-to-Action: ${cta?.trim() || 'Encourage comments or saves'}

Rules:
- TikTok: punchy search-optimized caption + 4–6 targeted hashtags (mix of niche and broad) + SEO keywords.
- Instagram Reels: scroll-stopping first-line hook before the fold, engaging body caption, and 6–10 curated hashtags.
- YouTube Shorts / Video: clickable title under 65 characters, rich SEO description with natural keywords, and comma-ready video tags.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tiktok: {
              type: Type.OBJECT,
              properties: {
                caption: { type: Type.STRING },
                seoKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['caption', 'seoKeywords', 'hashtags'],
            },
            instagram: {
              type: Type.OBJECT,
              properties: {
                firstLineHook: { type: Type.STRING },
                caption: { type: Type.STRING },
                hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['firstLineHook', 'caption', 'hashtags'],
            },
            youtube: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['title', 'description', 'tags'],
            },
          },
          required: ['tiktok', 'instagram', 'youtube'],
        },
      },
    });

    const data = parseJsonSafe(response.text, 'No captions returned from Gemini.');
    res.json(data);
  } catch (error) {
    handleApiError(res, error, 'generate captions and hashtags');
  }
});

// 4. Subtitle Generator (supports uploaded audio/video file OR pasted transcript/script)
app.post('/api/generate/subtitles', upload.single('media'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { transcriptText, durationSec = 45, maxWordsPerCue = 6, language = 'English' } = req.body ?? {};

    if (!file && (!transcriptText || typeof transcriptText !== 'string' || !transcriptText.trim())) {
      return res.status(400).json({
        error: 'Upload a video/audio file or paste your spoken script/transcript to generate subtitles.',
      });
    }

    const ai = getAiClient();
    const wordsLimit = Math.min(Math.max(Number(maxWordsPerCue) || 6, 3), 12);

    let sourceTranscript = transcriptText?.trim() || '';

    // If audio file is uploaded, transcribe cleanly with gemini-3.5-transcribe first when audio/*
    if (file && file.mimetype.startsWith('audio/')) {
      const transcribeRes = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: file.mimetype,
                data: file.buffer.toString('base64'),
              },
            },
            {
              text: `Transcribe this audio verbatim in ${language}, including natural sentence punctuation.`,
            },
          ],
        },
      });
      if (transcribeRes.text) {
        sourceTranscript = transcribeRes.text.trim();
      }
    }

    const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];

    if (file && file.mimetype.startsWith('video/')) {
      parts.push({
        inlineData: {
          mimeType: file.mimetype,
          data: file.buffer.toString('base64'),
        },
      });
    } else if (file && file.mimetype.startsWith('audio/') && !sourceTranscript) {
      parts.push({
        inlineData: {
          mimeType: file.mimetype,
          data: file.buffer.toString('base64'),
        },
      });
    }

    const instructionText = file
      ? `Analyze the uploaded media${sourceTranscript ? ` and its verbatim transcript below` : ''} and generate perfectly timed short-form subtitle cues in ${language}.
${sourceTranscript ? `Transcript:\n${sourceTranscript}\n` : ''}
Requirements:
- Keep each subtitle cue concise (${wordsLimit} words max per cue) for crisp vertical video readability.
- Provide exact startTime and endTime formatted as "00:00:01,200" (SRT format HH:MM:SS,mmm) plus numeric startSeconds and endSeconds.
- Ensure cues are strictly sequential and non-overlapping.
- Identify 1-2 high-impact emphasisWords per cue that should be highlighted visually.`
      : `Convert the following spoken script/transcript into timed short-form subtitle cues in ${language} across a ${Number(durationSec) || 45}-second speaking cadence (~145 words/minute).

Transcript:
${sourceTranscript}

Requirements:
- Keep each subtitle cue concise (${wordsLimit} words max per cue) for crisp vertical video readability.
- Format startTime and endTime as "00:00:01,200" (SRT format HH:MM:SS,mmm) plus numeric startSeconds and endSeconds.
- Ensure cues are strictly sequential and non-overlapping.
- Identify 1-2 high-impact emphasisWords per cue that should be highlighted visually.`;

    parts.push({ text: instructionText });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedLanguage: { type: Type.STRING },
            transcript: { type: Type.STRING },
            cues: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  index: { type: Type.INTEGER },
                  startTime: { type: Type.STRING },
                  endTime: { type: Type.STRING },
                  startSeconds: { type: Type.NUMBER },
                  endSeconds: { type: Type.NUMBER },
                  text: { type: Type.STRING },
                  emphasisWords: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: [
                  'index',
                  'startTime',
                  'endTime',
                  'startSeconds',
                  'endSeconds',
                  'text',
                  'emphasisWords',
                ],
              },
            },
          },
          required: ['detectedLanguage', 'transcript', 'cues'],
        },
      },
    });

    const data = parseJsonSafe(response.text, 'No subtitle cues returned from Gemini.');
    res.json(data);
  } catch (error) {
    handleApiError(res, error, 'generate subtitles');
  }
});

// 5. Long-to-Short Clip Repurposer (supports uploaded video/audio OR long-form transcript/outline)
app.post('/api/generate/clips', upload.single('media'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const {
      sourceText,
      totalDurationMinutes = 12,
      targetClipCount = 4,
      platforms = 'TikTok, Instagram Reels, YouTube Shorts',
    } = req.body ?? {};

    if (!file && (!sourceText || typeof sourceText !== 'string' || !sourceText.trim())) {
      return res.status(400).json({
        error: 'Upload a video/audio file or paste a long-form video transcript/outline to extract short clips.',
      });
    }

    const ai = getAiClient();
    const clipCount = Math.min(Math.max(Number(targetClipCount) || 4, 2), 8);

    const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];
    if (file) {
      parts.push({
        inlineData: {
          mimeType: file.mimetype,
          data: file.buffer.toString('base64'),
        },
      });
    }

    parts.push({
      text: `You are a viral short-form video editor repurposing a long-form video into ${clipCount} high-retention vertical clips for ${platforms}.
${file ? 'Analyze the uploaded media directly and extract the strongest standalone moments.' : `Analyze this long-form video transcript / outline (estimated total length: ${totalDurationMinutes} minutes):\n\n${sourceText.trim()}`}

For each extracted clip:
- Choose a self-contained segment between 20 and 58 seconds long that has a clear beginning, insight/story arc, and payoff.
- Provide accurate startTime and endTime ("MM:SS") along with numeric startSeconds and endSeconds.
- Write a bold, curiosity-driven hookOverlay (max 8 words) to display over the first 3 seconds of the 9:16 vertical frame.
- Provide the exact or tightly edited transcriptExcerpt for the clip, explain whyItWorks for short-form retention, recommend target platforms, and draft a ready-to-post suggestedCaption with 4–5 hashtags.`,
    });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sourceSummary: { type: Type.STRING },
            clips: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  startTime: { type: Type.STRING },
                  endTime: { type: Type.STRING },
                  startSeconds: { type: Type.NUMBER },
                  endSeconds: { type: Type.NUMBER },
                  durationSec: { type: Type.NUMBER },
                  hookOverlay: { type: Type.STRING },
                  transcriptExcerpt: { type: Type.STRING },
                  whyItWorks: { type: Type.STRING },
                  recommendedPlatforms: { type: Type.ARRAY, items: { type: Type.STRING } },
                  suggestedCaption: { type: Type.STRING },
                  hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: [
                  'id',
                  'title',
                  'startTime',
                  'endTime',
                  'startSeconds',
                  'endSeconds',
                  'durationSec',
                  'hookOverlay',
                  'transcriptExcerpt',
                  'whyItWorks',
                  'recommendedPlatforms',
                  'suggestedCaption',
                  'hashtags',
                ],
              },
            },
          },
          required: ['sourceSummary', 'clips'],
        },
      },
    });

    const data = parseJsonSafe(response.text, 'No short clips returned from Gemini.');
    res.json(data);
  } catch (error) {
    handleApiError(res, error, 'extract short clips');
  }
});

// Multer error middleware
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    return res.status(413).json({
      error: `Upload error: ${err.message}. Maximum direct file upload size is 20 MB.`,
    });
  }
  next(err);
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ViralFlow AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
