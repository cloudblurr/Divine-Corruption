// utils/puter.js - Puter/OpenAI-compatible adapter for xAI Grok models.

export const PUTER_MODEL_PREFIX = 'puter:';
export const DEFAULT_PUTER_ENDPOINT = '/puter';
export const DEFAULT_PUTER_MODEL = 'grok-4-1-fast-non-reasoning';
export const DEFAULT_PUTER_MODEL_ID = `${PUTER_MODEL_PREFIX}${DEFAULT_PUTER_MODEL}`;
export const DEFAULT_PUTER_MAX_TOKENS = 4096;
export const DEFAULT_PUTER_CONTINUATION_LIMIT = 1;

export const PUTER_GROK_MODELS = [
  {
    id: `${PUTER_MODEL_PREFIX}grok-4-1-fast-non-reasoning`,
    name: 'Grok 4.1 Fast Non-Reasoning',
    desc: 'Puter/xAI - low latency chat',
    tier: 10
  },
  {
    id: `${PUTER_MODEL_PREFIX}grok-4-1-fast`,
    name: 'Grok 4.1 Fast Reasoning',
    desc: 'Puter/xAI - large context reasoning',
    tier: 9
  },
  {
    id: `${PUTER_MODEL_PREFIX}grok-4.3`,
    name: 'Grok 4.3',
    desc: 'Puter/xAI - flagship reasoning model',
    tier: 9
  },
  {
    id: `${PUTER_MODEL_PREFIX}grok-4-fast-non-reasoning`,
    name: 'Grok 4 Fast Non-Reasoning',
    desc: 'Puter/xAI - fast long-form responses',
    tier: 8
  },
  {
    id: `${PUTER_MODEL_PREFIX}grok-4-fast`,
    name: 'Grok 4 Fast Reasoning',
    desc: 'Puter/xAI - long context, reasoning capable',
    tier: 8
  },
  {
    id: `${PUTER_MODEL_PREFIX}grok-4.20`,
    name: 'Grok 4.20',
    desc: 'Puter/xAI - OpenRouter alias where available',
    tier: 8
  },
  {
    id: `${PUTER_MODEL_PREFIX}grok-4.20-multi-agent`,
    name: 'Grok 4.20 Multi-Agent',
    desc: 'Puter/xAI - multi-agent deep reasoning',
    tier: 8
  },
  {
    id: `${PUTER_MODEL_PREFIX}grok-3-fast`,
    name: 'Grok 3 Fast',
    desc: 'Puter/xAI - fast Grok 3 variant',
    tier: 7
  },
  {
    id: `${PUTER_MODEL_PREFIX}grok-3-mini-fast`,
    name: 'Grok 3 Mini Fast',
    desc: 'Puter/xAI - efficient reasoning variant',
    tier: 6
  }
];

export function toPuterModelId(modelName) {
  if (!modelName) return DEFAULT_PUTER_MODEL_ID;
  return modelName.startsWith(PUTER_MODEL_PREFIX)
    ? modelName
    : `${PUTER_MODEL_PREFIX}${modelName}`;
}

export function isPuterModelId(modelId) {
  return typeof modelId === 'string' && modelId.startsWith(PUTER_MODEL_PREFIX);
}

export function stripPuterPrefix(modelId) {
  if (!modelId) return DEFAULT_PUTER_MODEL;
  return isPuterModelId(modelId) ? modelId.slice(PUTER_MODEL_PREFIX.length) : modelId;
}

export function normalizePuterEndpoint(endpoint) {
  let value = (endpoint || DEFAULT_PUTER_ENDPOINT).trim();
  if (!value) value = DEFAULT_PUTER_ENDPOINT;
  return value.replace(/\/+$/, '') || DEFAULT_PUTER_ENDPOINT;
}

export async function fetchPuterModels(endpoint = DEFAULT_PUTER_ENDPOINT, timeoutMs = 15000) {
  const base = normalizePuterEndpoint(endpoint);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${base}/models`, {
      method: 'GET',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Puter models failed with HTTP ${response.status}`);
    const data = await response.json();
    const source = Array.isArray(data) ? data : data.models || [];
    const models = source.map(mapPuterModel).filter(Boolean);
    return mergePuterModels(PUTER_GROK_MODELS, models);
  } finally {
    clearTimeout(timer);
  }
}

export async function callPuterText({
  endpoint = DEFAULT_PUTER_ENDPOINT,
  apiKey = '',
  model = DEFAULT_PUTER_MODEL,
  messages = [],
  timeoutMs = 90000,
  temperature = 0.9,
  maxTokens = DEFAULT_PUTER_MAX_TOKENS,
  continuationLimit = DEFAULT_PUTER_CONTINUATION_LIMIT
}) {
  const base = normalizePuterEndpoint(endpoint);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const originalMessages = normalizeMessages(messages);
    let activeMessages = originalMessages;
    let fullText = '';
    const maxTurns = Math.max(0, Number.parseInt(continuationLimit, 10) || 0);

    for (let turn = 0; turn <= maxTurns; turn++) {
      const result = await chatOnce({
        base,
        apiKey,
        model,
        messages: activeMessages,
        temperature,
        maxTokens,
        signal: controller.signal
      });

      if (result.text) {
        fullText = joinContinuation(fullText, result.text);
      }

      if (result.finishReason !== 'length') {
        return fullText.trim();
      }

      if (turn === maxTurns) break;

      activeMessages = [
        ...originalMessages,
        { role: 'assistant', content: fullText || result.text || '' },
        {
          role: 'user',
          content: 'Continue exactly where you stopped. Do not recap, restart, apologize, or add a heading. Continue the same response until it reaches a natural ending.'
        }
      ];
    }

    if (fullText.trim()) return fullText.trim();
    throw new Error('Puter returned an empty response.');
  } finally {
    clearTimeout(timer);
  }
}

async function chatOnce({ base, apiKey, model, messages, temperature, maxTokens, signal }) {
  const response = await fetch(`${base}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      apiKey,
      model: stripPuterPrefix(model),
      request: {
        model: stripPuterPrefix(model),
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false
      }
    })
  });

  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (_) {
    data = { raw };
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.error || raw || `HTTP ${response.status}`;
    throw new Error(`Puter failed: ${message}`);
  }

  const choice = data?.choices?.[0];
  const text = choice?.message?.content || choice?.text || data?.text || '';
  return {
    finishReason: choice?.finish_reason || '',
    text: Array.isArray(text)
      ? text.map(part => part?.text || '').filter(Boolean).join('\n').trim()
      : String(text || '').trim()
  };
}

function mapPuterModel(model) {
  const id = model?.id || model?.puterId || '';
  const aliases = model?.aliases || [];
  const name = model?.name || id;
  const haystack = [id, model?.puterId, name, ...aliases].join(' ').toLowerCase();
  if (!haystack.includes('grok') && !haystack.includes('x-ai')) return null;

  const preferred = id.includes(':') && aliases.length
    ? aliases.find(alias => !alias.includes(':') && !alias.includes('/')) || aliases[0]
    : id;

  const descBits = [
    'Puter/xAI',
    model.context ? `${formatNumber(model.context)} context` : '',
    model.max_tokens ? `${formatNumber(model.max_tokens)} max output` : ''
  ].filter(Boolean);

  return {
    id: toPuterModelId(preferred),
    name: name.replace(/\s+\(OpenRouter\)$/i, ''),
    desc: descBits.join(' - '),
    tier: name.toLowerCase().includes('4.1 fast') ? 10 : 7
  };
}

function normalizeMessages(messages = []) {
  return messages.map(message => ({
    role: normalizeRole(message.role),
    content: flattenContent(message.content)
  }));
}

function normalizeRole(role) {
  if (role === 'assistant' || role === 'system' || role === 'user') return role;
  return 'user';
}

function flattenContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === 'string') return part;
      if (part?.type === 'text') return part.text || '';
      if (part?.type === 'image_url') return `[Image reference: ${part.url || part.image_url?.url || 'attached image'}]`;
      return part?.text || '';
    }).filter(Boolean).join('\n\n');
  }
  if (content && typeof content === 'object') {
    return content.text || JSON.stringify(content);
  }
  return '';
}

function mergePuterModels(...groups) {
  const seen = new Set();
  const merged = [];
  groups.flat().filter(Boolean).forEach(model => {
    if (!model.id || seen.has(model.id)) return;
    seen.add(model.id);
    merged.push(model);
  });
  return merged;
}

function joinContinuation(previous, next) {
  const left = (previous || '').trimEnd();
  const right = (next || '').trimStart();
  if (!left) return right;
  if (!right) return left;
  return `${left}\n\n${right}`;
}

function formatNumber(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
