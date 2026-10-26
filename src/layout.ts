import { STRING_COUNT } from './guitar';

/** Screen edges covered by notches, rounded corners or the home indicator, in CSS pixels. */
export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Sizes of the guitar parts that the player can adjust. */
export interface GuitarProportions {
  /** Share of the usable width used for strumming. The rest is the neck. */
  strumZoneShare: number;
  /** Number of frets (bars) on the neck. */
  fretCount: number;
  /** Empty border above the low E string, as share of the usable height. It makes the neck narrower. */
  topBorderShare: number;
}

export const DEFAULT_PROPORTIONS: GuitarProportions = {
  strumZoneShare: 0.36,
  fretCount: 5,
  topBorderShare: 0,
};

export const MINIMUM_STRUM_ZONE_SHARE = 0.15;
export const MAXIMUM_STRUM_ZONE_SHARE = 0.75;
export const MINIMUM_FRET_COUNT = 1;
export const MAXIMUM_FRET_COUNT = 12;
/** Largest border, so that the strings keep at least about half of the height. */
export const MAXIMUM_TOP_BORDER_SHARE = 0.45;

/** Keeps proportions within their limits. Values that are not numbers fall back to the defaults. */
export function limitProportions(proportions: GuitarProportions): GuitarProportions {
  const limit = (value: number, minimum: number, maximum: number, fallback: number) =>
    Number.isFinite(value) ? Math.min(Math.max(value, minimum), maximum) : fallback;
  return {
    strumZoneShare: limit(
      proportions.strumZoneShare,
      MINIMUM_STRUM_ZONE_SHARE,
      MAXIMUM_STRUM_ZONE_SHARE,
      DEFAULT_PROPORTIONS.strumZoneShare,
    ),
    fretCount: Math.round(
      limit(proportions.fretCount, MINIMUM_FRET_COUNT, MAXIMUM_FRET_COUNT, DEFAULT_PROPORTIONS.fretCount),
    ),
    topBorderShare: limit(
      proportions.topBorderShare,
      0,
      MAXIMUM_TOP_BORDER_SHARE,
      DEFAULT_PROPORTIONS.topBorderShare,
    ),
  };
}

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
  /** Along value where the strum zone ends and the neck (highest fret) starts. */
  readonly strumZoneEnd: number;
  /** Along value of the nut edge facing the frets. */
  readonly nutPosition: number;
  /** Number of frets on the neck. */
  readonly fretCount: number;
  /** Width of one fret cell in CSS pixels. */
  readonly fretWidth: number;
  /** Vertical screen position of the upper edge of the neck, where the top border ends. */
  readonly neckTop: number;
  /** Vertical screen position of each string, index 0 (low E) at the top. */
  readonly stringPositions: number[];
  /** Vertical distance between two neighbouring strings in CSS pixels. */
  readonly stringSpacing: number;
  /** Width in CSS pixels outside the safe area on the strum side. */
  private readonly strumSideInset: number;
  /** Width and height in CSS pixels inside the safe area. */
  private readonly usableWidth: number;
  private readonly usableHeight: number;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly safeArea: SafeArea,
    readonly mirrored: boolean,
    proportions: GuitarProportions = DEFAULT_PROPORTIONS,
  ) {
    this.strumSideInset = mirrored ? safeArea.right : safeArea.left;
    const nutSideInset = mirrored ? safeArea.left : safeArea.right;
    this.usableWidth = width - this.strumSideInset - nutSideInset;
    this.usableHeight = height - safeArea.top - safeArea.bottom;

    this.nutPosition = width - nutSideInset - NUT_WIDTH;
    this.strumZoneEnd = this.strumSideInset + this.usableWidth * proportions.strumZoneShare;
    this.fretCount = proportions.fretCount;
    this.fretWidth = (this.nutPosition - this.strumZoneEnd) / this.fretCount;

    this.neckTop = safeArea.top + this.usableHeight * proportions.topBorderShare;
    this.stringSpacing = (height - safeArea.bottom - this.neckTop) / STRING_COUNT;
    this.stringPositions = Array.from(
      { length: STRING_COUNT },
      (_, stringIndex) => this.neckTop + this.stringSpacing * (stringIndex + 0.5),
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

  /** Strum zone share that puts the end of the strum zone at the given along value. */
  strumZoneShareAt(along: number): number {
    return (along - this.strumSideInset) / this.usableWidth;
  }

  /** Top border share that puts the upper edge of the neck at the given vertical screen position. */
  topBorderShareAt(screenY: number): number {
    return (screenY - this.safeArea.top) / this.usableHeight;
  }

  isInStrumZone(along: number): boolean {
    return along < this.strumZoneEnd;
  }

  /** True above the neck, in the top border. */
  isAboveNeck(screenY: number): boolean {
    return screenY < this.neckTop;
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
    return Math.min(Math.max(fret, 1), this.fretCount);
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
