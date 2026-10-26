import { STRING_COUNT } from './guitar';
import type { Layout } from './layout';

/** A finger that touches a string this close to it (as share of the string spacing) plucks it. */
const TAP_PLUCK_DISTANCE = 0.3;
/** Loudness of a string plucked by a tap, from 0 to 1. */
const TAP_VELOCITY = 0.75;
/** Loudness of the slowest strum, from 0 to 1. */
const MINIMUM_STRUM_VELOCITY = 0.3;
/** Finger speed in CSS pixels per millisecond that gives full loudness. */
const FULL_VELOCITY_SPEED = 2;
/** Longest time in milliseconds that the strings of one finger movement are spread over. */
const MAXIMUM_STRUM_SPREAD = 40;
/**
 * Movement across the strings that does nothing yet, as share of the string spacing. Fingers
 * that shift a little while holding a chord keep their notes in tune.
 */
const BEND_CUTOFF = 0.4;
/**
 * Movement beyond the cutoff per semitone of bending, as share of the string spacing. A whole
 * step (2 semitones) needs 0.8 string spacings beyond the cutoff.
 */
const BEND_DISTANCE_PER_SEMITONE = 0.4;
/** Largest bend in semitones. */
export const MAXIMUM_BEND = 3;

/**
 * How far in CSS pixels a finger that moved `movement` CSS pixels across the strings pushes its
 * string sideways: only the movement beyond the cutoff counts, up to the largest bend.
 * The result keeps the direction of the movement.
 */
export function bendOffsetForMovement(movement: number, stringSpacing: number): number {
  const cutoff = BEND_CUTOFF * stringSpacing;
  const largestOffset = MAXIMUM_BEND * BEND_DISTANCE_PER_SEMITONE * stringSpacing;
  return Math.sign(movement) * Math.min(Math.max(Math.abs(movement) - cutoff, 0), largestOffset);
}

/** Bend in semitones of a string pushed sideways by `bendOffset` CSS pixels, in either direction. */
export function bendForOffset(bendOffset: number, stringSpacing: number): number {
  return Math.min(Math.abs(bendOffset) / (BEND_DISTANCE_PER_SEMITONE * stringSpacing), MAXIMUM_BEND);
}

/** How a string is held: at which fret, and how far it is bent up. */
export interface StringState {
  /** Fret the string is held at, 0 for the open string. */
  fret: number;
  /** Bend in semitones, 0 when not bent. */
  bend: number;
}

export interface GuitarInputHandlers {
  /**
   * A string was plucked with a loudness from 0 to 1.
   * `delaySeconds` keeps the time gaps between strings that were crossed in one finger movement.
   */
  onPluck(stringIndex: number, velocity: number, delaySeconds: number): void;
  /** The fret a string is held at or its bend changed. */
  onStringChange(stringIndex: number, previous: StringState, next: StringState): void;
}

/** A finger of the strumming hand. */
export interface StrumTouch {
  role: 'strum';
  screenX: number;
  screenY: number;
  /** Time of the last position in milliseconds. */
  time: number;
  /** String that was plucked by tapping on it and is not plucked again until the finger moves away. */
  restingString: number | null;
}

/** A finger of the fretting hand. */
export interface FretTouch {
  role: 'fret';
  screenX: number;
  screenY: number;
  /** Vertical screen position where the finger first touched. */
  startY: number;
  stringIndex: number;
  /** Fret held by this finger, 0 if the finger is not on a fret. */
  fret: number;
  /** Bend in semitones that this finger pushes its string by. */
  bend: number;
  /** How far in CSS pixels the finger pushed its string sideways, up to the largest bend. */
  bendOffset: number;
}

export type GuitarTouch = StrumTouch | FretTouch;

/**
 * Turns finger positions into plucked strings and held frets.
 * A finger that starts in the strum zone strums for as long as it touches the screen.
 * A finger that starts on the neck holds down a string at a fret.
 */
export class GuitarInput {
  readonly touches = new Map<number, GuitarTouch>();
  /**
   * When on, a fretting finger keeps the string it first pressed, and moving it across the
   * strings bends that string up. When off, moving across the strings switches to the other string.
   */
  bendingEnabled = false;
  private currentStrings: StringState[] = openStrings();

  constructor(
    private readonly getLayout: () => Layout,
    private readonly handlers: GuitarInputHandlers,
  ) {}

  /** How each string is held. */
  get strings(): readonly StringState[] {
    return this.currentStrings;
  }

  /** Fret each string is held at (0 = open string). */
  get frets(): readonly number[] {
    return this.currentStrings.map((string) => string.fret);
  }

  pointerDown(pointerId: number, screenX: number, screenY: number, time: number): void {
    const layout = this.getLayout();
    if (layout.isInStrumZone(layout.alongFromScreenX(screenX))) {
      const touch: StrumTouch = { role: 'strum', screenX, screenY, time, restingString: null };
      const stringIndex = layout.stringAt(screenY);
      const distance = Math.abs(screenY - layout.stringPositions[stringIndex]);
      if (distance <= TAP_PLUCK_DISTANCE * layout.stringSpacing) {
        touch.restingString = stringIndex;
        this.handlers.onPluck(stringIndex, TAP_VELOCITY, 0);
      }
      this.touches.set(pointerId, touch);
    } else {
      const touch: FretTouch = {
        role: 'fret',
        screenX,
        screenY,
        startY: screenY,
        stringIndex: layout.stringAt(screenY),
        fret: 0,
        bend: 0,
        bendOffset: 0,
      };
      this.placeFretTouch(touch, layout);
      this.touches.set(pointerId, touch);
      this.updateStrings();
    }
  }

  pointerMove(pointerId: number, screenX: number, screenY: number, time: number): void {
    const touch = this.touches.get(pointerId);
    if (!touch) return;
    const layout = this.getLayout();
    if (touch.role === 'strum') {
      this.strum(touch, screenY, time, layout);
      touch.screenX = screenX;
      touch.screenY = screenY;
      touch.time = time;
    } else {
      touch.screenX = screenX;
      touch.screenY = screenY;
      this.placeFretTouch(touch, layout);
      this.updateStrings();
    }
  }

  pointerUp(pointerId: number): void {
    const touch = this.touches.get(pointerId);
    if (!touch) return;
    this.touches.delete(pointerId);
    if (touch.role === 'fret') this.updateStrings();
  }

  /** Lifts all fingers, e.g. when the app goes to the background. */
  releaseAll(): void {
    this.touches.clear();
    this.updateStrings();
  }

  private strum(touch: StrumTouch, screenY: number, time: number, layout: Layout): void {
    const elapsedTime = Math.max(time - touch.time, 1);
    const speed = Math.abs(screenY - touch.screenY) / elapsedTime;
    const spreadTime = Math.min(elapsedTime, MAXIMUM_STRUM_SPREAD);
    const velocity =
      MINIMUM_STRUM_VELOCITY + (1 - MINIMUM_STRUM_VELOCITY) * Math.min(speed / FULL_VELOCITY_SPEED, 1);

    const crossings = layout
      .stringCrossings(touch.screenY, screenY)
      .filter((crossing) => crossing.stringIndex !== touch.restingString);
    const firstFraction = crossings[0]?.fraction ?? 0;
    for (const crossing of crossings) {
      const delaySeconds = ((crossing.fraction - firstFraction) * spreadTime) / 1000;
      this.handlers.onPluck(crossing.stringIndex, velocity, delaySeconds);
    }

    if (touch.restingString !== null) {
      const distance = Math.abs(screenY - layout.stringPositions[touch.restingString]);
      if (distance > TAP_PLUCK_DISTANCE * layout.stringSpacing) touch.restingString = null;
    }
  }

  private placeFretTouch(touch: FretTouch, layout: Layout): void {
    // A fretting finger in the strum zone or in the border above the neck holds no fret.
    const fretAtFinger = layout.fretAt(layout.alongFromScreenX(touch.screenX)) ?? 0;
    if (this.bendingEnabled) {
      // The finger keeps its string and pushes it sideways. Like on a real guitar, pushing
      // towards either neighbour string bends the pitch up.
      touch.bendOffset = bendOffsetForMovement(touch.screenY - touch.startY, layout.stringSpacing);
      touch.bend = bendForOffset(touch.bendOffset, layout.stringSpacing);
      touch.fret = layout.isAboveNeck(touch.startY) ? 0 : fretAtFinger;
    } else {
      touch.stringIndex = layout.stringAt(touch.screenY);
      touch.bend = 0;
      touch.bendOffset = 0;
      touch.fret = layout.isAboveNeck(touch.screenY) ? 0 : fretAtFinger;
    }
  }

  /**
   * Each string sounds at the highest fret any finger holds it at, like on a real guitar,
   * bent by the strongest bend of the fingers at that fret.
   */
  private updateStrings(): void {
    const newStrings = openStrings();
    for (const touch of this.touches.values()) {
      if (touch.role !== 'fret' || touch.fret === 0) continue;
      const string = newStrings[touch.stringIndex];
      if (touch.fret > string.fret) {
        string.fret = touch.fret;
        string.bend = touch.bend;
      } else if (touch.fret === string.fret) {
        string.bend = Math.max(string.bend, touch.bend);
      }
    }
    const previousStrings = this.currentStrings;
    this.currentStrings = newStrings;
    newStrings.forEach((next, stringIndex) => {
      const previous = previousStrings[stringIndex];
      if (next.fret !== previous.fret || next.bend !== previous.bend) {
        this.handlers.onStringChange(stringIndex, previous, next);
      }
    });
  }
}

function openStrings(): StringState[] {
  return Array.from({ length: STRING_COUNT }, () => ({ fret: 0, bend: 0 }));
}

/** Connects pointer events (fingers, and the mouse on desktop) of an element to the guitar input. */
export function attachPointerEvents(element: HTMLElement, input: GuitarInput): void {
  const position = (event: PointerEvent) => {
    const bounds = element.getBoundingClientRect();
    return { screenX: event.clientX - bounds.left, screenY: event.clientY - bounds.top };
  };

  element.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    const { screenX, screenY } = position(event);
    input.pointerDown(event.pointerId, screenX, screenY, event.timeStamp);
  });

  element.addEventListener('pointermove', (event) => {
    event.preventDefault();
    // Coalesced events give every position the finger passed, which makes fast strums accurate.
    const events = event.getCoalescedEvents?.() ?? [];
    for (const pointerEvent of events.length > 0 ? events : [event]) {
      const { screenX, screenY } = position(pointerEvent);
      input.pointerMove(event.pointerId, screenX, screenY, pointerEvent.timeStamp);
    }
  });

  const release = (event: PointerEvent) => input.pointerUp(event.pointerId);
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  element.addEventListener('lostpointercapture', release);
}
