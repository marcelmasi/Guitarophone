import guitarProcessorUrl from './guitar-processor.ts?worker&url';
import { GUITAR_PROCESSOR_NAME, type GuitarMessage } from './messages';

export type Tone = 'clean' | 'crunch' | 'lead';

/** Amplifier settings of a tone. */
interface ToneSettings {
  /** How hard the signal is driven into distortion. 1 is almost clean. */
  drive: number;
  /** Highest frequency in hertz the speaker cabinet lets through. */
  cabinetCutoff: number;
  /** Volume after the distortion, to keep all tones about equally loud. */
  outputVolume: number;
  /** Share of the signal that goes to the reverb. */
  reverbAmount: number;
}

const TONES: Record<Tone, ToneSettings> = {
  clean: { drive: 0.8, cabinetCutoff: 8000, outputVolume: 1.4, reverbAmount: 0.25 },
  crunch: { drive: 5, cabinetCutoff: 4800, outputVolume: 0.45, reverbAmount: 0.18 },
  lead: { drive: 22, cabinetCutoff: 4000, outputVolume: 0.32, reverbAmount: 0.22 },
};

/** Largest drive value the distortion curve is built for. Stronger signals are clipped hard. */
const DISTORTION_RANGE = 4;

/**
 * The sound of an electric guitar: six simulated strings, followed by an amplifier with
 * distortion, a speaker cabinet filter and a little reverb.
 */
export class GuitarAudioEngine {
  private readonly context: AudioContext;
  private guitarNode: AudioWorkletNode | null = null;
  /** Messages sent before the string processor was loaded. */
  private queuedMessages: GuitarMessage[] = [];
  private readonly driveGain: GainNode;
  private readonly cabinetFilter: BiquadFilterNode;
  private readonly outputGain: GainNode;
  private readonly reverbSend: GainNode;
  /** Signal input of the amplifier. */
  private readonly amplifierInput: AudioNode;

  constructor() {
    this.context = new AudioContext({ latencyHint: 'interactive' });
    const context = this.context;

    // Remove rumble before the distortion, so low notes do not turn into mud.
    const inputFilter = new BiquadFilterNode(context, { type: 'highpass', frequency: 90 });
    this.amplifierInput = inputFilter;
    this.driveGain = new GainNode(context);
    const distortion = new WaveShaperNode(context, { curve: distortionCurve(), oversample: '4x' });
    // A speaker cabinet: no deep bass, a slight mid boost and no harsh highs.
    const cabinetLowCut = new BiquadFilterNode(context, { type: 'highpass', frequency: 80 });
    const cabinetMids = new BiquadFilterNode(context, {
      type: 'peaking',
      frequency: 1200,
      Q: 0.8,
      gain: 3,
    });
    this.cabinetFilter = new BiquadFilterNode(context, { type: 'lowpass', Q: 0.7 });
    this.outputGain = new GainNode(context);
    this.reverbSend = new GainNode(context);
    const reverb = new ConvolverNode(context, { buffer: reverbImpulse(context, 1.8) });
    // Keeps loud chords from clipping.
    const limiter = new DynamicsCompressorNode(context, {
      threshold: -10,
      knee: 6,
      ratio: 8,
      attack: 0.003,
      release: 0.2,
    });

    inputFilter
      .connect(this.driveGain)
      .connect(distortion)
      .connect(cabinetLowCut)
      .connect(cabinetMids)
      .connect(this.cabinetFilter)
      .connect(this.outputGain)
      .connect(limiter)
      .connect(context.destination);
    this.outputGain.connect(this.reverbSend).connect(reverb).connect(limiter);

    this.setTone('crunch');
    void this.loadStrings();
  }

  /** Browsers only allow sound after the user touched the screen; call this on each touch. */
  resume(): void {
    if (this.context.state !== 'running') void this.context.resume();
  }

  get isRunning(): boolean {
    return this.context.state === 'running';
  }

  setTone(tone: Tone): void {
    const settings = TONES[tone];
    const now = this.context.currentTime;
    this.driveGain.gain.setTargetAtTime(settings.drive / DISTORTION_RANGE, now, 0.02);
    this.cabinetFilter.frequency.setTargetAtTime(settings.cabinetCutoff, now, 0.02);
    this.outputGain.gain.setTargetAtTime(settings.outputVolume, now, 0.02);
    this.reverbSend.gain.setTargetAtTime(settings.reverbAmount, now, 0.02);
  }

  /** Plucks a string with a loudness from 0 to 1 after `delaySeconds`. */
  pluck(stringIndex: number, velocity: number, delaySeconds: number): void {
    this.send({ type: 'pluck', stringIndex, velocity, delaySeconds });
  }

  /** Sets the pitch of a string in hertz. A ringing string keeps ringing at the new pitch. */
  setFrequency(stringIndex: number, frequency: number): void {
    this.send({ type: 'setFrequency', stringIndex, frequency });
  }

  mute(stringIndex: number): void {
    this.send({ type: 'mute', stringIndex });
  }

  private send(message: GuitarMessage): void {
    if (this.guitarNode) this.guitarNode.port.postMessage(message);
    else this.queuedMessages.push(message);
  }

  private async loadStrings(): Promise<void> {
    await this.context.audioWorklet.addModule(guitarProcessorUrl);
    this.guitarNode = new AudioWorkletNode(this.context, GUITAR_PROCESSOR_NAME, {
      numberOfInputs: 0,
      outputChannelCount: [1],
    });
    this.guitarNode.connect(this.amplifierInput);
    // Only the pitches matter; plucks from before loading would sound late.
    for (const message of this.queuedMessages) {
      if (message.type === 'setFrequency') this.guitarNode.port.postMessage(message);
    }
    this.queuedMessages = [];
  }
}

/** Soft clipping like an overdriven tube amplifier: y = tanh(DISTORTION_RANGE * x). */
function distortionCurve(): Float32Array<ArrayBuffer> {
  const length = 4096;
  const curve = new Float32Array(length);
  for (let index = 0; index < length; index++) {
    const input = (index / (length - 1)) * 2 - 1;
    curve[index] = Math.tanh(DISTORTION_RANGE * input);
  }
  return curve;
}

/** Stereo room reverb: noise that fades out over `duration` seconds. */
function reverbImpulse(context: BaseAudioContext, duration: number): AudioBuffer {
  const length = Math.round(context.sampleRate * duration);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channelIndex = 0; channelIndex < 2; channelIndex++) {
    const samples = impulse.getChannelData(channelIndex);
    for (let index = 0; index < length; index++) {
      const fade = (1 - index / length) ** 3;
      samples[index] = (Math.random() * 2 - 1) * fade;
    }
  }
  return impulse;
}
