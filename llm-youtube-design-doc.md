# llm-youtube — Engineering Design Document

**Version:** 0.1.0
**Author:** Adrian Obleton
**Date:** February 19, 2026
**Status:** Ready for Implementation

---

## 1. Problem Statement

There is no single CLI tool that lets a developer point at a YouTube video and ask an LLM a question about its content — both what was said (transcript) and what was shown (visual frames). Existing MCP servers handle transcript extraction, but none solve the harder problem: extracting the *right* visual frames, aligning them temporally with the transcript, and sending the combined multimodal payload to an LLM for analysis.

### Target Users

- Developers using LLM-powered workflows who reference video content (talks, tutorials, presentations, demos)
- Design/product teams capturing inspiration from video content
- Researchers extracting structured data from lecture or conference recordings
- Content creators analyzing competitor or reference videos

### Core Insight

Video is temporal media. The value isn't in dumping a raw transcript or 3,000 frames — it's in producing a **structured, aligned, queryable artifact** that maps *what was said* to *what was shown* at each moment. This alignment layer is what makes `llm-youtube` different from a transcript extractor.

---

## 2. CLI Interface Design

### Installation

```bash
bun install -g llm-youtube
```

### Required System Dependencies

- `yt-dlp` — video downloading (must be on PATH)
- `ffmpeg` / `ffprobe` — frame extraction and video analysis (must be on PATH)

The CLI must verify these exist at startup and provide actionable install instructions if missing.

### Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...       # Required for ask/analyze commands
LLM_YOUTUBE_CACHE_DIR=~/.llm-youtube/cache  # Optional, defaults shown
LLM_YOUTUBE_MODEL=claude-sonnet-4-5-20250929  # Optional, default model
LLM_YOUTUBE_MAX_TOKENS=4096       # Optional, max response tokens
```

### Command Structure

The CLI uses a subcommand pattern via `commander`.

---

#### `llm-youtube ask`

The primary command. Ask a question about a video.

```bash
llm-youtube ask "What are the key themes of this video?" -v dQw4w9WgXcQ
llm-youtube ask "What are the key themes?" --video https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

**With visual analysis:**

```bash
llm-youtube ask "Give me each of the charts shown in this presentation" -v dQw4w9WgXcQ --visual
llm-youtube ask "What code is shown on screen at the 5 minute mark?" -v abc123 --visual --around 5:00
```

**Flags:**

| Flag | Alias | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--video` | `-v` | string | *required* | YouTube video ID or full URL |
| `--visual` | none | boolean | false | Enable frame extraction + vision analysis |
| `--method` | `-m` | enum | `hybrid` | Frame selection: `scene`, `interval`, `keyframe`, `hybrid` |
| `--interval` | `-i` | number | 10 | Seconds between frames (only for `interval` method) |
| `--scene-threshold` | none | number | 0.3 | Scene change sensitivity 0.0-1.0 (lower = more sensitive) |
| `--max-frames` | none | number | 50 | Hard cap on frames sent to LLM |
| `--around` | none | string | none | Focus analysis on a timestamp range (e.g., `5:00` or `1:00-3:00`) |
| `--lang` | `-l` | string | `en` | Transcript language code |
| `--model` | none | string | env default | Override Claude model |
| `--system` | `-s` | string | none | Additional system prompt context |
| `--json` | none | boolean | false | Output structured JSON instead of text |
| `--no-cache` | none | boolean | false | Skip cache, re-fetch everything |
| `--verbose` | none | boolean | false | Show progress details and debug info |

---

#### `llm-youtube frames`

Extract frames only, no LLM call. Useful for manual review or piping into other tools.

```bash
llm-youtube frames -v dQw4w9WgXcQ --method scene -o ./frames/
llm-youtube frames -v dQw4w9WgXcQ --method interval --interval 30 -o ./frames/
```

**Flags:**

| Flag | Alias | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--video` | `-v` | string | *required* | YouTube video ID or full URL |
| `--output` | `-o` | string | `./frames/` | Output directory for frames |
| `--method` | `-m` | enum | `scene` | Frame selection method |
| `--interval` | `-i` | number | 10 | Seconds between frames |
| `--scene-threshold` | none | number | 0.3 | Scene detection sensitivity |
| `--max-frames` | none | number | none | Cap frame count |
| `--format` | `-f` | enum | `png` | Output format: `png`, `jpg`, `webp` |
| `--quality` | `-q` | number | 85 | Image quality (1-100, for jpg/webp) |
| `--max-resolution` | none | number | 1080 | Max height in pixels |

Output filenames follow pattern: `frame_{index}_{timestamp}.{format}`
Example: `frame_007_04m32s.png`

---

#### `llm-youtube manifest`

Generate a structured JSON manifest mapping frames to transcript segments. This is the **alignment artifact** — the core differentiator.

```bash
llm-youtube manifest -v dQw4w9WgXcQ --visual -o ./manifest.json
llm-youtube manifest -v dQw4w9WgXcQ -o ./manifest.json  # transcript-only manifest
```

**Flags:** Same as `frames` plus:

| Flag | Alias | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--output` | `-o` | string | stdout | Output path for manifest JSON |
| `--include-frames` | none | boolean | true | Include base64 frame data in manifest |
| `--frame-dir` | none | string | none | Save frames to dir AND reference paths in manifest |

---

#### `llm-youtube transcript`

Dump the raw transcript. Simple utility command.

```bash
llm-youtube transcript -v dQw4w9WgXcQ
llm-youtube transcript -v dQw4w9WgXcQ --timestamps --json
```

**Flags:**

| Flag | Alias | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--video` | `-v` | string | *required* | YouTube video ID or full URL |
| `--timestamps` | `-t` | boolean | true | Include timestamps |
| `--lang` | `-l` | string | `en` | Language code |
| `--json` | none | boolean | false | Output as JSON array |
| `--chapters` | none | boolean | false | Group by video chapters if available |

---

#### `llm-youtube info`

Quick metadata lookup. No download needed.

```bash
llm-youtube info -v dQw4w9WgXcQ
```

Returns: title, channel, duration, upload date, view count, description, available languages, chapter list.

---

## 3. Architecture

### Project Structure

```
llm-youtube/
├── src/
│   ├── index.ts                  # CLI entry point (commander setup)
│   ├── commands/
│   │   ├── ask.ts                # ask subcommand handler
│   │   ├── frames.ts             # frames subcommand handler
│   │   ├── manifest.ts           # manifest subcommand handler
│   │   ├── transcript.ts         # transcript subcommand handler
│   │   └── info.ts               # info subcommand handler
│   ├── core/
│   │   ├── transcript.ts         # YouTube transcript fetching
│   │   ├── downloader.ts         # yt-dlp video download management
│   │   ├── frames/
│   │   │   ├── extractor.ts      # Frame extraction orchestrator
│   │   │   ├── scene.ts          # Scene detection via ffmpeg
│   │   │   ├── interval.ts       # Fixed-interval extraction
│   │   │   ├── keyframe.ts       # I-frame extraction
│   │   │   └── hybrid.ts         # Combined scene + semantic selection
│   │   ├── alignment.ts          # Frame-to-transcript temporal alignment
│   │   ├── llm.ts                # Anthropic API client (text + vision)
│   │   └── manifest.ts           # Manifest generation and serialization
│   ├── utils/
│   │   ├── cache.ts              # Disk cache for transcripts, frames, manifests
│   │   ├── dependencies.ts       # System dependency checker (yt-dlp, ffmpeg)
│   │   ├── video-id.ts           # Parse video ID from URL or raw ID
│   │   ├── progress.ts           # Terminal progress/spinner/streaming output
│   │   ├── timestamp.ts          # Timestamp parsing and formatting utilities
│   │   └── config.ts             # Config loading (env vars, rc file)
│   └── types/
│       ├── transcript.ts         # Transcript data types
│       ├── frame.ts              # Frame metadata types
│       ├── manifest.ts           # Manifest schema types
│       └── options.ts            # CLI option types
├── tests/
│   ├── unit/
│   │   ├── alignment.test.ts
│   │   ├── video-id.test.ts
│   │   ├── timestamp.test.ts
│   │   ├── scene.test.ts
│   │   └── hybrid.test.ts
│   ├── integration/
│   │   ├── transcript.test.ts
│   │   ├── frames.test.ts
│   │   └── ask.test.ts
│   └── fixtures/
│       ├── sample-transcript.json
│       ├── sample-manifest.json
│       └── sample-frames/        # Small set of test frames
├── package.json
├── tsconfig.json
├── bunfig.toml
├── README.md
└── .env.example
```

### Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript (strict mode) | Type safety, developer experience |
| Runtime | Bun | Native fetch, fast startup, built-in TS, auto `.env` loading |
| CLI framework | `commander` | Lightweight, well-typed, standard |
| HTTP client | Native `fetch` | No extra deps for transcript API |
| LLM SDK | `@anthropic-ai/sdk` | Official, typed, streaming support |
| Video download | `yt-dlp` (shell via `Bun.$`) | Industry standard, broadest site support |
| Frame extraction | `ffmpeg` (shell via `Bun.$`) | No alternative at this capability level |
| Testing | `bun test` | Fast, built-in, TypeScript-native |
| Progress UI | `ora` + `cli-progress` | Spinners + progress bars |
| Shell execution | `Bun.$` | Built-in tagged template shell, no extra deps |
| File I/O | `Bun.file()` / `Bun.write()` | Built-in, faster than `node:fs` |
| Env vars | `Bun.env` | Auto-loads `.env` files, no `dotenv` needed |

---

## 4. Core Module Specifications

### 4.1 Video ID Parser (`utils/video-id.ts`)

Must handle all YouTube URL formats and extract the 11-character video ID:

```typescript
type VideoIdResult = {
  id: string;
  originalInput: string;
};

function parseVideoId(input: string): VideoIdResult;
```

**Supported formats:**
- `dQw4w9WgXcQ` (raw ID)
- `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- `https://youtu.be/dQw4w9WgXcQ`
- `https://www.youtube.com/embed/dQw4w9WgXcQ`
- `https://m.youtube.com/watch?v=dQw4w9WgXcQ`
- `https://www.youtube.com/shorts/dQw4w9WgXcQ`
- URLs with additional query params (`&t=120`, `&list=...`, `&si=...`)

Throw a typed error with a helpful message for invalid inputs.

---

### 4.2 Transcript Fetcher (`core/transcript.ts`)

```typescript
interface TranscriptSegment {
  text: string;
  startTime: number;    // seconds (float)
  endTime: number;      // seconds (float)
  duration: number;     // seconds (float)
}

interface TranscriptResult {
  videoId: string;
  language: string;
  segments: TranscriptSegment[];
  totalDuration: number;
  isAutoGenerated: boolean;
}

interface TranscriptOptions {
  lang?: string;
  cache?: boolean;
}

async function fetchTranscript(videoId: string, options?: TranscriptOptions): Promise<TranscriptResult>;
```

**Implementation approach:**

YouTube exposes transcript data through its `timedtext` API. The recommended approach:

1. Fetch the video page HTML to extract the `ytInitialPlayerResponse` JSON
2. Parse `captionTracks` from the player response to find available languages
3. Fetch the selected language's transcript XML (`srv1` or `srv3` format)
4. Parse XML into `TranscriptSegment[]`

Alternatively, use `yt-dlp --write-auto-sub --skip-download --sub-lang en` and parse the resulting VTT/SRT file. This is more reliable but slower due to yt-dlp startup overhead.

**Decision for implementer:** Start with the `yt-dlp` subtitle approach for reliability. If startup latency is a problem, migrate to direct API fetching as an optimization later. Both should implement the same `TranscriptResult` interface.

**Deduplication:** Auto-generated captions frequently contain repeated phrases across overlapping segments. Implement a deduplication pass that merges segments with >80% text overlap.

---

### 4.3 Video Downloader (`core/downloader.ts`)

```typescript
interface DownloadOptions {
  maxResolution?: number;  // default 1080
  format?: string;         // default "bestvideo[height<=maxRes]"
  outputPath?: string;
  onProgress?: (percent: number) => void;
}

interface DownloadResult {
  filePath: string;
  resolution: { width: number; height: number };
  duration: number;
  fileSize: number;
}

async function downloadVideo(videoId: string, options?: DownloadOptions): Promise<DownloadResult>;
```

**Implementation details:**

- Shell out to `yt-dlp` via `Bun.$`
- Use `--progress-template` to parse download progress for the progress bar
- Download to cache directory, skip if already cached (check file exists + video ID match)
- Use format: `bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]` for broad compatibility
- The video file is a **temporary intermediate** — only needed for frame extraction. After frames are extracted, the video can be deleted (or retained if cache is enabled)
- Set a timeout of 120 seconds for the download. Videos longer than ~2 hours at 1080p may need a longer timeout or lower resolution

**Important:** If the user only needs transcript (no `--visual` flag), this module is never invoked. Don't download video unnecessarily.

---

### 4.4 Frame Extraction (`core/frames/`)

This is the most complex subsystem. Four extraction methods, one orchestrator.

#### Common Types

```typescript
interface ExtractedFrame {
  index: number;
  timestamp: number;        // seconds (float)
  timestampFormatted: string;  // "4m32s" or "1h02m15s"
  filePath: string;
  method: FrameMethod;
  score?: number;           // relevance score for hybrid method (0-1)
  sceneChangeScore?: number; // how different from previous frame (0-1)
}

type FrameMethod = "scene" | "interval" | "keyframe" | "hybrid";

interface FrameExtractionOptions {
  method: FrameMethod;
  maxFrames?: number;
  interval?: number;
  sceneThreshold?: number;
  outputDir: string;
  format?: "png" | "jpg" | "webp";
  quality?: number;
  maxResolution?: number;
  timestampRange?: { start: number; end: number }; // for --around flag
}

interface FrameExtractionResult {
  frames: ExtractedFrame[];
  totalExtracted: number;
  totalDiscarded: number;
  method: FrameMethod;
  videoPath: string;
  extractionTimeMs: number;
}
```

#### 4.4.1 Scene Detection (`frames/scene.ts`)

Uses ffmpeg's `select` filter with scene change detection.

```bash
ffmpeg -i input.mp4 \
  -vf "select='gt(scene,0.3)',showinfo" \
  -vsync vfr \
  -frame_pts 1 \
  output/frame_%04d.png
```

Parse `showinfo` output to get timestamps for each emitted frame.

**Key behaviors:**
- `sceneThreshold` of 0.3 works well for presentations/slides. Use 0.15-0.2 for fast-cut video content
- If scene detection produces > `maxFrames`, increase threshold and re-run. Do not just truncate — you'd lose the end of the video
- If scene detection produces < 3 frames, fall back to interval method (video may have no scene changes, e.g., a talking head)

#### 4.4.2 Fixed Interval (`frames/interval.ts`)

```bash
ffmpeg -i input.mp4 \
  -vf "fps=1/10" \
  output/frame_%04d.png
```

Simple. Predictable. Every N seconds.

#### 4.4.3 Keyframe Extraction (`frames/keyframe.ts`)

```bash
ffmpeg -i input.mp4 \
  -vf "select='eq(pict_type,I)'" \
  -vsync vfr \
  output/frame_%04d.png
```

Fastest method (no re-encoding needed). Frame count depends on encoder settings — typically every 2-10 seconds.

#### 4.4.4 Hybrid Method (`frames/hybrid.ts`) — DEFAULT

This is the novel part. Combines scene detection with semantic analysis of the transcript to select the most informative frames.

**Algorithm:**

```
1. Run scene detection at threshold 0.25 → candidate_frames[]
2. Parse transcript into "topic segments" using a heuristic:
   a. Use chapter boundaries if available from YouTube
   b. Otherwise, detect topic shifts:
      - Sliding window of 30 seconds of transcript text
      - When vocabulary overlap between adjacent windows drops below 40%, mark a segment boundary
      - Minimum segment length: 15 seconds
      - Also split on long pauses (>3 second gaps between transcript segments)
3. For each topic segment:
   a. If segment contains 1+ scene-detected frames → keep them all
   b. If segment contains 0 scene-detected frames → extract 1 frame from the midpoint
   c. This ensures every meaningful section has visual representation
4. Deduplicate: if two frames are within 2 seconds of each other, keep the one with the higher scene change score
5. Apply maxFrames cap by dropping frames with lowest combined score:
   score = (sceneChangeScore * 0.6) + (topicBoundaryProximity * 0.4)
   Where topicBoundaryProximity = how close the frame is to a topic segment boundary (normalized 0-1, closer = higher)
6. Sort final frames by timestamp
```

**Why this works:** Presentations naturally have scene changes when slides change, so scene detection captures those. But a 10-minute live demo segment might have zero scene changes while the speaker explains critical concepts — the semantic fallback ensures those moments still get a representative frame.

---

### 4.5 Frame-Transcript Alignment (`core/alignment.ts`)

```typescript
interface AlignedSegment {
  startTime: number;
  endTime: number;
  transcript: string;           // concatenated text for this segment
  frames: ExtractedFrame[];     // frames that fall within this time window
  chapterTitle?: string;        // YouTube chapter title if available
  segmentIndex: number;
}

interface AlignmentResult {
  segments: AlignedSegment[];
  videoId: string;
  totalDuration: number;
  frameCount: number;
  segmentCount: number;
}

function alignFramesWithTranscript(
  frames: ExtractedFrame[],
  transcript: TranscriptResult,
  chapters?: Chapter[]
): AlignmentResult;
```

**Algorithm:**

1. Use topic segments from the hybrid method (or generate them if a different frame method was used)
2. For each segment, collect all frames whose `timestamp` falls within `[segment.startTime, segment.endTime)`
3. Concatenate all `TranscriptSegment.text` values that fall within the time window
4. If YouTube chapters are available, overlay them as labels

---

### 4.6 Manifest Generator (`core/manifest.ts`)

The manifest is the portable output artifact.

```typescript
interface Manifest {
  version: "1.0.0";
  videoId: string;
  videoTitle: string;
  videoUrl: string;
  channelName: string;
  duration: number;
  language: string;
  generatedAt: string;          // ISO 8601
  extractionMethod: FrameMethod;
  segments: ManifestSegment[];
  metadata: {
    totalFrames: number;
    totalSegments: number;
    transcriptTokenEstimate: number;
    hasChapters: boolean;
  };
}

interface ManifestSegment {
  index: number;
  startTime: number;
  endTime: number;
  startFormatted: string;       // "4:32"
  endFormatted: string;
  transcript: string;
  chapterTitle?: string;
  frames: ManifestFrame[];
}

interface ManifestFrame {
  index: number;
  timestamp: number;
  timestampFormatted: string;
  filePath?: string;            // relative path if --frame-dir used
  base64?: string;              // base64 PNG if --include-frames
  width: number;
  height: number;
  method: FrameMethod;
  sceneChangeScore?: number;
}
```

---

### 4.7 LLM Client (`core/llm.ts`)

```typescript
interface LlmQueryOptions {
  question: string;
  transcript: TranscriptResult;
  frames?: ExtractedFrame[];     // if visual mode
  alignment?: AlignmentResult;
  model?: string;
  systemPrompt?: string;
  maxTokens?: number;
  jsonOutput?: boolean;
  onStream?: (chunk: string) => void;
}

interface LlmResponse {
  answer: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costEstimate: number;          // rough USD estimate
}

async function queryLlm(options: LlmQueryOptions): Promise<LlmResponse>;
```

**Prompt construction:**

For **transcript-only** queries:

```
System: You are analyzing a YouTube video. Below is the transcript with timestamps.
Answer the user's question based on the video content.
If referencing specific moments, include the timestamp.

<transcript>
[0:00] Introduction to the topic...
[0:45] First major point about...
...
</transcript>

User: {question}
```

For **visual** queries:

```
System: You are analyzing a YouTube video using both its transcript and visual frames
captured at key moments. Each frame is labeled with its timestamp.
Use both the visual and spoken content to answer the user's question.
When referencing specific moments, include the timestamp.

<video_context>
  <segment start="0:00" end="2:15" chapter="Introduction">
    <transcript>Welcome to today's presentation on...</transcript>
    <frames>
      [Image at 0:05 attached]
      [Image at 1:30 attached]
    </frames>
  </segment>
  ...
</video_context>

User: {question}
```

**Frame encoding for Claude API:**

```typescript
// Each frame becomes an image content block
const imageBlocks = frames.map(frame => ({
  type: "image" as const,
  source: {
    type: "base64" as const,
    media_type: "image/png" as const,
    data: readFileAsBase64(frame.filePath),
  },
}));
```

**Token budget management:**

- Each image consumes tokens based on resolution. At 1080p, ~1600 tokens per image
- 50 frames × 1600 = ~80K tokens in images alone
- Full transcript of a 60-min video ≈ 20-30K tokens
- Claude's context window supports this, but cost matters
- Default `maxFrames: 50` keeps image tokens manageable
- Add a `--budget` flag in a future version to let users set a token budget

**Streaming:**

Always stream responses by default for interactive use. Use the Anthropic SDK's streaming API:

```typescript
const stream = await client.messages.stream({...});
for await (const chunk of stream) {
  options.onStream?.(chunk.delta?.text ?? "");
}
```

---

### 4.8 Cache System (`utils/cache.ts`)

```typescript
interface CacheEntry<T> {
  key: string;
  data: T;
  createdAt: string;
  videoId: string;
  ttlDays: number;
}

class Cache {
  constructor(baseDir?: string);  // default: ~/.llm-youtube/cache

  async getTranscript(videoId: string, lang: string): Promise<TranscriptResult | null>;
  async setTranscript(videoId: string, lang: string, data: TranscriptResult): Promise<void>;

  async getFrames(videoId: string, method: FrameMethod, options: string): Promise<ExtractedFrame[] | null>;
  async setFrames(videoId: string, method: FrameMethod, options: string, frames: ExtractedFrame[]): Promise<void>;

  async getManifest(videoId: string): Promise<Manifest | null>;
  async setManifest(videoId: string, manifest: Manifest): Promise<void>;

  async getVideoFile(videoId: string): Promise<string | null>;  // returns path if cached

  async clear(videoId?: string): Promise<void>;  // clear all or specific video
  async stats(): Promise<{ totalSize: number; entryCount: number }>;
}
```

**Cache structure on disk:**

```
~/.llm-youtube/cache/
├── transcripts/
│   └── dQw4w9WgXcQ_en.json
├── frames/
│   └── dQw4w9WgXcQ_hybrid_0.3/
│       ├── frame_001_00m05s.png
│       ├── frame_002_01m30s.png
│       └── metadata.json
├── manifests/
│   └── dQw4w9WgXcQ.json
└── videos/
    └── dQw4w9WgXcQ.mp4            # temporary, auto-cleaned after 24h
```

**TTL defaults:**
- Transcripts: 30 days (rarely change)
- Frames: 7 days (user might want different extraction params)
- Video files: 24 hours (large, only needed for re-extraction)
- Manifests: 7 days

---

## 5. User Experience Requirements

### 5.1 Progress Feedback

This tool involves multiple slow operations. Users must always know what's happening.

**Required progress indicators:**

```
$ llm-youtube ask "What charts are shown?" -v abc123 --visual

✓ Video found: "Q3 Revenue Deep Dive" (45:12)
⠋ Fetching transcript... (en)
✓ Transcript loaded (1,847 segments)
⠋ Downloading video (1080p)...
  ████████████████████░░░░░░░░░░░░ 67% | 48MB/72MB | ETA 8s
✓ Video downloaded (72MB)
⠋ Extracting frames (hybrid method)...
  Scene detection: found 34 candidates
  Semantic analysis: identified 12 topic segments
  Selected 28 frames
✓ Frames extracted (28 frames in 4.2s)
⠋ Aligning frames with transcript...
✓ Aligned into 12 segments
⠋ Querying Claude (claude-sonnet-4-5-20250929)...

The presentation contains 6 charts:

1. **[2:15]** Revenue by quarter bar chart showing...
   ...streaming response continues...

─────────────────────────────────
📊 28 frames analyzed | 🎯 12 segments | ⏱️ 34s total | 💰 ~$0.08
```

**Rules:**
- Every step that takes > 500ms gets a spinner
- Every step that takes > 3s gets a progress bar (if progress is measurable)
- On completion, show a summary footer with frame count, segment count, wall time, and cost estimate
- If an error occurs mid-pipeline, show what completed successfully and what failed
- Use stderr for progress, stdout for the actual response (enables piping)

### 5.2 Error Handling

Every error must be **actionable**. Examples:

```
✗ yt-dlp not found on PATH
  Install: brew install yt-dlp (macOS) | pip install yt-dlp (pip)
  More info: https://github.com/yt-dlp/yt-dlp#installation

✗ Video unavailable (private or deleted)
  Could not access video: dQw4w9WgXcQ
  Verify the video is public and the URL is correct.

✗ No transcript available in 'en'
  Available languages: ['es', 'pt', 'ja']
  Re-run with: llm-youtube ask "..." -v abc123 --lang es

✗ ANTHROPIC_API_KEY not set
  Set your API key: export ANTHROPIC_API_KEY=sk-ant-...
  Get a key at: https://console.anthropic.com/

✗ Frame extraction failed: ffmpeg exited with code 1
  This can happen with DRM-protected or live stream content.
  Try: llm-youtube ask "..." -v abc123  (transcript-only mode)
```

### 5.3 Streaming Output

LLM responses must stream to the terminal character-by-character (or chunk-by-chunk as the API delivers them). Don't buffer the entire response and dump it at the end. Users should see the answer forming in real-time.

For `--json` output mode, the full response is buffered and written as valid JSON at the end.

---

## 6. Example Scenarios

### Scenario 1: Quick Transcript Q&A

```bash
$ llm-youtube ask "What are the 3 main arguments made in this video?" -v LCEmiRjPEtQ

✓ Video found: "Software in the Era of AI" by Andrej Karpathy (1:05:42)
✓ Transcript loaded (cached)
⠋ Querying Claude...

The three main arguments Karpathy makes are:

1. **[4:20]** Software development is shifting from explicit programming to...
2. **[22:15]** LLMs are becoming a new kind of operating system...
3. **[45:30]** The economics of AI-generated code will...

─────────────────────────────────
📝 Transcript only | ⏱️ 3.2s | 💰 ~$0.02
```

### Scenario 2: Visual Presentation Analysis

```bash
$ llm-youtube ask "Extract every chart and graph. For each, describe what it shows and the key data points." -v finance123 --visual

✓ Video found: "Q3 2025 Earnings Call" (58:30)
✓ Transcript loaded
✓ Video downloaded (89MB)
✓ Frames extracted (41 frames, hybrid method)
✓ Aligned into 15 segments
⠋ Querying Claude (vision)...

I found 8 charts and graphs in the presentation:

1. **[3:45]** Revenue Waterfall Chart
   Shows Q3 revenue of $2.4B broken down by...
   [Frame: frame_005_03m45s.png]

2. **[8:12]** Customer Growth Line Chart
   ...
```

### Scenario 3: Timestamp-Focused Analysis

```bash
$ llm-youtube ask "What code is being demonstrated here?" -v tutorial456 --visual --around 15:00-20:00

✓ Video found: "Building a RAG Pipeline" (45:00)
✓ Transcript loaded
⠋ Downloading video segment (15:00-20:00 only)...
✓ Frames extracted (12 frames from 15:00-20:00)
⠋ Querying Claude...

Between 15:00 and 20:00, the presenter demonstrates a Python RAG pipeline:

**[15:15]** They start by importing LangChain and setting up...
```

Note: when `--around` is specified, only download/extract the relevant portion of the video. Use `yt-dlp --download-sections "*900-1200"` to avoid downloading the full video.

### Scenario 4: Manifest for Design Reference

```bash
$ llm-youtube manifest -v designtalk789 --visual --frame-dir ./reference-frames/ -o ./reference.json

✓ Video found: "Apple Design Principles Talk" (32:15)
✓ Transcript loaded
✓ Video downloaded
✓ Frames extracted (22 frames)
✓ Frames saved to ./reference-frames/
✓ Manifest written to ./reference.json

📦 Manifest: 22 frames across 8 segments
   Frames saved to: ./reference-frames/
   Manifest saved to: ./reference.json
```

The manifest JSON can then be consumed by other tools, loaded into a Claude Code session, or referenced in design docs.

### Scenario 5: Piping into Other Workflows

```bash
# Extract transcript as JSON, pipe to jq to filter
$ llm-youtube transcript -v abc123 --json | jq '[.segments[] | select(.startTime > 300 and .startTime < 600)]'

# Generate manifest and pipe into a Claude Code session
$ llm-youtube manifest -v abc123 --visual > /tmp/video-context.json
$ claude "Using the video manifest in /tmp/video-context.json, create a summary document"

# Chain with other CLIs
$ llm-youtube ask "List all products mentioned" -v abc123 --json | jq -r '.answer' | pbcopy
```

---

## 7. Testing Strategy

### 7.1 Unit Tests

**`video-id.test.ts`** — Test all URL formats, edge cases, invalid inputs
```typescript
describe("parseVideoId", () => {
  it("parses raw 11-char ID");
  it("parses standard youtube.com URL");
  it("parses youtu.be short URL");
  it("parses embed URL");
  it("parses mobile URL");
  it("parses shorts URL");
  it("strips tracking params (?si=, &t=)");
  it("handles URL with playlist params");
  it("throws on empty string");
  it("throws on non-YouTube URL");
  it("throws on malformed URL");
});
```

**`timestamp.test.ts`** — Timestamp formatting and parsing
```typescript
describe("formatTimestamp", () => {
  it("formats 0 as '0:00'");
  it("formats 65.5 as '1:05'");
  it("formats 3725 as '1:02:05'");
});

describe("parseTimestamp", () => {
  it("parses '5:00' to 300");
  it("parses '1:30:00' to 5400");
  it("parses '5:00-10:00' to range {start: 300, end: 600}");
});
```

**`alignment.test.ts`** — Core alignment logic
```typescript
describe("alignFramesWithTranscript", () => {
  it("maps frames to correct transcript segments by timestamp");
  it("handles segments with no frames");
  it("handles frames with no matching transcript");
  it("respects chapter boundaries when available");
  it("merges overlapping transcript segments");
});
```

**`hybrid.test.ts`** — Hybrid frame selection algorithm
```typescript
describe("hybridFrameSelection", () => {
  it("uses scene-detected frames within topic segments");
  it("inserts midpoint frame for segments with no scene changes");
  it("deduplicates frames within 2-second window");
  it("respects maxFrames cap using combined scoring");
  it("falls back to interval if scene detection yields < 3 frames");
});
```

### 7.2 Integration Tests

These require network access and system dependencies. Gate behind an env flag.

```typescript
// RUN_INTEGRATION=true bun test tests/integration/

describe("transcript fetching", () => {
  it("fetches transcript for a known public video");
  it("handles video with no transcript gracefully");
  it("returns auto-generated caption flag");
});

describe("frame extraction", () => {
  // Use a short (~30 second) CC-licensed test video
  it("extracts frames with scene detection");
  it("extracts frames at fixed interval");
  it("respects maxFrames cap");
  it("outputs frames in specified format");
});

describe("end-to-end ask", () => {
  // Uses real Claude API — expensive, run sparingly
  it("answers a transcript-only question");
  it("answers a visual question with frames");
});
```

### 7.3 Test Fixtures

Include a set of static test data so most tests don't require network:

- `sample-transcript.json` — A realistic transcript (~500 segments, ~10 min video)
- `sample-manifest.json` — A complete manifest with all fields populated
- `sample-frames/` — 5-10 small PNG frames with known timestamps
- `sample-scene-detection-output.txt` — Raw ffmpeg showinfo output for scene detection parsing

### 7.4 Performance Benchmarks

Not automated tests, but documented expectations:

| Operation | Target | Acceptable |
|-----------|--------|------------|
| Transcript fetch (uncached) | < 3s | < 8s |
| Transcript fetch (cached) | < 50ms | < 200ms |
| Video download (10 min, 1080p) | < 30s | < 60s |
| Scene detection (10 min video) | < 10s | < 20s |
| Hybrid frame selection (10 min) | < 15s | < 30s |
| LLM query (transcript only) | < 5s | < 15s |
| LLM query (visual, 30 frames) | < 15s | < 30s |
| Full pipeline (10 min, visual) | < 45s | < 90s |

---

## 8. Performance & Resource Constraints

### Disk Usage

- Cached video: 50-500MB per video depending on resolution/duration
- Cached frames: 1-20MB per video (PNG frames at reasonable quality)
- Cached transcripts: < 500KB per video
- Auto-cleanup: video files older than 24h, frames older than 7 days

### Memory

- Transcript processing: negligible
- Frame extraction: handled by ffmpeg subprocess, not in-process
- Base64 encoding for LLM: ~1.3x the file size per frame, held in memory. 50 frames × 100KB average = ~6.5MB. Acceptable.
- Peak memory: < 200MB for typical usage

### Network

- Transcript fetch: ~50KB
- Video download: 50-500MB (dominant cost)
- LLM API call: depends on frames. Budget ~2MB upload for 30 frames

### Cost Estimation Formula

```
transcript_tokens = word_count * 1.3
image_tokens = frame_count * 1600  (at 1080p)
input_tokens = transcript_tokens + image_tokens + prompt_overhead(500)
output_tokens = max_tokens setting

cost_sonnet = (input_tokens / 1M * 3) + (output_tokens / 1M * 15)
cost_haiku = (input_tokens / 1M * 0.80) + (output_tokens / 1M * 4)
```

Display this estimate in the summary footer so users understand what they're spending.

---

## 9. Future Extensions (Out of Scope for v0.1)

These are noted here for architectural awareness. The v0.1 implementation should not block these, but does not need to implement them.

1. **MCP Server mode** — Expose the same functionality as an MCP server so Claude Desktop / Claude Code can call it as a tool. The core modules are already tool-shaped; this is a thin adapter layer.

2. **Batch processing** — `llm-youtube ask "Summarize" -v id1,id2,id3` or `--playlist <url>`. Process multiple videos with shared cache.

3. **Token budget flag** — `--budget 50000` to auto-adjust frame count and resolution to fit within a token budget.

4. **Audio analysis** — For videos where visual content is secondary (podcasts, music), extract audio features or use Whisper for higher-quality transcription than YouTube's auto-captions.

5. **Diff mode** — `llm-youtube diff -v id1 -v id2 "How do these two talks differ on the topic of X?"` — compare two videos.

6. **Watch mode** — For live streams or premieres, poll for new transcript segments and emit them as they arrive.

7. **Plugin system** — Let users add custom frame selection algorithms or output formatters.

8. **Web UI wrapper** — A simple local web UI that renders the manifest with inline frame previews and clickable timestamps.

---

## 10. Implementation Priority

### Phase 1: Core Foundation (Ship this first)
1. CLI scaffolding with commander + all subcommands stubbed
2. Video ID parser with full test coverage
3. Transcript fetcher with caching
4. `transcript` and `info` subcommands working end-to-end
5. LLM client with streaming for transcript-only queries
6. `ask` subcommand (transcript-only mode) working end-to-end
7. Progress indicators and error handling

### Phase 2: Visual Pipeline
1. Video downloader with progress
2. Scene detection frame extraction
3. Interval and keyframe extraction
4. Hybrid frame selection algorithm
5. Frame-transcript alignment
6. LLM client visual mode (image content blocks)
7. `ask --visual` working end-to-end
8. `frames` subcommand

### Phase 3: Manifest & Polish
1. Manifest schema and generator
2. `manifest` subcommand
3. `--around` timestamp range support
4. Cache cleanup and management
5. Cost estimation in footer
6. `--json` output mode for all commands
7. Comprehensive integration tests
8. README and npm publish

---

## Appendix A: Key ffmpeg Commands Reference

```bash
# Scene detection — output frames where scene change score > threshold
ffmpeg -i input.mp4 -vf "select='gt(scene,0.3)',showinfo" -vsync vfr frame_%04d.png 2>&1

# Fixed interval — 1 frame every 10 seconds
ffmpeg -i input.mp4 -vf "fps=1/10" frame_%04d.png

# Keyframes only (I-frames)
ffmpeg -i input.mp4 -vf "select='eq(pict_type,I)'" -vsync vfr frame_%04d.png

# Extract frames in a time range only
ffmpeg -i input.mp4 -ss 00:15:00 -to 00:20:00 -vf "select='gt(scene,0.3)',showinfo" -vsync vfr frame_%04d.png

# Scale down frames to max 1080p height
ffmpeg -i input.mp4 -vf "select='gt(scene,0.3)',scale=-1:min(ih\,1080),showinfo" -vsync vfr frame_%04d.png

# Get video duration and resolution via ffprobe
ffprobe -v quiet -print_format json -show_format -show_streams input.mp4

# Extract subtitles with yt-dlp
yt-dlp --write-auto-sub --sub-lang en --skip-download -o "%(id)s" <URL>

# Download specific time range
yt-dlp --download-sections "*900-1200" -o output.mp4 <URL>
```

## Appendix B: Topic Segmentation Pseudocode

```
function segmentTranscript(segments: TranscriptSegment[], chapters?: Chapter[]): TopicSegment[] {
  // If chapters available, use them directly
  if (chapters && chapters.length > 0) {
    return chapters.map(ch => ({
      startTime: ch.startTime,
      endTime: ch.endTime,
      title: ch.title,
      segments: segments.filter(s => s.startTime >= ch.startTime && s.startTime < ch.endTime)
    }));
  }

  // Otherwise, detect topic shifts via vocabulary overlap
  const WINDOW_SIZE = 30; // seconds
  const OVERLAP_THRESHOLD = 0.4;
  const MIN_SEGMENT_LENGTH = 15; // seconds
  const PAUSE_THRESHOLD = 3; // seconds

  let boundaries = [0]; // always start with 0

  for (let t = WINDOW_SIZE; t < totalDuration - WINDOW_SIZE; t += 5) {
    const windowA = getWordsInRange(segments, t - WINDOW_SIZE, t);
    const windowB = getWordsInRange(segments, t, t + WINDOW_SIZE);

    const overlap = jaccardSimilarity(new Set(windowA), new Set(windowB));

    if (overlap < OVERLAP_THRESHOLD) {
      // Check minimum segment length from last boundary
      if (t - boundaries[boundaries.length - 1] >= MIN_SEGMENT_LENGTH) {
        boundaries.push(t);
      }
    }
  }

  // Also split on long pauses
  for (let i = 1; i < segments.length; i++) {
    const gap = segments[i].startTime - segments[i-1].endTime;
    if (gap > PAUSE_THRESHOLD) {
      const pauseTime = segments[i].startTime;
      if (!boundaries.some(b => Math.abs(b - pauseTime) < MIN_SEGMENT_LENGTH)) {
        boundaries.push(pauseTime);
      }
    }
  }

  boundaries.sort((a, b) => a - b);
  boundaries.push(totalDuration);

  return boundaries.slice(0, -1).map((start, i) => ({
    startTime: start,
    endTime: boundaries[i + 1],
    segments: segments.filter(s => s.startTime >= start && s.startTime < boundaries[i + 1])
  }));
}

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}
```
