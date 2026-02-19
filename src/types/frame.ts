export type FrameMethod = "scene" | "interval" | "keyframe" | "hybrid";

export interface ExtractedFrame {
  index: number;
  timestamp: number; // seconds (float)
  timestampFormatted: string; // "4m32s" or "1h02m15s"
  filePath: string;
  method: FrameMethod;
  score?: number; // relevance score for hybrid method (0-1)
  sceneChangeScore?: number; // how different from previous frame (0-1)
}

export interface FrameExtractionOptions {
  method: FrameMethod;
  maxFrames?: number;
  interval?: number;
  sceneThreshold?: number;
  outputDir: string;
  format?: "png" | "jpg" | "webp";
  quality?: number;
  maxResolution?: number;
  timestampRange?: { start: number; end: number };
}

export interface FrameExtractionResult {
  frames: ExtractedFrame[];
  totalExtracted: number;
  totalDiscarded: number;
  method: FrameMethod;
  videoPath: string;
  extractionTimeMs: number;
}
