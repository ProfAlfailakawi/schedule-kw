/**
 * ── صفحةُ طلب الأستاذ (/r/:token) ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { ACADEMIC_ADVICE_CSS, ACADEMIC_ADVICE_SCRIPT } from "../academicAdvisoryVisual";
import { REQUEST_REPLAY_SCRIPT } from "../requestReplayScript";
import { REQUEST_DAY_AUTOFILL_SCRIPT } from "../requestDayAutofillScript";
import { REQUEST_LENGTH_SCRIPT } from "../requestLengthScript";
import { VOICE_INPUT_CSS, VOICE_INPUT_JS, VOICE_INPUT_LIMIT } from "../voiceInputScript";
import { PROPOSAL_ALERT_CSS, PROPOSAL_ALERT_SCRIPT } from "../studyProposalAlert";
import { REQUEST_V3_CSS, REQUEST_V4_CSS } from "../requestPageStyles";
import { PATTERN_LIBRARY_CSS, PATTERN_LIBRARY_ICON, patternLibraryHtml } from "../../utils/patternLibraryView";
import { patternLibraryInput } from "../../utils/patternLibraryInput";
import { REQUEST_VISUAL_CSS, REQUEST_VISUAL_JS } from "../requestVisual";
import { COURSE_TAGS_CSS, COURSE_TAGS_JS } from "../../utils/courseTags";
import { COURSE_COLOR_JS } from "../staffCardVisual";
import { PUBLIC_FONT_FACES, PUBLIC_KIT_CSS, PUBLIC_KIT_SCRIPT } from "../publicKit";
import { NEGOTIATION_LABEL } from "../../utils/instructorRequestThread";
import { ARABIC_COUNT_SCRIPT } from "../../utils/arabicCount";
import { CALENDAR_LINKS_CLIENT_JS } from "../../utils/calendarLinks";
import { TEACHER_CARD_EXTRAS_CSS, TEACHER_CARD_EXTRAS_JS } from "../teacherCardExtras";
import { PUSH_CARD_CSS, PUSH_CARD_JS, pushCardHead } from "../pushCard";

/**
 * ── صفحةُ الأستاذ ───────────────────────────────────────────────────────────
 *
 * تُبنى في الخادم كبقيّة الأبواب العامة، لا في حزمة التطبيق: الأستاذ يفتحها
 * من واتساب على هاتفه مرّةً أو مرّتين في الفصل، وتحميلُ تطبيقٍ كاملٍ لأجل
 * ذلك ثمنٌ يدفعه هو بلا مقابل.
 *
 * وما فيها مقصودٌ كما هو:
 *   - شارةُ «مسودة، غير معتمدة» فوق كل شيء، وتبقى في الطباعة وفي لقطة الشاشة،
 *     لأن الصورةَ تُرسل إلى غيره وتُقرأ اعتماداً إن لم تحمل حالتَها.
 *   - يكتب البدايةَ ويختار أيامَه، ولا يُسأل عن النهاية: اللائحةُ تعرفها.
 *   - القاعةُ يرتّبها الخادمُ ويحجز أنسبها لحظةَ الإرسال، ولا يصل الصفحةَ اسمُها ولا رمزُها
 *     ولا بديلُها (قرار المالك 2026-10-29: «مخفية اكيد متعمدة» — أُلغي «الأنسب» وبديلاه من C2).
 *     يرى الأستاذ «الوقت متاح» أو «غير متاح» ومعه بدائل، وإشارةً واحدة 🏫✓ «قاعتك يحددها القسم».
 *   - خطٌّ زمنيٌّ لطلبه هو: متى أُنشئ الرابط، ومتى فُتح، ومتى أرسل، وما ثُبّت
 *     وما رُفض ولماذا. فلا يُقال بعدها «أنتم ما سويتوا شيئاً»، ولا يُقال له
 *     «أرسلنا» وهو لم يفتح.
 */
export function instructorRequestPage(token: string, nonce: string, demoHint = ""): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="color-scheme" content="light"><meta name="theme-color" content="#f2f3ef">
<title>جدولي — طلب تعديل</title>
<link rel="icon" href="/schedule-icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/schedule-icon-192.png">
${pushCardHead(token)}
<style>/* SCHEDULE_PUBLIC_PLEX_ARABIC */${PUBLIC_FONT_FACES}
${typeof ACADEMIC_ADVICE_CSS !== "undefined" ? ACADEMIC_ADVICE_CSS : ""}
:root{color-scheme:light dark;--ink:#15251d;--muted:#627269;--muted2:#8b9991;--line:#dce5df;--line2:#cbd8d0;--bg:#fff;--card:#fff;
--soft:#edf5f0;--ok:#247756;--ok2:#dff2e8;--warn:#9a6a00;--warn2:#fff5d9;--bad:#ad2f28;--bad2:#fdecea;--accent:#247756;--shadow:0 12px 34px rgba(22,57,40,.07)}
/* لوحةُ الصفحات العامة الموحّدة — للشاشة فقط؛ الطباعةُ تبقى كما كانت. */
@media screen{:root{color-scheme:light;--ink:#131817;--muted:#5b6660;--muted2:#6b766f;--line:#e3e6e0;--line2:#ccd2cb;--bg:#fff;--soft:#edefe9;--ok:#1f6b5c;--ok2:#dcece7;--accent:#1f6b5c}
body{background:var(--bg)}}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;background:var(--bg);color:var(--ink);font:400 16px/1.65 "Plex Arabic","Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;font-synthesis:none;font-kerning:normal;-webkit-text-size-adjust:100%}
button,input,select,textarea{font:inherit}
button{touch-action:manipulation}
.wrap{max-width:760px;margin:0 auto;padding:18px 16px 120px}
.state{display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:14px;background:var(--warn2);border:1px solid #eed994;color:#735100;font-weight:700;font-size:13px;margin-bottom:16px}
.state[data-approved="1"]{background:#e8f5ee;border-color:#bfe3d0;color:var(--ok)}
.hero{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end;margin:0 2px 14px}
h1{font-size:23px;line-height:1.35;margin:0 0 3px;letter-spacing:-.02em}
.sub{color:var(--muted);font-size:13px;margin:0}
.readiness{min-width:104px;text-align:center;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:8px 10px;box-shadow:var(--shadow)}
.readiness b{display:block;font-size:19px;color:var(--accent);line-height:1.2}.readiness small{font-size:11px;color:var(--muted)}
.tabs{position:sticky;top:8px;z-index:5;display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:0 0 14px;padding:5px;border:1px solid var(--line);border-radius:15px;background:rgba(255,255,255,.92);box-shadow:var(--shadow);backdrop-filter:blur(12px)}
.tabs button{border:0;border-radius:11px;padding:10px;background:transparent;color:var(--muted);font-weight:700;cursor:pointer}.tabs button[aria-selected=true]{background:var(--soft);color:var(--accent)}
.section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:18px 2px 9px}.section-head b{font-size:15px}.section-head small{font-size:12px;color:var(--muted)}
.card{position:relative;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:15px;margin-bottom:11px;box-shadow:0 5px 18px rgba(22,57,40,.035);overflow:hidden}
.card::before{content:"";position:absolute;inset-block:0;inset-inline-start:0;width:3px;background:transparent}.card[data-act="change"]::before{background:var(--warn)}.card[data-act="delete"]::before{background:var(--bad)}.card[data-act="add"]::before{background:var(--ok)}
.card[data-act="delete"]{background:#fffafa}.card[data-act="delete"] .now{text-decoration:line-through;opacity:.72}
.row-head{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-bottom:4px}.row-head b{font-size:16px}.row-head small,.tag{color:var(--muted);font-size:11.5px;padding:2px 8px;border-radius:999px;background:var(--bg)}
.tag{margin-inline-start:auto;font-weight:700}.tag[data-tone=change]{color:var(--warn);background:var(--warn2)}.tag[data-tone=delete]{color:var(--bad);background:var(--bad2)}.tag[data-tone=add]{color:var(--ok);background:var(--ok2)}
.now{color:var(--muted);font-size:13px;margin:0 0 11px;direction:rtl}
.pick{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:7px;margin-bottom:4px}
.pick button{min-height:42px;padding:8px 6px;border-radius:11px;border:1px solid var(--line);background:#fff;color:var(--muted);font-size:13px;cursor:pointer}.pick button:hover{border-color:var(--line2)}
.pick button[aria-pressed=true]{border-color:var(--accent);background:var(--soft);color:var(--ink);font-weight:700}.pick button[data-a=delete][aria-pressed=true]{border-color:var(--bad);background:var(--bad2);color:var(--bad)}
.edit{border-top:1px dashed var(--line2);padding-top:12px;margin-top:12px}
.field-title{display:block;margin:0 0 6px;color:var(--muted);font-size:12px;font-weight:600}
.days{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:12px}
.days button{min-width:0;padding:9px 3px;border-radius:10px;border:1px solid var(--line);background:#fff;color:var(--muted);font-size:12.5px;cursor:pointer}.days button[aria-pressed=true]{border-color:var(--accent);background:var(--soft);color:var(--ink);font-weight:700}
label.time{display:grid;grid-template-columns:72px minmax(0,1fr);align-items:center;gap:9px;font-size:13px;color:var(--muted)}
label.time input{width:100%;padding:11px;border-radius:11px;border:1px solid var(--line);background:#fff;text-align:center;direction:ltr}
label.time input:focus,select:focus,textarea:focus,label.sign input:focus{outline:3px solid rgba(36,119,86,.12);border-color:var(--accent)}
.ends{font-size:12.5px;color:var(--muted2);margin:7px 81px 0 0}
.reg-notes{display:grid;gap:6px;margin:8px 0 0}.reg-note{display:flex;align-items:center;gap:9px;padding:8px 11px;border-radius:12px;border:1px solid var(--line);background:var(--soft);color:var(--muted);font-size:12.5px;line-height:1.5}.reg-note svg{inline-size:18px;block-size:18px;flex:none;color:var(--accent)}.reg-note b{font-size:11px;padding:1px 7px;border-radius:999px;background:var(--card);border:1px solid var(--line);color:var(--ink,#1d2b24);white-space:nowrap}.reg-note .reg-bar{flex:1;min-inline-size:60px;block-size:8px;border-radius:99px;background:#5b6b86;overflow:hidden;display:flex}.reg-note .reg-bar i{display:block;block-size:100%;background:#e0a21a}.reg-note .reg-pct{font-variant-numeric:tabular-nums;font-weight:700;color:var(--ink,#1d2b24);white-space:nowrap}.verdict{margin:10px 0 0;font-size:13px;padding:10px 12px;border-radius:12px;display:none;font-weight:600}.verdict[data-tone=checking]{display:block;background:var(--bg);color:var(--muted)}.verdict[data-tone=ok]{display:block;background:var(--ok2);color:var(--ok)}.verdict[data-tone=warn]{display:block;background:var(--warn2);color:#735100}.verdict[data-tone=bad]{display:block;background:var(--bad2);color:var(--bad)}
.alts{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.alts button{padding:7px 11px;border-radius:999px;border:1px solid var(--line);background:#fff;font-size:12px;cursor:pointer}
.fresh-note{display:flex;align-items:center;gap:9px;margin:0 0 12px;padding:10px 13px;border:1px solid #eed994;border-radius:13px;background:var(--warn2);color:#735100;font-size:13px;font-weight:600}.fresh-note .ic,.fresh-note svg{flex:none}
.verdict .shapes-box,.verdict .alts{flex:1 1 100%}.memory{padding:0}.memory>summary{display:flex;align-items:center;gap:9px;padding:14px 15px;cursor:pointer;font-weight:700;font-size:14px;list-style:none;min-height:48px}.memory>summary::-webkit-details-marker{display:none}.memory>summary .sk-gi{inline-size:18px;block-size:18px;flex:none;color:var(--accent)}
.mem-list{list-style:none;margin:0;padding:0 15px;display:grid;gap:8px}.mem-list li{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--bg)}.mem-list b{display:block;font-size:14px}.mem-list small{display:block;color:var(--muted);font-size:12.5px}
.mem-s{flex:none;padding:2px 9px;border-radius:999px;font-size:11.5px;font-weight:700;background:var(--soft);color:var(--muted)}.mem-s[data-s=fixed]{background:var(--ok2);color:var(--ok)}.mem-s[data-s=rejected]{background:var(--bad2);color:var(--bad)}
.memory .btn-ghost{display:flex;align-items:center;justify-content:center;gap:8px;width:calc(100% - 30px);margin:12px 15px 0;min-height:46px;border:1px solid var(--accent);border-radius:12px;background:var(--soft);color:var(--accent);font-weight:700;cursor:pointer}.memory .btn-ghost .sk-gi{inline-size:18px;block-size:18px}
.mem-note{margin:8px 15px 14px;font-size:12px;color:var(--muted);line-height:1.7}
.offerings{margin-top:14px;border:1px solid color-mix(in srgb,var(--accent) 28%,var(--line));border-radius:16px;overflow:hidden;box-shadow:0 5px 18px rgba(25,65,48,.045)}.offerings>summary{display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:2px 10px;padding:12px 14px;min-height:68px}.offerings>summary .offering-title{font-size:15px;font-weight:800;line-height:1.45}.offerings-icon{grid-row:1/3;display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:var(--soft);color:var(--accent)}.offerings-icon svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.offerings>summary .chip{grid-column:3;grid-row:1/3;min-width:38px;justify-content:center;font-size:13px}.offerings>summary>small{grid-column:2;grid-row:2;font-size:11.5px;font-weight:500;color:var(--muted)}.offerings[open]>summary{background:color-mix(in srgb,var(--soft) 48%,var(--card));border-bottom:1px solid var(--line)}.offering-body{padding:12px 14px 14px}.offering-search-label{position:sticky;top:8px;z-index:2;display:block;padding:4px 0 10px;background:var(--card)}.offering-groups{display:grid;gap:8px}.offering-course{min-width:0;border:1px solid var(--line);border-radius:13px;background:var(--card);overflow:hidden}.offering-course>summary{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:58px;padding:10px 12px;cursor:pointer;list-style:none}.offering-course>summary::-webkit-details-marker{display:none}.offering-course>summary>span:first-child{min-width:0}.offering-course>summary b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px}.offering-course>summary small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;color:var(--muted);font-size:11px}.offering-course>summary .chip{flex:none}.offering-course[open]>summary{background:var(--soft);border-bottom:1px solid var(--line)}.offering-options{display:grid;gap:7px;padding:9px}.offering-option{display:grid;grid-template-columns:minmax(74px,.55fr) minmax(0,1fr) auto;align-items:center;gap:8px;inline-size:100%;min-inline-size:0;min-block-size:66px;padding:9px 10px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink,#1d2b24);font:inherit;text-align:start;cursor:pointer;transition:border-color .15s,background .15s,box-shadow .15s}.offering-option:hover,.offering-option:focus-visible{border-color:var(--accent);background:color-mix(in srgb,var(--soft) 55%,var(--card));box-shadow:0 2px 8px rgba(25,65,48,.06)}.offering-option:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.offering-section{display:inline-flex;align-items:baseline;gap:5px;min-width:0;color:var(--accent)}.offering-section small{font-size:10px;color:var(--muted);white-space:nowrap}.offering-section b{font-size:17px;font-variant-numeric:tabular-nums}.offering-schedule{display:grid;gap:4px;min-width:0}.offering-slot{display:flex;align-items:center;gap:6px;min-width:0;color:var(--muted);font-size:11.5px;line-height:1.4}.offering-slot svg{inline-size:14px;block-size:14px;flex:none;color:var(--accent)}.offering-slot b{font-weight:600;white-space:nowrap}.offering-slot time{direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums;white-space:nowrap}.offering-pick{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:34px;padding:6px 9px;border-radius:10px;background:var(--soft);color:var(--accent);font-size:11px;font-weight:800;white-space:nowrap}.offering-pick svg{inline-size:14px;block-size:14px;flex:none}
.replay-note{margin:0 0 12px;padding:12px 14px;border:1px solid var(--accent);border-radius:14px;background:var(--soft);font-size:13.5px;line-height:1.7}.replay-note p{margin:6px 0 2px;font-weight:700}.replay-note ul{margin:0;padding-inline-start:18px;color:var(--muted)}.replay-note li b{color:var(--ink)}
.cal-line{margin:10px 2px 14px;text-align:center}.cal-line p{margin:6px 6px 0;font-size:12px;color:var(--muted);line-height:1.7}
.cal-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:9px 16px;border:1px solid var(--accent);border-radius:13px;background:var(--soft);color:var(--accent);font-weight:700;font-size:14px;text-decoration:none}.cal-btn .sk-gi{inline-size:18px;block-size:18px;flex:none}
.cal-line.compact{margin:0 0 12px;text-align:start}.cal-line.compact p{margin:4px 2px 0}
.cal-btns{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}.cal-line.compact .cal-btns{justify-content:flex-start}.cal-btns .cal-btn{flex:1 1 90px;min-height:44px}
.verify-line{margin:14px 2px 0;font-size:13px;color:var(--muted);text-align:center}.verify-line a{display:inline-flex;align-items:center;min-height:44px;padding:0 8px;color:var(--accent);font-weight:700}
.shape-lead{margin:0;font-size:12px;color:var(--muted)}.auto-note{margin:6px 0 0;padding:6px 10px;border-radius:10px;background:var(--soft);color:var(--muted);font-size:12px;line-height:1.6}.alts.shapes button{border-color:var(--accent);background:var(--soft);color:var(--ink);font-weight:600}
.alts-ro span{padding:7px 11px;border-radius:999px;border:1px dashed var(--line);background:var(--soft,#f4f6f5);color:var(--ink,#1d2b24);font-size:12px}
.days button,.starts button,.alts button,.reply button,.acts .act{min-height:44px}
textarea{width:100%;margin-top:9px;padding:11px;border-radius:11px;border:1px solid var(--line);font-size:14px;min-height:68px;background:#fff;display:none;resize:vertical}
textarea[data-show="1"]{display:block}
.add-card{border-style:dashed;border-color:#9fc8b5;background:rgba(255,255,255,.72)}.add-card header{margin-bottom:10px}.add-card header b{display:block}.add-card header small{display:block;color:var(--muted);font-size:12px;margin-top:2px}
.add-start{width:100%;min-height:50px;border:0;border-radius:13px;background:var(--accent);color:#fff;font-weight:700;cursor:pointer}
.course-chooser{display:grid;gap:10px}.course-college{display:grid;gap:6px}.course-college span{font-size:12px;font-weight:700;color:var(--muted)}.course-college select,.course-search{width:100%;padding:12px 13px;border:1px solid var(--line);border-radius:12px;background:#fff;color:var(--ink);font:inherit}.course-search:disabled{opacity:.55;cursor:not-allowed;background:var(--soft)}
.req-tag{display:inline-block;margin-inline-start:7px;padding:1px 8px;border-radius:999px;background:var(--soft);color:var(--muted);font-size:10.5px;font-style:normal;font-weight:600;vertical-align:middle}.course-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;max-height:340px;overflow:auto;padding:2px}.course-option{display:grid;gap:2px;min-height:62px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:#fff;color:var(--ink);text-align:start;cursor:pointer}.course-option:hover,.course-option:focus{border-color:var(--accent);background:var(--soft);outline:none}.course-option b{font-size:13px}.course-option small{color:var(--muted);font-size:11.5px;direction:ltr;text-align:start}.chooser-close{justify-self:start;border:0;background:transparent;color:var(--muted);cursor:pointer;padding:4px 0;min-height:44px}
body{padding-bottom:calc(92px + env(safe-area-inset-bottom))}.best{margin:10px 0 4px}.best-row{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.best-row button{display:grid;gap:3px;justify-items:center;padding:9px 6px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);font:inherit;font-size:12.5px;cursor:pointer;min-height:44px}.best-row small{color:var(--muted);font-size:11px}.deadline{margin:0 0 10px;font-size:12.5px;color:var(--muted)}.deadline[data-urgent="1"]{color:#8a5a00;background:#fbf0d6;border-radius:10px;padding:5px 10px;display:inline-block}button.wb{border:0;padding:0;cursor:pointer;font:inherit}.note-add{display:block;width:100%;margin:12px 0;padding:12px;border:1px dashed var(--line-strong);border-radius:14px;background:transparent;color:var(--muted);font:inherit;font-size:13px;cursor:pointer;min-height:44px}.advice{flex:1 1 100%;margin:6px 0 0;padding:8px 10px;border-radius:10px;background:var(--soft);color:var(--muted);font-size:12.5px;line-height:1.7}.heat-key[role=status]{color:var(--muted)}
.send{position:sticky;bottom:0;z-index:4;margin:18px -4px 0;padding:20px 4px calc(14px + env(safe-area-inset-bottom));background:linear-gradient(transparent,var(--bg) 18%)}
.sendbox{padding:13px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.96);box-shadow:0 -8px 28px rgba(22,57,40,.08)}
.send button{width:100%;padding:14px;border-radius:13px;border:0;background:var(--accent);color:#fff;font-size:15px;font-weight:700;cursor:pointer}
.send button:disabled{opacity:.5;cursor:not-allowed}
.err{background:#fdeceb;color:var(--bad);padding:11px 13px;border-radius:11px;margin-bottom:12px;font-size:14px}
label.sign{display:grid;grid-template-columns:auto minmax(0,190px);align-items:center;justify-content:center;gap:10px;margin:0 0 8px;font-size:13px;color:var(--muted)}label.sign input{width:100%;padding:10px;border-radius:11px;border:1px solid var(--line);font-size:16px;letter-spacing:.08em;text-align:center;direction:ltr;background:#fff}
.signnote{margin:0 0 11px;font-size:11.5px;color:var(--muted2);line-height:1.6;text-align:center}
.activity-empty{text-align:center;padding:34px 18px;border:1px dashed var(--line2);border-radius:16px;color:var(--muted);font-size:13px;background:var(--card)}
.activity-list{list-style:none;margin:0;padding:0;display:grid;gap:9px}.activity-item{position:relative;display:grid;grid-template-columns:12px minmax(0,1fr) auto;gap:10px;align-items:start;padding:13px 14px;border:1px solid var(--line);border-radius:15px;background:var(--card)}.activity-dot{width:10px;height:10px;border-radius:50%;margin-top:7px;background:var(--line2);box-shadow:0 0 0 4px var(--bg)}.activity-item[data-kind=add] .activity-dot{background:var(--ok)}.activity-item[data-kind=change] .activity-dot{background:var(--warn)}.activity-item[data-kind=delete] .activity-dot{background:var(--bad)}.activity-main b{display:block;font-size:14px}.activity-main p{margin:3px 0 0;color:var(--muted);font-size:12.5px;line-height:1.7}.activity-item time{color:var(--muted2);font-size:11px;white-space:nowrap}.decision{margin-top:7px;padding:7px 9px;border-radius:9px;background:var(--bg);font-size:12px;color:var(--muted)}.starts{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:6px;margin:4px 0 10px}.starts button{padding:10px 4px;border-radius:10px;border:1px solid var(--line);background:#fff;color:var(--ink,#1d2b24);font:600 13px/1 ui-monospace,monospace;direction:ltr;cursor:pointer}.starts button[aria-pressed=true]{background:var(--ok);border-color:var(--ok);color:#fff}.course-none{margin:8px 0;padding:10px;border-radius:10px;background:var(--bg);color:var(--muted);font-size:12.5px}.restored{margin:0 0 12px;padding:10px 12px;border-radius:12px;background:#eef6f0;border:1px solid var(--line);font-size:12.5px;color:var(--muted);line-height:1.7}.restored button{margin-inline-start:6px;border:0;background:none;color:var(--ok);font-weight:700;text-decoration:underline;cursor:pointer}article.card{scroll-margin-top:84px}.dept{margin:10px 0 4px;padding:10px 12px;border-radius:12px;font-size:12.5px;line-height:1.7}.dept p{margin:4px 0 0}.dept[data-state=fixed]{background:var(--ok2);color:var(--ok);font-weight:700}.dept[data-state=rejected]{background:var(--bad2);color:var(--bad)}.dept .alts button{color:var(--ink)}.sendrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}.sendrow .sign{display:grid;grid-template-columns:1fr;gap:3px;margin:0;justify-content:stretch;font-size:11.5px}.sendrow .sign input{padding:11px 10px}.sign input::placeholder{direction:rtl;letter-spacing:0}.sendrow #send{width:auto;min-width:118px;max-width:170px;padding:12px 14px;line-height:1.35}.sendbox{padding:10px 12px}.send{padding-top:12px}.send .signnote{margin:6px 0 0;font-size:11px}.tabs{position:static}.plan{margin:0 0 18px;border:1px solid var(--line);border-radius:18px;background:var(--card);box-shadow:0 5px 18px rgba(22,57,40,.035);overflow:hidden}.plan-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:12px 14px;border-bottom:1px solid var(--line)}.plan-head b{font-size:15px}.legend{display:flex;gap:10px;flex-wrap:wrap;font-size:11.5px;color:var(--muted)}.legend span{display:inline-flex;align-items:center;gap:5px}.legend span::before{content:"";inline-size:9px;block-size:9px;border-radius:3px;background:var(--ok)}.legend span[data-act=change]::before{background:var(--warn)}.legend span[data-act=delete]::before{background:var(--bad)}.plan-scroll{overflow-x:auto}.weekstrip{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin:0;padding:10px 14px;border-bottom:1px solid var(--line);list-style:none}
.weekstrip li{display:grid;justify-items:center;gap:4px;padding:7px 2px;border-radius:12px;border:1px solid transparent;font-size:11.5px;color:var(--muted);min-width:0}
.weekstrip li[data-today="1"]{background:var(--ok2);border-color:var(--ok);color:var(--ok);font-weight:700}
.weekstrip .wk-n{font-size:13px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.weekstrip .wk-d{display:flex;gap:3px;justify-content:center;flex-wrap:wrap;min-block-size:7px}
.weekstrip .wk-d i{inline-size:7px;block-size:7px;border-radius:50%;background:var(--ok)}
.weekstrip li[data-n="0"] .wk-n{color:var(--muted2)}
.plan-table{inline-size:100%;border-collapse:collapse;font-size:13px}.plan-table th{padding:9px 10px;text-align:start;font-size:11.5px;font-weight:600;color:var(--muted);background:var(--soft);white-space:nowrap}.plan-table td{padding:10px;border-top:1px solid var(--line);vertical-align:top;line-height:1.55}.plan-table td b{display:block;font-weight:600}.plan-table td small{display:block;font-size:11px;color:var(--muted2)}.plan-table td s{display:block;font-size:11.5px;color:var(--muted2)}.plan-table tr{cursor:pointer}.plan-table tr[data-act=add]{background:var(--ok2)}.plan-table tr[data-act=change]{background:var(--warn2)}.plan-table tr[data-act=delete]{background:var(--bad2)}.plan-table tr[data-act=delete] td:not(:last-child){text-decoration:line-through;color:var(--muted)}.plan-table td:first-child{box-shadow:inset -3px 0 0 transparent}.plan-table tr[data-act=add] td:first-child{box-shadow:inset -3px 0 0 var(--ok)}.plan-table tr[data-act=change] td:first-child{box-shadow:inset -3px 0 0 var(--warn)}.plan-table tr[data-act=delete] td:first-child{box-shadow:inset -3px 0 0 var(--bad)}.status{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11.5px;font-weight:600;background:var(--soft);color:var(--muted);white-space:nowrap}.status[data-act=add]{background:var(--ok);color:#fff}.status[data-act=change]{background:var(--warn);color:#fff}.status[data-act=delete]{background:var(--bad);color:#fff}.plan-check{margin-top:4px}.plan-check[data-tone=ok]{color:var(--ok)!important}.plan-check[data-tone=bad]{color:var(--bad)!important}.plan-check[data-tone=warn]{color:var(--warn)!important}.row-head .college{padding:2px 8px;border-radius:999px;background:var(--soft);color:var(--muted)}.plan-table td:nth-child(3){white-space:nowrap;font-variant-numeric:tabular-nums}@media(max-width:520px){.plan-table{font-size:12px}.plan-table th,.plan-table td{padding:8px 6px}.plan-table td:nth-child(3){font-size:11.5px}}.verdict-next{display:block;margin-top:4px;font-size:12px;opacity:.85}.verdict{align-items:flex-start;gap:8px}.verdict[data-tone]:not([data-tone=""]){display:flex;flex-wrap:wrap}.verdict>span{flex:1;min-width:0}.verdict>i,.dept i{flex:none;display:inline-grid;place-items:center;inline-size:20px;block-size:20px;border-radius:50%;font-style:normal;font-size:12px;font-weight:700;background:currentColor;color:#fff}.verdict>i{background:currentColor}.verdict[data-tone=ok]>i{background:var(--ok);color:#fff}.verdict[data-tone=bad]>i{background:var(--bad);color:#fff}.verdict[data-tone=warn]>i{background:#b07d00;color:#fff}.verdict[data-tone=checking]>i{background:var(--line2);color:#fff}.verdict .alts{flex-basis:100%}.dept{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.dept>b{display:flex;align-items:center;gap:8px}.dept>p{flex-basis:100%}.dept[data-state=fixed] i{background:var(--ok);color:#fff}.dept[data-state=rejected] i{background:var(--bad);color:#fff}.row-head[data-toggle]{cursor:pointer;border-radius:10px}.row-head[data-toggle]::after{content:"";margin-inline-start:auto;inline-size:8px;block-size:8px;border-inline-end:2px solid var(--muted2);border-block-end:2px solid var(--muted2);transform:rotate(45deg);transition:transform .2s}.card[data-open="1"] .row-head[data-toggle]::after{transform:rotate(-135deg)}.row-head[data-toggle]:focus-visible{outline:2px solid var(--ok);outline-offset:3px}.activity-main .activity-meta{font-size:12px;color:var(--muted2)}.activity-meta[data-tone=ok]{color:var(--ok)}.activity-meta[data-tone=warn]{color:var(--warn)}.activity-meta[data-tone=bad]{color:var(--bad)}.decision[data-state=fixed]{color:var(--ok);font-weight:700}.decision[data-state=rejected]{color:var(--bad);font-weight:700}.plan-head small{display:block;font-size:11.5px;color:var(--muted)}.appts{display:grid}.appt{position:relative;border-top:1px solid var(--line)}.appt:first-child{border-top:0}.appt::before{content:"";position:absolute;inset-block:0;inset-inline-start:0;width:3px;background:transparent}.appt[data-act=add]{background:var(--ok2)}.appt[data-act=change]{background:var(--warn2)}.appt[data-act=delete]{background:var(--bad2)}.appt[data-act=add]::before{background:var(--ok)}.appt[data-act=change]::before{background:var(--warn)}.appt[data-act=delete]::before{background:var(--bad)}.appt-head{inline-size:100%;display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1.3fr) auto minmax(86px,auto) 20px;grid-template-areas:"course days time status chev";gap:6px 12px;align-items:start;padding:12px 14px;border:0;background:transparent;color:inherit;font:inherit;text-align:start;cursor:pointer;line-height:1.55}.appt-head:hover{background:rgba(36,119,86,.04)}.appt-head:focus-visible{outline:2px solid var(--accent);outline-offset:-2px;border-radius:10px}.appt-course{grid-area:course;min-width:0}.appt-course b{display:block;font-weight:600}.appt-course small,.appt-days s,.appt-time s{display:block;font-size:11px;color:var(--muted2)}.appt-days{grid-area:days;font-size:13px}.appt-time{grid-area:time;font-size:13px;white-space:nowrap;font-variant-numeric:tabular-nums}.appt-status{grid-area:status;display:flex;flex-wrap:wrap;gap:4px;align-items:center;justify-content:flex-end}.appt-status .plan-check{flex-basis:100%;text-align:end;font-size:11px}.appt-chev{grid-area:chev;color:var(--muted2);transition:transform .2s;display:grid;place-items:center;padding-top:2px}.appt[data-open="1"] .appt-chev{transform:rotate(180deg)}.appt[data-act=delete] .appt-course b,.appt[data-act=delete] .appt-days,.appt[data-act=delete] .appt-time{text-decoration:line-through;color:var(--muted)}.appt-body{padding:0 14px 14px}.appt-body:empty{display:none}.appt-ro{margin:0;color:var(--muted);font-size:12.5px}.appt-ro .sk-gi{inline-size:16px;block-size:16px;vertical-align:-3px;margin-inline-end:4px;color:var(--accent)}.appt-ro+.appt-ro{margin-top:8px}.link-msg{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 10px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--accent);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}.link-msg .sk-gi{margin:0}.acts{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0}.act{display:inline-flex;align-items:center;gap:7px;min-height:42px;padding:8px 14px;border-radius:12px;border:1px solid var(--line);background:#fff;color:var(--ink,#1d2b24);font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:border-color .15s,background .15s}.act:hover{border-color:var(--accent);background:var(--soft)}.act:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.act[data-tone=bad]{color:var(--bad)}.act[data-tone=bad]:hover{border-color:var(--bad);background:var(--bad2)}.act .ic{flex:none}@media(max-width:560px){.appt-head{grid-template-columns:minmax(0,1fr) auto 20px;grid-template-areas:"course status chev" "days time time";padding:12px}.appt-days,.appt-time{font-size:12.5px;color:var(--muted)}.appt-time{text-align:end}.appt-body{padding:0 12px 12px}.act{flex:1 1 140px;justify-content:center}}.thread{margin:10px 0 4px;padding:11px 12px;border:1px solid var(--line);border-radius:12px;background:var(--bg);font-size:12.5px;line-height:1.7}.thread-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}.thread-head b{font-size:13px}.neg{padding:2px 10px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap;background:var(--soft);color:var(--muted)}.neg[data-neg=proposed]{background:var(--warn2);color:var(--warn)}.neg[data-neg=agreed]{background:var(--ok2);color:var(--ok)}.neg[data-neg=rejected]{background:var(--bad2);color:var(--bad)}.msgs{list-style:none;margin:0 0 8px;padding:0;display:grid;gap:6px}.msgs li{padding:7px 10px;border-radius:10px;background:var(--card);border:1px solid var(--line);max-inline-size:92%}.msgs li[data-from=instructor]{margin-inline-start:auto;background:var(--ok2)}.msgs li small{display:block;color:var(--muted2);font-size:11px}.msgs li p{margin:2px 0 0}.msgs .slots{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px}.msgs .slot{padding:1px 8px;border-radius:999px;border:1px solid var(--line);font-size:11.5px}.thread-q{margin:4px 0}.thread .alts button{color:var(--ink)}.reply{display:grid;gap:6px;margin-top:6px}.reply textarea{inline-size:100%;padding:9px 10px;border:1px solid var(--line);border-radius:10px;font:inherit;resize:vertical}.reply .sign,.reply .time{display:grid;gap:3px;margin:0;font-size:11.5px}.reply button[data-reply]{justify-self:start;padding:9px 16px;border-radius:10px;border:0;background:var(--ok);color:#fff;font:inherit;font-weight:700;cursor:pointer}
.done{text-align:center;padding:44px 18px}
.done .tick{width:58px;height:58px;border-radius:50%;background:var(--ok);color:#fff;font-size:30px;line-height:58px;margin:0 auto 14px}
[hidden]{display:none!important}
@media(max-width:520px){.wrap{padding:12px 12px 116px}.hero{grid-template-columns:1fr}.readiness{display:flex;align-items:center;justify-content:space-between;text-align:start;padding:8px 12px}.readiness b{font-size:16px}.card{padding:13px}.days{gap:4px}.days button{font-size:11.5px;padding-inline:1px}.course-options{grid-template-columns:1fr}.ends{margin-inline-start:0}.activity-item{grid-template-columns:12px minmax(0,1fr)}.activity-item time{grid-column:2}.tabs{top:6px}.offerings>summary{grid-template-columns:34px minmax(0,1fr) auto;gap:2px 8px;padding:10px}.offerings-icon{width:34px;height:34px}.offerings>summary .offering-title{font-size:14px}.offering-body{padding:8px}.offering-course>summary{min-height:54px;padding:9px}.offering-course>summary b{font-size:12.5px}.offering-option{grid-template-columns:58px minmax(0,1fr);gap:6px 8px;padding:9px;min-block-size:72px}.offering-section{grid-column:1;grid-row:1/3;align-self:center;justify-content:center;flex-direction:column;align-items:center;gap:0}.offering-section b{font-size:16px}.offering-schedule{grid-column:2;grid-row:1}.offering-slot{font-size:11px}.offering-pick{grid-column:2;grid-row:2;justify-self:start;min-height:28px;padding:4px 8px;font-size:10.5px}.offering-search-label{top:4px}}
@media print{body{background:#fff}.tabs,.pick,.edit,.send,.alts,.add-card{display:none!important}.wrap{max-width:none;padding:0}.card{box-shadow:none;break-inside:avoid}}
/* شريطُ حالةٍ واحد: مسودة · جاهزية · بيئة تجريبية — شرائحُ صغيرة لا ثلاثُ لافتات. */
.statusline{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 12px}
.chip{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:999px;font-size:12px;font-weight:700;line-height:1.5;border:1px solid var(--line);background:var(--card);color:var(--muted)}
.chip.st{background:var(--warn2);border-color:#eed994;color:#735100}
.statusline[data-approved="1"] .chip.st{background:#e8f5ee;border-color:#bfe3d0;color:var(--ok)}
.chip.rd b{display:inline;font-size:13px;color:var(--accent)}.chip.rd small{font-size:11.5px;color:var(--muted)}
details.demo{display:inline-block}details.demo[open]{flex-basis:100%}
details.demo>summary{list-style:none;cursor:pointer;background:#fff7e6;border-color:#c79b5f;color:#5b4520}details.demo>summary::-webkit-details-marker{display:none}
.statusline .demo-hint{margin:6px 0 0!important}
.hero{grid-template-columns:1fr}
label.sign input::placeholder,.course-search::placeholder,textarea::placeholder{color:#5f6e66;opacity:1}
.signnote{color:#5f6e66;font-size:12px}
.send{padding-top:10px}.sendbox{padding:8px 10px}
.sendrow{display:flex;align-items:center;gap:8px;min-height:56px}
.sendrow label.sign{flex:1 1 52%;margin:0;grid-template-columns:auto minmax(0,1fr);justify-content:stretch;gap:8px;white-space:nowrap}
.sendrow label.sign input{padding:9px 8px;min-width:0}
.sendrow>button{flex:1 1 40%;width:auto;min-height:44px;padding:8px 12px}
.sendbox .signnote{display:none;margin:6px 0 0}.sendbox:focus-within .signnote{display:block}
.wrap{padding-bottom:150px}
${PROPOSAL_ALERT_CSS}
${PUBLIC_KIT_CSS}
${REQUEST_V3_CSS}
${VOICE_INPUT_CSS}
${REQUEST_V4_CSS}
${PATTERN_LIBRARY_CSS}
.field-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 6px}.field-head .field-title{margin:0}
.plib{position:relative;flex:none}
.plib>summary{list-style:none;display:grid;place-items:center;inline-size:32px;block-size:32px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--muted);cursor:pointer}
.plib>summary::-webkit-details-marker{display:none}
.plib>summary:focus-visible{outline:3px solid rgba(36,119,86,.18)}
.plib[open]>summary{color:var(--accent);border-color:var(--accent);background:var(--soft)}
.plib-pop{position:fixed;inset-inline:12px;inset-block-start:9vh;z-index:60;margin-inline:auto;inline-size:auto;max-inline-size:440px;max-block-size:80vh;overflow:auto;padding:16px;border:1px solid var(--line);border-radius:20px;background:var(--card);box-shadow:0 24px 60px rgba(22,57,40,.25)}
${REQUEST_VISUAL_CSS}
${COURSE_TAGS_CSS}
${TEACHER_CARD_EXTRAS_CSS}
${PUSH_CARD_CSS}
/* Completed unchanged request: minimal signed confirmation, no review pathway. */
.confirm-wrap{max-width:570px;margin:clamp(32px,9vh,82px) auto 20px;text-align:center}
.confirm-card{position:relative;overflow:hidden;padding:clamp(24px,6vw,44px) 22px 27px;border:1px solid #cde4d7;border-radius:28px;background:linear-gradient(155deg,#f0f8f3 0%,#fff 58%,#f6f9f5 100%);box-shadow:0 18px 55px rgba(31,107,92,.09)}
.confirm-card::before{content:"";position:absolute;inset:0 0 auto;block-size:5px;background:linear-gradient(90deg,#bddfd0,#247756,#bddfd0)}
.confirm-check{display:grid;place-items:center;inline-size:82px;block-size:82px;margin:0 auto 19px;border-radius:26px;background:#e0f2e8;border:1px solid #bee2d1;color:#166b50;box-shadow:0 10px 25px #176a4d19}
.confirm-check svg{inline-size:42px;block-size:42px;stroke-width:2.25}
.confirm-card h1{font-size:clamp(24px,5.5vw,31px);letter-spacing:-.03em;margin:0 0 7px;color:#174f3c;font-weight:700}
.confirm-sub{margin:0 auto;color:#537466;font-size:14px;line-height:1.9}
.confirm-name{margin:10px auto 25px;color:#70857b;font-size:12.5px}
.confirm-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;max-width:460px;margin:0 auto}
.confirm-fact{display:flex;flex-direction:column;align-items:center;gap:8px;min-height:104px;padding:16px 6px 10px;background:#fff;border:1px solid #e3ece6;border-radius:17px;color:#325c4b;font-size:12px;font-weight:600}
.confirm-fact svg{inline-size:23px;block-size:23px}
.confirm-code{margin-top:20px;font-size:12px;color:#6b8476}
.confirm-code summary{cursor:pointer;list-style:none;display:inline-flex;gap:6px;align-items:center;color:#366c57}
.confirm-code summary::-webkit-details-marker{display:none}
.confirm-code a{color:#246b55}
@media(max-width:400px){.confirm-card{padding-inline:15px}.confirm-facts{gap:6px}.confirm-fact{font-size:11.5px}}
@media(prefers-reduced-motion:reduce){.confirm-card *{animation:none!important;transition:none!important}}
</style></head><body>${demoHint?`<div id="demoTop" style="max-width:760px;margin:0 auto;padding:12px 16px 0">${demoHint}</div>`:""}<div class="wrap" id="host"><div class="skel" role="status" aria-busy="true"><span class="sr">يفتح جدولك…</span><i></i><i></i><i></i></div></div>
<script nonce="${nonce}">(function(){
${PUBLIC_KIT_SCRIPT}
${CALENDAR_LINKS_CLIENT_JS}
${TEACHER_CARD_EXTRAS_JS}
${PUSH_CARD_JS}
var PLIB=${JSON.stringify(patternLibraryHtml(patternLibraryInput()))},PLIB_ICON=${JSON.stringify(PATTERN_LIBRARY_ICON)};
document.addEventListener("click",function(e){var d=document.querySelector(".plib[open]");if(d&&!d.contains(e.target))d.removeAttribute("open")});
var TOKEN=${JSON.stringify(token)},host=document.getElementById("host"),demoNode=document.querySelector("#demoTop .demo-hint"),demoOpen=false,data=null,state=[],activeTab="schedule",chooserOpen=false,offeringsOpen=false,offeringSearch="";
${typeof ACADEMIC_ADVICE_SCRIPT !== "undefined" ? ACADEMIC_ADVICE_SCRIPT : "function academicCardHtml(){return \"\";} function academicClashCount(){return 0;} function loadAcademicAdvice(){}"}
var DAYS=[["fsunday","الأحد"],["fmonday","الاثنين"],["ftuesday","الثلاثاء"],["fwednesday","الأربعاء"],["fthursday","الخميس"]];
var LONG={fmonday:80,fwednesday:80},SHORT=50;
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){
return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function mins(t){var p=String(t||"0:0").split(":");return (+p[0]||0)*60+(+p[1]||0)}
function clock(m){m=Math.min(m,20*60);return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0")}
/* ── النهايةُ بالمحرّك الواحد (REQUEST_LENGTH_SCRIPT) الذي يحسب به الخادم ──
   الأيامُ نفسُها ← طولُ الموعد نفسه، ويومٌ واحد يُنقل ← طولُه، وإلا نمطُ اللائحة لساعات المقرّر، وإلا 50/80.
   وما أجاب به الخادمُ لهذه الأيام وهذه البداية يُقدَّم على الحساب هنا. ولا تُقصّ النهايةُ عند الثامنة مساءً:
   «19:30 – 20:00» كانت تُخفي محاضرةً تنتهي 20:20 ويمنعها الفحص (المالك 2026-10-30). */
${REQUEST_LENGTH_SCRIPT}
function lengthPatternsOf(it){return((data&&data.lengthPatterns)||{})[courseIdOf(it)]||[]}
function ownOf(it){if(!it||it.rowId==null)return null;var o=originalOf(it),r=rangeOf((it.before||{}).time);if(!o.days.length||!r||r[1]<=r[0])return null;return{days:o.days,minutes:r[1]-r[0]}}
function sameSlots(list,days,start){return !!(list&&list.length&&list.length===days.length&&list.every(function(sl){return days.indexOf(sl.day)>=0&&sl.start===start}))}
function slotsFor(it,days,start){days=days||[];if(!it||!days.length||!start)return [];
if(sameSlots(it.computedSlots,days,start))return it.computedSlots;
if(sameSlots(it.slots,days,start))return it.slots;
return meetingSlots(days,start,lengthPatternsOf(it),it.action==="change"?ownOf(it):null)}
function endOf(it,days,start){return slotsFor(it,days,start).reduce(function(m,sl){return sl.end>m?sl.end:m},"")}
/* نصُّ المواعيد: «16:00 – 16:50» لطولٍ واحد، و«16:00 – 18:50 (ن) · 16:00 – 17:50 (ر)» حين تختلف الأطوال. */
function slotsText(list){if(!list||!list.length)return "";var a=list[0];
if(list.every(function(sl){return sl.start===a.start&&sl.end===a.end}))return a.start+" – "+a.end;
var groups=[];list.forEach(function(sl){var k=sl.start+"|"+sl.end,g=groups.filter(function(x){return x.k===k})[0];if(!g){g={k:k,s:sl.start,e:sl.end,d:[]};groups.push(g)}g.d.push(sl.day)});
return groups.map(function(g){return g.s+" – "+g.e+" ("+g.d.map(dayShort).join(" ")+")"}).join(" · ")}
/* بدايةٌ لا تتّسع لها المحاضرةُ قبل الثامنة مساءً لا تُعرض زرّاً. */
function fitsDay(it,days,t){var e=endOf(it,days,t);return !e||mins(e)<=20*60}
/* لقاءٌ ممتدّ (مختبر/ورشة): يومٌ واحد أطول من محاضرة اللائحة — يبقى طولُه إن نُقل. */
function blockOf(b){if(!b)return 0;var m=/(\\d{1,2}:\\d{2})\\D+(\\d{1,2}:\\d{2})/.exec(String(b.time||""));
if(!m||String(b.days||"").split("·").filter(function(x){return x.trim()}).length!==1)return 0;var span=mins(m[2])-mins(m[1]);var df=DAYS.filter(function(x){return x[1]===String(b.days||"").trim()})[0],exp=df&&LONG[df[0]]?LONG.fmonday:SHORT;return span>LONG.fmonday||(span>0&&span!==exp)?span:0}
/* بداياتٌ جاهزة بضغطة: الأحد والثلاثاء والخميس محاضراتٌ قصيرة كل ساعة،
   والاثنين والأربعاء محاضراتٌ طويلة كل ساعة ونصف. ووقتٌ آخر يبقى متاحاً. */
function startChoices(days){var long=days.some(function(d){return LONG[d]}),short=days.some(function(d){return !LONG[d]});
if(long&&!short)return ["08:00","09:30","11:00","12:30","14:00","15:30","17:00","18:30"];
return ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"]}
function fmtDays(days){return days.map(function(d){
var f=DAYS.filter(function(x){return x[0]===d})[0];return f?f[1]:d}).join(" · ")}
function dt(iso){if(!iso)return "";var d=new Date(iso);return isNaN(d)?"":
d.toLocaleDateString("ar-KW-u-nu-latn",{month:"long",day:"numeric"})+" "+d.toLocaleTimeString("ar-KW-u-nu-latn",{hour:"2-digit",minute:"2-digit"})}
function clockOf(iso){var d=new Date(iso);return isNaN(d)?"":("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2)}
var EVENTS={"link-created":"أُنشئ الرابط","link-opened":"فُتح الرابط","submitted":"أرسلتَ طلبك","unchanged-confirmed":"ثُبّت جدولك كما هو","schedule-edited":"عُدّل الموعد المرتبط بطلبك",
"received":"وصل إلى صندوق القسم","item-fixed":"ثُبّت بند","item-rejected":"رُفض بند",
"alternative-offered":"عُرض عليك بديل","alternative-chosen":"اخترتَ بديلاً","settled":"أُغلق الطلب",
"schedule-approved":"اعتُمد الجدول","department-replied":"ردّ القسم واقترح","instructor-replied":"رددتَ على القسم","proposal-accepted":"وافقتَ على مقترح القسم","rejected-alt":"رُفض بندٌ وعُرض عليك بديل"};
/* ألفاظُ حالة الحوار من الموضع الواحد (instructorRequestThread)، لا نسخةٌ منها. */
var NEG=${JSON.stringify(NEGOTIATION_LABEL)};
function actionName(action){return action==="add"?"مضاف":action==="change"?"معدّل":action==="delete"?"محذوف":"كما هو"}
function requestedText(it){
 if(it.action==="delete")return "حذف المقرر من الجدول";
 if(it.action==="change"||it.action==="add")return (it.days.length?fmtDays(it.days):"لم تُحدّد الأيام")+" · "+(it.start?slotsText(slotsFor(it,it.days,it.start)):"لم يُحدّد الوقت");
 var base=it.before||it.after||{};return (base.days||"")+" · "+(base.time||"")
}
/* النطاقُ الزمنيّ جزيرةٌ يسارية: «14:00 – 15:20» تُقرأ هكذا في كل موضعٍ من الصفحة، لا معكوسةً داخل سطرٍ عربي. */
function ltr(t){return t?'<bdi dir="ltr" class="num">'+esc(t)+'</bdi>':""}
function requestedHtml(it){
 if(it.offeringId||it.computedSlots&&it.computedSlots.length)return (it.computedSlots||it.slots||[]).map(function(sl){return esc(fmtDays([sl.day]))+" · "+ltr(sl.start+" – "+sl.end)}).join(" · ");
 if(it.action==="delete")return "حذف المقرر من الجدول";
 if(it.action==="change"||it.action==="add")return esc(it.days.length?fmtDays(it.days):"لم تُحدّد الأيام")+" · "+(it.start?ltr(slotsText(slotsFor(it,it.days,it.start))):"لم يُحدّد الوقت");
 var base=it.before||it.after||{};return esc(base.days||"")+" · "+ltr(rangeText(base.time||""))}
function rawItem(it){return{itemId:it.itemId,offeringId:it.offeringId,retryOffering:it.retryOffering,rowId:it.rowId,action:it.action,
 courseId:it.action==="add"?it.courseId:undefined,
 collegeId:it.action==="add"?it.collegeId:undefined,sectionId:it.action==="add"?it.sectionId:undefined,
 days:(it.action==="change"||it.action==="add")?it.days:[],start:(it.action==="change"||it.action==="add")?it.start:"",excuse:it.excuse,
 key:it.action==="add"&&!it.offeringId?(it.key||(it.key=newKey())):undefined}}
/* مفتاحُ البند الثابت: حجزُ الوقت المؤقّت يُعرف به لا برقم البند — إلغاءُ إضافةٍ قبله يُزيح الأرقام. */
function newKey(){return "n"+Math.random().toString(36).slice(2,10)}
function holdKeyOf(it){return it?(it.rowId!=null?"r"+it.rowId:it.itemId?"i"+it.itemId:it.offeringId?"o"+it.offeringId:"k"+(it.key||(it.key=newKey()))):""}
/* إلغاءُ الإضافة أو التعديل يُفرج حجزَ ذلك البند وحده، فلا يبقى وقتٌ تركه الأستاذ محجوزاً عليه. */
function releaseHold(it){if(!it||!data||!data.windowOpen)return;var hk=holdKeyOf(it);holdSig[hk]=null;holdSeq[hk]=(holdSeq[hk]||0)+1;
 fetch("/api/public/request/"+encodeURIComponent(TOKEN)+"/hold",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({release:true,item:rawItem(it)})}).catch(function(){})}
/* «تعديل» دون لمس شيء ليس تغييراً: الأيامُ والبدايةُ كما في الموعد القائم، فيُرسل إبقاءً ولا يُعدّ في «معدّل». */
function unchangedEdit(it){return it.action==="change"&&sameAsBefore(it)}
/* موعدٌ جديدٌ ناقص (بلا أيامٍ أو وقت): لا يُعدّ جاهزاً. */
function incompleteItem(it){return(it.action==="change"||it.action==="add")&&(!it.days.length||!it.start)}
function payloadItems(){return state.map(function(it){if(unchangedEdit(it))return{rowId:it.rowId,action:"keep",days:[],start:"",excuse:it.excuse};return rawItem(it)})}
/* الفحصُ يرى بندَه نفسَه كما هو عليه الآن (ولو لم يتغيّر)، وغيرَه كما سيُرسل. */
function payloadWith(i){var list=payloadItems();if(state[i])list[i]=rawItem(state[i]);return list}
function courseOf(it){var b=it.before||{},a=it.after||{};return b.courseName||a.courseName||"المقرر"}
/* الكليةُ تُكتب على المحاضرة حين يدرّس الأستاذ في أكثر من كلية: بلا ذلك
   تبدو محاضرتان بالاسم نفسه كأنهما واحدة. */
/* الرسالةُ بلغة الأستاذ لا بلغة اللائحة: «تتابع مرتفع على الأستاذ (2) — م.6/2،3»
   صحيحةٌ للقسم، ولا تقول للأستاذ ماذا يفعل. فتُقال له بجملةٍ تشرح وتدلّ. */
var FRIENDLY=[
 [/^تتابع مرتفع على الأستاذ/,"محاضراتك متتالية في هذا اليوم أكثر من المسموح — اترك فاصلاً بينها أو اختر يوماً آخر."],
 [/^تكرار شعب المقرر في نفس الوقت/,"شعبةٌ أخرى من المقرر نفسه في هذا الوقت — اختر وقتاً آخر ليتمكّن الطلبة من التسجيل."],
 [/^التدوير غير محقق/,"محاضراتك كلها في الفترة نفسها — نوّع بين الصباح وما بعده إن أمكن."],
 [/^داخل وقت اجتماع القسم/,"هذا الوقت محجوز لاجتماع القسم — اختر وقتاً آخر."],
 [/^خارج المعتاد تاريخياً/,"هذا الوقت غير معتاد لهذا المقرر — يُقبل مع ذكر السبب."],
 [/^يتقاطع هذا الوقت مع مقرّرٍ يشترك فيه طلبتك/,"طلبتُك مسجّلون في مقررٍ آخر في هذا الوقت — اختر وقتاً آخر."]
];
/* «هذا المقرّر 4 ساعات… جرّب الاثنين 80د · … أو الثلاثاء 100د…» صحيحةٌ للقسم، لكنها تَعِد الأستاذَ بتوزيعاتٍ
   لا تُختار من هذه الصفحة (أطوالُ لقاءٍ يحدّدها القسم)، فيجرّبها فيُردّ ثانيةً. فتُقال له جملةٌ تدلّه على الزرّ
   الذي يمرّ فعلاً، أو على أن يُبقي موعده حين لا يوجد ما يُختار من هنا. */
function notesHtml(it){var ns=((it&&it.notes)||[]).filter(function(n){return n.kind!=="balance"});if(!ns.length)return "";
 var AN=function(n){return String(n).replace(/[0-9]/g,function(d){return "٠١٢٣٤٥٦٧٨٩".charAt(+d)})};
 var SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
 var MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
 var COPY='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/></svg>';
 return '<div class="reg-notes" role="note">'+ns.map(function(n){
  if(n.kind==="balance"&&n.data){var m=Math.max(0,Math.min(100,+n.data.morning||0));
   return '<div class="reg-note" data-k="balance">'+SUN+'<span class="reg-pct">'+AN(m)+'٪</span><span class="reg-bar" aria-hidden="true"><i style="width:'+m+'%"></i></span><span class="reg-pct">'+AN(100-m)+'٪</span>'+MOON+'<b>'+esc(n.article)+'</b><span>الصباح ٥٠–٧٠٪</span></div>'}
  return '<div class="reg-note" data-k="sections">'+COPY+'<span>تكرار الشعب في الوقت نفسه</span><b>'+esc(n.article)+'</b><span>الأفضل تفريقها</span></div>'}).join("")+'</div>'}
function verdictText(it){var n=String(it&&it.note||"");
 if(/لا يغطّيها/.test(n))return it.shapes&&it.shapes.length?"الأيام المختارة لا تغطي ساعات هذا المقرر الأسبوعية. اختر أحد الخيارات تحته.":"ساعات هذا المقرر تحتاج توزيعاً يحدّده القسم. أبقِ موعدك كما هو، أو اكتب للقسم ما تريده.";
 return friendly(n)}
function friendly(text){text=String(text||"");for(var k=0;k<FRIENDLY.length;k++){if(FRIENDLY[k][0].test(text))return FRIENDLY[k][1]}return text}
function collegeNameOf(it){return it.action==="add"?(it.collegeName||(it.after&&it.after.collegeName)||""):((it.before&&it.before.collegeName)||"")}
function manyColleges(){var seen={};state.forEach(function(it){var c=collegeNameOf(it);if(c)seen[c]=1});return Object.keys(seen).length>1}
function collegeOf(it){return it.action==="add"||manyColleges()?collegeNameOf(it):""}
function shortCollege(v){return String(v||"").replace(/^\\s*كلية\\s+/,"")}
/* العددُ بلغته: «موعد واحد» و«موعدان» لا «1 مواعيد» — القاعدة الواحدة من arabicCount.ts. */
${ARABIC_COUNT_SCRIPT}
/* تنبيه «لديك مقترح دراسي من القسم»: يُرسم أعلى الصفحة متى كان بابُ ردٍّ مفتوحاً. */
${PROPOSAL_ALERT_SCRIPT}
var proposalBanner="";
function loadProposalBanner(){pbLoad([TOKEN],function(items){var h=pbHtml(items);if(h!==proposalBanner){proposalBanner=h;if(data)paint()}})}
function toneText(it){return it.raced&&it.tone==="bad"?"سبقك زميل ⏱️":it.tone==="ok"?"الوقت متاح":it.tone==="warn"?"يحتاج سبب استثناء":it.tone==="bad"?"يوجد مانع":it.tone==="checking"?"يُفحص الآن…":""}
function wasText(it){var b=it.before||{};return it.action==="add"?"":((b.days||"")+(b.time?" · "+b.time:""))}
var REASONS={room:"لا تتوفّر قاعة في هذا الوقت",instructor:"يتعارض مع أستاذ آخر",regulation:"مخالفة للائحة",cohort:"يتقاطع مع مقرّر يشترك طلبتُه",load:"النصاب",department:"قرار القسم",other:"سبب آخر"};
/* قرارُ القسم يُقرأ في البطاقة نفسها، لا في تبويبٍ آخر: من رُفض بندُه يرى
   السببَ والبدائلَ حيث يعدّل، ويطبّق البديلَ بضغطة. */
function decisionBox(it,i,open){var d=it.decision;if(!d||!d.state||d.state==="pending")return "";
 if(d.state==="fixed")return '<div class="dept" data-state="fixed"><i aria-hidden="true">✓</i>ثبّته القسم'+(d.note?' · '+esc(d.note):'')+'</div>';
 /* وحين يصير الرفضُ ببدائل حواراً، تُعرض البدائلُ في الحوار بزرّ «أوافق» (threadBox). */
 var alts=it.negotiation==="proposed"?[]:(d.alternatives||[]);
 var askedAt=it.slots&&it.slots.length?fmtDays(it.slots.map(function(sl){return sl.day}))+" "+it.slots[0].start:"";
 var reasonTxt=d.reasonCode==="room"&&askedAt?"لا تتوفّر قاعة في هذا الوقت للموعد الذي طلبتَه ("+askedAt+")":(d.reasonCode&&REASONS[d.reasonCode]?REASONS[d.reasonCode]:"");
 var reasonHtml=d.reasonCode&&SKREASON[d.reasonCode]?skReason(d.reasonCode,d.reasonCode==="room"?askedAt:""):(reasonTxt?" · "+esc(reasonTxt):"");
 var noteTxt=d.reasonCode==="room"&&alts.length&&/اختر أحد/.test(d.note||"")?"القسم يقترح عليك البدائل التالية.":(d.note||"");
 return '<div class="dept" data-state="rejected"><b><i aria-hidden="true">✕</i>رفضه القسم'+reasonHtml+'</b>'+(noteTxt?'<p>'+esc(noteTxt)+'</p>':'')+
  (alts.length&&open?'<p>بدائل القسم:</p><div class="alts">'+alts.map(function(a){var ds=a.days&&a.days.length?a.days:[a.day];return '<button type="button" data-i="'+i+'" data-dept-alt="'+esc(ds.join(",")+"|"+a.start)+'" aria-label="'+esc(fmtDays(ds)+" "+a.start)+'">'+skAltBtn(ds,a.start)+'</button>'}).join("")+'</div>':'')+
  /* وبعد إغلاق الاستقبال تبقى البدائلُ مقروءة: هي جزءٌ من قرار القسم، لا زرٌّ فحسب. */
  (alts.length&&!open?'<p>بدائل القسم (للاطلاع — أُغلق استقبال الطلبات):</p><div class="alts alts-ro">'+alts.map(function(a){var ds=a.days&&a.days.length?a.days:[a.day];return '<span>'+fmtDays(ds)+" "+esc(a.start)+'</span>'}).join("")+'</div>':'')+'</div>'}
/* ── مسارُ التفاوض ──────────────────────────────────────────────────────────
   كلُّ ما يخصّ الحوار صار في موضعٍ واحدٍ يُرى من أعلى الصفحة: «قرارُك» بطاقةٌ
   واحدة، بند بعد بند (٢ من ٥)، ومعها الموعدُ المقترح كرسمٍ لا كنص، وثلاثةُ
   أزرار: يناسبني، وقتٌ آخر، رسالة. والبنودُ الأخرى تبقى مطويّةً في القائمة. */
var G=SK.G,gi=SK.gi;
function hh(m){m=Math.max(0,Math.round(m));return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0")}
function rangeOf(text){var p=String(text||"").split("–");return p.length>1&&p[0].trim()&&p[1].trim()?[mins(p[0].trim()),mins(p[1].trim())]:null}
function dayShort(k){var n=DAYS.filter(function(d){return d[0]===k})[0];return n?n[1].replace("ال",""):k}
function periodIc(s){return s<720?"sunrise":s<900?"sun":"sunset"}
function initials(n){var w=String(n||"").split(" ").filter(function(x){return x&&x!=="د."&&x!=="أ."&&x!=="أ.د."&&x!=="د"});return w.length?w[0].charAt(0)+(w.length>1?" "+w[w.length-1].charAt(0):""):"أ"}
/* الموعدُ الرسمي الحالي (قبل أي طلب)، والموعدُ المطلوب، والمقترحاتُ المعروضة. */
function curSlot(it){var o=originalOf(it),r=rangeOf((it.before||{}).time);if(!o.days.length||!o.start)return null;
 var s=mins(o.start);return{d:o.days,s:s,e:r?r[1]:mins(endOf(it,o.days,o.start))}}
function askSlot(it){var d=planDays(it),st=planStart(it);if(!d.length||!st)return null;
 var sl=(it.slots||[])[0],e=it.action==="change"||it.action==="add"?mins(endOf(it,d,st)):(sl&&sl.end?mins(sl.end):mins(st)+SHORT);
 return{d:d,s:mins(st),e:e}}
function offeredOf(it){var th=it.thread||[],last=th[th.length-1];
 var list=it.negotiation!=="proposed"?[]:(last&&last.from==="department"&&(last.slots||[]).length?last.slots:((it.decision&&it.decision.alternatives)||[]));
 return list.map(function(a){var ds=a.days&&a.days.length?a.days:[a.day];return{d:ds,s:mins(a.start),e:a.end?mins(a.end):mins(endOf(it,ds,a.start)),id:a.proposalId||""}})}
function proposed0(it){var o=it.negotiation==='proposed'?offeredOf(it):[];return o.length?o[0]:null}
function pendingList(){var out=[];if(!data||!data.request.submittedAt)return out;state.forEach(function(it,i){if(it.negotiation==="proposed"&&offeredOf(it).length)out.push(i)});return out}
/* بقيةُ محاضراته كما هي الآن: ما رُفض طلبُه لا يُحسب، فموعدُه الرسمي هو القائم. */
function othersFor(i){var out=[];state.forEach(function(it,k){if(k===i||it.action==="delete")return;
 var x=(it.action==="change"||it.action==="add")&&it.negotiation!=="proposed"?askSlot(it):(curSlot(it)||askSlot(it));
 if(x)out.push({n:courseOf(it),d:x.d,s:x.s,e:x.e})});return out}
/* رؤى من جدوله هو وحده — والخادمُ هو الحَكَم عند الإرسال، فلا يُقال هنا شيءٌ عن المكان ولا عن اللائحة. */
function gapText(g){var h=Math.floor(g/60),m=g%60;return h?countOf(h,AR.hour)+(m?" و"+countOf(m,AR.minute):""):countOf(m,AR.minute)}
/* زرُّ وقتٍ يُعطَّل فقط إن كان يصطدم بمحاضرةٍ أخرى للأستاذ نفسه في أيامه المختارة — الحكمُ على القاعات للخادم وحده. */
function ownClash(it,i,t){var d=it.days||[];if(!d.length)return false;var s=mins(t),e=mins(endOf(it,d,t));
 return othersFor(i).some(function(o){return o.d.some(function(x){return d.indexOf(x)>=0})&&s<o.e&&o.s<e})}
function insights(x,i){var out=[],hit=null,gap=null,os=othersFor(i);
 os.forEach(function(o){if(o.d.some(function(d){return x.d.indexOf(d)>=0})){
  if(x.s<o.e&&o.s<x.e)hit=o;
  var g=o.s>=x.e?o.s-x.e:x.s>=o.e?x.s-o.e:null;if(g!==null&&(gap===null||g<gap.g))gap={g:g,o:o,after:o.s>=x.e}}});
 if(hit){out.push({t:"bad",i:"x",h:"يتعارض مع "+hit.n+" في جدولك"});return out}
 var first=x.d.every(function(d){return os.every(function(o){return o.d.indexOf(d)<0||o.s>=x.e})});
 out.push({t:"ok",i:periodIc(x.s),h:(first?"أوّل محاضرة لك في ":"تبدأ في ")+fmtDays(x.d)+" الساعة "+hh(x.s)});
 if(gap&&gap.g<=120)out.push({t:gap.g<15?"warn":"ok",i:"coffee",h:gap.g===0?"متتالية مع "+gap.o.n:(gap.g<15?"استراحة قصيرة: ":"فراغ ")+gapText(gap.g)+(gap.after?" قبل ":" بعد ")+gap.o.n});
 out.push({t:"ok",i:"check",h:"لا تعارض مع بقية جدولك"});return out}
/* مسارُ الطلب: أين نحن؟ 0 لم يُرسل، 1 عند القسم، 2 دورُك، 3 اتفقتما وينتظر التثبيت، 4 اكتمل. */
function stageIdx(){var r=data.request;if(!r.submittedAt)return 0;
 var act=state.filter(function(it){return it.action!=="keep"||(it.thread||[]).length});if(!act.length)return 1;
 if(act.some(function(it){return it.negotiation==="proposed"}))return 2;
 var closed=function(it){return it.negotiation==="rejected"||it.negotiation==="agreed"&&it.decision&&it.decision.state==="fixed"};
 if(act.every(closed))return 4;
 if(act.every(function(it){return closed(it)||it.negotiation==="agreed"}))return 3;
 return 1}
var PATH=[["send","أرسلتَ"],["eye","القسم يراجع"],["you","قرارك"],["shield","التثبيت"]];
function confirmedHtml(r){
 var code=r.signature&&r.signature.verifyCode||"";
 return skBackIcon()+'<section class="confirm-wrap" role="status" aria-label="تم تثبيت جدولك"><div class="confirm-card">'+
 '<span class="confirm-check" aria-hidden="true">'+gi("check")+'</span>'+
 '<h1>تم تثبيت جدولك</h1><p class="confirm-sub">جدولك كما هو · لا يلزمك أي إجراء آخر</p>'+
 '<p class="confirm-name">'+esc(data.instructorName)+' · '+esc(data.termName)+'</p>'+
 '<div class="confirm-facts" aria-label="حالة جدولك">'+
 '<div class="confirm-fact">'+gi("cal")+'<span>دون تعديلات</span></div>'+
 '<div class="confirm-fact">'+gi("finger")+'<span>التوقيع محفوظ</span></div>'+
 '<div class="confirm-fact">'+gi("shield")+'<span>مكتمل</span></div></div>'+
 (code?'<details class="confirm-code"><summary>'+gi("check")+'تفاصيل التوقيع</summary>'+verifyHtml(code)+'</details>':'')+
 '</div></section>'
}
function pathHtml(s){if(s===undefined)s=stageIdx();var w=Math.min(s,3)/3*75;
 return '<nav class="path" aria-label="مسار طلبك"><i class="fill" style="inline-size:'+w+'%"></i>'+PATH.map(function(p,k){
  var st=s>=4||k<s?"done":k===s?"now":"next",label=k===0&&s===0?"أرسِل":k===3&&s>=4?"ثُبّت":p[1];
  return '<div class="st" data-s="'+st+'"'+(k===2&&st==="now"?' data-you="1"':'')+'><span class="c">'+gi(st==="done"?"check":p[0])+'</span>'+label+'</div>'}).join("")+'</nav>'}
/* الموعدُ كرسم: أيامُ الأسبوع، ومسطرةُ اليوم من الثامنة إلى الثامنة مساءً. */
function slotCard(x,k,old,tag){var L=480,R=1200;function pos(m){return Math.max(0,Math.min(100,(m-L)/(R-L)*100))}
 var days=DAYS.map(function(d){var kk=x.d.indexOf(d[0])>=0?k:(old&&old.d.indexOf(d[0])>=0?"old":"");return '<div class="sd" data-k="'+kk+'"><i></i>'+dayShort(d[0])+'</div>'}).join("");
 function blk(o,kk){var a=pos(o.s),b=pos(o.e);return '<i class="blk" data-k="'+kk+'" style="right:'+a+'%;width:'+Math.max(2,b-a)+'%"></i>'}
 var ticks=[8,10,12,14,16,18,20].map(function(h){return '<span class="tk num" style="right:'+pos(h*60)+'%;transform:translateX('+(h===8?"0":h===20?"100%":"50%")+')">'+h+'</span>'}).join("");
 return '<div class="slot"><div class="when"><span class="big num">'+hh(x.s)+' – '+hh(x.e)+'</span><span class="tag" data-k="'+k+'">'+gi(k==="new"?"star":"pen")+tag+'</span></div>'+
  '<div class="sdays" role="img" aria-label="'+esc(fmtDays(x.d))+'">'+days+'</div>'+
  '<div class="ruler" aria-hidden="true"><i class="track"></i>'+(old?blk(old,"old"):"")+blk(x,k)+ticks+'</div>'+
  (old?'<div class="skey"><span><b style="background:'+(k==="new"?"var(--ok)":"#b07d00")+'"></b>'+tag+'</span><span><b style="border:1.5px dashed var(--bad)"></b>موعدك الحالي: '+esc(fmtDays(old.d))+' <span class="num">'+hh(old.s)+'</span></span></div>':'')+'</div>'}
function factsHtml(x,i){return '<ul class="facts">'+insights(x,i).map(function(f){return '<li data-t="'+f.t+'"><span class="b">'+gi(f.i)+'</span><span>'+esc(f.h)+'</span></li>'}).join("")+'</ul>'}
var deckAt=0,deckPick={};
function deckHtml(){var list=pendingList(),n=list.length;if(!n)return "";
 if(deckAt>=n)deckAt=n-1;if(deckAt<0)deckAt=0;
 var i=list[deckAt],it=state[i],offers=offeredOf(it),pk=deckPick[i]||0;if(pk>=offers.length)pk=0;
 var o=offers[pk],cur=curSlot(it),b=it.before||{},d=it.decision||{},th=it.thread||[],last=th[th.length-1];
 /* سببُ المكان يُربط بالموعد الذي يقصده: موعدُه الحالي، لا اقتراحُ القسم الذي تحته. */
 var roomNo=d.state==="rejected"&&d.reasonCode==="room"&&cur;
 var why=d.state==="rejected"?(roomNo?"موعدك الحالي ("+fmtDays(cur.d)+" "+hh(cur.s)+"): لا تتوفّر قاعة في هذا الوقت؛ القسم يقترح موعداً بديلاً.":(REASONS[d.reasonCode]||"رفض القسم الموعد الذي طلبتَه")):"اقترح عليك القسم موعدًا مناسبًا";
 var note=d.state==="rejected"?(roomNo&&/اختر أحد/.test(d.note||"")?"":(d.note||"")):(last&&last.from==="department"?(last.text||""):"");
 var nav=n>1?'<span class="dk-nav"><button type="button" data-deck="-1" aria-label="القرار السابق"'+(deckAt===0?' disabled':'')+'>'+gi("arR")+'</button><button type="button" data-deck="1" aria-label="القرار التالي"'+(deckAt===n-1?' disabled':'')+'>'+gi("arL")+'</button></span>':'';
 var dots=n>1?'<div class="dk-dots" aria-hidden="true">'+list.map(function(_,k){return '<i'+(k===deckAt?' data-on="1"':'')+'></i>'}).join("")+'</div>':'';
 var h='<section class="deck" id="deck" aria-label="قرارك على اقتراح القسم"><div class="dk-top"><span class="dk-ct">'+gi("you")+(n>1?'قراراتك: <b>'+(deckAt+1)+'</b> من <b>'+n+'</b>':'قرارك')+'</span>'+nav+'</div>'+dots+
  '<div class="dk-h"><h2>هل يناسبك هذا الموعد؟</h2><p>'+esc(courseOf(it))+reqTag(it)+(b.sectionCode?' · شعبة '+esc(b.sectionCode):'')+'</p></div>'+
  '<div class="dk-why"><span class="b">'+gi(d.reasonCode==="room"?"door":"clock")+'</span><div>'+esc(why)+(note?'<small>'+esc(note)+'</small>':'')+'</div></div>';
 if(offers.length>1)h+='<div class="offers" role="group" aria-label="اقتراحات القسم">'+offers.map(function(a,k){return '<button type="button" data-offer="'+k+'" data-i="'+i+'" aria-pressed="'+(k===pk)+'">'+esc(fmtDays(a.d))+' <span class="num">'+hh(a.s)+'</span></button>'}).join("")+'</div>';
 h+=slotCard(o,"new",cur,"مقترح القسم")+factsHtml(o,i)+
  '<div class="dk-acts"><button type="button" class="btn-main" data-accept="'+pk+'" data-i="'+i+'">'+gi("check")+'يناسبني</button><div class="pair">'+
  (it.action!=="delete"?'<button type="button" class="btn-alt" data-counter="'+i+'">'+gi("swap")+'وقت آخر</button>':'')+
  '<button type="button" class="btn-alt" data-msg="'+i+'">'+gi("chat")+'اكتب للقسم</button></div>'+
  (n>1?'<button type="button" class="btn-alt wide" data-accept-all="1">'+gi("check")+'وافق على كل القرارات ('+n+')</button>':'')+'</div></section>';
 return h}
function calmHtml(){var r=data.request;if(!r.submittedAt||pendingList().length)return "";
 var s=stageIdx();if(!state.some(function(it){return it.action!=="keep"||(it.thread||[]).length}))return "";
 var m=s===4?["shield","ok","اكتملت مراجعة القسم","كلُّ ما طلبتَه وصله قرارُه."]:s===3?["check","ok","اتفقتما، وبانتظار التثبيت","يثبّته القسم قريبًا. جدولك الرسمي لم يتغيّر بعد."]:["hour","wait","طلبك عند القسم","لا شيء مطلوب منك الآن. سيظهر الردّ هنا."];
 return '<div class="calm" data-t="'+m[1]+'" role="status"><span class="b">'+gi(m[0])+'</span><div><b>'+m[2]+'</b><small>'+m[3]+'</small>'+(anyFixed()?calendarHtml(true):'')+'</div></div>'}
/* الورقةُ السفلية والتوقيعُ والإشعارُ من العدّة المشتركة (src/server/publicKit.ts). */
var openSheet=SK.sheet,closeSheet=SK.close,toast=SK.toast,signSheet=SK.sign;
/* حقلُ «وقت آخر»: يكتب 930 فيصير 09:30 بأرقامٍ إنجليزية، ولا يُؤخذ إلا إن كان كاملاً وداخل الدوام. */
SK.onTime(function(el,val){if(el.getAttribute("data-start")==null||!val)return;var i=+el.getAttribute("data-i");
 if(!state[i]||state[i].start===val)return;state[i].start=val;paint();recheckAll(i)});
function publicItemId(it){return it.itemId||(it.rowId!=null?"row:"+it.rowId:"add:"+(it.offeringRowIds||[]).join(","))}
function publicProposalId(it,o){return o.id||""}
function replySnapshot(i,accept,text,start,days){var it=state[i];if(!it)return null;var offer=accept===null?null:offeredOf(it)[accept];return{itemIndex:i,itemId:publicItemId(it),requestRevision:Number(data.request.requestRevision||0),proposalId:offer?offer.id:"",text:text||"",start:accept===null?(start||""):"",days:accept===null&&days&&days.length?days.slice():undefined}}
function sendReply(snapshot,accept,civil,cb){if(!snapshot){cb("تعذّر إرسال الرد");return}
 fetch("/api/public/request/"+encodeURIComponent(TOKEN)+"/reply",{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({civil:civil,itemIndex:snapshot.itemIndex,itemId:snapshot.itemId,requestRevision:snapshot.requestRevision,accept:accept,proposalId:accept===null?undefined:snapshot.proposalId,text:snapshot.text,start:snapshot.start,days:snapshot.days})})
 .then(function(r){return r.json().then(function(x){return{ok:r.ok,status:r.status,d:x}})}).then(function(x){
  if(!x.ok){cb(x.d.error||"تعذّر إرسال الرد",x.status);return}
  var i=snapshot.itemIndex,it=state[i],fresh=(x.d.request.items||[])[i]||{};data.request=x.d.request;
  it.thread=fresh.thread||[];it.negotiation=fresh.negotiation||"";it.decision=fresh.decision||null;
  if(accept!==null){it.action=fresh.action||it.action;it.after=fresh.after||it.after;it.slots=fresh.slots||[];
   it.days=it.slots.map(function(s){return s.day});it.start=it.slots[0]?it.slots[0].start:"";it.tone="";it.note=""}
  rebase(i);openCards[i]=false;paint();cb(null)})
 .catch(function(){cb("تعذّر الاتصال. تحقّق من الإنترنت.")})}
function askAccept(i,k){var it=state[i],o=offeredOf(it)[k];if(!o)return;var snapshot=replySnapshot(i,k,"","",undefined);
 signSheet({ok:"سُجّلت موافقتك · بانتظار تثبيت القسم",
  what:'<div>'+gi("check")+'<span>توافق على: <b>'+esc(courseOf(it))+'</b></span></div><div>'+gi(periodIc(o.s))+'<span>'+esc(fmtDays(o.d))+' · <span class="num">'+hh(o.s)+' – '+hh(o.e)+'</span></span></div>',
  run:function(civil,done){sendReply(snapshot,k,civil,done)}})}
/* أنماطُ الأيام التي يعرضها «وقت آخر»: بعدد أيام البند نفسه، فالقسمُ يقرّر توزيعَ ساعات المقرّر لا الأستاذ. */
/* أنماطُ «وقت آخر»: أنماطُ اللائحة لساعات المقرّر نفسه بعدد أيام البند (dayPatterns)، لا قائمةٌ ثابتة — كانت تعرض
   «الاثنين · الأربعاء · الخميس» لكل بندٍ من ثلاثة أيام، وليس نمطاً معتمداً (محاكاة 2026-10-30). */
var DPATS={1:[["fsunday"],["fmonday"],["ftuesday"],["fwednesday"],["fthursday"]],2:[["fsunday","ftuesday"],["fmonday","fwednesday"]],3:[["fsunday","ftuesday","fthursday"]]};
function patsFor(days,it){var base=days.slice().sort().join(),own=((data&&data.dayPatterns)||{})[courseIdOf(it||{})]||[];
 var mine=days.length>1?own.filter(function(p){return p.length===days.length}):[];
 var list=(mine.length?mine:(DPATS[days.length]||[])).map(function(p){return p.slice()});
 if(!list.some(function(p){return p.slice().sort().join()===base}))list.unshift(days.slice());return list}
function openCounter(i){var it=state[i],days0=(it.slots||[]).map(function(s){return s.day});if(!days0.length)days0=originalOf(it).days;
 var pats=patsFor(days0,it),pat=0,choice="";
 pats.forEach(function(p,k){if(p.slice().sort().join()===days0.slice().sort().join())pat=k});
 function draw(){var days=pats[pat],choices=startChoices(days).filter(function(t){return fitsDay(it,days,t)});
  if(choices.indexOf(choice)<0)choice="";
  var x=choice?{d:days,s:mins(choice),e:mins(endOf(it,days,choice))}:null,ins=x?insights(x,i):[],bad=ins[0]&&ins[0].t==="bad";
  openSheet('<div class="sk-h"><span class="sk-b">'+gi("swap")+'</span><div><h3>اقترح وقتًا آخر</h3></div></div>'+
   (pats.length>1?'<span class="sk-lbl">'+gi("cal")+'الأيام</span><div class="sk-pick" style="--sk-cols:'+(pats[0].length>1?pats.length:3)+'">'+pats.map(function(p,k){return '<button type="button" data-pat="'+k+'" aria-pressed="'+(k===pat)+'">'+esc(fmtDays(p))+(p.slice().sort().join()===days0.slice().sort().join()?'<small>الحالية</small>':'')+'</button>'}).join("")+'</div>':'')+
   '<span class="sk-lbl">'+gi("clock")+'وقت البداية</span><div class="sk-times">'+choices.map(function(t){return '<button type="button" data-t="'+t+'" aria-pressed="'+(t===choice)+'">'+t+'</button>'}).join("")+'</div>'+
   (x?'<div class="sk-v" data-t="'+(bad?"bad":"ok")+'">'+gi(bad?"x":"check")+'<span>'+esc(bad?ins[0].h:"ينتهي "+hh(x.e)+ins.filter(function(f){return f.i==="coffee"}).map(function(f){return " · "+f.h}).join("")+" · لا تعارض مع بقية جدولك")+'</span></div>':'')+
   '<button type="button" class="sk-btn" id="ctrGo"'+(x&&!bad?'':' disabled')+'>'+gi("finger")+'التالي: التوقيع</button>');
  document.querySelectorAll(".sk-sheet button[data-t]").forEach(function(b){b.onclick=function(){choice=b.dataset.t;draw()}});
  document.querySelectorAll(".sk-sheet button[data-pat]").forEach(function(b){b.onclick=function(){pat=+b.dataset.pat;draw()}});
  var go=document.getElementById("ctrGo");if(go)go.onclick=function(){
   var snapshot=replySnapshot(i,null,"",choice,days);signSheet({ok:"وصل اقتراحك إلى القسم",
    what:'<div>'+gi("swap")+'<span>تقترح على القسم: <b>'+esc(courseOf(it))+'</b></span></div><div>'+gi(periodIc(x.s))+'<span>'+esc(fmtDays(days))+' · <span class="num">'+hh(x.s)+' – '+hh(x.e)+'</span></span></div>',
    run:function(civil,done){sendReply(snapshot,null,civil,done)}})}}
 draw()}
/* «وافق على الكل»: كلُّ قرارٍ معلّق على الاقتراح الذي اخترتَه فيه (الأول إن لم تختر)، بتوقيعٍ واحد. */
function askAcceptAll(){var rows=pendingList().map(function(i){var it=state[i],offers=offeredOf(it),pk=deckPick[i]||0;if(pk>=offers.length)pk=0;return{i:i,k:pk,it:it,o:offers[pk]}});
 if(!rows.length)return;
 var lines=rows.map(function(r){return '<li><span><b>'+esc(courseOf(r.it))+'</b> — '+esc(fmtDays(r.o.d))+' <span class="num">'+hh(r.o.s)+'</span></span></li>'}).join("");
 var snapshots=rows.map(function(r){return replySnapshot(r.i,r.k,"","",undefined)});
 signSheet({ok:"سُجّلت موافقتك على "+countOf(rows.length,AR.decision),
  what:'<ul class="sk-list">'+lines+'</ul>',
  run:function(civil,done){var payload={civil:civil,requestRevision:snapshots[0].requestRevision,accepts:snapshots.map(function(s){return{itemIndex:s.itemIndex,itemId:s.itemId,proposalId:s.proposalId}})};
   fetch("/api/public/request/"+encodeURIComponent(TOKEN)+"/reply-batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}).then(function(r){return r.json().then(function(x){return{ok:r.ok,status:r.status,d:x}})}).then(function(x){if(!x.ok){done(x.d.error||"تعذّر إرسال الرد",x.status);return}data.request=x.d.request;rows.forEach(function(row){var fresh=data.request.items[row.i]||{},it=state[row.i];it.thread=fresh.thread||[];it.negotiation=fresh.negotiation||"";it.decision=fresh.decision||null;it.action=fresh.action||it.action;it.after=fresh.after||it.after;it.slots=fresh.slots||[];it.days=it.slots.map(function(s){return s.day});it.start=it.slots[0]?it.slots[0].start:"";it.tone="";it.note="";rebase(row.i);openCards[row.i]=false});paint();done(null)}).catch(function(){done("تعذّر الاتصال. تحقّق من الإنترنت.")})}})}
function openMsg(i){var it=state[i];
 openSheet('<div class="sk-h"><span class="sk-b">'+gi("chat")+'</span><div><h3>اكتب للقسم</h3><p>'+esc(courseOf(it))+'</p></div></div>'+
  '<textarea id="msgText" maxlength="'+${VOICE_INPUT_LIMIT}+'" data-vi-field="msg" data-show="1" placeholder="اكتب ردّك للقسم…" style="display:block"></textarea>'+VI.html("msg")+
  '<button type="button" class="sk-btn" id="msgGo" data-reply="'+i+'">'+gi("finger")+'التالي: التوقيع</button>');
 var ta=document.getElementById("msgText");VI.wire();setTimeout(function(){ta.focus()},120);
 document.getElementById("msgGo").onclick=function(){var t=ta.value.trim();if(!t){ta.focus();return}var snapshot=replySnapshot(i,null,t,"",undefined);
  signSheet({ok:"وصلت رسالتك إلى القسم",what:'<div>'+gi("chat")+'<span>'+esc(t.length>160?t.slice(0,160)+"…":t)+'</span></div>',
   run:function(civil,done){sendReply(snapshot,null,civil,done)}})}}
/* خيطُ البند: التاريخُ فقط. أمّا الردّ فمن بطاقة «قرارك» أو من زرّ الرسالة. */
function threadBox(it,i){var r=data.request,th=it.thread||[],neg=it.negotiation||"";
 if(!r.submittedAt||!neg||it.action==="keep"&&!th.length)return "";
 var h='<div class="thread" data-neg="'+esc(neg)+'"><div class="thread-head"><b>الحوار مع القسم</b><span class="neg" data-neg="'+esc(neg)+'">'+esc(NEG[neg]||"")+'</span></div>';
 if(th.length)h+='<ol class="msgs">'+th.map(function(m){
  var ss=(m.slots||[]).map(function(a){return '<span class="slot-chip">'+esc(fmtDays(a.days&&a.days.length?a.days:[a.day]))+' <bdi dir="ltr">'+esc(a.start+" – "+a.end)+'</bdi></span>'}).join("");
  return '<li data-from="'+esc(m.from)+'"><small>'+(m.from==="department"?esc(m.by||"القسم"):"أنت")+' · '+esc(dt(m.at))+'</small>'+(m.accepted?'<p>✓ وافقتَ على المقترح</p>':'')+(m.text?'<p>'+esc(m.text)+'</p>':'')+(ss?'<div class="slots">'+ss+'</div>':'')+'</li>'}).join("")+'</ol>';
 else if(neg==="awaiting")h+='<p class="thread-q">وصل طلبك القسمَ، وردُّه يظهر هنا.</p>';
 if(neg==="proposed")h+='<div class="thread-act"><button type="button" class="pri" data-focus="'+i+'">'+gi("you")+'قرّر الآن</button></div>';
 else if(neg!=="agreed"||it.decision&&it.decision.state!=="fixed")h+='<div class="thread-act"><button type="button" data-msg="'+i+'">'+gi("chat")+'اكتب رسالة للقسم</button></div>';
 return h+'</div>'}

/* ── قائمةٌ واحدة ────────────────────────────────────────────────────────
   كانت الصفحةُ تعرض المواعيدَ مرّتين: جدولاً للقراءة فوق، ثم «عدّل مواعيدك»
   ببطاقاتٍ للمواعيد نفسها تحته — فيسأل الأستاذ أيّهما جدوله. فصار الجدولُ هو
   القائمة: كلُّ صفٍّ موعدٌ بحالته، والضغطُ عليه يفتحه في مكانه على ما كانت
   البطاقةُ تحمله — غيّر، احذف، تراجع، الأيام والبداية، وقرارُ القسم وحوارُه.
   بترتيب تقرير الاستعلامات وألوانه: الأخضرُ مضاف، والأصفرُ معدّل، والأحمرُ
   محذوف. */
${COURSE_COLOR_JS}
${REQUEST_VISUAL_JS}
var ICONS={clock:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',check:'<path d="m5 12 4 4L19 6"/>',
 trash:'<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
 undo:'<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
 x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',chev:'<path d="m6 9 6 6 6-6"/>'};
function ic(n){return '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+ICONS[n]+'</svg>'}
function actBtn(i,a,icon,label,tone){return '<button type="button" class="act" data-i="'+i+'" data-a="'+a+'"'+(tone?' data-tone="'+tone+'"':'')+' title="'+label+'">'+ic(icon)+'<span>'+label+'</span></button>'}
/* «15:30–16:50» و«15:30 – 16:50» صيغةٌ واحدة، والنطاقُ كلُّه في عزلٍ LTR حيث يُعرض. */
function rangeText(t){return String(t||"").split("–").map(function(x){return x.trim()}).filter(Boolean).join(" – ")}
function actionsHtml(it,i){
 if(it.action==="add")return actBtn(i,"cancel-add","x","إلغاء الإضافة","bad");
 if(it.action==="keep")return actBtn(i,"change","clock","غيّر الموعد")+actBtn(i,"delete","trash","احذف الموعد","bad");
 if(it.action==="change")return actBtn(i,"keep","undo","إلغاء التعديل")+actBtn(i,"delete","trash","احذفه بدلًا منه","bad");
 return actBtn(i,"keep","undo","تراجع عن الحذف");
}
function offeringsHtml(){var list=(data.availableOfferings||[]).filter(function(o){return !state.some(function(it){return it.offeringId===o.id&&!(it.decision&&it.decision.state==="rejected")})});
 if(!data.windowOpen||!list.length)return "";
 var groups={};list.forEach(function(o){var key=[o.collegeId,o.sectionId,o.courseId].join(":");if(!groups[key]){var course=(data.courses||[]).filter(function(c){return Number(c.id)===Number(o.courseId)&&Number(c.collegeId)===Number(o.collegeId)&&Number(c.sectionId)===Number(o.sectionId)})[0]||{};groups[key]={id:key,name:o.courseName||course.name||"مقرر",code:course.code||"",college:o.collegeName||course.collegeName||"",courseId:o.courseId,sectionId:o.sectionId,options:[]}}groups[key].options.push(o)});
 var ordered=Object.keys(groups).map(function(key){return groups[key]}).sort(function(a,b){return a.name.localeCompare(b.name,"ar")});
 var searchable=ordered.map(function(group){return '<details class="offering-course" data-offering-course="'+esc(group.id)+'"><summary><span><b>'+esc(group.name)+reqTag({courseId:group.courseId,sectionId:group.sectionId})+'</b><small>'+esc([group.code,group.college].filter(Boolean).join(" · "))+'</small></span><span class="chip">'+group.options.length+' '+(group.options.length===1?"شعبة":"شعب")+'</span></summary><div class="offering-options">'+group.options.map(function(o){var slots=o.slots.map(function(sl){return '<span class="offering-slot">'+ic("calendar")+'<b>'+esc(fmtDays([sl.day]))+'</b><time>'+esc(sl.start)+' – '+esc(sl.end)+'</time></span>'}).join("");var times=o.slots.map(function(sl){return fmtDays([sl.day])+' '+sl.start+' – '+sl.end}).join('، ');return '<button type="button" class="offering-option" data-offering="'+o.id+'"'+(o.locked?' data-locked="1" aria-disabled="true"':'')+' aria-label="'+esc(o.courseName+'، شعبة '+o.sectionCode+'، '+times+(o.locked?'، '+o.locked:''))+'"><span class="offering-section"><small>شعبة</small><b>'+esc(o.sectionCode)+'</b></span><span class="offering-schedule">'+slots+'</span><span class="offering-pick">'+(o.locked?'🔒<span>'+esc(o.locked)+'</span>':ic("check")+'<span>اخترها</span>')+'</span></button>'}).join("")+'</div></details>'}).join("");
 return '<details class="memory offerings" id="offerings"'+(offeringsOpen?' open':'')+'><summary aria-label="الشعب المتاحة التي تناسب جدولك، '+countOf(list.length, AR.section)+' في '+countOf(ordered.length, AR.course)+'"><span class="offerings-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18M8 14h3M8 17h7"/></svg></span><span class="offering-title">شعب متاحة تناسب جدولك</span><span class="chip">'+countOf(list.length, AR.section)+'</span><small>'+countOf(ordered.length, AR.course)+' · اختر الشعبة المناسبة</small></summary><div class="offering-body"><label class="offering-search-label"><span class="sr">ابحث في المقررات والشعب المتاحة</span><input class="offering-search" id="offeringSearch" type="search" placeholder="ابحث بالمقرر أو الرمز أو الشعبة…" value="'+esc(offeringSearch)+'" autocomplete="off"></label><p class="offering-empty" id="offeringEmpty" hidden>لا توجد شعبة تطابق بحثك.</p><div class="offering-groups">'+searchable+'</div></div></details>'}
function editHtml(it,i){if(it.offeringId)return '<p class="sub">'+gi("check")+'اخترت شعبة قائمة بموعدها. تُسند إليك بعد موافقة القسم.</p>';var h="";h+='<div class="edit"><div class="field-head"><span class="field-title">أيام المحاضرة</span><details class="plib"><summary aria-label="مكتبة الأنماط" title="مكتبة الأنماط">'+PLIB_ICON+'</summary><div class="plib-pop">'+PLIB+'</div></details></div><div class="days">';DAYS.forEach(function(d){h+='<button type="button" data-i="'+i+'" data-day="'+d[0]+'" aria-pressed="'+(it.days.indexOf(d[0])>=0)+'">'+d[1]+'</button>'});
    h+='</div>'+(it.autoNote?'<p class="auto-note" role="status" title="اضغط أيَّ يوم لتبديله">'+gi("star")+'<span>'+esc(it.autoNote)+'</span></p>':'')+bestHtml(it,i)+tcStickHtml(it,i)+'<span class="field-title">وقت البداية</span><div class="starts">'+startList(it).map(function(t){var own=it.start!==t&&ownClash(it,i,t);var bad=it.start!==t&&heat[i]&&heat[i][t]==="bad";if(bad)return '<button type="button" class="start-off" disabled data-heat="bad" aria-label="'+t+' · غير متاح">'+t+whyIcon(i,t)+'</button>';return '<button type="button" data-i="'+i+'" data-quick="'+t+'" aria-pressed="'+(it.start===t)+'"'+(own?' aria-disabled="true" title="لديك محاضرة في هذا الوقت" data-own-clash="1"':'')+heatAttr(i,t)+'>'+t+'</button>'}).join("")+'</div>'+(it.ownT&&it.ownT!==it.start&&ownClash(it,i,it.ownT)?skOwnClash(it,i,it.ownT):'')+heatLegend(i)+'<details class="more-time"'+(skMoreOpen(it,i)?' open':'')+'><summary data-more="'+i+'">'+gi("clock")+'وقت آخر</summary><label class="time"><span class="sr">وقت آخر</span>'+SK.tf('data-i="'+i+'" data-start="1" aria-label="وقت آخر"',it.start)+'</label></details><p class="ends">'+(sameAsBefore(it)?gi("swap")+"هذا موعدك الحالي — غيّر اليوم أو الوقت.":it.days.length&&it.start?gi("clock")+'<span class="ends-l">'+"ينتهي "+'</span>'+skEnds(slotsFor(it,it.days,it.start),it.days,endOf(it,it.days,it.start))+'<span class="ends-src" title="مدّةُ المحاضرة من اللائحة">'+gi("shield")+'</span>':gi("cal")+"اختر اليوم ثم الوقت")+'</p><div class="verdict" data-i="'+i+'" data-tone="'+(it.tone||"")+'"><i aria-hidden="true">'+(it.tone==="ok"?"✓":it.tone==="bad"?"✕":it.tone==="warn"?"!":"…")+'</i><span class="vwrap">'+skVerdict(it)+'</span>'+roomSignalHtml(it)+(it.advice?skAdvice(it.advice):'')+(it.shapes&&it.shapes.length?'<div class="shapes-box"><div class="alts shapes">'+it.shapes.map(function(sh){return '<button type="button" data-i="'+i+'" data-shape="'+esc(sh.days.join(","))+'" aria-label="'+esc(sh.label)+'">'+skShape(sh.label)+'</button>'}).join("")+'</div></div>':'')+(it.alts&&it.alts.length?'<div class="alts">'+it.alts.map(function(a){var ds=a.days&&a.days.length?a.days:[a.day];return '<button type="button" data-i="'+i+'" data-alt="'+esc(ds.join(",")+"|"+a.start)+'" aria-label="'+esc(fmtDays(ds)+" "+a.start)+'">'+skAltBtn(ds,a.start)+'</button>'}).join("")+'</div>':'')+'</div>'+(it.pnote?'<div class="pnote" style="margin:8px 0 0">'+it.pnote+'</div>':'')+notesHtml(it)+academicCardHtml(it)+'<textarea data-i="'+i+'" data-excuse="1" data-vi-field="ex-'+i+'" maxlength="'+${VOICE_INPUT_LIMIT}+'" data-show="'+(it.tone==="warn"?"1":"0")+'" placeholder="سبب الاستثناء — إلزامي">'+esc(it.excuse||"")+'</textarea>'+(it.tone==="warn"?VI.html("ex-"+i):"")+'</div>';return h}
function bodyHtml(it,i,open){/* ما ثبّته القسم كُتب في الجدول الرسمي: للقراءة فقط، والتغييرُ رسالةٌ للقسم — الخادمُ يرفض تعديلَه أصلاً. */
 var fixed=!!(it.decision&&it.decision.state==="fixed");if(fixed)open=false;var h=decisionBox(it,i,open)+threadBox(it,i);
 if(open&&data.mode!=="ta"){if(it.negotiation==="proposed")h+='<p class="hint-pro" title="تعديل الموعد من هنا يبدأ طلبًا جديدًا">'+gi("star")+'<span>للرد على اقتراح القسم: بطاقة «قرارك» أعلاه</span></p>';h+='<div class="acts" role="group" aria-label="خيارات الموعد">'+actionsHtml(it,i)+'</div>';if(it.action==="change"||it.action==="add")h+=editHtml(it,i)}
 else if(!h)h='<p class="appt-ro">انتهت مدّة الطلبات — هذا الموعد للاطلاع.</p>';
 if(fixed)h+='<p class="appt-ro">'+gi("shield")+'<span>ثبّته القسم في جدولك الرسمي، فلا يُعدَّل من هنا.</span> <button type="button" class="link-msg" data-msg="'+i+'">'+gi("chat")+'اكتب للقسم</button></p>';
 return h}
/* ما عدّله الأستاذ في هذه الزيارة ولم يُرسل بعد: قيسٌ على ما حمّله الخادم، لا على «ما تغيّر عن الجدول»
   — فمن أرسل طلبه لا يُقال له «أرسل» وهو لم يلمس شيئاً. */
var baseItems=null;
function editedCount(){if(!baseItems)return 0;var cur=payloadItems(),n=0,len=Math.max(cur.length,baseItems.length);
 for(var k=0;k<len;k++){if(JSON.stringify(cur[k])!==JSON.stringify(baseItems[k]))n++}return n}
function rebase(i){var cur=payloadItems();if(baseItems&&cur[i])baseItems[i]=JSON.parse(JSON.stringify(cur[i]))}
/* تحذيرُ الاستبدال: يظهر في ورقة التوقيع حين يعدّل الأستاذ بنداً اقترح فيه القسم بديلاً. */
function replacedWarn(){var cur=payloadItems(),names=[];
 state.forEach(function(it,i){if(it.negotiation==="proposed"&&baseItems&&JSON.stringify(cur[i])!==JSON.stringify(baseItems[i]))names.push(courseOf(it))});
 return names.length?'<div class="sk-warn">'+gi("alert")+'<span>تعديلك على <b>'+esc(names.join("، "))+'</b> يستبدل اقتراح القسم بطلبٍ جديد. إن أردت قبول اقتراحه فارجع واضغط «يناسبني».</span></div>':""}
var PIPS=["ح","ن","ث","ر","خ"];
function pipsHtml(days){return '<span class="pips" aria-hidden="true">'+DAYS.map(function(d,k){return '<i data-on="'+(days.indexOf(d[0])>=0?1:0)+'">'+PIPS[k]+'</i>'}).join("")+'</span>'}
function rowIcon(it){var neg=it.negotiation,fixed=it.decision&&it.decision.state==="fixed";
 return neg==="proposed"?"you":neg==="rejected"?"x":neg==="agreed"?(fixed?"shield":"check"):it.action==="add"?"plus":it.action==="delete"?"trash":it.action==="change"?"pen":"cal"}
function planTable(){
 if(!state.length)return "";
 var many=manyColleges(),open=data.windowOpen;
 var order=state.map(function(it,i){return{it:it,i:i}}).sort(function(a,b){
  /* الترتيبُ يُثبَّت عند التحميل ولا يُعاد حسابُه: موعدٌ يغيّر الأستاذ يومَه كان يقفز
     إلى موضعٍ آخر تحت إصبعه فيضيع منه. والمضافُ الجديد يأتي في الآخر. */
  return (a.it.ord==null?1e6+a.i:a.it.ord)-(b.it.ord==null?1e6+b.i:b.it.ord)});
 return '<div class="plan"><div class="plan-head"><div><b>جدولك</b><small>'+countOf(state.length,AR.appointment)+(open?' · اضغط الموعد لتغييره أو حذفه':'')+'</small></div></div>'+weekStrip()+'<div class="appts" role="list">'+
  order.map(function(x){var it=x.it,i=x.i,b=it.before||{},moved=it.action==="change";
   var newDays=it.days.length?fmtDays(it.days):"—",newTime=it.start?slotsText(slotsFor(it,it.days,it.start)):"—";
   var days=it.action==="add"||moved?newDays:(b.days||"—"),time=it.action==="add"||moved?newTime:rangeText(b.time||"—");
   var dset=it.action==="add"||moved?it.days:originalOf(it).days;
   /* بندٌ ينتظر قرارَك: يُعرض الموعدُ الذي اقترحه القسم لا الذي رُفض، ويُشطب القديم. */
   var offer=proposed0(it);if(offer){dset=offer.d;time=hh(offer.s)+" – "+hh(offer.e);days=fmtDays(offer.d);moved=true;newDays=days;newTime=time}
   var col=collegeNameOf(it),decidedHere=it.decision&&it.decision.state&&it.decision.state!=="pending",proposed=it.negotiation==="proposed";
   /* ما ينتظر قرارَه يُقرأ في بطاقة «قرارك» أعلى الصفحة، فيبقى صفُّه مطويّاً. */
   var expanded=openCards[i]!==undefined?!!openCards[i]:(!proposed&&!decidedHere&&((!data.request.submittedAt&&(it.action==="change"||it.action==="add"))||it.tone==="bad"));
   var negShown=!!(it.negotiation&&((it.thread||[]).length||decidedHere));
   var act=unchangedEdit(it)?"keep":it.action;
   var neg=negShown?'<span class="neg" data-neg="'+esc(it.negotiation)+'">'+esc(NEG[it.negotiation]||"")+'</span>':'';
   /* وحين يكون للبند حوارٌ تكفي حالةُ الحوار: «معدّل» و«الوقت متاح» و«رفضه القسم» معاً تتناقض. */
   var stat=negShown?'':'<span class="status" data-act="'+esc(act)+'">'+skStat(act)+(act==="keep"?"كما هو":actionName(act))+'</span>';
   var tone=!negShown&&act!=="keep"&&act!=="delete"&&toneText(it)?'<small class="plan-check" data-tone="'+esc(it.tone)+'">'+esc(toneText(it))+'</small>':'';
   var sub=(b.sectionCode?'شعبة '+esc(b.sectionCode):'')+((many||it.action==="add")&&col?(b.sectionCode?' · ':'')+esc(shortCollege(col)):'');
   return '<div class="appt" role="listitem" style="--c:'+skCourseColor(it)+'" id="item-'+i+'" data-act="'+esc(act)+'" data-neg="'+esc(it.negotiation||"")+'" data-open="'+(expanded?"1":"0")+'">'+
    '<button type="button" class="appt-head" data-toggle="'+i+'" aria-expanded="'+expanded+'" aria-controls="item-body-'+i+'" aria-label="'+esc(courseOf(it)+" — "+(act==="keep"?"كما هو":actionName(act))+(expanded?"، اضغط للطيّ":"، اضغط لعرض الخيارات"))+'">'+
     '<span class="ap-ic">'+gi(rowIcon(it))+'</span>'+
     '<span class="ap-main"><b>'+esc(courseOf(it))+reqTag(it)+'</b>'+(sub?'<small>'+sub+'</small>':'')+
      '<span class="ap-when">'+pipsHtml(dset)+'<span class="sr">'+esc(days)+'</span><bdi dir="ltr" class="num">'+esc(time)+'</bdi>'+(moved&&b.time&&rangeText(b.time)!==newTime?'<s><bdi dir="ltr">'+esc(rangeText(b.time))+'</bdi></s>':'')+'</span></span>'+
     '<span class="ap-st">'+stat+neg+tone+'</span>'+
     '<span class="appt-chev">'+ic("chev")+'</span></button>'+
    '<div class="appt-body" id="item-body-'+i+'"'+(expanded?'':' hidden')+'>'+(expanded?bodyHtml(it,i,open):'')+'</div></div>'}).join("")+
  '</div></div>'
}
/* شريط الأسبوع: عرضٌ فقط، من البنود التي تحملها الصفحة أصلاً (state). المحذوف لا يُعدّ. */
/* ── أسبوعُه في رسمٍ واحد ────────────────────────────────────────────────────
   أعمدةُ الأيام وفيها كتلُ المحاضرات في موضعها من اليوم (٨ صباحاً إلى ٨ مساءً): يرى الأستاذ تعارضَه بعينه قبل أن
   يقوله الفاحص. الموعدُ الحاليّ قبل التعديل ظلٌّ متقطّع، والمطلوبُ كتلةٌ ملوّنة، والمحذوفُ مخطّط. */
function weekStrip(){
 skAssignColors();var today=new Date().getDay(),L=480,R=1200,cols={},ghost=false,counts={};
 DAYS.forEach(function(d){cols[d[0]]=[];counts[d[0]]=0});
 function pos(m){return Math.max(0,Math.min(100,(m-L)/(R-L)*100))}
 var cur=0;
 function put(slot,kind){if(!slot)return;slot.d.forEach(function(d){if(!cols[d])return;cols[d].push({s:slot.s,e:slot.e,k:kind,i:cur});if(kind!=="ghost"&&kind!=="del")counts[d]++})}
 state.forEach(function(it,idx){cur=idx;var o=curSlot(it),off=proposed0(it);
  if(it.action==="keep"||unchangedEdit(it)){put(o,"keep");return}
  if(it.action==="delete"){put(o,"del");return}
  if(it.action==="add"){put(askSlot(it),"add");return}
  if(it.decision&&it.decision.state==="rejected"&&it.negotiation!=="proposed"){put(o,"keep");return}
  if(o){put(o,"ghost");ghost=true}
  if(off){put({d:off.d,s:off.s,e:off.e},"prop");return}
  put(askSlot(it),it.decision&&it.decision.state==="fixed"?"fix":"chg")});
 var label="أسبوعك: "+DAYS.map(function(d){return d[1]+" "+counts[d[0]]}).join("، ");
 return '<div class="wk" role="group" aria-label="'+esc(label)+'">'+skKey()+'<div class="wk-body"><div class="wk-axis" aria-hidden="true"><span>8 ص</span><span>12</span><span>4 م</span><span>8 م</span></div><div class="wk-grid">'+DAYS.map(function(d,k){
  var blocks=cols[d[0]].map(function(b){return '<button type="button" class="wb" data-wk="'+b.i+'" data-k="'+b.k+'" aria-label="'+esc(courseOf(state[b.i])+"، "+d[1]+" "+clock(b.s))+'" style="--c:'+skCourseColor(state[b.i])+';inset-block-start:'+pos(b.s)+'%;block-size:'+Math.max(5,pos(b.e)-pos(b.s))+'%"><span>'+esc(skShort(state[b.i]))+'</span></button>'}).join("");
  return '<div class="wc" data-today="'+(k===today?1:0)+'" data-n="'+counts[d[0]]+'"><div class="wc-t">'+blocks+'</div><span class="wc-n">'+d[1]+'</span></div>'}).join("")+
  '</div></div>'+skLegend()+'</div>'
}
/* ── خريطةُ الأوقات ───────────────────────────────────────────────────────────
   بعد اختيار الأيام يُسأل الخادمُ عن كل وقتِ بدايةٍ بالحكم نفسِه، ويُرسم على الزرّ شريطٌ: أخضر يمرّ، أصفر يحتاج سبب
   استثناء، أحمر لا يمكن. والزرُّ لا يُعطَّل بها (القرارُ للخادم عند الإرسال)، وإنما يُرى. */
var heat={},heatKey={},heatTimer={},heatShape={},heatWhy={},heatShapes={};
/* سببُ الوقت غير المتاح أيقونةً لا جملة (B2). */
var WHY_IC={instructor:["user","لديك محاضرة"],room:["door","لا تتوفّر قاعة في هذا الوقت"],facility:["tool","المرفق مشغول"],cohort:["users","طلبة مشتركون"],load:["scale","يتجاوز نصابك"],regulation:["shield","اللائحة"],shape:["cal","الأيام"],window:["lock","مغلق"]};
function whyIcon(i,t){var w=heatWhy[i]&&heatWhy[i][t],m=WHY_IC[w]||["x","غير متاح"];return '<span class="why-ic" title="'+m[1]+'" aria-label="'+m[1]+'">'+gi(m[0])+'</span>'}
function heatAttr(i,t){var h=heat[i]&&heat[i][t];if(!h)return "";
 return ' data-heat="'+h+'" aria-label="'+t+(h==="ok"?" · متاح":h==="warn"?" · يحتاج سبب استثناء":" · غير ممكن")+'"'}
function heatLegend(i){if(heatShape[i]){var shs=state[i]&&state[i].shapes&&state[i].shapes.length?[]:uniqueShapes(heatShapes[i]||[]);return '<div class="heat-key heat-shape" role="status">'+gi("cal")+'<span>أكمل أيام المقرر</span>'+(shs.length?'<div class="alts shapes">'+shs.map(function(sh){return '<button type="button" data-i="'+i+'" data-shape="'+esc(sh.days.join(","))+'" aria-label="'+esc(sh.label)+'">'+skShape(sh.label)+'</button>'}).join("")+'</div>':'')+'</div>'}return heat[i]&&Object.keys(heat[i]).length?'<p class="heat-key" aria-hidden="true"><span data-heat="ok"></span>متاح <span data-heat="warn"></span>يحتاج سبباً <span data-heat="bad"></span>غير ممكن</p>':""}
/* الأنماطُ المقترحة مرّةً واحدة: كانت تُرسم من خريطة الأوقات ومن الحكم معاً فتتكرّر الأزرار. */
function uniqueShapes(list){var seen={};return (list||[]).filter(function(sh){var k=(sh.days||[]).slice().sort().join();if(seen[k])return false;seen[k]=1;return true})}
/* أفضل ثلاثة مواعيد: من الأوقات التي حكم الخادمُ بأنها متاحة، مرتّبةً بقربها من محاضراته الأخرى. لا تظهر إن لم توجد ثلاثة صالحة. */
function bestTimes(it,i){var h=heat[i];if(!h||heatShape[i]||!it.days.length)return [];
  var currentAcademic=academicClashCount(it,it.start);
 var os=othersFor(i).filter(function(o){return o.d.some(function(x){return it.days.indexOf(x)>=0})});
 var out=startList(it).filter(function(t){return h[t]==="ok"&&t!==it.start&&!ownClash(it,i,t)}).map(function(t){var s=mins(t),why="وقتٌ متاح",score=2;
  if(!os.length){why="يوم فارغ لديك";score=1}
  os.forEach(function(o){var gap=s-o.e;if(gap>=0&&gap<=20){why="بعد محاضرتك مباشرة";score=0}});
  var acad=academicClashCount(it,t);if(acad<currentAcademic)why="أنسب للطلبة";
  return{t:t,why:why,score:score,acad:acad,gapKey:os.reduce(function(m,o){return Math.min(m,Math.abs(s-o.e))},9999)}});
 out.sort(function(a,b){return a.acad-b.acad||a.score-b.score||a.gapKey-b.gapKey||(a.t<b.t?-1:1)});
 return out.length>=3?out.slice(0,3):[]}
function bestHtml(it,i){var best=bestTimes(it,i);if(!best.length)return "";
 return '<div class="best" role="group" aria-label="أفضل ثلاثة مواعيد لك"><p class="shape-lead">أفضل ٣ مواعيد لك:</p><div class="best-row">'+best.map(function(b){return '<button type="button" data-i="'+i+'" data-quick="'+b.t+'" aria-label="'+esc(fmtDays(it.days)+" "+b.t+" — "+b.why)+'">'+skPills(it.days)+'<b class="bp-t">'+ltr(b.t)+'</b><small>'+gi(b.why==="بعد محاضرتك مباشرة"?"clock":"check")+esc(b.why)+'</small></button>'}).join("")+'</div></div>'}
/* المكانُ لا يُسمّى للأستاذ (قرار المالك 2026-10-29: «مخفية اكيد متعمدة»): لا «الأنسب» ولا بدائل ولا اختيار.
   إشارةٌ واحدة 🏫✓ حين يقول الخادمُ إن للموعد مكاناً خالياً (roomAvailable)، والقسمُ يحدّده ويحجزه لحظةَ الإرسال. */
function roomSignalHtml(it){return it.roomOk&&(it.tone==="ok"||it.tone==="warn")?'<button type="button" class="room-ok" data-room-ok="1" title="قاعتك يحددها القسم" aria-label="قاعتك يحددها القسم"><span aria-hidden="true">🏫</span><b aria-hidden="true">✓</b></button>':""}
function startList(it){return startChoices(it.days).filter(function(t){return fitsDay(it,it.days,t)})}
function heatSig(i){return state[i].days.join()+"|"+state[i].blk+"|"+JSON.stringify(payloadWith(i).map(function(p,k){return k===i?{rowId:p.rowId,action:p.action,courseId:p.courseId,collegeId:p.collegeId,sectionId:p.sectionId,days:p.days}:p}))}
function ensureHeat(){state.forEach(function(it,i){
 if(!(it.action==="change"||it.action==="add")||!it.days.length||!openCards[i])return;
 var sig=heatSig(i);if(heatKey[i]===sig)return;heatKey[i]=sig;heat[i]=null;
 clearTimeout(heatTimer[i]);heatTimer[i]=setTimeout(function(){loadHeat(i,sig)},300)})}
function loadHeat(i,sig){var it=state[i];if(!it||heatKey[i]!==sig)return;
 fetch("/api/public/request/"+encodeURIComponent(TOKEN)+"/check-times",{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({itemIndex:i,items:payloadWith(i),starts:startList(it)})})
 .then(function(r){return r.ok?r.json():null}).then(function(d){if(!d||heatKey[i]!==sig)return;heat[i]=d.problem==="shape"?{}:(d.times||{});heatWhy[i]=d.why||{};heatShape[i]=d.problem==="shape";heatShapes[i]=d.shapes||[];paint()}).catch(function(){})}
/* ── حجزُ التحرير والتسابق (C3) ──
   الوقتُ الذي يختاره الأستاذ يُحجز له دقائق؛ ومن سبقه زميلٌ يرى ذلك ومعه بديلان. وخريطةُ الأوقات تتجدّد كل دقيقة تقريباً فيختفي ما أخذه غيره. */
var holdSeq={},holdSig={};
function holdSlot(i){var it=state[i];if(!it||!data||!data.windowOpen||!(it.action==="change"||it.action==="add")||!it.days.length||!it.start)return;
 /* حجزٌ واحدٌ لكل اختيار: لا يُعاد إلا إن تغيّر الوقت أو قارب الحجزُ نهايته. والمفتاحُ هويّةُ البند لا رقمُه. */
 var hk=holdKeyOf(it),sig=it.days.join()+"|"+it.start+"|"+(it.courseId||"");if(holdSig[hk]&&holdSig[hk].sig===sig&&Date.now()-holdSig[hk].at<8*60000)return;holdSig[hk]={sig:sig,at:Date.now()};
 var seq=holdSeq[hk]=(holdSeq[hk]||0)+1;
 fetch("/api/public/request/"+encodeURIComponent(TOKEN)+"/hold",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({itemIndex:i,items:payloadItems()})})
 .then(function(r){return r.json().then(function(d){return{ok:r.ok,status:r.status,d:d}})}).then(function(x){var at=state.indexOf(it);if(holdSeq[hk]!==seq||at<0)return;
  if(x.status===409&&x.d&&(x.d.code==="race-lost"||x.d.code==="hold-refused")){holdSig[hk]=null;var t=it;t.tone="bad";t.note=x.d.error||"سبقك زميل لهذا الوقت ⏱️";t.alts=x.d.alternatives||[];t.roomOk=false;t.raced=x.d.code==="race-lost";heatKey[at]="";ensureHeat();paint();return}
  if(x.ok&&x.d&&x.d.held){it.raced=false}}).catch(function(){})}
setInterval(function(){if(document.visibilityState==="hidden"||!data||!data.windowOpen)return;state.forEach(function(it,i){if(openCards[i])heatKey[i]=""});ensureHeat()},45000);
function planDays(it){return it.action==="add"||it.action==="change"?it.days:(it.slots||[]).map(function(s){return s.day})}
function planStart(it){return it.action==="add"||it.action==="change"?it.start:((it.slots||[])[0]||{}).start||""}
var movement=null,movementLoading=false,movementSince=null,movementError=false;
function loadMovement(){if(movement||movementLoading)return;movementLoading=true;movementError=false;
 fetch("/api/public/request/"+encodeURIComponent(TOKEN)+"/movement",{cache:"no-store"}).then(function(r){if(!r.ok)throw new Error("movement unavailable");return r.json()}).then(function(d){movement=d.movementHistory||[];movementSince=d.movementSince||null;movementLoading=false;if(activeTab==="activity")paint()}).catch(function(){movement=[];movementError=true;movementLoading=false;if(activeTab==="activity")paint()})}
var MOVE_TONE={add:"أُضيف",move:"نُقل",gone:"حُذف"};
function officialHtml(){
 if(movementError)return '<div class="section-head"><b>حركة جدولك الرسمية</b></div><div class="activity-empty">تعذّر قراءة حركة جدولك. افتح التبويب مرة أخرى للمحاولة.</div>';
 if(!movement)return '<div class="section-head"><b>حركة جدولك الرسمية</b><small>ما تغيّر فعلاً في جدولك</small></div><div class="activity-empty">يقرأ الحركة…</div>';
 return '<div class="section-head"><b>حركة جدولك الرسمية</b><small>ما تغيّر فعلاً في جدولك الرسمي</small></div>'+(movement.length?'<ul class="activity-list">'+movement.map(function(m){
  return '<li class="activity-item" data-kind="'+esc(m.tone==="gone"?"delete":m.tone==="add"?"add":"change")+'">'+skActIcon(m.tone==="gone"?"delete":m.tone==="add"?"add":"change")+'<div class="activity-main"><b>'+esc(MOVE_TONE[m.tone]||"تغيير")+(m.day?' · '+esc(m.day):'')+'</b><p>'+esc(m.text)+'</p><div class="decision">'+esc(m.label||"")+'</div></div><time>'+esc(dt(m.at))+'</time></li>'}).join("")+'</ul>':'<div class="activity-empty">'+(movementSince?'لم يتغيّر شيء في جدولك الرسمي منذ أول إرسال لطلبك.':'تبدأ حركة جدولك الرسمية بعد إرسال أول طلب تعديل.')+'</div>')
}
function activityHtml(r){
 var changed=state.map(function(it,i){return{it:it,i:i}}).filter(function(x){return x.it.action!=="keep"});
 var submitted=r.status&&r.status!=="sent";
 var rows=changed.map(function(x){var it=x.it,decision=it.decision||{},college=collegeOf(it),was=wasText(it),status=toneText(it);
  var decisionText=decision.state==="fixed"?"قرار القسم: ثُبّت":decision.state==="rejected"?"قرار القسم: رُفض"+(decision.note?" · "+decision.note:""):submitted?"قرار القسم: بانتظار المراجعة":"لم يُرسل بعد — مسودة";
  return '<li class="activity-item" data-kind="'+esc(it.action)+'">'+skActIcon(it.action)+'<div class="activity-main"><b>'+esc(actionName(it.action))+" · "+esc(courseOf(it))+'</b>'+
   (college?'<p class="activity-meta">الكلية: '+esc(college)+'</p>':'')+
   (was?'<div class="ev-was"><span>كان</span>'+skPillsText((it.before||{}).days||"")+'<span class="sr">'+esc((it.before||{}).days||"")+'</span><bdi>'+ltr(rangeText((it.before||{}).time||""))+'</bdi></div>':'')+
   '<p>'+(it.action==="delete"?'':'المطلوب: ')+requestedHtml(it)+'</p>'+
   (status&&it.action!=="delete"&&!decision.state?'<p class="activity-meta" data-tone="'+esc(it.tone)+'">الفحص: '+esc(status)+'</p>':'')+
   '<div class="decision" data-state="'+esc(decision.state||"pending")+'">'+esc(decisionText)+'</div></div><time>البند '+(x.i+1)+'</time></li>'}).join("");
 var opens={},merged=[];skMergeEvents(r.timeline||[]).forEach(function(e){
  if(e.kind!=="link-opened"){merged.push(e);return}
  var day=String(e.at||"").slice(0,10),o=opens[day];
  if(o){o.count+=1;if(String(e.at)>String(o.at))o.at=e.at}else{o={kind:"link-opened",at:e.at,count:1,itemIndex:e.itemIndex};opens[day]=o;merged.push(o)}});
 var timeline=merged.slice().reverse().map(function(e){var item=typeof e.itemIndex==="number"?state[e.itemIndex]:null,b=item&&(item.before||item.after)||{};
  var detail=(item?(esc(actionName(item.action)+" · "+courseOf(item)+(collegeOf(item)?" · "+collegeOf(item):"")+" · ")+requestedHtml(item)):e.kind==="submitted"?esc(countOf(Number(e.detail)||0,AR.edit,"بلا تعديلات")):esc(e.detail||""));
  return '<li class="activity-item" data-kind="event" data-ev="'+esc(e.kind)+'">'+skEvIcon(e.kind)+'<div class="activity-main"><b>'+esc(e.kind==="link-opened"&&e.count>1?"فتحتَ الرابط "+countOf(e.count,AR.visit)+" · آخرها "+clockOf(e.at):(EVENTS[e.kind]||e.kind))+'</b>'+(detail?'<p>'+detail+'</p>':'')+(e.by&&e.kind!=="received"?'<div class="decision">بواسطة '+esc(e.by)+'</div>':'')+'</div><time>'+esc(dt(e.at))+'</time></li>'}).join("");
 loadMovement();
 return '<div class="section-head"><b>طلبك</b><small>ما طلبتَه، وقرار القسم في كل بند</small></div>'+(rows||timeline?'<ul class="activity-list">'+rows+timeline+'</ul>':'<div class="activity-empty">لم تطلب شيئاً بعد. أي إضافة أو تعديل أو حذف يظهر هنا فوراً.</div>')+verifyHtml(r.signature&&r.signature.verifyCode)+officialHtml()
}
${REQUEST_REPLAY_SCRIPT}
${REQUEST_DAY_AUTOFILL_SCRIPT}
${VOICE_INPUT_JS}
/* ── ذاكرةُ الفصول ───────────────────────────────────────────────────────────
   ما طلبه الأستاذ في الفصل الماضي وكيف قُرّر فيه. «أعد الطلب نفسه» يملأ مسودتَه
   في هذه الصفحة وحدها: لا يُرسل شيئاً حتى يوقّع، والفحصُ المباشر يحكم على كل بندٍ
   كأنه كتبه الآن. وما لا يصلح يُقال له لماذا بدل أن يُسقَط بصمت. */
var prev=null,prevAsked=false,replayNote="";
function loadPrevious(){if(prevAsked)return;prevAsked=true;
 fetch("/api/public/request/"+encodeURIComponent(TOKEN)+"/previous",{cache:"no-store"}).then(function(r){return r.json()}).then(function(d){
  if(d&&d.previous&&d.previous.items&&d.previous.items.length){prev=d.previous;paint()}}).catch(function(){})}
var PSTATE={fixed:"ثُبّت",rejected:"رُفض",pending:"لم يُقرَّر"};
function memoryHtml(){if(!prev||!data||!data.windowOpen||data.request.submittedAt)return "";
 var n=prev.items.length,fx=prev.items.filter(function(p){return p.state==="fixed"}).length,rj=prev.items.filter(function(p){return p.state==="rejected"}).length;
 var tail=(fx?" · ثُبّت "+fx:"")+(rj?" · رُفض "+rj:"");
 var lines=prev.items.map(function(p){return '<li><span class="mem-s" data-s="'+esc(p.state)+'">'+esc(PSTATE[p.state]||"")+'</span><div><b>'+esc(actionName(p.action))+" · "+esc(p.courseName)+'</b><small>'+(p.action==="delete"?"حذف المقرر من الجدول":'<bdi dir="ltr" class="num">'+esc(p.asked)+'</bdi>')+'</small></div></li>'}).join("");
 return '<details class="card memory"><summary>'+gi("clock")+'<span>في '+esc(prev.termName)+' كان لك '+esc(countOf(n,AR.request))+esc(tail)+'</span></summary>'+
  '<ul class="mem-list">'+lines+'</ul>'+
  '<button type="button" class="btn-ghost" id="replay">'+gi("send")+'أعد الطلب نفسه</button>'+
  '<p class="mem-note">يملأ مسودتك فقط ولا يُرسل شيئاً حتى توقّع. وما رُفض في ذلك الفصل لا يُعاد.</p></details>'}
function replayHtml(){return replayNote?'<div class="replay-note" role="status">'+replayNote+'</div>':""}
function replayPrevious(){if(!prev||!data||!data.windowOpen)return;
 var plan=planReplay(prev,state,data.courses,DAYS.map(function(d){return d[0]}),function(cur,days,start){
  var o=originalOf(cur);return o.days.length&&o.start&&o.days.slice().sort().join()===days.slice().sort().join()&&o.start===start});
 plan.ops.forEach(function(op){
  if(op.kind==="add"){var c=op.course;state.push({rowId:null,action:"add",courseId:op.courseId,collegeId:op.collegeId,sectionId:op.sectionId,collegeName:c.collegeName||"",before:{courseName:c.name,sectionCode:""},after:{courseId:op.courseId,courseName:c.name,collegeId:op.collegeId,collegeName:c.collegeName,sectionId:op.sectionId},decision:null,slots:[],days:op.days,start:op.start,excuse:"",tone:"",note:"",alts:[]});return}
  var it=state[op.index];it.tone="";it.note="";
  if(op.kind==="delete"){it.action="delete";it.days=[];it.start="";return}
  it.action="change";it.days=op.days;it.start=op.start});
 var skipped=plan.skipped.map(function(x){return '<li><b>'+esc(x.name)+'</b> — '+esc(x.why)+'</li>'});
 replayNote=(plan.ops.length?'<b>ملأنا مسودتك: '+esc(countOf(plan.ops.length,AR.request))+'.</b> راجعها، والفحص المباشر يقول ما لا يصلح، ثم وقّع وأرسل.':'<b>لم نجد ما يُعاد.</b>')+
  (skipped.length?'<p>لم يُعَد:</p><ul>'+skipped.join("")+'</ul>':'');
 activeTab="schedule";paint();recheckAll()}
/* ── «أضف جدولك إلى تقويمك» (M3) ───────────────────────────────────────────
   اشتراكٌ ثابتٌ يتبع الأستاذ؛ يعرض جدولَه الرسمي ويتحدّث من نفسه. ثلاثة أزرار:
   Apple (webcal) · Google · Outlook. */
function calendarHtml(compact){if(!data||!data.calendarFeed)return "";
 var L=calLinks(location.origin+data.calendarFeed,"جدولي — SCHEDULE");
 return '<div class="cal-line'+(compact?' compact':'')+'"><div class="cal-btns"><a class="cal-btn" href="'+esc(L.apple)+'">'+gi("cal")+'Apple</a><a class="cal-btn" target="_blank" rel="noopener" href="'+esc(L.google)+'">'+gi("cal")+'Google</a><a class="cal-btn" target="_blank" rel="noopener" href="'+esc(L.outlook)+'">'+gi("cal")+'Outlook</a></div>'+
  '<p>جدولك الرسمي في تقويمك · يتحدّث تلقائياً</p></div>'}
function anyFixed(){return state.some(function(it){return it.decision&&it.decision.state==="fixed"})||(data&&data.request&&data.request.status==="settled")}
/* رمزُ التوقيع له مكانٌ يُطابَق فيه: يُعرض مع رابطٍ يفتح التحقّق جاهزاً بالرمز. */
function verifyHtml(code,linkOnly){if(!code)return "";
 var link='<a href="/verify/'+encodeURIComponent(code)+'?t='+encodeURIComponent(TOKEN)+'">'+(linkOnly?'تحقّق من توقيعك لاحقاً':'تحقّق من رمزك')+'</a>';
 /* في شاشة «وصل طلبك» الرمزُ مكتوبٌ فوقه، فلا يُكرَّر: الرابطُ وحده. */
 return '<p class="verify-line">'+(linkOnly?link:'رمز توقيعك <b class="code num">'+esc(code)+'</b> · '+link)+'</p>'}
/* المسودةُ تُحفظ في الجهاز نفسه: أستاذٌ أغلق الصفحة خطأً أو انقطع اتصاله
   يعود فيجد ما كتبه. ولا يُحفظ الرقمُ المدني أبداً. */
var openCards={};
/* ── مسودةٌ لكل تبويب ──
   كانت المسودةُ مفتاحاً واحداً للرابط: تبويبان يكتبان فيه، ويمسحه إرسالُ أحدهما، فيعود الآخرُ بعد «تغيّر الطلب…
   مسودتك محفوظة» فلا يجد شيئاً (محاكاة 2026-10-30). فلكل تبويبٍ مفتاحُه (يبقى بإعادة التحميل)، وتبويبٌ جديد
   يستعيد أحدثَ مسودةٍ لم تُرسل — فلا يضيع ما كُتب في صفحةٍ أُغلقت خطأً. */
var DRAFT_BASE="req-draft:"+TOKEN,TAB_ID=(function(){try{var k="req-tab:"+TOKEN,v=sessionStorage.getItem(k);if(!v){v=Math.random().toString(36).slice(2,10);sessionStorage.setItem(k,v)}return v}catch(e){return ""}})();
var restoredDraft=false,dirty=false,DRAFT_KEY=DRAFT_BASE+(TAB_ID?":"+TAB_ID:"");
/* ملاحظةٌ عامة للقسم عن بناء جدوله كله، لا عن موعدٍ بعينه: تظهر من أول فتح الصفحة. */
var genNote=null,noteOpen=false;
function noteNow(){return genNote!==null?genNote:String((data&&data.request&&data.request.note)||"")}
function saveDraft(){try{localStorage.setItem(DRAFT_KEY,JSON.stringify({at:Date.now(),note:noteNow(),items:payloadItems(),base:baseItems,names:state.map(function(it){return{collegeName:it.collegeName||"",before:it.before||null}})}))}catch(e){}}
/* بندٌ لم يلمسه هذا التبويب (كما حمّله من الخادم) لا يُستعاد فوق ما في الخادم الآن: تبويبٌ آخر أرسل تعديله
   بعد ذلك، و«كما هو» القديمةُ في هذه المسودة كانت ستُرجعه — والإرسالُ بعدها يمحو ما أُرسل. */
function untouchedIn(draft,d){if(!draft||!Array.isArray(draft.base)||d.rowId==null)return false;
 var b=draft.base.filter(function(x){return x&&x.rowId===d.rowId})[0];
 return !!b&&b.action===d.action&&String(b.days||[])===String(d.days||[])&&String(b.start||"")===String(d.start||"")&&String(b.excuse||"")===String(d.excuse||"")}
function clearDraft(){try{localStorage.removeItem(DRAFT_KEY);localStorage.removeItem(DRAFT_BASE)}catch(e){}}
function draftKeys(){var out=[];try{for(var k=0;k<localStorage.length;k++){var key=localStorage.key(k);if(key===DRAFT_BASE||String(key).indexOf(DRAFT_BASE+":")===0)out.push(key)}}catch(e){}return out}
function clearAllDrafts(){try{draftKeys().forEach(function(key){localStorage.removeItem(key)})}catch(e){}}
function readDraft(){try{var fresh=function(d){return d&&Date.now()-d.at<14*864e5?d:null};var own=fresh(JSON.parse(localStorage.getItem(DRAFT_KEY)||"null"));if(own)return own;
 var best=null;draftKeys().forEach(function(key){if(key===DRAFT_KEY)return;var d=null;try{d=fresh(JSON.parse(localStorage.getItem(key)||"null"))}catch(e){}if(d&&(!best||d.at>best.at))best=d});
 try{localStorage.removeItem(DRAFT_BASE)}catch(e){}return best}catch(e){return null}}
/* بصمةُ ما يُرسل (ما سوى «كما هو»): تُقارن بها المسودةُ بما وصل الخادمَ فعلاً. */
function sentSig(list){return (list||[]).filter(function(x){return x&&x.action!=="keep"}).map(function(x){return [x.rowId==null?"":x.rowId,x.action,(x.days||[]).slice().sort().join(","),x.start||"",x.offeringId||"",x.courseId||""].join("~")}).sort().join("|")}
window.addEventListener("beforeunload",function(e){if(dirty&&!skLeaving){e.preventDefault();e.returnValue=""}});
function confirmedRequest(r){return !!(r&&r.status==="settled"&&(r.timeline||[]).some(function(e){return e.kind==="unchanged-confirmed"}))}
/* ── التركيزُ يبقى مكانه بعد كل رسم ──
   الصفحةُ تُرسم كلُّها بعد كل ضغطة، فكان التركيزُ يسقط إلى أعلى الصفحة ويبدأ مستخدمُ لوحة المفاتيح من جديد.
   يُحفظ العنصرُ بسماته قبل الرسم ويُعاد إليه بعده — أو إلى رأس بنده إن لم يعد موجوداً. */
function focusKey(el){if(!el||el===document.body||!host.contains(el))return null;
 var attrs=["data-toggle","data-a","data-day","data-quick","data-shape","data-alt","data-dept-alt","data-start","data-excuse","data-tab","data-offer","data-accept","data-counter","data-msg","data-deck","data-focus","data-wk","data-offering","data-course","data-more","data-i"];
 var sel=el.id?"#"+el.id:el.tagName.toLowerCase();if(!el.id)attrs.forEach(function(a){var v=el.getAttribute(a);if(v!=null&&String(v).indexOf('"')<0)sel+="["+a+'="'+v+'"]'});
 var row=el.closest&&el.closest(".appt");return{sel:sel,row:row?row.id:"",caret:typeof el.selectionStart==="number"?[el.selectionStart,el.selectionEnd]:null,typed:el.hasAttribute&&el.hasAttribute("data-start")?el.value:null}}
function restoreFocus(k){if(!k)return;var el=null;try{el=host.querySelector(k.sel)}catch(e){}
 if(!el&&k.row){var row=document.getElementById(k.row);el=row&&row.querySelector(".appt-head")}
 if(!el||!el.focus)return;try{el.focus({preventScroll:true})}catch(e){el.focus()}
 /* وقتٌ يُكتب ولم يكتمل بعد يبقى كما كُتب: رسمٌ وصل في منتصف الكتابة كان يعيد الحقلَ إلى آخر وقتٍ صالح. */
 if(k.typed!=null&&el.value!==k.typed)el.value=k.typed;
 if(k.caret&&el.setSelectionRange)try{el.setSelectionRange(k.caret[0],k.caret[1])}catch(e){}}
function paint(){
 var keepFocus=focusKey(document.activeElement);
 if(data&&data.windowOpen&&state.length){var sig=JSON.stringify(payloadItems());if(paint.last!==undefined&&paint.last!==sig){dirty=true;saveDraft()}paint.last=sig}
 if(!data){host.innerHTML='<div class="err">تعذّر فتح الرابط.</div>';return}
 var r=data.request,open=data.windowOpen,approved=r.status==="settled",sent=!!r.submittedAt;
 if(confirmedRequest(r)){dirty=false;clearDraft();host.innerHTML=confirmedHtml(r);return}
 var incompleteN=state.filter(incompleteItem).length;
 var changed=state.filter(function(it){return it.action!=="keep"&&!unchangedEdit(it)&&!incompleteItem(it)}).length;
 var blocked=state.filter(function(it){return !unchangedEdit(it)&&!incompleteItem(it)&&(it.tone==="bad"||it.tone==="checking")}).length;
 var ready=incompleteN&&!blocked?"أكمل الموعد الجديد":blocked?"راجع الموانع":changed?countOf(changed,AR.change)+" "+nounFor(changed,AR.readyAdj):"الجدول لم يتغير";
 var edited=editedCount(),pend=pendingList().length,events=(r.timeline||[]).filter(function(e){return e.kind!=="link-opened"&&e.kind!=="link-created"}).length;
 /* الشارةُ تقول الحقيقة في كل حال: مسودة قبل الإرسال، ومرسَلٌ غير معتمدٍ بعده، وهي باقيةٌ في اللقطة والطباعة. */
 var stateTxt=approved?"انتهت مراجعة القسم لطلبك":sent?"مرسَل · غير معتمد بعد · لا يُعتبر تكليفاً":"مسودة · غير معتمدة · لا تُعتبر تكليفاً";
 var showReady=open&&(!sent||edited>0);
 var readyTxt=sent&&!blocked?countOf(edited,AR.edit):ready;
 var readySub=incompleteN&&!blocked?"أيامٌ ووقتُ بدايةٍ ناقصان":blocked?countOf(blocked,AR.item)+" "+nounFor(blocked,AR.needsVerb):(edited===0?"تأكيدك يثبّت الجدول كما هو":sent?"لم تُرسل بعد":"فحص مباشر قبل الإرسال");
 var h=skBackIcon()+proposalBanner+(freshNote?'<div class="fresh-note" role="status">'+gi("eye")+'<span>وصل ردّ من القسم. احفظ تعديلك أو أرسله ثم حدّث الصفحة.</span></div>':'')+
  '<div class="hd"><span class="av" aria-hidden="true">'+esc(initials(data.instructorName))+'</span><div><span class="hd-k">جدولك</span><h1>'+esc(data.instructorName)+'</h1><p class="sub">'+esc(data.termName)+(r.source==="previous-term"?" · مبدئيّ من الفصل السابق":"")+(open||data.mode==="view"?"":(r.window&&r.window.closesAt&&Date.parse(r.window.closesAt)<=Date.now())?" · انتهت مدّة الطلبات، والصفحة للقراءة":approved?" · اكتمل طلبك، والصفحة للقراءة":" · الصفحة للقراءة")+'</p>'+
  '<div class="statusline" role="status" data-approved="'+(approved?"1":"0")+'"><span class="chip st">'+stateTxt+'</span><span id="demoSlot"></span></div>'+deadlineHtml(r,open)+'</div></div>'+tcRibbon(r,open)+
  (anyFixed()&&!calmHtml()?calendarHtml(true):'')+pathHtml()+skNext(open,sent,edited)+
  '<div class="tabs" role="tablist"><button type="button" data-tab="schedule" role="tab" aria-selected="'+(activeTab==="schedule")+'">الجدول والطلبات'+(pend?'<span class="tb">'+pend+'</span>':'')+'</button><button type="button" data-tab="activity" role="tab" aria-selected="'+(activeTab==="activity")+'">الحركة'+(events?'<span class="tb" data-q="mute">'+events+'</span>':'')+'</button></div>'+(restoredDraft&&open?'<div class="restored">استعدنا ما كتبتَه في زيارتك السابقة ولم يُرسل بعد. <button type="button" id="dropDraft">ابدأ من جديد</button></div>':'')+'<div id="err"></div>';
 h+='<section data-panel="schedule" '+(activeTab==="schedule"?'':'hidden')+'>'+(deckHtml()||calmHtml())+offeringsHtml()+replayHtml()+memoryHtml()+planTable();
 if(open&&data.courses&&data.courses.length){
  var collegeMap={};data.courses.forEach(function(c){if(c.collegeId&&!collegeMap[c.collegeId])collegeMap[c.collegeId]=c.collegeName||("كلية "+c.collegeId)});
  var collegeOptions=Object.keys(collegeMap).map(function(id){return{id:Number(id),name:collegeMap[id]}});
  h+='<div class="card add-card"><header><b>تريد إضافة موعد جديد؟</b><small>اختر الكلية أولًا، ثم المقرر والأيام والوقت. القسم والفصل معروفان تلقائيًا.</small></header>'+(chooserOpen?'<div class="course-chooser">'+
   '<label class="course-college"><span>الكلية</span><select id="courseCollege"><option value="">اختر الكلية أولًا</option>'+collegeOptions.map(function(c){return '<option value="'+c.id+'">'+esc(c.name)+'</option>'}).join("")+'</select></label>'+
   '<input class="course-search" id="courseSearch" type="search" placeholder="اكتب اسم المقرر أو رمزه…" autocomplete="off" disabled>'+
   '<p class="course-none" id="courseNone" hidden>لا يوجد مقرر بهذا الاسم في هذه الكلية. جرّب كلمةً أقصر أو رمز المقرر.</p><div class="course-options">'+data.courses.map(function(c){return '<button type="button" class="course-option"'+(c.offering?' data-locked="1" aria-disabled="true"':'')+' data-course="'+c.id+'" data-college="'+c.collegeId+'" data-section="'+c.sectionId+'" data-search="'+esc((c.name+" "+c.code).toLowerCase())+'" hidden><b>'+esc(c.name||c.code)+courseTagsHtml(c.id,c.sectionId)+'</b><small>'+esc([c.code,c.collegeName].filter(Boolean).join(" · "))+(c.offeringNote?" · "+c.offeringNote:"")+(state.some(function(it){return it.action==="add"&&it.courseId===c.id&&Number(it.collegeId)===Number(c.collegeId)})?" · أضفتَه في هذا الطلب":"")+'</small>'+tcCourseLock(c)+'</button>'}).join("")+'</div>'+
   '<button type="button" class="chooser-close" id="closeChooser">إغلاق القائمة</button></div>':'<button type="button" class="add-start" id="openChooser">+ اختر كلية ومقررًا وأضف موعدًا</button>')+'</div>'
 }
 if(open&&!sent&&!noteOpen&&!String(noteNow()).trim())h+='<button type="button" class="note-add" id="noteAdd">＋ أضف ملاحظة للقسم</button>';
 else if(open&&!sent)h+='<div class="card note-card"><header><b>ملاحظة للقسم</b> <small>اختياري — اكتب ما تريد توضيحه عن بناء جدولك، مثل: «أرغب بالتدريس صباحاً» أو «لديّ التزامٌ يوم الأحد».</small></header>'+
  '<textarea id="genNote" maxlength="'+${VOICE_INPUT_LIMIT}+'" data-vi-field="gen" data-show="1" placeholder="اكتب ملاحظتك للقسم…">'+esc(noteNow())+'</textarea>'+VI.html("gen")+'</div>';
 else if(sent&&r.note)h+='<div class="card note-card"><header><b>ملاحظتك للقسم</b></header><p class="note-sent">'+esc(r.note)+'</p></div>';

 h+='</section><section data-panel="activity" '+(activeTab==="activity"?'':'hidden')+'>'+activityHtml(r)+'</section>';
 /* الإرسالُ شريطٌ صغير لا يظهر إلا حين يكون عند الأستاذ ما يُرسل. والتوقيعُ في ورقةٍ تقول ما سيُوقَّع عليه. */
 if(open&&!chooserOpen&&(!sent||edited>0))h+='<div class="send"><div class="sendbar"><div class="sb-t"><b>'+esc(readyTxt)+'</b><small>'+readySub+'</small></div>'+
  '<button type="button" id="send" '+(blocked||incompleteN?'data-blocked="1"':'')+'>'+(incompleteN&&!blocked?gi("arrow")+'أكمله':blocked?gi("arrow")+'اختر وقتاً متاحاً':edited===0?gi("check")+(String(noteNow()).trim()?"ثبّت الجدول وأرسل الملاحظة":"ثبّت الجدول"):gi("finger")+(sent?'أرسل التعديلات':'أرسل الطلب'))+'</button></div></div>';
 host.innerHTML=h;
 var slot=document.getElementById("demoSlot");
 if(demoNode&&slot){var det=document.createElement("details");det.className="demo";det.open=demoOpen;
  var sm=document.createElement("summary");sm.className="chip";sm.textContent="بيئة تجريبية";det.appendChild(sm);det.appendChild(demoNode);
  det.addEventListener("toggle",function(){demoOpen=det.open});slot.appendChild(det);
  var top=document.getElementById("demoTop");if(top)top.style.display="none"}
 wire();
 ensureHeat();
 restoreFocus(keepFocus);
}
/* الأرقامُ كما تُكتب على أيّ لوحة: عربيةً أو فارسيةً أو لاتينية. وكان
   التحويلُ يعرف العربيةَ وحدَها، فمن لوحتُه فارسيةٌ يرى «اكتب ١٢ رقماً» مهما
   كتب — وasciiDigits في الخادم تعرف الاثنتين، فافترقت الصفحةُ عنه.
   (ولا تُكتب هنا أسماءٌ بين علامات الاقتباس المائلة: هذا النصُّ داخل قالبٍ
   نصّيٍّ في الخادم، وأوّلُ علامةٍ منها تُغلقه.) */
function digitsOf(v){return String(v||"")
 .replace(/[٠-٩]/g,function(d){return String("٠١٢٣٤٥٦٧٨٩".indexOf(d))})
 .replace(/[۰-۹]/g,function(d){return String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))})
 .replace(/\\D/g,"")}
function wire(){tcWire();
 var offerings=document.getElementById("offerings");if(offerings)offerings.addEventListener("toggle",function(){offeringsOpen=offerings.open});
 var offeringSearchBox=document.getElementById("offeringSearch"),offeringEmpty=document.getElementById("offeringEmpty");
 function filterOfferings(){if(!offeringSearchBox)return;offeringSearch=String(offeringSearchBox.value||"");var query=offeringSearch.trim().toLocaleLowerCase("ar"),shown=0;
  host.querySelectorAll("[data-offering-course]").forEach(function(group){var summary=group.querySelector("summary"),courseText=String(summary&&summary.textContent||"").toLocaleLowerCase("ar"),courseMatch=!query||courseText.indexOf(query)>=0,count=0;
   group.querySelectorAll("[data-offering]").forEach(function(option){var match=courseMatch||String(option.textContent||"").toLocaleLowerCase("ar").indexOf(query)>=0;option.hidden=!match;if(match)count++});group.hidden=count===0;if(query&&count)group.open=true;shown+=count});
  if(offeringEmpty){offeringEmpty.hidden=!query||shown>0;offeringEmpty.textContent=shown?"":"لا توجد مادة بهذا الاسم ضمن الشعب المتاحة."}}
 if(offeringSearchBox){offeringSearchBox.addEventListener("input",filterOfferings);filterOfferings()}
 host.querySelectorAll("[data-offering]").forEach(function(el){el.onclick=function(){var o=(data.availableOfferings||[]).filter(function(o){return o.id===Number(el.dataset.offering)})[0];if(!o||o.locked||state.some(function(it){return it.offeringId===o.id&&!(it.decision&&it.decision.state==="rejected")}))return;
 var old=state.findIndex(function(it){return it.offeringId===o.id});var selectedOffering={rowId:null,action:"add",retryOffering:true,offeringId:o.id,courseId:o.courseId,collegeId:o.collegeId,sectionId:o.sectionId,collegeName:o.collegeName,
 before:{courseName:o.courseName,sectionCode:o.sectionCode},after:{courseId:o.courseId,courseName:o.courseName,collegeId:o.collegeId,sectionId:o.sectionId,collegeName:o.collegeName,sectionCode:o.sectionCode},
 slots:o.slots,days:o.slots.map(function(sl){return sl.day}),start:o.slots[0].start,excuse:"",tone:"",note:"",alts:[],decision:null};if(old>=0)state[old]=selectedOffering;else state.push(selectedOffering);paint();recheckAll()}});

 host.querySelectorAll("[data-tab]").forEach(function(el){el.onclick=function(){if(el.dataset.tab==="activity"){movement=null;movementSince=null}activeTab=el.dataset.tab||"schedule";paint()}});
 var openChooser=document.getElementById("openChooser");if(openChooser)openChooser.onclick=function(){chooserOpen=true;paint();var search=document.getElementById("courseSearch");if(search)search.focus()};
 var closeChooser=document.getElementById("closeChooser");if(closeChooser)closeChooser.onclick=function(){chooserOpen=false;paint()};
 var courseSearch=document.getElementById("courseSearch"),courseCollege=document.getElementById("courseCollege");
 function paintCourseChoices(){
  var collegeId=Number(courseCollege&&courseCollege.value)||0,query=String(courseSearch&&courseSearch.value||"").trim().toLowerCase();
  if(courseSearch)courseSearch.disabled=!collegeId;
  var shown=0;host.querySelectorAll("[data-course]").forEach(function(option){option.hidden=!collegeId||Number(option.dataset.college)!==collegeId||(query&&String(option.dataset.search||"").indexOf(query)<0);if(!option.hidden)shown++});
  var none=document.getElementById("courseNone");if(none)none.hidden=!collegeId||shown>0
 }
 if(courseCollege)courseCollege.onchange=function(){if(courseSearch)courseSearch.value="";paintCourseChoices();if(courseSearch&&!courseSearch.disabled)courseSearch.focus()};
 if(courseSearch)courseSearch.oninput=paintCourseChoices;paintCourseChoices();
 host.querySelectorAll("[data-course]").forEach(function(option){option.onclick=function(e){if(option.dataset.locked==="1"){tcStar(option,e);return}
   var cid=Number(option.dataset.course)||0,collegeId=Number(option.dataset.college)||0,sectionId=Number(option.dataset.section)||0;if(!cid||!collegeId||!sectionId)return;
   var found=data.courses.filter(function(c){return c.id===cid&&Number(c.collegeId)===collegeId&&Number(c.sectionId)===sectionId})[0];if(!found)return;
   /* إضافةٌ ثانيةٌ للمقرر نفسه تُجمع مع الأولى فتتجاوز ساعاته (B2): لا تُنشأ — يُفتح بندُه القائم، وأيامُه تكتمل بنمط اللائحة من أوّل ضغطة. */
   var held=-1;state.forEach(function(x,k){if(held<0&&x.action==="add"&&!x.offeringId&&Number(x.courseId)===cid&&Number(x.collegeId)===collegeId&&!(x.decision&&x.decision.state==="rejected"))held=k});
   if(held>=0){chooserOpen=false;focusItem(held,"المقرر مضاف — أكمل أيامه هنا.");return}
   state.push({
    rowId:null,action:"add",courseId:cid,collegeId:collegeId,sectionId:sectionId,collegeName:found.collegeName||"",
    before:{courseName:found.name||"مقرر",sectionCode:""},after:{courseId:cid,courseName:found.name||"مقرر",collegeId:collegeId,collegeName:found.collegeName||"",sectionId:sectionId,sectionCode:"",days:"",time:""},decision:null,
    slots:[],days:[],start:"",excuse:"",tone:"",note:"",alts:[]
   });
   /* البندُ الجديد يُفتح لتُختار أيامُه — بعد أول إرسال كان يظهر مطويّاً فلا يُرى أنه ينتظر. */
   state[state.length-1].key=newKey();openCards[state.length-1]=true;
   chooserOpen=false;paint();var card=document.getElementById("item-"+(state.length-1));if(card)card.scrollIntoView({behavior:"smooth",block:"center"})
 }});
 host.querySelectorAll("[data-a]").forEach(function(el){el.onclick=function(){
  var i=+el.dataset.i,it=state[i],act=el.dataset.a;
  if(act==="cancel-add"){releaseHold(it);state.splice(i,1);checkSeq++;paint();recheckAll();return}
  it.action=act;
  if(act==="change")openCards[i]=true;
  if(it.action==="change"&&!it.days.length){
   it.days=(it.slots||[]).map(function(s){return s.day});it.start=(it.slots||[])[0]?it.slots[0].start:"";
   /* بعد أول إرسال يُحفظ الموعدُ الباقي بلا مواعيد: يُفتح بأيامه ووقته من لقطته «كان» لا فارغاً. */
   if(!it.days.length){var was=originalOf(it);it.days=was.days.slice();it.start=was.start}}
  if(it.action==="keep"||it.action==="delete"){releaseHold(it);it.tone="";it.note="";it.alts=[]}
  paint();recheckAll()}});
 host.querySelectorAll("[data-day]").forEach(function(el){el.onclick=function(){
  var i=+el.dataset.i,it=state[i];tapDay(it,el.dataset.day);paint();recheckAll(i)}});
 host.querySelectorAll("[data-wk]").forEach(function(el){el.onclick=function(){focusItem(+el.dataset.wk)}});
 /* 🏫✓ على الهاتف لا تلميحَ بالمرور: الضغطةُ تقول الجملةَ نفسها. */
 host.querySelectorAll("[data-room-ok]").forEach(function(el){el.onclick=function(){toast("check",el.getAttribute("aria-label")||"")}});
 host.querySelectorAll("[data-toggle]").forEach(function(el){el.onclick=function(){var i=+el.dataset.toggle;openCards[i]=!(el.getAttribute("aria-expanded")==="true");paint();var row=document.getElementById("item-"+i),head=row&&row.querySelector(".appt-head");if(head)head.focus({preventScroll:true})}});
 host.querySelectorAll("[data-dept-alt]").forEach(function(el){el.onclick=function(){
  var i=+el.dataset.i,it=state[i],p=el.dataset.deptAlt.split("|");if(!it)return;
  if(it.action!=="add")it.action="change";it.days=p[0].split(",").filter(Boolean);it.start=p[1];paint();recheckAll(i)}});
 host.querySelectorAll("[data-quick]").forEach(function(el){el.onclick=function(){
  var i=+el.dataset.i;
  /* وقتٌ عنده فيه محاضرةٌ أخرى لا يُختار، لكن يُقال له لماذا: أيُّ محاضرةٍ ومتى. */
  if(el.getAttribute("data-own-clash")){state[i].ownT=el.dataset.quick;paint();var om=host.querySelector(".own-msg");if(om)om.scrollIntoView({block:"center",behavior:"smooth"});return}
  state[i].ownT="";state[i].start=el.dataset.quick;paint();recheckAll(i)}});
 host.querySelectorAll("[data-shape]").forEach(function(el){el.onclick=function(){
  var i=+el.dataset.i,it=state[i];if(!it)return;it.days=el.dataset.shape.split(",").filter(Boolean);
  if(!it.start)it.start=(it.slots||[])[0]?it.slots[0].start:"08:00";paint();recheckAll(i)}});
 host.querySelectorAll("[data-alt]").forEach(function(el){el.onclick=function(){
  var i=+el.dataset.i,p=el.dataset.alt.split("|");state[i].days=p[0].split(",").filter(Boolean);state[i].start=p[1];paint();recheckAll(i)}});
 host.querySelectorAll("[data-excuse]").forEach(function(el){el.oninput=function(){
  state[+el.dataset.i].excuse=el.value;dirty=true;saveDraft()}});
 /* ويُحفظ ما كُتب لحظةَ كتابته: كلُّ تعديلٍ على الجدول يعيد الرسم، وكذلك
    جوابُ الحكم حين يصل متأخّراً — والحقلُ يُبنى من حالة الصفحة، فما كُتب ولم
    يُحفظ يُمحى تحت يده ويُردّ إرسالُه بلا سبب. */
 var drop=document.getElementById("dropDraft");if(drop)drop.onclick=function(){clearAllDrafts();dirty=false;location.reload()};
 var send=document.getElementById("send");if(send)send.onclick=submit;
 var replay=document.getElementById("replay");if(replay)replay.onclick=replayPrevious;
 VI.wire(function(key,value){if(key.indexOf("ex-")===0&&state[+key.slice(3)]){state[+key.slice(3)].excuse=value;dirty=true;saveDraft()}if(key==="gen"){genNote=value;dirty=true;saveDraft()}});
 var na=document.getElementById("noteAdd");if(na)na.onclick=function(){noteOpen=true;paint();var g=document.getElementById("genNote");if(g)g.focus()};
 var gn=document.getElementById("genNote");if(gn)gn.oninput=function(){genNote=gn.value;dirty=true;saveDraft()};
 host.querySelectorAll("[data-accept]").forEach(function(el){el.onclick=function(){askAccept(+el.dataset.i,+el.dataset.accept)}});
 host.querySelectorAll("[data-accept-all]").forEach(function(el){el.onclick=askAcceptAll});
 host.querySelectorAll("[data-counter]").forEach(function(el){el.onclick=function(){openCounter(+el.dataset.counter)}});
 host.querySelectorAll("[data-msg]").forEach(function(el){el.onclick=function(){openMsg(+el.dataset.msg)}});
 host.querySelectorAll("[data-offer]").forEach(function(el){el.onclick=function(){deckPick[+el.dataset.i]=+el.dataset.offer;paint()}});
 host.querySelectorAll("[data-deck]").forEach(function(el){el.onclick=function(){deckAt+=+el.dataset.deck;paint()}});
 host.querySelectorAll("[data-focus]").forEach(function(el){el.onclick=function(){var i=+el.dataset.focus,at=pendingList().indexOf(i);if(at>=0){deckAt=at;activeTab="schedule";paint();var d=document.getElementById("deck");if(d)d.scrollIntoView({behavior:"smooth",block:"start"})}else{focusItem(i);var card=document.getElementById("item-"+i);if(card)card.scrollIntoView({behavior:"smooth",block:"center"})}}});
}
/* الحكمُ يُسأل عنه الخادمُ عند كل تغيير: هو وحده يرى الجدول كاملاً، والصفحةُ
   ترى جدولَ صاحبها. وهي تعرض ما يقوله ولا تقرّر شيئاً بنفسها. */
var pending={};
function courseIdOf(it){return Number(it.courseId||(it.after&&it.after.courseId)||(it.before&&it.before.courseId)||0)}
/* وسومُ المقرر الموحّدة (الصحيفة ← نوعُ المتطلب) خاصّةٌ بالمقرر في قسمه؛ لا يعبر المقررُ إلى أقسامٍ أخرى. */
${COURSE_TAGS_JS}
function reqTag(it){var sid=Number(it.sectionId||(it.after&&it.after.sectionId)||(it.before&&it.before.sectionId)||(data&&data.request&&data.request.AdSectionId)||0);return courseTagsHtml(courseIdOf(it),sid)}
/* لا يختار النظامُ أياماً نيابةً عن الأستاذ؛ كلُّ ضغطةٍ تضيف يومها أو تزيله فقط. */
function tapDay(it,d){var was=it.days.length;it.days=completeRequestDays(d,it.days,((data&&data.dayPatterns)||{})[courseIdOf(it)]||[]);it.autoNote=!was&&it.days.length>1?"أكملنا أيام اللائحة · اضغط يوماً لتبديله":""}
/* الحكمُ على المسودة كلها بنداءٍ واحد: يبني الخادم سياقَ الجدول والقواعد مرةً للحزمة، لا مرةً لكل بند. */
var checkSeq=0;
function recheckAll(){
 var active=[];
 state.forEach(function(it,i){
  /* ما ثبّته القسم لا يُفحص من جديد: قرارُه قائم، وحكمُه المحفوظ يبقى كما هو. */
  if(it&&it.decision&&it.decision.state==="fixed")return;
  if((it.action==="change"||it.action==="add")&&it.days.length&&it.start)active.push(i);
  else if(it){it.tone="";it.note="";it.alts=[];it.shapes=[];it.notes=[];it.advice="";it.pnote=""}
 });
 if(!active.length){paint()}
 var seq=++checkSeq;
 active.forEach(function(i){var it=state[i];it.tone="checking";it.note="يفحص التعارض والموانع على جدولك…";it.alts=[];it.shapes=[];it.notes=[];it.advice="";it.pnote="";heatShape[i]=false});paint();
 fetch("/api/public/request/"+encodeURIComponent(TOKEN)+"/check-batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:payloadItems()})})
 .then(function(r){return r.json().then(function(d){if(!r.ok){var e=new Error(d.error||"تعذر الفحص");e.server=true;e.itemIndex=d.itemIndex;throw e}return d})})
 .then(function(d){if(seq!==checkSeq)return;if(d.availableOfferings)data.availableOfferings=d.availableOfferings;(d.items||[]).forEach(function(result){var i=Number(result.itemIndex),it=state[i];if(!it||active.indexOf(i)<0)return;it.tone=result.kind==="clear"?"ok":result.kind==="exception"?"warn":"bad";it.note=result.headline||"";it.alts=result.nearestTimes||[];it.shapes=result.shapes||[];it.notes=result.notes||[];it.advice=result.advice||"";it.pnote=result.patternNotice||"";it.computedSlots=result.slots||[];it.roomOk=result.roomAvailable===true;it.raced=false;if(result.block)it.blk=result.block;if(it.tone==="ok"||it.tone==="warn")holdSlot(i)});paint()})
 /* سببُ الخادم يُقال كما هو، على بنده حين يُعرف؛ و«تعذّر فحص الموعد» لانقطاع الاتصال وحده. */
 .catch(function(err){if(seq!==checkSeq)return;var said=err&&err.server&&err.message,at=err&&typeof err.itemIndex==="number"?err.itemIndex:-1;
  active.forEach(function(i){var it=state[i];if(!it)return;
   if(said&&at>=0){if(i===at){it.tone="bad";it.note=said}else{it.tone="";it.note=""}return}
   it.tone="bad";it.note=said||"تعذّر فحص الموعد الآن. أعد المحاولة قبل الإرسال."});
  if(said&&at>=0&&state[at]&&active.indexOf(at)<0){state[at].tone="bad";state[at].note=said}paint()});
}
/* «كان» يُقرأ من لقطة الموعد الأصلي، لا من slots: بعد الإرسال تحمل slots ما
   طُلب، فكانت المقارنةُ بها تقول لكل تعديلٍ مُرسَل «هذا موعدك الحالي نفسه». */
function originalOf(it){var b=it.before||{},names=String(b.days||"").split("·").map(function(x){return x.trim()}).filter(Boolean);
 var days=names.map(function(n){var f=DAYS.filter(function(x){return x[1]===n})[0];return f?f[0]:""}).filter(Boolean);
 var start=(String(b.time||"").match(/\\d{1,2}:\\d{2}/)||[""])[0];return{days:days,start:start}}
function sameAsBefore(it){if(it.action!=="change")return false;var o=originalOf(it);if(!o.days.length||!o.start)return false;
 return o.days.slice().sort().join()===it.days.slice().sort().join()&&o.start===it.start}
/* ما سيصل القسم بجملةٍ بشرية: نقلٌ من كذا إلى كذا، أو حذف، أو إضافة. تظهر كاملةً قبل التوقيع. */
function receiptLine(it){var c='<b>'+esc(courseOf(it))+reqTag(it)+'</b>',b=it.before||{},col=collegeOf(it);
 var where=col?' · '+esc(col):'',to=it.days.length&&it.start?esc(fmtDays(it.days))+' · '+ltr(slotsText(slotsFor(it,it.days,it.start))):'';
 if(it.action==="delete")return 'حذف '+c+where+(b.days||b.time?' <small>('+esc(b.days||"")+(b.time?' · ':'')+ltr(rangeText(b.time||""))+')</small>':'');
 if(it.action==="add")return 'إضافة '+c+where+(to?' — '+to:'');
 return 'نقل '+c+where+' من '+esc(b.days||"")+(b.time?' · '+ltr(rangeText(b.time)):'')+' إلى '+to}
/* باقٍ كم على إغلاق الطلبات؟ كهرمانياً في آخر يومين، ويختفي بعد الإغلاق. */
function deadlineHtml(r,open){if(!open||!r.window||!r.window.closesAt)return "";
 var end=new Date(r.window.closesAt);if(isNaN(end))return "";var left=Math.ceil((end.getTime()-Date.now())/864e5);if(left<0)return "";
 var when=end.toLocaleDateString("ar",{weekday:"long",day:"numeric",month:"long"});
 return '<p class="deadline" data-urgent="'+(left<=2?1:0)+'">'+(left===0?"يُغلق استقبال الطلبات اليوم":"باقٍ "+countOf(left,AR.day)+" على إغلاق الطلبات")+' · '+esc(when)+'</p>'}
function focusItem(i,msg){openCards[i]=true;activeTab="schedule";paint();if(msg)document.getElementById("err").innerHTML='<div class="err">'+esc(msg)+'</div>';
 var card=document.getElementById("item-"+i);if(card)card.scrollIntoView({behavior:"smooth",block:"center"})}
function submit(){
 var incomplete=state.findIndex(function(it){return(it.action==="change"||it.action==="add")&&(!it.days.length||!it.start)});
 if(incomplete>=0){focusItem(incomplete,"أكمل الأيام ووقت البداية لـ«"+courseOf(state[incomplete])+"» قبل الإرسال.");return}
 var excuse=state.findIndex(function(it){return !unchangedEdit(it)&&it.tone==="warn"&&!String(it.excuse||"").trim()});
 if(excuse>=0){focusItem(excuse,"اكتب سبب الاستثناء للموعد "+(excuse+1)+".");return}
 var blocked=state.findIndex(function(it){return !unchangedEdit(it)&&(it.tone==="bad"||it.tone==="checking")});
 if(blocked>=0){openCards[blocked]=true;activeTab="schedule";paint();var card=document.getElementById("item-"+blocked);if(card)card.scrollIntoView({behavior:"smooth",block:"center"});return}
 var chg=state.filter(function(it){return it.action!=="keep"&&!unchangedEdit(it)}),sent=!!data.request.submittedAt;
 var lines=chg.map(function(it){return '<li><span>'+receiptLine(it)+'</span></li>'}).join("");
 signSheet({
  what:'<div>'+gi(chg.length?"send":"check")+'<span>'+(chg.length?countOf(chg.length,AR.change)+' ستصل القسم':String(noteNow()).trim()?"ملاحظتك ستصل القسم":data.request.source==="previous-term"?"جدولك المبدئي سيصل القسم":"تأكيد جدولك كما هو")+'</span></div>'+replacedWarn()+(lines?'<ul class="sk-list" aria-label="ما سيصل القسم">'+lines+'</ul>':''),
  run:function(civil,done){postSubmit(civil,done)}})
}
/* الإرسالُ نفسُه كما كان: الخادمُ يعيد الحكمَ ويتحقق من التوقيع، والصفحةُ تعرض ما يقوله. */
/* ── إرسالٌ صادق بعد انقطاع ──
   انقطع الردُّ والطلبُ محفوظٌ في الخادم: كان الأستاذ يرى «تعذّر الاتصال»، ثم «تغيّر الطلب بعد فتحه» إن أعاد، ثم
   «لم يُرسل بعد» بعد التحديث — وطلبُه واصل (محاكاة 2026-10-30). فقبل قول «تعذّر» يُسأل الخادمُ: إن كان ما عنده
   الآن هو ما أُرسل للتوّ (بصمةُ البنود نفسُها، وإرسالٌ أحدثُ مما حملته الصفحة) فقد وصل. */
function landedNow(sent,cb){fetch("/api/public/request/"+encodeURIComponent(TOKEN)+"?live=1",{cache:"no-store"}).then(function(r){return r.ok?r.json():null}).then(function(d){
  var r=d&&d.request,was=data&&data.request&&data.request.submittedAt||"";
  cb(r&&r.submittedAt&&r.submittedAt!==was&&sentSig(mapItems(d).map(rawItem))===sentSig(sent)?d:null)}).catch(function(){cb(null)})}
function postSubmit(civil,done){
 /* أثناء الإرسال لا تُقرأ الصفحة من جديد: حفظُ الإرسال نفسه يُطلق حدثاً في البثّ، وقراءتُه في منتصف الطريق
    كانت تقول «وصل ردّ من القسم» عن إرسال الأستاذ نفسه، أو ترسم الجدولَ فوق شاشة «وصل طلبك». */
 sendingNow=true;
 var sentItems=payloadItems();
 fetch("/api/public/request/"+encodeURIComponent(TOKEN),{method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({civil:civil,items:payloadItems(),note:noteNow(),requestRevision:data.request.requestRevision||0})})
 .then(function(r){return r.json().then(function(d){return{ok:r.ok,status:r.status,d:d}})})
 .then(function(x){
  if(!x.ok&&x.status===409&&x.d&&x.d.code==="request-revision"){landedNow(sentItems,function(d){if(d)sentOk({request:d.request,changed:sentItems.filter(function(it){return it.action!=="keep"}).length,unchangedConfirmed:confirmedRequest(d.request)},done);else{sendingNow=false;done(x.d.error||"تعذّر الإرسال",x.status)}});return}
  if(!x.ok){
   sendingNow=false;
   if(typeof x.d.itemIndex==="number"&&state[x.d.itemIndex]){var bad=state[x.d.itemIndex];if(bad.action!=="delete"&&bad.action!=="keep"){bad.tone="bad";bad.note=x.d.error||bad.note;if(x.d.alternatives&&x.d.alternatives.length){bad.alts=x.d.alternatives;bad.roomOk=false}heatKey[x.d.itemIndex]="";ensureHeat()}closeSheet();focusItem(x.d.itemIndex,x.d.error||"تعذّر الإرسال");return}
   done(x.d.error||"تعذّر الإرسال",x.status);return}
  sentOk(x.d,done)})
 .catch(function(){landedNow(sentItems,function(d){if(d)sentOk({request:d.request,changed:sentItems.filter(function(it){return it.action!=="keep"}).length,unchangedConfirmed:confirmedRequest(d.request)},done);else{sendingNow=false;done("تعذّر الاتصال. تحقّق من الإنترنت.")}})});
}
/* «وصل طلبك»: من ردّ الإرسال نفسه، أو مما وجده الخادمُ محفوظاً بعد انقطاع الردّ. */
function sentOk(res,done){var x={d:res};
  dirty=false;clearDraft();
  /* شاشةُ «وصل طلبك» تبقى حتى يضغط «افتح جدولك»: حفظُ الإرسال نفسِه يُطلق حدثاً في البثّ،
     وكانت إعادةُ القراءة التي يطلقها ترسم الجدولَ فوقها فتختفي بعد لحظة ومعها رمزُ التوقيع. */
  liveOff=true;closeLive();
  var code=x.d.request&&x.d.request.signature&&x.d.request.signature.verifyCode||"";
  done();
  if(x.d.unchangedConfirmed){data.request=x.d.request;host.innerHTML=confirmedHtml(x.d.request);window.scrollTo(0,0);return}
  host.innerHTML='<div class="done"><div class="tick">'+gi("check")+'</div><h1>وصل طلبك إلى القسم</h1><div class="done-path">'+pathHtml(pendingList().length?2:1)+'</div>'+
   '<p class="sub">'+esc(countOf(x.d.changed,AR.edit,"بلا تعديلات"))+
   ' · يمكنك فتح الرابط نفسه لمتابعة ما ثُبّت وما رُفض.</p>'+
   /* رمزُ التوقيع يُعطى لصاحبه: هو ما يُطابَق به طلبُه بعد شهرين. */
   (code?'<p class="sub">رمز توقيعك: <b class="code num">'+esc(code)+'</b></p>'+verifyHtml(code,true):'')+
   calendarHtml(false)+'<button type="button" class="btn-main" id="again">'+gi("eye")+'افتح جدولك</button></div>';
  var again=document.getElementById("again");if(again)again.onclick=function(){location.reload()};
  window.scrollTo(0,0)}

function mapItems(d){return (d.request.items||[]).map(function(it){var a=it.after||{};return{itemId:it.itemId,offeringId:it.offeringRowIds&&it.offeringRowIds[0],rowId:it.rowId,action:it.action||"keep",
  courseId:it.action==="add"?Number(a.courseId||0):undefined,collegeId:it.action==="add"?Number(a.collegeId||0):undefined,
  sectionId:it.action==="add"?Number(a.sectionId||0):undefined,collegeName:it.action==="add"?(a.collegeName||""):"",
  before:it.before||it.after,blk:(it.block||blockOf(it.before||it.after)),after:it.after,slots:it.slots||[],days:(it.action==="change"||it.action==="add")?(it.slots||[]).map(function(s){return s.day}):[],
  start:(it.action==="change"||it.action==="add")&&it.slots&&it.slots[0]?it.slots[0].start:"",excuse:it.excuse||"",
  decision:it.decision||null,thread:it.thread||[],negotiation:it.negotiation||"",tone:it.verdict==="clear"?"ok":it.verdict==="exception"?"warn":it.verdict==="conflict"?"bad":"",
  advice:it.advice||"",shapes:it.shapes||[],note:it.reasons&&it.reasons.length?it.reasons[0].text:(it.verdict==="clear"?"الوقت متاح":""),alts:it.nearestTimes||[],roomOk:it.roomAvailable===true}})}
/* ترتيبُ العرض: بحسب الموعد الرسمي عند التحميل، ثم لا يتغيّر في هذه الجلسة. */
function rankState(){state.map(function(it,i){return{it:it,i:i}}).sort(function(a,b){
  var da=planDays(a.it),db=planDays(b.it);var ka=DAYS.map(function(d){return d[0]}).indexOf(da[0]),kb=DAYS.map(function(d){return d[0]}).indexOf(db[0]);
  return (ka<0?9:ka)-(kb<0?9:kb)||mins(planStart(a.it))-mins(planStart(b.it))}).forEach(function(x,rank){x.it.ord=rank})}
/* ── التحديثُ الصامت ──────────────────────────────────────────────────────────
   عودةُ الأستاذ إلى الصفحة بعد دقائق (أو بثٌّ من القسم) تُعيد الجلب. وما كان فيه
   مسودةٌ لم تُرسَل لا يُستبدل أبداً: يُقال له إن عند القسم جديداً ويقرّر هو. */
var lastFetch=Date.now(),refreshing=false,freshNote=false;
function refresh(){
 if(liveOff||sendingNow||refreshing||!data)return;
 refreshing=true;
 fetch("/api/public/request/"+encodeURIComponent(TOKEN)+"?live=1",{cache:"no-store"}).then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d}})}).then(function(x){
  refreshing=false;lastFetch=Date.now();
  /* قراءةٌ بدأت قبل الإرسال وعادت بعده لا تُطبَّق: شاشةُ «وصل طلبك» هي الحاضرة الآن. */
  if(liveOff||sendingNow||!x.ok)return;
  if(JSON.stringify(data.request)===JSON.stringify(x.d.request)&&data.windowOpen===x.d.windowOpen)return;
  /* مسودةٌ لم تُرسل لا تُستبدل أبداً. لكنّ الجديد يُقرأ ويُقال له، سواءٌ وصله بالبثّ أو بالقراءة الدورية:
     بثٌّ لا يبلغ نسخةً أخرى من الخادم ولا يُستعمل في متصفحٍ بلا EventSource، فتبقى القراءةُ هي الطريق. */
  if(dirty){if(!freshNote){freshNote=true;paint()}return}
  var ords={};state.forEach(function(it){if(it.rowId!=null)ords[it.rowId]=it.ord});
  var nowPending=pendingList().length;
  movement=null;movementSince=null;data=x.d;state=mapItems(x.d);rankState();state.forEach(function(it){if(it.rowId!=null&&ords[it.rowId]!=null)it.ord=ords[it.rowId]});
  baseItems=JSON.parse(JSON.stringify(payloadItems()));paint.last=JSON.stringify(payloadItems());dirty=false;freshNote=false;paint();
  onDecisionArrived(pendingList().length>nowPending)}).catch(function(){refreshing=false})}
function onDecisionArrived(newDecision){try{if(navigator.vibrate)navigator.vibrate(30)}catch(e){}
 var d=newDecision?document.getElementById("deck"):null;if(d)d.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"})}
/* ── البثّ الحيّ ──────────────────────────────────────────────────────────────
   اتصالٌ واحدٌ يُفتح والصفحةُ ظاهرة ويُغلق إذا أُخفيت، ويتراجع أُسّياً إن فشل.
   وهو لا يحمل بيانات: يقول «تغيّر شيء»، والصفحةُ تقرأ بالمسار العادي. ومعه نبضٌ
   بطيءٌ كل دقيقتين لمن لا يبلغه البثّ (نسخةٌ أخرى من الخادم، أو شبكةٌ تقطع). */
var live=null,liveBack=2000,liveTimer=null,liveReady=false,liveOff=false,sendingNow=false;
function closeLive(){if(live){live.close();live=null}clearTimeout(liveTimer);liveReady=false}
function openLive(){if(liveOff||live||!window.EventSource||document.visibilityState==="hidden"||!data)return;
 live=new EventSource("/api/public/request/"+encodeURIComponent(TOKEN)+"/events");
 live.addEventListener("ready",function(){liveBack=2000;if(liveReady)refresh();liveReady=true});
 live.addEventListener("changed",function(){refresh()});
 live.onerror=function(){closeLive();liveTimer=setTimeout(openLive,liveBack);liveBack=Math.min(liveBack*2,60000)}}
setInterval(function(){if(document.visibilityState==="visible"&&Date.now()-lastFetch>110000)refresh()},30000);
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"){openLive();if(Date.now()-lastFetch>30000)refresh()}else closeLive()});
window.addEventListener("focus",function(){if(Date.now()-lastFetch>30000)refresh()});
/* ظاهرةٌ لا تعني مقروءة: صفحةٌ تُركت أمام كرسيٍّ فارغ عشرَ دقائق تُغلق بثّها — فالبثُّ
   المفتوح يُحسب على الخادم كلَّ ثانيةٍ يبقى فيها — وتبقى القراءةُ البطيئة أعلاه كل
   دقيقتين، فيصل القرارُ على أي حال. وأوّلُ لمسةٍ تُعيد البثّ وتقرأ. */
var touchedAt=Date.now(),idleClosed=false;
function touched(){touchedAt=Date.now();if(idleClosed&&document.visibilityState==="visible"){idleClosed=false;openLive();if(Date.now()-lastFetch>30000)refresh()}}
["pointerdown","pointermove","keydown","wheel","touchstart"].forEach(function(n){window.addEventListener(n,touched,{passive:true})});
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"){touchedAt=Date.now();idleClosed=false}});
setInterval(function(){if(live&&Date.now()-touchedAt>600000){closeLive();idleClosed=true}},60000);
fetch("/api/public/request/"+encodeURIComponent(TOKEN)).then(function(r){
 return r.json().then(function(d){return{ok:r.ok,d:d}})}).then(function(x){
 if(!x.ok){host.innerHTML='<div class="err">'+esc(x.d.error||"تعذّر فتح الرابط")+'</div>';return}
 data=x.d;lastFetch=Date.now();
 state=mapItems(data);
 rankState();
 baseItems=JSON.parse(JSON.stringify(payloadItems()));
 var draft=data.windowOpen?readDraft():null;
 /* مسودةٌ تطابق ما في الخادم (أُرسلت وانقطع ردُّها) ليست «ما لم يُرسل بعد»: تُمسح بلا شريط. */
 if(draft&&Array.isArray(draft.items)&&sentSig(draft.items)===sentSig(payloadItems())&&String(draft.note||"")===String(data.request.note||"")){clearDraft();draft=null}
 if(draft&&typeof draft.note==="string"&&genNote===null)genNote=draft.note;
 if(draft&&Array.isArray(draft.items)){var byRow={};state.forEach(function(it){if(it.rowId!=null)byRow[it.rowId]=it});var adds=[],applied=String(draft.note||"")!==String(data.request.note||"")?1:0;
  draft.items.forEach(function(d,k){var nm=(draft.names||[])[k]||{};if(d.rowId!=null&&byRow[d.rowId]){var it=byRow[d.rowId];if(it.decision&&it.decision.state==="fixed")return;if(untouchedIn(draft,d))return;if(d.action!==it.action||d.excuse!==it.excuse||(d.action==="change"&&(String(d.days)!==String(it.days)||d.start!==it.start))){it.action=d.action;it.days=d.days||[];it.start=d.start||"";it.excuse=d.excuse||"";it.tone="";it.note="";applied++}}
   else if(d.action==="add"&&d.courseId&&(data.courses||[]).some(function(c){return c.id===d.courseId&&Number(c.collegeId)===Number(d.collegeId)&&Number(c.sectionId)===Number(d.sectionId)})&&!state.some(function(it){return it.action==="add"&&it.courseId===d.courseId&&String(it.days)===String(d.days)&&it.start===d.start})){
    var c=(data.courses||[]).filter(function(c){return c.id===d.courseId&&Number(c.collegeId)===Number(d.collegeId)})[0];
    adds.push({rowId:null,action:"add",offeringId:d.offeringId,courseId:d.courseId,collegeId:d.collegeId,sectionId:d.sectionId,collegeName:c.collegeName||nm.collegeName||"",before:{courseName:c.name,sectionCode:""},after:{courseId:d.courseId,courseName:c.name,collegeId:d.collegeId,collegeName:c.collegeName,sectionId:d.sectionId},decision:null,slots:d.offeringId?((data.availableOfferings||[]).filter(function(o){return o.id===d.offeringId})[0]||{}).slots||[]:[],days:d.days||[],start:d.start||"",excuse:d.excuse||"",key:d.key||newKey(),tone:"",note:"",alts:[]});applied++}});
  /* «استعدنا ما كتبتَه» حين يُستعاد شيءٌ فعلاً؛ مسودةٌ لم يبقَ فيها ما يخالف الخادم تُمسح بلا شريط. */
  state=state.concat(adds);if(applied){restoredDraft=true;dirty=true}else clearDraft()}
 paint();
 loadProposalBanner();
 loadPrevious();
 loadAcademicAdvice();
 openLive();
 if(restoredDraft)recheckAll();
 }).catch(function(){host.innerHTML='<div class="err">تعذّر الاتصال. تحقّق من الإنترنت.</div>'});
})();</script></body></html>`;
}
