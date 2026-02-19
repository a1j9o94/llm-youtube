import type { Command } from "commander";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseVideoId } from "../utils/video-id.ts";
import { fetchTranscript, fetchVideoInfo } from "../core/transcript.ts";
import { downloadVideo } from "../core/downloader.ts";
import { extractFrames } from "../core/frames/extractor.ts";
import { alignFramesWithTranscript } from "../core/alignment.ts";
import { generateManifest } from "../core/manifest.ts";
import { ensureDependencies } from "../utils/dependencies.ts";
import { formatTimestamp } from "../utils/timestamp.ts";
import { createSpinner, printSuccess, printError } from "../utils/progress.ts";
import type { ManifestOptions } from "../types/options.ts";
import type { FrameMethod } from "../types/frame.ts";

export function registerManifestCommand(program: Command): void {
  program
    .command("manifest")
    .description(
      `Generate a structured JSON manifest that maps visual frames to transcript segments.
  This is the alignment artifact — the core output for downstream LLM processing.

  Without --visual: transcript-only manifest (segments with text, no frames).
  With --visual: downloads video, extracts frames, and aligns them to transcript segments.

  Manifest structure: {version, videoId, videoTitle, duration, segments: [{startTime, endTime,
  transcript, chapterTitle?, frames: [{timestamp, base64?, filePath?}]}], metadata}

  Examples:
    llm-youtube manifest -v dQw4w9WgXcQ -o context.json
    llm-youtube manifest -v dQw4w9WgXcQ --visual -o manifest.json
    llm-youtube manifest -v dQw4w9WgXcQ --visual --frame-dir ./frames/ -o manifest.json`
    )
    .requiredOption("-v, --video <id>", "YouTube video ID or full URL")
    .option("--visual", "Download video + extract frames + include in manifest", false)
    .option("-o, --output <path>", "Output file path for manifest JSON (prints to stdout if omitted)")
    .option("--include-frames", "Embed base64 frame data in manifest JSON (default: true)", true)
    .option("--frame-dir <dir>", "Save frame images to this directory and reference file paths in manifest")
    .option("-m, --method <method>", "Frame extraction: scene|interval|keyframe|hybrid (default: hybrid)", "hybrid")
    .option("-i, --interval <seconds>", "Seconds between frames when method=interval (default: 10)", "10")
    .option("--scene-threshold <threshold>", "Scene sensitivity 0.0-1.0 (default: 0.3)", "0.3")
    .option("--max-frames <count>", "Max frames to include (default: 50)", "50")
    .option("-l, --lang <code>", "Transcript language code (default: en)", "en")
    .option("--no-cache", "Bypass cache and re-fetch everything")
    .action(async (opts: ManifestOptions & { cache?: boolean }) => {
      try {
        const { id } = parseVideoId(opts.video);

        const deps = opts.visual ? ["yt-dlp", "ffmpeg"] : ["yt-dlp"];
        await ensureDependencies(deps);

        // Fetch info
        const infoSpinner = createSpinner("Fetching video info...").start();
        const info = await fetchVideoInfo(id);
        infoSpinner.succeed(
          `Video found: "${info.title}" (${formatTimestamp(info.duration)})`
        );

        // Fetch transcript
        const tSpinner = createSpinner("Fetching transcript...").start();
        const transcript = await fetchTranscript(id, {
          lang: opts.lang,
          cache: opts.cache,
        });
        tSpinner.succeed(
          `Transcript loaded (${transcript.segments.length} segments)`
        );

        let frames;
        if (opts.visual) {
          // Download video
          const dlSpinner = createSpinner("Downloading video...").start();
          const download = await downloadVideo(id);
          dlSpinner.succeed("Video downloaded");

          // Extract frames
          const method = (opts.method ?? "hybrid") as FrameMethod;
          const frameDir =
            opts.frameDir ??
            join(tmpdir(), `llm-youtube-manifest-${id}-${Date.now()}`);
          await mkdir(frameDir, { recursive: true });

          const fSpinner = createSpinner(
            `Extracting frames (${method})...`
          ).start();
          const extraction = await extractFrames(
            download.filePath,
            {
              method,
              maxFrames: opts.maxFrames ? Number(opts.maxFrames) : 50,
              interval: opts.interval ? Number(opts.interval) : 10,
              sceneThreshold: opts.sceneThreshold
                ? Number(opts.sceneThreshold)
                : 0.3,
              outputDir: frameDir,
            },
            transcript,
            info.chapters
          );
          frames = extraction.frames;
          fSpinner.succeed(`Extracted ${frames.length} frames`);

          if (opts.frameDir) {
            printSuccess(`Frames saved to: ${opts.frameDir}`);
          }
        }

        // Align
        const alignSpinner = createSpinner("Aligning...").start();
        const alignment = alignFramesWithTranscript(
          frames ?? [],
          transcript,
          info.chapters
        );
        alignSpinner.succeed(
          `Aligned into ${alignment.segmentCount} segments`
        );

        // Generate manifest
        const manifest = await generateManifest({
          alignment,
          videoInfo: info,
          language: opts.lang ?? "en",
          method: (opts.method ?? "hybrid") as FrameMethod,
          includeFrameBase64: opts.includeFrames !== false && opts.visual,
          frameDir: opts.frameDir,
        });

        const json = JSON.stringify(manifest, null, 2);

        if (opts.output) {
          await Bun.write(opts.output, json);
          printSuccess(`Manifest written to ${opts.output}`);
        } else {
          console.log(json);
        }

        process.stderr.write(
          `\nManifest: ${alignment.frameCount} frames across ${alignment.segmentCount} segments\n`
        );
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
