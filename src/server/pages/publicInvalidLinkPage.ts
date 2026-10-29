/**
 * ── صفحةُ الرابط غير الصالح ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { PUBLIC_LIGHT_VARS } from "../publicTheme";

/** بابُ الأستاذ. رابطٌ واحدٌ لشخصٍ واحد، ولا شيء خلفه إلا جدولُه هو. */
/** صفحةُ «الرابط غير صالح» العامة: هويةٌ واحدة لكل الروابط العامة (عرضٌ فقط). */
export function publicInvalidLinkPage(message: string): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SCHEDULE</title><link rel="icon" href="/schedule-icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/schedule-icon-192.png"><style>@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:400;font-display:swap;src:url("/fonts/plex-arabic-arabic-400.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:700;font-display:swap;src:url("/fonts/plex-arabic-arabic-700.woff2") format("woff2")}:root{${PUBLIC_LIGHT_VARS}}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:0 24px;box-sizing:border-box;background:var(--bg);color:var(--ink);font:400 16px/1.7 "Plex Arabic",-apple-system,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;font-synthesis:none;text-align:center}.brand{font:600 13px/1 system-ui;letter-spacing:.24em;color:var(--brass);margin-bottom:12px}p{margin:0;font-size:15px;color:var(--muted)}</style></head><body><div><div class="brand">SCHEDULE</div><p>${message}</p></div></body></html>`;
}
