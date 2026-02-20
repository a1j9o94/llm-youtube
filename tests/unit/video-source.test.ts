import { test, expect, describe } from "bun:test";
import { parseVideoSource } from "../../src/utils/video-source.ts";

describe("parseVideoSource", () => {
  // YouTube tests (ported from video-id.test.ts)
  describe("YouTube", () => {
    test("parses raw 11-char ID", () => {
      const result = parseVideoSource("dQw4w9WgXcQ");
      expect(result.id).toBe("dQw4w9WgXcQ");
      expect(result.platform).toBe("youtube");
      expect(result.url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    });

    test("parses standard youtube.com URL", () => {
      const result = parseVideoSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(result.id).toBe("dQw4w9WgXcQ");
      expect(result.platform).toBe("youtube");
    });

    test("parses youtu.be short URL", () => {
      const result = parseVideoSource("https://youtu.be/dQw4w9WgXcQ");
      expect(result.id).toBe("dQw4w9WgXcQ");
      expect(result.platform).toBe("youtube");
    });

    test("parses embed URL", () => {
      const result = parseVideoSource("https://www.youtube.com/embed/dQw4w9WgXcQ");
      expect(result.id).toBe("dQw4w9WgXcQ");
      expect(result.platform).toBe("youtube");
    });

    test("parses mobile URL", () => {
      const result = parseVideoSource("https://m.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(result.id).toBe("dQw4w9WgXcQ");
      expect(result.platform).toBe("youtube");
    });

    test("parses shorts URL", () => {
      const result = parseVideoSource("https://www.youtube.com/shorts/dQw4w9WgXcQ");
      expect(result.id).toBe("dQw4w9WgXcQ");
      expect(result.platform).toBe("youtube");
    });

    test("strips tracking params (?si=, &t=)", () => {
      const result = parseVideoSource(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc123&t=120"
      );
      expect(result.id).toBe("dQw4w9WgXcQ");
      expect(result.platform).toBe("youtube");
    });

    test("handles URL with playlist params", () => {
      const result = parseVideoSource(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf"
      );
      expect(result.id).toBe("dQw4w9WgXcQ");
    });

    test("preserves originalInput", () => {
      const input = "https://youtu.be/dQw4w9WgXcQ";
      const result = parseVideoSource(input);
      expect(result.originalInput).toBe(input);
    });

    test("parses /v/ format URL", () => {
      const result = parseVideoSource("https://www.youtube.com/v/dQw4w9WgXcQ");
      expect(result.id).toBe("dQw4w9WgXcQ");
      expect(result.platform).toBe("youtube");
    });
  });

  // Loom tests
  describe("Loom", () => {
    test("parses loom.com/share URL", () => {
      const result = parseVideoSource(
        "https://www.loom.com/share/abc123def456abc123def456abc123de"
      );
      expect(result.id).toBe("abc123def456abc123def456abc123de");
      expect(result.platform).toBe("loom");
      expect(result.url).toBe(
        "https://www.loom.com/share/abc123def456abc123def456abc123de"
      );
    });

    test("parses loom.com/embed URL", () => {
      const result = parseVideoSource(
        "https://www.loom.com/embed/abc123def456abc123def456abc123de"
      );
      expect(result.id).toBe("abc123def456abc123def456abc123de");
      expect(result.platform).toBe("loom");
    });

    test("parses Loom URL without www", () => {
      const result = parseVideoSource(
        "https://loom.com/share/abc123def456abc123def456abc123de"
      );
      expect(result.id).toBe("abc123def456abc123def456abc123de");
      expect(result.platform).toBe("loom");
    });

    test("parses Loom URL with query params", () => {
      const result = parseVideoSource(
        "https://www.loom.com/share/abc123def456abc123def456abc123de?sid=xyz"
      );
      expect(result.id).toBe("abc123def456abc123def456abc123de");
      expect(result.platform).toBe("loom");
    });

    test("parses Loom UUID-format ID (with hyphens)", () => {
      const result = parseVideoSource(
        "https://www.loom.com/share/abc123de-f456-abc1-23de-f456abc123de"
      );
      expect(result.id).toBe("abc123def456abc123def456abc123de");
      expect(result.platform).toBe("loom");
    });

    test("preserves original Loom URL", () => {
      const input = "https://www.loom.com/share/abc123def456abc123def456abc123de";
      const result = parseVideoSource(input);
      expect(result.url).toBe(input);
      expect(result.originalInput).toBe(input);
    });
  });

  // Error cases
  describe("errors", () => {
    test("throws on empty string", () => {
      expect(() => parseVideoSource("")).toThrow("Video ID or URL is required");
    });

    test("throws on unsupported URL (vimeo)", () => {
      expect(() => parseVideoSource("https://vimeo.com/123456")).toThrow(
        "Unsupported video URL"
      );
    });

    test("throws on malformed input", () => {
      expect(() => parseVideoSource("not-a-url-and-not-11-chars")).toThrow();
    });

    test("throws on too-short ID", () => {
      expect(() => parseVideoSource("abc")).toThrow();
    });

    test("throws on invalid YouTube URL path", () => {
      expect(() =>
        parseVideoSource("https://www.youtube.com/channel/UCxyz")
      ).toThrow("Could not extract video ID");
    });

    test("throws on invalid Loom URL path", () => {
      expect(() =>
        parseVideoSource("https://www.loom.com/dashboard")
      ).toThrow("Could not extract Loom video ID");
    });
  });
});
