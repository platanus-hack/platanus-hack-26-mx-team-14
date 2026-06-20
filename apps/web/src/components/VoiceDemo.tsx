import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Loader2, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Orb from './Orb';
import api from '../lib/api';
import type { OrbState } from '../types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type DemoState = 'idle' | 'recording' | 'processing' | 'playing';

const stateLabel: Record<DemoState, string> = {
  idle: 'Toca el micrófono para hablar',
  recording: 'Escuchando… toca para enviar',
  processing: 'Procesando tu pregunta…',
  playing: 'SATI está respondiendo…',
};

const orbStateMap: Record<DemoState, OrbState> = {
  idle: 'idle',
  recording: 'listening',
  processing: 'thinking',
  playing: 'speaking',
};

const pillClass: Record<DemoState, string> = {
  idle: 'border-border text-muted bg-surface',
  recording: 'border-emerald/40 text-emerald bg-emerald-lo',
  processing: 'border-purple-700/50 text-purple-300 bg-purple-950/30',
  playing: 'border-sky-700/50 text-sky-300 bg-sky-950/30',
};

const WELCOME: Message = {
  role: 'assistant',
  content: '¡Hola! Soy SATI, tu asistente fiscal. Pregúntame sobre impuestos, el SAT, CFDI, regímenes fiscales o cualquier duda fiscal de México.',
};

export default function VoiceDemo() {
  const [demoState, setDemoState] = useState<DemoState>('idle');
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages]);

  const startRecording = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setDemoState('recording');
    } catch {
      setError('No se pudo acceder al micrófono. Verifica los permisos del navegador.');
    }
  }, []);

  const stopAndProcess = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    setDemoState('processing');
    recorder.stop();
    recorder.stream.getTracks().forEach((t) => t.stop());

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    const mimeType = recorder.mimeType;
    const blob = new Blob(chunksRef.current, { type: mimeType });

    if (blob.size < 500) {
      setError('El audio fue muy corto. Intenta hablar un poco más.');
      setDemoState('idle');
      return;
    }

    const audioBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const history = messages.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-6);

    try {
      const { data } = await api.post('/public/voice/chat', {
        audioBase64,
        mimeType,
        history,
      });

      const newMessages: Message[] = [
        ...messages,
        { role: 'user', content: data.userText },
        { role: 'assistant', content: data.assistantText },
      ];
      setMessages(newMessages);

      if (data.audioBase64) {
        setDemoState('playing');
        const audioBuf = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
        const audioBlob = new Blob([audioBuf], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          setDemoState('idle');
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          setDemoState('idle');
          URL.revokeObjectURL(url);
        };
        await audio.play();
      } else {
        setDemoState('idle');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Error al procesar. Intenta de nuevo.');
      setDemoState('idle');
    }
  }, [messages]);

  function handleMicClick() {
    if (demoState === 'idle') {
      startRecording();
    } else if (demoState === 'recording') {
      stopAndProcess();
    } else if (demoState === 'playing') {
      audioRef.current?.pause();
      setDemoState('idle');
    }
  }

  const canClick = demoState === 'idle' || demoState === 'recording' || demoState === 'playing';

  return (
    <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
      {/* Orb + controls */}
      <div className="flex flex-col items-center gap-6 shrink-0">
        <div className="relative">
          <motion.div
            className="absolute rounded-full pointer-events-none"
            style={{
              inset: '-40%',
              background: 'radial-gradient(circle, oklch(0.55 0.16 230) 0%, transparent 65%)',
              filter: 'blur(40px)',
            }}
            animate={{
              opacity: demoState === 'idle' ? [0.12, 0.2, 0.12] : [0.2, 0.35, 0.2],
              scale: demoState === 'recording' ? [1, 1.12, 1] : [1, 1.05, 1],
            }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <Orb state={orbStateMap[demoState]} size={160} />
        </div>

        {/* Status pill */}
        <motion.div
          key={demoState}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${pillClass[demoState]}`}
        >
          {demoState === 'recording' && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
          )}
          {demoState === 'processing' && <Loader2 size={11} className="animate-spin" />}
          {demoState === 'playing' && <Volume2 size={11} />}
          {stateLabel[demoState]}
        </motion.div>

        {/* Mic button */}
        <motion.button
          type="button"
          onClick={handleMicClick}
          disabled={!canClick}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 ${
            demoState === 'recording'
              ? 'bg-red-500/90 border-2 border-red-400/60 shadow-lg shadow-red-500/25'
              : demoState === 'processing'
              ? 'bg-surface border border-border opacity-50 cursor-not-allowed'
              : 'bg-emerald/90 border-2 border-emerald/40 hover:bg-emerald shadow-lg shadow-emerald/20'
          }`}
          whileHover={canClick && demoState !== 'recording' ? { scale: 1.08 } : {}}
          whileTap={canClick ? { scale: 0.93 } : {}}
          aria-label={demoState === 'recording' ? 'Dejar de grabar' : 'Iniciar grabación'}
        >
          {demoState === 'recording'
            ? <MicOff size={22} className="text-white" />
            : <Mic size={22} className="text-white" />
          }
        </motion.button>

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-red-400 text-center max-w-[220px]"
            role="alert"
          >
            {error}
          </motion.p>
        )}
      </div>

      {/* Transcript */}
      <div className="flex-1 w-full max-w-lg">
        <div
          ref={transcriptRef}
          className="h-64 lg:h-72 overflow-y-auto flex flex-col gap-3 pr-2"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'oklch(0.3 0 0) transparent' }}
        >
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <span className="w-6 h-6 rounded-full bg-emerald flex items-center justify-center text-bg text-[10px] font-bold shrink-0 mt-0.5">
                    S
                  </span>
                )}
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-emerald/15 border border-emerald/20 text-ink rounded-tr-sm'
                      : 'bg-surface border border-border text-ink rounded-tl-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <p className="text-xs text-subtle mt-3 text-center">
          Demo pública · Sin acceso a tus datos reales del SAT
        </p>
      </div>
    </div>
  );
}
