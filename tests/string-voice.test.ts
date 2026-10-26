import { describe, expect, it } from 'vitest';
import { StringVoice } from '../src/audio/string-voice';

const SAMPLE_RATE = 48000;

/** Deterministic random numbers, so the tests always hear the same pluck. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function render(voice: StringVoice, sampleCount: number): Float32Array {
  const samples = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index++) samples[index] = voice.nextSample();
  return samples;
}

/** Estimates the fundamental frequency in hertz with autocorrelation. */
function estimatePitch(samples: Float32Array, lowestFrequency: number, highestFrequency: number): number {
  const shortestPeriod = Math.floor(SAMPLE_RATE / highestFrequency);
  const longestPeriod = Math.ceil(SAMPLE_RATE / lowestFrequency);
  const correlation = (lag: number) => {
    let sum = 0;
    for (let index = 0; index + lag < samples.length; index++) sum += samples[index] * samples[index + lag];
    return sum;
  };
  let bestLag = shortestPeriod;
  for (let lag = shortestPeriod; lag <= longestPeriod; lag++) {
    if (correlation(lag) > correlation(bestLag)) bestLag = lag;
  }
  // Refine between samples with a parabola through the peak and its neighbours.
  const before = correlation(bestLag - 1);
  const peak = correlation(bestLag);
  const after = correlation(bestLag + 1);
  const offset = (0.5 * (before - after)) / (before - 2 * peak + after);
  return SAMPLE_RATE / (bestLag + offset);
}

function loudness(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

describe('string voice', () => {
  for (const frequency of [82.41, 110, 196, 329.63, 440]) {
    it(`sounds at ${frequency} Hz`, () => {
      const voice = new StringVoice(SAMPLE_RATE, frequency, 5, seededRandom(1));
      voice.pluck(0.8);
      render(voice, 2000);
      const pitch = estimatePitch(render(voice, 8192), frequency * 0.8, frequency * 1.25);
      // Within 3 cents of the target.
      expect(Math.abs(1200 * Math.log2(pitch / frequency))).toBeLessThan(3);
    });
  }

  it('is silent until plucked', () => {
    const voice = new StringVoice(SAMPLE_RATE, 110, 5, seededRandom(1));
    expect(loudness(render(voice, 1000))).toBe(0);
  });

  it('changes pitch while ringing (hammer-on)', () => {
    const voice = new StringVoice(SAMPLE_RATE, 110, 5, seededRandom(2));
    voice.pluck(0.8);
    render(voice, 4000);
    const hammeredFrequency = 110 * 2 ** (2 / 12);
    voice.setFrequency(hammeredFrequency);
    render(voice, 2000);
    const ringing = render(voice, 8192);
    expect(loudness(ringing)).toBeGreaterThan(0.05);
    const pitch = estimatePitch(ringing, 100, 140);
    expect(Math.abs(1200 * Math.log2(pitch / hammeredFrequency))).toBeLessThan(5);
  });

  it('fades out quickly when muted', () => {
    const voice = new StringVoice(SAMPLE_RATE, 110, 5, seededRandom(3));
    voice.pluck(1);
    const before = loudness(render(voice, 4800));
    voice.mute();
    render(voice, 9600);
    expect(loudness(render(voice, 4800))).toBeLessThan(before * 0.01);
  });

  it('keeps ringing for seconds when not muted', () => {
    const voice = new StringVoice(SAMPLE_RATE, 110, 5, seededRandom(4));
    voice.pluck(1);
    // Skip the attack, whose bright overtones fade fast, like on a real string.
    render(voice, 4800);
    const afterAttack = loudness(render(voice, 4800));
    render(voice, SAMPLE_RATE);
    // A sustain of 5 s means -12 dB per second for the fundamental, more for the overtones.
    expect(loudness(render(voice, 4800))).toBeGreaterThan(afterAttack * 0.1);
  });

  it('is louder when plucked harder', () => {
    const soft = new StringVoice(SAMPLE_RATE, 196, 5, seededRandom(5));
    const hard = new StringVoice(SAMPLE_RATE, 196, 5, seededRandom(5));
    soft.pluck(0.3);
    hard.pluck(1);
    expect(loudness(render(hard, 4800))).toBeGreaterThan(loudness(render(soft, 4800)) * 2);
  });

  it('glides smoothly to a new pitch, like a bent string', () => {
    const voice = new StringVoice(SAMPLE_RATE, 196, 5, seededRandom(6));
    voice.pluck(0.8);
    render(voice, 2000);
    const bentFrequency = 196 * 2 ** (2 / 12);
    voice.setFrequency(bentFrequency, true);
    // Right after the change, the pitch is still on its way up.
    const halfway = estimatePitch(render(voice, 2048), 180, 240);
    expect(halfway).toBeGreaterThan(196 * 1.005);
    expect(halfway).toBeLessThan(bentFrequency * 0.995);
    // A little later it has arrived.
    render(voice, 2000);
    const arrived = estimatePitch(render(voice, 8192), 180, 240);
    expect(Math.abs(1200 * Math.log2(arrived / bentFrequency))).toBeLessThan(3);
  });
});
