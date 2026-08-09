# SPKLAB — Free browser tools for After Effects & Premiere Pro

**Live site:** https://spkboy.github.io/spklab/

Free, local-only browser tools for motion designers & editors. Files never leave your computer.
애프터이펙트·프리미어를 위한 무료 브라우저 도구 모음 — 파일은 업로드되지 않습니다.

| Tool | What it does |
|---|---|
| [X-Ray](https://spkboy.github.io/spklab/xray/) | See which third-party plugins & fonts an `.aep` / `.prproj` project needs — before opening it · 플러그인·폰트 검사기 |
| [Version Changer](https://spkboy.github.io/spklab/convert/) | Open newer After Effects / Premiere Pro projects in older versions (downgrade `.aep` / `.prproj`) · 버전 변환기 |

## Dev

Each tool folder is self-contained:

- `engine.js` — parsing/patching logic (browser + Node)
- `node test.cjs` — tests against local sample files
- `node build.cjs` — inlines engine into `template.html` → `index.html` (the deployed single file)

Root `index.html` is the hub landing page.
