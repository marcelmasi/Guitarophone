/** Messages from the app to the guitar sound processor in the audio thread. */
export type GuitarMessage =
  | {
      type: 'pluck';
      stringIndex: number;
      /** Loudness from 0 to 1. */
      velocity: number;
      /** Time to wait before the pluck sounds, in seconds. */
      delaySeconds: number;
    }
  /** Sets the pitch in hertz, also while the string rings. With `glide`, the pitch moves there smoothly. */
  | { type: 'setFrequency'; stringIndex: number; frequency: number; glide: boolean }
  | { type: 'mute'; stringIndex: number };

/** Name the guitar sound processor is registered with. */
export const GUITAR_PROCESSOR_NAME = 'guitar-processor';
