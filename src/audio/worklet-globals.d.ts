// Globals of the audio worklet scope, which are not part of the DOM type definitions.

declare const sampleRate: number;
declare const currentFrame: number;

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(name: string, processorClass: new () => AudioWorkletProcessor): void;
