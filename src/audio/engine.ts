import { Analyzer } from "./analyzer";
import { AudioFrame, silentFrame } from "./frame";
import { startDemoTrack } from "./demo";

export type SourceKind = "system" | "mic" | "file" | "demo";

export interface ActiveSource {
  kind: SourceKind;
  label: string;
}

export class AudioError extends Error {}

const RAW_AUDIO: MediaTrackConstraints = {
  // Voice processing would flatten music, so ask the browser to leave the signal alone.
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

/** Owns the audio graph. One source at a time feeds the analyzer; starting another replaces it. */
export class AudioEngine {
  private ctx?: AudioContext;
  private analyzer?: Analyzer;
  private stopSource?: () => void;
  private silent = silentFrame();

  active?: ActiveSource;
  /** Set while a file is the source, so the UI can offer play / pause. */
  fileElement?: HTMLAudioElement;
  onEnded?: (reason: string) => void;

  /** The newest analysis, or silence when nothing is playing. */
  frame(): AudioFrame {
    return this.active && this.analyzer ? this.analyzer.analyze() : this.silent;
  }

  async start(kind: SourceKind, file?: File): Promise<void> {
    const ctx = this.ensureContext();
    await ctx.resume();
    this.stop();

    const analyzer = this.analyzer!;
    switch (kind) {
      case "system":
        await this.startStream(await this.getSystemAudio(), analyzer, "System audio");
        break;
      case "mic":
        await this.startStream(await this.getMicrophone(), analyzer, "Microphone");
        break;
      case "file":
        if (!file) throw new AudioError("No file chosen.");
        await this.startFile(file, analyzer);
        break;
      case "demo": {
        analyzer.input.connect(ctx.destination);
        const stopDemo = startDemoTrack(ctx, analyzer.input);
        this.stopSource = () => {
          stopDemo();
          analyzer.input.disconnect();
        };
        this.active = { kind, label: "Demo track" };
        break;
      }
    }
  }

  stop(): void {
    this.stopSource?.();
    this.stopSource = undefined;
    this.fileElement = undefined;
    this.active = undefined;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.analyzer = new Analyzer(this.ctx);
    }
    return this.ctx;
  }

  private async getSystemAudio(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new AudioError("This browser can't capture system audio. Try Chrome or Edge on Windows.");
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: RAW_AUDIO,
        // Chrome-only hints: offer system audio, and don't make the user share a tab.
        systemAudio: "include",
        selfBrowserSurface: "exclude",
      } as DisplayMediaStreamOptions);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        throw new AudioError("Sharing was cancelled, so there is nothing to visualize.");
      }
      throw err;
    }
    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      throw new AudioError(
        'No audio was shared. Pick "Entire screen" and tick "Also share system audio" in the sharing dialog (Chrome or Edge on Windows).',
      );
    }
    return stream;
  }

  private async getMicrophone(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: RAW_AUDIO });
    } catch (err) {
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "NotFoundError")) {
        throw new AudioError("Couldn't open a microphone. Check the browser's permission for this page.");
      }
      throw err;
    }
  }

  private async startStream(stream: MediaStream, analyzer: Analyzer, label: string): Promise<void> {
    // Only the sound is wanted; drop the screen video so nothing is recorded or decoded.
    stream.getVideoTracks().forEach((t) => t.stop());
    const audioTracks = stream.getAudioTracks();
    const source = this.ctx!.createMediaStreamSource(new MediaStream(audioTracks));
    // Deliberately not routed to the speakers: that would play the captured audio a second time.
    source.connect(analyzer.input);

    const onEnded = () => {
      if (this.active?.label === label) {
        this.stop();
        this.onEnded?.(`${label} stopped.`);
      }
    };
    audioTracks.forEach((t) => t.addEventListener("ended", onEnded));

    this.stopSource = () => {
      audioTracks.forEach((t) => {
        t.removeEventListener("ended", onEnded);
        t.stop();
      });
      source.disconnect();
    };
    this.active = { kind: label === "Microphone" ? "mic" : "system", label };
  }

  private async startFile(file: File, analyzer: Analyzer): Promise<void> {
    const url = URL.createObjectURL(file);
    const element = new Audio(url);
    element.loop = true;
    element.crossOrigin = "anonymous";
    const source = this.ctx!.createMediaElementSource(element);
    source.connect(analyzer.input);
    analyzer.input.connect(this.ctx!.destination);
    try {
      await element.play();
    } catch {
      URL.revokeObjectURL(url);
      source.disconnect();
      analyzer.input.disconnect();
      throw new AudioError("That file couldn't be played. Try an MP3, WAV, OGG or M4A.");
    }

    this.fileElement = element;
    this.stopSource = () => {
      element.pause();
      source.disconnect();
      analyzer.input.disconnect();
      URL.revokeObjectURL(url);
    };
    this.active = { kind: "file", label: file.name };
  }
}
