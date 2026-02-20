import type { Command } from "commander";
import { parseVideoSource } from "../utils/video-source.ts";
import { fetchVideoInfo } from "../core/transcript.ts";
import { formatTimestamp } from "../utils/timestamp.ts";
import { createSpinner, printError } from "../utils/progress.ts";

export function registerInfoCommand(program: Command): void {
  program
    .command("info")
    .description(
      `Fetch video metadata without downloading. Returns title, channel, duration, upload date,
  view count, available subtitle languages, and chapter list.

  Use this to check a video exists and discover available languages before calling other commands.

  Examples:
    llm-youtube info -v dQw4w9WgXcQ
    llm-youtube info -v https://www.youtube.com/watch?v=dQw4w9WgXcQ
    llm-youtube info -v https://www.loom.com/share/abc123def456abc123def456abc123de`
    )
    .requiredOption("-v, --video <id>", "YouTube video ID/URL or Loom share URL")
    .action(async (opts: { video: string }) => {
      try {
        const source = parseVideoSource(opts.video);
        const spinner = createSpinner("Fetching video info...").start();

        const info = await fetchVideoInfo(source);
        spinner.succeed(`Video found: "${info.title}" (${formatTimestamp(info.duration)})`);

        console.log();
        console.log(`Title:    ${info.title}`);
        console.log(`Channel:  ${info.channel}`);
        console.log(`Duration: ${formatTimestamp(info.duration)}`);
        console.log(`Platform: ${info.platform}`);
        console.log(`Uploaded: ${info.uploadDate}`);
        console.log(`Views:    ${info.viewCount.toLocaleString()}`);

        if (info.languages.length > 0) {
          console.log(`Languages: ${info.languages.slice(0, 20).join(", ")}${info.languages.length > 20 ? ` (+${info.languages.length - 20} more)` : ""}`);
        }

        if (info.chapters.length > 0) {
          console.log(`\nChapters (${info.chapters.length}):`);
          for (const ch of info.chapters) {
            console.log(`  [${formatTimestamp(ch.startTime)}] ${ch.title}`);
          }
        }

        if (info.description) {
          console.log(`\nDescription:\n${info.description.slice(0, 500)}${info.description.length > 500 ? "..." : ""}`);
        }
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
