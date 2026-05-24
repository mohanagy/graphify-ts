# Socket dependency review for `@lubab/madar@0.26.1`

## Scope

This review covers the production dependency surface for `@lubab/madar@0.26.1` as installed from `package.json` / `package-lock.json` on the `0.26.1` line.

Commands used during triage:

- `npm ls --omit=dev --all --json`
- `npm audit --omit=dev`
- `npx license-checker --production --json`
- `npm explain protobufjs`
- `npm explain onnxruntime-node`
- `npm explain sharp`
- targeted source review in `src/runtime/*.ts` and the relevant `node_modules/*/package.json` / install scripts

## Executive summary

- **Fixed now:** the only `npm audit --omit=dev` finding was `protobufjs` and it has been updated in `package-lock.json` from `7.5.6` to `7.6.1`.
- **Main remaining risk theme:** most of the noisy Socket-style alerts come from the optional semantic retrieval stack behind `@huggingface/transformers`.
- **Default runtime behavior:** Madar only loads the semantic stack when semantic retrieval or reranking is explicitly enabled. The lexical/default path returns early without loading it.
- **Follow-up required:** issue **#290** tracks making the semantic runtime dependencies optional so default installs do not pull the native/image/onnx stack for users who never enable semantic retrieval.

## Direct production dependencies

The table below records the resolved versions installed in the reviewed production
tree (`package-lock.json` / `node_modules`), not the semver ranges declared in
`package.json`.

| Package | Installed version | Notes |
| --- | --- | --- |
| `@huggingface/transformers` | `4.2.0` | Direct dependency; lazy-loaded only from the semantic retrieval path |
| `@vscode/tree-sitter-wasm` | `0.3.1` | Parser/grammar support |
| `fflate` | `0.8.3` | Compression helper |
| `gpt-tokenizer` | `3.4.0` | Local token counting |
| `neo4j-driver` | `6.0.1` | Optional Neo4j push/runtime integration |
| `typescript` | `6.0.3` | Parser/compiler dependency |
| `web-tree-sitter` | `0.26.9` | Tree-sitter runtime |

## Alert classification

| Alert category | Package(s) | Direct / transitive | Decision | Notes |
| --- | --- | --- | --- | --- |
| Vulnerable dependency | `protobufjs` via `@huggingface/transformers -> onnxruntime-web` | Transitive | **fix** | `npm audit --omit=dev` originally reported `protobufjs <=7.5.7`. `npm audit fix --omit=dev` updated the lockfile to `protobufjs@7.6.1` and cleared the audit. |
| Install script | `onnxruntime-node` | Transitive | **needs follow-up** | `onnxruntime-node` runs `node ./script/install` during install and its installer can download missing platform binaries, honoring proxy/env settings. This is part of the semantic stack and is tracked in **#290** because it lands in default installs today. |
| Install script | `sharp` | Transitive | **needs follow-up** | `sharp` runs an install-time check/build path and brings in optional platform image binaries. This is also part of the semantic/image stack tracked in **#290**. |
| Install script | `protobufjs` | Transitive | **false positive / scanner noise** | `protobufjs` does have `postinstall`, but the script only inspects nearby `package.json` files and emits a compatibility warning. It does not download code or spawn shells. |
| Network access | `@huggingface/transformers`, `onnxruntime-node` | Direct + transitive | **acceptable and documented** | `@huggingface/transformers` supports model/hub fetches and `onnxruntime-node` can fetch binaries during install. In Madar this stack is only reached from semantic retrieval/rerank, not from the default lexical path. The install-time part is still tracked in **#290**. |
| Shell access | `onnxruntime-node`, `sharp` | Transitive | **acceptable and documented** | Both packages use native build / binary-install tooling (`child_process`, `spawnSync`, `pkg-config`, `cmake`). This is expected for native Node dependencies. |
| Dynamic require | `onnxruntime-node`, `sharp` | Transitive | **acceptable and documented** | These packages dynamically load platform-specific native binaries. This is standard native-addon behavior, not app-level command execution. |
| Filesystem access | `web-tree-sitter`, `sharp`, `protobufjs` | Direct + transitive | **acceptable and documented** | Madar is a local code-analysis CLI and parser pipeline, so filesystem reads are expected. The transitive packages use local file access for wasm, native binaries, or proto loading helpers. |
| Environment variable access | `@huggingface/transformers`, `onnxruntime-node`, `sharp` | Direct + transitive | **acceptable and documented** | These packages read env vars for tokens, proxy settings, install flags, or native build configuration. This is expected for local ML/runtime tooling. |
| Copyleft / non-permissive license | `@img/sharp-libvips-*`, `@img/sharp-win32-*`, `@img/sharp-wasm32` | Transitive optional | **needs follow-up** | These LGPL-bearing packages are optional platform-specific binaries pulled in through `sharp`. They are not direct Madar dependencies, but they do enlarge the default install surface and are tracked in **#290**. |
| Obfuscated / minified code | `@huggingface/transformers`, `onnxruntime-web`, `neo4j-driver`, `protobufjs` browser/dist bundles | Direct + transitive | **acceptable and documented** | Upstream packages ship minified browser/runtime bundles alongside readable source and non-minified entry points. Madar is not introducing new obfuscated artifacts in its own package. |
| Eval-like code generation | `@protobufjs/codegen` via `protobufjs` | Transitive | **acceptable and documented** | `@protobufjs/codegen` uses the `Function` constructor to generate fast protobuf encode/decode helpers. This is real code generation, not evidence of hidden remote execution. |

## Why the semantic stack is not part of the default runtime path

Two repo-level checks matter here:

1. `src/runtime/retrieve.ts` returns the lexical result immediately unless `options.semantic === true` or `options.rerank === true`.
2. `src/runtime/semantic.ts` lazy-loads `@huggingface/transformers` with `await import('@huggingface/transformers')` only inside the semantic helper.

That means normal lexical retrieval does **not** load the transformer/onnx/image stack at runtime. The remaining concern is **install-time** exposure, not default execution.

## Risk posture

### Resolved in this issue

- `protobufjs` audit finding fixed in `package-lock.json`
- `npm audit --omit=dev` now reports **0 vulnerabilities**

### Acceptable with documentation

- local filesystem access from parser/runtime dependencies
- env-var and network access in the optional semantic model stack
- native binary loading / shell usage in `onnxruntime-node` and `sharp`
- minified upstream bundles and protobuf code-generation helpers

### Still worth follow-up

- default installs still pull the semantic dependency chain even though semantic retrieval is opt-in at runtime
- optional `sharp` platform binaries bring the LGPL alerts that corporate scanners will keep flagging

Tracked in: **#290 — Make semantic runtime dependencies optional**
