# AI・共同作業者向けガイド（Claude Code / Cursor 等）

このファイルは、リポジトリに初めて触れる人間・エージェントが **安全に変更できる範囲** と **仕様の落とし穴** をすぐ把握するためのものです。詳細な運用手順は `README.md` と `manual.html` を参照してください。

## プロジェクトの目的

- SNS 等に掲載する **短いリダイレクト URL** 経由で外部サイトへ飛ばしつつ、**GA4（と GTM / dataLayer）に `link_click_redirect` を送る**。
- ソース・オブ・トゥルースは **`redirects.json`**（リンク定義）、**`config.json`**（GTM/GA4/base URL）、**`version.json`**（人間が上げるリリース番号）。
- **`build.js`** が `public/` 以下に静的 HTML を生成する。生成物は Git で管理しない想定。

## 編集してよいもの / しないもの

| 編集可 | 編集禁止・非推奨 |
|--------|------------------|
| `config.json` | `public/` 直下の生成 HTML（常に `node build.js` で再生成） |
| `redirects.json` | 生成物だけをコミットしてソースを更新しない |
| `build.js`（ビルドロジック変更時） | |
| ルートの `*.html`（`utm-generator.html`, `manual.html`, `usecase-guide.html`） | |
| `version.json`（リリース番号・PR ごとに更新） | |
| `scripts/notion_sync.py`, `.github/workflows/*.yml` | |

## ローカルでのビルド

- 依存パッケージなし（Node のみ）。
- リポジトリルートで実行:

```bash
node build.js
```

- 出力先: `public/`（`index.html`、リダイレクト用の各 `index.html`、**生成される `version.json`**、上記3つの静的 HTML のコピー）。

## リリースバージョン（PR 単位）

- **`version.json`** に **`version`**（セマンティックバージョン推奨）だけを置く。リンク追加のみなら patch（例 `1.0.0` → `1.0.1`）、ビルド仕様変更なら minor など運用で決める。
- **`node build.js`** が `public/version.json` に `version` / `git_sha` / `built_at` を書き出し、管理画面フッターとリダイレクト HTML 先頭コメントにも反映する。**デプロイ後に「いつのビルドか」が追える**。
- CI: **`require-version-bump`** が、`redirects.json` / `build.js` / `config.json` のいずれかが PR で変わったとき **`version.json` も同じ PR で変わっていること**をチェックする（ドキュメントのみの PR は対象外）。

## URL の形（重要）

`build.js` 内の **`PATH_PREFIX`**（現状は `"dev"`）が、GitHub Pages 上のパス先頭になります。

- 公開 URL の例: `{base_url}/{PATH_PREFIX}/{slug}/`
- `config.json` の `base_url` と整合させること。README の古い例で `r/` となっている記述は **現行コードでは `dev/`**（`PATH_PREFIX` を変えれば変更可）。

`PATH_PREFIX` を `r` に戻したい場合は `build.js` の定数を変更し、ドキュメント・既存の共有 URL と矛盾がないか確認すること。

## `redirects.json` のスキーマ

トップレベルは **`redirects` 配列**（オブジェクトを直接並べる形式ではない）。

各要素:

| フィールド | 必須 | 説明 |
|------------|------|------|
| `slug` | はい | URL パス用 / 管理用 ID。英数字とハイフン推奨。 |
| `mode` | いいえ | `"redirect"`（既定）または `"direct"`。下記「2 つの計測モード」参照。 |
| `destination` | はい | 最終的な遷移先 URL。 |
| `tag` | はい | GA4 / 管理用の分類（例: `x-campaign`, `event-sponsor`）。 |
| `label` | はい | 管理用表示名。 |
| `utm` | `direct` では必須 | `destination` にクエリとして付与。`source`, `medium`, `campaign`, `content`, `term` をサポート。 |

ビルド時、`utm` があるエントリは **gtag の `link_click_redirect` に `utm_*` パラメータも付与**される（`build.js` 参照、`redirect` モードのみ）。

### 2 つの計測モード

| `mode` | 用途 | 生成物 | 外部に渡す URL |
|--------|------|--------|----------------|
| `redirect`（既定） | SNS など **GA4 が入っていない外部** に短縮 URL を貼り、こちら側で `link_click_redirect` を発火させて GA4 に記録したい | `public/{PATH_PREFIX}/{slug}/index.html` | `{base_url}/{PATH_PREFIX}/{slug}/` |
| `direct` | 掲載先（外部ページ）から **GA4 が既に入っている自社ページ** に直リンクし、UTM だけ付けて流入を識別したい | HTML は生成しない（admin index にだけ表示） | `destination?utm_*`（generator が組み立てた URL） |

`direct` モードのときに `utm` が無いとビルド時に警告して除外します（存在意義がないため）。

## Notion 同期（オプション運用）

- **`scripts/notion_sync.py`**: `redirects.json` から「QRに設定するURL」相当の文字列を組み立て、Notion DB に **未登録分だけ**追加する。
- **同期対象になるのは `utm` が揃っていて QR 用 URL が生成できる行だけ**。`utm` が欠けるとスキップされる（`build.js` 側の `redirect` モードは UTM なしでも動く）。
- `direct` モードのエントリも UTM があれば同様に登録される（Notion 上では「QRに設定するURL」=「掲載用の最終 URL」になる）。
- **GitHub Actions**: `.github/workflows/notion-sync.yml` — 日次 cron と手動 `workflow_dispatch`。シークレット: `NOTION_API_KEY`, `NOTION_DATABASE_ID`。**`deploy-pages.yml`** が `main` / `master` push でビルドして GitHub Pages に公開。**`require-version-bump.yml`** が PR 時に `version.json` 更新を検証する。
- Pages の **Settings → Pages → Source は GitHub Actions** にすること（初回セットアップ）。

## 変更時のチェックリスト

1. `redirects.json` の JSON が valid か。
2. **サイトに効く変更なら `version.json` を上げたか**（CI でも確認）。
3. `node build.js` がエラーなく完走するか。
4. 生成された `public/.../index.html` で、意図した `destination`（と UTM）になっているか。
5. `PATH_PREFIX` や `base_url` を変えた場合、既存の公開リンクが切れないか。

## 関連ドキュメント

- `README.md` — セットアップ・運用の全体像
- `manual.html` — 操作マニュアル（デプロイ後はサイト上からも参照）
- `usecase-guide.html` — ユースケース
