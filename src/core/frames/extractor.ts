import { mkdir } from "node:fs/promises";
import type {
  ExtractedFrame,
  FrameExtractionOptions,
  FrameExtractionResult,
} from "../../types/frame.ts";
import type { TranscriptResult, Chapter } from "../../types/transcript.ts";
import { extractSceneFrames } from "./scene.ts";
import { extractIntervalFrames } from "./interval.ts";
import { extractKeyframes } from "./keyframe.ts";
import { extractHybridFrames } from "./hybrid.ts";

/**
 * Orchestrates frame extraction based on the selected method.
 */
export async function extractFrames(
  videoPath: string,
  options: FrameExtractionOptions,
  transcript?: TranscriptResult,
  chapters?: Chapter[]
): Promise<FrameExtractionResult> {
  await mkdir(options.outputDir, { recursive: true });

  const start = performance.now();
  let frames: ExtractedFrame[];

  switch (options.method) {
    case "scene":
      frames = await extractSceneFrames(videoPath, options);
      break;
    case "interval":
      frames = await extractIntervalFrames(videoPath, options);
      break;
    case "keyframe":
      frames = await extractKeyframes(videoPath, options);
      break;
    case "hybrid":
      if (!transcript) {
        throw new Error("Hybrid method requires a transcript. Fetch the transcript first.");
      }
      frames = await extractHybridFrames(videoPath, options, transcript, chapters);
      break;
    default:
      throw new Error(`Unknown frame extraction method: ${options.method}`);
  }

  const elapsed = performance.now() - start;

  return {
    frames,
    totalExtracted: frames.length,
    totalDiscarded: 0,
    method: options.method,
    videoPath,
    extractionTimeMs: elapsed,
  };
}
