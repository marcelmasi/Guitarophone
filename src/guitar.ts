/** Number of strings on the guitar. */
export const STRING_COUNT = 6;

/**
 * MIDI note numbers of the open strings in standard tuning (E2 A2 D3 G3 B3 E4).
 * Index 0 is the thickest string (low E), index 5 the thinnest (high E).
 */
export const OPEN_STRING_NOTES: readonly number[] = [40, 45, 50, 55, 59, 64];

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** MIDI note number of a string when held down at the given fret (0 = open string). */
export function stringNote(stringIndex: number, fret: number): number {
  return OPEN_STRING_NOTES[stringIndex] + fret;
}

/** Frequency in hertz of a MIDI note number (A4 = 69 = 440 Hz). */
export function noteFrequency(midiNote: number): number {
  return 440 * 2 ** ((midiNote - 69) / 12);
}

/**
 * Frequency in hertz of a string when held down at the given fret (0 = open string)
 * and bent up by `bend` semitones.
 */
export function stringFrequency(stringIndex: number, fret: number, bend = 0): number {
  return noteFrequency(stringNote(stringIndex, fret) + bend);
}

/** Note name without octave, e.g. "F♯". */
export function noteName(midiNote: number): string {
  return NOTE_NAMES[((midiNote % 12) + 12) % 12];
}

/**
 * What happens to a ringing string when the fret it is held at changes.
 * - "pitch": the string keeps ringing at the new pitch (hammer-on, pull-off, slide).
 * - "mute": the last finger was lifted, which damps the string like on a real guitar.
 */
export type FretChange = 'pitch' | 'mute';

export function fretChangeEffect(previousFret: number, newFret: number): FretChange {
  return newFret === 0 && previousFret > 0 ? 'mute' : 'pitch';
}
