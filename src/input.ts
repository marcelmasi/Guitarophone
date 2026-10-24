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

export interface GuitarInputHandlers {
  /**
   * A string was plucked with a loudness from 0 to 1.
   * `delaySeconds` keeps the time gaps between strings that were crossed in one finger movement.
   */
  onPluck(stringIndex: number, velocity: number, delaySeconds: number): void;
  /** The fret a string is held at changed (0 = open string). */
  onFretChange(stringIndex: number, previousFret: number, newFret: number): void;
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
  stringIndex: number;
  /** Fret held by this finger, 0 if the finger is not on a fret. */
  fret: number;
}

export type GuitarTouch = StrumTouch | FretTouch;

/**
 * Turns finger positions into plucked strings and held frets.
 * A finger that starts in the strum zone strums for as long as it touches the screen.
 * A finger that starts on the neck holds down a string at a fret.
 */
export class GuitarInput {
  readonly touches = new Map<number, GuitarTouch>();
  private currentFrets: number[] = new Array(STRING_COUNT).fill(0);

  constructor(
    private readonly getLayout: () => Layout,
    private readonly handlers: GuitarInputHandlers,
  ) {}

  /** Fret each string is held at (0 = open string). */
  get frets(): readonly number[] {
    return this.currentFrets;
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
      const touch: FretTouch = { role: 'fret', screenX, screenY, stringIndex: 0, fret: 0 };
      this.placeFretTouch(touch, layout);
      this.touches.set(pointerId, touch);
      this.updateFrets();
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
      this.updateFrets();
    }
  }

  pointerUp(pointerId: number): void {
    const touch = this.touches.get(pointerId);
    if (!touch) return;
    this.touches.delete(pointerId);
    if (touch.role === 'fret') this.updateFrets();
  }

  /** Lifts all fingers, e.g. when the app goes to the background. */
  releaseAll(): void {
    this.touches.clear();
    this.updateFrets();
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
    touch.stringIndex = layout.stringAt(touch.screenY);
    // A fretting finger that slides into the strum zone no longer holds a fret.
    touch.fret = layout.fretAt(layout.alongFromScreenX(touch.screenX)) ?? 0;
  }

  /** Each string sounds at the highest fret any finger holds it at, like on a real guitar. */
  private updateFrets(): void {
    const newFrets: number[] = new Array(STRING_COUNT).fill(0);
    for (const touch of this.touches.values()) {
      if (touch.role === 'fret') {
        newFrets[touch.stringIndex] = Math.max(newFrets[touch.stringIndex], touch.fret);
      }
    }
    const previousFrets = this.currentFrets;
    this.currentFrets = newFrets;
    newFrets.forEach((fret, stringIndex) => {
      if (fret !== previousFrets[stringIndex]) {
        this.handlers.onFretChange(stringIndex, previousFrets[stringIndex], fret);
      }
    });
  }
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
