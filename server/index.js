import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import OpenAI from 'openai';

const {
  OPENAI_API_KEY,
  OPENAI_MODEL = 'gpt-4o-mini',
  KREA_API_TOKEN,
  KREA_MODEL = 'bfl/flux-1-dev',
  PORT = 3001,
} = process.env;

const KREA_BASE = 'https://api.krea.ai';
const POLL_INTERVAL_MS = 2000;
const JOB_TIMEOUT_MS = 3 * 60 * 1000;

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const app = express();
app.use(express.json({ limit: '1mb' }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- OpenAI: prompt enhancement ----------

const ENHANCER_INSTRUCTIONS = `You are a prompt engineer for the FLUX text-to-image model.
Rewrite the user's idea into a single vivid image prompt (max ~80 words).
Describe subject, setting, composition, lighting, color palette, lens/medium and mood.
Keep every concrete detail the user gave. Do not add text/watermarks unless asked.
Return only the prompt, no quotes or preamble.`;

async function enhancePrompt(prompt, style) {
  if (!openai) throw new HttpError(400, 'OPENAI_API_KEY is not configured');
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.8,
    messages: [
      { role: 'system', content: ENHANCER_INSTRUCTIONS },
      { role: 'user', content: style ? `${prompt}\n\nStyle: ${style}` : prompt },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() || prompt;
}

// ---------- Krea: image generation ----------

async function krea(pathname, init = {}) {
  if (!KREA_API_TOKEN) throw new HttpError(400, 'KREA_API_TOKEN is not configured');
  const res = await fetch(`${KREA_BASE}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KREA_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error?.message || body.message || body.error || res.statusText;
    throw new HttpError(res.status, `Krea API: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  return body;
}

async function generateImage({ prompt, width, height, steps, seed }) {
  const job = await krea(`/generate/image/${KREA_MODEL}`, {
    method: 'POST',
    body: JSON.stringify({ prompt, width, height, steps, ...(seed != null && { seed: String(seed) }) }),
  });

  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const status = await krea(`/jobs/${job.job_id}`);
    if (status.status === 'completed') {
      const url = status.result?.urls?.[0];
      if (!url) throw new HttpError(502, 'Krea job completed without an image URL');
      return { url, jobId: job.job_id, seed };
    }
    if (status.status === 'failed' || status.status === 'cancelled') {
      throw new HttpError(502, `Krea job ${status.status}${status.error ? `: ${status.error}` : ''}`);
    }
  }
  throw new HttpError(504, 'Timed out waiting for Krea to finish the image');
}

// ---------- Routes ----------

const clamp = (n, min, max, fallback) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
};

app.get('/api/health', (_req, res) => {
  res.json({ openai: Boolean(openai), krea: Boolean(KREA_API_TOKEN), model: KREA_MODEL });
});

app.post('/api/enhance', async (req, res, next) => {
  try {
    const prompt = String(req.body.prompt || '').trim();
    if (!prompt) throw new HttpError(400, 'Prompt is required');
    res.json({ prompt: await enhancePrompt(prompt, req.body.style) });
  } catch (err) {
    next(err);
  }
});

app.post('/api/generate', async (req, res, next) => {
  try {
    const prompt = String(req.body.prompt || '').trim();
    if (!prompt) throw new HttpError(400, 'Prompt is required');

    const width = clamp(req.body.width, 256, 2048, 1024);
    const height = clamp(req.body.height, 256, 2048, 1024);
    const steps = clamp(req.body.steps, 1, 50, 28);
    const count = clamp(req.body.count, 1, 4, 1);
    const baseSeed = req.body.seed === '' || req.body.seed == null ? null : clamp(req.body.seed, 0, 2 ** 31 - 1, null);

    const finalPrompt = req.body.enhance ? await enhancePrompt(prompt, req.body.style) : prompt;

    // Krea returns one image per job, so fan out one job per requested image.
    const images = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        generateImage({
          prompt: finalPrompt,
          width,
          height,
          steps,
          seed: baseSeed == null ? Math.floor(Math.random() * 2 ** 31) : baseSeed + i,
        }),
      ),
    );

    res.json({ prompt: finalPrompt, originalPrompt: prompt, width, height, steps, images });
  } catch (err) {
    next(err);
  }
});

// Serve the built React app in production.
if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  if (!openai) console.warn('  ⚠ OPENAI_API_KEY missing — prompt enhancement disabled');
  if (!KREA_API_TOKEN) console.warn('  ⚠ KREA_API_TOKEN missing — image generation disabled');
});
