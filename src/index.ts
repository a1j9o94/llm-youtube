#!/usr/bin/env bun
import { Command } from "commander";
import { registerAskCommand } from "./commands/ask.ts";
import { registerFramesCommand } from "./commands/frames.ts";
import { registerManifestCommand } from "./commands/manifest.ts";
import { registerTranscriptCommand } from "./commands/transcript.ts";
import { registerInfoCommand } from "./commands/info.ts";

const program = new Command();

program
  .name("llm-youtube")
  .description(
    `Extract transcripts, visual frames, and structured context from YouTube videos for LLM analysis.

OVERVIEW:
  This CLI fetches a YouTube video's transcript and optionally extracts visual frames,
  then either queries Claude directly or produces structured artifacts (JSON manifests)
  that other tools can consume. The core value is temporal alignment — mapping what was
  said to what was shown at each moment.

COMMANDS:
  ask         Ask Claude a question about a video (transcript-only or with --visual frames)
  transcript  Dump raw transcript as text or JSON (no LLM call)
  info        Quick metadata lookup: title, channel, duration, languages, chapters
  frames      Extract video frames to disk using scene/interval/keyframe/hybrid methods
  manifest    Generate structured JSON mapping frames ↔ transcript segments

TYPICAL AGENT WORKFLOWS:

  1. Get video context before asking questions:
     llm-youtube info -v <id>
     llm-youtube transcript -v <id> --json

  2. Ask a question (transcript-only, fast, cheap):
     llm-youtube ask "Summarize the key points" -v <id>

  3. Ask about visual content (downloads video, extracts frames, sends to Claude):
     llm-youtube ask "What diagrams are shown?" -v <id> --visual

  4. Focus on a specific timestamp:
     llm-youtube ask "What is explained here?" -v <id> --visual --around 5:00-8:00

  5. Generate a manifest for downstream processing:
     llm-youtube manifest -v <id> --visual -o context.json

  6. Extract frames for manual inspection:
     llm-youtube frames -v <id> --method scene -o ./frames/

INPUT FORMATS:
  The -v/--video flag accepts any of these:
    dQw4w9WgXcQ                                    (raw 11-char ID)
    https://www.youtube.com/watch?v=dQw4w9WgXcQ    (standard URL)
    https://youtu.be/dQw4w9WgXcQ                   (short URL)
    https://www.youtube.com/embed/dQw4w9WgXcQ      (embed URL)
    https://www.youtube.com/shorts/dQw4w9WgXcQ     (shorts URL)

ENVIRONMENT:
  ANTHROPIC_API_KEY          Required for 'ask' command. Set to your Claude API key.
  LLM_YOUTUBE_MODEL          Default model (default: claude-sonnet-4-5-20250929)
  LLM_YOUTUBE_MAX_TOKENS     Max response tokens (default: 4096)
  LLM_YOUTUBE_CACHE_DIR      Cache directory (default: ~/.llm-youtube/cache)

SYSTEM DEPENDENCIES:
  yt-dlp    Required for all commands. Install: brew install yt-dlp
  ffmpeg    Required for --visual mode and frames command. Install: brew install ffmpeg

COST:
  Transcript-only queries cost ~$0.002-0.01 depending on video length.
  Visual queries with 30 frames cost ~$0.03-0.08.
  Cost estimate is shown in the footer of every 'ask' response.`
  )
  .version("0.1.0");

registerAskCommand(program);
registerFramesCommand(program);
registerManifestCommand(program);
registerTranscriptCommand(program);
registerInfoCommand(program);

program.parse();
