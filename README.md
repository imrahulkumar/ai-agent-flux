# Flux Studio

Text-to-image app built with **React (Vite)** and a small **Express** API.

- **OpenAI** rewrites your rough idea into a detailed FLUX-friendly prompt (optional).
- **Krea API** generates the image with FLUX (`bfl/flux-1-dev` by default).

API keys stay on the server and are never sent to the browser.

## Setup

```bash
npm install
cp .env.example .env   # then fill in your keys
npm run dev            # API on :3001, web on http://localhost:5173
```

| Variable         | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `OPENAI_API_KEY` | Prompt enhancement (app still works without it)                         |
| `OPENAI_MODEL`   | Chat model used for enhancement (default `gpt-4o-mini`)                 |
| `KREA_API_TOKEN` | From https://www.krea.ai/settings/api-tokens                            |
| `KREA_MODEL`     | Path after `https://api.krea.ai/generate/image/` (default `bfl/flux-1-dev`) |

## Production

```bash
npm run build
npm start              # serves the built app + API on PORT
```

## How it works

1. `POST /api/generate` optionally calls OpenAI to enhance the prompt.
2. For each requested image it submits a Krea job (`POST /generate/image/{model}`),
   then polls `GET /jobs/{job_id}` every 2s until `completed`.
3. Image URLs are returned to the UI; history is kept in `localStorage`.
# ai-agent-flux
