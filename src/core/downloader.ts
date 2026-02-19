import { $ } from "bun";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { Cache } from "../utils/cache.ts";

export interface DownloadOptions {
  maxResolution?: number;
  outputPath?: string;
  onProgress?: (percent: number) => void;
  timestampRange?: { start: number; end: number };
}

export interface DownloadResult {
  filePath: string;
  duration: number;
  fileSize: number;
}

/**
 * Download a YouTube video via yt-dlp. Returns cached path if available.
 */
export async function downloadVideo(
  videoId: string,
  options: DownloadOptions = {}
): Promise<DownloadResult> {
  const cache = new Cache();
  const maxRes = options.maxResolution ?? 1080;

  // Check cache
  if (!options.timestampRange) {
    const cached = await cache.getVideoFile(videoId);
    if (cached) {
      const file = Bun.file(cached);
      return {
        filePath: cached,
        duration: 0, // caller can get from info
        fileSize: file.size,
      };
    }
  }

  const outputDir = options.outputPath ?? cache.getVideoDir();
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, `${videoId}.mp4`);

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const format = `bestvideo[height<=${maxRes}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${maxRes}][ext=mp4]/best`;

  const args: string[] = [
    "-f",
    format,
    "-o",
    outputPath,
    "--no-playlist",
    "--progress-template",
    "%(progress._percent_str)s",
  ];

  // Add time range if specified
  if (options.timestampRange) {
    args.push(
      "--download-sections",
      `*${options.timestampRange.start}-${options.timestampRange.end}`
    );
  }

  args.push(url);

  const proc = Bun.spawn(["yt-dlp", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  // Parse progress from stdout
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const match = line.trim().match(/([\d.]+)%/);
      if (match) {
        options.onProgress?.(parseFloat(match[1]!));
      }
    }
  }

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderrReader = proc.stderr.getReader();
    let errBuf = "";
    while (true) {
      const { done, value } = await stderrReader.read();
      if (done) break;
      errBuf += decoder.decode(value, { stream: true });
    }
    throw new Error(`yt-dlp download failed (exit code ${exitCode}):\n${errBuf}`);
  }

  const file = Bun.file(outputPath);
  if (!(await file.exists())) {
    throw new Error(`Download completed but file not found at: ${outputPath}`);
  }

  return {
    filePath: outputPath,
    duration: 0,
    fileSize: file.size,
  };
}
