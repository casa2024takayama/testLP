# Link Tracker — 外部リンクアクセス計測

X 等SNS投稿の外部リンククリックを GA4 で計測するための、GitHub Pages ベースのリダイレクトサービスです。

## 仕組み

1. SNS投稿にリダイレクトURL（例: `https://casa2024takayama.github.io/testLP/r/test-01/`）を掲載
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

### 3. push してデプロイ

```bash
git add .
git commit -m "initial setup"
git push origin main
```

GitHub Actions が自動で `build.js` を実行し、`public/` 配下の HTML を Pages にデプロイします。

## リダイレクトの追加方法

### 1. `redirects.json` にエントリを追加

```json
{
  "slug": "campaign-summer",
  "destination": "https://example.com/lp/summer",
  "tag": "x-campaign",
  "label": "夏キャンペーンLP"
}
```

| フィールド | 説明 | 例 |
|-----------|------|-----|
| `slug` | URLのパス部分（英数字とハイフン） | `campaign-summer` |
| `destination` | 転送先の実URL | `https://example.com/lp` |
| `tag` | 施策分類タグ（GA4で絞り込み用） | `x-campaign`, `event`, `test` |
| `label` | 管理用メモ（日本語OK） | `夏キャンペーンLP` |

### 2. push する

```bash
git add redirects.json
git commit -m "add: summer campaign link"
git push origin main
```

1〜2分後にデプロイが完了し、以下のURLが有効になります:

```
https://casa2024takayama.github.io/testLP/r/campaign-summer/
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
| `link_destination` | 転送先URL |

### GTM 側の設定

GTM コンテナ内で以下を設定してください:

1. **GA4 設定タグ**: 測定ID を設定
2. **カスタムイベントタグ**: イベント名 `link_click_redirect` をトリガーに GA4 イベントを送信
3. **データレイヤー変数**: `link_slug`, `link_tag`, `link_label`, `link_destination` を変数として登録

## ファイル構成

```
testLP/
├── config.json          ← GTM/GA4 の ID（ここだけ編集）
├── redirects.json       ← リダイレクト定義（エントリ追加）
├── build.js             ← HTML 生成スクリプト
├── .github/
│   └── workflows/
│       └── deploy.yml   ← GitHub Actions（自動ビルド＆デプロイ）
├── public/              ← 生成される HTML（git管理外）
│   ├── index.html       ← 管理用一覧ページ
│   └── r/
│       ├── test-01/index.html
│       ├── test-02/index.html
│       └── ...
└── README.md
```

## 注意事項

- `public/` は `build.js` が自動生成するため、直接編集しないでください
- リダイレクトページの滞在時間は約800ms（ユーザー体験への影響は軽微）
- GitHub Pages の帯域制限: 月100GB（社内利用・キャンペーン用途なら十分）
