import { useState, useRef, useCallback, useEffect } from 'react';
import { Volume2, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Orb from './Orb';
import type { OrbState } from '../types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// idle   = no session, mic off
// ready  = session active, waiting for speech
// speech = user speaking (recording)
// processing = STT + Claude + TTS in flight
// playing = audio playing back
type Status = 'idle' | 'ready' | 'speech' | 'processing' | 'playing';

const statusLabel: Record<Status, string> = {
  idle: 'Toca para conversar',
  ready: 'Te escucho…',
  speech: 'Hablando…',
  processing: 'Pensando…',
  playing: 'Respondiendo…',
};

const orbStateMap: Record<Status, OrbState> = {
  idle: 'idle',
  ready: 'idle',
  speech: 'listening',
  processing: 'thinking',
  playing: 'speaking',
};

const glowMap: Record<Status, string> = {
  idle: 'oklch(0.55 0.16 230)',
  ready: 'oklch(0.62 0.17 160)',
  speech: 'oklch(0.72 0.20 150)',
  processing: 'oklch(0.50 0.18 295)',
  playing: 'oklch(0.68 0.20 198)',
};

// ── VAD (detects speech start AND end) ───────────────────────────────────────
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
    threshold = 13,
    startDebounce = 200,
  ) {
    this.#onSpeechStart = onSpeechStart;
    this.#onSpeechEnd = onSpeechEnd;
    this.#silenceMs = silenceMs;
    this.#threshold = threshold;
    this.#startDebounce = startDebounce;
    this.#ctx = new AudioContext();
    const src = this.#ctx.createMediaStreamSource(stream);
    this.#analyser = this.#ctx.createAnalyser();
    this.#analyser.fftSize = 512;
    src.connect(this.#analyser);
    this.#data = new Uint8Array(new ArrayBuffer(this.#analyser.frequencyBinCount));
    this.#tick();
  }

  #tick() {
    if (this.#stopped) return;
    this.#analyser.getByteFrequencyData(this.#data as unknown as Uint8Array<ArrayBuffer>);
    const start = Math.floor(this.#data.length * 0.05);
    const end = Math.floor(this.#data.length * 0.65);
    let sum = 0;
    for (let i = start; i < end; i++) sum += this.#data[i];
    const avg = sum / (end - start);

    if (avg > this.#threshold) {
      // Clear silence timer
      if (this.#silenceTimer) { clearTimeout(this.#silenceTimer); this.#silenceTimer = null; }
      // Debounce speech start
      if (!this.#isSpeaking && !this.#speechStartTimer) {
        this.#speechStartTimer = setTimeout(() => {
          this.#speechStartTimer = null;
          if (!this.#stopped) {
            this.#isSpeaking = true;
            this.#onSpeechStart();
          }
        }, this.#startDebounce);
      }
    } else {
      // Cancel pending speech start if noise was too brief
      if (this.#speechStartTimer) {
        clearTimeout(this.#speechStartTimer);
        this.#speechStartTimer = null;
      }
      // Start silence countdown after speech
      if (this.#isSpeaking && !this.#silenceTimer) {
        this.#silenceTimer = setTimeout(() => {
          this.#silenceTimer = null;
          if (!this.#stopped) {
            this.#isSpeaking = false;
            this.#onSpeechEnd();
          }
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

// ── MediaSource streaming audio player ───────────────────────────────────────
const SUPPORTS_MSE =
  typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('audio/mpeg');

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

  end() {
    this.#streamDone = true;
    this.#drain();
  }

  get htmlAudio() { return this.#audio; }

  destroy() {
    this.#audio.pause();
    this.#audio.src = '';
    try { if (this.#ms.readyState === 'open') this.#ms.endOfStream(); } catch { /* ok */ }
    URL.revokeObjectURL(this.#url);
  }
}

// ── SSE reader ───────────────────────────────────────────────────────────────
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
          if (line.startsWith('data: ')) yield JSON.parse(line.slice(6)) as Record<string, string>;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Component ────────────────────────────────────────────────────────────────
export default function HeroOrb() {
  const [status, setStatus] = useState<Status>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamText, setStreamText] = useState('');
  const [error, setError] = useState('');

  // Refs so VAD callbacks always see current values (no stale closures)
  const statusRef = useRef<Status>('idle');
  const messagesRef = useRef<Message[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const vadRef = useRef<VAD | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef('audio/webm');
  const playerRef = useRef<AudioStreamPlayer | null>(null);
  const fallbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const setS = useCallback((s: Status) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => () => { doEndSession(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── audio control ──────────────────────────────────────────────────────────
  function stopAudio() {
    abortRef.current?.abort();
    abortRef.current = null;
    playerRef.current?.destroy();
    playerRef.current = null;
    fallbackAudioRef.current?.pause();
    fallbackAudioRef.current = null;
    setStreamText('');
  }

  // ── recording ─────────────────────────────────────────────────────────────
  function doStartRecording() {
    if (!streamRef.current) return;
    const mt = mimeTypeRef.current;
    const rec = new MediaRecorder(streamRef.current, { mimeType: mt });
    chunksRef.current = [];
    rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.start(80);
    recorderRef.current = rec;
    setS('speech');
  }

  const doSendRecording = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    setS('processing');

    await new Promise<void>(resolve => { rec.onstop = () => resolve(); rec.stop(); });

    const blob = new Blob(chunksRef.current, { type: rec.mimeType });
    recorderRef.current = null;

    if (blob.size < 400) { setS('ready'); return; }

    // ── send via SSE ────────────────────────────────────────────────────────
    const audioBase64 = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res((fr.result as string).split(',')[1]);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });

    let player: AudioStreamPlayer | null = null;
    const fallbackChunks: string[] = [];

    if (SUPPORTS_MSE) {
      player = new AudioStreamPlayer();
      playerRef.current = player;
      player.onPlaying = () => setS('playing');
      player.onEnded = () => {
        playerRef.current = null;
        setStreamText('');
        setS('ready'); // ← back to listening, not idle
      };
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const base = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    let assistantAcc = '';

    try {
      const res = await fetch(`${base}/public/voice/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType: rec.mimeType,
          history: messagesRef.current.slice(-6),
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) throw new Error('Error de conexión');

      for await (const ev of readSSE(res)) {
        if (ev.type === 'transcript' && ev.userText) {
          setMessages(prev => [...prev, { role: 'user', content: ev.userText }]);
        } else if (ev.type === 'text' && ev.chunk) {
          assistantAcc += ev.chunk;
          setStreamText(assistantAcc);
        } else if (ev.type === 'audio' && ev.chunk) {
          if (player) player.push(ev.chunk);
          else fallbackChunks.push(ev.chunk);
        } else if (ev.type === 'done') {
          if (assistantAcc) {
            setMessages(prev => [...prev, { role: 'assistant', content: ev.assistantText ?? assistantAcc }]);
            setStreamText('');
          }
          if (player) {
            player.end();
            setS('playing');
            setTimeout(() => {
              if (playerRef.current === player) player!.htmlAudio.play().catch(() => {});
            }, 200);
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
        } else if (ev.type === 'error') {
          throw new Error(ev.message ?? 'Error del servidor');
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message ?? 'Algo salió mal, intenta de nuevo.');
      player?.destroy();
      playerRef.current = null;
      setS('ready'); // ← stay in session on error
    }
  }, [setS]);

  // ── session lifecycle ─────────────────────────────────────────────────────
  function doEndSession() {
    vadRef.current?.stop(); vadRef.current = null;
    recorderRef.current?.stop(); recorderRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;
    stopAudio();
    setS('idle');
    setError('');
  }

  async function doStartSession() {
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
        // onSpeechStart — VAD detected someone talking
        // threshold 22 (era 13): evita que música de fondo active el micrófono
        () => {
          const s = statusRef.current;
          if (s === 'ready') {
            doStartRecording();
          } else if (s === 'playing') {
            stopAudio(); // barge-in: interrupt response
            doStartRecording();
          }
          // During 'processing' ignore — can't interrupt mid-flight
        },
        // onSpeechEnd — silence after speech
        () => {
          if (statusRef.current === 'speech') doSendRecording();
        },
        1600, 22, 250,
      );

      setS('ready');
    } catch {
      setError('No se pudo acceder al micrófono.');
    }
  }

  function handleOrbClick() {
    if (statusRef.current === 'idle') {
      doStartSession();
    } else {
      doEndSession();
    }
  }

  const sessionActive = status !== 'idle';
  const glow = glowMap[status];

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Orb */}
      <button
        type="button"
        onClick={handleOrbClick}
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-emerald/50 focus-visible:rounded-full cursor-pointer"
        aria-label={sessionActive ? 'Terminar conversación' : 'Iniciar conversación'}
      >
        {/* Atmospheric glow */}
        <motion.div
          className="absolute rounded-full pointer-events-none"
          style={{ inset: '-55%', background: `radial-gradient(circle, ${glow} 0%, transparent 65%)`, filter: 'blur(64px)' }}
          animate={{
            opacity: status === 'idle' ? [0.12, 0.2, 0.12] : [0.28, 0.48, 0.28],
            scale: status === 'speech' ? [1, 1.18, 1] : [1, 1.06, 1],
          }}
          transition={{ duration: status === 'speech' ? 0.9 : 3.0, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute rounded-full pointer-events-none"
          style={{ inset: '-28%', background: `radial-gradient(circle, ${glow} 0%, transparent 60%)`, filter: 'blur(28px)', opacity: 0.22 }}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: 1.0 }}
        />

        <Orb state={orbStateMap[status]} size={260} />
      </button>

      {/* Status label + session indicator */}
      <div className="flex flex-col items-center gap-1">
        <motion.div
          key={status}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-1.5 text-xs text-subtle tracking-wide select-none"
        >
          {status === 'ready' && <span className="w-1.5 h-1.5 rounded-full bg-emerald/70 animate-pulse shrink-0" />}
          {status === 'speech' && <span className="w-1.5 h-1.5 rounded-full bg-emerald animate-ping shrink-0" />}
          {status === 'playing' && <Volume2 size={10} className="text-sky-400 shrink-0" />}
          {statusLabel[status]}
        </motion.div>

        {/* End session hint */}
        <AnimatePresence>
          {sessionActive && (
            <motion.div
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1 text-[10px] text-subtle/50 select-none"
            >
              <MicOff size={9} />
              toca para terminar
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs text-red-400 text-center max-w-[240px]"
            role="alert"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Transcript — no overflow trap, shows last 4 msgs + streaming text */}
      <AnimatePresence>
        {(messages.length > 0 || streamText) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full max-w-[320px] flex flex-col gap-1.5 pointer-events-none"
          >
            {messages.slice(-4).map((msg, i) => (
              <motion.div
                key={`${i}-${msg.role}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className={`text-xs rounded-xl px-3 py-2 leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-emerald/10 text-ink/80 self-end text-right border border-emerald/15 max-w-[88%]'
                    : 'bg-surface text-muted border border-border self-start max-w-[92%]'
                }`}
              >
                {msg.content}
              </motion.div>
            ))}

            {/* Live streaming text with cursor */}
            <AnimatePresence>
              {streamText && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-xs rounded-xl px-3 py-2 leading-relaxed bg-surface text-muted border border-border self-start max-w-[92%]"
                >
                  {streamText}
                  <span className="inline-block w-0.5 h-3 bg-emerald/60 ml-0.5 align-text-bottom animate-pulse" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
