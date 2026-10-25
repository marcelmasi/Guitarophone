import { describe, expect, it } from 'vitest';
import { StringVoice } from '../src/audio/string-voice';
import { STRING_VOLUME, TONES, type Tone } from '../src/audio/tones';

const SAMPLE_RATE = 48000;

/** A single note on the A string, plucked by a tap, as it arrives at the amplifier. */
function pickedNote(): Float32Array {
  let state = 7;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const voice = new StringVoice(SAMPLE_RATE, 110, 7, random);
  voice.pluck(0.75);
  const samples = new Float32Array(2 * SAMPLE_RATE);
  for (let index = 0; index < samples.length; index++) samples[index] = voice.nextSample() * STRING_VOLUME;
  return samples;
}

/**
 * How much the distortion changes the note, from 0 (untouched) to 1 (nothing of the original shape left):
 * the size of the difference between the amplified and the distorted signal, relative to the amplified signal.
 */
function distortionAmount(tone: Tone, samples: Float32Array): number {
  let differenceSum = 0;
  let signalSum = 0;
  for (const sample of samples) {
    const amplified = sample * TONES[tone].drive;
    differenceSum += (amplified - Math.tanh(amplified)) ** 2;
    signalSum += amplified ** 2;
  }
  return Math.sqrt(differenceSum / signalSum);
}

describe('amp tones', () => {
  const note = pickedNote();
  const attack = note.subarray(0, SAMPLE_RATE / 4);
  const body = note.subarray(SAMPLE_RATE / 4, (3 * SAMPLE_RATE) / 4);
  const ringing = note.subarray(SAMPLE_RATE, 2 * SAMPLE_RATE);

  it('keeps the clean tone clean', () => {
    expect(distortionAmount('clean', attack)).toBeLessThan(0.02);
  });

  it('clearly distorts a single note with crunch', () => {
    expect(distortionAmount('crunch', attack)).toBeGreaterThan(0.3);
  });

  it('distorts a single note heavily with lead, also while it rings out', () => {
    expect(distortionAmount('lead', attack)).toBeGreaterThan(0.7);
    expect(distortionAmount('lead', ringing)).toBeGreaterThan(0.5);
  });

  it('distorts more from clean to crunch to lead', () => {
    const amounts = (['clean', 'crunch', 'lead'] as const).map((tone) => distortionAmount(tone, body));
    expect(amounts[1]).toBeGreaterThan(amounts[0] + 0.1);
    expect(amounts[2]).toBeGreaterThan(amounts[1] + 0.1);
  });
});
