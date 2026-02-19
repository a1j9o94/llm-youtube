import type { Command } from "commander";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, rm } from "node:fs/promises";
import { parseVideoId } from "../utils/video-id.ts";
import { parseTimestamp, type TimestampRange } from "../utils/timestamp.ts";
import { fetchTranscript, fetchVideoInfo } from "../core/transcript.ts";
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
    .description("Ask a question about a YouTube video")
    .argument("<question>", "The question to ask about the video")
    .requiredOption("-v, --video <id>", "YouTube video ID or URL")
    .option("--visual", "Enable frame extraction + vision analysis", false)
    .option("-m, --method <method>", "Frame selection method", "hybrid")
    .option("-i, --interval <seconds>", "Seconds between frames (interval method)", "10")
    .option("--scene-threshold <threshold>", "Scene change sensitivity 0.0-1.0", "0.3")
    .option("--max-frames <count>", "Hard cap on frames sent to LLM", "50")
    .option("--around <timestamp>", "Focus on timestamp range (e.g., 5:00 or 1:00-3:00)")
    .option("-l, --lang <code>", "Transcript language code", "en")
    .option("--model <model>", "Override Claude model")
    .option("-s, --system <prompt>", "Additional system prompt context")
    .option("--json", "Output structured JSON", false)
    .option("--no-cache", "Skip cache", false)
    .option("--verbose", "Show progress details", false)
    .action(async (question: string, opts: AskOptions) => {
      const startTime = performance.now();

      try {
        const { id } = parseVideoId(opts.video);

        // Check dependencies
        if (opts.visual) {
          await ensureDependencies(["yt-dlp", "ffmpeg"]);
        } else {
          await ensureDependencies(["yt-dlp"]);
        }

        // Fetch video info
        const infoSpinner = createSpinner("Fetching video info...").start();
        const info = await fetchVideoInfo(id);
        infoSpinner.succeed(
          `Video found: "${info.title}" (${formatTimestamp(info.duration)})`
        );

        // Fetch transcript
        const transcriptSpinner = createSpinner(
          `Fetching transcript (${opts.lang ?? "en"})...`
        ).start();
        const transcript = await fetchTranscript(id, {
          lang: opts.lang,
          cache: !opts.noCache,
        });
        transcriptSpinner.succeed(
          `Transcript loaded (${transcript.segments.length} segments)`
        );

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
          const download = await downloadVideo(id, {
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
            `llm-youtube-frames-${id}-${Date.now()}`
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
