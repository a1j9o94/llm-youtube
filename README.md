# llm-youtube

CLI tool that lets you point at a YouTube or Loom video and ask an LLM questions about its content — both what was said (transcript) and what was shown (visual frames).

The core differentiator is **temporal alignment**: mapping frames to transcript segments so the LLM gets structured, queryable context instead of raw dumps.

## Requirements

- [Bun](https://bun.sh) >= 1.0
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — on PATH
- [ffmpeg](https://ffmpeg.org/) — on PATH (only needed for `--visual` mode)
- `ANTHROPIC_API_KEY` environment variable

## Install

```bash
bun install
```

## Quick Start

```bash
# Ask a question about a video (transcript only)
bun src/index.ts ask "What are the key themes?" -v dQw4w9WgXcQ

# Ask with visual analysis (extracts + analyzes frames)
bun src/index.ts ask "What charts are shown?" -v dQw4w9WgXcQ --visual

# Get video metadata
bun src/index.ts info -v dQw4w9WgXcQ

# Dump transcript
bun src/index.ts transcript -v dQw4w9WgXcQ

# Extract frames only
bun src/index.ts frames -v dQw4w9WgXcQ --method scene -o ./frames/

# Generate structured manifest (the alignment artifact)
bun src/index.ts manifest -v dQw4w9WgXcQ --visual -o ./manifest.json

# Analyze a Loom recording (with local transcript file)
bun src/index.ts ask "Summarize this" -v https://www.loom.com/share/abc123... --transcript-file captions.vtt

# Loom with visual mode (no transcript needed)
bun src/index.ts ask "What's shown?" -v https://www.loom.com/share/abc123... --visual
```

## Commands

### `ask` — Ask a question about a video

```bash
llm-youtube ask "What are the 3 main arguments?" -v <video>
llm-youtube ask "Describe the charts shown" -v <video> --visual
llm-youtube ask "What code is shown at 5 min?" -v <video> --visual --around 5:00
```

| Flag | Default | Description |
|------|---------|-------------|
| `-v, --video` | required | YouTube video ID/URL or Loom share URL |
| `--transcript-file` | — | Path to local VTT/SRT file (fallback for Loom) |
| `--visual` | false | Enable frame extraction + vision |
| `-m, --method` | hybrid | Frame method: scene, interval, keyframe, hybrid |
| `-i, --interval` | 10 | Seconds between frames (interval method) |
| `--scene-threshold` | 0.3 | Scene change sensitivity (0-1) |
| `--max-frames` | 50 | Hard cap on frames sent to LLM |
| `--around` | — | Focus on timestamp (e.g., `5:00` or `1:00-3:00`) |
| `-l, --lang` | en | Transcript language |
| `--model` | env default | Override Claude model |
| `-s, --system` | — | Additional system prompt |
| `--json` | false | Output structured JSON |

### `transcript` — Dump raw transcript

```bash
llm-youtube transcript -v <video>
llm-youtube transcript -v <video> --json --chapters
```

### `frames` — Extract frames (no LLM)

```bash
llm-youtube frames -v <video> --method scene -o ./frames/
```

### `manifest` — Generate alignment artifact

```bash
llm-youtube manifest -v <video> --visual -o ./manifest.json
```

### `info` — Video metadata

```bash
llm-youtube info -v <video>
```

## Supported Platforms

| Platform | Video ID/URL | Transcript | Visual Frames |
|----------|-------------|------------|---------------|
| **YouTube** | ID, full URL, short URL, embed, shorts | Auto via yt-dlp | Auto via yt-dlp |
| **Loom** | Share URL, embed URL | Use `--transcript-file` (yt-dlp may not extract Loom captions) | Auto via yt-dlp |

For Loom videos where transcript extraction fails, you can download the transcript from Loom's web interface and pass it via `--transcript-file captions.vtt`. Visual mode (`--visual`) works without a transcript.

## Frame Extraction Methods

| Method | Best For | How It Works |
|--------|----------|-------------|
| **hybrid** (default) | General use | Scene detection + transcript-based topic segmentation |
| **scene** | Presentations, slides | Detects visual scene changes via ffmpeg |
| **interval** | Consistent sampling | Fixed interval (every N seconds) |
| **keyframe** | Fast extraction | I-frames only, no re-encoding |

The **hybrid** method ensures every meaningful transcript section has at least one representative frame, even during segments with no visual changes (e.g., a talking head during a live demo explanation).

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...       # Required for ask command
LLM_YOUTUBE_CACHE_DIR=~/.llm-youtube/cache  # Optional
LLM_YOUTUBE_MODEL=claude-sonnet-4-5-20250929  # Optional
LLM_YOUTUBE_MAX_TOKENS=4096       # Optional
```

## Testing

```bash
# Unit tests
bun test

# YouTube API validation (hits network)
RUN_VALIDATION=true bun test tests/validation/

# Integration tests (hits network + API)
RUN_INTEGRATION=true bun test tests/integration/
```

## Architecture

```
src/
├── index.ts              # CLI entry (commander)
├── commands/             # Subcommand handlers
├── core/
│   ├── transcript.ts     # Transcript via yt-dlp (YouTube/Loom) + local VTT/SRT
│   ├── downloader.ts     # Video download via yt-dlp
│   ├── frames/           # 4 extraction methods + orchestrator
│   ├── alignment.ts      # Frame-transcript temporal alignment
│   ├── llm.ts            # Anthropic API client
│   └── manifest.ts       # Manifest generation
├── utils/                # Cache, config, video-source parser, etc.
└── types/                # TypeScript type definitions
```

## License

MIT
