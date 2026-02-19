import { $ } from "bun";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import type { ExtractedFrame, FrameExtractionOptions } from "../../types/frame.ts";
import type { TranscriptResult } from "../../types/transcript.ts";
import type { Chapter } from "../../types/transcript.ts";
import { segmentTranscript, type TopicSegment } from "../alignment.ts";
import { extractSceneFrames } from "./scene.ts";
import { extractIntervalFrames } from "./interval.ts";
import { formatTimestampForFile } from "../../utils/timestamp.ts";

/**
 * Hybrid frame selection: combines scene detection with transcript-based
 * semantic segmentation to ensure every meaningful section has visual representation.
 */
export async function extractHybridFrames(
  videoPath: string,
  options: FrameExtractionOptions,
  transcript: TranscriptResult,
  chapters?: Chapter[]
): Promise<ExtractedFrame[]> {
  const format = options.format ?? "png";
  const maxFrames = options.maxFrames ?? 50;

  // Step 1: Run scene detection with slightly lower threshold
  const sceneDir = join(options.outputDir, "_scene_candidates");
  await mkdir(sceneDir, { recursive: true });

  const sceneFrames = await extractSceneFrames(videoPath, {
    ...options,
    outputDir: sceneDir,
    sceneThreshold: 0.25,
    maxFrames: undefined, // don't limit yet
  });

  // Step 2: If scene detection found < 3 frames, fall back to interval
  if (sceneFrames.length < 3) {
    return extractIntervalFrames(videoPath, {
      ...options,
      interval: options.interval ?? 10,
    });
  }

  // Step 3: Segment transcript into topic blocks
  const topicSegments = segmentTranscript(
    transcript.segments,
    transcript.totalDuration,
    chapters
  );

  // Step 4: For each topic segment, ensure it has frame coverage
  const candidateFrames: ExtractedFrame[] = [...sceneFrames];

  for (const topic of topicSegments) {
    const segmentFrames = sceneFrames.filter(
      (f) => f.timestamp >= topic.startTime && f.timestamp < topic.endTime
    );

    if (segmentFrames.length === 0) {
      // No scene-detected frame in this segment — extract midpoint frame
      const midpoint = (topic.startTime + topic.endTime) / 2;
      const midpointFrame = await extractSingleFrame(
        videoPath,
        midpoint,
        options.outputDir,
        format,
        options.maxResolution ?? 1080
      );
      if (midpointFrame) {
        candidateFrames.push(midpointFrame);
      }
    }
  }

  // Step 5: Deduplicate frames within 2 seconds of each other
  candidateFrames.sort((a, b) => a.timestamp - b.timestamp);
  const deduplicated: ExtractedFrame[] = [];
  for (const frame of candidateFrames) {
    const last = deduplicated[deduplicated.length - 1];
    if (!last || Math.abs(frame.timestamp - last.timestamp) >= 2) {
      deduplicated.push(frame);
    } else {
      // Keep the one with higher scene change score
      if ((frame.sceneChangeScore ?? 0) > (last.sceneChangeScore ?? 0)) {
        deduplicated[deduplicated.length - 1] = frame;
      }
    }
  }

  // Step 6: Apply maxFrames cap using combined scoring
  let finalFrames = deduplicated;
  if (finalFrames.length > maxFrames) {
    // Score each frame
    const scored = finalFrames.map((frame) => {
      const sceneScore = frame.sceneChangeScore ?? 0.5;
      const topicProximity = getTopicBoundaryProximity(
        frame.timestamp,
        topicSegments
      );
      const combinedScore = sceneScore * 0.6 + topicProximity * 0.4;
      return { frame, combinedScore };
    });

    // Sort by score descending, take top maxFrames
    scored.sort((a, b) => b.combinedScore - a.combinedScore);
    finalFrames = scored.slice(0, maxFrames).map((s) => s.frame);
  }

  // Sort by timestamp and re-index
  finalFrames.sort((a, b) => a.timestamp - b.timestamp);

  return finalFrames.map((f, i) => ({
    ...f,
    index: i,
    method: "hybrid" as const,
  }));
}

/**
 * Extract a single frame at a specific timestamp.
 */
async function extractSingleFrame(
  videoPath: string,
  timestamp: number,
  outputDir: string,
  format: string,
  maxRes: number
): Promise<ExtractedFrame | null> {
  const filename = `midpoint_${formatTimestampForFile(timestamp)}.${format}`;
  const outputPath = join(outputDir, filename);

  try {
    await $`ffmpeg -ss ${timestamp} -i ${videoPath} -vf scale=-1:min(ih\\,${maxRes}) -frames:v 1 ${outputPath} 2>&1`
      .quiet()
      .nothrow();

    const file = Bun.file(outputPath);
    if (await file.exists()) {
      return {
        index: -1, // will be re-indexed
        timestamp,
        timestampFormatted: formatTimestampForFile(timestamp),
        filePath: outputPath,
        method: "hybrid",
        score: 0.5,
      };
    }
  } catch {
    // Failed to extract frame
  }
  return null;
}

function getTopicBoundaryProximity(
  timestamp: number,
  segments: TopicSegment[]
): number {
  let minDistance = Infinity;
  for (const seg of segments) {
    minDistance = Math.min(
      minDistance,
      Math.abs(timestamp - seg.startTime),
      Math.abs(timestamp - seg.endTime)
    );
  }
  // Normalize: closer to boundary = higher score
  // 0 seconds away = 1.0, 30+ seconds = 0.0
  return Math.max(0, 1 - minDistance / 30);
}
