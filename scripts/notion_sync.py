"""
notion_sync.py
redirects.json の内容を Notion UTMリンク管理DBに同期するスクリプト。
- QRに設定するURL をキーに重複チェック
- 未登録のエントリのみ新規登録（既存レコードは上書きしない）
- 実行ログを標準出力に出力
"""

import json
import os
import requests
from urllib.parse import urlencode, urlparse, parse_qs

NOTION_API_KEY = os.environ["NOTION_API_KEY"]
DATABASE_ID = os.environ["NOTION_DATABASE_ID"]

HEADERS = {
    "Authorization": f"Bearer {NOTION_API_KEY}",
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
}


def load_redirects():
    """redirects.json を読み込む"""
    with open("redirects.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("redirects", [])


def build_qr_url(entry):
    """エントリからQRに設定するURLを生成"""
    dest = entry.get("destination", "")
    utm = entry.get("utm", {})
    source = utm.get("source", "")
    medium = utm.get("medium", "")
    campaign = utm.get("campaign", "")
    content = utm.get("content", "")

    if not dest or not source or not medium or not campaign:
        return None

    sep = "&" if "?" in dest else "?"
    url = f"{dest}{sep}utm_source={source}&utm_medium={medium}&utm_campaign={campaign}"
    if content:
        url += f"&utm_content={content}"
    return url


def fetch_existing_urls():
    """Notion DBに登録済みのQR URLセットを取得（重複チェック用）"""
    existing = set()
    url = f"https://api.notion.com/v1/databases/{DATABASE_ID}/query"
    payload = {"page_size": 100}

    while True:
        res = requests.post(url, headers=HEADERS, json=payload)
        res.raise_for_status()
        data = res.json()

        for page in data.get("results", []):
            props = page.get("properties", {})
            qr_url_prop = props.get("QRに設定するURL", {})
            qr_url = qr_url_prop.get("url")
            if qr_url:
                existing.add(qr_url)

        if not data.get("has_more"):
            break
        payload["start_cursor"] = data["next_cursor"]

    return existing


def register_entry(entry, qr_url):
    """エントリをNotionに新規登録"""
    utm = entry.get("utm", {})
    label = entry.get("label", entry.get("slug", ""))
    tag = entry.get("tag", "")
    dest = entry.get("destination", "")

    properties = {
        "リンク名": {"title": [{"text": {"content": label}}]},
        "ステータス": {"select": {"name": "発行済み"}},
        "QRに設定するURL": {"url": qr_url},
        "utm_source": {"rich_text": [{"text": {"content": utm.get("source", "")}}]},
        "utm_medium": {"rich_text": [{"text": {"content": utm.get("medium", "")}}]},
        "utm_campaign": {"rich_text": [{"text": {"content": utm.get("campaign", "")}}]},
        "utm_content": {"rich_text": [{"text": {"content": utm.get("content", "")}}]},
        "備考": {"rich_text": [{"text": {"content": f"GitHub自動同期 / tag:{tag}"}}]},
    }

    if dest:
        properties["転送先URL"] = {"url": dest}

    payload = {
        "parent": {"database_id": DATABASE_ID},
        "properties": properties,
    }

    res = requests.post(
        "https://api.notion.com/v1/pages",
        headers=HEADERS,
        json=payload,
    )
    res.raise_for_status()
    return res.json().get("url")


def main():
    print("=== Notion UTM Sync 開始 ===")

    redirects = load_redirects()
    print(f"redirects.json: {len(redirects)} 件")

    existing_urls = fetch_existing_urls()
    print(f"Notion登録済み: {len(existing_urls)} 件")

    new_count = 0
    skip_count = 0

    for entry in redirects:
        qr_url = build_qr_url(entry)
        if not qr_url:
            print(f"  [SKIP] URLを生成できません: {entry.get('slug', '?')}")
            skip_count += 1
            continue

        if qr_url in existing_urls:
            print(f"  [SKIP] 登録済み: {entry.get('slug', '?')}")
            skip_count += 1
            continue

        try:
            notion_url = register_entry(entry, qr_url)
            print(f"  [OK] 登録完了: {entry.get('slug', '?')} → {notion_url}")
            new_count += 1
        except Exception as e:
            print(f"  [ERROR] 登録失敗: {entry.get('slug', '?')} / {e}")

    print(f"\n=== 完了 / 新規:{new_count}件 スキップ:{skip_count}件 ===")


if __name__ == "__main__":
    main()
