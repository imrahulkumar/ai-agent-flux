import { useEffect, useState } from 'react';
import { enhancePrompt, generateImages, getHealth } from './api.js';

const ASPECTS = [
  { label: '1:1', width: 1024, height: 1024 },
  { label: '16:9', width: 1344, height: 768 },
  { label: '9:16', width: 768, height: 1344 },
  { label: '4:3', width: 1152, height: 896 },
  { label: '3:4', width: 896, height: 1152 },
];

const STYLES = ['None', 'Photorealistic', 'Cinematic', 'Anime', 'Digital art', 'Watercolor', '3D render', 'Pixel art'];

const HISTORY_KEY = 'flux-studio-history';
const MAX_HISTORY = 40;

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('None');
  const [aspect, setAspect] = useState(ASPECTS[0]);
  const [steps, setSteps] = useState(28);
  const [count, setCount] = useState(1);
  const [seed, setSeed] = useState('');
  const [autoEnhance, setAutoEnhance] = useState(true);

  const [enhancing, setEnhancing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState(loadHistory);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth({ openai: false, krea: false }));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
    } catch {
      /* storage unavailable */
    }
  }, [history]);

  const styleHint = style === 'None' ? undefined : style;
  const busy = enhancing || generating;

  async function handleEnhance() {
    if (!prompt.trim()) return;
    setError('');
    setEnhancing(true);
    try {
      const { prompt: improved } = await enhancePrompt(prompt, styleHint);
      setPrompt(improved);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnhancing(false);
    }
  }

  async function handleGenerate(e) {
    e?.preventDefault();
    if (!prompt.trim() || busy) return;
    setError('');
    setGenerating(true);
    setCurrent({ pending: count, aspect });
    try {
      const result = await generateImages({
        prompt,
        style: styleHint,
        enhance: autoEnhance && health?.openai,
        width: aspect.width,
        height: aspect.height,
        steps,
        count,
        seed,
      });
      const entry = { id: crypto.randomUUID(), createdAt: Date.now(), aspect: aspect.label, ...result };
      setCurrent(entry);
      setHistory((h) => [entry, ...h].slice(0, MAX_HISTORY));
    } catch (err) {
      setError(err.message);
      setCurrent(null);
    } finally {
      setGenerating(false);
    }
  }

  function reuse(entry) {
    setPrompt(entry.prompt);
    setAspect(ASPECTS.find((a) => a.label === entry.aspect) || ASPECTS[0]);
    setSteps(entry.steps);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="logo">✦</span>
          <div>
            <h1>Flux Studio</h1>
            <p>OpenAI prompt craft · Krea FLUX image generation</p>
          </div>
        </div>
        {health && (
          <div className="status">
            <StatusPill ok={health.openai} label="OpenAI" />
            <StatusPill ok={health.krea} label={`Krea${health.model ? ` · ${health.model}` : ''}`} />
          </div>
        )}
      </header>

      <main className="layout">
        <form className="panel controls" onSubmit={handleGenerate}>
          <label className="field">
            <span>Prompt</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate(e);
              }}
              placeholder="A lighthouse on a cliff during a thunderstorm, waves crashing…"
              rows={6}
            />
          </label>

          <button
            type="button"
            className="btn ghost"
            onClick={handleEnhance}
            disabled={!prompt.trim() || busy || !health?.openai}
            title={health?.openai ? 'Rewrite the prompt with OpenAI' : 'Set OPENAI_API_KEY to enable'}
          >
            {enhancing ? <Spinner /> : '✨'} Enhance prompt with OpenAI
          </button>

          <div className="field">
            <span>Style</span>
            <div className="chips">
              {STYLES.map((s) => (
                <button type="button" key={s} className={`chip ${style === s ? 'active' : ''}`} onClick={() => setStyle(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>Aspect ratio</span>
            <div className="chips">
              {ASPECTS.map((a) => (
                <button
                  type="button"
                  key={a.label}
                  className={`chip ${aspect.label === a.label ? 'active' : ''}`}
                  onClick={() => setAspect(a)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <label className="field">
              <span>Steps · {steps}</span>
              <input type="range" min={4} max={50} value={steps} onChange={(e) => setSteps(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Images · {count}</span>
              <input type="range" min={1} max={4} value={count} onChange={(e) => setCount(Number(e.target.value))} />
            </label>
          </div>

          <label className="field">
            <span>Seed (optional)</span>
            <input
              type="number"
              min={0}
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="Random"
            />
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={autoEnhance && Boolean(health?.openai)}
              disabled={!health?.openai}
              onChange={(e) => setAutoEnhance(e.target.checked)}
            />
            <span>Auto-enhance prompt before generating</span>
          </label>

          <button type="submit" className="btn primary" disabled={!prompt.trim() || busy || !health?.krea}>
            {generating ? (
              <>
                <Spinner /> Generating…
              </>
            ) : (
              'Generate'
            )}
          </button>
          <p className="hint">⌘/Ctrl + Enter to generate</p>

          {error && <div className="error">{error}</div>}
        </form>

        <section className="results">
          {!current && !history.length && (
            <div className="panel empty">
              <span className="logo big">✦</span>
              <p>Describe an image and hit Generate. Your creations will appear here.</p>
            </div>
          )}

          {current && (
            <div className="panel">
              {current.pending ? (
                <div className="grid">
                  {Array.from({ length: current.pending }, (_, i) => (
                    <div
                      key={i}
                      className="skeleton"
                      style={{ aspectRatio: `${current.aspect.width} / ${current.aspect.height}` }}
                    />
                  ))}
                </div>
              ) : (
                <>
                  {current.prompt !== current.originalPrompt && (
                    <details className="prompt-used">
                      <summary>Enhanced prompt used</summary>
                      <p>{current.prompt}</p>
                    </details>
                  )}
                  <div className="grid">
                    {current.images.map((img) => (
                      <ImageCard key={img.jobId} img={img} entry={current} onOpen={setLightbox} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {history.length > 0 && (
            <div className="panel">
              <div className="history-head">
                <h2>History</h2>
                <button type="button" className="btn ghost small" onClick={() => setHistory([])}>
                  Clear
                </button>
              </div>
              <div className="history">
                {history.flatMap((entry) =>
                  entry.images.map((img) => (
                    <button
                      type="button"
                      key={img.jobId}
                      className="thumb"
                      onClick={() => setLightbox({ img, entry })}
                      title={entry.prompt}
                    >
                      <img src={img.url} alt={entry.prompt} loading="lazy" />
                    </button>
                  )),
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.img.url} alt={lightbox.entry.prompt} />
            <div className="lightbox-meta">
              <p>{lightbox.entry.prompt}</p>
              <small>
                {lightbox.entry.width}×{lightbox.entry.height} · {lightbox.entry.steps} steps · seed {lightbox.img.seed}
              </small>
              <div className="actions">
                <a className="btn ghost small" href={lightbox.img.url} target="_blank" rel="noreferrer">
                  Open full size
                </a>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => {
                    reuse(lightbox.entry);
                    setSeed(String(lightbox.img.seed));
                    setLightbox(null);
                  }}
                >
                  Reuse settings
                </button>
                <button type="button" className="btn ghost small" onClick={() => setLightbox(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageCard({ img, entry, onOpen }) {
  return (
    <figure className="card" onClick={() => onOpen({ img, entry })}>
      <img src={img.url} alt={entry.prompt} />
      <figcaption>seed {img.seed}</figcaption>
    </figure>
  );
}

function StatusPill({ ok, label }) {
  return <span className={`pill ${ok ? 'ok' : 'off'}`}>{label}</span>;
}

function Spinner() {
  return <span className="spinner" aria-hidden />;
}
