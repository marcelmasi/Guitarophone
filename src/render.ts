import { STRING_COUNT, noteName, stringNote } from './guitar';
import type { GuitarInput } from './input';
import { type Layout, NUT_WIDTH } from './layout';

/** Thickness of each string in CSS pixels, from low E to high E. */
const STRING_THICKNESS = [3.4, 2.8, 2.3, 1.8, 1.3, 1.0];
/** Frets that get one dot on the fretboard. */
const SINGLE_INLAY_FRETS = [3, 5, 7, 9];
/** Frets that get two dots on the fretboard. */
const DOUBLE_INLAY_FRETS = [12];
/** Time in seconds for the drawn vibration of a ringing string to fade to about a third. */
const RINGING_FADE_TIME = 1.2;
const MUTED_FADE_TIME = 0.05;
/** How fast the drawn strings wobble, in wobbles per second. Slower than the real pitch on purpose. */
const WOBBLE_FREQUENCY = 28;

/** How strongly a string is drawn as vibrating. */
interface StringMotion {
  /** Vibration strength from 0 to 1 at `startTime`. */
  strength: number;
  /** Time in seconds when `strength` was set. */
  startTime: number;
  fadeTime: number;
}

export interface RenderOptions {
  showNoteNames: boolean;
}

/** Draws the guitar, the fingers and the vibrating strings onto a canvas. */
export class GuitarRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly motions: StringMotion[] = Array.from({ length: STRING_COUNT }, () => ({
    strength: 0,
    startTime: 0,
    fadeTime: RINGING_FADE_TIME,
  }));

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly input: GuitarInput,
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D drawing is not available.');
    this.context = context;
  }

  /** Matches the canvas resolution to its size on screen. */
  resize(width: number, height: number): void {
    const pixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * pixelRatio);
    this.canvas.height = Math.round(height * pixelRatio);
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  notePluck(stringIndex: number, velocity: number): void {
    const now = performance.now() / 1000;
    const motion = this.motions[stringIndex];
    motion.strength = Math.min(1, this.strengthAt(motion, now) * 0.3 + velocity);
    motion.startTime = now;
    motion.fadeTime = RINGING_FADE_TIME;
  }

  noteMute(stringIndex: number): void {
    const now = performance.now() / 1000;
    const motion = this.motions[stringIndex];
    motion.strength = this.strengthAt(motion, now);
    motion.startTime = now;
    motion.fadeTime = MUTED_FADE_TIME;
  }

  /** True while any string still visibly vibrates. */
  get isAnimating(): boolean {
    const now = performance.now() / 1000;
    return this.motions.some((motion) => this.strengthAt(motion, now) > 0.01);
  }

  draw(layout: Layout, options: RenderOptions): void {
    const context = this.context;
    context.clearRect(0, 0, layout.width, layout.height);

    // Everything except text is drawn in along coordinates, mirrored if needed.
    context.save();
    if (layout.mirrored) {
      context.translate(layout.width, 0);
      context.scale(-1, 1);
    }
    this.drawBody(layout);
    this.drawNeck(layout);
    this.drawStrings(layout);
    context.restore();

    this.drawFingers(layout);
    if (options.showNoteNames) this.drawNoteNames(layout);
  }

  private drawBody(layout: Layout): void {
    const context = this.context;
    const gradient = context.createRadialGradient(
      layout.strumZoneEnd * 0.4,
      layout.height / 2,
      layout.height * 0.1,
      layout.strumZoneEnd * 0.4,
      layout.height / 2,
      layout.strumZoneEnd * 1.1,
    );
    gradient.addColorStop(0, '#e0892b');
    gradient.addColorStop(0.55, '#a3361a');
    gradient.addColorStop(1, '#2a0b06');
    context.fillStyle = gradient;
    context.fillRect(0, 0, layout.strumZoneEnd, layout.height);

    // Two humbucker pickups under the strings.
    const top = layout.stringPositions[0] - layout.stringSpacing * 0.45;
    const bottom = layout.stringPositions[STRING_COUNT - 1] + layout.stringSpacing * 0.45;
    const pickupWidth = Math.min(layout.strumZoneEnd * 0.16, 46);
    for (const share of [0.3, 0.72]) {
      const left = layout.strumZoneEnd * share - pickupWidth / 2;
      context.fillStyle = '#121212';
      roundedRectangle(context, left - 4, top - 4, pickupWidth + 8, bottom - top + 8, 6);
      context.fill();
      context.fillStyle = '#d9d4c7';
      roundedRectangle(context, left, top, pickupWidth, bottom - top, 4);
      context.fill();
      // Two rows of pole pieces, one pair per string.
      context.fillStyle = '#8f8a7e';
      for (const stringY of layout.stringPositions) {
        for (const row of [0.3, 0.7]) {
          context.beginPath();
          context.arc(left + pickupWidth * row, stringY, Math.min(pickupWidth * 0.1, 3.5), 0, Math.PI * 2);
          context.fill();
        }
      }
    }
  }

  private drawNeck(layout: Layout): void {
    const context = this.context;
    const neckStart = layout.strumZoneEnd;
    const neckEnd = layout.nutPosition;

    // Without a top border, the neck also fills the safe area above it.
    const hasBorder = layout.neckTop > layout.safeArea.top + 0.5;
    const neckTop = hasBorder ? layout.neckTop : 0;
    const neckHeight = layout.height - neckTop;

    const wood = context.createLinearGradient(0, neckTop, 0, layout.height);
    wood.addColorStop(0, '#2a170c');
    wood.addColorStop(0.5, '#3d2414');
    wood.addColorStop(1, '#2a170c');
    context.fillStyle = wood;
    context.fillRect(neckStart, neckTop, neckEnd - neckStart, neckHeight);

    // Headstock behind the nut.
    context.fillStyle = '#1b0f08';
    context.fillRect(neckEnd + NUT_WIDTH, neckTop, layout.width, neckHeight);

    // Dots in the middle of the cells of some frets.
    const dotRadius = Math.min(layout.stringSpacing * 0.17, layout.fretWidth * 0.2);
    const dot = (fret: number, screenY: number) => {
      context.beginPath();
      context.arc(layout.fretCellCenterAlong(fret), screenY, dotRadius, 0, Math.PI * 2);
      context.fill();
    };
    const positions = layout.stringPositions;
    context.fillStyle = '#e9e3d3';
    for (const fret of SINGLE_INLAY_FRETS.filter((fret) => fret <= layout.fretCount)) {
      dot(fret, (positions[2] + positions[3]) / 2);
    }
    for (const fret of DOUBLE_INLAY_FRETS.filter((fret) => fret <= layout.fretCount)) {
      dot(fret, (positions[1] + positions[2]) / 2);
      dot(fret, (positions[3] + positions[4]) / 2);
    }

    // Fret bars.
    for (let fret = 1; fret <= layout.fretCount; fret++) {
      const along = layout.fretBarAlong(fret);
      const metal = context.createLinearGradient(along - 3, 0, along + 3, 0);
      metal.addColorStop(0, '#6d6d6d');
      metal.addColorStop(0.5, '#f2f2f2');
      metal.addColorStop(1, '#7d7d7d');
      context.fillStyle = metal;
      context.fillRect(along - 3, neckTop, 6, neckHeight);
    }

    // Nut.
    context.fillStyle = '#ece4cc';
    context.fillRect(neckEnd, neckTop, NUT_WIDTH, neckHeight);

    // Light edge along the upper side of the neck, like the binding of a real neck.
    if (hasBorder) {
      context.fillStyle = '#d8ccb0';
      context.fillRect(neckStart, neckTop, layout.width - neckStart, 2);
    }
  }

  private drawStrings(layout: Layout): void {
    const context = this.context;
    const now = performance.now() / 1000;
    const stringEnd = layout.width;
    this.input.frets.forEach((fret, stringIndex) => {
      const stringY = layout.stringPositions[stringIndex];
      const thickness = STRING_THICKNESS[stringIndex] * Math.max(1, layout.stringSpacing / 60);
      // The string vibrates between the bridge (off screen) and the fret it is held at.
      const vibratingEnd = layout.fretBarAlong(fret);
      const motion = this.motions[stringIndex];
      const amplitude =
        this.strengthAt(motion, now) * layout.stringSpacing * 0.16 * Math.sin(now * WOBBLE_FREQUENCY * Math.PI * 2);

      context.lineCap = 'round';
      context.strokeStyle = stringIndex < 3 ? '#b9ae98' : '#dedede';
      context.lineWidth = thickness;
      context.beginPath();
      context.moveTo(0, stringY + amplitude);
      const steps = 24;
      for (let step = 1; step <= steps; step++) {
        const share = step / steps;
        // The middle of the string is near the screen edge on the strum side, so the
        // swing is largest there and goes down to zero at the fret.
        context.lineTo(share * vibratingEnd, stringY + amplitude * Math.cos((Math.PI / 2) * share));
      }
      context.lineTo(stringEnd, stringY);
      context.stroke();

      // Light reflection on top of the string.
      context.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      context.lineWidth = Math.max(thickness * 0.3, 0.5);
      context.beginPath();
      context.moveTo(vibratingEnd, stringY - thickness * 0.2);
      context.lineTo(stringEnd, stringY - thickness * 0.2);
      context.stroke();
    });
  }

  private drawFingers(layout: Layout): void {
    const context = this.context;
    const frets = this.input.frets;
    for (const touch of this.input.touches.values()) {
      if (touch.role === 'fret') {
        if (touch.fret === 0) continue;
        // The finger snaps to the middle of its fret cell on its string.
        const screenX = layout.screenXFromAlong(layout.fretCellCenterAlong(touch.fret));
        const screenY = layout.stringPositions[touch.stringIndex];
        const isSounding = frets[touch.stringIndex] === touch.fret;
        context.fillStyle = isSounding ? 'rgba(255, 170, 60, 0.85)' : 'rgba(255, 170, 60, 0.35)';
        context.shadowColor = 'rgba(255, 150, 40, 0.9)';
        context.shadowBlur = isSounding ? 16 : 0;
        context.beginPath();
        context.arc(screenX, screenY, Math.min(layout.stringSpacing * 0.32, layout.fretWidth * 0.4), 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
      } else {
        context.fillStyle = 'rgba(255, 255, 255, 0.18)';
        context.beginPath();
        context.arc(touch.screenX, touch.screenY, layout.stringSpacing * 0.4, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  private drawNoteNames(layout: Layout): void {
    const context = this.context;
    const fontSize = Math.max(11, Math.min(layout.stringSpacing * 0.3, 16));
    context.font = `600 ${fontSize}px -apple-system, system-ui, sans-serif`;
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    const along = layout.strumZoneEnd - fontSize * 1.4;
    const screenX = layout.screenXFromAlong(along);
    this.input.frets.forEach((fret, stringIndex) => {
      const screenY = layout.stringPositions[stringIndex] - layout.stringSpacing * 0.26;
      context.fillStyle = fret > 0 ? '#ffc070' : 'rgba(255, 255, 255, 0.75)';
      context.fillText(noteName(stringNote(stringIndex, fret)), screenX, screenY);
    });
  }

  private strengthAt(motion: StringMotion, now: number): number {
    return motion.strength * Math.exp(-(now - motion.startTime) / motion.fadeTime);
  }
}

function roundedRectangle(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(left, top, width, height, radius);
}
