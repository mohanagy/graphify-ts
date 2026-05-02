# Contributing to graphify-ts

Thanks for helping improve `graphify-ts`.

Contributions are welcome across code, tests, fixtures, docs, release tooling, and AI-platform integrations. Good contributions are usually small, well-scoped, and easy to verify.

## Good first contributions

A few high-value ways to help:

- fix incorrect extraction edges or missing relationships
- add fixture-backed coverage for parser or extractor regressions
- improve docs, examples, and install flows
- tighten CI, release, or repository hygiene
- reduce graph noise or improve community labeling

## Development setup

Prerequisites:

- Node.js 20+
- npm

From the repository root:

```bash
npm install
npm run typecheck
npm run test:run
npm run build
```

If you are changing packaging or install behavior, also run:

```bash
npm pack --dry-run
```

## Project workflow

Before opening a pull request:

1. Keep the change focused on one problem or improvement.
2. Add or update tests when behavior changes.
3. Update user-facing docs when commands, outputs, or setup steps change.
4. Run the verification commands locally.
5. Avoid committing secrets, private corpora, or accidental generated artifacts.

If your change affects extraction behavior, prefer adding a small fixture and a targeted test under `tests/unit/` or `tests/fixtures/`.

## Documentation expectations

When a change affects how end users install, run, or interpret the tool, update:

- `README.md` for user-facing behavior

## Pull requests

Use the pull request template and include:

- what changed
- why it changed
- how you tested it
- any follow-up work or trade-offs

For larger changes, open an issue first so the approach can be discussed before implementation.

## Security issues

Please **do not** open public issues for security vulnerabilities.

Follow the process in [`SECURITY.md`](./SECURITY.md).

## Review and merge expectations

This repository includes GitHub issue forms, a pull request template, `CODEOWNERS`, and a CI workflow to support a clean open-source contribution flow.

If you maintain the repository, keep repository-level protections such as branch protection rules, required checks, and merge restrictions aligned with the current GitHub repository settings.

## License

By contributing, you agree that your contributions are licensed under this project's MIT license.
