import { test, expect, describe } from "bun:test";
import { parseVideoId } from "../../src/utils/video-id.ts";

describe("parseVideoId", () => {
  test("parses raw 11-char ID", () => {
    const result = parseVideoId("dQw4w9WgXcQ");
    expect(result.id).toBe("dQw4w9WgXcQ");
  });

  test("parses standard youtube.com URL", () => {
    const result = parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result.id).toBe("dQw4w9WgXcQ");
  });

  test("parses youtu.be short URL", () => {
    const result = parseVideoId("https://youtu.be/dQw4w9WgXcQ");
    expect(result.id).toBe("dQw4w9WgXcQ");
  });

  test("parses embed URL", () => {
    const result = parseVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(result.id).toBe("dQw4w9WgXcQ");
  });

  test("parses mobile URL", () => {
    const result = parseVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result.id).toBe("dQw4w9WgXcQ");
  });

  test("parses shorts URL", () => {
    const result = parseVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ");
    expect(result.id).toBe("dQw4w9WgXcQ");
  });

  test("strips tracking params (?si=, &t=)", () => {
    const result = parseVideoId(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc123&t=120"
    );
    expect(result.id).toBe("dQw4w9WgXcQ");
  });

  test("handles URL with playlist params", () => {
    const result = parseVideoId(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf"
    );
    expect(result.id).toBe("dQw4w9WgXcQ");
  });

  test("preserves originalInput", () => {
    const input = "https://youtu.be/dQw4w9WgXcQ";
    const result = parseVideoId(input);
    expect(result.originalInput).toBe(input);
  });

  test("throws on empty string", () => {
    expect(() => parseVideoId("")).toThrow("Video ID or URL is required");
  });

  test("throws on non-YouTube URL", () => {
    expect(() => parseVideoId("https://vimeo.com/123456")).toThrow(
      "Could not extract video ID"
    );
  });

  test("throws on malformed URL", () => {
    expect(() => parseVideoId("not-a-url-and-not-11-chars")).toThrow();
  });

  test("throws on too-short ID", () => {
    expect(() => parseVideoId("abc")).toThrow();
  });

  test("parses /v/ format URL", () => {
    const result = parseVideoId("https://www.youtube.com/v/dQw4w9WgXcQ");
    expect(result.id).toBe("dQw4w9WgXcQ");
  });
});
