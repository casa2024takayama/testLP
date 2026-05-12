# Link Tracker — 外部リンクアクセス計測

X 等SNS投稿の外部リンククリックを GA4 で計測するための、GitHub Pages ベースのリダイレクトサービスです。

## 仕組み

1. SNS投稿にリダイレクトURL（例: `https://casa2024takayama.github.io/testLP/dev/test-01/` ※`build.js` の `PATH_PREFIX` に依存）を掲載
2. ユーザーがクリックすると、GitHub Pages 上のリダイレクトページにアクセス
3. GTM が読み込まれ、GA4 にカスタムイベント `link_click_redirect` を送信
4. 800ms 後に本来の転送先URLへ自動遷移

## 初期セットアップ

### 1. GTM / GA4 の ID を設定

`config.json` を開き、取得した ID に書き換えます。

```json
{
  "gtm_container_id": "GTM-XXXXXXX",    ← ここを書き換え
  "ga4_measurement_id": "G-XXXXXXXXXX", ← ここを書き換え
  "base_url": "https://casa2024takayama.github.io/testLP"
}
```

### 2. GitHub Pages の設定

リポジトリの Settings → Pages で:
- **Source**: `GitHub Actions` を選択

### 3. ビルドとデプロイ

**デフォルト運用（GitHub）**: `main`（または `master`）へ push すると **Actions が `node build.js` を実行し、`public/` を GitHub Pages に自動デプロイ**します（`.github/workflows/deploy-pages.yml`）。手動だけ再度走らせたいときは Actions の「Deploy Pages」から **Run workflow** でも実行できます。

初回だけリポジトリの **Settings → Pages → Build and deployment → Source を GitHub Actions** にしてください（これが無いとデプロイジョブが失敗します）。

ローカルで確認するとき:

```bash
node build.js
```

```bash
git add .
git commit -m "initial setup"
git push origin main
```

**本リポジトリに同梱されている GitHub Actions**:

- **`deploy-pages.yml`** … `main` / `master` への push と手動実行で **ビルド＋GitHub Pages デプロイ**
- **`notion-sync.yml`** … Notion DB 同期（日次・手動）
- **`require-version-bump.yml`** … PR で `redirects.json` / `build.js` / `config.json` が変わったとき **`version.json` も更新されていること**をチェック

## リリースバージョン（更新の見える化）

- ルートの **`version.json`** に **`version`** を書く（例: `1.0.1`）。リンクや設定・ビルドに触れる PR のたびに上げる運用を推奨。
- `node build.js` で **`public/version.json`** が生成され、`version`・ビルド時の **短い Git SHA**（ローカルは `git rev-parse`、GitHub Actions は `GITHUB_SHA`）・**ISO 時刻** が入る。
- 公開後の管理画面（`…/testLP/`）のフッターと **`…/testLP/version.json`** で、どのリリースがデプロイされているか確認できる。
- **サイト上にバージョンが無い／404 のとき**は、GitHub Pages に **`deploy-pages` が成功したあとの成果物**が載っていない可能性が高いです。（Actions の「Deploy Pages」を確認し、Settings → Pages の Source が **GitHub Actions** になっているか見てください。）
- **Pages をまだ使っていないとき**でも、リポジトリ直下の **`version.json`**（人手で上げる番号）だけは GitHub 上で常に確認できます。ビルド結果をローカルで見る場合は `node build.js` のあと **`public/index.html`** をブラウザで開くと、フッターに `public/version.json` と同じ情報が出ます。

## リダイレクトの追加方法

### 1. `redirects.json` の `redirects` 配列にエントリを追加

```json
{
  "redirects": [
    {
      "slug": "campaign-summer",
      "destination": "https://example.com/lp/summer",
      "tag": "x-campaign",
      "label": "夏キャンペーンLP",
      "utm": {
        "source": "x",
        "medium": "social",
        "campaign": "summer2026",
        "content": "profile_link"
      }
    }
  ]
}
```

`utm` は省略可能。指定すると転送先 URL にクエリが付与され、GA4 イベントにも `utm_*` が載ります。

| フィールド | 説明 | 例 |
|-----------|------|-----|
| `slug` | URLのパス部分 / 管理用 ID（英数字とハイフン） | `campaign-summer` |
| `mode` | 任意。`redirect`（既定） or `direct` | 下記「2 つの計測モード」参照 |
| `destination` | 転送先の実URL | `https://example.com/lp` |
| `tag` | 施策分類タグ（GA4で絞り込み用） | `x-campaign`, `event-sponsor`, `test` |
| `label` | 管理用メモ（日本語OK） | `夏キャンペーンLP` |
| `utm` | 任意。`source` / `medium` / `campaign` / `content` / `term` | 上記 JSON 参照 |

### 2 つの計測モード

- **`mode: "redirect"`（既定）**: 当サービスが短縮 URL の HTML を生成し、クリック時に GA4 へ `link_click_redirect` を送信した後に `destination` へ遷移。**GA4 が入っていない外部 SNS** に向いている。
- **`mode: "direct"`**: HTML を生成せず、**`destination?utm_*` の最終 URL だけを admin 一覧に登録**。外部ページ（例: イベント協賛ページ）から **GA4 が入っている自社ページ** に直接誘導し、UTM だけ付けて流入元を識別したいケース用。

```json
{
  "slug": "itwomensummit-contact",
  "mode": "direct",
  "destination": "https://www.saison-technology.com/contact/",
  "tag": "event-sponsor",
  "label": "IT Women Summit 2026 スポンサー掲載 - お問い合わせ",
  "utm": {
    "source": "shoeisha",
    "medium": "referral",
    "campaign": "FY26_event_202605_itwomensummit",
    "content": "sponsor_contact"
  }
}
```

`direct` モードは UTM 必須（無いと意味がないので `node build.js` 実行時に警告して除外）。

### 2. push する

```bash
git add redirects.json
git commit -m "add: summer campaign link"
git push origin main
```

デプロイ完了後、以下の形式の URL が有効になります（先頭パスは `build.js` の `PATH_PREFIX`。デフォルトは `dev`）:

```
https://casa2024takayama.github.io/testLP/dev/campaign-summer/
```

## 管理画面

デプロイ後、以下のURLで全リダイレクトの一覧を確認できます:

```
https://casa2024takayama.github.io/testLP/
```

## GA4 での確認方法

### リアルタイムレポート

1. GA4 → レポート → リアルタイム
2. リダイレクトURLにアクセス
3. `link_click_redirect` イベントが表示されることを確認

### カスタムイベントパラメータ

| パラメータ | 内容 |
|-----------|------|
| `link_slug` | リダイレクトのスラッグ |
| `link_tag` | 施策タグ |
| `link_label` | ラベル（説明） |
| `link_destination` | 転送先URL（UTM 付与後） |
| `utm_source` など | `utm` を指定したエントリのみ（gtag イベントに付与） |

### GTM 側の設定

GTM コンテナ内で以下を設定してください:

1. **GA4 設定タグ**: 測定ID を設定
2. **カスタムイベントタグ**: イベント名 `link_click_redirect` をトリガーに GA4 イベントを送信
3. **データレイヤー変数**: `link_slug`, `link_tag`, `link_label`, `link_destination` を変数として登録

## ファイル構成

```
testLP/
├── AGENTS.md            ← AI・共同作業者向けの技術メモ
├── CLAUDE.md            ← Claude Code 用の入口（AGENTS.md へ）
├── version.json         ← リリース番号（PR で更新 → ビルドで public に複製・拡張）
├── config.json          ← GTM/GA4 / base_url
├── redirects.json       ← リダイレクト定義（`redirects` 配列）
├── build.js             ← HTML 生成（`PATH_PREFIX` でパス先頭を決定）
├── utm-generator.html   ← 静的ツール（ビルドで public にコピー）
├── manual.html
├── usecase-guide.html
├── scripts/
│   └── notion_sync.py   ← redirects.json → Notion DB 同期（任意運用）
├── .github/
│   └── workflows/
│       ├── deploy-pages.yml     ← push でビルド＋Pages デプロイ
│       ├── notion-sync.yml      ← 日次・手動で Notion 同期
│       └── require-version-bump.yml
├── public/              ← `node build.js` の生成物（原則 git 管理外）
│   ├── index.html
│   ├── dev/             ← 現行の PATH_PREFIX（変更可）
│   │   └── {slug}/index.html
│   └── ...
└── README.md
```

`public/` は **ローカル確認用**および CI の生成先であり、git にはコミットしない想定です。本番反映は **merge 後の `deploy-pages` workflow** に任せればよいです。

## Notion との同期（任意）

`redirects.json` のうち **`utm` が揃っている行**から QR 用 URL を組み立て、Notion データベースに未登録分だけ追加します。手動実行・日次バッチは `.github/workflows/notion-sync.yml`、ロジックは `scripts/notion_sync.py`。シークレット: `NOTION_API_KEY`, `NOTION_DATABASE_ID`。

## 注意事項

- `public/` は `build.js` が自動生成するため、直接編集しないでください
- AI や新メンバー向けの技術要点は **`AGENTS.md`** にまとめています（Claude Code は **`CLAUDE.md`** から誘導）
- リダイレクトページの滞在時間は約800ms（ユーザー体験への影響は軽微）
- GitHub Pages の帯域制限: 月100GB（社内利用・キャンペーン用途なら十分）
