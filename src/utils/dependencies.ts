import { $ } from "bun";

interface DependencyCheck {
  name: string;
  command: string;
  installInstructions: string;
}

const DEPENDENCIES: DependencyCheck[] = [
  {
    name: "yt-dlp",
    command: "yt-dlp --version",
    installInstructions:
      "Install yt-dlp:\n" +
      "  macOS:   brew install yt-dlp\n" +
      "  pip:     pip install yt-dlp\n" +
      "  More:    https://github.com/yt-dlp/yt-dlp#installation",
  },
  {
    name: "ffmpeg",
    command: "ffmpeg -version",
    installInstructions:
      "Install ffmpeg:\n" +
      "  macOS:   brew install ffmpeg\n" +
      "  Ubuntu:  sudo apt install ffmpeg\n" +
      "  More:    https://ffmpeg.org/download.html",
  },
  {
    name: "ffprobe",
    command: "ffprobe -version",
    installInstructions:
      "ffprobe is bundled with ffmpeg. Install ffmpeg to get it.\n" +
      "  macOS:   brew install ffmpeg\n" +
      "  Ubuntu:  sudo apt install ffmpeg",
  },
];

export interface DependencyResult {
  name: string;
  available: boolean;
  version?: string;
  error?: string;
}

export async function checkDependency(name: string): Promise<DependencyResult> {
  const dep = DEPENDENCIES.find((d) => d.name === name);
  if (!dep) {
    return { name, available: false, error: `Unknown dependency: ${name}` };
  }

  try {
    const [cmd, ...args] = dep.command.split(" ");
    const proc = Bun.spawn([cmd!, ...args], { stdout: "pipe", stderr: "pipe" });
    const exitCode = await proc.exited;
    if (exitCode !== 0) throw new Error("non-zero exit");
    const output = await new Response(proc.stdout).text();
    const version = output.trim().split("\n")[0] ?? "";
    return { name, available: true, version };
  } catch {
    return {
      name,
      available: false,
      error: `${name} not found on PATH\n${dep.installInstructions}`,
    };
  }
}

export async function checkAllDependencies(
  required: string[] = ["yt-dlp", "ffmpeg"]
): Promise<{ ok: boolean; results: DependencyResult[] }> {
  const results = await Promise.all(required.map(checkDependency));
  const ok = results.every((r) => r.available);
  return { ok, results };
}

export async function ensureDependencies(required: string[] = ["yt-dlp", "ffmpeg"]): Promise<void> {
  const { ok, results } = await checkAllDependencies(required);
  if (!ok) {
    const missing = results.filter((r) => !r.available);
    const message = missing.map((r) => `✗ ${r.error}`).join("\n\n");
    throw new Error(`Missing required dependencies:\n\n${message}`);
  }
}
