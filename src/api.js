async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const getHealth = () => request('/health');

export const enhancePrompt = (prompt, style) =>
  request('/enhance', { method: 'POST', body: JSON.stringify({ prompt, style }) });

export const generateImages = (params) =>
  request('/generate', { method: 'POST', body: JSON.stringify(params) });
