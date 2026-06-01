# 2026-05-31T12-00-00 fixture-proxy suite bundle

This bundle is a **fixture-style deterministic suite receipt**, not a production leaderboard export.

- `data_source: "fixture"` in the checked-in reports marks these rows as demonstration/proxy data.
- The bundle exists to prove matrix wiring across repo shapes and task kinds, plus workflow-outcome serialization.
- Public claims should still treat these rows as conservative per-cell fixture receipts, not universal product evidence.
- `report.json` is the checked-in share-safe alias of `report.share-safe.json`; the private unsanitized local-path report is not published in this bundle.
- `started_at` / `completed_at` are deterministic fixture anchors for publication stability, while elapsed timing comparisons come from each arm's `duration_ms`.
- The tool-call counts are deterministic fixture receipts, so repeated counts across trials are expected in this published bundle.
- `human_intervention_required` records whether a person had to unblock or correct the scripted scenario; it is independent of `validation_passed`, `wrong_file_edits`, and `rework_loops`.
