const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/** スクリプト置き場所＝リポジトリルート（cwd に依存しない） */
const REPO_ROOT = __dirname;
const outputDir = path.join(REPO_ROOT, "public");
const PATH_PREFIX = "dev";

const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "config.json"), "utf-8"));
const data = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "redirects.json"), "utf-8"));

function loadReleaseVersion() {
  const versionPath = path.join(REPO_ROOT, "version.json");
  try {
    const raw = fs.readFileSync(versionPath, "utf-8");
    const v = JSON.parse(raw);
    if (v.version && typeof v.version === "string") return v.version.trim();
  } catch (_) {}
  console.warn("⚠️  version.json が無いか無効です。0.0.0 を使います。");
  return "0.0.0";
}

function resolveGitSha() {
  const gh = process.env.GITHUB_SHA;
  if (gh && gh.length >= 7) return gh.slice(0, 7);
  const custom = process.env.BUILD_SHA;
  if (custom && custom.length >= 7) return custom.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8", cwd: REPO_ROOT }).trim();
  } catch (_) {
    return "";
  }
}

function buildReleaseMeta() {
  const version = loadReleaseVersion();
  const gitSha = resolveGitSha();
  const builtAt = new Date().toISOString();
  return { version, gitSha, builtAt };
}

const releaseMeta = buildReleaseMeta();

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

/** 静的 HTML にもリダイレクトページと同形式のビルドスタンプを付与（再ビルドで古いコメントは置換） */
function withBuildStampComment(html, meta) {
  const stamp = `link-tracker v${meta.version}${meta.gitSha ? ` ${meta.gitSha}` : ""} ${meta.builtAt}`;
  const stripped = html.replace(/^<!--\s*link-tracker v[\s\S]*?-->\s*\n?/, "");
  return `<!-- ${stamp} -->\n${stripped}`;
}

function buildDestination(entry) {
  let url = entry.destination;
  if (entry.utm) {
    const params = new URLSearchParams();
    if (entry.utm.source) params.set("utm_source", entry.utm.source);
    if (entry.utm.medium) params.set("utm_medium", entry.utm.medium);
    if (entry.utm.campaign) params.set("utm_campaign", entry.utm.campaign);
    if (entry.utm.content) params.set("utm_content", entry.utm.content);
    if (entry.utm.term) params.set("utm_term", entry.utm.term);
    const qs = params.toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }
  return url;
}

function generateHTML(entry, meta) {
  const dest = buildDestination(entry);
  const safeLabel = entry.label.replace(/'/g, "\\'");
  const safeDest = dest.replace(/'/g, "\\'");
  const buildStamp = `link-tracker v${meta.version}${meta.gitSha ? ` ${meta.gitSha}` : ""} ${meta.builtAt}`;

  const utmParams = entry.utm ? `,
    utm_source: '${entry.utm.source || ""}',
    utm_medium: '${entry.utm.medium || ""}',
    utm_campaign: '${entry.utm.campaign || ""}',
    utm_content: '${entry.utm.content || ""}'` : "";

  return `<!-- ${buildStamp} -->
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="robots" content="noindex, nofollow">
  <title>Redirecting...</title>

  <!-- Google Tag Manager -->
  <script>
  (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','${config.gtm_container_id}');
  </script>
  <!-- End Google Tag Manager -->

  <!-- Google tag (gtag.js) - GA4 direct -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${config.ga4_measurement_id}"></script>
  <script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${config.ga4_measurement_id}');
  gtag('event', 'link_click_redirect', {
    link_slug: '${entry.slug}',
    link_tag: '${entry.tag}',
    link_label: '${safeLabel}',
    link_destination: '${safeDest}'${utmParams}
  });
  </script>

  <script>
  // Also push to dataLayer for GTM
  window.dataLayer.push({
    event: 'link_click_redirect',
    link_slug: '${entry.slug}',
    link_tag: '${entry.tag}',
    link_label: '${safeLabel}',
    link_destination: '${safeDest}'
  });

  function doRedirect() {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        'https://www.google-analytics.com/g/collect?v=2&tid=${config.ga4_measurement_id}&cid=' +
        (Math.random().toString(36).substring(2)) +
        '&en=link_click_redirect' +
        '&ep.link_slug=${entry.slug}' +
        '&ep.link_tag=${entry.tag}'
      );
    }
    window.location.href = '${dest}';
  }

  setTimeout(doRedirect, 800);
  </script>

  <style>
    body { display:flex; justify-content:center; align-items:center; min-height:100vh; margin:0; background:#f4f7fa; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:#666; }
    .loader { text-align:center; }
    .spinner { width:32px; height:32px; border:3px solid #e0e0e0; border-top-color:#028090; border-radius:50%; animation:spin .8s linear infinite; margin:0 auto 12px; }
    @keyframes spin { to{transform:rotate(360deg)} }
  </style>
</head>
<body>
  <!-- Google Tag Manager (noscript) -->
  <noscript>
    <iframe src="https://www.googletagmanager.com/ns.html?id=${config.gtm_container_id}"
      height="0" width="0" style="display:none;visibility:hidden"></iframe>
  </noscript>
  <!-- End Google Tag Manager (noscript) -->

  <div class="loader">
    <div class="spinner"></div>
    <p>リダイレクト中...</p>
  </div>

  <noscript>
    <meta http-equiv="refresh" content="0;url=${dest}">
    <p><a href="${dest}">こちらをクリック</a></p>
  </noscript>
</body>
</html>`;
}

function getMode(entry) {
  return entry.mode === "direct" ? "direct" : "redirect";
}

function generateIndex(meta) {
  const redirectEntries = data.redirects.filter((e) => getMode(e) === "redirect");
  const directEntries = data.redirects.filter((e) => getMode(e) === "direct");

  const redirectRows = redirectEntries.map((e) => {
    const p = `${PATH_PREFIX}/${e.slug}`;
    const dest = buildDestination(e);
    const shortUrl = `${config.base_url}/${p}/`;
    return `<tr>
      <td><a href="${shortUrl}">${p}</a> <button class="copy" data-copy="${shortUrl}">コピー</button></td>
      <td>${e.tag}</td>
      <td>${e.label}</td>
      <td><a href="${dest}" target="_blank">${dest}</a></td>
    </tr>`;
  }).join("\n");

  const directRows = directEntries.map((e) => {
    const dest = buildDestination(e);
    return `<tr>
      <td>${e.slug}</td>
      <td>${e.tag}</td>
      <td>${e.label}</td>
      <td><a href="${dest}" target="_blank">${dest}</a> <button class="copy" data-copy="${dest}">コピー</button></td>
    </tr>`;
  }).join("\n");

  const redirectSection = redirectEntries.length ? `
  <h2>リダイレクト経由（短縮URL + GA4計測）</h2>
  <p class="note">外部に出すのは <code>パス</code> 欄の短縮URL。クリック時に <code>link_click_redirect</code> を送信し、その後 <code>転送先</code> へ遷移します。</p>
  <table>
    <thead><tr><th>パス（共有用）</th><th>タグ</th><th>ラベル</th><th>転送先（UTM付き）</th></tr></thead>
    <tbody>${redirectRows}</tbody>
  </table>` : "";

  const directSection = directEntries.length ? `
  <h2>直接掲載（UTMのみ・転送なし）</h2>
  <p class="note">外部ページ → <strong>自社サイト直リンク</strong>用。リダイレクトHTMLは生成されません。掲載先には <code>転送先（UTM付き）</code> をそのまま貼り付けます（自社サイト側 GA4 で計測）。</p>
  <table>
    <thead><tr><th>識別子（slug）</th><th>タグ</th><th>ラベル</th><th>掲載用URL（UTM付き）</th></tr></thead>
    <tbody>${directRows}</tbody>
  </table>` : "";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="robots" content="noindex, nofollow">
  <title>Link Tracker - Admin</title>
  <style>
    body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; max-width:1040px; margin:40px auto; padding:0 20px; color:#1a2332; }
    .page-head { display:flex; align-items:baseline; justify-content:space-between; flex-wrap:wrap; gap:12px 16px; border-bottom:2px solid #028090; padding-bottom:8px; margin-bottom:0; }
    .page-head h1 { margin:0; color:#065A82; font-size:1.75em; line-height:1.2; }
    .release-near-title { margin:0; font-size:14px; color:#666; font-family:ui-monospace,monospace; }
    .release-near-title strong { color:#028090; }
    .release-near-title code { font-size:13px; background:#f0f4f7; padding:2px 6px; border-radius:4px; }
    h2 { color:#065A82; margin-top:32px; font-size:18px; }
    table { width:100%; border-collapse:collapse; margin-top:12px; font-size:13px; }
    th { background:#065A82; color:white; padding:10px 12px; text-align:left; }
    td { padding:8px 12px; border-bottom:1px solid #e0e0e0; word-break:break-all; vertical-align:top; }
    tr:hover { background:#f4f7fa; }
    a { color:#028090; }
    .info { background:#f4f7fa; padding:12px 16px; border-radius:6px; margin-top:16px; font-size:14px; color:#666; }
    .note { font-size:13px; color:#666; margin-top:4px; }
    .tool-link { margin-top:16px; }
    .tool-link a { background:#028090; color:white; padding:8px 16px; border-radius:6px; text-decoration:none; font-size:14px; }
    .tool-link a:hover { background:#065A82; }
    button.copy { font-size:11px; background:#e8eef2; border:1px solid #cdd6df; border-radius:4px; padding:2px 8px; cursor:pointer; margin-left:6px; }
    button.copy:hover { background:#d5dee6; }
    button.copy.done { background:#02C39A; color:white; border-color:#02C39A; }
    footer.build-meta { margin-top:48px; padding-top:16px; border-top:1px solid #e0e0e0; font-size:12px; color:#888; font-family:ui-monospace,monospace; }
  </style>
</head>
<body>
  <div class="page-head">
    <h1>Link Tracker - 管理用一覧</h1>
    <p class="release-near-title">リリース <strong>v${meta.version}</strong>${meta.gitSha ? ` · <code>${meta.gitSha}</code>` : ""}</p>
  </div>
  <div class="info">
    登録リンク数: ${data.redirects.length}件（リダイレクト ${redirectEntries.length} ／ 直接 ${directEntries.length}）
    ｜ GTM: <code>${config.gtm_container_id}</code> ｜ GA4: <code>${config.ga4_measurement_id}</code>
  </div>
  <div class="tool-link">
    <a href="${config.base_url}/utm-generator.html">UTM Link Generator を開く</a>
    <a href="${config.base_url}/manual.html" style="margin-left:8px;">操作マニュアル</a>
    <a href="${config.base_url}/usecase-guide.html" style="margin-left:8px;">ユースケースガイド</a>
  </div>
  ${redirectSection}
  ${directSection}
  <script>
    document.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button.copy');
      if (!btn) return;
      const text = btn.getAttribute('data-copy');
      navigator.clipboard.writeText(text).then(() => {
        btn.classList.add('done');
        const original = btn.textContent;
        btn.textContent = 'コピー済';
        setTimeout(() => { btn.classList.remove('done'); btn.textContent = original; }, 1200);
      });
    });
  </script>
  <footer class="build-meta">
    リリース <strong>v${meta.version}</strong>
    ${meta.gitSha ? ` · commit <code>${meta.gitSha}</code>` : ""}
    · ビルド時刻 ${meta.builtAt}
    · <a href="${config.base_url}/version.json"><code>version.json</code></a>（生成物）
  </footer>
</body>
</html>`;
}

// Build redirect pages (skip direct-mode entries)
let count = 0;
let directCount = 0;
let skippedDirect = 0;
for (const entry of data.redirects) {
  if (getMode(entry) === "direct") {
    if (!entry.utm) {
      console.warn(`⚠️  direct モードだが utm が未設定のためスキップ: ${entry.slug}`);
      skippedDirect++;
      continue;
    }
    directCount++;
    continue;
  }
  const pagePath = `${PATH_PREFIX}/${entry.slug}`;
  const dir = path.join(outputDir, pagePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), generateHTML(entry, releaseMeta));
  count++;
}

// Copy static files
const staticFiles = ["utm-generator.html", "manual.html", "usecase-guide.html"];
for (const file of staticFiles) {
  const src = path.join(REPO_ROOT, file);
  if (fs.existsSync(src)) {
    const raw = fs.readFileSync(src, "utf-8");
    fs.writeFileSync(path.join(outputDir, file), withBuildStampComment(raw, releaseMeta));
    console.log(`✅ Copied ${file}`);
  }
}

fs.writeFileSync(
  path.join(outputDir, "version.json"),
  JSON.stringify(
    {
      version: releaseMeta.version,
      git_sha: releaseMeta.gitSha || null,
      built_at: releaseMeta.builtAt,
    },
    null,
    2
  ) + "\n"
);

fs.writeFileSync(path.join(outputDir, "index.html"), generateIndex(releaseMeta));
console.log(
  `📌 Release v${releaseMeta.version}${releaseMeta.gitSha ? ` (${releaseMeta.gitSha})` : ""} · ${releaseMeta.builtAt}`
);
console.log(`✅ Built ${count} redirect pages, ${directCount} direct links (admin index) → ${outputDir}/`);
if (skippedDirect) {
  console.log(`   (direct モードで utm 未設定のため除外: ${skippedDirect} 件)`);
}
