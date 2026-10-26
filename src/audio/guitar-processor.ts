import { OPEN_STRING_NOTES, STRING_COUNT, noteFrequency } from '../guitar';
import { GUITAR_PROCESSOR_NAME, type GuitarMessage } from './messages';
import { StringVoice } from './string-voice';
import { STRING_VOLUME } from './tones';

/** A pluck waiting for its start time. */
interface PendingPluck {
  stringIndex: number;
  velocity: number;
  /** Sample frame at which the pluck sounds. */
  startFrame: number;
}

/** Runs in the audio thread and mixes the six strings into one mono signal. */
class GuitarProcessor extends AudioWorkletProcessor {
  private readonly voices: StringVoice[];
  private pendingPlucks: PendingPluck[] = [];
  /** Previous input and output of the filter that removes a constant offset from the mix. */
  private offsetFilterInput = 0;
  private offsetFilterOutput = 0;

  constructor() {
    super();
    this.voices = Array.from({ length: STRING_COUNT }, (_, stringIndex) => {
      const frequency = noteFrequency(OPEN_STRING_NOTES[stringIndex]);
      // Thick strings ring longer than thin ones: about 9 s for low E, 4.5 s for high E.
      const sustain = 9 * Math.sqrt(noteFrequency(OPEN_STRING_NOTES[0]) / frequency);
      return new StringVoice(sampleRate, frequency, sustain);
    });
    this.port.onmessage = (event: MessageEvent<GuitarMessage>) => this.handleMessage(event.data);
  }

  private handleMessage(message: GuitarMessage): void {
    const voice = this.voices[message.stringIndex];
    if (!voice) return;
    switch (message.type) {
      case 'pluck':
        this.pendingPlucks.push({
          stringIndex: message.stringIndex,
          velocity: message.velocity,
          startFrame: currentFrame + Math.round(message.delaySeconds * sampleRate),
        });
        break;
      case 'setFrequency':
        voice.setFrequency(message.frequency, message.glide);
        break;
      case 'mute':
        voice.mute();
        break;
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const channels = outputs[0];
    const firstChannel = channels[0];
    for (let frameIndex = 0; frameIndex < firstChannel.length; frameIndex++) {
      if (this.pendingPlucks.length > 0) this.startDuePlucks(currentFrame + frameIndex);
      let mix = 0;
      for (const voice of this.voices) mix += voice.nextSample();
      mix *= STRING_VOLUME;
      this.offsetFilterOutput = mix - this.offsetFilterInput + 0.995 * this.offsetFilterOutput;
      this.offsetFilterInput = mix;
      firstChannel[frameIndex] = this.offsetFilterOutput;
    }
    for (let channelIndex = 1; channelIndex < channels.length; channelIndex++) {
      channels[channelIndex].set(firstChannel);
    }
    return true;
  }

  private startDuePlucks(frame: number): void {
    this.pendingPlucks = this.pendingPlucks.filter((pluck) => {
      if (pluck.startFrame > frame) return true;
      this.voices[pluck.stringIndex].pluck(pluck.velocity);
      return false;
    });
  }
}

registerProcessor(GUITAR_PROCESSOR_NAME, GuitarProcessor);
