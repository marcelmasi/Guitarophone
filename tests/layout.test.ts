import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROPORTIONS,
  Layout,
  MAXIMUM_FRET_COUNT,
  OUTER_STRING_EDGE_DISTANCE,
  limitProportions,
} from '../src/layout';

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

describe('adjustable proportions', () => {
  it('squeezes the strings towards the bottom when there is a top border above the low E string', () => {
    const withoutBorder = new Layout(844, 390, noSafeArea, false);
    const withBorder = new Layout(844, 390, noSafeArea, false, { ...DEFAULT_PROPORTIONS, topBorderShare: 0.3 });
    expect(withBorder.neckTop).toBeCloseTo(390 * 0.3);
    expect(withBorder.stringPositions[0]).toBeGreaterThan(withBorder.neckTop);
    expect(withBorder.stringSpacing).toBeLessThan(withoutBorder.stringSpacing);
    expect(withBorder.stringPositions[5]).toBeCloseTo(withoutBorder.stringPositions[5]);
    expect(withBorder.isAboveNeck(390 * 0.2)).toBe(true);
    expect(withBorder.isAboveNeck(withBorder.stringPositions[0])).toBe(false);
  });

  it('keeps the outer strings away from the top and bottom screen edges', () => {
    const notched = new Layout(874, 402, { top: 0, right: 62, bottom: 21, left: 62 }, false);
    expect(notched.stringPositions[0]).toBeCloseTo(OUTER_STRING_EDGE_DISTANCE);
    expect(notched.stringPositions[5]).toBeCloseTo(402 - OUTER_STRING_EDGE_DISTANCE);
    expect(notched.stringPositions[1] - notched.stringPositions[0]).toBeCloseTo(notched.stringSpacing);
    expect(notched.stringPositions[5] - notched.stringPositions[4]).toBeCloseTo(notched.stringSpacing);
  });

  it('keeps room for the strings on short screens', () => {
    const short = new Layout(600, 200, noSafeArea, false);
    expect(short.stringPositions[0]).toBeGreaterThan(0);
    expect(short.stringSpacing).toBeGreaterThan(200 / 10);
  });

  it('starts the border at the safe area, not at the screen edge', () => {
    const notched = new Layout(844, 390, { top: 12, right: 47, bottom: 21, left: 47 }, false);
    expect(notched.neckTop).toBe(12);
  });

  it('shows the chosen number of frets on the same neck length', () => {
    const fiveFrets = new Layout(844, 390, noSafeArea, false);
    const twelveFrets = new Layout(844, 390, noSafeArea, false, { ...DEFAULT_PROPORTIONS, fretCount: 12 });
    expect(twelveFrets.fretBarAlong(12)).toBeCloseTo(fiveFrets.fretBarAlong(5));
    expect(twelveFrets.fretAt(twelveFrets.strumZoneEnd + 1)).toBe(12);
    expect(fiveFrets.fretAt(fiveFrets.strumZoneEnd + 1)).toBe(5);
  });

  it('moves the border between strum zone and neck', () => {
    const wideStrumZone = new Layout(844, 390, noSafeArea, false, { ...DEFAULT_PROPORTIONS, strumZoneShare: 0.6 });
    expect(wideStrumZone.strumZoneEnd).toBeCloseTo(844 * 0.6);
    expect(wideStrumZone.fretAt(844 * 0.5)).toBeNull();
  });

  it('turns a handle position back into the proportion that puts the handle there', () => {
    const safeArea = { top: 0, right: 62, bottom: 20, left: 62 };
    const proportions = { strumZoneShare: 0.42, fretCount: 7, topBorderShare: 0.2 };
    for (const mirrored of [false, true]) {
      const layout = new Layout(874, 402, safeArea, mirrored, proportions);
      expect(layout.strumZoneShareAt(layout.strumZoneEnd)).toBeCloseTo(0.42);
      expect(layout.topBorderShareAt(layout.neckTop)).toBeCloseTo(0.2);
    }
  });

  it('keeps proportions within their limits', () => {
    expect(limitProportions({ strumZoneShare: 2, fretCount: 40, topBorderShare: -1 })).toEqual({
      strumZoneShare: 0.75,
      fretCount: MAXIMUM_FRET_COUNT,
      topBorderShare: 0,
    });
    expect(limitProportions({ strumZoneShare: 0.01, fretCount: 0.4, topBorderShare: 0.9 }).fretCount).toBe(1);
    expect(limitProportions({ strumZoneShare: NaN, fretCount: 6.6, topBorderShare: NaN })).toEqual({
      strumZoneShare: DEFAULT_PROPORTIONS.strumZoneShare,
      fretCount: 7,
      topBorderShare: 0,
    });
  });
});
