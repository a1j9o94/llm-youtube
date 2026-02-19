import type { FrameMethod } from "./frame.ts";

export interface Manifest {
  version: "1.0.0";
  videoId: string;
  videoTitle: string;
  videoUrl: string;
  channelName: string;
  duration: number;
  language: string;
  generatedAt: string; // ISO 8601
  extractionMethod: FrameMethod;
  segments: ManifestSegment[];
  metadata: {
    totalFrames: number;
    totalSegments: number;
    transcriptTokenEstimate: number;
    hasChapters: boolean;
  };
}

export interface ManifestSegment {
  index: number;
  startTime: number;
  endTime: number;
  startFormatted: string;
  endFormatted: string;
  transcript: string;
  chapterTitle?: string;
  frames: ManifestFrame[];
}

export interface ManifestFrame {
  index: number;
  timestamp: number;
  timestampFormatted: string;
  filePath?: string;
  base64?: string;
  width: number;
  height: number;
  method: FrameMethod;
  sceneChangeScore?: number;
}
