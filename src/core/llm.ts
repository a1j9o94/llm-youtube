import Anthropic from "@anthropic-ai/sdk";
import { ensureApiKey, loadConfig } from "../utils/config.ts";
import { formatTimestamp } from "../utils/timestamp.ts";
import type { TranscriptResult } from "../types/transcript.ts";
import type { ExtractedFrame } from "../types/frame.ts";
import type { AlignmentResult } from "./alignment.ts";

export interface LlmQueryOptions {
  question: string;
  transcript: TranscriptResult;
  frames?: ExtractedFrame[];
  alignment?: AlignmentResult;
  model?: string;
  systemPrompt?: string;
  maxTokens?: number;
  jsonOutput?: boolean;
  onStream?: (chunk: string) => void;
}

export interface LlmResponse {
  answer: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costEstimate: number;
}

// Cost per million tokens (Sonnet 4.5 pricing)
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
};

function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = PRICING[model] ?? { input: 3, output: 15 };
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

function buildTranscriptOnlyMessages(
  question: string,
  transcript: TranscriptResult,
  extraSystem?: string
): { system: string; userContent: string } {
  const transcriptText = transcript.segments
    .map((s) => `[${formatTimestamp(s.startTime)}] ${s.text}`)
    .join("\n");

  const system =
    `You are analyzing a YouTube video. Below is the transcript with timestamps.\n` +
    `Answer the user's question based on the video content.\n` +
    `If referencing specific moments, include the timestamp.\n` +
    (extraSystem ? `\n${extraSystem}` : "");

  const userContent = `<transcript>\n${transcriptText}\n</transcript>\n\n${question}`;

  return { system, userContent };
}

async function buildVisualMessages(
  question: string,
  transcript: TranscriptResult,
  alignment: AlignmentResult,
  frames: ExtractedFrame[],
  extraSystem?: string
): Promise<{ system: string; content: Anthropic.MessageParam["content"] }> {
  const system =
    `You are analyzing a YouTube video using both its transcript and visual frames ` +
    `captured at key moments. Each frame is labeled with its timestamp.\n` +
    `Use both the visual and spoken content to answer the user's question.\n` +
    `When referencing specific moments, include the timestamp.\n` +
    (extraSystem ? `\n${extraSystem}` : "");

  // Build content blocks with interleaved text and images
  const content: Anthropic.ContentBlockParam[] = [];

  for (const segment of alignment.segments) {
    // Add transcript text for this segment
    content.push({
      type: "text",
      text: `<segment start="${formatTimestamp(segment.startTime)}" end="${formatTimestamp(segment.endTime)}"${segment.chapterTitle ? ` chapter="${segment.chapterTitle}"` : ""}>\n<transcript>${segment.transcript}</transcript>`,
    });

    // Add frame images for this segment
    for (const frame of segment.frames) {
      try {
        const file = Bun.file(frame.filePath);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const base64 = Buffer.from(bytes).toString("base64");
        const ext = frame.filePath.split(".").pop() ?? "png";
        const mediaType =
          ext === "jpg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";

        content.push({
          type: "text",
          text: `[Frame at ${formatTimestamp(frame.timestamp)}]`,
        });
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
            data: base64,
          },
        });
      } catch {
        // Skip frames we can't read
      }
    }

    content.push({
      type: "text",
      text: "</segment>",
    });
  }

  content.push({
    type: "text",
    text: question,
  });

  return { system, content };
}

export async function queryLlm(options: LlmQueryOptions): Promise<LlmResponse> {
  const apiKey = ensureApiKey();
  const config = loadConfig();
  const model = options.model ?? config.model;
  const maxTokens = options.maxTokens ?? config.maxTokens;

  const client = new Anthropic({ apiKey });

  let system: string;
  let userContent: Anthropic.MessageParam["content"];

  if (options.alignment && options.frames && options.frames.length > 0) {
    // Visual mode
    const result = await buildVisualMessages(
      options.question,
      options.transcript,
      options.alignment,
      options.frames,
      options.systemPrompt
    );
    system = result.system;
    userContent = result.content;
  } else {
    // Transcript-only mode
    const result = buildTranscriptOnlyMessages(
      options.question,
      options.transcript,
      options.systemPrompt
    );
    system = result.system;
    userContent = result.userContent;
  }

  if (options.jsonOutput) {
    system += "\n\nRespond with valid JSON only.";
  }

  // Stream the response
  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userContent }],
  });

  let answer = "";

  stream.on("text", (text) => {
    answer += text;
    options.onStream?.(text);
  });

  const finalMessage = await stream.finalMessage();

  return {
    answer,
    model,
    inputTokens: finalMessage.usage.input_tokens,
    outputTokens: finalMessage.usage.output_tokens,
    costEstimate: estimateCost(
      model,
      finalMessage.usage.input_tokens,
      finalMessage.usage.output_tokens
    ),
  };
}
