import { beforeEach, describe, expect, it } from 'vitest';
import { GuitarInput, MAXIMUM_BEND, type StringState, bendOffsetForMovement } from '../src/input';
import { DEFAULT_PROPORTIONS, Layout } from '../src/layout';

const layout = new Layout(844, 390, { top: 0, right: 0, bottom: 0, left: 0 }, false);

describe('guitar input', () => {
  let plucks: { stringIndex: number; velocity: number; delaySeconds: number }[];
  let fretChanges: [number, number, number][];
  let stringChanges: [number, StringState, StringState][];
  let input: GuitarInput;

  beforeEach(() => {
    plucks = [];
    fretChanges = [];
    stringChanges = [];
    input = new GuitarInput(() => layout, {
      onPluck: (stringIndex, velocity, delaySeconds) => plucks.push({ stringIndex, velocity, delaySeconds }),
      onStringChange: (stringIndex, previous, next) => {
        stringChanges.push([stringIndex, previous, next]);
        if (previous.fret !== next.fret) fretChanges.push([stringIndex, previous.fret, next.fret]);
      },
    });
  });

  it('plucks all six strings in order when strumming down', () => {
    input.pointerDown(1, 100, 2, 0);
    input.pointerMove(1, 100, 388, 30);
    expect(plucks.map((pluck) => pluck.stringIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(plucks[0].delaySeconds).toBe(0);
    expect(plucks[5].delaySeconds).toBeGreaterThan(plucks[4].delaySeconds);
  });

  it('plucks in reverse order when strumming up', () => {
    input.pointerDown(1, 100, 388, 0);
    input.pointerMove(1, 100, 2, 30);
    expect(plucks.map((pluck) => pluck.stringIndex)).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it('plays louder for faster strums', () => {
    input.pointerDown(1, 100, 2, 0);
    input.pointerMove(1, 100, 388, 400);
    const slow = plucks[0].velocity;
    plucks = [];
    input.pointerDown(2, 100, 2, 1000);
    input.pointerMove(2, 100, 388, 1040);
    expect(plucks[0].velocity).toBeGreaterThan(slow);
  });

  it('plucks a tapped string once, also when the finger wiggles on it', () => {
    const stringY = layout.stringPositions[2];
    input.pointerDown(1, 100, stringY + 3, 0);
    input.pointerMove(1, 100, stringY - 3, 10);
    input.pointerMove(1, 100, stringY + 3, 20);
    expect(plucks.map((pluck) => pluck.stringIndex)).toEqual([2]);
  });

  it('holds a chord and sounds each string at its highest held fret', () => {
    // C major: A string fret 3, D string fret 2, B string fret 1.
    input.pointerDown(1, layout.fretCellCenterAlong(3), layout.stringPositions[1], 0);
    input.pointerDown(2, layout.fretCellCenterAlong(2), layout.stringPositions[2], 0);
    input.pointerDown(3, layout.fretCellCenterAlong(1), layout.stringPositions[4], 0);
    expect(input.frets).toEqual([0, 3, 2, 0, 1, 0]);

    // A second finger higher up on the same string wins.
    input.pointerDown(4, layout.fretCellCenterAlong(5), layout.stringPositions[4], 0);
    expect(input.frets[4]).toBe(5);
    input.pointerUp(4);
    expect(input.frets[4]).toBe(1);
    expect(fretChanges.at(-1)).toEqual([4, 5, 1]);

    input.releaseAll();
    expect(input.frets).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('slides along the neck', () => {
    input.pointerDown(1, layout.fretCellCenterAlong(1), layout.stringPositions[0], 0);
    input.pointerMove(1, layout.fretCellCenterAlong(4), layout.stringPositions[0], 10);
    expect(fretChanges).toEqual([
      [0, 0, 1],
      [0, 1, 4],
    ]);
  });

  it('does not pluck with a fretting finger', () => {
    input.pointerDown(1, layout.fretCellCenterAlong(2), layout.stringPositions[0], 0);
    input.pointerMove(1, layout.fretCellCenterAlong(2), layout.stringPositions[5], 10);
    expect(plucks).toEqual([]);
  });

  it('holds nothing with a finger in the border above the neck', () => {
    const borderLayout = new Layout(844, 390, { top: 0, right: 0, bottom: 0, left: 0 }, false, {
      ...DEFAULT_PROPORTIONS,
      topBorderShare: 0.3,
    });
    const borderInput = new GuitarInput(() => borderLayout, {
      onPluck: () => {},
      onStringChange: () => {},
    });
    const fretAlong = borderLayout.fretCellCenterAlong(2);
    borderInput.pointerDown(1, fretAlong, 10, 0);
    expect(borderInput.frets).toEqual([0, 0, 0, 0, 0, 0]);
    // Moving down onto the neck holds the low E string.
    borderInput.pointerMove(1, fretAlong, borderLayout.stringPositions[0], 10);
    expect(borderInput.frets[0]).toBe(2);
  });

  it('switches strings when moving across the neck while bending is off', () => {
    input.pointerDown(1, layout.fretCellCenterAlong(2), layout.stringPositions[3], 0);
    input.pointerMove(1, layout.fretCellCenterAlong(2), layout.stringPositions[2], 10);
    expect(input.strings[3]).toEqual({ fret: 0, bend: 0 });
    expect(input.strings[2]).toEqual({ fret: 2, bend: 0 });
  });

  describe('with bending on', () => {
    /** Finger movement for a whole step: 0.4 string spacings cutoff plus 0.8 for 2 semitones. */
    const wholeStep = layout.stringSpacing * 1.2;

    beforeEach(() => {
      input.bendingEnabled = true;
    });

    it('keeps the string and bends it up a whole step when pushed far enough', () => {
      const stringY = layout.stringPositions[3];
      input.pointerDown(1, layout.fretCellCenterAlong(5), stringY, 0);
      input.pointerMove(1, layout.fretCellCenterAlong(5), stringY - wholeStep, 10);
      expect(input.strings[3].fret).toBe(5);
      expect(input.strings[3].bend).toBeCloseTo(2);
      expect(input.strings[2]).toEqual({ fret: 0, bend: 0 });
    });

    it('bends up in both directions, like on a real guitar', () => {
      const stringY = layout.stringPositions[2];
      input.pointerDown(1, layout.fretCellCenterAlong(3), stringY, 0);
      input.pointerMove(1, layout.fretCellCenterAlong(3), stringY + wholeStep, 10);
      expect(input.strings[2].bend).toBeCloseTo(2);
    });

    it('does nothing while the finger stays within the cutoff, so chords stay in tune', () => {
      const stringY = layout.stringPositions[1];
      input.pointerDown(1, layout.fretCellCenterAlong(3), stringY, 0);
      input.pointerMove(1, layout.fretCellCenterAlong(3), stringY + layout.stringSpacing * 0.38, 10);
      expect(input.strings[1]).toEqual({ fret: 3, bend: 0 });
      // The string is not drawn pushed either.
      const touch = input.touches.get(1);
      expect(touch?.role === 'fret' && touch.bendOffset).toBe(0);
      // Just beyond the cutoff, the bend starts gently.
      input.pointerMove(1, layout.fretCellCenterAlong(3), stringY + layout.stringSpacing * 0.5, 20);
      expect(input.strings[1].bend).toBeCloseTo(0.25);
    });

    it('limits the bend and the drawn push to the largest bend', () => {
      const stringY = layout.stringPositions[0];
      input.pointerDown(1, layout.fretCellCenterAlong(3), stringY, 0);
      input.pointerMove(1, layout.fretCellCenterAlong(3), stringY + layout.stringSpacing * 5, 10);
      expect(input.strings[0].bend).toBe(MAXIMUM_BEND);
      const touch = input.touches.get(1);
      expect(touch?.role === 'fret' && touch.bendOffset).toBeCloseTo(layout.stringSpacing * 1.2);
    });

    it('reports a bend on the same fret as a string change and releases it when moving back', () => {
      const stringY = layout.stringPositions[4];
      input.pointerDown(1, layout.fretCellCenterAlong(4), stringY, 0);
      input.pointerMove(1, layout.fretCellCenterAlong(4), stringY - layout.stringSpacing * 0.8, 10);
      input.pointerMove(1, layout.fretCellCenterAlong(4), stringY, 20);
      const changes = stringChanges.map(([stringIndex, , next]) => [stringIndex, next.fret, Number(next.bend.toFixed(2))]);
      expect(changes).toEqual([
        [4, 4, 0],
        [4, 4, 1],
        [4, 4, 0],
      ]);
    });

    it('takes the bend of the finger at the sounding fret, not of a finger behind it', () => {
      const stringY = layout.stringPositions[3];
      input.pointerDown(1, layout.fretCellCenterAlong(5), stringY, 0);
      input.pointerDown(2, layout.fretCellCenterAlong(3), stringY, 0);
      input.pointerMove(2, layout.fretCellCenterAlong(3), stringY - wholeStep, 10);
      expect(input.strings[3]).toEqual({ fret: 5, bend: 0 });
      input.pointerMove(1, layout.fretCellCenterAlong(5), stringY - wholeStep, 20);
      expect(input.strings[3].bend).toBeCloseTo(2);
    });

    it('does not bend an open string', () => {
      expect(bendOffsetForMovement(-100, 60)).toBeLessThan(0);
      input.pointerDown(1, layout.nutPosition + 3, layout.stringPositions[2], 0);
      input.pointerMove(1, layout.nutPosition + 3, layout.stringPositions[1], 10);
      expect(input.strings[2]).toEqual({ fret: 0, bend: 0 });
    });
  });
});
