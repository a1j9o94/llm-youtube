import { $ } from "bun";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import type { ExtractedFrame, FrameExtractionOptions } from "../../types/frame.ts";
import { formatTimestampForFile } from "../../utils/timestamp.ts";

/**
 * Extract I-frames (keyframes) from video using ffmpeg.
 * Fastest method — no re-encoding needed.
 */
export async function extractKeyframes(
  videoPath: string,
  options: FrameExtractionOptions
): Promise<ExtractedFrame[]> {
  const format = options.format ?? "png";
  const maxRes = options.maxResolution ?? 1080;
  const outputDir = options.outputDir;

  const vf = `select='eq(pict_type,I)',scale=-1:min(ih\\,${maxRes}),showinfo`;

  const args: string[] = ["-i", videoPath];

  if (options.timestampRange) {
    args.push("-ss", String(options.timestampRange.start));
    args.push("-to", String(options.timestampRange.end));
  }

  args.push("-vf", vf, "-vsync", "vfr");

  if (format === "jpg") {
    args.push("-q:v", String(Math.round((100 - (options.quality ?? 85)) / 3)));
  }

  args.push(join(outputDir, `keyframe_%04d.${format}`));

  const result = await $`ffmpeg ${args} 2>&1`.quiet().nothrow();
  const output = result.stdout.toString();

  // Parse timestamps from showinfo
  const timestamps = parseShowInfoTimestamps(output, options.timestampRange?.start ?? 0);

  const files = await readdir(outputDir);
  const frameFiles = files
    .filter((f) => f.startsWith("keyframe_") && f.endsWith(`.${format}`))
    .sort();

  let frames: ExtractedFrame[] = frameFiles.map((file, i) => {
    const ts = timestamps[i] ?? i * 5;
    return {
      index: i,
      timestamp: ts,
      timestampFormatted: formatTimestampForFile(ts),
      filePath: join(outputDir, file),
      method: "keyframe" as const,
    };
  });

  if (options.maxFrames && frames.length > options.maxFrames) {
    const step = frames.length / options.maxFrames;
    const kept: ExtractedFrame[] = [];
    for (let i = 0; i < options.maxFrames; i++) {
      kept.push(frames[Math.floor(i * step)]!);
    }
    frames = kept;
  }

  // Rename to standard naming
  const renamedFrames: ExtractedFrame[] = [];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    const newName = `frame_${String(i).padStart(3, "0")}_${formatTimestampForFile(frame.timestamp)}.${format}`;
    const newPath = join(outputDir, newName);
    const file = Bun.file(frame.filePath);
    if (await file.exists()) {
      await Bun.write(newPath, file);
    }
    renamedFrames.push({ ...frame, index: i, filePath: newPath });
  }

  return renamedFrames;
}

function parseShowInfoTimestamps(output: string, offset: number): number[] {
  const timestamps: number[] = [];
  for (const line of output.split("\n")) {
    const match = line.match(/pts_time:\s*([\d.]+)/);
    if (match) {
      timestamps.push(parseFloat(match[1]!) + offset);
    }
  }
  return timestamps;
}
