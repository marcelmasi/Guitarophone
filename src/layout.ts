import { FRET_COUNT, STRING_COUNT } from './guitar';

/** Screen edges covered by notches, rounded corners or the home indicator, in CSS pixels. */
export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Share of the usable width that is used for strumming. The rest is the neck. */
const STRUM_ZONE_SHARE = 0.36;

/** Width of the nut in CSS pixels. */
export const NUT_WIDTH = 10;

/**
 * Geometry of the guitar on screen.
 *
 * Positions along the strings are measured as "along" values: 0 is the screen edge on the
 * strum side and the value grows towards the nut. Normally the strum side is the left edge.
 * When `mirrored` is set, the strum side is the right edge.
 */
export class Layout {
  /** Along value where the strum zone ends and the neck (fret 5) starts. */
  readonly strumZoneEnd: number;
  /** Along value of the nut edge facing the frets. */
  readonly nutPosition: number;
  /** Width of one fret cell in CSS pixels. */
  readonly fretWidth: number;
  /** Vertical screen position of each string, index 0 (low E) at the top. */
  readonly stringPositions: number[];
  /** Vertical distance between two neighbouring strings in CSS pixels. */
  readonly stringSpacing: number;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly safeArea: SafeArea,
    readonly mirrored: boolean,
  ) {
    const strumSideInset = mirrored ? safeArea.right : safeArea.left;
    const nutSideInset = mirrored ? safeArea.left : safeArea.right;
    const usableWidth = width - strumSideInset - nutSideInset;

    this.nutPosition = width - nutSideInset - NUT_WIDTH;
    this.strumZoneEnd = strumSideInset + usableWidth * STRUM_ZONE_SHARE;
    this.fretWidth = (this.nutPosition - this.strumZoneEnd) / FRET_COUNT;

    const usableHeight = height - safeArea.top - safeArea.bottom;
    this.stringSpacing = usableHeight / STRING_COUNT;
    this.stringPositions = Array.from(
      { length: STRING_COUNT },
      (_, stringIndex) => safeArea.top + this.stringSpacing * (stringIndex + 0.5),
    );
  }

  /** Converts a horizontal screen position to an along value. */
  alongFromScreenX(screenX: number): number {
    return this.mirrored ? this.width - screenX : screenX;
  }

  /** Converts an along value to a horizontal screen position. */
  screenXFromAlong(along: number): number {
    return this.mirrored ? this.width - along : along;
  }

  isInStrumZone(along: number): boolean {
    return along < this.strumZoneEnd;
  }

  /** Along value of the fret bar with the given number (0 = nut). */
  fretBarAlong(fret: number): number {
    return this.nutPosition - fret * this.fretWidth;
  }

  /** Along value of the middle of the cell where a finger holds the given fret. */
  fretCellCenterAlong(fret: number): number {
    return this.nutPosition - (fret - 0.5) * this.fretWidth;
  }

  /**
   * Fret held by a finger at the given along value.
   * Returns 0 on the nut or headstock and null in the strum zone.
   */
  fretAt(along: number): number | null {
    if (this.isInStrumZone(along)) return null;
    if (along >= this.nutPosition) return 0;
    const fret = Math.floor((this.nutPosition - along) / this.fretWidth) + 1;
    return Math.min(Math.max(fret, 1), FRET_COUNT);
  }

  /** Index of the string closest to the given vertical screen position. */
  stringAt(screenY: number): number {
    const stringIndex = Math.round((screenY - this.stringPositions[0]) / this.stringSpacing);
    return Math.min(Math.max(stringIndex, 0), STRING_COUNT - 1);
  }

  /**
   * Strings crossed by a finger moving vertically from `previousY` to `currentY`.
   * `fraction` tells how far along the movement the string was crossed (0 to 1),
   * and the result is sorted in the order the strings were crossed.
   */
  stringCrossings(previousY: number, currentY: number): { stringIndex: number; fraction: number }[] {
    const crossings: { stringIndex: number; fraction: number }[] = [];
    if (previousY === currentY) return crossings;
    this.stringPositions.forEach((stringY, stringIndex) => {
      const wasAbove = previousY < stringY;
      const isAbove = currentY < stringY;
      if (wasAbove !== isAbove) {
        crossings.push({ stringIndex, fraction: (stringY - previousY) / (currentY - previousY) });
      }
    });
    return crossings.sort((first, second) => first.fraction - second.fraction);
  }
}
