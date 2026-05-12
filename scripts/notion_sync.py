"""
notion_sync.py
redirects.json の内容を Notion UTMリンク管理DBに同期するスクリプト。
- QRに設定するURL をキーに重複チェック
- 未登録のエントリのみ新規登録（既存レコードは上書きしない）
- 実行ログを標準出力に出力
- Notion API の一時障害（504 等）に対してリトライする
"""

import json
import os
import random
import time

import requests

NOTION_API_KEY = os.environ["NOTION_API_KEY"]
DATABASE_ID = os.environ["NOTION_DATABASE_ID"]

HEADERS = {
    "Authorization": f"Bearer {NOTION_API_KEY}",
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
}

# (connect秒, read秒) — DB query が重いと Notion 側が遅延することがある
NOTION_TIMEOUT = (30, 120)
RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})
MAX_HTTP_ATTEMPTS = 6
BASE_DELAY_SEC = 3.0


def notion_post(url, json_body, session=None):
    """Notion API への POST。429 / 5xx / タイムアウト時は指数バックオフで再試行する。"""
    sess = session if session is not None else requests
    last_response = None

    for attempt in range(1, MAX_HTTP_ATTEMPTS + 1):
        try:
            res = sess.post(url, headers=HEADERS, json=json_body, timeout=NOTION_TIMEOUT)
            last_response = res

            if res.status_code in RETRYABLE_STATUS:
                if attempt >= MAX_HTTP_ATTEMPTS:
                    res.raise_for_status()
                delay = BASE_DELAY_SEC * (2 ** (attempt - 1)) + random.uniform(0, 2)
                if res.status_code == 429:
                    ra = res.headers.get("Retry-After")
                    if ra:
                        try:
                            delay = float(ra)
                        except ValueError:
                            pass
                print(
                    f"  [RETRY] HTTP {res.status_code} … {delay:.1f}s 待機 ({attempt}/{MAX_HTTP_ATTEMPTS})"
                )
                time.sleep(delay)
                continue

            res.raise_for_status()
            return res

        except requests.Timeout:
            if attempt >= MAX_HTTP_ATTEMPTS:
                raise
            delay = BASE_DELAY_SEC * (2 ** (attempt - 1)) + random.uniform(0, 2)
            print(f"  [RETRY] タイムアウト, {delay:.1f}s 待機 ({attempt}/{MAX_HTTP_ATTEMPTS})")
            time.sleep(delay)

        except requests.ConnectionError:
            if attempt >= MAX_HTTP_ATTEMPTS:
                raise
            delay = BASE_DELAY_SEC * (2 ** (attempt - 1)) + random.uniform(0, 2)
            print(f"  [RETRY] 接続エラー, {delay:.1f}s 待機 ({attempt}/{MAX_HTTP_ATTEMPTS})")
            time.sleep(delay)

    if last_response is not None:
        last_response.raise_for_status()
    raise RuntimeError("notion_post: unexpected failure without response")


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


def fetch_existing_urls(session=None):
    """Notion DBに登録済みのQR URLセットを取得（重複チェック用）"""
    existing = set()
    url = f"https://api.notion.com/v1/databases/{DATABASE_ID}/query"
    payload = {"page_size": 100}

    while True:
        res = notion_post(url, payload, session=session)
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


def register_entry(entry, qr_url, session=None):
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

    res = notion_post(
        "https://api.notion.com/v1/pages",
        payload,
        session=session,
    )
    return res.json().get("url")


def main():
    print("=== Notion UTM Sync 開始 ===")

    redirects = load_redirects()
    print(f"redirects.json: {len(redirects)} 件")

    with requests.Session() as session:
        existing_urls = fetch_existing_urls(session=session)
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
                notion_url = register_entry(entry, qr_url, session=session)
                print(f"  [OK] 登録完了: {entry.get('slug', '?')} → {notion_url}")
                new_count += 1
            except Exception as e:
                print(f"  [ERROR] 登録失敗: {entry.get('slug', '?')} / {e}")

    print(f"\n=== 完了 / 新規:{new_count}件 スキップ:{skip_count}件 ===")


if __name__ == "__main__":
    main()
