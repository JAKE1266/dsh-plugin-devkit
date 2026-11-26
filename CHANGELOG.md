# Changelog

All notable changes to this project are documented here.

## [0.1.0] - 2026-11-26

- Initial release.
- `dpd new` — generate a DSH plugin skeleton with test, CI and bilingual READMEs.
- `dpd check` — 8 static checks covering packaging, routing, secrets, templates and i18n.
- `dpd doctor` — check plus local environment diagnostics.
- `dpd preflight` — boot DSH once with a throwaway profile before touching a real one.
- Self-test suite (`node test/run.mjs`) verifying scaffold/check correctness.
