/**
 * Format seconds into human-readable timestamp.
 * Examples: 0 → "0:00", 65.5 → "1:05", 3725 → "1:02:05"
 */
export function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

/**
 * Format seconds into filename-friendly timestamp.
 * Examples: 272 → "04m32s", 3735 → "1h02m15s"
 */
export function formatTimestampForFile(seconds: number): string {
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h${String(minutes).padStart(2, "0")}m${String(secs).padStart(2, "0")}s`;
  }
  return `${String(minutes).padStart(2, "0")}m${String(secs).padStart(2, "0")}s`;
}

export interface TimestampRange {
  start: number;
  end: number;
}

/**
 * Parse a timestamp string into seconds, or a range string into {start, end}.
 * Supports: "5:00" → 300, "1:30:00" → 5400, "5:00-10:00" → {start: 300, end: 600}
 */
export function parseTimestamp(input: string): number | TimestampRange {
  const trimmed = input.trim();

  if (trimmed.includes("-")) {
    const [startStr, endStr] = trimmed.split("-");
    if (!startStr || !endStr) {
      throw new Error(`Invalid timestamp range: "${input}". Expected format: "5:00-10:00"`);
    }
    const start = parseTimestampToSeconds(startStr.trim());
    const end = parseTimestampToSeconds(endStr.trim());
    if (end <= start) {
      throw new Error(`Invalid range: end (${endStr}) must be after start (${startStr})`);
    }
    return { start, end };
  }

  return parseTimestampToSeconds(trimmed);
}

function parseTimestampToSeconds(input: string): number {
  const parts = input.split(":").map(Number);

  if (parts.some((p) => isNaN(p))) {
    throw new Error(`Invalid timestamp: "${input}". Expected format: "5:00" or "1:30:00"`);
  }

  if (parts.length === 3) {
    return (parts[0]! * 3600) + (parts[1]! * 60) + parts[2]!;
  } else if (parts.length === 2) {
    return (parts[0]! * 60) + parts[1]!;
  } else if (parts.length === 1) {
    return parts[0]!;
  }

  throw new Error(`Invalid timestamp: "${input}". Expected format: "5:00" or "1:30:00"`);
}
