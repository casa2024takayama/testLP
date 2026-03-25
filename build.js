const fs = require("fs");
const path = require("path");

// Load config and redirects
const config = JSON.parse(fs.readFileSync("config.json", "utf-8"));
const data = JSON.parse(fs.readFileSync("redirects.json", "utf-8"));

const outputDir = "public";

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// HTML template for each redirect page
function generateHTML(entry) {
  return `<!DOCTYPE html>
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

  <script>
  // Push custom event to dataLayer for GA4
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: 'link_click_redirect',
    link_slug: '${entry.slug}',
    link_tag: '${entry.tag}',
    link_label: '${entry.label}',
    link_destination: '${entry.destination}'
  });

  // Wait for GTM to load and send beacon, then redirect
  function doRedirect() {
    // Use sendBeacon as fallback to ensure GA4 event is sent
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        'https://www.google-analytics.com/g/collect?v=2&tid=${config.ga4_measurement_id}&cid=' +
        (Math.random().toString(36).substring(2)) +
        '&en=link_click_redirect' +
        '&ep.link_slug=${entry.slug}' +
        '&ep.link_tag=${entry.tag}'
      );
    }
    window.location.href = '${entry.destination}';
  }

  // Redirect after a short delay to allow GTM tag to fire
  setTimeout(doRedirect, 800);
  </script>

  <style>
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #f4f7fa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #666;
    }
    .loader {
      text-align: center;
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #e0e0e0;
      border-top-color: #028090;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 12px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
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

  <!-- Fallback for no-JS -->
  <noscript>
    <meta http-equiv="refresh" content="0;url=${entry.destination}">
    <p><a href="${entry.destination}">こちらをクリック</a></p>
  </noscript>
</body>
</html>`;
}

// Generate index page (list of all redirects for admin reference)
function generateIndex() {
  const rows = data.redirects
    .map(
      (e) =>
        `<tr>
      <td><a href="${config.base_url}/r/${e.slug}/">${e.slug}</a></td>
      <td>${e.tag}</td>
      <td>${e.label}</td>
      <td><a href="${e.destination}" target="_blank">${e.destination}</a></td>
    </tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="robots" content="noindex, nofollow">
  <title>Link Tracker - Admin</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 960px; margin: 40px auto; padding: 0 20px; color: #1a2332; }
    h1 { color: #065A82; border-bottom: 2px solid #028090; padding-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background: #065A82; color: white; padding: 10px 12px; text-align: left; }
    td { padding: 8px 12px; border-bottom: 1px solid #e0e0e0; }
    tr:hover { background: #f4f7fa; }
    a { color: #028090; }
    .info { background: #f4f7fa; padding: 12px 16px; border-radius: 6px; margin-top: 16px; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <h1>Link Tracker - 管理用一覧</h1>
  <div class="info">
    登録リンク数: ${data.redirects.length}件 ｜ 
    GTM: <code>${config.gtm_container_id}</code> ｜ 
    GA4: <code>${config.ga4_measurement_id}</code>
  </div>
  <table>
    <thead>
      <tr><th>スラッグ</th><th>タグ</th><th>ラベル</th><th>転送先</th></tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;
}

// Build all pages
let count = 0;
for (const entry of data.redirects) {
  const dir = path.join(outputDir, "r", entry.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), generateHTML(entry));
  count++;
}

// Build admin index
fs.writeFileSync(path.join(outputDir, "index.html"), generateIndex());

console.log(`✅ Built ${count} redirect pages + admin index → ${outputDir}/`);
