import { describe, expect, it } from 'vitest';
import { fretChangeEffect, noteName, stringFrequency, stringNote } from '../src/guitar';

describe('tuning', () => {
  it('has standard tuning on the open strings', () => {
    const openFrequencies = [0, 1, 2, 3, 4, 5].map((stringIndex) => stringFrequency(stringIndex, 0));
    const expected = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];
    openFrequencies.forEach((frequency, index) => expect(frequency).toBeCloseTo(expected[index], 1));
  });

  it('raises the pitch by one semitone per fret', () => {
    expect(noteName(stringNote(0, 1))).toBe('F');
    expect(noteName(stringNote(1, 3))).toBe('C');
    expect(noteName(stringNote(5, 5))).toBe('A');
    // The fifth fret of one string matches the next open string, except for the G string.
    expect(stringNote(0, 5)).toBe(stringNote(1, 0));
    expect(stringNote(3, 4)).toBe(stringNote(4, 0));
  });

  it('mutes a string only when the last finger is lifted', () => {
    expect(fretChangeEffect(3, 0)).toBe('mute');
    expect(fretChangeEffect(3, 1)).toBe('pitch');
    expect(fretChangeEffect(0, 2)).toBe('pitch');
  });
});
