# Real workspace benchmark report template

This benchmark can be run on private repos locally.
No private paths or artifacts are committed.
If GoValidate is unavailable, no GoValidate-specific numbers are claimed.

## Workspace matrix

| Workspace | Variant | Build time (ms) | Graph size (bytes) | Nodes | Edges |
|---|---|---:|---:|---:|---:|

## Strategy / resolution comparisons

| Workspace | Prompt | Strategy | Resolution | Tokens | Nodes | Quality | Notes |
|---|---|---|---|---:|---:|---:|---|

## Retrieval-level comparisons

| Workspace | Prompt | Retrieval level | Tokens | Nodes | Gate reason |
|---|---|---:|---:|---:|---|

## Value-per-token calibration

- Where value-per-token helps:
- Where it does not change output:
- Where it hurts or increases tokens:
- Suggested scoring adjustments:

## Qualitative notes

- Objective metrics are listed separately from qualitative notes.
- Private workspace paths must be redacted before sharing any report excerpt.
