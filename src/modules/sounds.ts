/**
 * Sounds for the moves, with nothing to set up:
 *
 *   const audio = board.use(sounds());
 *
 * A move, a capture, castling, a promotion and a check each have their own
 * sound, made by the module itself (short knocks, no files to load). Give
 * your own files by name to replace them:
 *
 *   board.use(sounds({ files: { move: "/sounds/move.mp3", capture: "/sounds/capture.mp3" } }));
 *
 * What plays, and when:
 * - A move of the user sounds when it is made. A position the app sets
 *   sounds when its pieces slide, and is silent when it is shown at once
 *   (`animate: false`) or is a jump of several moves.
 * - One change, one sound: a check (the board's `check` option, newly set)
 *   takes the place of the move's own sound.
 * - The end of a game is the app's to tell: `audio.play("end")`.
 *
 * A browser lets a page make sound only after the user has pressed
 * something, so nothing is heard before the first press or key.
 */
import type { Change, Module, ModuleHooks } from "../index";

export type SoundName = "move" | "capture" | "castle" | "promote" | "check" | "end";

export interface SoundOptions {
  /** Your own sounds: a URL for each name. A built-in name left out keeps its built-in sound; any other name is yours to `play()`. */
  files?: Readonly<Record<string, string>>;
  /** From 0 to 1. Default 0.7. */
  volume?: number;
  muted?: boolean;
}

export interface Sounds extends ModuleHooks {
  /** Play a sound now. It takes the place of the sound of a change made in the same task. */
  play(name: string): void;
  set(options: Pick<SoundOptions, "volume" | "muted">): void;
}

/**
 * The built-in sounds, as knocks on wood: for each knock its pitch in Hz,
 * its start in seconds, the time in seconds in which it dies away, its
 * loudness, and how much of it is noise (the click) instead of tone.
 */
const KNOCKS: Record<string, number[][]> = {
  move: [[190, 0, 0.03, 0.9, 0.35]],
  capture: [
    [150, 0, 0.04, 1, 0.5],
    [270, 0.02, 0.02, 0.5, 0.3],
  ],
  castle: [
    [190, 0, 0.03, 0.8, 0.35],
    [215, 0.09, 0.03, 0.8, 0.35],
  ],
  promote: [
    [190, 0, 0.03, 0.8, 0.35],
    [880, 0.05, 0.07, 0.22, 0],
  ],
  check: [
    [520, 0, 0.03, 0.45, 0.1],
    [780, 0.07, 0.035, 0.45, 0.1],
  ],
  end: [
    [392, 0, 0.16, 0.35, 0],
    [523, 0.13, 0.22, 0.35, 0],
  ],
};

/** A knock dies away as e^(-t/fade): after this many fades it is silent. */
const FADES = 6;

function knock(context: AudioContext, parts: number[][]): AudioBuffer {
  const rate = context.sampleRate;
  const seconds = Math.max(...parts.map(([, start, fade]) => start + fade * FADES));
  const buffer = context.createBuffer(1, Math.ceil(seconds * rate), rate);
  const samples = buffer.getChannelData(0);
  for (const [pitch, start, fade, loud, noise] of parts) {
    const first = Math.floor(start * rate);
    const count = Math.floor(fade * FADES * rate);
    let hiss = 0;
    for (let i = 0; i < count; i++) {
      const t = i / rate;
      // The noise is softened (a low-pass) and dies four times faster than the tone: it is the click of the knock.
      hiss += (Math.random() * 2 - 1 - hiss) * 0.3;
      samples[first + i] += loud * (Math.sin(6.2832 * pitch * t) * (1 - noise) * Math.exp(-t / fade) + hiss * noise * Math.exp((-4 * t) / fade));
    }
  }
  return buffer;
}

export function sounds(options: SoundOptions = {}): Module<Sounds> {
  return (surface) => {
    let { volume = 0.7, muted = false } = options;
    let context: AudioContext | null = null;
    const ready = new Map<string, AudioBuffer>();
    /** Files that have arrived and wait for the audio context to decode them. */
    const loaded = new Map<string, ArrayBuffer>();
    /** The sound of the change made in this task, played when the task is over. */
    let pending: string | null = null;
    let checkBefore: string | null = null;
    let check = surface.check();

    function decode(): void {
      if (!context) return;
      for (const [name, bytes] of loaded) {
        loaded.delete(name);
        context.decodeAudioData(bytes).then(
          (buffer) => ready.set(name, buffer),
          () => {},
        );
      }
    }

    for (const [name, url] of Object.entries(options.files ?? {})) {
      fetch(url)
        .then((answer) => answer.arrayBuffer())
        .then(
          (bytes) => {
            loaded.set(name, bytes);
            decode();
          },
          () => {},
        );
    }

    /** A press or a key: the browser now lets the page make sound. */
    function unlock(): void {
      context ??= new AudioContext();
      if (context.state !== "running") void context.resume();
      decode();
    }
    addEventListener("pointerdown", unlock, true);
    addEventListener("keydown", unlock, true);

    function play(name: string): void {
      pending = null;
      if (muted || context?.state !== "running") return;
      let buffer = ready.get(name);
      if (!buffer && KNOCKS[name]) ready.set(name, (buffer = knock(context, KNOCKS[name])));
      if (!buffer) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = volume;
      source.connect(gain).connect(context.destination);
      source.start();
    }

    /** The task that changed the board is over: the app has had its say (its answer to a move, a check). */
    function flush(): void {
      if (pending) play(check && check !== checkBefore ? "check" : pending);
    }

    return {
      play,
      set(next) {
        if (next.volume !== undefined) volume = next.volume;
        if (next.muted !== undefined) muted = next.muted;
      },
      update(change?: Change) {
        const before = check;
        check = surface.check();
        if (change && change.kind !== "position" && (change.by === "user" || change.animated)) {
          if (!pending) {
            checkBefore = before;
            queueMicrotask(flush);
          }
          pending = change.kind;
        } else if (!change && !pending && check && check !== before) play("check");
      },
      destroy() {
        removeEventListener("pointerdown", unlock, true);
        removeEventListener("keydown", unlock, true);
        void context?.close();
      },
    };
  };
}
