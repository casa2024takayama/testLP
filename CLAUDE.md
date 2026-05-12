# Claude Code 向けメモ

- **まず読む**: [`AGENTS.md`](./AGENTS.md)（編集可能範囲・URL の仕様・落とし穴）
- **運用の全体像**: [`README.md`](./README.md)
- **ビルド**: リポジトリルートで `node build.js` → 出力は `public/`（手で編集しない）
- **GitHub**: `main` / `master` へ push で **Actions がビルドして GitHub Pages にデプロイ**（`deploy-pages.yml`）
- **ソース・オブ・トゥルース**: `redirects.json`（`redirects` 配列）、`config.json`、`version.json`（リリース番号）
