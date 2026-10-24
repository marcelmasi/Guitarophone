import { beforeEach, describe, expect, it } from 'vitest';
import { GuitarInput } from '../src/input';
import { Layout } from '../src/layout';

const layout = new Layout(844, 390, { top: 0, right: 0, bottom: 0, left: 0 }, false);

describe('guitar input', () => {
  let plucks: { stringIndex: number; velocity: number; delaySeconds: number }[];
  let fretChanges: [number, number, number][];
  let input: GuitarInput;

  beforeEach(() => {
    plucks = [];
    fretChanges = [];
    input = new GuitarInput(() => layout, {
      onPluck: (stringIndex, velocity, delaySeconds) => plucks.push({ stringIndex, velocity, delaySeconds }),
      onFretChange: (stringIndex, previousFret, newFret) => fretChanges.push([stringIndex, previousFret, newFret]),
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
});
