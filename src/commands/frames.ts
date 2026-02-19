import type { Command } from "commander";
import { mkdir } from "node:fs/promises";
import { parseVideoId } from "../utils/video-id.ts";
import { fetchTranscript, fetchVideoInfo } from "../core/transcript.ts";
import { downloadVideo } from "../core/downloader.ts";
import { extractFrames } from "../core/frames/extractor.ts";
import { ensureDependencies } from "../utils/dependencies.ts";
import { formatTimestamp } from "../utils/timestamp.ts";
import { createSpinner, printSuccess, printError } from "../utils/progress.ts";
import type { FramesOptions } from "../types/options.ts";
import type { FrameMethod } from "../types/frame.ts";

export function registerFramesCommand(program: Command): void {
  program
    .command("frames")
    .description("Extract frames from a YouTube video (no LLM call)")
    .requiredOption("-v, --video <id>", "YouTube video ID or URL")
    .option("-o, --output <dir>", "Output directory for frames", "./frames")
    .option("-m, --method <method>", "Frame selection method", "scene")
    .option("-i, --interval <seconds>", "Seconds between frames", "10")
    .option("--scene-threshold <threshold>", "Scene detection sensitivity", "0.3")
    .option("--max-frames <count>", "Cap frame count")
    .option("-f, --format <format>", "Output format: png, jpg, webp", "png")
    .option("-q, --quality <quality>", "Image quality 1-100 (jpg/webp)", "85")
    .option("--max-resolution <height>", "Max height in pixels", "1080")
    .action(async (opts: FramesOptions) => {
      try {
        const { id } = parseVideoId(opts.video);
        await ensureDependencies(["yt-dlp", "ffmpeg"]);

        // Fetch info
        const infoSpinner = createSpinner("Fetching video info...").start();
        const info = await fetchVideoInfo(id);
        infoSpinner.succeed(
          `Video found: "${info.title}" (${formatTimestamp(info.duration)})`
        );

        // Download video
        const dlSpinner = createSpinner("Downloading video...").start();
        const download = await downloadVideo(id, {
          maxResolution: opts.maxResolution ? Number(opts.maxResolution) : 1080,
          onProgress: (pct) => {
            dlSpinner.text = `Downloading video... ${pct.toFixed(0)}%`;
          },
        });
        dlSpinner.succeed(
          `Video downloaded (${(download.fileSize / 1024 / 1024).toFixed(1)}MB)`
        );

        // For hybrid method, fetch transcript
        const method = (opts.method ?? "scene") as FrameMethod;
        let transcript;
        if (method === "hybrid") {
          const tSpinner = createSpinner("Fetching transcript for hybrid method...").start();
          transcript = await fetchTranscript(id);
          tSpinner.succeed("Transcript loaded");
        }

        // Extract frames
        const outputDir = opts.output ?? "./frames";
        await mkdir(outputDir, { recursive: true });

        const frameSpinner = createSpinner(
          `Extracting frames (${method} method)...`
        ).start();

        const result = await extractFrames(
          download.filePath,
          {
            method,
            maxFrames: opts.maxFrames ? Number(opts.maxFrames) : undefined,
            interval: opts.interval ? Number(opts.interval) : 10,
            sceneThreshold: opts.sceneThreshold
              ? Number(opts.sceneThreshold)
              : 0.3,
            outputDir,
            format: (opts.format ?? "png") as "png" | "jpg" | "webp",
            quality: opts.quality ? Number(opts.quality) : 85,
            maxResolution: opts.maxResolution ? Number(opts.maxResolution) : 1080,
          },
          transcript,
          info.chapters
        );

        frameSpinner.succeed(
          `Extracted ${result.frames.length} frames in ${(result.extractionTimeMs / 1000).toFixed(1)}s`
        );

        console.log(`\nFrames saved to: ${outputDir}`);
        for (const frame of result.frames) {
          console.log(
            `  ${frame.filePath.split("/").pop()} [${formatTimestamp(frame.timestamp)}]`
          );
        }
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
