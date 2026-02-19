#!/usr/bin/env bun
import { Command } from "commander";
import { registerAskCommand } from "./commands/ask.ts";
import { registerFramesCommand } from "./commands/frames.ts";
import { registerManifestCommand } from "./commands/manifest.ts";
import { registerTranscriptCommand } from "./commands/transcript.ts";
import { registerInfoCommand } from "./commands/info.ts";

const program = new Command();

program
  .name("llm-youtube")
  .description("Ask LLMs questions about YouTube videos using transcripts and visual frames")
  .version("0.1.0");

registerAskCommand(program);
registerFramesCommand(program);
registerManifestCommand(program);
registerTranscriptCommand(program);
registerInfoCommand(program);

program.parse();
