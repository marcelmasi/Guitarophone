export type Tone = 'clean' | 'crunch' | 'lead';

/** Amplifier settings of a tone. */
export interface ToneSettings {
  /**
   * How much the string signal is amplified before the distortion, which bends everything above 1.
   * With 1 a single picked note stays clean; with 600 even a fading note is clipped hard.
   */
  drive: number;
  /** Highest frequency in hertz the speaker cabinet lets through. */
  cabinetCutoff: number;
  /** Volume after the distortion, to keep all tones about equally loud. */
  outputVolume: number;
  /** Share of the signal that goes to the reverb. */
  reverbAmount: number;
}

/** Volume of each string in the mix going into the amplifier, so six strings together do not get too loud. */
export const STRING_VOLUME = 0.3;

export const TONES: Record<Tone, ToneSettings> = {
  clean: { drive: 1, cabinetCutoff: 8000, outputVolume: 3, reverbAmount: 0.25 },
  // Breaks up clearly when picked, and cleans up as the note fades, like a real crunch amp.
  crunch: { drive: 70, cabinetCutoff: 5000, outputVolume: 0.2, reverbAmount: 0.18 },
  // So much drive that the note stays distorted while it rings out, which gives the long lead sustain.
  lead: { drive: 600, cabinetCutoff: 4200, outputVolume: 0.15, reverbAmount: 0.22 },
};
