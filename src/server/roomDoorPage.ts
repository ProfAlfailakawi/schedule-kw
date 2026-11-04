/**
 * ── صفحتا الباب: القاعة، ولوحةُ المبنى ──────────────────────────────────────
 *
 * صفحةٌ يفتحها طالبٌ بمسح الملصق على هاتفه، والصفحةُ نفسُها في «وضع الشاشة»
 * (‎?screen=1‎) على تلفازٍ في الممر: داكنة، بخطٍّ كبير، وساعة، وبلا تمرير، تُبقي
 * الشاشةَ مستيقظة (Wake Lock) وتعيد تحميل نفسها حين يُنشر إصدارٌ جديد.
 *
 * الحالُ تُحسب في المتصفّح كل دقيقة بالنصّ نفسه الذي يحسبها في الخادم
 * (ROOM_DOOR_ENGINE_SCRIPT)، من بياناتٍ تُجلب كل ستين ثانية. فإن انقطعت الشبكة
 * بقيت الشاشةُ صادقة: المحاضرةُ التي انتهت لا تبقى «مشغولة».
 *
 * السكربتُ ES5 عادي (شاشاتُ الممرات أجهزةٌ قديمة أحياناً): لا علامةَ اقتباسٍ
 * مائلة ولا ‎${‎ داخله، فالنصُّ قالبٌ في الخادم.
 */
import { ARABIC_COUNT_SCRIPT, AR, countOf } from "../utils/arabicCount";
import {
  DOOR_DAY_NAMES, DOOR_MONTH_NAMES, ROOM_DOOR_ENGINE_SCRIPT,
  doorClockAt, doorDateLabel, doorSentence, doorStatusAt, doorViewAt,
} from "../utils/roomDoor";
import { PUBLIC_FONT_FACES } from "./publicKit";
import { PUBLIC_DARK_VARS, PUBLIC_LIGHT_VARS, PUBLIC_THEME_COLOR } from "./publicTheme";
import type { BoardDoorData, RoomDoorData } from "./roomDoorData";

export interface DoorPageOptions {
  nonce: string;
  /** وضعُ شاشة الممر. */
  screen: boolean;
  /** مسارُ البيانات الحيّة (JSON) الذي يُسأل كل دقيقة. */
  live: string;
  /** مسارُ الصفحة نفسها (بلا ‎?screen‎) لرابط «افتح على شاشة». */
  self: string;
}

const esc = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
/** نصٌّ يدخل السكربت: JSON، ولا يُغلق الوسم، ولا يكسره فاصلُ سطرٍ يونيكودي في متصفّحٍ قديم. */
const scriptJson = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/* أيقوناتٌ بخطّ الواجهة نفسه (lucide)، معرّفةٌ مرّة وتُستعمل بـ<use>. */
const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<symbol id="i-free" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m8.5 12.5 2.5 2.5 5-5.5"/></symbol>
<symbol id="i-busy" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></symbol>
<symbol id="i-soon" viewBox="0 0 24 24"><path d="M5 22h14M5 2h14M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/></symbol>
<symbol id="i-weekend" viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></symbol>
<symbol id="i-outside" viewBox="0 0 24 24"><path d="M4.2 4.2A2 2 0 0 0 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 1.82-1.18M21 15.5V6a2 2 0 0 0-2-2H9.5M16 2v4M3 10h7M21 10h-5.5M2 2l20 20"/></symbol>
<symbol id="i-door" viewBox="0 0 24 24"><path d="M13 4h3a2 2 0 0 1 2 2v14M2 20h3M13 20h9M10 12v.01"/><path d="M13 4.56v16.16a1 1 0 0 1-1.24.97L5 20V5.56a2 2 0 0 1 1.52-1.94l4-1A2 2 0 0 1 13 4.56Z"/></symbol>
<symbol id="i-building" viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/></symbol>
<symbol id="i-next" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></symbol>
<symbol id="i-today" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></symbol>
<symbol id="i-week" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></symbol>
<symbol id="i-cancel" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></symbol>
<symbol id="i-floor" viewBox="0 0 24 24"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65M22 12.65l-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></symbol>
<symbol id="i-screen" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></symbol>
<symbol id="i-offline" viewBox="0 0 24 24"><path d="M12 20h.01M8.5 16.43a5 5 0 0 1 7 0M5 12.86a10 10 0 0 1 5.17-2.69M19 12.86a10 10 0 0 0-2.01-1.52M2 8.82a15 15 0 0 1 4.18-2.64M22 8.82a15 15 0 0 0-11.29-3.76M2 2l20 20"/></symbol>
</defs></svg>`;

const icon = (name: string, cls = "i") => `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}" xlink:href="#i-${name}"></use></svg>`;

const CSS = String.raw`
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;min-height:100vh;background:radial-gradient(120% 60% at 100% 0,var(--glow) 0,transparent 58%),var(--bg);color:var(--ink);font-family:"Plex Arabic",-apple-system,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;font-synthesis:none;line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:inherit}
.i{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.ltr{direction:ltr;unicode-bidi:isolate}
.app{max-width:1120px;margin:0 auto;padding:max(14px,env(safe-area-inset-top)) 16px max(28px,env(safe-area-inset-bottom))}
.top{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:34px}
.mark{font:600 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.28em;color:var(--brass)}
.pill{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;background:var(--card);border:1px solid var(--line);font-size:12.5px;color:var(--muted);white-space:nowrap;max-width:62vw;overflow:hidden;text-overflow:ellipsis}
.pill .i{width:15px;height:15px;color:var(--accent)}
.clock{display:none}
/* ── لوحة الباب ── */
.ident{display:flex;align-items:center;gap:14px;margin:14px 0 16px}
.plate{flex:none;display:grid;justify-items:center;gap:0;min-width:96px;padding:9px 16px 11px;border-radius:18px;background:linear-gradient(160deg,#1f6b5c,#134a3f);color:#fff;box-shadow:0 14px 30px -18px rgba(19,74,63,.9),inset 0 1px 0 rgba(255,255,255,.18)}
.plate small{font-size:11.5px;opacity:.82;letter-spacing:.02em}
.plate b{font-size:34px;line-height:1.05;font-weight:700;letter-spacing:.01em;direction:ltr;unicode-bidi:isolate}
.where{display:grid;gap:2px;min-width:0}
.where .bl{display:flex;align-items:center;flex-wrap:wrap;gap:6px 8px;font-weight:700;font-size:16px}
.where .bl .i{width:18px;height:18px;color:var(--accent)}
.where .code{font-size:13px;font-weight:600;color:var(--muted);direction:ltr;unicode-bidi:isolate}
.where small{color:var(--muted);font-size:12.5px;line-height:1.5}
/* ── الحال ── */
.st-free{--st:var(--free);--st-s:var(--free-s);--st-i:var(--free-i)}
.st-busy{--st:var(--busy);--st-s:var(--busy-s);--st-i:var(--busy-i)}
.st-soon{--st:var(--soon);--st-s:var(--soon-s);--st-i:var(--soon-i)}
.st-weekend,.st-outside{--st:var(--off);--st-s:var(--off-s);--st-i:var(--off-i)}
.door-grid{display:grid;gap:14px}
.col{display:grid;gap:14px;align-content:start;min-width:0}
.hero{position:relative;overflow:hidden;display:grid;justify-items:center;gap:10px;padding:22px 16px 20px;border-radius:28px;background:var(--card);border:1px solid var(--line);box-shadow:var(--shadow);text-align:center}
.hero::before{content:"";position:absolute;inset:0;background:radial-gradient(85% 70% at 50% 0,var(--st-s),transparent 72%);pointer-events:none}
.hero>*{position:relative}
.ring{position:relative;width:236px;height:236px;width:min(236px,64vw);height:min(236px,64vw)}
.ring svg{display:block;width:100%;height:100%;transform:rotate(-90deg)}
.ring .trk{fill:none;stroke:var(--track);stroke-width:8}
.ring .arc{fill:none;stroke:var(--st);stroke-width:8;stroke-linecap:round;transition:stroke-dasharray .9s cubic-bezier(.2,.7,.2,1)}
.ring .halo{fill:var(--card);stroke:none}
.ring-c{position:absolute;top:0;right:0;bottom:0;left:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:16%}
.ring-ico{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--st-s);color:var(--st);margin-bottom:4px}
.ring-ico .i{width:21px;height:21px}
.ring-word{font-size:30px;line-height:1.2;font-weight:700;color:var(--st-i)}
.ring-big{font-size:21px;line-height:1.25;font-weight:700;color:var(--ink);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ring-big.count{font-size:52px;line-height:1;color:var(--st-i)}
.ring-big.count small{font-size:20px;margin-inline-start:4px}
.ring-sub{font-size:14.5px;font-weight:600;color:var(--muted)}
.ring-sub time,.ring-sub bdi{color:var(--ink);font-weight:700}
.hero-meta{display:grid;gap:6px;justify-items:center;max-width:100%}
.course{margin:0;font-size:15px;font-weight:600;line-height:1.55;color:var(--ink);max-width:100%}
.course small{color:var(--muted);font-weight:600}
.tag{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:999px;font-size:12.5px;font-weight:700;background:var(--off-s);color:var(--off-i)}
.tag .i{width:15px;height:15px}
.tag.cancel{background:var(--busy-s);color:var(--busy-i)}
@keyframes breathe{0%,100%{opacity:1}50%{opacity:.55}}
.st-soon .ring-ico,.st-busy .ring-ico{animation:breathe 2.4s ease-in-out infinite}
/* ── البطاقات ── */
.card{padding:16px;border-radius:var(--r);background:var(--card);border:1px solid var(--line);box-shadow:var(--shadow);min-width:0}
.card h2{display:flex;align-items:center;gap:10px;margin:0 0 12px;font-size:16px;line-height:1.4}
.card h2 .b{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);flex:none}
.card h2 .b .i{width:18px;height:18px}
.card h2 small{margin-inline-start:auto;font-size:12.5px;font-weight:600;color:var(--muted)}
.next{display:flex;align-items:center;gap:12px}
.next .b{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);flex:none}
.next .txt{display:grid;gap:1px;min-width:0;flex:1}
.next small{font-size:12px;color:var(--muted);font-weight:600}
.next b{font-size:15.5px;line-height:1.45}
.next .when{flex:none;display:grid;justify-items:end;gap:0;font-weight:700;font-size:15px;direction:ltr}
.next .when span{font-size:11.5px;color:var(--muted);direction:rtl}
/* ── الخط الزمني ── */
.tl{position:relative;margin:4px 1px 0}
.tl-track{position:relative;height:50px;border-radius:13px;background:var(--soft);overflow:hidden}
.tl-h{position:absolute;top:0;bottom:0;width:1px;background:var(--line)}
.tl-b{position:absolute;top:7px;bottom:7px;border-radius:9px;background:var(--accent-soft);color:var(--accent);border:1px solid rgba(31,107,92,.18);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;overflow:hidden;white-space:nowrap;direction:ltr;min-width:3px}
.tl-b.now{background:var(--busy);border-color:var(--busy);color:#fff}
.tl-b.past{opacity:.45}
.tl-b.off{background:repeating-linear-gradient(135deg,transparent 0 5px,var(--off-s) 5px 10px);border:1px dashed var(--off);color:var(--off-i)}
.tl-now{position:absolute;top:-7px;bottom:-7px;width:0;border-right:2px solid var(--ink);z-index:2}
.tl-now::before{content:"";position:absolute;top:-5px;right:-6px;width:10px;height:10px;border-radius:50%;background:var(--ink);box-shadow:0 0 0 3px var(--card)}
.tl-lb{position:relative;height:18px;margin-top:5px;font-size:11px;color:var(--muted);direction:ltr}
.tl-lb span{position:absolute;top:0}
.agenda{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:8px}
.agenda li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;border:1px solid var(--line);background:var(--card2)}
.agenda time{font-size:12.5px;font-weight:700;direction:ltr;color:var(--muted);line-height:1.35;text-align:center}
.agenda .what{display:grid;min-width:0}
.agenda .what b{font-size:14px;line-height:1.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.agenda .what small{font-size:12px;color:var(--muted)}
.agenda em{font-style:normal;font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:999px;background:var(--soft);color:var(--muted);white-space:nowrap}
.agenda li.now{border-color:var(--busy);background:var(--busy-s)}
.agenda li.now em{background:var(--busy);color:#fff}
.agenda li.past{opacity:.55}
.agenda li.off{background:repeating-linear-gradient(135deg,var(--card2) 0 7px,var(--off-s) 7px 14px)}
.agenda li.off em{background:var(--busy-s);color:var(--busy-i)}
.empty{display:flex;align-items:center;gap:12px;padding:12px 4px;color:var(--muted);font-size:14px}
.empty .i{width:26px;height:26px;color:var(--free)}
/* ── الأسبوع ── */
.wk{display:grid;gap:9px}
.wk-row{display:grid;grid-template-columns:62px minmax(0,1fr);align-items:center;gap:10px}
.wk-row>b{font-size:13px;font-weight:700;color:var(--muted)}
.wk-bar{position:relative;height:24px;border-radius:8px;background:var(--soft);overflow:hidden}
.wk-bar i{position:absolute;top:4px;bottom:4px;border-radius:5px;background:var(--accent);opacity:.78;min-width:3px}
.wk-bar i.off{background:repeating-linear-gradient(135deg,transparent 0 4px,var(--off) 4px 6px);opacity:.6}
.wk-row.today>b{color:var(--accent)}
.wk-row.today .wk-bar{box-shadow:0 0 0 2px var(--accent)}
.wk-row.past{opacity:.5}
.wk-now{position:absolute;top:0;bottom:0;width:0;border-right:2px solid var(--ink)}
.foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-top:16px;font-size:12.5px;color:var(--muted)}
.foot a{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border-radius:999px;background:var(--card);border:1px solid var(--line);color:var(--ink);font-weight:700;text-decoration:none}
.foot a .i{width:18px;height:18px;color:var(--accent)}
.live{display:inline-flex;align-items:center;gap:7px}
.live i{width:8px;height:8px;border-radius:50%;background:var(--free);box-shadow:0 0 0 3px var(--free-s)}
.live.lost i{background:var(--busy);box-shadow:0 0 0 3px var(--busy-s)}
.ssr{margin:6px 0 0;padding:28px 16px;border-radius:28px;background:var(--card);border:1px solid var(--line);text-align:center;font-size:22px;font-weight:700;color:var(--st-i)}
/* ── لوحة المبنى ── */
.legend{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 6px}
.legend span{display:inline-flex;align-items:center;gap:8px;padding:6px 13px;border-radius:999px;background:var(--card);border:1px solid var(--line);font-weight:700;font-size:13px}
.legend i{width:10px;height:10px;border-radius:50%;background:var(--st)}
.legend b{font-size:15px;direction:ltr}
.banner{display:flex;align-items:center;gap:10px;margin:10px 0 0;padding:12px 14px;border-radius:16px;background:var(--off-s);color:var(--off-i);font-weight:700}
.floor h3{display:flex;align-items:center;gap:8px;margin:20px 2px 10px;font-size:14px;color:var(--muted)}
.floor h3 .i{width:17px;height:17px;color:var(--accent)}
.floor h3 small{font-weight:600}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.tile{position:relative;display:flex;flex-direction:column;gap:1px;padding:13px 16px 12px 14px;border-radius:18px;background:var(--card);border:1px solid var(--line);text-decoration:none;color:inherit;overflow:hidden;box-shadow:var(--shadow);min-width:0}
.tile::before{content:"";position:absolute;top:0;bottom:0;right:0;width:5px;background:var(--st)}
.tile .t-top{display:flex;align-items:center;justify-content:space-between;gap:6px}
.tile .t-code{font-size:25px;font-weight:700;line-height:1.2;direction:ltr;unicode-bidi:isolate}
.tile .t-dot{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--st-s);color:var(--st)}
.tile .t-dot .i{width:16px;height:16px}
.tile .t-state{font-weight:700;font-size:14px;color:var(--st-i)}
.tile .t-meta{font-size:12.5px;color:var(--muted);line-height:1.8;padding-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tile .t-bar{height:4px;border-radius:4px;background:var(--track);margin-top:9px;overflow:hidden}
.tile .t-bar i{display:block;height:100%;width:0;background:var(--st);border-radius:4px}
.tile:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
/* ── الحاسوب ── */
@media (min-width:900px){
 .app{padding-top:22px}
 .door-grid{grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:18px;align-items:start}
 .ring{width:270px;height:270px}
 .ring-word{font-size:34px}
 .plate b{font-size:40px}
 .tiles{grid-template-columns:repeat(auto-fill,minmax(min(170px,100%),1fr));gap:12px}
}
@media (max-width:360px){.plate{min-width:80px}.plate b{font-size:28px}}
@media (prefers-reduced-motion:reduce){.ring .arc{transition:none}.st-soon .ring-ico,.st-busy .ring-ico{animation:none}}
/* ── وضع الشاشة: تلفازُ الممر ── */
html.screen,html.screen body{height:100%;overflow:hidden}
html.screen body{cursor:none;background:radial-gradient(90% 70% at 100% 0,var(--glow) 0,transparent 60%),var(--bg)}
.screen .app{max-width:none;height:100vh;padding:2.6vh 2.6vw;display:flex;flex-direction:column;gap:2.4vh;transition:transform 1s}
.screen .top{min-height:0;flex:none}
.screen .mark{font-size:1.6vh}
.screen .pill{font-size:1.9vh;padding:.5vh 1.4vh;max-width:none}
.screen .clock{display:flex;align-items:baseline;gap:1.4vh}
.screen .clock b{font-size:6vh;line-height:1;font-weight:700;direction:ltr}
.screen .clock span{font-size:2.3vh;color:var(--muted);font-weight:600}
.screen .ident{margin:0;gap:2vw;flex:none}
.screen .plate{min-width:16vh;padding:1.2vh 2.6vh 1.6vh;border-radius:2.6vh}
.screen .plate small{font-size:1.9vh}
.screen .plate b{font-size:8vh}
.screen .where .bl{font-size:3.4vh}
.screen .where .bl .i{width:3.4vh;height:3.4vh}
.screen .where .code{font-size:2.2vh}
.screen .where small{font-size:2.1vh}
.screen #door{flex:1;min-height:0}
.screen .door-grid{height:100%;grid-template-columns:minmax(0,4.6fr) minmax(0,7.4fr);gap:2.4vw;align-items:stretch}
.screen .col{display:flex;flex-direction:column;gap:2.2vh;min-height:0}
.screen .col>.card{flex:none}
.screen .col:last-child>.card:last-child{flex:1 1 auto;display:flex;flex-direction:column}
.screen .col:last-child>.card:last-child .wk{flex:1;align-content:space-evenly}
.screen .hero{flex:1 1 auto;min-height:0;align-content:center;gap:1.6vh;padding:2.4vh 2vw;border-radius:3.4vh}
.screen .ring{width:40vh;height:40vh;max-width:28vw;max-height:28vw}
.screen .ring .trk,.screen .ring .arc{stroke-width:7}
.screen .ring-ico{width:6vh;height:6vh}
.screen .ring-ico .i{width:3.4vh;height:3.4vh}
.screen .ring-word{font-size:6.6vh}
.screen .ring-big{font-size:3.8vh}
.screen .ring-big.count{font-size:10vh}
.screen .ring-big.count small{font-size:3.6vh}
.screen .ring-sub{font-size:3vh}
.screen .course{font-size:3vh}
.screen .tag{font-size:2.2vh;padding:.6vh 1.6vh}
.screen .tag .i{width:2.4vh;height:2.4vh}
.screen .card{padding:2.2vh 1.8vw;border-radius:3vh}
.screen .card h2{font-size:2.8vh;margin-bottom:1.8vh}
.screen .card h2 .b{width:4.6vh;height:4.6vh;border-radius:1.4vh}
.screen .card h2 .b .i{width:2.6vh;height:2.6vh}
.screen .card h2 small{font-size:2.2vh}
.screen .next .b{width:6.4vh;height:6.4vh;border-radius:2vh}
.screen .next .b .i{width:3.4vh;height:3.4vh}
.screen .next small{font-size:2vh}
.screen .next b{font-size:3vh}
.screen .next .when{font-size:3.2vh}
.screen .next .when span{font-size:1.9vh}
.screen .tl-track{height:8vh;border-radius:2vh}
.screen .tl-b{top:1.1vh;bottom:1.1vh;font-size:1.9vh;border-radius:1.4vh}
.screen .tl-lb{height:3vh;font-size:2vh;margin-top:1vh}
.screen .tl-now{top:-1.2vh;bottom:-1.2vh;border-right-width:.4vh}
.screen .tl-now::before{width:1.8vh;height:1.8vh;top:-.9vh;right:-1.1vh}
.screen .agenda{display:none}
.screen .wk{gap:1.3vh}
.screen .wk-row{grid-template-columns:12vh minmax(0,1fr);gap:1.4vw}
.screen .wk-row>b{font-size:2.3vh}
.screen .wk-bar{height:3.8vh;border-radius:1.2vh}
.screen .wk-bar i{top:.7vh;bottom:.7vh;border-radius:.8vh}
.screen .foot{display:none}
.screen .empty{font-size:2.6vh}
.screen .empty .i{width:4vh;height:4vh}
.screen .legend span{font-size:2.2vh;padding:.8vh 1.8vh;gap:1.2vh}
.screen .legend i{width:1.5vh;height:1.5vh}
.screen .legend b{font-size:2.6vh}
.screen .banner{font-size:2.6vh;padding:1.6vh 2vh;border-radius:2vh;margin:0}
.screen .board{flex:1;min-height:0;display:flex;flex-direction:column;gap:1.8vh}
.screen .floor{display:contents}
.screen .floor h3{display:none}
.screen .tiles{flex:1;min-height:0;gap:1.3vh;grid-auto-rows:minmax(0,1fr);grid-template-columns:repeat(var(--cols,6),minmax(0,1fr))}
.screen .tile{--th:15vh;padding:calc(var(--th)*.1) calc(var(--th)*.16) calc(var(--th)*.08) calc(var(--th)*.12);border-radius:calc(var(--th)*.12);background:var(--st-s);border-color:transparent;justify-content:space-between;box-shadow:none}
.screen .tile::before{width:calc(var(--th)*.05)}
.screen .tile .t-code{font-size:calc(var(--th)*.3)}
.screen .tile .t-dot{width:calc(var(--th)*.2);height:calc(var(--th)*.2)}
.screen .tile .t-dot .i{width:calc(var(--th)*.12);height:calc(var(--th)*.12)}
.screen .tile .t-state{font-size:calc(var(--th)*.15)}
.screen .tile .t-meta{font-size:calc(var(--th)*.11);color:var(--ink);opacity:.82}
.screen .tile .t-bar{height:calc(var(--th)*.04);margin-top:calc(var(--th)*.05);background:rgba(255,255,255,.08)}
`;

/* ألوانُ الحال: لكل حالٍ لونٌ وتعبئةٌ ناعمة ولونُ نصٍّ يقرأ فوق البطاقة (النصُّ الصغير بأغمق الدرجات). */
const LIGHT_STATUS = [
  "--free:#1d7a58", "--free-s:#dcefe6", "--free-i:#17654a",
  "--busy:#c0392f", "--busy-s:#fbe3e0", "--busy-i:#a2302a",
  "--soon:#c7820f", "--soon-s:#fbeed6", "--soon-i:#8a5508",
  "--off:#6c7771", "--off-s:#eceeea", "--off-i:#56605b",
  "--track:#e8ebe6", "--glow:#dcece7", "--r:22px",
  "--shadow:0 1px 2px rgba(19,24,23,.05),0 12px 30px -20px rgba(19,24,23,.32)",
].join(";");
const DARK_STATUS = [
  "--free:#3fd89a", "--free-s:#10291f", "--free-i:#5be3ab",
  "--busy:#ff6b61", "--busy-s:#34130f", "--busy-i:#ff8d85",
  "--soon:#ffc24d", "--soon-s:#33260b", "--soon-i:#ffd27a",
  "--off:#8b9a93", "--off-s:#1a2421", "--off-i:#a9b6b0",
  "--track:#1f2b27", "--glow:#0f2a22",
  "--shadow:0 1px 2px rgba(0,0,0,.4),0 14px 34px -22px rgba(0,0,0,.8)",
].join(";");
/* الشاشةُ أعمقُ سواداً من الوضع الداكن العادي: التلفازُ في ممرٍّ مضاء، والأسودُ يُبرز الألوان. */
const SCREEN_VARS = `${PUBLIC_DARK_VARS};${DARK_STATUS};--bg:#060b0a;--card:#0d1513;--card2:#111a18;--soft:#141e1b;--line:#1c2824;--glow:#0c241d`;

function themeCss(screen: boolean): string {
  if (screen) return `:root{${SCREEN_VARS}}`;
  return `:root{${PUBLIC_LIGHT_VARS};${LIGHT_STATUS}}@media (prefers-color-scheme:dark){:root{${PUBLIC_DARK_VARS};${DARK_STATUS}}}`;
}

const CLIENT = String.raw`
(function(){
"use strict";
__ENGINE__
__COUNT__
var D=__DATA__,SCREEN=__SCREEN__,LIVE=__LIVE__,BUILD=__BUILD__;
var DAYS=__DAYS__,MONTHS=__MONTHS__,SECTION_WORD="شعبة";
var root=document.getElementById("door"),clockEl=document.getElementById("clk"),liveEl=document.getElementById("live"),app=document.getElementById("app");
var offset=D.at-Date.now(),fails=0,lastOk=Date.now(),reloading=false;
function now(){return Date.now()+offset}
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function hm(t){t=Math.max(0,Math.round(t));var h=Math.floor(t/60)%24,m=t%60;return(h<10?"0":"")+h+":"+(m<10?"0":"")+m}
function pos(t){return Math.max(0,Math.min(100,(t-480)/7.2))}
function ic(n,c){return '<svg class="'+(c||"i")+'" aria-hidden="true" focusable="false"><use href="#i-'+n+'" xlink:href="#i-'+n+'"></use></svg>'}
function dateLabel(date){var p=String(date||"").split("-");if(p.length<3)return "";var d=new Date(Date.UTC(+p[0],+p[1]-1,+p[2]));return DAYS[d.getUTCDay()]+" "+(+p[2])+" "+MONTHS[+p[1]-1]}
/* داخل كتلة الخط الزمني يتّسع الرمزُ القصير وحده (آخرُ ثلاث خانات، كما في شاشات الجدول). */
function shortCode(c){c=String(c||"");return /^\d{7}$/.test(c)?c.slice(-3):c}
function codeOf(l){return l.code?'<bdi class="ltr">'+esc(l.code)+'</bdi>':esc(l.title||"")}
function secOf(l){return l.sec?'<small>'+SECTION_WORD+" "+'<bdi class="ltr">'+esc(l.sec)+'</bdi></small>':""}
function ringSvg(fill){var C=2*Math.PI*52,f=Math.max(0,Math.min(1,fill));return '<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false"><circle class="halo" cx="60" cy="60" r="47"/><circle class="trk" cx="60" cy="60" r="52"/><circle class="arc" cx="60" cy="60" r="52" stroke-dasharray="'+(C*f).toFixed(2)+" "+C.toFixed(2)+'"/></svg>'}
function viewOf(d){return doorViewAt(d,now(),doorStatusAt,doorClockAt)}
/* ── صفحة القاعة ── */
function heroHtml(v){
 var st=v.status,l=null,word="",big="",sub="",fill=1,meta="",ico=v.state,bigCls="ring-big";
 if(v.state==="busy"){l=v.today[st.current];word="مشغولة";big=codeOf(l);sub='تنتهي <time class="ltr">'+hm(st.until)+'</time>';fill=st.left/Math.max(1,l.e-l.s)}
 else if(v.state==="soon"){l=v.today[st.next];word="تبدأ بعد";big='<span class="ltr">'+st.left+'</span><small>د</small>';bigCls="ring-big count";sub=codeOf(l);fill=st.left/Math.max(1,D.soon)}
 else if(v.state==="free"){word="فارغة";sub=st.until>=0?'حتى <time class="ltr">'+hm(st.until)+'</time>':"بقية اليوم";fill=st.until>=0?Math.min(1,st.left/60):1}
 else if(v.state==="weekend"){word="عطلة";sub="نهاية الأسبوع"}
 else{word="خارج الفصل";sub=v.termState==="before"&&D.term&&D.term.start?"يبدأ "+esc(dateLabel(D.term.start)):D.upcoming?"الفصل القادم "+esc(dateLabel(D.upcoming)):"لا محاضرات الآن"}
 if(l)meta+='<p class="course">'+esc(l.title||"")+(l.sec?" · "+secOf(l):"")+"</p>";
 if(v.cancelledNow)meta+='<span class="tag cancel">'+ic("cancel")+"أُلغيت اليوم · "+codeOf(v.cancelledNow)+"</span>";
 return '<section class="hero st-'+v.state+'" aria-label="'+esc(doorSentence(v))+'"><div class="ring">'+ringSvg(fill)+'<div class="ring-c"><span class="ring-ico">'+ic(ico)+'</span><b class="ring-word">'+word+"</b>"+(big?'<span class="'+bigCls+'">'+big+"</span>":"")+(sub?'<span class="ring-sub">'+sub+"</span>":"")+"</div></div>"+(meta?'<div class="hero-meta">'+meta+"</div>":"")+"</section>"}
function nextHtml(v){
 if(!v.next||v.state==="soon"||v.state==="outside")return "";
 var l=v.next.lecture,day=v.next.sameDay?"":(v.next.wd===(v.clock.weekday+1)%7&&v.clock.weekday<4?"غداً":DAYS[v.next.wd]);
 return '<section class="card next"><span class="b">'+ic("next")+'</span><div class="txt"><small>التالية'+(day?" · "+day:"")+"</small><b>"+codeOf(l)+(l.title&&l.code?" · "+esc(l.title):"")+"</b>"+(l.sec?secOf(l):"")+'</div><div class="when">'+hm(l.s)+"<span>حتى "+hm(l.e)+"</span></div></section>"}
function timelineHtml(list,minute,showNow){
 var h="",i,t,l,cls;
 for(t=600;t<1200;t+=120)h+='<i class="tl-h" style="right:'+pos(t).toFixed(2)+'%"></i>';
 for(i=0;i<list.length;i++){l=list[i];if(l.e<=480||l.s>=1200)continue;cls=l.x?"off":showNow&&l.s<=minute&&minute<l.e?"now":showNow&&l.e<=minute?"past":"";
  h+='<span class="tl-b '+cls+'" style="right:'+pos(l.s).toFixed(2)+"%;width:"+(pos(l.e)-pos(l.s)).toFixed(2)+'%" title="'+esc((l.code||l.title||"")+" "+hm(l.s)+"–"+hm(l.e))+'">'+((l.e-l.s)>=50?esc(shortCode(l.code)):"")+"</span>"}
 if(showNow&&minute>=480&&minute<=1200)h+='<i class="tl-now" style="right:'+pos(minute).toFixed(2)+'%"></i>';
 var lb="";for(t=480;t<=1200;t+=120)lb+='<span style="right:'+pos(t).toFixed(2)+"%;transform:translateX("+(t===480?"0":t===1200?"100%":"50%")+')">'+(t/60)+"</span>";
 return '<div class="tl"><div class="tl-track">'+h+'</div><div class="tl-lb" aria-hidden="true">'+lb+"</div></div>"}
function todayHtml(v){
 if(v.state==="weekend"||v.state==="outside")return "";
 var list=v.today,i,l,rows="",live=0,m=v.clock.minute;
 for(i=0;i<list.length;i++)if(!list[i].x)live++;
 for(i=0;i<list.length;i++){l=list[i];var cls=l.x?"off":l.s<=m&&m<l.e?"now":l.e<=m?"past":"";var em=l.x?"أُلغيت اليوم":cls==="now"?"الآن":cls==="past"?"انتهت":"";
  rows+='<li class="'+cls+'"><time>'+hm(l.s)+"<br>"+hm(l.e)+'</time><span class="what"><b>'+codeOf(l)+(l.title&&l.code?" · "+esc(l.title):"")+"</b>"+(l.sec?secOf(l):"")+"</span>"+(em?"<em>"+em+"</em>":"<span></span>")+"</li>"}
 var body=list.length?timelineHtml(list,m,true)+'<ol class="agenda">'+rows+"</ol>":'<div class="empty">'+ic("free")+"<span>لا محاضرات في هذه القاعة اليوم</span></div>";
 return '<section class="card"><h2><span class="b">'+ic("today")+"</span>اليوم<small>"+esc(dateLabel(v.clock.date))+(list.length?" · "+esc(countOf(live,AR.lecture)):"")+"</small></h2>"+body+"</section>"}
function weekHtml(v){
 if(v.state==="outside"||!D.week||!D.week.length)return "";
 var rows="",i,j,day,l,bars,cls;
 for(i=0;i<D.week.length;i++){day=D.week[i];bars="";
  for(j=0;j<day.lectures.length;j++){l=day.lectures[j];if(l.e<=480||l.s>=1200)continue;bars+='<i class="'+(l.x?"off":"")+'" style="right:'+pos(l.s).toFixed(2)+"%;width:"+(pos(l.e)-pos(l.s)).toFixed(2)+'%"></i>'}
  cls=day.date===v.clock.date?"today":day.date<v.clock.date?"past":"";
  if(cls==="today"&&v.clock.minute>=480&&v.clock.minute<=1200)bars+='<i class="wk-now" style="right:'+pos(v.clock.minute).toFixed(2)+'%"></i>';
  rows+='<div class="wk-row '+cls+'"><b>'+DAYS[day.wd]+'</b><div class="wk-bar">'+bars+"</div></div>"}
 return '<section class="card"><h2><span class="b">'+ic("week")+"</span>الأسبوع<small>8 – 20</small></h2>"+'<div class="wk">'+rows+"</div></section>"}
function renderRoom(){
 var v=viewOf(D);
 root.innerHTML='<div class="door-grid"><div class="col">'+heroHtml(v)+nextHtml(v)+'</div><div class="col">'+todayHtml(v)+weekHtml(v)+"</div></div>";
 return v}
/* ── لوحة المبنى ── */
function tileHtml(r){
 var v=viewOf({term:D.term,week:r.week,soon:D.soon}),st=v.status,word="",meta="",p=0,l;
 if(v.state==="busy"){l=v.today[st.current];word="مشغولة";meta=(l.code?'<bdi class="ltr">'+esc(l.code)+"</bdi> · ":"")+"حتى "+hm(st.until);p=1-st.left/Math.max(1,l.e-l.s)}
 else if(v.state==="soon"){l=v.today[st.next];word="تبدأ بعد "+st.left+" د";meta=(l.code?'<bdi class="ltr">'+esc(l.code)+"</bdi> · ":"")+hm(l.s);p=1-st.left/Math.max(1,D.soon)}
 else if(v.state==="free"){word="فارغة";meta=st.until>=0?"حتى "+hm(st.until):"بقية اليوم";p=st.until>=0?Math.max(0,1-st.left/240):0}
 else if(v.state==="weekend"){word="عطلة";meta="نهاية الأسبوع"}
 else{word="خارج الفصل";meta="—"}
 return {state:v.state,html:'<a class="tile st-'+v.state+'" href="'+esc(r.href)+'"><span class="t-top"><span class="t-code">'+esc(r.code)+'</span><span class="t-dot">'+ic(v.state)+'</span></span><span class="t-state">'+word+'</span><span class="t-meta">'+meta+'</span><span class="t-bar"><i style="width:'+Math.round(Math.max(0,Math.min(1,p))*100)+'%"></i></span></a>'}}
function renderBoard(){
 var counts={free:0,busy:0,soon:0},groups=[],byFloor={},all="",i,r,t,g,html="",state="";
 for(i=0;i<D.rooms.length;i++){r=D.rooms[i];t=tileHtml(r);state=t.state;if(counts[t.state]!==undefined)counts[t.state]++;all+=t.html;
  g=byFloor[r.floor];if(!g){g={label:r.floor,html:"",n:0};byFloor[r.floor]=g;groups.push(g)}g.html+=t.html;g.n++}
 var legend='<div class="legend"><span class="st-free"><i></i>فارغة <b>'+counts.free+'</b></span><span class="st-busy"><i></i>مشغولة <b>'+counts.busy+'</b></span><span class="st-soon"><i></i>تبدأ قريباً <b>'+counts.soon+"</b></span></div>";
 var banner=state==="weekend"?'<div class="banner">'+ic("weekend")+"عطلة نهاية الأسبوع — تعود المحاضرات الأحد</div>":state==="outside"?'<div class="banner">'+ic("outside")+"خارج الفصل الدراسي"+(D.upcoming?" — الفصل القادم "+esc(dateLabel(D.upcoming)):"")+"</div>":"";
 /* الشاشةُ شبكةٌ واحدة تملأ التلفاز بلا تمرير؛ والهاتفُ أدوارٌ بعناوينها. */
 if(SCREEN)html='<div class="tiles" id="tiles">'+all+"</div>";
 else for(i=0;i<groups.length;i++)html+='<section class="floor"><h3>'+ic("floor")+esc(groups[i].label)+"<small> · "+esc(countOf(groups[i].n,AR.room))+'</small></h3><div class="tiles">'+groups[i].html+"</div></section>";
 root.innerHTML='<div class="board">'+(state==="weekend"||state==="outside"?banner:legend)+html+(D.rooms.length?"":'<div class="empty">'+ic("door")+"<span>لا قاعات فعّالة في هذا المبنى</span></div>")+"</div>";
 if(SCREEN)fit()}
function fit(){
 var grid=document.getElementById("tiles");if(!grid)return;var n=grid.children.length;if(!n)return;
 var W=grid.clientWidth,H=Math.max(120,window.innerHeight-grid.getBoundingClientRect().top-window.innerHeight*0.026),gap=window.innerHeight*0.013,best=1,score=0,c,r,w,h,s;
 for(c=1;c<=n;c++){r=Math.ceil(n/c);w=(W-gap*(c-1))/c;h=(H-gap*(r-1))/r;s=Math.min(w/1.45,h);if(s>score){score=s;best=c}}
 r=Math.ceil(n/best);h=(H-gap*(r-1))/r;
 grid.style.gridTemplateColumns="repeat("+best+",minmax(0,1fr))";grid.style.gridTemplateRows="repeat("+r+","+Math.floor(h)+"px)";
 var th=Math.floor(Math.min(h,(W-gap*(best-1))/best/1.45));for(c=0;c<n;c++)grid.children[c].style.setProperty("--th",th+"px")}
/* ── الساعة والإيقاع ── */
function paint(){
 var c=doorClockAt(now());
 if(clockEl)clockEl.innerHTML="<b>"+hm(c.minute)+"</b><span>"+esc(dateLabel(c.date))+"</span>";
 if(D.kind==="board")renderBoard();else renderRoom();
 if(liveEl){var lost=fails>=2;liveEl.className="live"+(lost?" lost":"");liveEl.innerHTML="<i></i>"+(lost?"غير متصل · آخر تحديث "+hm(doorClockAt(lastOk+offset).minute):"تتحدّث كل دقيقة")}}
function maybeReload(build){
 if(!SCREEN||reloading||!build||build===BUILD)return;
 var seen=null;try{seen=window.sessionStorage.getItem("door-build")}catch(e){}
 if(seen===build)return;
 try{window.sessionStorage.setItem("door-build",build)}catch(e){}
 reloading=true;window.location.reload()}
function get(url,done){
 var x=new XMLHttpRequest();x.open("GET",url,true);x.timeout=15000;
 x.onload=function(){var d=null;if(x.status===200){try{d=JSON.parse(x.responseText)}catch(e){d=null}}done(d)};
 x.onerror=x.ontimeout=function(){done(null)};x.send()}
function pull(){get(LIVE,function(d){
 if(d&&d.kind===D.kind){D=d;offset=d.at-Date.now();fails=0;lastOk=Date.now();maybeReload(d.build)}else fails++;
 paint()})}
function tick(){paint();setTimeout(tick,60000-(now()%60000)+50)}
paint();
setTimeout(tick,60000-(now()%60000)+50);
setInterval(pull,60000+Math.floor(Math.random()*7000));
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")pull()});
if(SCREEN){
 /* إصدارٌ جديد: يُعاد تحميل الشاشة مرّةً واحدة لكل إصدار (حارسُ حلقة). */
 setInterval(function(){get("/api/version",function(d){if(d)maybeReload(d.build)})},300000);
 /* إبقاءُ الشاشة مستيقظة حيث يدعم المتصفّح ذلك. */
 var lock=null;
 var wake=function(){try{if(navigator.wakeLock&&!lock&&document.visibilityState==="visible")navigator.wakeLock.request("screen").then(function(l){lock=l;l.addEventListener("release",function(){lock=null})})["catch"](function(){})}catch(e){}};
 wake();document.addEventListener("visibilitychange",wake);
 /* إزاحةٌ خفيفة كل بضع دقائق تحمي الشاشة من احتراق البكسلات. */
 var shift=0,moves=[[0,0],[1,0],[1,1],[0,1]];setInterval(function(){shift=(shift+1)%4;app.style.transform="translate("+moves[shift][0]+"px,"+moves[shift][1]+"px)"},300000);
 window.addEventListener("resize",function(){if(D.kind==="board")fit()});
}
})();
`;

function clientScript(data: RoomDoorData | BoardDoorData, opts: DoorPageOptions): string {
  return CLIENT
    .replace("__ENGINE__", () => ROOM_DOOR_ENGINE_SCRIPT)
    .replace("__COUNT__", () => ARABIC_COUNT_SCRIPT)
    .replace("__DATA__", () => scriptJson(data))
    .replace("__SCREEN__", () => (opts.screen ? "true" : "false"))
    .replace("__LIVE__", () => scriptJson(opts.live))
    .replace("__BUILD__", () => scriptJson(data.build))
    .replace("__DAYS__", () => scriptJson(DOOR_DAY_NAMES))
    .replace("__MONTHS__", () => scriptJson(DOOR_MONTH_NAMES));
}

function shell(input: { title: string; screen: boolean; nonce: string; header: string; body: string; footer: string; script: string; description: string }): string {
  return `<!doctype html>
<html lang="ar" dir="rtl"${input.screen ? ` class="screen"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="color-scheme" content="${input.screen ? "dark" : "light dark"}">
<meta name="theme-color" content="${input.screen ? "#060b0a" : PUBLIC_THEME_COLOR}">
<meta name="description" content="${esc(input.description)}">
<title>${esc(input.title)}</title>
<link rel="icon" href="/schedule-icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/schedule-icon-192.png">
<style>/* SCHEDULE_PUBLIC_PLEX_ARABIC */${PUBLIC_FONT_FACES}${themeCss(input.screen)}${CSS}</style>
</head>
<body>
${SPRITE}
<div class="app" id="app">
${input.header}
<main id="door">${input.body}</main>
${input.screen ? "" : input.footer}
</div>
<noscript><p style="text-align:center;padding:16px">يلزم تفعيل JavaScript لتتحدّث الصفحة كل دقيقة.</p></noscript>
<script nonce="${input.nonce}">${input.script}</script>
</body>
</html>`;
}

function topBar(termName: string, screen: boolean): string {
  return `<header class="top"><span class="mark">SCHEDULE</span>`
    + (screen ? `<span class="clock" id="clk" aria-live="off"></span>` : (termName ? `<span class="pill">${icon("week")}${esc(termName)}</span>` : ""))
    + `</header>`;
}

/** صفحةُ القاعة (والشاشة). الحالُ الأولى تُكتب في الخادم، ثم يتولّاها السكربت. */
export function roomDoorPage(data: RoomDoorData, opts: DoorPageOptions): string {
  const view = doorViewAt(data, data.at, doorStatusAt, doorClockAt);
  const building = data.room.building;
  const buildingLine = building.number ? `مبنى ${esc(building.number)}` : esc(building.code);
  const ident = `<section class="ident"><div class="plate"><small>القاعة</small><b>${esc(data.room.code)}</b></div>`
    + `<div class="where"><span class="bl">${icon("building")}<span>${buildingLine}</span><span class="code">${esc(building.code)}</span></span>`
    + `<small>${[building.name, data.room.floor, building.site].filter(Boolean).map(esc).join(" · ")}</small></div></section>`;
  const live = `<div class="foot"><span class="live" id="live"><i></i>تتحدّث كل دقيقة</span>`
    + (data.board ? `<a href="${esc(data.board)}">${icon("building")}القاعات في المبنى الآن</a>` : "")
    + `</div>`;
  const header = topBar(data.term?.name || "", opts.screen) + ident;
  return shell({
    title: `القاعة ${data.room.code} · ${building.number ? `مبنى ${building.number}` : building.code}`,
    description: doorSentence(view),
    screen: opts.screen,
    nonce: opts.nonce,
    header,
    body: `<p class="ssr st-${view.state}" role="status">${esc(doorSentence(view))}</p>`,
    footer: live,
    script: clientScript(data, opts),
  });
}

/** لوحةُ المبنى: بلاطةٌ لكل قاعة مرتّبةً بالدور ثم الرقم. */
export function boardDoorPage(data: BoardDoorData, opts: DoorPageOptions): string {
  const building = data.building;
  const ident = `<section class="ident"><div class="plate"><small>مبنى</small><b>${esc(building.number || building.code)}</b></div>`
    + `<div class="where"><span class="bl">${icon("building")}<span>${esc(building.name || "لوحة القاعات")}</span><span class="code">${esc(building.code)}</span></span>`
    + `<small>${[building.site, countOf(data.rooms.length, AR.room)].filter(Boolean).map(esc).join(" · ")}</small></div></section>`;
  const today = doorClockAt(data.at);
  const foot = `<div class="foot"><span class="live" id="live"><i></i>تتحدّث كل دقيقة</span>`
    + `<a href="${esc(opts.self)}?screen=1">${icon("screen")}وضع الشاشة</a></div>`;
  return shell({
    title: `قاعات مبنى ${building.number || building.code} الآن`,
    description: `${doorDateLabel(today.date)} — أيّ القاعات فارغة الآن`,
    screen: opts.screen,
    nonce: opts.nonce,
    header: topBar(data.term?.name || "", opts.screen) + ident,
    body: `<p class="ssr" role="status">${esc(countOf(data.rooms.length, AR.room))}</p>`,
    footer: foot,
    script: clientScript(data, opts),
  });
}

/** رمزٌ لا يشير إلى قاعة: صفحةٌ هادئة بلا تفاصيل. */
export function doorMissingPage(message: string): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>SCHEDULE</title><link rel="icon" href="/schedule-icon.svg" type="image/svg+xml">`
    + `<style>/* SCHEDULE_PUBLIC_PLEX_ARABIC */${PUBLIC_FONT_FACES}:root{${PUBLIC_LIGHT_VARS}}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--ink);font-family:"Plex Arabic",-apple-system,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;text-align:center}`
    + `.m{font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.28em;color:var(--brass)}.b{width:64px;height:64px;margin:18px auto 10px;border-radius:20px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent)}.b svg{width:30px;height:30px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}p{margin:0;font-size:16px;font-weight:600}small{display:block;margin-top:8px;color:var(--muted);font-size:13px}</style></head>`
    + `<body><div><div class="m">SCHEDULE</div><div class="b"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 4h3a2 2 0 0 1 2 2v14M2 20h3M13 20h9M10 12v.01"/><path d="M13 4.56v16.16a1 1 0 0 1-1.24.97L5 20V5.56a2 2 0 0 1 1.52-1.94l4-1A2 2 0 0 1 13 4.56Z"/></svg></div>`
    + `<p>${esc(message)}</p><small>إن كان الملصقُ على باب قاعة، فأبلغ القسم ليطبع ملصقاً جديداً.</small></div></body></html>`;
}
