import type { Command } from "commander";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, rm } from "node:fs/promises";
import { parseVideoSource } from "../utils/video-source.ts";
import { parseTimestamp, type TimestampRange } from "../utils/timestamp.ts";
import { fetchTranscript, fetchVideoInfo, loadTranscriptFile } from "../core/transcript.ts";
import { queryLlm } from "../core/llm.ts";
import { downloadVideo } from "../core/downloader.ts";
import { extractFrames } from "../core/frames/extractor.ts";
import { alignFramesWithTranscript } from "../core/alignment.ts";
import { ensureDependencies } from "../utils/dependencies.ts";
import { formatTimestamp } from "../utils/timestamp.ts";
import {
  createSpinner,
  createProgressBar,
  printSuccess,
  printError,
  printFooter,
} from "../utils/progress.ts";
import type { AskOptions } from "../types/options.ts";
import type { FrameMethod } from "../types/frame.ts";

export function registerAskCommand(program: Command): void {
  program
    .command("ask")
    .description(
      `Ask Claude a question about a video using its transcript and optionally visual frames.

  By default, fetches the transcript and sends it to Claude with your question (fast, cheap).
  Add --visual to also download the video, extract key frames, and include them in the query.

  Examples:
    llm-youtube ask "Summarize the key arguments" -v dQw4w9WgXcQ
    llm-youtube ask "What charts are shown?" -v dQw4w9WgXcQ --visual
    llm-youtube ask "What code is on screen?" -v abc123 --visual --around 5:00-8:00
    llm-youtube ask "List all products mentioned" -v abc123 --json
    llm-youtube ask "Summarize" -v https://www.loom.com/share/abc123... --transcript-file captions.vtt

  Output: Streams the LLM response to stdout. Progress/status goes to stderr.
  Footer shows: frame count, segment count, wall time, and cost estimate.`
    )
    .argument("<question>", "Natural language question about the video content")
    .requiredOption("-v, --video <id>", "YouTube video ID/URL or Loom share URL")
    .option("--visual", "Download video + extract frames + use Claude vision (slower, richer)", false)
    .option("--transcript-file <path>", "Path to a local VTT or SRT transcript file (skips yt-dlp transcript fetch)")
    .option("-m, --method <method>", "Frame extraction method: scene|interval|keyframe|hybrid (default: hybrid)")
    .option("-i, --interval <seconds>", "Seconds between frames when method=interval (default: 10)", "10")
    .option("--scene-threshold <threshold>", "Scene detection sensitivity 0.0-1.0, lower=more frames (default: 0.3)", "0.3")
    .option("--max-frames <count>", "Max frames sent to Claude. More frames = higher cost (default: 50)", "50")
    .option("--around <timestamp>", "Focus on a time range. Accepts '5:00' (±2.5min window) or '1:00-3:00' (exact range)")
    .option("-l, --lang <code>", "Transcript language code (default: en)", "en")
    .option("--model <model>", "Override Claude model (default: claude-sonnet-4-5-20250929)")
    .option("-s, --system <prompt>", "Prepend additional context to the system prompt")
    .option("--json", "Buffer response and output as JSON: {answer, model, inputTokens, outputTokens, costEstimate}", false)
    .option("--no-cache", "Bypass transcript/frame cache and re-fetch everything", false)
    .option("--verbose", "Show detailed progress for each pipeline step", false)
    .action(async (question: string, opts: AskOptions & { transcriptFile?: string }) => {
      const startTime = performance.now();

      try {
        const source = parseVideoSource(opts.video);

        // Check dependencies
        if (opts.visual) {
          await ensureDependencies(["yt-dlp", "ffmpeg"]);
        } else {
          await ensureDependencies(["yt-dlp"]);
        }

        // Fetch video info
        const infoSpinner = createSpinner("Fetching video info...").start();
        const info = await fetchVideoInfo(source);
        infoSpinner.succeed(
          `Video found: "${info.title}" (${formatTimestamp(info.duration)})`
        );

        // Fetch transcript
        let transcript;
        if (opts.transcriptFile) {
          const tSpinner = createSpinner("Loading transcript file...").start();
          transcript = await loadTranscriptFile(opts.transcriptFile, `${source.platform}_${source.id}`);
          tSpinner.succeed(
            `Transcript loaded from file (${transcript.segments.length} segments)`
          );
        } else {
          const transcriptSpinner = createSpinner(
            `Fetching transcript (${opts.lang ?? "en"})...`
          ).start();
          transcript = await fetchTranscript(source, {
            lang: opts.lang,
            cache: !opts.noCache,
          });
          transcriptSpinner.succeed(
            `Transcript loaded (${transcript.segments.length} segments)`
          );
        }

        // Parse --around timestamp range
        let timestampRange: { start: number; end: number } | undefined;
        if (opts.around) {
          const parsed = parseTimestamp(opts.around);
          if (typeof parsed === "number") {
            // Single timestamp: create a 5-minute window around it
            timestampRange = {
              start: Math.max(0, parsed - 150),
              end: Math.min(info.duration, parsed + 150),
            };
          } else {
            timestampRange = parsed;
          }
        }

        let frames;
        let alignment;
        let frameCount = 0;
        let segmentCount = 0;

        if (opts.visual) {
          // Download video
          const dlSpinner = createSpinner("Downloading video...").start();
          const download = await downloadVideo(source, {
            timestampRange,
            onProgress: (pct) => {
              dlSpinner.text = `Downloading video... ${pct.toFixed(0)}%`;
            },
          });
          dlSpinner.succeed(
            `Video downloaded (${(download.fileSize / 1024 / 1024).toFixed(1)}MB)`
          );

          // Extract frames
          const frameSpinner = createSpinner(
            `Extracting frames (${opts.method ?? "hybrid"} method)...`
          ).start();

          const tempFrameDir = join(
            tmpdir(),
            `llm-youtube-frames-${source.platform}_${source.id}-${Date.now()}`
          );
          await mkdir(tempFrameDir, { recursive: true });

          const extraction = await extractFrames(
            download.filePath,
            {
              method: (opts.method ?? "hybrid") as FrameMethod,
              maxFrames: opts.maxFrames ? Number(opts.maxFrames) : 50,
              interval: opts.interval ? Number(opts.interval) : 10,
              sceneThreshold: opts.sceneThreshold
                ? Number(opts.sceneThreshold)
                : 0.3,
              outputDir: tempFrameDir,
              timestampRange,
            },
            transcript,
            info.chapters
          );
          frames = extraction.frames;
          frameSpinner.succeed(
            `Frames extracted (${frames.length} frames in ${(extraction.extractionTimeMs / 1000).toFixed(1)}s)`
          );

          // Align frames with transcript
          const alignSpinner = createSpinner(
            "Aligning frames with transcript..."
          ).start();
          const alignResult = alignFramesWithTranscript(
            frames,
            transcript,
            info.chapters
          );
          alignment = alignResult;
          segmentCount = alignResult.segmentCount;
          frameCount = alignResult.frameCount;
          alignSpinner.succeed(`Aligned into ${segmentCount} segments`);
        }

        // Query LLM
        const llmSpinner = createSpinner(
          `Querying Claude (${opts.model ?? "default"})...`
        ).start();

        const response = await queryLlm({
          question,
          transcript,
          frames,
          alignment,
          model: opts.model,
          systemPrompt: opts.system,
          jsonOutput: opts.json,
          platform: source.platform,
          onStream: (chunk) => {
            if (!opts.json) {
              if (llmSpinner.isSpinning) {
                llmSpinner.stop();
                process.stderr.write("\n");
              }
              process.stdout.write(chunk);
            }
          },
        });

        if (opts.json) {
          llmSpinner.stop();
          console.log(
            JSON.stringify(
              {
                answer: response.answer,
                model: response.model,
                inputTokens: response.inputTokens,
                outputTokens: response.outputTokens,
                costEstimate: response.costEstimate,
              },
              null,
              2
            )
          );
        } else {
          process.stdout.write("\n");
        }

        const elapsed = performance.now() - startTime;
        printFooter({
          frames: opts.visual ? frameCount : undefined,
          segments: opts.visual ? segmentCount : undefined,
          totalTimeMs: elapsed,
          costEstimate: response.costEstimate,
          transcriptOnly: !opts.visual,
        });
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
