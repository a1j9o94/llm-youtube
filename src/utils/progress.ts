import ora, { type Ora } from "ora";
import cliProgress from "cli-progress";

export function createSpinner(text: string): Ora {
  return ora({ text, stream: process.stderr });
}

export function createProgressBar(
  format: string = "  {bar} {percentage}% | {value}/{total} | ETA {eta}s"
): cliProgress.SingleBar {
  return new cliProgress.SingleBar(
    { format, stream: process.stderr },
    cliProgress.Presets.shades_classic
  );
}

export function printSuccess(message: string): void {
  process.stderr.write(`✓ ${message}\n`);
}

export function printError(message: string): void {
  process.stderr.write(`✗ ${message}\n`);
}

export function printFooter(stats: {
  frames?: number;
  segments?: number;
  totalTimeMs: number;
  costEstimate?: number;
  transcriptOnly?: boolean;
}): void {
  const parts: string[] = [];

  if (stats.transcriptOnly) {
    parts.push("Transcript only");
  } else {
    if (stats.frames !== undefined) parts.push(`${stats.frames} frames analyzed`);
    if (stats.segments !== undefined) parts.push(`${stats.segments} segments`);
  }

  parts.push(`${(stats.totalTimeMs / 1000).toFixed(1)}s total`);

  if (stats.costEstimate !== undefined) {
    parts.push(`~$${stats.costEstimate.toFixed(2)}`);
  }

  process.stderr.write(`\n${"─".repeat(40)}\n`);
  process.stderr.write(parts.join(" | ") + "\n");
}
