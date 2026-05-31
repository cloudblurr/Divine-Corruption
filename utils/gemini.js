// utils/gemini.js - Gemini REST adapter through the local dev proxy.

export const GEMINI_MODEL_PREFIX = 'gemini:';
export const DEFAULT_GEMINI_ENDPOINT = '/gemini';
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';
export const DEFAULT_GEMINI_MODEL_ID = `${GEMINI_MODEL_PREFIX}${DEFAULT_GEMINI_MODEL}`;
export const DEFAULT_GEMINI_SAFETY_THRESHOLD = 'BLOCK_ONLY_HIGH';
export const DEFAULT_GEMINI_MAX_OUTPUT_TOKENS = 4096;
export const DEFAULT_GEMINI_CONTINUATION_LIMIT = 2;
export const DEFAULT_GEMINI_THINKING_MODE = 'minimal';

export const GEMINI_MODELS = [
  {
    id: `${GEMINI_MODEL_PREFIX}gemini-flash-latest`,
    name: 'Gemini Flash Latest',
    desc: 'Gemini API - latest Flash alias',
    tier: 8
  },
  {
    id: `${GEMINI_MODEL_PREFIX}gemini-pro-latest`,
    name: 'Gemini Pro Latest',
    desc: 'Gemini API - latest Pro alias',
    tier: 9
  },
  {
    id: `${GEMINI_MODEL_PREFIX}gemini-2.5-flash`,
    name: 'Gemini 2.5 Flash',
    desc: 'Gemini API - stable fast fallback',
    tier: 7
  },
  {
    id: `${GEMINI_MODEL_PREFIX}gemini-2.5-pro`,
    name: 'Gemini 2.5 Pro',
    desc: 'Gemini API - stable pro fallback',
    tier: 8
  }
];

const GEMINI_SAFETY_CATEGORIES = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT'
];

export function toGeminiModelId(modelName) {
  if (!modelName) return DEFAULT_GEMINI_MODEL_ID;
  return modelName.startsWith(GEMINI_MODEL_PREFIX)
    ? modelName
    : `${GEMINI_MODEL_PREFIX}${modelName.replace(/^models\//, '')}`;
}

export function isGeminiModelId(modelId) {
  return typeof modelId === 'string' && modelId.startsWith(GEMINI_MODEL_PREFIX);
}

export function stripGeminiPrefix(modelId) {
  if (!modelId) return DEFAULT_GEMINI_MODEL;
  return isGeminiModelId(modelId) ? modelId.slice(GEMINI_MODEL_PREFIX.length) : modelId;
}

export function normalizeGeminiEndpoint(endpoint) {
  let value = (endpoint || DEFAULT_GEMINI_ENDPOINT).trim();
  if (!value) value = DEFAULT_GEMINI_ENDPOINT;
  return value.replace(/\/+$/, '') || DEFAULT_GEMINI_ENDPOINT;
}

export async function callGeminiText({
  endpoint,
  apiKey,
  model,
  messages,
  timeoutMs = 90000,
  temperature = 0.9,
  maxOutputTokens = DEFAULT_GEMINI_MAX_OUTPUT_TOKENS,
  safetyThreshold = DEFAULT_GEMINI_SAFETY_THRESHOLD,
  continuationLimit = DEFAULT_GEMINI_CONTINUATION_LIMIT,
  thinkingMode = DEFAULT_GEMINI_THINKING_MODE
}) {
  const base = normalizeGeminiEndpoint(endpoint);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const originalMessages = messages || [];
    let activeMessages = originalMessages;
    let fullText = '';
    let lastFinishReason = '';
    const maxTurns = Math.max(0, Number.parseInt(continuationLimit, 10) || 0);

    for (let turn = 0; turn <= maxTurns; turn++) {
      const result = await generateOnce({
        base,
        apiKey,
        model,
        messages: activeMessages,
        temperature,
        maxOutputTokens,
        safetyThreshold,
        thinkingMode,
        signal: controller.signal
      });

      if (result.text) {
        fullText = joinContinuation(fullText, result.text);
      }
      lastFinishReason = result.finishReason || '';

      if (lastFinishReason !== 'MAX_TOKENS') {
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
    throw new Error(lastFinishReason === 'MAX_TOKENS'
      ? 'Gemini stopped at MAX_TOKENS before returning text.'
      : 'Gemini returned an empty response.');
  } finally {
    clearTimeout(timer);
  }
}

async function generateOnce({
  base,
  apiKey,
  model,
  messages,
  temperature,
  maxOutputTokens,
  safetyThreshold,
  thinkingMode,
  signal
}) {
  const request = buildGeminiRequest({
    model,
    messages,
    temperature,
    maxOutputTokens,
    safetyThreshold,
    thinkingMode
  });

  const response = await fetch(`${base}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      apiKey,
      model: stripGeminiPrefix(model),
      request
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
    throw new Error(`Gemini failed: ${message}`);
  }

  if (data?.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the prompt: ${data.promptFeedback.blockReason}`);
  }

  const candidate = data?.candidates?.[0];
  if (candidate?.finishReason === 'SAFETY') {
    throw new Error('Gemini blocked the response with finishReason SAFETY.');
  }

  return {
    finishReason: candidate?.finishReason || '',
    text: (candidate?.content?.parts || [])
      .map(part => part?.text || '')
      .filter(Boolean)
      .join('\n')
      .trim()
  };
}

function buildGeminiRequest({ model, messages = [], temperature, maxOutputTokens, safetyThreshold, thinkingMode }) {
  const systemParts = [];
  const contents = [];

  for (const message of messages) {
    const text = flattenContent(message.content);
    if (!text) continue;

    if (message.role === 'system') {
      systemParts.push(text);
      continue;
    }

    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text }]
    });
  }

  if (!contents.length) {
    contents.push({ role: 'user', parts: [{ text: 'Continue.' }] });
  }

  return {
    systemInstruction: systemParts.length
      ? { parts: [{ text: systemParts.join('\n\n') }] }
      : undefined,
    contents,
    generationConfig: {
      temperature,
      topP: 0.95,
      maxOutputTokens,
      thinkingConfig: buildThinkingConfig(model, thinkingMode)
    },
    safetySettings: buildSafetySettings(safetyThreshold)
  };
}

function buildSafetySettings(threshold) {
  const selected = threshold || DEFAULT_GEMINI_SAFETY_THRESHOLD;
  if (selected === 'DEFAULT') return undefined;
  return GEMINI_SAFETY_CATEGORIES.map(category => ({ category, threshold: selected }));
}

function buildThinkingConfig(model, mode) {
  const selected = mode || DEFAULT_GEMINI_THINKING_MODE;
  if (selected === 'default') return undefined;

  const modelName = stripGeminiPrefix(model).toLowerCase();
  if (modelName.includes('2.5')) {
    if (selected === 'minimal' || selected === 'off') return { thinkingBudget: 0 };
    if (selected === 'low') return { thinkingBudget: 256 };
    return { thinkingBudget: -1 };
  }

  if (selected === 'minimal') return { thinkingLevel: 'minimal' };
  if (selected === 'low') return { thinkingLevel: 'low' };
  if (selected === 'high') return { thinkingLevel: 'high' };
  return undefined;
}

function joinContinuation(previous, next) {
  const left = (previous || '').trimEnd();
  const right = (next || '').trimStart();
  if (!left) return right;
  if (!right) return left;
  return `${left}\n\n${right}`;
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
