/**
 * OpenRouter client for TabMate: chat completions, connection test, and model
 * list. The service worker is the only place these are invoked from — all
 * network access happens here so `lib/utils.js` stays chrome/DOM-free.
 */

import { CATEGORY_COLOURS } from './utils.js';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_ENDPOINT = 'https://openrouter.ai/api/v1/models';
const REQUEST_TIMEOUT_MS = 45 * 1000;

const SYSTEM_PROMPT = `You are TabMate's tab categorisation engine. You group open browser tabs into named categories.

Rules:
- Prefer an existing category from existingCategories whenever it fits. Invent a new category name only when no existing category fits.
- Use 2-8 categories for a typical window, 1 for a tiny window. Keep names short (at most 32 characters).
- colour must be exactly one of: ${CATEGORY_COLOURS.map((item) => item.value).join(', ')}.
- Every tab id from the input tabs must appear exactly once in assignments.
- New category names must not collide (case-insensitively) with existing category names.

Respond with JSON only, using this schema:
{
  "categories": [ { "name": "Coding", "colour": "green" } ],
  "assignments": [ { "id": "123", "category": "Coding" } ]
}`;

/**
 * Resolves the model id to send to OpenRouter, honouring the "custom" option.
 *
 * @param {import('./defaults.js').AiConfig} config
 * @returns {string}
 */
export function resolveModel(config) {
  return config.model === 'custom' && config.customModel ? config.customModel : config.model;
}

function headersFor(apiKey) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://tabmate.app',
    'X-OpenRouter-Title': 'TabMate',
  };
}

/**
 * @param {number} status
 * @returns {{ code: string, error: string }}
 */
function mapHttpError(status) {
  if (status === 401) return { code: 'unauthorized', error: 'Invalid OpenRouter API key.' };
  if (status === 402) return { code: 'insufficient-credits', error: 'This OpenRouter account has no credits left.' };
  if (status === 429) return { code: 'rate-limited', error: 'OpenRouter rate limit reached. Try again in a moment.' };
  return { code: 'http-error', error: `OpenRouter error (HTTP ${status}).` };
}

/**
 * Strips markdown code fences and parses the model's JSON response.
 *
 * @param {unknown} content
 * @returns {{ categories: { name: string, colour: string }[], assignments: { id: string, category: string }[] } | null}
 */
export function parseModelContent(content) {
  if (typeof content !== 'string') return null;
  let text = content.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data?.categories) && Array.isArray(data?.assignments)) return data;
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {string} apiKey
 * @param {string} model
 * @param {{ role: string, content: string }[]} messages
 * @param {{ responseFormat?: boolean, maxTokens?: number }} [options]
 * @returns {Promise<{ ok: boolean, content?: string, code?: string, error?: string }>}
 */
async function postChatCompletion(apiKey, model, messages, { responseFormat = true, maxTokens = 0 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const body = { model, temperature: 0.2, messages };
    if (responseFormat) body.response_format = { type: 'json_object' };
    if (maxTokens > 0) body.max_tokens = maxTokens;

    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: headersFor(apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) return { ok: false, ...mapHttpError(response.status) };

    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return { ok: false, code: 'bad-response', error: 'OpenRouter returned an unexpected response.' };
    }
    return { ok: true, content };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { ok: false, code: 'timeout', error: 'The request timed out after 45 seconds.' };
    }
    return { ok: false, code: 'network', error: 'Could not reach OpenRouter.' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Categorizes tabs with OpenRouter. Retries once with a "JSON only" follow-up
 * message when the first response cannot be parsed.
 *
 * @param {import('./defaults.js').AiConfig} config
 * @param {object} payload — buildCategorizePayload() output
 * @returns {Promise<{ ok: boolean, data?: { categories: object[], assignments: object[] }, code?: string, error?: string }>}
 */
export async function categorizeWithOpenRouter(config, payload) {
  const model = resolveModel(config);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify(payload) },
  ];

  const first = await postChatCompletion(config.apiKey, model, messages);
  if (!first.ok) return first;

  let data = parseModelContent(first.content);
  if (!data) {
    messages.push({ role: 'assistant', content: first.content });
    messages.push({
      role: 'user',
      content: 'Return only valid JSON matching the requested schema. No markdown fences, no commentary.',
    });
    const retry = await postChatCompletion(config.apiKey, model, messages);
    if (!retry.ok) return retry;
    data = parseModelContent(retry.content);
  }

  if (!data) {
    return { ok: false, code: 'bad-response', error: 'The model did not return valid JSON.' };
  }
  return { ok: true, data };
}

/**
 * Sends a tiny completion to verify the API key and model work.
 *
 * @param {import('./defaults.js').AiConfig} config
 * @returns {Promise<{ ok: boolean, code?: string, error?: string }>}
 */
export async function testOpenRouterConnection(config) {
  return postChatCompletion(config.apiKey, resolveModel(config), [{ role: 'user', content: 'ping' }], {
    responseFormat: false,
    maxTokens: 1,
  });
}

/**
 * Fetches OpenRouter's model catalogue.
 *
 * @param {string} apiKey
 * @returns {Promise<{ ok: boolean, models?: { id: string }[], error?: string }>}
 */
export async function listOpenRouterModels(apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_MODELS_ENDPOINT, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, error: `OpenRouter error (HTTP ${response.status}).` };

    const json = await response.json();
    const models = Array.isArray(json?.data)
      ? json.data.filter((item) => typeof item?.id === 'string' && item.id).map((item) => ({ id: item.id }))
      : [];
    return { ok: true, models };
  } catch (error) {
    if (error?.name === 'AbortError') return { ok: false, error: 'The request timed out.' };
    return { ok: false, error: 'Could not reach OpenRouter.' };
  } finally {
    clearTimeout(timer);
  }
}
