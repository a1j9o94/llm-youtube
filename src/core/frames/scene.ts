import { $ } from "bun";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import type { ExtractedFrame, FrameExtractionOptions } from "../../types/frame.ts";
import { formatTimestampForFile } from "../../utils/timestamp.ts";

/**
 * Extract frames using ffmpeg scene detection.
 */
export async function extractSceneFrames(
  videoPath: string,
  options: FrameExtractionOptions
): Promise<ExtractedFrame[]> {
  const threshold = options.sceneThreshold ?? 0.3;
  const format = options.format ?? "png";
  const maxRes = options.maxResolution ?? 1080;
  const outputDir = options.outputDir;

  // Build ffmpeg filter
  let vf = `select='gt(scene,${threshold})',scale=-1:min(ih\\,${maxRes}),showinfo`;
  if (options.timestampRange) {
    // handled via -ss/-to flags
  }

  const args: string[] = ["-i", videoPath];

  if (options.timestampRange) {
    args.push("-ss", String(options.timestampRange.start));
    args.push("-to", String(options.timestampRange.end));
  }

  args.push(
    "-vf", vf,
    "-vsync", "vfr",
    "-frame_pts", "1",
  );

  if (format === "jpg") {
    args.push("-q:v", String(Math.round((100 - (options.quality ?? 85)) / 3)));
  }

  args.push(join(outputDir, `scene_%04d.${format}`));

  // Run ffmpeg and capture stderr for showinfo timestamps
  const result = await $`ffmpeg ${args} 2>&1`.quiet().nothrow();
  const output = result.stdout.toString();

  // Parse showinfo output for timestamps
  const timestamps = parseShowInfoTimestamps(output, options.timestampRange?.start ?? 0);

  // List output files
  const files = await readdir(outputDir);
  const frameFiles = files
    .filter((f) => f.startsWith("scene_") && f.endsWith(`.${format}`))
    .sort();

  let frames: ExtractedFrame[] = frameFiles.map((file, i) => {
    const ts = timestamps[i] ?? i * 10; // fallback
    return {
      index: i,
      timestamp: ts,
      timestampFormatted: formatTimestampForFile(ts),
      filePath: join(outputDir, file),
      method: "scene" as const,
      sceneChangeScore: undefined,
    };
  });

  // If maxFrames exceeded, increase threshold conceptually (just trim by score priority)
  if (options.maxFrames && frames.length > options.maxFrames) {
    // Keep frames evenly distributed across the video
    const step = frames.length / options.maxFrames;
    const kept: ExtractedFrame[] = [];
    for (let i = 0; i < options.maxFrames; i++) {
      kept.push(frames[Math.floor(i * step)]!);
    }
    frames = kept;
  }

  // Rename files to standard naming
  const renamedFrames: ExtractedFrame[] = [];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    const newName = `frame_${String(i).padStart(3, "0")}_${formatTimestampForFile(frame.timestamp)}.${format}`;
    const newPath = join(outputDir, newName);
    const file = Bun.file(frame.filePath);
    if (await file.exists()) {
      await Bun.write(newPath, file);
    }
    renamedFrames.push({
      ...frame,
      index: i,
      filePath: newPath,
    });
  }

  return renamedFrames;
}

function parseShowInfoTimestamps(output: string, offset: number): number[] {
  const timestamps: number[] = [];
  const lines = output.split("\n");
  for (const line of lines) {
    // showinfo format: n:123 pts:12345 pts_time:12.345
    const match = line.match(/pts_time:\s*([\d.]+)/);
    if (match) {
      timestamps.push(parseFloat(match[1]!) + offset);
    }
  }
  return timestamps;
}
