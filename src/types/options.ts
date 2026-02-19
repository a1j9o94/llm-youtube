import type { FrameMethod } from "./frame.ts";

export interface AskOptions {
  video: string;
  visual?: boolean;
  method?: FrameMethod;
  interval?: number;
  sceneThreshold?: number;
  maxFrames?: number;
  around?: string;
  lang?: string;
  model?: string;
  system?: string;
  json?: boolean;
  noCache?: boolean;
  verbose?: boolean;
}

export interface FramesOptions {
  video: string;
  output?: string;
  method?: FrameMethod;
  interval?: number;
  sceneThreshold?: number;
  maxFrames?: number;
  format?: "png" | "jpg" | "webp";
  quality?: number;
  maxResolution?: number;
}

export interface ManifestOptions {
  video: string;
  visual?: boolean;
  output?: string;
  includeFrames?: boolean;
  frameDir?: string;
  method?: FrameMethod;
  interval?: number;
  sceneThreshold?: number;
  maxFrames?: number;
  lang?: string;
  noCache?: boolean;
}

export interface TranscriptCommandOptions {
  video: string;
  timestamps?: boolean;
  lang?: string;
  json?: boolean;
  chapters?: boolean;
}

export interface InfoOptions {
  video: string;
}
