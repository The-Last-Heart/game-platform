/**
 * CLI parsing for the review-archive tool (no side effects on import).
 */

export const USAGE = `Usage:
  node scripts/create-review-archive.mjs --output <path.zip> [--force]
  node scripts/create-review-archive.mjs --help

Options:
  --output <path>  Required. Destination ZIP path (must be outside the repo, .zip extension).
  --force          Replace an existing output only after the new archive is fully verified.
  --help           Show this help and exit 0 without creating or deleting files.
`;

/**
 * @param {string[]} argv process.argv.slice(2)
 * @returns {{ help: true } | { help: false, output: string, force: boolean }}
 */
export function parseReviewArchiveArgs(argv) {
  if (argv.length === 0) {
    const error = new Error('Missing required --output <path>');
    error.code = 'USAGE';
    throw error;
  }

  /** @type {string | undefined} */
  let output;
  let force = false;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--force') {
      force = true;
      continue;
    }
    if (arg === '--output') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        const error = new Error('Missing value for --output');
        error.code = 'USAGE';
        throw error;
      }
      output = value;
      i += 1;
      continue;
    }
    if (arg.startsWith('--output=')) {
      output = arg.slice('--output='.length);
      if (!output) {
        const error = new Error('Missing value for --output');
        error.code = 'USAGE';
        throw error;
      }
      continue;
    }
    if (arg.startsWith('-')) {
      const error = new Error(`Unknown flag: ${arg}`);
      error.code = 'USAGE';
      throw error;
    }
    const error = new Error(
      `Unexpected argument: ${arg}. Use --output <path.zip>`,
    );
    error.code = 'USAGE';
    throw error;
  }

  if (help) {
    return { help: true };
  }

  if (!output) {
    const error = new Error('Missing required --output <path>');
    error.code = 'USAGE';
    throw error;
  }

  return { help: false, output, force };
}
