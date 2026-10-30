/**
 * ── المظهر البصري لصفحة طلب الأستاذ ─────────────────────────────────────────
 *
 * ألوانُ المقرّرات في رسم الأسبوع، وأفضل ثلاثة مواعيد بأيامٍ وأيقونة، وشاراتُ حالةٍ بأيقونات، وخطٌّ زمنيّ للحركة،
 * وأيقونةُ رجوعٍ تحذّر من تعديلٍ لم يُرسل، وهيكلُ تحميلٍ هادئ. عرضٌ فقط: لا حكمَ ولا بيانات.
 * السكربتُ ES5 داخل قالبٍ نصّي في ‎server.ts‎: لا علامةَ اقتباسٍ مائلة ولا ‎${‎ فيه.
 */

export const REQUEST_VISUAL_CSS = String.raw`
/* ── مظهرٌ بصري ──────────────────────────────────────────────────────────── */
.wc-t,.wk-axis{block-size:260px}
/* أسماءُ الأيام فوق الرسم لا تحته. */
.wc{display:flex;flex-direction:column}
.wc-n{order:-1;margin-bottom:6px;line-height:16px}
.wk-axis{margin-top:22px}
.wb{overflow:hidden}
.wb span{display:block;padding:2px 3px 0;font-size:10px;line-height:1.15;font-weight:700;color:#fff;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wb[data-k=ghost] span{color:var(--c)}
.wb[data-k=del] span{color:#fff;text-shadow:0 0 3px rgba(0,0,0,.6)}
.wb::after{content:"";position:absolute;inset:-14px -3px}
.plib summary{min-inline-size:44px;min-block-size:44px}
.wb{background:var(--c,#86a898);min-block-size:9px}
.wb[data-k=ghost]{background:transparent;border:1.5px dashed var(--c,#6f7a74)}
.wb[data-k=chg],.wb[data-k=prop]{background:var(--c,#b57f10);box-shadow:0 0 0 2px var(--warn2),0 0 0 3.5px #b57f10}
.wb[data-k=add],.wb[data-k=fix]{background:var(--c,var(--ok));box-shadow:0 0 0 2px var(--ok2),0 0 0 3.5px var(--ok)}
.wb[data-k=del]{background:repeating-linear-gradient(135deg,var(--c,#ad2f28) 0 4px,#fff 4px 8px);opacity:.6}
.wk-leg{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:6px 12px;font-size:11.5px;color:var(--muted)}
.wk-leg li{display:inline-flex;align-items:center;gap:5px;min-width:0}
.wk-leg i{flex:none;width:10px;height:10px;border-radius:3px;background:var(--c)}
.wk-key{display:flex;flex-wrap:wrap;gap:4px 12px;margin:0 0 10px;font-size:11px;color:var(--muted2)}
.wk-key span{display:inline-flex;align-items:center;gap:5px}
.wk-key i{flex:none;width:12px;height:12px;border-radius:3px;background:#86a898}
.wk-key i[data-k=ghost]{background:transparent;border:1.5px dashed #6f7a74}
.wk-key i[data-k=chg]{box-shadow:0 0 0 1.5px #b57f10}
.wk-key i[data-k=add]{box-shadow:0 0 0 1.5px var(--ok)}
.wk-key i[data-k=del]{background:repeating-linear-gradient(135deg,#ad2f28 0 3px,#fff 3px 6px)}

/* أفضل ثلاثة مواعيد: أيامٌ ووقتٌ كبير وسببٌ بأيقونة. */
.best-row button{gap:5px;padding:10px 6px 9px}
.bp-d{display:flex;gap:3px;justify-content:center}
.bp-d u{text-decoration:none;display:grid;place-items:center;width:20px;height:20px;border-radius:7px;font-size:11px;font-weight:700;background:var(--ok2);color:var(--ok)}
.bp-t{font:700 17px/1.2 ui-monospace,monospace;color:var(--ink);direction:ltr}
.best-row small{display:inline-flex;align-items:center;gap:4px;font-size:11px;line-height:1.3;text-align:center}
.best-row small .sk-gi{flex:none;width:13px;height:13px;color:var(--ok)}

/* شاراتُ الحالة: أيقونةٌ وكلمة. */
.status{display:inline-flex;align-items:center;gap:4px}
.status .sk-gi{width:13px;height:13px;flex:none}

/* الرجوع. */
.topbar{display:flex;margin:0 0 8px}
.back-ic{display:inline-grid;place-items:center;inline-size:42px;block-size:42px;padding:0;border:1px solid var(--line);border-radius:13px;background:var(--card);color:var(--muted);cursor:pointer}
.back-ic:hover,.back-ic:focus-visible{color:var(--ok);border-color:var(--ok);outline:none}
.back-ic .sk-gi{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.leave{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;background:rgba(16,22,20,.46)}
.leave[hidden]{display:none}
.leave-card{inline-size:min(100%,480px);padding:20px 18px calc(18px + env(safe-area-inset-bottom));border-radius:22px 22px 0 0;background:var(--card);display:grid;gap:10px;justify-items:center;text-align:center;animation:leave-up .24s cubic-bezier(.2,.8,.3,1) both}
.leave-card .lv-ic{display:grid;place-items:center;inline-size:46px;block-size:46px;border-radius:15px;background:var(--warn2);color:var(--warn)}
.leave-card .lv-ic .sk-gi{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.leave-card b{font-size:16px}
.leave-card p{margin:0;font-size:13px;line-height:1.7;color:var(--muted)}
.leave-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;inline-size:100%;margin-top:4px}
.leave-row button{min-block-size:48px;border-radius:14px;font:inherit;font-weight:700;font-size:14px;cursor:pointer;border:1.5px solid var(--line);background:var(--card);color:var(--ink)}
.leave-row button[data-stay]{background:var(--ok);border-color:var(--ok);color:#fff}
@keyframes leave-up{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}

/* حركةُ الطلب خطّاً زمنياً بأيقونات. */
.activity-list{position:relative;gap:10px}
.activity-list::before{content:"";position:absolute;inset-block:18px;inset-inline-start:14px;inline-size:2px;background:var(--line);border-radius:2px}
.activity-item{grid-template-columns:30px minmax(0,1fr)!important;gap:4px 12px!important;padding:12px 12px 12px 14px;border:0!important;background:transparent!important;position:relative}
.activity-dot{display:grid!important;place-items:center;inline-size:30px!important;block-size:30px!important;border-radius:50%!important;margin:0!important;background:var(--card);border:2px solid var(--line);color:var(--muted);position:relative;z-index:1}
.activity-dot .sk-gi{inline-size:15px;block-size:15px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.activity-item[data-kind=add] .activity-dot,.activity-item[data-ev=item-fixed] .activity-dot,.activity-item[data-ev=proposal-accepted] .activity-dot,.activity-item[data-ev=settled] .activity-dot{background:var(--ok2);border-color:var(--ok);color:var(--ok)}
.activity-item[data-kind=change] .activity-dot,.activity-item[data-ev=alternative-offered] .activity-dot,.activity-item[data-ev=rejected-alt] .activity-dot,.activity-item[data-ev=department-replied] .activity-dot{background:var(--warn2);border-color:#b57f10;color:var(--warn)}
.activity-item[data-kind=delete] .activity-dot,.activity-item[data-ev=item-rejected] .activity-dot{background:var(--bad2);border-color:var(--bad);color:var(--bad)}
.activity-item[data-ev=submitted] .activity-dot,.activity-item[data-ev=received] .activity-dot{background:var(--ok);border-color:var(--ok);color:#fff}
.activity-item>time{grid-column:2;order:3;font-size:11px;color:var(--muted2);margin-top:2px}
.activity-main{grid-column:2;grid-row:1}
.activity-item>.activity-dot{grid-row:1/3}
.ev-was{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:5px 0 2px;font-size:12px;color:var(--muted)}
.ev-was .bp-d u{background:var(--soft);color:var(--muted)}
.ev-was .sk-gi{inline-size:14px;block-size:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}

.appt{position:relative}
.appt::before{content:"";position:absolute;inset-block:10px;inset-inline-start:0;inline-size:4px;border-radius:0 4px 4px 0;background:var(--c)}
/* «وقت آخر» مطويّ حتى يُطلب. */
.heat-key[role=status]{display:flex;align-items:center;gap:7px}
.heat-key[role=status] .sk-gi{flex:none;width:15px;height:15px;color:var(--warn);fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.ends{margin-inline:2px!important}

.auto-note,.hint-pro,.shape-lead,.ends{display:flex;align-items:center;gap:7px}
.auto-note .sk-gi,.hint-pro .sk-gi,.shape-lead .sk-gi,.ends .sk-gi,.vshort .sk-gi{flex:none;width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.ends-src{margin-inline-start:auto;color:var(--muted2);display:inline-grid}
.vshort{display:inline-flex;align-items:center;gap:6px;font-weight:700}
.why{margin-top:4px;font-size:12px;color:var(--muted)}
.why summary{display:inline-block;cursor:pointer;list-style:none;color:var(--muted2);text-decoration:underline dotted;min-block-size:28px;line-height:28px}
.why summary::-webkit-details-marker{display:none}
.why p{margin:4px 0 0;line-height:1.7}

.alts button .alt-d{font-family:"Plex Arabic",-apple-system,"Segoe UI",Tahoma,sans-serif!important;letter-spacing:0!important}
.dname{text-decoration:none;display:inline-block;padding:2px 8px;border-radius:7px;font-size:11.5px;font-weight:700;background:var(--soft);color:var(--ink)}
.alt-d{font-size:11.5px;color:var(--muted);font-weight:600}
.own-msg{display:flex;gap:8px;align-items:flex-start;margin:8px 0 0;padding:10px 12px;border-radius:12px;background:var(--bad2);color:var(--bad);font-size:13px}
.own-msg>.sk-gi{flex:none;width:16px;height:16px;margin-top:2px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.own-msg>span{display:flex;flex-direction:column;gap:6px}
.starts button[data-own-clash]{opacity:.45;text-decoration:line-through;cursor:not-allowed}
.advice .vshort{color:var(--warn)}
.vwrap{display:flex;flex-direction:column;align-items:flex-start;gap:4px;flex:1;min-inline-size:0}
.vcard{display:flex;flex-direction:column;gap:5px;margin:8px 0 2px;padding:9px 12px;border-radius:12px;background:var(--card);border:1px solid var(--line);font-size:13px}
.vcard .vrow,.dept .vrow{display:flex;align-items:center;gap:8px;color:var(--muted)}
.vstat{display:inline-flex;align-items:center;gap:8px;margin:8px 0 2px;padding:8px 14px;border-radius:12px;background:var(--card);border:1px solid var(--line)}
.vstat b{font:800 20px/1 ui-monospace,monospace;color:var(--bad)}
.vstat em{font-style:normal;font-size:13px;font-weight:700;color:var(--bad)}
.vstat i{color:var(--muted2);font-style:normal;font-size:18px}
.vstat small{font-size:11px;color:var(--muted);line-height:1.3}
.vart{display:inline-flex;align-items:center;gap:5px;margin-top:6px;padding:4px 10px;border-radius:999px;background:var(--card);border:1px solid var(--line);font-size:11.5px;color:var(--muted)}
.vart .sk-gi{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.sk-rule-tag{font:inherit;cursor:pointer}
.sk-plan-tag{display:inline-block;margin-inline-start:7px;padding:1px 8px;border:1px solid var(--ok);border-radius:999px;background:var(--ok2);color:var(--ok);font-size:10.5px;font-weight:700;vertical-align:middle}
.sk-badge-toast{position:fixed;z-index:1000;inset-inline:18px;bottom:calc(20px + env(safe-area-inset-bottom));max-width:430px;margin-inline:auto;padding:13px 17px;border:1px solid var(--line);border-radius:14px;background:var(--ink);color:#fff;box-shadow:0 12px 32px rgba(0,0,0,.22);font-size:13px;line-height:1.7;text-align:center}
.dept .vshort{margin-inline-start:6px}
.alts button{display:inline-flex;flex-direction:column;align-items:center;gap:4px;min-block-size:56px;padding:8px 14px}

.nextnow{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;margin:0 0 14px;padding:14px;border:1.5px solid var(--line);border-radius:18px;background:var(--card)}
.nextnow[data-tone=act]{border-color:var(--ok);background:color-mix(in srgb,var(--ok) 8%,var(--card));box-shadow:0 6px 18px color-mix(in srgb,var(--ok) 14%,transparent)}
.nextnow[data-tone=done]{background:var(--soft)}
.nx-ic{display:grid;place-items:center;width:46px;height:46px;border-radius:15px;background:var(--soft);color:var(--muted)}
.nextnow[data-tone=act] .nx-ic{background:var(--ok);color:#fff}
.nx-ic .sk-gi{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.nx-tx{display:flex;flex-direction:column;gap:2px;min-inline-size:0}
.nx-tx small{font-size:11px;font-weight:700;color:var(--muted2)}
.nx-tx b{font-size:16px;line-height:1.3}
.nx-tx em{font-style:normal;font-size:12.5px;color:var(--muted)}
.nx-btn{display:inline-flex;align-items:center;gap:6px;min-block-size:44px;padding:0 14px;border:0;border-radius:13px;background:var(--ok);color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.nx-btn .sk-gi{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
@media (max-width:420px){.nextnow{grid-template-columns:auto minmax(0,1fr)}.nx-btn{grid-column:1/-1;justify-content:center}}
@media (prefers-reduced-motion:no-preference){.nextnow[data-tone=act] .nx-ic{animation:nxp 2.4s ease-in-out infinite}@keyframes nxp{50%{transform:scale(1.07)}}}

/* هيكلُ التحميل. */
.skel{display:grid;gap:12px;padding:20px 4px}
.skel i{display:block;block-size:78px;border-radius:18px;background:linear-gradient(100deg,var(--soft) 30%,var(--card) 50%,var(--soft) 70%);background-size:220% 100%;animation:skel 1.3s ease-in-out infinite}
.skel i:first-child{block-size:58px;inline-size:68%}
@keyframes skel{from{background-position:120% 0}to{background-position:-120% 0}}
@media (prefers-reduced-motion:reduce){.skel i,.leave-card{animation:none}}

/* ── «أكمل أيام المقرر»: أنماطُ الأيام حبوباً تلتفّ ولا تتراكب (r4) ──────────────
   رأسٌ (أيقونة + جملة) ثم صفُّ الحبوب بعرض البطاقة. كلُّ حبّة: أحرفُ الأيام دوائرَ ثم
   الدقائق رقماً واحداً إن تساوت، وإلا كلُّ يومٍ بدقائقه. الاسمُ الكامل في aria-label. */
.heat-key.heat-shape[role=status]{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px 8px;margin:12px 0 2px;padding:10px 12px;border-radius:16px;border:1px dashed color-mix(in srgb,var(--accent) 45%,var(--line));background:color-mix(in srgb,var(--ok2) 45%,var(--card));color:var(--ink);font-size:13.5px;font-weight:700}
.heat-key.heat-shape[role=status]>.sk-gi{inline-size:18px;block-size:18px;color:var(--accent)}
.heat-key.heat-shape>.alts.shapes{grid-column:1/-1;margin:0}
.alts.shapes{display:flex;flex-wrap:wrap;gap:8px}
.alts.shapes button{display:inline-flex!important;flex-direction:row!important;align-items:center;gap:9px!important;flex:0 0 auto;max-inline-size:100%;min-block-size:46px;padding:6px 14px 6px 7px!important;border-radius:999px!important;border:1.5px solid color-mix(in srgb,var(--accent) 40%,var(--line))!important;background:var(--card)!important;color:var(--ink);font-family:inherit;font-size:13px;font-weight:700;line-height:1;white-space:nowrap;cursor:pointer;box-shadow:0 1px 0 rgba(0,0,0,.03);transition:border-color .15s,background .15s,transform .1s}
.alts.shapes button:hover{border-color:var(--accent)!important;background:color-mix(in srgb,var(--ok2) 55%,var(--card))!important}
.alts.shapes button:active{transform:scale(.98)}
.alts.shapes button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.shp-days{display:inline-flex;align-items:center;gap:3px}
.shp-days u,.shp-seg u{text-decoration:none;display:grid;place-items:center;inline-size:28px;block-size:28px;border-radius:50%;background:var(--ok2);color:var(--ok);font-size:13px;font-weight:800;line-height:1}
.shp-seg{display:inline-flex;align-items:center;gap:4px}
.shp-seg+.shp-seg{padding-inline-start:6px;border-inline-start:1px solid var(--line)}
.shp-min{display:inline-flex;align-items:baseline;gap:3px;color:var(--muted);font-size:12px;font-weight:700}
.shp-min b,.shp-seg small{font-family:"Plex Arabic",-apple-system,"Segoe UI",Tahoma,sans-serif;font-variant-numeric:tabular-nums;font-size:15px;font-weight:800;color:var(--ink);letter-spacing:0}
.shp-seg small{font-size:13px}
.shp-usual{display:grid;place-items:center;inline-size:22px;block-size:22px;border-radius:50%;background:var(--warn2);color:var(--warn)}
.shp-usual .sk-gi{inline-size:13px;block-size:13px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.shp-plain{white-space:normal;text-align:start;line-height:1.5}
/* «ينتهي …»: أيامٌ بأحرفها ثم ساعةُ النهاية، مجموعةً بالساعة نفسها، تلتفّ ولا تطول سطراً واحداً. */
.ends{flex-wrap:wrap;row-gap:6px}
.ends-l{font-weight:700;color:var(--ink)}
.ends-g{display:inline-flex;align-items:center;gap:6px;padding:3px 10px 3px 4px;border-radius:999px;background:var(--soft);border:1px solid var(--line)}
.ends-g .bp-d{display:inline-flex;gap:2px}
.ends-g .bp-d u{text-decoration:none;display:grid;place-items:center;inline-size:22px;block-size:22px;border-radius:50%;background:var(--card);color:var(--ink);font-size:11.5px;font-weight:800}
.ends-t{font-family:"Plex Arabic",-apple-system,"Segoe UI",Tahoma,sans-serif;font-variant-numeric:tabular-nums;font-size:13.5px;font-weight:800;color:var(--ink)}
@media(max-width:520px){.alts.shapes{gap:7px}.alts.shapes button{min-block-size:44px;padding-inline-end:12px!important}.shp-days u,.shp-seg u{inline-size:26px;block-size:26px;font-size:12.5px}}
`;

export const REQUEST_VISUAL_JS = String.raw`
var SKDI={fsunday:"ح",fmonday:"ن",ftuesday:"ث",fwednesday:"ر",fthursday:"خ"};
var SKDN={"الأحد":"ح","الاثنين":"ن","الثلاثاء":"ث","الأربعاء":"ر","الخميس":"خ"};
function skPills(keys){return '<span class="bp-d" aria-hidden="true">'+keys.map(function(k){return '<u>'+(SKDI[k]||"")+'</u>'}).join("")+'</span>'}
function skPillsText(txt){var parts=String(txt||"").split("·").map(function(x){return x.trim()}).filter(Boolean);
 return '<span class="bp-d" aria-hidden="true">'+parts.map(function(n){return '<u>'+(SKDN[n]||esc(n.slice(0,1)))+'</u>'}).join("")+'</span>'}
function skShort(it){var n=String(courseOf(it)||"").trim().split(/\s+/);var w=n[0]||"";if(w.length<=3&&n[1])w+=" "+n[1];return w}
var SKCAT=[
 [/^انتهت مدّة استقبال/,"lock","انتهت مدة الطلبات"],
 [/^اختر يوماً واحداً/,"cal","اختر يوماً"],
 [/^اكتب وقت البداية/,"clock","اكتب وقت البداية"],
 [/^تبدأ المحاضرة قبل بداية/,"sunrise","قبل بداية الدوام"],
 [/^تتجاوز المحاضرة نهاية/,"sunset","بعد نهاية الدوام"],
 [/^لا يُخلط بين أيام/,"layers","خلط 50 و80 دقيقة غير معتمد"],
 [/^تتابع مرتفع على الأستاذ/,"layers","محاضرات متتالية كثيرة"],
 [/^تكرار شعب المقرر في نفس الوقت/,"layers","شعبة أخرى بالوقت نفسه"],
 [/^التدوير غير محقق/,"sunrise","كلها في فترة واحدة"],
 [/^داخل وقت اجتماع القسم/,"cal","وقت اجتماع القسم"],
 [/^خارج المعتاد تاريخياً/,"clock","وقت غير معتاد · اذكر السبب"],
 [/^بيانات غير مكتملة/,"alert","بيانات ناقصة"],
 [/^يتقاطع هذا الوقت مع مقرّرٍ يشترك فيه طلبتك/,"alert","يتعارض مع مقرّر طلبتك"],
 [/^لا تتوفّر قاعةٌ في هذا الوقت/,"door","لا قاعة في هذا الوقت"],
 [/^يتجاوز هذا نصابك/,"layers","يتجاوز نصابك"],
 [/^لديك محاضرةٌ أخرى في هذا الوقت/,"alert","تعارض مع محاضرتك"]
];
function skRuleTag(label){return '<button type="button" class="vart sk-rule-tag" data-sk-rule="'+esc(label)+'" title="اضغط لشرح المادة">'+gi("shield")+esc(label)+'</button>'}
function skDayPill(label){var l=String(label||"").trim();return l?'<u class="dname">'+esc(l)+'</u>':""}
/* ما يُرسم لا يُكتب: محاضرتُك المتعارضة بطاقةً (اسمٌ ويومٌ ووقت)، والنصابُ رقمين، والمادةُ شارةً. */
function skExtra(n){var m;
 if((m=/^لديك محاضرةٌ أخرى في هذا الوقت: (.+?) — (\S*)\s*(\d\d?:\d\d)[–-](\d\d?:\d\d)/.exec(n)))
  return '<span class="vcard"><b>'+esc(m[1])+'</b><span class="vrow"><span class="bp-d">'+skDayPill(m[2])+'</span><bdi dir="ltr">'+esc(m[3])+' – '+esc(m[4])+'</bdi></span></span>';
 if((m=/^يتجاوز هذا نصابك: (.+?) مقابل (.+?) مسجّلة/.exec(n))){
 var num=/^(\d+)\s*(.*)$/.exec(m[1]);return '<span class="vstat"><b>'+esc(num?num[1]:m[1])+'</b>'+(num&&num[2]?'<em>'+esc(num[2])+'</em>':'')+'<i aria-hidden="true">/</i><small>'+esc(m[2])+'<br>نصابك التدريسي</small></span>'}
 return ""}
function skAlertParts(n){n=String(n||"");
 for(var k=0;k<SKCAT.length;k++){if(SKCAT[k][0].test(n)){var ex=skExtra(n),art=/ — (م\.[^ ]+.*)$/.exec(n);return{ic:SKCAT[k][1],short:SKCAT[k][2],extra:ex||(art?skRuleTag(art[1]):"")}}}
 var m=/^(.+?) — (.+)$/.exec(n);
 if(m)return{ic:"shield",short:m[1].replace(/\s*\([^)]*\)\s*$/,""),extra:skRuleTag(m[2])};
 return null}
/* جملةُ الحكم قصيرةً بأيقونة، وأصلُها كاملاً تحت «التفاصيل» فلا يضيع منه شيء. */
function skVerdict(it){var n=String(it&&it.note||""),full=verdictText(it),ic="",short="",extra="";
 if(/لا يغطّيها/.test(n)){ic="cal";var hrs=/هذا المقرّر (.+?) أسبوعياً/.exec(n);short=(hrs?"المقرر "+hrs[1]+" أسبوعياً · ":"")+(it.shapes&&it.shapes.length?"اختر أياماً تغطيها:":"توزيعها يحدّده القسم")}
 else{var p=skAlertParts(n);if(p){ic=p.ic;short=p.short;extra=p.extra}}
 if(!short||(short===full&&!extra))return esc(full);
 return '<span class="vshort">'+gi(ic)+esc(short)+'</span>'+extra+(/^أكثر من شعبتين متتاليتين/.test(n)?"":'<details class="why"><summary>التفاصيل</summary><p>'+esc(full)+'</p></details>')}
/* قرارُ القسم: سببُ الرفض رمزاً وكلمات قليلة. */
var SKREASON={room:["door","لا قاعة في الوقت المطلوب"],instructor:["alert","تعارض مع أستاذ آخر"],regulation:["shield","مخالفة للائحة"],cohort:["alert","تقاطع مع طلبة مشتركين"],load:["layers","النصاب التدريسي"],department:["cal","قرار القسم"],other:["alert","سبب آخر"]};
function skReason(code,askedAt){var r=SKREASON[code];if(!r)return "";return '<span class="vshort">'+gi(r[0])+esc(r[1])+'</span>'+(askedAt?'<span class="vrow"><bdi dir="ltr">'+esc(askedAt)+'</bdi></span>':"")}
function skAltBtn(ds,start){return '<small class="alt-d">'+esc(fmtDays(ds))+'</small><b class="bp-t">'+esc(start)+'</b>'}
/* «لديك محاضرة في هذا الوقت»: أيُّها، وفي أيّ يومٍ ووقت. */
function skOwnClash(it,i,t){var d=it.days||[],s=mins(t),e=mins(endOf(it,d,t));
 var o=othersFor(i).filter(function(o){return o.d.some(function(x){return d.indexOf(x)>=0})&&s<o.e&&o.s<e})[0];
 if(!o)return "";var day=o.d.filter(function(x){return d.indexOf(x)>=0}).map(function(x){var f=DAYS.filter(function(y){return y[0]===x})[0];return f?f[1]:x}).join(" · ");
 return '<div class="own-msg" role="status">'+gi("alert")+'<span><b>'+esc(t)+' غير متاح لك</b><span class="vcard"><b>'+esc(o.n)+'</b><span class="vrow"><u class="dname">'+esc(day)+'</u><bdi dir="ltr">'+clock(o.s)+' – '+clock(o.e)+'</bdi></span></span></span></div>'}
function skAdvice(t){t=String(t||"");var m=/^موعدك الحالي أقصر من ساعات المقرّر \(([^)]+)\)/.exec(t);
 if(!m)return '<p class="advice" role="note">'+esc(t)+'</p>';
 return '<p class="advice" role="note"><span class="vshort">'+gi("alert")+'أقصر من ساعات المقرر ('+esc(m[1])+')</span></p><details class="why"><summary>التفاصيل</summary><p>'+esc(t)+'</p></details>'}
/* «الاثنين 80د · الأربعاء 80د · الخميس 50د» أيامٌ بأحرفها ودقائقها. */
function skShape(label){var raw=String(label||""),usual=/^المعتاد تاريخياً:\s*/.test(raw);raw=raw.replace(/^المعتاد تاريخياً:\s*/,"");
 var parts=raw.split("·").map(function(x){return x.trim()}).filter(Boolean),ds=[];
 for(var k=0;k<parts.length;k++){var m=/^(\S+)\s+([0-9]+)/.exec(parts[k]);if(!m)return '<span class="shp-plain">'+esc(label)+'</span>';ds.push({l:SKDN[m[1]]||esc(m[1].slice(0,1)),m:m[2]})}
 if(!ds.length)return '<span class="shp-plain">'+esc(label)+'</span>';
 var same=ds.every(function(d){return d.m===ds[0].m});
 var lead=usual?'<span class="shp-usual" title="المعتاد تاريخياً">'+gi("clock")+'</span>':'';
 if(same)return lead+'<span class="shp-days">'+ds.map(function(d){return '<u>'+d.l+'</u>'}).join("")+'</span><span class="shp-min"><b>'+ds[0].m+'</b>د</span>';
 return lead+ds.map(function(d){return '<span class="shp-seg"><u>'+d.l+'</u><small>'+d.m+'</small></span>'}).join("")+'<span class="shp-min">د</span>'}
/* «ينتهي»: الأيامُ ذاتُ ساعةِ النهاية الواحدة حبّةٌ واحدة — «ح ث خ 14:15» لا «ينتهي الأحد 14:15 · الثلاثاء 14:15 · …». */
var SKORDER=["fsunday","fmonday","ftuesday","fwednesday","fthursday"];
function skEnds(slots,days,end){var list=(slots&&slots.length?slots:(days||[]).map(function(d){return{day:d,end:end}})).filter(function(sl){return sl&&sl.day&&sl.end}),groups=[];
 list.slice().sort(function(a,b){return SKORDER.indexOf(a.day)-SKORDER.indexOf(b.day)}).forEach(function(sl){var g=groups.filter(function(x){return x.end===sl.end})[0];if(g){if(g.days.indexOf(sl.day)<0)g.days.push(sl.day)}else groups.push({end:sl.end,days:[sl.day]})});
 if(!groups.length)return end?'<bdi dir="ltr" class="ends-t">'+esc(end)+'</bdi>':"";
 return groups.map(function(g){return '<span class="ends-g">'+skPills(g.days)+'<bdi dir="ltr" class="ends-t">'+esc(g.end)+'</bdi><span class="sr">'+esc(fmtDays(g.days))+' '+esc(g.end)+'</span></span>'}).join("")}
/* «ماذا أحتاج منك الآن؟»: خطوةٌ واحدةٌ كبيرة تتغيّر بمرحلة الطلب، فلا يحتاج الأستاذ أن يقرأ المسار ليعرف. */
function skNext(open,sent,edited){var s=stageIdx(),pend=pendingList().length,ic="eye",tone="wait",t="",sub="",btn="";
 if(!open&&!sent){ic="lock";tone="done";t="انتهت مدة استقبال الطلبات";sub="جدولك كما هو، ولا شيء مطلوب منك."}
 else if(!sent){ic=edited>0?"send":"pen";tone="act";
  t=edited>0?"طلبك جاهز للإرسال":"جدولك لم يتغير";
  sub=edited>0?countOf(edited,AR.edit)+" · اضغط «أرسل التعديلات» حين تنتهي":"إذا كان جدولك صحيحاً، اضغط «ثبّت الجدول»";
  btn=""; /* زرُّ الإرسال الحقيقي موجود في شريط الإرسال؛ لا اختصار يعجز عن الوصول إليه */ }
 else if(s===2||pend>0){ic="you";tone="act";t="قرارك مطلوب الآن";sub=countOf(pend||1,AR.item)+" ينتظر ردّك من القسم";btn='<button type="button" class="nx-btn" data-nx="decide">'+gi("arrow")+'اذهب إلى القرار</button>'}
 else if(s===1){ic="eye";tone="wait";t="القسم يراجع طلبك";sub="لا شيء مطلوب منك الآن"}
 else if(s===3){ic="shield";tone="wait";t="بانتظار تثبيت القسم";sub="لا شيء مطلوب منك الآن"}
 else{ic="check";tone="done";t="اكتمل طلبك";sub="ثُبّت ما اتُّفق عليه في جدولك"}
 return '<div class="nextnow" data-tone="'+tone+'" role="status"><span class="nx-ic">'+gi(ic)+'</span><span class="nx-tx"><small>ماذا أحتاج منك الآن؟</small><b>'+esc(t)+'</b><em>'+esc(sub)+'</em></span>'+btn+'</div>'}
/* شارات مواد اللائحة وحدها قابلة للشرح؛ شارتا الصحيفة والمتطلب للعرض فقط. */
var skBadgeTimer=null;
function skBadgeExplain(el){var rule=el.getAttribute("data-sk-rule");if(!rule)return;
 var message=/م\.6\/2/.test(rule)?"م.6/2: لا يجوز تجاوز شعبتين متتاليتين لمقرر تزيد محاضرته على ساعة.":"المرجع التنظيمي: "+rule;
 var note=document.getElementById("skBadgeToast");
 if(!note){note=document.createElement("div");note.id="skBadgeToast";note.className="sk-badge-toast";note.setAttribute("role","status");document.body.appendChild(note)}
 note.textContent=message;note.hidden=false;
 if(skBadgeTimer)clearTimeout(skBadgeTimer);
 skBadgeTimer=setTimeout(function(){note.hidden=true},4500);
}
document.addEventListener("click",function(e){var b=e.target&&e.target.closest?e.target.closest("[data-sk-rule]"):null;if(!b)return;e.preventDefault();e.stopPropagation();skBadgeExplain(b)},true);
document.addEventListener("click",function(e){var b=e.target&&e.target.closest?e.target.closest("[data-nx]"):null;if(!b)return;
 var k=b.getAttribute("data-nx"),t=k==="send"?document.getElementById("send"):(document.querySelector(".deck")||document.querySelector("[data-panel=schedule]"));
 if(t&&t.scrollIntoView){t.scrollIntoView({block:"center",behavior:"smooth"});if(k==="send"&&t.focus)t.focus({preventScroll:true})}});
function skCid(it){return (it&&(it.courseId||(it.before&&it.before.courseId)||(it.after&&it.after.courseId)))||courseOf(it)}
function skAssignColors(){SKC.assign(state.map(skCid))}
function skCourseColor(it){return SKC.color(skCid(it))}
var SKSTAT={keep:"check",change:"pen",add:"plus",delete:"trash"};
function skStat(act){return gi(SKSTAT[act]||"check")}
var SKEV={"link-created":"plus","link-opened":"eye","submitted":"send","received":"check","item-fixed":"check","item-rejected":"x","alternative-offered":"swap","alternative-chosen":"check","settled":"lock","schedule-approved":"shield","department-replied":"chat","instructor-replied":"chat","proposal-accepted":"check","rejected-alt":"swap"};
var SKACT={add:"plus",change:"pen",delete:"trash"};
function skEvIcon(k){return '<i class="activity-dot" aria-hidden="true">'+gi(SKEV[k]||"clock")+'</i>'}
function skActIcon(a){return '<i class="activity-dot" aria-hidden="true">'+gi(SKACT[a]||"clock")+'</i>'}
/* «رُفض بند» ثم «عُرض عليك بديل» للبند نفسه بطاقةٌ واحدة. */
function skMergeEvents(list){var out=[];list.forEach(function(e){var p=out[out.length-1];
 if(e.kind==="alternative-offered"&&p&&p.kind==="item-rejected"&&typeof e.itemIndex==="number"&&p.itemIndex===e.itemIndex){out[out.length-1]={kind:"rejected-alt",at:e.at,itemIndex:e.itemIndex,detail:e.detail,by:e.by||p.by};return}
 out.push(e)});return out}
function skLegend(){var seen={},li=[];state.forEach(function(it){var k=skCid(it);if(seen[k])return;seen[k]=1;li.push('<li style="--c:'+skCourseColor(it)+'"><i></i>'+esc(courseOf(it))+'</li>')});
 return (li.length>1?'<ul class="wk-leg" aria-label="ألوان المقرّرات">'+li.join("")+'</ul>':"")+
  ''}
function skKey(){return '<p class="wk-key" aria-hidden="true"><span><i data-k="ghost"></i>قبل التعديل</span><span><i data-k="chg"></i>معدّل</span><span><i data-k="add"></i>جديد/مثبَّت</span><span><i data-k="del"></i>محذوف</span></p>'}
/* الرجوع: يبقى الطلبُ المكتوب مسودةً على الجهاز، لكن يُسأل أولاً. */
function skBackTarget(){try{var r=document.referrer;if(r&&new URL(r).origin===location.origin&&r!==location.href)return r}catch(e){}return ""}
function skBackIcon(){if(!skBackTarget()&&history.length<2)return "";
 return '<div class="topbar"><button type="button" class="back-ic" id="backIc" aria-label="الرجوع إلى الصفحة السابقة" title="رجوع">'+gi("arR")+'</button></div>'}
function skGoBack(){var t=skBackTarget();if(t)location.href=t;else history.back()}
function skLeaveAsk(){var m=document.getElementById("leaveAsk");
 if(!m){m=document.createElement("div");m.id="leaveAsk";m.className="leave";m.hidden=true;
  m.innerHTML='<div class="leave-card" role="alertdialog" aria-modal="true" aria-labelledby="lvT"><span class="lv-ic">'+gi("alert")+'</span><b id="lvT">لديك تعديل لم يُرسل</b><p>مسودتك محفوظة على هذا الجهاز، لكنها لم تصل القسم بعد. إن خرجتَ الآن تجدها عند عودتك.</p><div class="leave-row"><button type="button" data-leave>خروج</button><button type="button" data-stay>أكمل التعديل</button></div></div>';
  document.body.appendChild(m);
  m.onclick=function(e){var t=e.target;if(t===m||(t.closest&&t.closest("[data-stay]"))){m.hidden=true;return}if(t.closest&&t.closest("[data-leave]")){m.hidden=true;skLeaving=true;skGoBack()}}}
 m.hidden=false;var b=m.querySelector("[data-stay]");if(b)b.focus()}
var skLeaving=false;
host.addEventListener("click",function(e){var b=e.target&&e.target.closest?e.target.closest("#backIc"):null;if(!b)return;
 if(dirty)skLeaveAsk();else skGoBack()});
document.addEventListener("keydown",function(e){var m=document.getElementById("leaveAsk");if(e.key==="Escape"&&m&&!m.hidden)m.hidden=true});
`;
