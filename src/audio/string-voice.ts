/** Length of the delay line in samples. Enough for 20 Hz at 48 kHz. */
const BUFFER_LENGTH = 4096;
/** Time in seconds for a damped string to fade by 60 dB. */
const MUTED_SUSTAIN = 0.1;
/** Share of the old vibration that remains when a ringing string is plucked again. */
const REPLUCK_REMAINDER = 0.25;
/** Position of the pick from the bridge, as share of the vibrating string length. */
const PICK_POSITION = 0.13;
/** Time in seconds for a gliding pitch change to cover about two thirds of the way. Smooths bends. */
const GLIDE_TIME = 0.008;

/**
 * One guitar string, simulated with the Karplus-Strong method: a burst of noise circulates
 * in a delay line whose length sets the pitch. A small low-pass filter in the loop makes
 * high overtones fade faster than the fundamental, like on a real string.
 *
 * The delay length can change while the string rings, which gives hammer-ons, pull-offs
 * and slides for free.
 */
export class StringVoice {
  private readonly buffer = new Float32Array(BUFFER_LENGTH);
  private readonly excitation = new Float32Array(BUFFER_LENGTH);
  private writeIndex = 0;
  /** Delay in samples between writing and reading the loop. */
  private delay = 0;
  /** Delay that a gliding pitch change moves towards. */
  private targetDelay = 0;
  /** Share of the remaining way to `targetDelay` that is covered per sample. */
  private readonly glideStep: number;
  /** Gain applied once per round through the loop. Sets how long the string rings. */
  private loopGain = 1;
  private frequency = 0;
  private muted = false;

  /**
   * @param sampleRate Sample rate in hertz.
   * @param frequency Pitch in hertz.
   * @param sustain Time in seconds for a freely ringing string to fade by 60 dB.
   * @param random Source of random numbers between 0 and 1, replaceable for tests.
   */
  constructor(
    private readonly sampleRate: number,
    frequency: number,
    private readonly sustain: number,
    private readonly random: () => number = Math.random,
  ) {
    this.glideStep = 1 - Math.exp(-1 / (GLIDE_TIME * sampleRate));
    this.setFrequency(frequency);
  }

  /**
   * Sets the pitch in hertz. With `glide`, the pitch moves smoothly to the new value, like a
   * bent string; without, it jumps, like a finger landing on another fret.
   */
  setFrequency(frequency: number, glide = false): void {
    this.frequency = frequency;
    // The averaging filter in the loop adds half a sample of delay.
    this.targetDelay = Math.min(this.sampleRate / frequency - 0.5, BUFFER_LENGTH - 2);
    if (!glide) this.delay = this.targetDelay;
    this.updateLoopGain();
  }

  /** Plucks the string with a loudness from 0 to 1. Harder plucks also sound brighter. */
  pluck(velocity: number): void {
    this.muted = false;
    this.updateLoopGain();

    const length = Math.max(Math.round(this.sampleRate / this.frequency), 2);
    // Low-passed noise: the harder the pluck, the more high overtones.
    const smoothing = 0.25 + 0.65 * velocity;
    let lowPassed = 0;
    for (let index = 0; index < length; index++) {
      lowPassed += smoothing * (this.random() * 2 - 1 - lowPassed);
      this.excitation[index] = lowPassed;
    }
    // Picking at a point on the string cancels the overtones that have a node there.
    const pickOffset = Math.max(Math.round(PICK_POSITION * length), 1);
    for (let index = length - 1; index >= pickOffset; index--) {
      this.excitation[index] -= this.excitation[index - pickOffset];
    }
    // Remove any constant offset, which would otherwise circulate in the loop.
    let sum = 0;
    for (let index = 0; index < length; index++) sum += this.excitation[index];
    const mean = sum / length;
    let peak = 0;
    for (let index = 0; index < length; index++) {
      this.excitation[index] -= mean;
      peak = Math.max(peak, Math.abs(this.excitation[index]));
    }

    // Write the burst into the part of the loop that is read next.
    const scale = peak > 0 ? velocity / peak : 0;
    for (let index = 0; index < length; index++) {
      const bufferIndex = (this.writeIndex - length + index + BUFFER_LENGTH) % BUFFER_LENGTH;
      this.buffer[bufferIndex] =
        this.buffer[bufferIndex] * REPLUCK_REMAINDER + this.excitation[index] * scale;
    }
  }

  /** Damps the string, like a finger lifted from a fret or a palm laid on the strings. */
  mute(): void {
    this.muted = true;
    this.updateLoopGain();
  }

  nextSample(): number {
    if (this.delay !== this.targetDelay) {
      this.delay += (this.targetDelay - this.delay) * this.glideStep;
      if (Math.abs(this.targetDelay - this.delay) < 1e-4) this.delay = this.targetDelay;
    }
    const sample = this.loopGain * 0.5 * (this.read(this.delay) + this.read(this.delay + 1));
    this.buffer[this.writeIndex] = sample;
    this.writeIndex = (this.writeIndex + 1) % BUFFER_LENGTH;
    return sample;
  }

  /** Reads the loop `delay` samples back in time, interpolating between samples. */
  private read(delay: number): number {
    const position = this.writeIndex - delay + BUFFER_LENGTH;
    const wholePart = Math.floor(position);
    const fraction = position - wholePart;
    const earlier = this.buffer[wholePart % BUFFER_LENGTH];
    const later = this.buffer[(wholePart + 1) % BUFFER_LENGTH];
    return earlier + (later - earlier) * fraction;
  }

  private updateLoopGain(): void {
    const sustain = this.muted ? MUTED_SUSTAIN : this.sustain;
    // Fade by 60 dB (factor 1000) over `sustain` seconds, that is over frequency * sustain rounds.
    this.loopGain = 10 ** (-3 / (this.frequency * sustain));
  }
}
