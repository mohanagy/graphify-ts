#!/usr/bin/env bash

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TS="$(date -u +%Y-%m-%dT%H%M%SZ)"
BUNDLE_DIR="${GRAPHIFY_BENCH_REAL_RESULTS_DIR:-$HERE/results/real-workspaces/$TS}"
PROMPTS_FILE="${GRAPHIFY_BENCH_REAL_PROMPTS:-$HERE/prompts.real-workspace.example.json}"

run_workspace() {
  local workspace_name="$1"
  local workspace_path="$2"
  if [[ -z "$workspace_path" ]]; then
    return
  fi

  mkdir -p "$BUNDLE_DIR/$workspace_name"
  echo "[real-workspace] $workspace_name -> $workspace_path"
  GRAPHIFY_BENCH_FIXTURE="$workspace_path" \
  GRAPHIFY_BENCH_PROMPTS="$PROMPTS_FILE" \
  GRAPHIFY_BENCH_RESULTS_DIR="$BUNDLE_DIR/$workspace_name" \
  bash "$HERE/run.sh"
}

if [[ -z "${GRAPHIFY_BENCH_BACKEND:-}" && -z "${GRAPHIFY_BENCH_MONOREPO:-}" ]]; then
  echo "Set GRAPHIFY_BENCH_BACKEND and/or GRAPHIFY_BENCH_MONOREPO before running." >&2
  exit 2
fi

mkdir -p "$BUNDLE_DIR"
run_workspace "backend" "${GRAPHIFY_BENCH_BACKEND:-}"
run_workspace "monorepo" "${GRAPHIFY_BENCH_MONOREPO:-}"

node "$HERE/summarize-real-workspaces.mjs" "$BUNDLE_DIR" > "$BUNDLE_DIR/real-workspaces.summary.json"
cat "$BUNDLE_DIR/real-workspaces.summary.json"
