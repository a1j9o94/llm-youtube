export interface VideoIdResult {
  id: string;
  originalInput: string;
}

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export function parseVideoId(input: string): VideoIdResult {
  if (!input || typeof input !== "string") {
    throw new Error("Video ID or URL is required");
  }

  const trimmed = input.trim();

  // Raw 11-char ID
  if (VIDEO_ID_REGEX.test(trimmed)) {
    return { id: trimmed, originalInput: input };
  }

  // Try parsing as URL
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(
      `Invalid video ID or URL: "${input}"\n` +
        `Expected an 11-character video ID or a YouTube URL.\n` +
        `Examples: dQw4w9WgXcQ, https://www.youtube.com/watch?v=dQw4w9WgXcQ`
    );
  }

  const hostname = url.hostname.replace("www.", "");

  let videoId: string | null = null;

  if (hostname === "youtube.com" || hostname === "m.youtube.com") {
    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v");
    } else if (url.pathname.startsWith("/embed/")) {
      videoId = url.pathname.split("/embed/")[1]?.split("/")[0] ?? null;
    } else if (url.pathname.startsWith("/shorts/")) {
      videoId = url.pathname.split("/shorts/")[1]?.split("/")[0] ?? null;
    } else if (url.pathname.startsWith("/v/")) {
      videoId = url.pathname.split("/v/")[1]?.split("/")[0] ?? null;
    }
  } else if (hostname === "youtu.be") {
    videoId = url.pathname.slice(1).split("/")[0] ?? null;
  }

  if (!videoId || !VIDEO_ID_REGEX.test(videoId)) {
    throw new Error(
      `Could not extract video ID from URL: "${input}"\n` +
        `Supported formats:\n` +
        `  - https://www.youtube.com/watch?v=VIDEO_ID\n` +
        `  - https://youtu.be/VIDEO_ID\n` +
        `  - https://www.youtube.com/embed/VIDEO_ID\n` +
        `  - https://www.youtube.com/shorts/VIDEO_ID`
    );
  }

  return { id: videoId, originalInput: input };
}
