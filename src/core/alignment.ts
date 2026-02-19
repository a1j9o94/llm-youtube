import type { TranscriptResult, TranscriptSegment, Chapter } from "../types/transcript.ts";
import type { ExtractedFrame } from "../types/frame.ts";

export interface AlignedSegment {
  startTime: number;
  endTime: number;
  transcript: string;
  frames: ExtractedFrame[];
  chapterTitle?: string;
  segmentIndex: number;
}

export interface AlignmentResult {
  segments: AlignedSegment[];
  videoId: string;
  totalDuration: number;
  frameCount: number;
  segmentCount: number;
}

export interface TopicSegment {
  startTime: number;
  endTime: number;
  title?: string;
  segments: TranscriptSegment[];
}

/**
 * Align frames with transcript segments. Uses chapters if available,
 * otherwise detects topic shifts via vocabulary overlap.
 */
export function alignFramesWithTranscript(
  frames: ExtractedFrame[],
  transcript: TranscriptResult,
  chapters?: Chapter[]
): AlignmentResult {
  const topicSegments = segmentTranscript(
    transcript.segments,
    transcript.totalDuration,
    chapters
  );

  const aligned: AlignedSegment[] = topicSegments.map((topic, index) => {
    const segmentFrames = frames.filter(
      (f) => f.timestamp >= topic.startTime && f.timestamp < topic.endTime
    );

    const segmentText = topic.segments.map((s) => s.text).join(" ");

    return {
      startTime: topic.startTime,
      endTime: topic.endTime,
      transcript: segmentText,
      frames: segmentFrames,
      chapterTitle: topic.title,
      segmentIndex: index,
    };
  });

  return {
    segments: aligned,
    videoId: transcript.videoId,
    totalDuration: transcript.totalDuration,
    frameCount: frames.length,
    segmentCount: aligned.length,
  };
}

/**
 * Segment transcript into topic blocks using chapters or vocabulary analysis.
 */
export function segmentTranscript(
  segments: TranscriptSegment[],
  totalDuration: number,
  chapters?: Chapter[]
): TopicSegment[] {
  if (chapters && chapters.length > 0) {
    return chapters.map((ch) => ({
      startTime: ch.startTime,
      endTime: ch.endTime,
      title: ch.title,
      segments: segments.filter(
        (s) => s.startTime >= ch.startTime && s.startTime < ch.endTime
      ),
    }));
  }

  // Detect topic shifts via vocabulary overlap
  const WINDOW_SIZE = 30; // seconds
  const OVERLAP_THRESHOLD = 0.4;
  const MIN_SEGMENT_LENGTH = 15; // seconds
  const PAUSE_THRESHOLD = 3; // seconds

  const boundaries: number[] = [0];

  for (let t = WINDOW_SIZE; t < totalDuration - WINDOW_SIZE; t += 5) {
    const windowA = getWordsInRange(segments, t - WINDOW_SIZE, t);
    const windowB = getWordsInRange(segments, t, t + WINDOW_SIZE);

    if (windowA.length === 0 || windowB.length === 0) continue;

    const overlap = jaccardSimilarity(new Set(windowA), new Set(windowB));

    if (overlap < OVERLAP_THRESHOLD) {
      if (t - boundaries[boundaries.length - 1]! >= MIN_SEGMENT_LENGTH) {
        boundaries.push(t);
      }
    }
  }

  // Split on long pauses
  for (let i = 1; i < segments.length; i++) {
    const gap = segments[i]!.startTime - segments[i - 1]!.endTime;
    if (gap > PAUSE_THRESHOLD) {
      const pauseTime = segments[i]!.startTime;
      if (!boundaries.some((b) => Math.abs(b - pauseTime) < MIN_SEGMENT_LENGTH)) {
        boundaries.push(pauseTime);
      }
    }
  }

  boundaries.sort((a, b) => a - b);
  if (boundaries[boundaries.length - 1] !== totalDuration) {
    boundaries.push(totalDuration);
  }

  // Edge case: if only one boundary pair, return single segment
  if (boundaries.length < 2) {
    return [
      {
        startTime: 0,
        endTime: totalDuration,
        segments,
      },
    ];
  }

  return boundaries.slice(0, -1).map((start, i) => ({
    startTime: start,
    endTime: boundaries[i + 1]!,
    segments: segments.filter(
      (s) => s.startTime >= start && s.startTime < boundaries[i + 1]!
    ),
  }));
}

function getWordsInRange(
  segments: TranscriptSegment[],
  start: number,
  end: number
): string[] {
  return segments
    .filter((s) => s.startTime >= start && s.startTime < end)
    .flatMap((s) => s.text.toLowerCase().split(/\s+/).filter(Boolean));
}

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}
