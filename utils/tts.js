// utils/tts.js - Character text-to-speech helpers
import { getState } from '../state.js';

export const ELEVENLABS_ADAM_VOICE_ID = 'pNInz6obpgDQGcFmaJgB';
export const DEFAULT_VOICE_ID = `elevenlabs:${ELEVENLABS_ADAM_VOICE_ID}`;

let activeAudio = null;

export async function speakCharacterText(text, options = {}) {
  const cleanText = String(options.text || text || '').trim();
  if (!cleanText) return;

  const settings = getState().settings || {};
  const voiceId = options.voiceId || settings.voiceId || DEFAULT_VOICE_ID;

  if (voiceId.startsWith('elevenlabs:') && settings.elevenLabsApiKey) {
    await speakElevenLabs(cleanText, {
      apiKey: settings.elevenLabsApiKey,
      voiceId: voiceId.replace(/^elevenlabs:/, ''),
      timeoutMs: options.timeoutMs || 120000
    });
    return;
  }

  if (globalThis.miniappsAI?.tts?.speak) {
    await globalThis.miniappsAI.tts.speak({
      text: cleanText,
      voiceId,
      timeoutMs: options.timeoutMs || 120000
    });
    return;
  }

  throw new Error('TTS unavailable');
}

async function speakElevenLabs(text, { apiKey, voiceId, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/elevenlabs/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey, voiceId, text }),
      signal: controller.signal
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(details || `ElevenLabs TTS failed with HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    await playAudioUrl(url);
  } finally {
    clearTimeout(timer);
  }
}

function playAudioUrl(url) {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }

  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    activeAudio = audio;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (activeAudio === audio) activeAudio = null;
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      if (activeAudio === audio) activeAudio = null;
      reject(new Error('Audio playback failed'));
    };
    audio.play().catch(err => {
      URL.revokeObjectURL(url);
      if (activeAudio === audio) activeAudio = null;
      reject(err);
    });
  });
}
