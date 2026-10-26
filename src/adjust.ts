import {
  type GuitarProportions,
  type Layout,
  MAXIMUM_FRET_COUNT,
  MINIMUM_FRET_COUNT,
  limitProportions,
} from './layout';

export interface SizeAdjusterOptions {
  getLayout(): Layout;
  getProportions(): GuitarProportions;
  /** Called with new proportions, already within their limits, while the player adjusts. */
  onChange(proportions: GuitarProportions): void;
  onDone(): void;
}

/**
 * Mode for adjusting the guitar sizes on the play view: a handle on the line between strum
 * zone and neck, a handle on the upper edge of the neck, a field for the number of frets and
 * a Done button. While it is shown, it covers the guitar, so nothing is played.
 */
export class SizeAdjuster {
  private readonly root = element('adjust');
  private readonly strumHandle = element('strum-handle');
  private readonly borderHandle = element('border-handle');
  private readonly borderKnob = element('border-knob');
  private readonly fretStepper = element('fret-stepper');
  private readonly fretCountOutput = element('fret-count');
  private readonly fewerFretsButton = element<HTMLButtonElement>('fewer-frets');
  private readonly moreFretsButton = element<HTMLButtonElement>('more-frets');

  constructor(private readonly options: SizeAdjusterOptions) {
    makeDraggable(this.strumHandle, (screenX) => {
      const layout = options.getLayout();
      this.change({ strumZoneShare: layout.strumZoneShareAt(layout.alongFromScreenX(screenX)) });
    });
    makeDraggable(this.borderHandle, (_screenX, screenY) => {
      this.change({ topBorderShare: options.getLayout().topBorderShareAt(screenY) });
    });
    this.fewerFretsButton.addEventListener('click', () => {
      this.change({ fretCount: options.getProportions().fretCount - 1 });
    });
    this.moreFretsButton.addEventListener('click', () => {
      this.change({ fretCount: options.getProportions().fretCount + 1 });
    });
    element('adjust-done').addEventListener('click', () => options.onDone());
  }

  get isShown(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
    this.update();
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** Moves the handles and the fret field to the current layout. */
  update(): void {
    if (!this.isShown) return;
    const layout = this.options.getLayout();
    const neckCenter = layout.screenXFromAlong((layout.strumZoneEnd + layout.nutPosition) / 2);
    this.strumHandle.style.left = `${layout.screenXFromAlong(layout.strumZoneEnd)}px`;
    this.borderHandle.style.top = `${layout.neckTop}px`;
    this.borderKnob.style.left = `${neckCenter}px`;
    this.fretStepper.style.left = `${neckCenter}px`;

    const fretCount = this.options.getProportions().fretCount;
    this.fretCountOutput.textContent = String(fretCount);
    this.fewerFretsButton.disabled = fretCount <= MINIMUM_FRET_COUNT;
    this.moreFretsButton.disabled = fretCount >= MAXIMUM_FRET_COUNT;
  }

  private change(changes: Partial<GuitarProportions>): void {
    this.options.onChange(limitProportions({ ...this.options.getProportions(), ...changes }));
    this.update();
  }
}

/** Calls `onDrag` with the finger position while the element is dragged. */
function makeDraggable(handle: HTMLElement, onDrag: (screenX: number, screenY: number) => void): void {
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', (event) => {
    if (handle.hasPointerCapture(event.pointerId)) onDrag(event.clientX, event.clientY);
  });
}

function element<Type extends HTMLElement = HTMLElement>(id: string): Type {
  return document.getElementById(id) as Type;
}
