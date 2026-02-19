import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { loadConfig } from "./config.ts";
import type { TranscriptResult } from "../types/transcript.ts";
import type { ExtractedFrame, FrameMethod } from "../types/frame.ts";
import type { Manifest } from "../types/manifest.ts";

interface CacheMeta {
  createdAt: string;
  videoId: string;
  ttlDays: number;
}

const TTL = {
  transcripts: 30,
  frames: 7,
  videos: 1,
  manifests: 7,
} as const;

export class Cache {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? loadConfig().cacheDir;
  }

  private async ensureDir(subdir: string): Promise<string> {
    const dir = join(this.baseDir, subdir);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  private isExpired(meta: CacheMeta): boolean {
    const age = Date.now() - new Date(meta.createdAt).getTime();
    return age > meta.ttlDays * 24 * 60 * 60 * 1000;
  }

  private async readJson<T>(filePath: string): Promise<(T & { _meta: CacheMeta }) | null> {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return null;
    try {
      const data = await file.json();
      if (data._meta && this.isExpired(data._meta)) {
        return null; // expired
      }
      return data;
    } catch {
      return null;
    }
  }

  private async writeJson<T>(filePath: string, data: T, videoId: string, ttlDays: number): Promise<void> {
    const withMeta = {
      ...data,
      _meta: { createdAt: new Date().toISOString(), videoId, ttlDays },
    };
    await Bun.write(filePath, JSON.stringify(withMeta, null, 2));
  }

  // Transcripts
  async getTranscript(videoId: string, lang: string): Promise<TranscriptResult | null> {
    const dir = await this.ensureDir("transcripts");
    const data = await this.readJson<TranscriptResult>(join(dir, `${videoId}_${lang}.json`));
    if (!data) return null;
    const { _meta, ...transcript } = data;
    return transcript as TranscriptResult;
  }

  async setTranscript(videoId: string, lang: string, data: TranscriptResult): Promise<void> {
    const dir = await this.ensureDir("transcripts");
    await this.writeJson(join(dir, `${videoId}_${lang}.json`), data, videoId, TTL.transcripts);
  }

  // Frames
  async getFrames(
    videoId: string,
    method: FrameMethod,
    optionsKey: string
  ): Promise<ExtractedFrame[] | null> {
    const dir = await this.ensureDir(`frames/${videoId}_${method}_${optionsKey}`);
    const data = await this.readJson<{ frames: ExtractedFrame[] }>(join(dir, "metadata.json"));
    if (!data) return null;
    return data.frames;
  }

  async setFrames(
    videoId: string,
    method: FrameMethod,
    optionsKey: string,
    frames: ExtractedFrame[]
  ): Promise<void> {
    const dir = await this.ensureDir(`frames/${videoId}_${method}_${optionsKey}`);
    await this.writeJson(join(dir, "metadata.json"), { frames }, videoId, TTL.frames);
  }

  // Manifests
  async getManifest(videoId: string): Promise<Manifest | null> {
    const dir = await this.ensureDir("manifests");
    const data = await this.readJson<Manifest>(join(dir, `${videoId}.json`));
    if (!data) return null;
    const { _meta, ...manifest } = data;
    return manifest as Manifest;
  }

  async setManifest(videoId: string, manifest: Manifest): Promise<void> {
    const dir = await this.ensureDir("manifests");
    await this.writeJson(join(dir, `${videoId}.json`), manifest, videoId, TTL.manifests);
  }

  // Video files
  async getVideoFile(videoId: string): Promise<string | null> {
    const dir = await this.ensureDir("videos");
    const filePath = join(dir, `${videoId}.mp4`);
    const file = Bun.file(filePath);
    if (await file.exists()) {
      // Check TTL via file modification time
      const stat = await file.stat();
      const age = Date.now() - (stat?.mtimeMs ?? 0);
      if (age > TTL.videos * 24 * 60 * 60 * 1000) return null;
      return filePath;
    }
    return null;
  }

  getVideoDir(): string {
    return join(this.baseDir, "videos");
  }

  async clear(videoId?: string): Promise<void> {
    const { rm } = await import("node:fs/promises");
    if (videoId) {
      // Clear specific video cache
      const dirs = ["transcripts", "frames", "manifests", "videos"];
      for (const dir of dirs) {
        const fullDir = join(this.baseDir, dir);
        try {
          const { readdir } = await import("node:fs/promises");
          const entries = await readdir(fullDir);
          for (const entry of entries) {
            if (entry.startsWith(videoId)) {
              await rm(join(fullDir, entry), { recursive: true, force: true });
            }
          }
        } catch {
          // dir doesn't exist, ok
        }
      }
    } else {
      await rm(this.baseDir, { recursive: true, force: true });
    }
  }
}
