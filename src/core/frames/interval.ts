import { $ } from "bun";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import type { ExtractedFrame, FrameExtractionOptions } from "../../types/frame.ts";
import { formatTimestampForFile } from "../../utils/timestamp.ts";

/**
 * Extract frames at fixed intervals using ffmpeg.
 */
export async function extractIntervalFrames(
  videoPath: string,
  options: FrameExtractionOptions
): Promise<ExtractedFrame[]> {
  const interval = options.interval ?? 10;
  const format = options.format ?? "png";
  const maxRes = options.maxResolution ?? 1080;
  const outputDir = options.outputDir;

  const vf = `fps=1/${interval},scale=-1:min(ih\\,${maxRes})`;

  const args: string[] = ["-i", videoPath];

  if (options.timestampRange) {
    args.push("-ss", String(options.timestampRange.start));
    args.push("-to", String(options.timestampRange.end));
  }

  args.push("-vf", vf);

  if (format === "jpg") {
    args.push("-q:v", String(Math.round((100 - (options.quality ?? 85)) / 3)));
  }

  args.push(join(outputDir, `interval_%04d.${format}`));

  await $`ffmpeg ${args} 2>&1`.quiet().nothrow();

  // List output files
  const files = await readdir(outputDir);
  const frameFiles = files
    .filter((f) => f.startsWith("interval_") && f.endsWith(`.${format}`))
    .sort();

  const offset = options.timestampRange?.start ?? 0;

  let frames: ExtractedFrame[] = frameFiles.map((file, i) => {
    const ts = offset + i * interval;
    return {
      index: i,
      timestamp: ts,
      timestampFormatted: formatTimestampForFile(ts),
      filePath: join(outputDir, file),
      method: "interval" as const,
    };
  });

  // Apply maxFrames cap
  if (options.maxFrames && frames.length > options.maxFrames) {
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
    renamedFrames.push({ ...frame, index: i, filePath: newPath });
  }

  return renamedFrames;
}
