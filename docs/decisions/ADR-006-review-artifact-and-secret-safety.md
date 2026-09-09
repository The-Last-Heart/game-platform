# ADR-006 — Review artifact and secret safety

- Status: Accepted
- Date: 2026-09-10
- Milestone: LH-001D

## Context

LH-001C review archives were produced with a temporary Git index, but the
tooling still had unsafe output handling, Python ZIP dependencies, incomplete
`.env*` protection, and incomplete real-index fingerprinting. Contributors need
a repeatable, platform-neutral archive workflow that cannot alter the real Git
index or delete arbitrary files.

## Decision

### Temporary candidate index

Review archives are built from a temporary `GIT_INDEX_FILE`:

- When `HEAD` exists, the base is `git read-tree HEAD`, then `git add -A`.
- When the repository has no commit yet, the base is `git read-tree --empty`,
  then `git add -A`.
- Candidate paths are listed with NUL-delimited `git ls-files -z` and are never
  trimmed or newline-split.

### Real index fingerprint

Before and after every run (success or failure), the tool records:

- Whether `.git/index` exists
- SHA-256 of the exact index bytes when present
- SHA-256 and exact bytes of `git ls-files --stage -z`
- SHA-256 and exact bytes of `git diff --cached --binary`

Any mismatch fails the process. Summary-only diffs are not sufficient.

### Output-path safety

- Output is required via `--output <path.zip>`
- `--help` prints usage and exits 0 without creating or deleting files
- The path must end with `.zip`, resolve outside the repository, and must not be
  a directory or symlink
- Existing outputs are refused unless `--force` is set
- Archives are written to a unique temporary file and published only after
  candidate validation, ZIP equality, and byte-content checks succeed
- The previous output is never deleted before the replacement is verified

### No Python or shell ZIP tooling

ZIP listing and extraction use a Node built-in zlib reader. Python, `zip`,
`unzip`, PowerShell ZIP helpers, and shell parsing are not dependencies.

External commands always use `spawnSync(..., { shell: false })` with explicit
argv arrays.

### Candidate and ZIP equality

Acceptance requires:

1. Candidate path count equals archive entry count
2. Candidate path set equals archive path set
3. Each archived blob equals `git show :<path>` from the temporary index
4. Unsafe paths, symlink candidates, secret env files, private keys, tokens, and
   workstation home paths are rejected

### Environment-file deny rules

All of the following are forbidden as candidates and must be gitignored:

- Basename `.env`
- Any basename beginning with `.env.`
- Other generated `*.env` artifacts

The only exception is a basename exactly equal to `.env.example`.

### Symlink and unsafe-path policy

Absolute paths, `..` traversal, control characters, and symbolic-link working
tree entries are rejected.

### Docker executable override

Compose wrappers use:

- `LH_DOCKER_EXE` — exact executable path; `compose` is appended internally
- optional `LH_DOCKER_COMPOSE_ARGV` — JSON argv array for unambiguous overrides

Whitespace-split command prefixes are not supported.

### How to run

```bash
pnpm run test:tooling
node scripts/create-review-archive.mjs --help
node scripts/create-review-archive.mjs --output ../the-last-heart-lh001d-review.zip
```

## Consequences

- Review archives are source-only and reproducible across Linux, macOS, Windows,
  and WSL without Python.
- The real Git index remains unchanged even when archive creation fails.
- Contributors cannot accidentally delete repository files by passing them as
  the archive output path.
