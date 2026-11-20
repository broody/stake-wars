import { useSyncExternalStore } from 'react';
import type { Readout } from './pose';

/** Playback speeds the dashboard offers. */
export const RATES = [0.1, 0.25, 0.5, 1] as const;
/** Readouts re-render at this rate; the stage reads the transport every frame. */
const NOTIFY_INTERVAL = 1 / 15;

/**
 * Where one stage is in its action's loop, and how fast it moves. The
 * render loop advances it; the controls and timeline subscribe to it.
 */
export class Transport {
  /** Seconds into the loop. */
  time = 0;
  loop = 1;
  playing = true;
  rate = 1;
  /** Seconds one frame step moves. */
  frame = 1 / 60;
  /** The animation at the current moment, written by the stage. */
  readout: Readout | null = null;
  private version = 0;
  private sinceNotify = 0;
  private readonly listeners = new Set<() => void>();

  private wrap(time: number) {
    return ((time % this.loop) + this.loop) % this.loop;
  }

  setLoop(loop: number) {
    if (loop === this.loop) return;
    this.loop = loop;
    this.time = this.wrap(this.time);
    this.notify();
  }

  /** Move on by `delta` seconds of real time; called once a frame. */
  advance(delta: number) {
    if (this.playing) this.time = this.wrap(this.time + delta * this.rate);
    this.sinceNotify += delta;
    if (this.sinceNotify >= NOTIFY_INTERVAL) this.notify();
  }

  seek(time: number) {
    this.time = Math.min(Math.max(0, time), this.loop - 1e-6);
    this.notify();
  }

  /** Pause and move by whole frames; negative steps go back. */
  step(frames: number) {
    this.playing = false;
    this.time = this.wrap(this.time + frames * this.frame);
    this.notify();
  }

  setPlaying(playing: boolean) {
    this.playing = playing;
    this.notify();
  }

  setRate(rate: number) {
    this.rate = rate;
    this.notify();
  }

  private notify() {
    this.sinceNotify = 0;
    this.version++;
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = () => this.version;
}

/** Re-render with the transport, at most every NOTIFY_INTERVAL while it plays. */
export function useTransport(transport: Transport) {
  useSyncExternalStore(transport.subscribe, transport.getVersion);
  return transport;
}
