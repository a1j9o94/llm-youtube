export type VideoPlatform = "youtube" | "loom";

export interface VideoSource {
  id: string;
  platform: VideoPlatform;
  url: string;
  originalInput: string;
}

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const LOOM_ID_REGEX = /^[a-f0-9]{32}$/;

export function parseVideoSource(input: string): VideoSource {
  if (!input || typeof input !== "string") {
    throw new Error("Video ID or URL is required");
  }

  const trimmed = input.trim();

  // Raw 11-char YouTube ID
  if (YOUTUBE_ID_REGEX.test(trimmed)) {
    return {
      id: trimmed,
      platform: "youtube",
      url: `https://www.youtube.com/watch?v=${trimmed}`,
      originalInput: input,
    };
  }

  // Try parsing as URL
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(
      `Invalid video ID or URL: "${input}"\n` +
        `Expected a YouTube video ID/URL or a Loom share URL.\n` +
        `Examples:\n` +
        `  dQw4w9WgXcQ\n` +
        `  https://www.youtube.com/watch?v=dQw4w9WgXcQ\n` +
        `  https://www.loom.com/share/abc123def456abc123def456abc123de`
    );
  }

  const hostname = url.hostname.replace("www.", "");

  // YouTube URLs
  if (
    hostname === "youtube.com" ||
    hostname === "m.youtube.com" ||
    hostname === "youtu.be"
  ) {
    const videoId = extractYoutubeId(url, hostname);
    if (!videoId || !YOUTUBE_ID_REGEX.test(videoId)) {
      throw new Error(
        `Could not extract video ID from URL: "${input}"\n` +
          `Supported YouTube formats:\n` +
          `  - https://www.youtube.com/watch?v=VIDEO_ID\n` +
          `  - https://youtu.be/VIDEO_ID\n` +
          `  - https://www.youtube.com/embed/VIDEO_ID\n` +
          `  - https://www.youtube.com/shorts/VIDEO_ID`
      );
    }
    return {
      id: videoId,
      platform: "youtube",
      url: `https://www.youtube.com/watch?v=${videoId}`,
      originalInput: input,
    };
  }

  // Loom URLs
  if (hostname === "loom.com") {
    const loomId = extractLoomId(url);
    if (!loomId) {
      throw new Error(
        `Could not extract Loom video ID from URL: "${input}"\n` +
          `Supported Loom formats:\n` +
          `  - https://www.loom.com/share/VIDEO_ID\n` +
          `  - https://www.loom.com/embed/VIDEO_ID`
      );
    }
    return {
      id: loomId,
      platform: "loom",
      url: trimmed,
      originalInput: input,
    };
  }

  throw new Error(
    `Unsupported video URL: "${input}"\n` +
      `Supported platforms: YouTube, Loom\n` +
      `Examples:\n` +
      `  dQw4w9WgXcQ\n` +
      `  https://www.youtube.com/watch?v=dQw4w9WgXcQ\n` +
      `  https://www.loom.com/share/abc123def456abc123def456abc123de`
  );
}

function extractYoutubeId(url: URL, hostname: string): string | null {
  if (hostname === "youtu.be") {
    return url.pathname.slice(1).split("/")[0] ?? null;
  }

  if (url.pathname === "/watch") {
    return url.searchParams.get("v");
  }
  if (url.pathname.startsWith("/embed/")) {
    return url.pathname.split("/embed/")[1]?.split("/")[0] ?? null;
  }
  if (url.pathname.startsWith("/shorts/")) {
    return url.pathname.split("/shorts/")[1]?.split("/")[0] ?? null;
  }
  if (url.pathname.startsWith("/v/")) {
    return url.pathname.split("/v/")[1]?.split("/")[0] ?? null;
  }
  return null;
}

function extractLoomId(url: URL): string | null {
  // Loom URLs: /share/{id} or /embed/{id}
  // ID can be a 32-char hex string or UUID format
  const match = url.pathname.match(/^\/(share|embed)\/([a-f0-9-]+)/);
  if (!match) return null;

  // Strip hyphens (UUID → hex)
  const rawId = match[2]!.replace(/-/g, "");

  // Loom IDs are 32-char hex strings
  if (LOOM_ID_REGEX.test(rawId)) {
    return rawId;
  }

  // Some Loom URLs use longer or different ID formats — accept the raw path segment
  if (match[2]!.length >= 16) {
    return match[2]!;
  }

  return null;
}
