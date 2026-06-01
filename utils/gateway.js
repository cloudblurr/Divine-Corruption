// utils/gateway.js - OpenAI-compatible local Gateway adapter.

export const GATEWAY_MODEL_PREFIX = 'gateway:';
export const DEFAULT_GATEWAY_ENDPOINT = '/gateway';
export const DEFAULT_GATEWAY_MODEL = 'Sao10K/L3-8B-Stheno-v3.2';
export const DEFAULT_GATEWAY_MODEL_ID = `${GATEWAY_MODEL_PREFIX}${DEFAULT_GATEWAY_MODEL}`;
export const DEFAULT_GATEWAY_MAX_TOKENS = 4096;
export const DEFAULT_GATEWAY_CONTINUATION_LIMIT = 1;

export const GATEWAY_ROLEPLAY_MODELS = [
  {
    id: `${GATEWAY_MODEL_PREFIX}Sao10K/L3-8B-Stheno-v3.2`,
    name: 'Stheno v3.2 8B',
    desc: 'HF Gateway - roleplay-focused local endpoint',
    tier: 10
  },
  {
    id: `${GATEWAY_MODEL_PREFIX}Sao10K/L3-70B-Euryale-v2.1`,
    name: 'Euryale v2.1 70B',
    desc: 'HF Gateway - larger long-form roleplay model',
    tier: 9
  },
  {
    id: `${GATEWAY_MODEL_PREFIX}Qwen/Qwen3-Coder-480B-A35B-Instruct`,
    name: 'Qwen3 Coder 480B A35B',
    desc: 'HF Gateway - massive structured generation model',
    tier: 7
  },
  {
    id: `${GATEWAY_MODEL_PREFIX}Qwen/Qwen3-Coder-Next`,
    name: 'Qwen3 Coder Next',
    desc: 'HF Gateway - fast structured generation model',
    tier: 6
  },
  {
    id: `${GATEWAY_MODEL_PREFIX}Qwen/Qwen3-Coder-30B-A3B-Instruct`,
    name: 'Qwen3 Coder 30B A3B',
    desc: 'HF Gateway - structured writing and tool tasks',
    tier: 6
  },
  {
    id: `${GATEWAY_MODEL_PREFIX}DavidAU/Dolphin-Mistral-GLM-4.7-Flash-24B-Venice-Edition-Thinking-Uncensored`,
    name: 'Dolphin Mistral GLM 4.7 Flash 24B Venice',
    desc: 'HF Gateway - uncensored Dolphin/Mistral roleplay model',
    tier: 9
  },
  {
    id: `${GATEWAY_MODEL_PREFIX}huihui-ai/Dolphin3.0-Llama3.1-8B-abliterated`,
    name: 'Dolphin 3.0 Llama 3.1 8B Abliterated',
    desc: 'HF Gateway - lightweight uncensored Dolphin model',
    tier: 8
  },
  {
    id: `${GATEWAY_MODEL_PREFIX}DavidAU/Qwen3-4B-Thinking-2507-Gemini-2.5-Flash-Lite-Preview-Distill-Heretic-Abliterated`,
    name: 'Qwen3 4B Heretic Abliterated',
    desc: 'HF Gateway - compact abliterated Qwen model',
    tier: 7
  }
];

export function toGatewayModelId(modelName) {
  if (!modelName) return DEFAULT_GATEWAY_MODEL_ID;
  return modelName.startsWith(GATEWAY_MODEL_PREFIX)
    ? modelName
    : `${GATEWAY_MODEL_PREFIX}${modelName}`;
}

export function isGatewayModelId(modelId) {
  return typeof modelId === 'string' && modelId.startsWith(GATEWAY_MODEL_PREFIX);
}

export function stripGatewayPrefix(modelId) {
  if (!modelId) return DEFAULT_GATEWAY_MODEL;
  return isGatewayModelId(modelId) ? modelId.slice(GATEWAY_MODEL_PREFIX.length) : modelId;
}

export function normalizeGatewayEndpoint(endpoint) {
  let value = (endpoint || DEFAULT_GATEWAY_ENDPOINT).trim();
  if (!value) value = DEFAULT_GATEWAY_ENDPOINT;
  return value.replace(/\/+$/, '') || DEFAULT_GATEWAY_ENDPOINT;
}

export async function fetchGatewayModels(endpoint = DEFAULT_GATEWAY_ENDPOINT, timeoutMs = 15000) {
  const base = normalizeGatewayEndpoint(endpoint);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${base}/models`, {
      method: 'GET',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Gateway models failed with HTTP ${response.status}`);
    const data = await response.json();
    const source = Array.isArray(data) ? data : data.data || data.models || [];
    const models = source.map(mapGatewayModel).filter(Boolean);
    return mergeGatewayModels(models, GATEWAY_ROLEPLAY_MODELS);
  } finally {
    clearTimeout(timer);
  }
}

export async function callGatewayText({
  endpoint = DEFAULT_GATEWAY_ENDPOINT,
  apiKey = '',
  model = DEFAULT_GATEWAY_MODEL,
  messages = [],
  timeoutMs = 90000,
  temperature = 0.9,
  maxTokens = DEFAULT_GATEWAY_MAX_TOKENS,
  continuationLimit = DEFAULT_GATEWAY_CONTINUATION_LIMIT
}) {
  const base = normalizeGatewayEndpoint(endpoint);
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

      if (result.text) fullText = joinContinuation(fullText, result.text);
      if (result.finishReason !== 'length') return fullText.trim();
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
    throw new Error('Gateway returned an empty response.');
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
      model: stripGatewayPrefix(model),
      request: {
        model: stripGatewayPrefix(model),
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
    throw new Error(`Gateway failed: ${message}`);
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

function mapGatewayModel(model) {
  const id = model?.id || model?.model || '';
  if (!id) return null;
  const owner = model?.owned_by || model?.owner || 'Gateway';
  return {
    id: toGatewayModelId(id),
    name: id,
    desc: `${owner} - Gateway model`,
    tier: id.toLowerCase().includes('stheno') || id.toLowerCase().includes('euryale') ? 10 : 6
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
  if (content && typeof content === 'object') return content.text || JSON.stringify(content);
  return '';
}

function mergeGatewayModels(...groups) {
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
