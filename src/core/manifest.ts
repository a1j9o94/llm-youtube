import type { Manifest, ManifestSegment, ManifestFrame } from "../types/manifest.ts";
import type { AlignmentResult } from "./alignment.ts";
import type { VideoInfo } from "../types/transcript.ts";
import type { FrameMethod } from "../types/frame.ts";
import { formatTimestamp } from "../utils/timestamp.ts";

export interface ManifestGenerateOptions {
  alignment: AlignmentResult;
  videoInfo: VideoInfo;
  language: string;
  method: FrameMethod;
  includeFrameBase64?: boolean;
  frameDir?: string;
}

/**
 * Generate a structured manifest mapping frames to transcript segments.
 */
export async function generateManifest(
  options: ManifestGenerateOptions
): Promise<Manifest> {
  const { alignment, videoInfo, language, method } = options;

  const segments: ManifestSegment[] = await Promise.all(
    alignment.segments.map(async (seg, i) => {
      const frames: ManifestFrame[] = await Promise.all(
        seg.frames.map(async (frame) => {
          const result: ManifestFrame = {
            index: frame.index,
            timestamp: frame.timestamp,
            timestampFormatted: formatTimestamp(frame.timestamp),
            method: frame.method,
            width: 0,
            height: 0,
            sceneChangeScore: frame.sceneChangeScore,
          };

          if (options.frameDir) {
            // Use relative path from frame dir
            result.filePath = frame.filePath;
          }

          if (options.includeFrameBase64) {
            try {
              const file = Bun.file(frame.filePath);
              const bytes = new Uint8Array(await file.arrayBuffer());
              result.base64 = Buffer.from(bytes).toString("base64");
            } catch {
              // Skip if can't read
            }
          }

          return result;
        })
      );

      return {
        index: i,
        startTime: seg.startTime,
        endTime: seg.endTime,
        startFormatted: formatTimestamp(seg.startTime),
        endFormatted: formatTimestamp(seg.endTime),
        transcript: seg.transcript,
        chapterTitle: seg.chapterTitle,
        frames,
      };
    })
  );

  // Estimate transcript tokens (rough: word count * 1.3)
  const wordCount = segments.reduce(
    (sum, s) => sum + s.transcript.split(/\s+/).length,
    0
  );
  const transcriptTokenEstimate = Math.round(wordCount * 1.3);

  return {
    version: "1.0.0",
    videoId: videoInfo.id,
    videoTitle: videoInfo.title,
    videoUrl: `https://www.youtube.com/watch?v=${videoInfo.id}`,
    channelName: videoInfo.channel,
    duration: videoInfo.duration,
    language,
    generatedAt: new Date().toISOString(),
    extractionMethod: method,
    segments,
    metadata: {
      totalFrames: alignment.frameCount,
      totalSegments: alignment.segmentCount,
      transcriptTokenEstimate,
      hasChapters: segments.some((s) => s.chapterTitle !== undefined),
    },
  };
}
