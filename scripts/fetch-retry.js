// Keep retries inside the workflow's time budget and respect upstream cooldowns.
export async function fetchWithRetry(url, options = {}, {
  fetcher = globalThis.fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = Date.now,
  random = Math.random,
  budgetMs = 30_000,
} = {}) {
  const deadline = now() + budgetMs;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    const remaining = deadline - now();
    if (remaining <= 0) break;
    let response;
    try {
      response = await fetcher(url, {...options, signal: AbortSignal.timeout(Math.max(1, Math.min(10_000, remaining)))});
    } catch (error) {
      lastError = error;
    }
    if (response?.ok) return response;
    if (response) {
      lastError = new Error(`${url} returned ${response.status}`);
      await response.body?.cancel();
      if (![408, 429].includes(response.status) && response.status < 500) throw lastError;
    }
    if (attempt === 2) break;
    const header = response?.headers.get('retry-after');
    const seconds = header?.trim() ? Number(header) : NaN;
    const date = header && !Number.isFinite(seconds) ? Date.parse(header) : NaN;
    const backoff = 1_000 * 2 ** attempt + Math.floor(random() * 250);
    const wait = Math.max(backoff, Number.isFinite(seconds) ? seconds * 1_000 : Number.isFinite(date) ? date - now() : 0);
    // A long Retry-After belongs to a later scheduled run, not an early retry.
    if (wait >= deadline - now()) break;
    await sleep(wait);
  }
  throw lastError || new Error('Request retry budget exhausted');
}
