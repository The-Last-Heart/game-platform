#!/usr/bin/env node
/**
 * Creates a source-only review archive that exactly matches a temporary
 * Git candidate index. Leaves the real Git index byte-for-byte unchanged.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReviewArchiveArgs, USAGE } from './lib/review-archive/cli.mjs';
import { createReviewArchive } from './lib/review-archive/create.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseReviewArchiveArgs(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  if (parsed.help) {
    process.stdout.write(USAGE);
    return;
  }

  try {
    createReviewArchive({
      root,
      output: parsed.output,
      force: parsed.force,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
