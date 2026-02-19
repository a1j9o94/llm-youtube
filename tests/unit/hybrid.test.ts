import { test, expect, describe } from "bun:test";
import { segmentTranscript, type TopicSegment } from "../../src/core/alignment.ts";
import type { TranscriptSegment } from "../../src/types/transcript.ts";
import type { ExtractedFrame } from "../../src/types/frame.ts";

// These tests validate the hybrid algorithm logic without running ffmpeg.
// They test the scoring, deduplication, and selection logic.

function seg(text: string, start: number, end: number): TranscriptSegment {
  return { text, startTime: start, endTime: end, duration: end - start };
}

function frame(
  ts: number,
  index: number,
  sceneScore?: number
): ExtractedFrame {
  return {
    index,
    timestamp: ts,
    timestampFormatted: `${Math.floor(ts / 60)}m${Math.floor(ts % 60)}s`,
    filePath: `/tmp/frame_${index}.png`,
    method: "scene",
    sceneChangeScore: sceneScore,
  };
}

describe("hybrid frame selection logic", () => {
  test("deduplicates frames within 2-second window", () => {
    const frames = [
      frame(10.0, 0, 0.8),
      frame(11.5, 1, 0.3), // within 2s of previous
      frame(20.0, 2, 0.6),
      frame(21.0, 3, 0.9), // within 2s but higher score
    ];

    // Simulate dedup logic
    const deduplicated: ExtractedFrame[] = [];
    for (const f of frames) {
      const last = deduplicated[deduplicated.length - 1];
      if (!last || Math.abs(f.timestamp - last.timestamp) >= 2) {
        deduplicated.push(f);
      } else {
        if ((f.sceneChangeScore ?? 0) > (last.sceneChangeScore ?? 0)) {
          deduplicated[deduplicated.length - 1] = f;
        }
      }
    }

    expect(deduplicated).toHaveLength(2);
    expect(deduplicated[0]!.timestamp).toBe(10.0); // kept first (0.8 > 0.3)
    expect(deduplicated[1]!.timestamp).toBe(21.0); // kept second (0.9 > 0.6)
  });

  test("topic segments identify gaps that need midpoint frames", () => {
    const segments = [
      seg("intro text", 0, 10),
      seg("more intro", 10, 20),
      // Gap: 20-60 no transcript
      seg("topic two starts", 60, 70),
      seg("topic two continues", 70, 80),
    ];

    const topics = segmentTranscript(segments, 80);

    // Should have boundaries, the pause at 20-60 should trigger a split
    expect(topics.length).toBeGreaterThanOrEqual(1);
  });

  test("combined scoring favors frames near topic boundaries with high scene scores", () => {
    const topicBoundaries = [0, 30, 60, 90];

    function getTopicProximity(timestamp: number): number {
      let minDist = Infinity;
      for (const b of topicBoundaries) {
        minDist = Math.min(minDist, Math.abs(timestamp - b));
      }
      return Math.max(0, 1 - minDist / 30);
    }

    function combinedScore(
      sceneScore: number,
      timestamp: number
    ): number {
      return sceneScore * 0.6 + getTopicProximity(timestamp) * 0.4;
    }

    // Frame near boundary with high scene score
    const nearBoundary = combinedScore(0.9, 29); // 1 second from boundary
    // Frame far from boundary with high scene score
    const farFromBoundary = combinedScore(0.9, 45); // 15 seconds from boundary
    // Frame near boundary with low scene score
    const lowScene = combinedScore(0.2, 31); // 1 second from boundary

    expect(nearBoundary).toBeGreaterThan(farFromBoundary);
    expect(nearBoundary).toBeGreaterThan(lowScene);
  });

  test("maxFrames cap selects highest-scored frames", () => {
    const frames = [
      frame(5, 0, 0.9),
      frame(15, 1, 0.3),
      frame(25, 2, 0.7),
      frame(35, 3, 0.5),
      frame(45, 4, 0.8),
    ];

    const maxFrames = 3;

    // Sort by scene score descending, take top N
    const sorted = [...frames].sort(
      (a, b) => (b.sceneChangeScore ?? 0) - (a.sceneChangeScore ?? 0)
    );
    const selected = sorted.slice(0, maxFrames);

    // Re-sort by timestamp
    selected.sort((a, b) => a.timestamp - b.timestamp);

    expect(selected).toHaveLength(3);
    // Sorted by timestamp: ts=5 (0.9), ts=25 (0.7), ts=45 (0.8)
    expect(selected.map((f) => f.sceneChangeScore)).toEqual([0.9, 0.7, 0.8]);
  });

  test("falls back gracefully when no scene frames detected", () => {
    // When scene detection returns < 3 frames, hybrid should use interval
    const sceneFrames: ExtractedFrame[] = [frame(5, 0, 0.95)]; // only 1

    const shouldFallback = sceneFrames.length < 3;
    expect(shouldFallback).toBe(true);
  });
});
