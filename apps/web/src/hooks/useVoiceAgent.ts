import { useState, useRef, useCallback, useEffect } from 'react';
import type { SkillResult } from '../types';

export type VoiceStatus = 'idle' | 'ready' | 'speech' | 'processing' | 'playing';

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface UseVoiceAgentReturn {
  status: VoiceStatus;
  messages: AgentMessage[];
  streamText: string;
  toolActivity: string | null;
  skillResult: SkillResult | null;
  error: string;
  sessionActive: boolean;
  startSession: () => Promise<void>;
  endSession: () => void;
  sendText: (text: string) => Promise<void>;
}

// ── VAD ───────────────────────────────────────────────────────────────────────
class VAD {
  #ctx: AudioContext;
  #analyser: AnalyserNode;
  #data: Uint8Array<ArrayBuffer>;
  #rafId = 0;
  #isSpeaking = false;
  #speechStartTimer: ReturnType<typeof setTimeout> | null = null;
  #silenceTimer: ReturnType<typeof setTimeout> | null = null;
  #stopped = false;
  #onSpeechStart: () => void;
  #onSpeechEnd: () => void;
  #silenceMs: number;
  #threshold: number;
  #startDebounce: number;

  constructor(
    stream: MediaStream,
    onSpeechStart: () => void,
    onSpeechEnd: () => void,
    silenceMs = 1600,
    threshold = 22,
    startDebounce = 250,
  ) {
    this.#onSpeechStart = onSpeechStart;
    this.#onSpeechEnd = onSpeechEnd;
    this.#silenceMs = silenceMs;
    this.#threshold = threshold;
    this.#startDebounce = startDebounce;
    this.#ctx = new AudioContext();
    const src = this.#ctx.createMediaStreamSource(stream);
    // Highpass at 150 Hz removes AC hum, bass music, and low-frequency rumble
    const hp = this.#ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 150;
    hp.Q.value = 0.7;
    this.#analyser = this.#ctx.createAnalyser();
    this.#analyser.fftSize = 512;
    src.connect(hp);
    hp.connect(this.#analyser);
    this.#data = new Uint8Array(new ArrayBuffer(this.#analyser.frequencyBinCount));
    this.#tick();
  }

  #tick() {
    if (this.#stopped) return;
    this.#analyser.getByteFrequencyData(this.#data as unknown as Uint8Array<ArrayBuffer>);
    // Focus on voice band: 200-3500 Hz (fundamentals + formants F1/F2)
    // Avoids activating on music, AC noise, or bass-heavy sounds
    const hzPerBin = (this.#ctx.sampleRate / 2) / this.#data.length;
    const start = Math.max(1, Math.floor(200 / hzPerBin));
    const end = Math.min(this.#data.length - 1, Math.floor(3500 / hzPerBin));
    let sum = 0;
    for (let i = start; i < end; i++) sum += this.#data[i];
    const avg = sum / (end - start);

    if (avg > this.#threshold) {
      if (this.#silenceTimer) { clearTimeout(this.#silenceTimer); this.#silenceTimer = null; }
      if (!this.#isSpeaking && !this.#speechStartTimer) {
        this.#speechStartTimer = setTimeout(() => {
          this.#speechStartTimer = null;
          if (!this.#stopped) { this.#isSpeaking = true; this.#onSpeechStart(); }
        }, this.#startDebounce);
      }
    } else {
      if (this.#speechStartTimer) { clearTimeout(this.#speechStartTimer); this.#speechStartTimer = null; }
      if (this.#isSpeaking && !this.#silenceTimer) {
        this.#silenceTimer = setTimeout(() => {
          this.#silenceTimer = null;
          if (!this.#stopped) { this.#isSpeaking = false; this.#onSpeechEnd(); }
        }, this.#silenceMs);
      }
    }
    this.#rafId = requestAnimationFrame(() => this.#tick());
  }

  stop() {
    this.#stopped = true;
    cancelAnimationFrame(this.#rafId);
    if (this.#speechStartTimer) clearTimeout(this.#speechStartTimer);
    if (this.#silenceTimer) clearTimeout(this.#silenceTimer);
    this.#ctx.close();
  }
}

// ── MSE audio player ──────────────────────────────────────────────────────────
const SUPPORTS_MSE = typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('audio/mpeg');

class AudioStreamPlayer {
  #ms = new MediaSource();
  #audio = new Audio();
  #sb: SourceBuffer | null = null;
  #queue: ArrayBuffer[] = [];
  #streamDone = false;
  #url: string;
  onEnded?: () => void;
  onPlaying?: () => void;

  constructor() {
    this.#url = URL.createObjectURL(this.#ms);
    this.#audio.src = this.#url;
    this.#audio.preload = 'auto';
    this.#audio.addEventListener('ended', () => this.onEnded?.());
    this.#audio.addEventListener('playing', () => this.onPlaying?.());
    this.#ms.addEventListener('sourceopen', this.#onOpen, { once: true });
  }

  #onOpen = () => {
    this.#sb = this.#ms.addSourceBuffer('audio/mpeg');
    this.#sb.addEventListener('updateend', this.#drain);
    this.#drain();
  };

  #drain = () => {
    if (!this.#sb || this.#sb.updating) return;
    if (this.#queue.length > 0) {
      this.#sb.appendBuffer(this.#queue.shift()!);
      if (this.#audio.paused) this.#audio.play().catch(() => {});
      return;
    }
    if (this.#streamDone && this.#ms.readyState === 'open') this.#ms.endOfStream();
  };

  push(base64: string) {
    const raw = atob(base64);
    const buf = new ArrayBuffer(raw.length);
    const v = new Uint8Array(buf);
    for (let i = 0; i < raw.length; i++) v[i] = raw.charCodeAt(i);
    this.#queue.push(buf);
    this.#drain();
  }

  end() { this.#streamDone = true; this.#drain(); }
  get htmlAudio() { return this.#audio; }
  destroy() {
    this.#audio.pause();
    this.#audio.src = '';
    try { if (this.#ms.readyState === 'open') this.#ms.endOfStream(); } catch { /* ok */ }
    URL.revokeObjectURL(this.#url);
  }
}

// ── SSE reader ────────────────────────────────────────────────────────────────
async function* readSSE(res: Response) {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (line.startsWith('data: ')) yield JSON.parse(line.slice(6)) as Record<string, unknown>;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000') as string;
const USE_MOCK = (import.meta.env.VITE_USE_MOCK_AGENT ?? '') === 'true';

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useVoiceAgent(): UseVoiceAgentReturn {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streamText, setStreamText] = useState('');
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const [skillResult, setSkillResult] = useState<SkillResult | null>(null);
  const [error, setError] = useState('');

  const statusRef = useRef<VoiceStatus>('idle');
  const messagesRef = useRef<AgentMessage[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const vadRef = useRef<VAD | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef('audio/webm');
  const playerRef = useRef<AudioStreamPlayer | null>(null);
  const fallbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const setS = useCallback((s: VoiceStatus) => { statusRef.current = s; setStatus(s); }, []);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => () => { doEndSession(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function stopAudio() {
    abortRef.current?.abort();
    abortRef.current = null;
    playerRef.current?.destroy();
    playerRef.current = null;
    fallbackAudioRef.current?.pause();
    fallbackAudioRef.current = null;
    setStreamText('');
    setToolActivity(null);
  }

  function doStartRecording() {
    if (!streamRef.current) return;
    const rec = new MediaRecorder(streamRef.current, { mimeType: mimeTypeRef.current });
    chunksRef.current = [];
    rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.start(80);
    recorderRef.current = rec;
    setS('speech');
  }

  const doSendVoice = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    setS('processing');
    setToolActivity(null);

    await new Promise<void>(resolve => { rec.onstop = () => resolve(); rec.stop(); });
    const blob = new Blob(chunksRef.current, { type: rec.mimeType });
    recorderRef.current = null;
    if (blob.size < 400) { setS('ready'); return; }

    const audioBase64 = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res((fr.result as string).split(',')[1]);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });

    await runAgentTurn({ audioBase64, mimeType: rec.mimeType });
  }, [setS]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendText(text: string) {
    if (!text.trim() || statusRef.current === 'processing') return;
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setS('processing');
    setToolActivity(null);
    await runAgentTurn({ text });
  }

  async function runAgentTurn(input: { audioBase64?: string; mimeType?: string; text?: string }) {
    const token = localStorage.getItem('sati_token');
    let player: AudioStreamPlayer | null = null;
    const fallbackChunks: string[] = [];

    if (SUPPORTS_MSE) {
      player = new AudioStreamPlayer();
      playerRef.current = player;
      player.onPlaying = () => setS('playing');
      player.onEnded = () => { playerRef.current = null; setStreamText(''); setS('ready'); };
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const endpoint = USE_MOCK ? `${BASE}/mock/agent/turn` : `${BASE}/agent/voice-turn`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!USE_MOCK && token) headers['Authorization'] = `Bearer ${token}`;

    // Pass last 10 messages as context
    const contextMessages = messagesRef.current.slice(-10).map(m => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...input, messages: USE_MOCK ? undefined : contextMessages, text: input.text }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) throw new Error('Error de conexión con el agente');

      let assistantAcc = '';

      for await (const ev of readSSE(res)) {
        switch (ev.type) {
          case 'transcript':
            setMessages(prev => [...prev, { role: 'user', content: ev.userText as string }]);
            break;
          case 'thinking':
            setToolActivity('Pensando…');
            break;
          case 'tool_call':
            setToolActivity((ev.label ?? ev.name) as string);
            break;
          case 'tool_result':
            setToolActivity(null);
            break;
          case 'text':
            assistantAcc = ev.text as string;
            setStreamText(assistantAcc);
            break;
          case 'audio':
            if (player) player.push(ev.chunk as string);
            else fallbackChunks.push(ev.chunk as string);
            break;
          case 'done': {
            if (assistantAcc) {
              setMessages(prev => [...prev, { role: 'assistant', content: assistantAcc }]);
              setStreamText('');
            }
            if (ev.skillResult) setSkillResult(ev.skillResult as SkillResult);
            setToolActivity(null);

            if (player) {
              player.end();
              setS('playing');
              setTimeout(() => { if (playerRef.current === player) player!.htmlAudio.play().catch(() => {}); }, 200);
            } else if (fallbackChunks.length > 0) {
              setS('playing');
              let total = 0;
              const dec = fallbackChunks.map(c => atob(c));
              for (const d of dec) total += d.length;
              const buf = new Uint8Array(total);
              let off = 0;
              for (const d of dec) for (let i = 0; i < d.length; i++) buf[off++] = d.charCodeAt(i);
              const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
              const audio = new Audio(url);
              fallbackAudioRef.current = audio;
              audio.onended = () => { setS('ready'); setStreamText(''); URL.revokeObjectURL(url); };
              audio.onerror = () => { setS('ready'); setStreamText(''); URL.revokeObjectURL(url); };
              audio.play().catch(() => setS('ready'));
            } else {
              setS('ready');
            }
            break;
          }
          case 'error':
            throw new Error((ev.message as string) ?? 'Error del servidor');
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message ?? 'Algo salió mal, intenta de nuevo.');
      player?.destroy();
      playerRef.current = null;
      setToolActivity(null);
      setS('ready');
    }
  }

  function doEndSession() {
    vadRef.current?.stop(); vadRef.current = null;
    recorderRef.current?.stop(); recorderRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;
    stopAudio();
    setS('idle');
    setError('');
    setToolActivity(null);
  }

  async function startSession() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
      });
      streamRef.current = stream;
      mimeTypeRef.current = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm';

      vadRef.current = new VAD(
        stream,
        () => {
          const s = statusRef.current;
          if (s === 'ready') doStartRecording();
          else if (s === 'playing') { stopAudio(); doStartRecording(); }
        },
        () => { if (statusRef.current === 'speech') doSendVoice(); },
      );
      setS('ready');
    } catch {
      setError('No se pudo acceder al micrófono.');
    }
  }

  return {
    status,
    messages,
    streamText,
    toolActivity,
    skillResult,
    error,
    sessionActive: status !== 'idle',
    startSession,
    endSession: doEndSession,
    sendText,
  };
}
