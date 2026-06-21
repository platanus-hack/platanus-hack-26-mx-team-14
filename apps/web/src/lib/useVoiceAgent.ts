import { useCallback, useEffect, useRef, useState } from 'react';
import type { OrbState, SkillResult } from '../types';
import { AudioStreamPlayer, SUPPORTS_MSE } from './audioStream';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

interface VoiceAgentOptions {
  /** Orb state transitions: listening → thinking → speaking → idle. */
  onStatus?: (state: OrbState) => void;
  /** The recognized transcript of what the user said. */
  onTranscript?: (text: string) => void;
  /** A skill ran on the backend — render its result on the canvas. */
  onSkill?: (result: SkillResult) => void;
  /** The spoken narration text (drives the assistant reply line). */
  onReply?: (text: string) => void;
  /** Something failed (mic denied, server error). */
  onError?: (message: string) => void;
}

interface SSEvent {
  type: 'transcript' | 'skill' | 'text' | 'audio' | 'done' | 'error';
  userText?: string;
  result?: SkillResult;
  chunk?: string;
  assistantText?: string;
  message?: string;
}

/** Read a fetch Response body as a stream of `data: {...}` SSE events. */
async function* readSSE(res: Response): AsyncGenerator<SSEvent> {
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
          if (line.startsWith('data: ')) yield JSON.parse(line.slice(6)) as SSEvent;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Voice front-door to the SAT agent. Records the mic, posts the audio to the
 * tool-calling voice endpoint, and routes its SSE events to callbacks: the
 * skill result drives the visualization, the narration drives the orb. Voice
 * and text thus feed the SAME canvas.
 */
export function useVoiceAgent(opts: VoiceAgentOptions = {}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playerRef = useRef<AudioStreamPlayer | null>(null);
  // Latest callbacks without re-creating start/stop on every render.
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; });

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const send = useCallback(async (audioBase64: string, mimeType: string) => {
    const o = optsRef.current;
    setBusy(true);
    // Orb goes to thinking the instant we start — masks STT+LLM latency.
    o.onStatus?.('thinking');

    // Streaming player: narration starts the moment the first TTS chunk lands,
    // overlapping the panel that already rendered on the `skill` event.
    let player: AudioStreamPlayer | null = null;
    const fallbackChunks: string[] = [];
    if (SUPPORTS_MSE) {
      player = new AudioStreamPlayer();
      playerRef.current = player;
      player.onPlaying = () => o.onStatus?.('speaking');
      player.onEnded = () => { playerRef.current = null; o.onStatus?.('idle'); setBusy(false); };
    }

    try {
      const res = await fetch(`${API_BASE}/public/voice/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64, mimeType, history: [] }),
      });
      if (!res.ok || !res.body) throw new Error('Error de conexión con el agente');

      for await (const ev of readSSE(res)) {
        switch (ev.type) {
          case 'transcript':
            if (ev.userText) o.onTranscript?.(ev.userText);
            break;
          case 'skill':
            // Render the panel immediately — never wait for the audio.
            if (ev.result) o.onSkill?.(ev.result);
            break;
          case 'text':
            if (ev.chunk) o.onReply?.(ev.chunk);
            break;
          case 'audio':
            if (ev.chunk) { if (player) player.push(ev.chunk); else fallbackChunks.push(ev.chunk); }
            break;
          case 'error':
            throw new Error(ev.message ?? 'Error del servidor');
          case 'done':
            break;
        }
      }

      if (player) {
        player.end(); // remaining buffered audio plays out; onEnded resets state
      } else if (fallbackChunks.length > 0) {
        // No MSE (e.g. Safari): assemble and play once.
        const bytes = fallbackChunks.flatMap((c) => Array.from(atob(c), (ch) => ch.charCodeAt(0)));
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'audio/mpeg' }));
        const audio = new Audio(url);
        audioRef.current = audio;
        o.onStatus?.('speaking');
        audio.onended = () => { o.onStatus?.('idle'); URL.revokeObjectURL(url); setBusy(false); };
        audio.onerror = () => { o.onStatus?.('idle'); URL.revokeObjectURL(url); setBusy(false); };
        await audio.play().catch(() => { o.onStatus?.('idle'); setBusy(false); });
      } else {
        o.onStatus?.('idle');
        setBusy(false);
      }
    } catch (err) {
      player?.destroy();
      playerRef.current = null;
      o.onError?.((err as Error).message);
      o.onStatus?.('idle');
      setBusy(false);
    }
  }, []);

  const start = useCallback(async () => {
    if (recording || busy) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const rec = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        cleanup();
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        if (blob.size === 0) { optsRef.current.onStatus?.('idle'); return; }
        await send(await blobToBase64(blob), rec.mimeType);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      optsRef.current.onStatus?.('listening');
    } catch {
      optsRef.current.onError?.('No pude acceder al micrófono');
      optsRef.current.onStatus?.('idle');
    }
  }, [recording, busy, cleanup, send]);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setRecording(false);
  }, []);

  const toggle = useCallback(() => {
    if (recording) stop();
    else start();
  }, [recording, start, stop]);

  // Tear down mic + audio on unmount.
  useEffect(() => () => {
    audioRef.current?.pause();
    playerRef.current?.destroy();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  return { recording, busy, start, stop, toggle };
}
