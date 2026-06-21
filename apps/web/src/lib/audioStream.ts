/**
 * MediaSource streaming audio player: plays MP3 chunks as they arrive instead of
 * waiting for the full clip. This is the latency win for voice — the narration
 * starts the moment the first TTS chunk lands, overlapping the panel animating in.
 */
export const SUPPORTS_MSE =
  typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('audio/mpeg');

export class AudioStreamPlayer {
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

  /** Push a base64-encoded MP3 chunk. */
  push(base64: string) {
    const raw = atob(base64);
    const buf = new ArrayBuffer(raw.length);
    const v = new Uint8Array(buf);
    for (let i = 0; i < raw.length; i++) v[i] = raw.charCodeAt(i);
    this.#queue.push(buf);
    this.#drain();
  }

  /** Signal that no more chunks are coming. */
  end() {
    this.#streamDone = true;
    this.#drain();
  }

  destroy() {
    this.#audio.pause();
    this.#audio.src = '';
    try { if (this.#ms.readyState === 'open') this.#ms.endOfStream(); } catch { /* ok */ }
    URL.revokeObjectURL(this.#url);
  }
}
