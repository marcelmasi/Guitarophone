import { describe, expect, it } from 'vitest';
import { Layout } from '../src/layout';

const noSafeArea = { top: 0, right: 0, bottom: 0, left: 0 };

describe('layout', () => {
  const layout = new Layout(844, 390, noSafeArea, false);

  it('puts the strum zone on the left and fret 1 next to the nut on the right', () => {
    expect(layout.fretAt(10)).toBeNull();
    expect(layout.fretAt(layout.strumZoneEnd + 1)).toBe(5);
    expect(layout.fretAt(layout.nutPosition - 1)).toBe(1);
    expect(layout.fretAt(layout.nutPosition + 2)).toBe(0);
    expect(layout.fretAt(layout.fretCellCenterAlong(3))).toBe(3);
  });

  it('puts the low E string at the top', () => {
    expect(layout.stringAt(0)).toBe(0);
    expect(layout.stringAt(389)).toBe(5);
    expect(layout.stringAt(layout.stringPositions[2] + 5)).toBe(2);
  });

  it('swaps the sides when mirrored', () => {
    const mirrored = new Layout(844, 390, noSafeArea, true);
    expect(mirrored.fretAt(mirrored.alongFromScreenX(834))).toBeNull();
    expect(mirrored.fretAt(mirrored.alongFromScreenX(mirrored.width - mirrored.nutPosition + 1))).toBe(1);
  });

  it('keeps the guitar inside the safe area', () => {
    const notched = new Layout(844, 390, { top: 0, right: 47, bottom: 21, left: 47 }, false);
    expect(notched.nutPosition).toBeLessThan(844 - 47);
    expect(notched.stringPositions[5]).toBeLessThan(390 - 21);
  });

  it('finds crossed strings in the order they were crossed', () => {
    const [first, second] = layout.stringPositions;
    const downwards = layout.stringCrossings(first - 5, second + 5);
    expect(downwards.map((crossing) => crossing.stringIndex)).toEqual([0, 1]);
    const upwards = layout.stringCrossings(second + 5, first - 5);
    expect(upwards.map((crossing) => crossing.stringIndex)).toEqual([1, 0]);
    expect(upwards[0].fraction).toBeLessThan(upwards[1].fraction);
  });
});
