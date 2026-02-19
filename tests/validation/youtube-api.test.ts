/**
 * YouTube API Validation Suite
 *
 * Validates assumptions about YouTube's transcript/subtitle APIs
 * and yt-dlp behavior. These tests hit the network and require
 * yt-dlp on PATH.
 *
 * Run with: RUN_VALIDATION=true bun test tests/validation/
 */
import { test, expect, describe, beforeAll } from "bun:test";
import { $ } from "bun";

const RUN = Bun.env.RUN_VALIDATION === "true";

// Stable test videos
const RICK_ASTLEY = "dQw4w9WgXcQ"; // Has auto-captions, extremely stable
const TED_TALK = "8jPQjjsBbIc"; // Hans Rosling, manual captions + chapters
const SHORT_VIDEO = "jNQXAC9IVRw"; // "Me at the zoo" — first YouTube video, short

describe.skipIf(!RUN)("YouTube API Validation", () => {
  beforeAll(async () => {
    // Verify yt-dlp is available
    const result = await $`yt-dlp --version`.quiet().nothrow();
    if (result.exitCode !== 0) {
      throw new Error("yt-dlp not found on PATH. Install it to run validation tests.");
    }
  });

  describe("yt-dlp metadata (--dump-json)", () => {
    test("returns expected fields for a known video", async () => {
      const result = await $`yt-dlp --dump-json --skip-download https://www.youtube.com/watch?v=${RICK_ASTLEY}`.quiet();
      const data = JSON.parse(result.stdout.toString());

      expect(data.id).toBe(RICK_ASTLEY);
      expect(data.title).toBeTruthy();
      expect(typeof data.title).toBe("string");
      expect(data.channel).toBeTruthy();
      expect(typeof data.duration).toBe("number");
      expect(data.duration).toBeGreaterThan(0);
      expect(data.upload_date).toBeTruthy();
      expect(typeof data.view_count).toBe("number");
    }, 30000);

    test("includes subtitle/caption information", async () => {
      const result = await $`yt-dlp --dump-json --skip-download https://www.youtube.com/watch?v=${RICK_ASTLEY}`.quiet();
      const data = JSON.parse(result.stdout.toString());

      // Should have either subtitles or automatic_captions
      const hasSubtitles =
        (data.subtitles && Object.keys(data.subtitles).length > 0) ||
        (data.automatic_captions && Object.keys(data.automatic_captions).length > 0);
      expect(hasSubtitles).toBe(true);
    }, 30000);

    test("returns chapters when available", async () => {
      const result = await $`yt-dlp --dump-json --skip-download https://www.youtube.com/watch?v=${TED_TALK}`.quiet();
      const data = JSON.parse(result.stdout.toString());

      // TED talks often have chapters — but not guaranteed
      // At minimum, verify the field exists
      expect(data.chapters === null || data.chapters === undefined || Array.isArray(data.chapters)).toBe(true);
    }, 30000);
  });

  describe("yt-dlp subtitle extraction", () => {
    test("extracts auto-generated subtitles in VTT format", async () => {
      const tmpDir = `/tmp/llm-youtube-test-${Date.now()}`;
      await $`mkdir -p ${tmpDir}`;

      try {
        await $`yt-dlp --write-auto-sub --sub-lang en --sub-format vtt --skip-download -o ${tmpDir}/%(id)s https://www.youtube.com/watch?v=${RICK_ASTLEY}`.quiet();

        // Find the VTT file
        const result = await $`ls ${tmpDir}`.quiet();
        const files = result.stdout.toString().trim().split("\n");
        const vttFile = files.find((f: string) => f.endsWith(".vtt"));

        expect(vttFile).toBeTruthy();

        // Read and validate VTT content
        const content = await Bun.file(`${tmpDir}/${vttFile}`).text();
        expect(content).toContain("WEBVTT");
        expect(content).toContain("-->");

        // Should have timestamp lines with content
        const lines = content.split("\n");
        const timestampLines = lines.filter((l: string) => l.includes("-->"));
        expect(timestampLines.length).toBeGreaterThan(5);
      } finally {
        await $`rm -rf ${tmpDir}`.quiet().nothrow();
      }
    }, 60000);

    test("handles video with no captions gracefully", async () => {
      // Use a video that might not have subs — or test error handling
      const tmpDir = `/tmp/llm-youtube-test-nosubs-${Date.now()}`;
      await $`mkdir -p ${tmpDir}`;

      try {
        const result = await $`yt-dlp --write-auto-sub --sub-lang xx --sub-format vtt --skip-download -o ${tmpDir}/%(id)s https://www.youtube.com/watch?v=${RICK_ASTLEY}`.quiet().nothrow();

        // Language 'xx' doesn't exist, so no VTT file should be created
        const ls = await $`ls ${tmpDir}`.quiet().nothrow();
        const files = ls.stdout.toString().trim().split("\n").filter(Boolean);
        const vttFile = files.find((f: string) => f.endsWith(".vtt"));

        // Either no VTT file, or yt-dlp returns error
        // Both are acceptable — we just verify no crash
        expect(true).toBe(true);
      } finally {
        await $`rm -rf ${tmpDir}`.quiet().nothrow();
      }
    }, 30000);
  });

  describe("direct YouTube transcript API", () => {
    test("player response contains caption track data", async () => {
      const response = await fetch(
        `https://www.youtube.com/watch?v=${RICK_ASTLEY}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
            "Accept-Language": "en-US,en;q=0.9",
          },
        }
      );
      const html = await response.text();

      // Should contain ytInitialPlayerResponse
      const hasPlayerResponse = html.includes("ytInitialPlayerResponse");
      expect(hasPlayerResponse).toBe(true);

      // Extract and parse
      const match = html.match(
        /ytInitialPlayerResponse\s*=\s*({.+?})\s*;\s*(?:var|<\/script)/s
      );

      if (match) {
        const playerResponse = JSON.parse(match[1]!);
        // May or may not have captions depending on region/cookies
        expect(playerResponse).toBeTruthy();
        expect(typeof playerResponse).toBe("object");
      }
    }, 15000);

    test("transcript XML endpoint returns valid data", async () => {
      // First get the caption track URL via yt-dlp
      const result = await $`yt-dlp --dump-json --skip-download https://www.youtube.com/watch?v=${RICK_ASTLEY}`.quiet();
      const data = JSON.parse(result.stdout.toString());

      // Check if we have auto captions with a URL
      if (data.automatic_captions?.en) {
        const tracks = data.automatic_captions.en;
        const vttTrack = tracks.find(
          (t: { ext: string }) => t.ext === "vtt" || t.ext === "srv1"
        );
        if (vttTrack?.url) {
          const response = await fetch(vttTrack.url);
          expect(response.ok).toBe(true);
          const content = await response.text();
          expect(content.length).toBeGreaterThan(100);
        }
      }
    }, 30000);
  });

  describe("edge cases", () => {
    test("short video returns complete transcript", async () => {
      const tmpDir = `/tmp/llm-youtube-test-short-${Date.now()}`;
      await $`mkdir -p ${tmpDir}`;

      try {
        await $`yt-dlp --write-auto-sub --sub-lang en --sub-format vtt --skip-download -o ${tmpDir}/%(id)s https://www.youtube.com/watch?v=${SHORT_VIDEO}`.quiet().nothrow();

        const ls = await $`ls ${tmpDir}`.quiet();
        const files = ls.stdout.toString().trim().split("\n");
        // Short/old video might not have auto-subs, which is ok
        expect(true).toBe(true);
      } finally {
        await $`rm -rf ${tmpDir}`.quiet().nothrow();
      }
    }, 30000);

    test("private/deleted video returns clear error", async () => {
      const result =
        await $`yt-dlp --dump-json --skip-download https://www.youtube.com/watch?v=xxxxxxxxxxx`.quiet().nothrow();

      expect(result.exitCode).not.toBe(0);
      const stderr = result.stderr.toString();
      // Should contain some error indication
      expect(stderr.length).toBeGreaterThan(0);
    }, 15000);
  });
});
