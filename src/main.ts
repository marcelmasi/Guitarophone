import { GuitarAudioEngine, type Tone } from './audio/engine';
import { STRING_COUNT, fretChangeEffect, stringFrequency } from './guitar';
import { GuitarInput, attachPointerEvents } from './input';
import { Layout, type SafeArea } from './layout';
import { GuitarRenderer } from './render';

interface Settings {
  tone: Tone;
  /** Strum zone on the right and neck on the left instead of the other way round. */
  mirrored: boolean;
  showNoteNames: boolean;
}

const SETTINGS_STORAGE_KEY = 'guitarophone-settings';
const DEFAULT_SETTINGS: Settings = { tone: 'crunch', mirrored: false, showNoteNames: true };

function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    // Storage can be unavailable; the defaults work fine then.
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Settings are a convenience; losing them is not a problem.
  }
}

function element<Type extends HTMLElement>(id: string): Type {
  return document.getElementById(id) as Type;
}

function readSafeArea(): SafeArea {
  const style = getComputedStyle(element('safe-area-probe'));
  return {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
}

// Let the sound play even when the iPhone's silent switch is on (Safari 16.4 and newer).
const audioSession = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
if (audioSession) audioSession.type = 'playback';

const settings = loadSettings();
const audio = new GuitarAudioEngine();
audio.setTone(settings.tone);

const canvas = element<HTMLCanvasElement>('guitar');
let layout = new Layout(window.innerWidth, window.innerHeight, readSafeArea(), settings.mirrored);
let needsDrawing = true;

const input = new GuitarInput(() => layout, {
  onPluck(stringIndex, velocity, delaySeconds) {
    audio.resume();
    audio.pluck(stringIndex, velocity, delaySeconds);
    renderer.notePluck(stringIndex, velocity);
  },
  onFretChange(stringIndex, previousFret, newFret) {
    if (fretChangeEffect(previousFret, newFret) === 'mute') {
      audio.mute(stringIndex);
      renderer.noteMute(stringIndex);
    }
    audio.setFrequency(stringIndex, stringFrequency(stringIndex, newFret));
  },
});
const renderer = new GuitarRenderer(canvas, input);
attachPointerEvents(canvas, input);
canvas.addEventListener('pointerdown', () => {
  audio.resume();
  needsDrawing = true;
});
canvas.addEventListener('pointermove', () => (needsDrawing = true));
canvas.addEventListener('pointerup', () => (needsDrawing = true));

for (let stringIndex = 0; stringIndex < STRING_COUNT; stringIndex++) {
  audio.setFrequency(stringIndex, stringFrequency(stringIndex, 0));
}

function updateLayout(): void {
  layout = new Layout(window.innerWidth, window.innerHeight, readSafeArea(), settings.mirrored);
  renderer.resize(layout.width, layout.height);
  // The settings button sits in the top corner of the strum side.
  const settingsButton = element('settings-button');
  const side = settings.mirrored ? 'right' : 'left';
  const otherSide = settings.mirrored ? 'left' : 'right';
  settingsButton.style[side] = `calc(env(safe-area-inset-${side}) + 6px)`;
  settingsButton.style[otherSide] = '';
  needsDrawing = true;
}

function drawLoop(): void {
  if (needsDrawing || renderer.isAnimating) {
    renderer.draw(layout, { showNoteNames: settings.showNoteNames });
    needsDrawing = false;
  }
  requestAnimationFrame(drawLoop);
}

window.addEventListener('resize', updateLayout);
// The safe area can arrive after start without a resize. The probe's size is made of the
// safe area paddings, so watching its size catches every change.
new ResizeObserver(updateLayout).observe(element('safe-area-probe'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) input.releaseAll();
  else audio.resume();
  needsDrawing = true;
});

// Start screen: the first tap also unlocks the sound.
element('start-button').addEventListener('click', () => {
  audio.resume();
  element('start').hidden = true;
});

// Settings panel.
const toneButtons = Array.from(element('tone-choice').querySelectorAll<HTMLButtonElement>('button'));
const mirroredChoice = element<HTMLInputElement>('mirrored-choice');
const noteNamesChoice = element<HTMLInputElement>('note-names-choice');

function showSettings(): void {
  for (const button of toneButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.tone === settings.tone));
  }
  mirroredChoice.checked = settings.mirrored;
  noteNamesChoice.checked = settings.showNoteNames;
}

element('settings-button').addEventListener('click', () => {
  input.releaseAll();
  showSettings();
  element('settings').hidden = false;
});
element('settings-close').addEventListener('click', () => {
  element('settings').hidden = true;
});
for (const button of toneButtons) {
  button.addEventListener('click', () => {
    settings.tone = button.dataset.tone as Tone;
    audio.setTone(settings.tone);
    saveSettings(settings);
    showSettings();
  });
}
mirroredChoice.addEventListener('change', () => {
  settings.mirrored = mirroredChoice.checked;
  saveSettings(settings);
  updateLayout();
});
noteNamesChoice.addEventListener('change', () => {
  settings.showNoteNames = noteNamesChoice.checked;
  saveSettings(settings);
  needsDrawing = true;
});

updateLayout();
drawLoop();
