import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  anthropicApiKey: string;
  cacheDir: string;
  model: string;
  maxTokens: number;
}

export function loadConfig(): Config {
  const anthropicApiKey = Bun.env.ANTHROPIC_API_KEY ?? "";
  const cacheDir =
    Bun.env.LLM_YOUTUBE_CACHE_DIR ?? join(homedir(), ".llm-youtube", "cache");
  const model = Bun.env.LLM_YOUTUBE_MODEL ?? "claude-sonnet-4-5-20250929";
  const maxTokens = parseInt(Bun.env.LLM_YOUTUBE_MAX_TOKENS ?? "4096", 10);

  return { anthropicApiKey, cacheDir, model, maxTokens };
}

export function ensureApiKey(): string {
  const key = Bun.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY not set\n" +
        "  Set your API key: export ANTHROPIC_API_KEY=sk-ant-...\n" +
        "  Get a key at: https://console.anthropic.com/"
    );
  }
  return key;
}
