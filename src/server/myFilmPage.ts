/**
 * ── صفحةُ «فيلمي» ───────────────────────────────────────────────────────────
 *
 * صفحةٌ واحدة لفيلمَي الأستاذ (/r/:token/film) والطالب (/me/film): مسرحٌ يملأ
 * الشاشة ويروي المشاهد التي بناها src/utils/myFilm.ts كما هي. تُبنى في الخادم
 * كبقية الأبواب العامة (الأستاذ والطالب يفتحانها من الهاتف بلا حزمة التطبيق).
 *
 * شقيقةُ «فيلم الفصل»: اللوحةُ الليلية نفسها والذهبيُّ نفسه (الألوان هنا منسوخةٌ
 * من src/styles/term-film.css ويحرسها tests/my-film-audit.ts)، والشريطُ نفسه:
 * شغّل/أوقف، ومسارُ المشاهد، وأعد. والمقاسُ كلُّه مضاعفاتُ ‎--u‎ من مقاس المسرح،
 * فيتمدّد الفيلمُ صورةً واحدة: عمودياً على الهاتف، وعمودين (النص والرسم) حين
 * يكون المسرح عريضاً. لا تمرير أبداً، وحوافُّ الجهاز الآمنة محسوبة.
 *
 * الصفحةُ لا تصوغ جملة ولا تحسب رقماً: ترسم القطع وتحرّكها. ومن طلب تقليل
 * الحركة يرى كل مشهدٍ ساكناً بأرقامه النهائية ولا يبدأ شيءٌ وحده.
 *
 * السكربتُ ES5 عادي داخل قالبٍ نصّي: لا تُكتب فيه علامةُ الاقتباس المائلة ولا ‎${‎.
 */
import { PUBLIC_FONT_FACES } from "./publicKit";

/** لوحةُ المسرح: هي لوحةُ «فيلم الفصل» حرفاً، وثلاثةُ ألوانٍ إضافية لتمييز المقررات. */
export const MY_FILM_STAGE_VARS = "--stage:#0d241f;--stage-2:#143730;--ink:#eef5f0;--dim:#9fbab0;--rule:#2a4c43;--calm:#4fd3a1;--warm:#f0b24a;--hot:#f0674f;--gold:#e2bd76;--sky:#7cc4f0;--rose:#f29bb0;--iris:#b9a3f5";

export const MY_FILM_CSS = `
*{box-sizing:border-box}
html,body{margin:0;height:100%;overflow:hidden;background:#0d241f;overscroll-behavior:none}
body{color:#eef5f0;font-family:"Plex Arabic","Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;font-synthesis:none;font-kerning:normal;-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent}
.mf{${MY_FILM_STAGE_VARS};position:fixed;inset:0;overflow:hidden;isolation:isolate;container-type:size;color:var(--ink);
  background:radial-gradient(120% 90% at 80% 0%,var(--stage-2),var(--stage) 70%);
  --u:min(1.9cqw,calc((100cqh - 140px)/76),9.5px);--sat:env(safe-area-inset-top,0px);--sab:env(safe-area-inset-bottom,0px);--sal:env(safe-area-inset-left,0px);--sar:env(safe-area-inset-right,0px);
  user-select:none;-webkit-user-select:none;touch-action:manipulation}
.mf-glow{position:absolute;inset:-20%;z-index:-1;pointer-events:none;
  background:radial-gradient(40% 35% at 20% 80%,rgb(79 211 161 / .10),transparent 70%),radial-gradient(35% 30% at 85% 15%,rgb(226 189 118 / .13),transparent 70%),radial-gradient(30% 26% at 55% 105%,rgb(124 196 240 / .07),transparent 70%);
  animation:mf-drift 18s ease-in-out infinite alternate}
@keyframes mf-drift{to{transform:translate3d(4%,-3%,0) scale(1.05)}}
/* مدارُ البكرة: ثلاثُ حلقاتٍ ذهبية خافتة في زاوية المسرح. زينةٌ فقط. */
.mf-orbit{position:absolute;z-index:-1;pointer-events:none;width:calc(var(--u)*56);height:calc(var(--u)*56);inset-inline-end:calc(var(--u)*-26);bottom:calc(var(--u)*-26);
  fill:none;stroke:var(--gold);stroke-width:.3;opacity:.16}

.mf-top{position:absolute;inset:0 0 auto 0;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:calc(var(--sat) + 10px) calc(var(--sar) + 12px) 0 calc(var(--sal) + 12px);pointer-events:none}
.mf-top > *{pointer-events:auto}
.mf-mark{display:inline-flex;align-items:center;gap:7px;color:var(--gold);font-weight:600;font-size:14px;letter-spacing:.01em;padding-inline:6px}
.mf-mark svg{width:17px;height:17px}
.mf-x{display:inline-flex;align-items:center;gap:6px;min-height:44px;min-width:44px;justify-content:center;padding:0 14px;border-radius:999px;
  border:1px solid var(--rule);background:rgb(9 26 22 / .6);color:var(--ink);font:inherit;font-size:13.5px;text-decoration:none;
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:border-color .2s}
.mf-x:hover{border-color:var(--gold)}
.mf-x svg{width:16px;height:16px}
.mf-x:focus-visible,.mf-reel button:focus-visible,.mf-again:focus-visible{outline:2px solid var(--gold);outline-offset:2px}

.mf-scenes{position:absolute;inset:0;cursor:pointer}
.mf-scenes:focus-visible{outline:3px solid var(--gold);outline-offset:-6px}
.mf-scene{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;
  gap:calc(var(--u)*2.3);
  padding:calc(var(--sat) + 64px) calc(var(--sar) + var(--u)*6) calc(var(--sab) + 76px) calc(var(--sal) + var(--u)*6);
  opacity:0;visibility:hidden;transition:opacity .6s,visibility 0s .6s}
.mf-scene.on{opacity:1;visibility:visible;transition:opacity .6s}
.mf-col{display:contents}
.mf-p{max-width:100%;transform:translateY(calc(var(--u)*2.4));opacity:0;transition:transform .8s cubic-bezier(.2,.7,.2,1),opacity .8s;transition-delay:0s}
.mf-scene.on .mf-p{transform:none;opacity:1;transition-delay:calc(var(--i,0)*.22s)}

.mf-eyebrow{font-size:calc(var(--u)*2.5);color:var(--gold);font-weight:600;letter-spacing:.01em}
.mf-big{font-weight:700;font-size:calc(var(--u)*7);line-height:1.28;text-wrap:balance}
.mf-big.m{font-size:calc(var(--u)*5.4)}
.mf-cap{font-size:calc(var(--u)*2.7);color:var(--dim);max-width:calc(var(--u)*74);text-wrap:balance;line-height:1.65}
.mf-cap span{display:block}
.mf-cap span + span{font-size:.9em;opacity:.86}
.mf-badge{border:1px dashed color-mix(in srgb,var(--gold) 45%,var(--rule));border-radius:999px;padding:calc(var(--u)*.5) calc(var(--u)*2.2);font-size:calc(var(--u)*2.15);color:var(--gold)}
.mf-rule{display:block;width:calc(var(--u)*12);height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent)}
.mf-scene .mf-rule{transform:scaleX(0)}
.mf-scene.on .mf-rule{transform:scaleX(1);transition:transform 1s .35s cubic-bezier(.2,.7,.2,1),opacity 1s .35s}

.mf-trio{display:flex;gap:calc(var(--u)*5.5);justify-content:center}
.mf-trio div{display:flex;flex-direction:column;gap:calc(var(--u)*.5);min-width:0}
.mf-trio b{font-size:calc(var(--u)*6.6);line-height:1.1;color:var(--gold);font-variant-numeric:tabular-nums}
.mf-trio span{font-size:calc(var(--u)*2.25);color:var(--dim);white-space:nowrap}

/* شبكةُ الأسبوع: خمسةُ أعمدةٍ من الأحد (يميناً) إلى الخميس، وكلُّ محاضرةٍ لبنةٌ في وقتها بلون مقررها. */
.mf-week{display:grid;grid-template-columns:auto 1fr;gap:calc(var(--u)*1.6);width:calc(var(--u)*68);align-items:stretch}
.mf-wk-ax{display:flex;flex-direction:column;justify-content:space-between;height:calc(var(--u)*30);font-size:calc(var(--u)*1.9);color:var(--dim);font-variant-numeric:tabular-nums;direction:ltr}
.mf-wk-cols{display:grid;grid-template-columns:repeat(5,1fr);gap:calc(var(--u)*1.3)}
.mf-wk-day{display:flex;flex-direction:column;gap:calc(var(--u)*1.1);align-items:stretch}
.mf-wk-col{position:relative;height:calc(var(--u)*30);border-radius:calc(var(--u)*1.5);overflow:hidden;
  background-color:rgb(255 255 255 / .035);background-image:repeating-linear-gradient(to bottom,rgb(255 255 255 / .08) 0 1px,transparent 1px var(--hr,20%));
  box-shadow:inset 0 0 0 1px rgb(255 255 255 / .05)}
.mf-wk-day b{font-size:calc(var(--u)*2.1);color:var(--dim);font-weight:600}
.mf-wk-col i{position:absolute;inset-inline:calc(var(--u)*.45);border-radius:calc(var(--u)*1);background:var(--tone);
  box-shadow:0 0 calc(var(--u)*1.6) color-mix(in srgb,var(--tone) 40%,transparent),inset 0 1px 0 rgb(255 255 255 / .35);
  transform:scaleY(0);transform-origin:50% 0;opacity:0;transition:transform .7s var(--d,0s) cubic-bezier(.2,.8,.2,1),opacity .4s var(--d,0s)}
.mf-scene.on .mf-wk-col i{transform:none;opacity:1}
.mf-wk-leg{grid-column:1 / -1;display:flex;flex-wrap:wrap;justify-content:center;gap:calc(var(--u)*.7) calc(var(--u)*2.2);margin-top:calc(var(--u)*.6);font-size:calc(var(--u)*2);color:var(--dim)}
.mf-wk-leg span{display:inline-flex;align-items:center;gap:calc(var(--u)*.8);max-width:100%;min-width:0}
.mf-wk-leg span b{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.mf-wk-leg i{flex:none;width:calc(var(--u)*1.5);height:calc(var(--u)*1.5);border-radius:calc(var(--u)*.45);background:var(--tone)}
.t0{--tone:var(--calm)}.t1{--tone:var(--gold)}.t2{--tone:var(--sky)}.t3{--tone:var(--rose)}.t4{--tone:var(--iris)}

/* خطُّ اليوم الواحد: من أول محاضرةٍ إلى آخرها، والوقتُ يجري من اليمين. */
.mf-line{width:calc(var(--u)*70);display:grid;gap:calc(var(--u)*1)}
.mf-ln-bar{position:relative;height:calc(var(--u)*5.2);border-radius:999px;background:rgb(255 255 255 / .05);box-shadow:inset 0 0 0 1px rgb(255 255 255 / .06);overflow:hidden}
.mf-ln-bar i{position:absolute;inset-block:calc(var(--u)*.55);border-radius:999px;background:var(--tone);
  box-shadow:0 0 calc(var(--u)*1.8) color-mix(in srgb,var(--tone) 45%,transparent),inset 0 1px 0 rgb(255 255 255 / .35);
  transform:scaleX(0);transform-origin:100% 50%;opacity:0;transition:transform .7s var(--d,0s) cubic-bezier(.2,.8,.2,1),opacity .4s var(--d,0s)}
.mf-scene.on .mf-ln-bar i{transform:none;opacity:1}
.mf-ln-ax{display:flex;justify-content:space-between;font-size:calc(var(--u)*1.9);color:var(--dim);font-variant-numeric:tabular-nums}

.mf-days{display:flex;justify-content:center;gap:calc(var(--u)*1.3)}
.mf-days span{position:relative;flex:none;display:grid;place-items:center;width:calc(var(--u)*6.9);height:calc(var(--u)*6.9);border-radius:50%;border:1px solid var(--rule);
  color:var(--dim);font-size:calc(var(--u)*2.7);font-weight:600;background:rgb(255 255 255 / .025);
  transition:background-color .6s var(--d,0s),color .6s var(--d,0s),box-shadow .6s var(--d,0s),border-color .6s var(--d,0s),transform .6s var(--d,0s) cubic-bezier(.2,.8,.2,1)}
.mf-days em{position:absolute;inset:auto 0 calc(var(--u)*1) 0;display:flex;justify-content:center;gap:calc(var(--u)*.5)}
.mf-days em i{width:calc(var(--u)*.8);height:calc(var(--u)*.8);border-radius:50%;background:currentColor;opacity:.7}
.mf-days span.busy{padding-bottom:calc(var(--u)*1.3)}
.mf-scene.on .mf-days span.on{background:var(--gold);border-color:var(--gold);color:#1c2a17;box-shadow:0 0 calc(var(--u)*4) rgb(226 189 118 / .45);transform:translateY(calc(var(--u)*-1)) scale(1.06)}
.mf-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:calc(var(--u)*1.2)}
.mf-chips span{border:1px solid color-mix(in srgb,var(--calm) 45%,var(--rule));color:var(--calm);border-radius:999px;padding:calc(var(--u)*.5) calc(var(--u)*2);font-size:calc(var(--u)*2.1);
  max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:0;transform:scale(.9);transition:opacity .5s var(--d,0s),transform .5s var(--d,0s) cubic-bezier(.2,.8,.2,1)}
.mf-scene.on .mf-chips span{opacity:1;transform:none}
.mf-chips.gold span{border-color:color-mix(in srgb,var(--gold) 50%,var(--rule));color:var(--ink);background:rgb(226 189 118 / .08)}

.mf-ring{width:calc(var(--u)*25);height:calc(var(--u)*25);position:relative}
.mf-ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.mf-ring circle{fill:none;stroke-width:8;stroke:var(--rule)}
.mf-ring circle.v{stroke:var(--gold);stroke-linecap:round;stroke-dasharray:326.73;stroke-dashoffset:326.73;transition:stroke-dashoffset 1.8s .5s cubic-bezier(.2,.7,.2,1);filter:drop-shadow(0 0 5px rgb(226 189 118 / .45))}
.mf-scene.on .mf-ring circle.v{stroke-dashoffset:var(--off,326.73)}
.mf-ring b{position:absolute;inset:0;display:grid;place-items:center;font-size:calc(var(--u)*4.8);font-variant-numeric:tabular-nums}

.mf-dots{display:flex;flex-wrap:wrap;gap:calc(var(--u)*1.2);justify-content:center;max-width:calc(var(--u)*58)}
.mf-dots i{width:calc(var(--u)*2.6);height:calc(var(--u)*2.6);border-radius:50%;background:var(--rule);transition:background-color .5s var(--d,0s),box-shadow .5s var(--d,0s),transform .5s var(--d,0s)}
.mf-scene.on .mf-dots i.lit{background:var(--calm);box-shadow:0 0 calc(var(--u)*1.5) rgb(79 211 161 / .5);transform:scale(1.08)}

.mf-rows{display:flex;flex-direction:column;gap:calc(var(--u)*1);align-items:stretch;width:100%;max-width:calc(var(--u)*46)}
.mf-rows div{display:flex;flex-direction:column;align-items:flex-start;gap:calc(var(--u)*.2);border:1px solid var(--rule);border-radius:calc(var(--u)*1.7);
  background:rgb(255 255 255 / .025);padding:calc(var(--u)*.9) calc(var(--u)*2.2);font-size:calc(var(--u)*2.3);text-align:start;
  opacity:0;transform:translateX(calc(var(--u)*-3));transition:opacity .6s var(--d,0s),transform .6s var(--d,0s)}
.mf-scene.on .mf-rows div{opacity:1;transform:none}
.mf-rows b{font-weight:600;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mf-rows span{display:inline-flex;align-items:center;gap:calc(var(--u)*.8);color:var(--dim);white-space:nowrap;font-size:.92em;font-variant-numeric:tabular-nums}
.mf-rows svg{width:calc(var(--u)*2.2);height:calc(var(--u)*2.2);flex:none}
.mf-rows .is-done span{color:var(--calm);font-weight:600}

.mf-again{display:inline-flex;align-items:center;gap:8px;min-height:max(46px,calc(var(--u)*5.6));padding:0 max(22px,calc(var(--u)*3.2));border-radius:999px;border:0;cursor:pointer;text-decoration:none;
  background:var(--gold);color:#1c2a17;font:inherit;font-weight:700;font-size:max(15px,calc(var(--u)*2.2));box-shadow:0 10px 26px -12px rgb(226 189 118 / .8)}
.mf-again svg{width:16px;height:16px}

/* ── الشريط ── */
.mf-reel{position:absolute;inset:auto 0 0 0;z-index:3;display:flex;gap:8px;align-items:center;
  padding:0 calc(var(--sar) + 12px) calc(var(--sab) + 12px) calc(var(--sal) + 12px)}
.mf-reel[hidden]{display:none}
.mf-reel > button{display:inline-grid;place-items:center;width:44px;height:44px;flex:none;border:1px solid var(--rule);background:rgb(9 26 22 / .6);color:var(--ink);border-radius:50%;
  cursor:pointer;padding:0;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:border-color .2s}
.mf-reel > button:hover{border-color:var(--gold)}
.mf-reel > button svg{width:16px;height:16px}
.mf-track{flex:1;display:flex;gap:4px;min-width:0}
.mf-track button{flex:1;min-width:0;border:0;background:none;padding:20px 0;cursor:pointer}
.mf-track i{display:block;height:4px;border-radius:4px;background:var(--rule);overflow:hidden}
.mf-track b{display:block;height:100%;width:0;background:var(--ink)}
.mf-track button[aria-current="true"] i{background:color-mix(in srgb,var(--ink) 22%,var(--rule))}

.mf-wait{position:absolute;inset:0;display:grid;place-items:center;align-content:center;gap:18px;padding:24px;text-align:center;color:var(--dim);font-size:16px;line-height:1.8}
.mf-wait span{animation:mf-breathe 1.6s ease-in-out infinite}
@keyframes mf-breathe{50%{opacity:.45}}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* مسرحٌ عريض (حاسوب، لوحيٌّ بالعرض، هاتفٌ مطويٌّ بالعرض): النصُّ يميناً والرسمُ يساراً. */
@container (min-aspect-ratio:5/4){
  .mf-scene,.mf-reel{--u:min(1.06cqw,calc((100cqh - 128px)/38.5),15.5px)}
  .mf-scene{padding:calc(var(--sat) + 58px) calc(var(--sar) + var(--u)*7) calc(var(--sab) + 70px) calc(var(--sal) + var(--u)*7)}
  .mf-scene.has-vis{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center;justify-items:center;column-gap:calc(var(--u)*6)}
  .mf-scene.has-vis .mf-col{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--u)*2.2);min-width:0;max-width:100%}
  .mf-big{font-size:calc(var(--u)*5.8)}
  .mf-scene.has-vis .mf-big{font-size:calc(var(--u)*5)}
  .mf-big.m,.mf-scene.has-vis .mf-big.m{font-size:calc(var(--u)*4.2)}
  .mf-eyebrow{font-size:calc(var(--u)*2.1)}
  .mf-cap{font-size:calc(var(--u)*2.1);max-width:calc(var(--u)*46)}
  .mf-badge{font-size:calc(var(--u)*1.8)}
  .mf-trio{gap:calc(var(--u)*4)}
  .mf-trio b{font-size:calc(var(--u)*5)}
  .mf-trio span{font-size:calc(var(--u)*1.8)}
  .mf-week{width:calc(var(--u)*40)}
  .mf-wk-ax,.mf-wk-col{height:calc(var(--u)*29)}
  .mf-wk-leg{font-size:calc(var(--u)*1.6)}
  .mf-wk-ax,.mf-ln-ax{font-size:calc(var(--u)*1.5)}
  .mf-wk-day b{font-size:calc(var(--u)*1.7)}
  .mf-line{width:calc(var(--u)*40)}
  .mf-ln-bar{height:calc(var(--u)*4.6)}
  .mf-ring{width:calc(var(--u)*24);height:calc(var(--u)*24)}
  .mf-dots{max-width:calc(var(--u)*38)}
  .mf-dots i{width:calc(var(--u)*2.2);height:calc(var(--u)*2.2)}
  .mf-days{gap:calc(var(--u)*1.2)}
  .mf-days span{width:calc(var(--u)*7);height:calc(var(--u)*7);font-size:calc(var(--u)*2.4)}
  .mf-days em{bottom:calc(var(--u)*.8)}
  .mf-days span.busy{padding-bottom:calc(var(--u)*1.1)}
  .mf-chips span{font-size:calc(var(--u)*1.8)}
  .mf-rows{max-width:calc(var(--u)*42)}
  .mf-rows div{font-size:calc(var(--u)*1.85);padding:calc(var(--u)*.7) calc(var(--u)*1.8)}
  .mf-rows .is-plain{flex-direction:row;align-items:center;justify-content:space-between;gap:calc(var(--u)*2)}
  .mf-rows .is-plain b{min-width:0}
  .mf-rows .is-plain span{flex:none}
  .mf-rows svg{width:calc(var(--u)*1.9);height:calc(var(--u)*1.9)}
}
/* مسرحٌ عريض قصير (هاتفٌ بالعرض): مفتاحُ الألوان يُطوى ليبقى الأسبوعُ كاملاً فوق الشريط. */
@container (min-aspect-ratio:5/4) and (max-height:430px){
  .mf-wk-leg{display:none}
}
@media (prefers-reduced-motion:reduce){
  .mf-glow,.mf-wait span{animation:none}
  .mf-scene,.mf-p,.mf-scene.on .mf-p,.mf-wk-col i,.mf-ln-bar i,.mf-days span,.mf-chips span,.mf-dots i,.mf-rows div,.mf-ring circle.v,.mf-scene.on .mf-rule{transition:none}
}
`;

const ICON = {
  film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>',
};

export const MY_FILM_JS = `(function(){
var root=document.getElementById("mf"),host=document.getElementById("mfScenes"),reel=document.getElementById("mfReel"),track=document.getElementById("mfTrack"),
 playBtn=document.getElementById("mfPlay"),againBtn=document.getElementById("mfAgain");
var reduce=!!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);
var scenes=[],els=[],bars=[],index=0,playing=false,started=false,elapsed=0,frame=0,counters=0;
var LETTERS=["ح","ن","ث","ر","خ"];
var SV={play:'<path d="M7 4.5v15l12-7.5z"/>',pause:'<path d="M8 5v14"/><path d="M16 5v14"/>',again:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>'};
function svg(k){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+SV[k]+'</svg>'}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function num(n){return (Math.round((Number(n)||0)*10)/10).toLocaleString("en-US",{maximumFractionDigits:1})}
function clock(m){m=Math.round(Number(m)||0);var h=Math.floor(m/60),r=m%60;return (h<10?"0":"")+h+":"+(r<10?"0":"")+r}
var VIS={week:1,line:1,ring:1,dots:1,days:1};
function cap(t){return String(t==null?"":t).split(String.fromCharCode(10)).map(function(x){return '<span>'+esc(x)+'</span>'}).join("")}

function part(p,i){
 var a=' style="order:'+i+';--i:'+i+'"';
 if(p.t==="eyebrow")return '<div class="mf-p mf-eyebrow"'+a+'>'+esc(p.text)+'</div>';
 if(p.t==="big")return '<div class="mf-p mf-big'+(p.size==="m"?" m":"")+'"'+a+'>'+esc(p.text)+'</div>';
 if(p.t==="cap")return '<div class="mf-p mf-cap"'+a+'>'+cap(p.text)+'</div>';
 if(p.t==="badge")return '<div class="mf-p mf-badge"'+a+'>'+esc(p.text)+'</div>';
 if(p.t==="rule")return '<i class="mf-p mf-rule"'+a+' aria-hidden="true"></i>';
 if(p.t==="trio")return '<div class="mf-p mf-trio"'+a+'>'+p.items.map(function(x){return '<div><b data-to="'+Number(x.value)+'">'+num(x.value)+'</b><span>'+esc(x.label)+'</span></div>'}).join("")+'</div>';
 if(p.t==="week"){
  var from=Math.floor(p.from/60)*60,to=Math.ceil(p.to/60)*60,span=Math.max(60,to-from),h='';
  for(var d=0;d<5;d++){var col='';p.blocks.forEach(function(b,n){if(b.day!==d)return;
    col+='<i class="t'+(Number(b.tone)||0)+'" style="top:'+((b.start-from)/span*100).toFixed(2)+'%;height:'+Math.max(4,(b.end-b.start)/span*100).toFixed(2)+'%;--d:'+(0.35+n*0.07).toFixed(2)+'s"></i>'});
   h+='<div class="mf-wk-day"><div class="mf-wk-col">'+col+'</div><b>'+LETTERS[d]+'</b></div>'}
  return '<div class="mf-p mf-vis mf-week"'+a+' aria-hidden="true"><div class="mf-wk-ax"><span>'+clock(from)+'</span><span>'+clock(to)+'</span></div><div class="mf-wk-cols" style="--hr:'+(60/span*100).toFixed(3)+'%">'+h+'</div>'+
   ((p.legend||[]).length?'<div class="mf-wk-leg">'+p.legend.map(function(x){return '<span class="t'+(Number(x.tone)||0)+'"><i></i><b>'+esc(x.text)+'</b></span>'}).join("")+'</div>':'')+'</div>'}
 if(p.t==="line"){
  var s0=p.from,sp=Math.max(30,p.to-p.from);
  return '<div class="mf-p mf-vis mf-line"'+a+' aria-hidden="true"><div class="mf-ln-bar">'+p.blocks.map(function(b,n){
    return '<i class="t'+(Number(b.tone)||0)+'" style="inset-inline-start:'+((b.start-s0)/sp*100).toFixed(2)+'%;width:'+Math.max(3,(b.end-b.start)/sp*100).toFixed(2)+'%;--d:'+(0.4+n*0.18).toFixed(2)+'s"></i>'}).join("")+
   '</div><div class="mf-ln-ax"><span>'+clock(p.from)+'</span><span>'+clock(p.to)+'</span></div></div>'}
 if(p.t==="days")return '<div class="mf-p mf-vis mf-days"'+a+' aria-hidden="true">'+p.items.map(function(x,n){var k=Math.min(5,Number(x.count)||0),dots='';for(var j=0;j<k;j++)dots+='<i></i>';
   return '<span class="'+(x.on?"on":"busy")+'" style="--d:'+(0.3+n*0.12).toFixed(2)+'s">'+esc(x.letter)+(dots?'<em>'+dots+'</em>':'')+'</span>'}).join("")+'</div>';
 if(p.t==="chips")return '<div class="mf-p mf-chips'+(p.tone==="gold"?" gold":"")+'"'+a+'>'+p.items.map(function(x,n){return '<span style="--d:'+(0.5+n*0.14).toFixed(2)+'s">'+esc(x)+'</span>'}).join("")+'</div>';
 if(p.t==="ring"){var pct=Math.max(0,Math.min(100,Number(p.pct)||0));
  return '<div class="mf-p mf-vis mf-ring"'+a+'><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52"/><circle class="v" cx="60" cy="60" r="52" style="--off:'+(326.73*(1-pct/100)).toFixed(2)+'"/></svg><b>'+esc(p.inside)+'</b></div>'}
 if(p.t==="dots"){var total=Math.max(1,Number(p.total)||0),shown=Math.min(60,total),lit=Math.max(0,Math.min(shown,Math.round((Number(p.lit)||0)*shown/total))),o='';
  for(var q=0;q<shown;q++)o+='<i class="'+(q<lit?"lit":"")+'" style="--d:'+(0.4+q*0.05).toFixed(2)+'s"></i>';
  return '<div class="mf-p mf-vis mf-dots"'+a+' aria-hidden="true">'+o+'</div>'}
 if(p.t==="rows")return '<div class="mf-p mf-rows"'+a+'>'+p.items.map(function(x,n){
   return '<div class="is-'+(x.state==="done"?"done":"plain")+'" style="--d:'+(0.5+n*0.35).toFixed(2)+'s"><b>'+esc(x.label)+'</b><span>'+(x.state==="done"?svg("check"):"")+esc(x.text)+'</span></div>'}).join("")+'</div>';
 return ""}

function build(film){
 scenes=film.scenes||[];var h='',t='';
 scenes.forEach(function(sc,n){var vis='',txt='',has=false;
  var lined=sc.parts.some(function(p){return p.t==="line"});
  /* العمودُ المرسوم في المسرح العريض: أولُ رسمٍ في المشهد، ومعه صفوفُ اليوم حين يكون الرسمُ خطَّ يوم. */
  sc.parts.forEach(function(p,i){var out=part(p,i);if(VIS[p.t]&&!has){vis+=out;has=true}else if(lined&&p.t==="rows")vis+=out;else txt+=out});
  var last=n===scenes.length-1;
  if(last)txt+='<a class="mf-p mf-again" href="'+esc(root.getAttribute("data-back"))+'" style="order:99;--i:'+sc.parts.length+'">'+esc("عُد إلى "+root.getAttribute("data-back-label"))+'</a>';
  h+='<section class="mf-scene'+(has?" has-vis":"")+'" role="group" aria-roledescription="مشهد" aria-label="'+esc(sc.label)+'" aria-hidden="true"><div class="mf-col mf-col-t">'+txt+'</div>'+(has?'<div class="mf-col mf-col-v">'+vis+'</div>':'')+'</section>';
  t+='<button type="button" aria-label="المشهد '+(n+1)+': '+esc(sc.label)+'" data-n="'+n+'"><i><b></b></i></button>'});
 host.innerHTML=h;track.innerHTML=t;
 els=[].slice.call(host.querySelectorAll(".mf-scene"));bars=[].slice.call(track.querySelectorAll("b"));
 root.setAttribute("aria-label","فيلمي: "+(film.title||""));
 if(!film.final)root.classList.add("is-sofar");
 reel.hidden=false}

function paint(at,f){for(var n=0;n<bars.length;n++)bars[n].style.width=n<at?"100%":n===at?Math.round(f*100)+"%":"0%"}
function count(el){
 var to=Number(el.getAttribute("data-to"))||0;
 if(reduce){el.textContent=num(to);return}
 var run=++counters,t0=performance.now();el.textContent="0";
 function tick(now){if(el.getAttribute("data-run")!==String(run))return;var t=Math.max(0,Math.min(1,(now-t0-450)/1500)),e=1-Math.pow(1-t,3);
  el.textContent=t<1?String(Math.round(to*e)):num(to);if(t<1)requestAnimationFrame(tick)}
 el.setAttribute("data-run",String(run));requestAnimationFrame(tick)}
function show(n){
 index=Math.max(0,Math.min(scenes.length-1,n));elapsed=0;
 els.forEach(function(el,i){var on=i===index;el.classList.toggle("on",on);if(on)el.removeAttribute("aria-hidden");else el.setAttribute("aria-hidden","true")});
 [].forEach.call(track.children,function(b,i){if(i===index)b.setAttribute("aria-current","true");else b.removeAttribute("aria-current")});
 [].forEach.call(els[index].querySelectorAll("[data-to]"),count);
 paint(index,reduce?1:0)}
function ended(){return !playing&&index===scenes.length-1&&elapsed>=(scenes[index]?scenes[index].duration:0)}
function sync(){var on=playing&&!ended();playBtn.innerHTML=svg(on?"pause":"play")+'<span class="sr">'+(on?"أوقف":"شغّل")+'</span>';playBtn.setAttribute("aria-label",on?"أوقف":"شغّل")}
function loop(now){
 if(!playing)return;
 var dur=scenes[index].duration||4000;elapsed+=Math.min(100,now-loop.last);loop.last=now;
 paint(index,Math.min(1,elapsed/dur));
 if(elapsed>=dur){if(index<scenes.length-1){show(index+1)}else{playing=false;sync();return}}
 frame=requestAnimationFrame(loop)}
function play(){if(reduce||playing)return;playing=true;started=true;loop.last=performance.now();cancelAnimationFrame(frame);frame=requestAnimationFrame(loop);sync()}
function pause(){playing=false;cancelAnimationFrame(frame);sync()}
function toggle(){if(ended()){show(0);play();return}if(playing)pause();else play()}
function jump(n){var was=playing;show(n);if(was){loop.last=performance.now()}sync()}
function again(){show(0);if(reduce)sync();else{playing=false;play()}}

playBtn.addEventListener("click",function(e){e.stopPropagation();if(reduce){jump(index<scenes.length-1?index+1:0);return}toggle()});
againBtn.addEventListener("click",function(e){e.stopPropagation();again()});
track.addEventListener("click",function(e){var b=e.target.closest?e.target.closest("button"):null;if(!b)return;e.stopPropagation();jump(Number(b.getAttribute("data-n"))||0)});
/* لمسةٌ على يسار المسرح للمشهد التالي (اتجاهُ القراءة من اليمين)، وعلى يمينه للسابق، وفي وسطه توقف وتشغّل. */
host.addEventListener("click",function(e){
 if(!scenes.length||(e.target.closest&&e.target.closest("a,button")))return;
 var r=host.getBoundingClientRect(),x=(e.clientX-r.left)/Math.max(1,r.width);
 if(x<0.34)jump(index+1);else if(x>0.66)jump(index-1);else if(!reduce)toggle()});
document.addEventListener("keydown",function(e){
 if(!scenes.length)return;
 if(e.key===" "||e.key==="k"){if(e.target&&e.target.closest&&e.target.closest("a,button"))return;e.preventDefault();if(!reduce)toggle()}
 else if(e.key==="ArrowLeft"){e.preventDefault();jump(index+1)}
 else if(e.key==="ArrowRight"){e.preventDefault();jump(index-1)}});
document.addEventListener("visibilitychange",function(){if(document.hidden&&playing)pause()});

function fail(text){host.innerHTML='<div class="mf-wait" role="alert"><div>'+esc(text)+'</div><a class="mf-again" href="'+esc(root.getAttribute("data-back"))+'">'+esc(root.getAttribute("data-back-label"))+'</a></div>'}
fetch(root.getAttribute("data-api"),{credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}})
 .then(function(r){return r.json().catch(function(){return {}}).then(function(d){return {ok:r.ok,d:d}})})
 .then(function(x){
  if(!x.ok||!x.d||!x.d.film||!x.d.film.scenes||!x.d.film.scenes.length){fail((x.d&&x.d.error)||"تعذّر إعداد فيلمك الآن. أعد المحاولة بعد قليل.");return}
  build(x.d.film);show(0);sync();
  /* مهلةٌ قصيرة ليُرسم المشهدُ الأول ساكناً ثم يتحرّك (لا يبدأ شيءٌ وحده لمن قلّل الحركة). */
  if(!reduce)setTimeout(play,60)})
 .catch(function(){fail("تعذّر الاتصال. تحقق من الشبكة ثم أعد المحاولة.")});
})();`;

const esc = (value: string) => String(value || "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));

export interface MyFilmPageInput {
  /** مسارُ القراءة الذي يعيد `{ film }` لصاحب الصفحة وحده. */
  api: string;
  /** إلى أين يعود: صفحةُ جدوله أو «مساري». */
  back: string;
  backLabel: string;
  nonce: string;
}

export function myFilmPage(input: MyFilmPageInput): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#0d241f"><meta name="color-scheme" content="dark">
<title>فيلمي — SCHEDULE</title><link rel="icon" href="/schedule-icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/schedule-icon-192.png">
<style>/* SCHEDULE_PUBLIC_PLEX_ARABIC */${PUBLIC_FONT_FACES}${MY_FILM_CSS}</style></head>
<body><main class="mf" id="mf" role="region" aria-roledescription="فيلم" aria-label="فيلمي" data-api="${esc(input.api)}" data-back="${esc(input.back)}" data-back-label="${esc(input.backLabel)}">
<div class="mf-glow" aria-hidden="true"></div>
<svg class="mf-orbit" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="49"/><circle cx="50" cy="50" r="38"/><circle cx="50" cy="50" r="27"/></svg>
<header class="mf-top"><a class="mf-x" href="${esc(input.back)}">${ICON.back}<span>${esc(input.backLabel)}</span></a><span class="mf-mark">${ICON.film}فيلمي</span></header>
<div class="mf-scenes" id="mfScenes" aria-live="polite"><div class="mf-wait" role="status"><span>جاري إعداد فيلمك…</span></div></div>
<div class="mf-reel" id="mfReel" hidden>
<button type="button" id="mfPlay" aria-label="شغّل"></button>
<div class="mf-track" id="mfTrack" role="group" aria-label="مشاهد الفيلم"></div>
<button type="button" id="mfAgain" aria-label="أعد من البداية"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></button>
</div></main>
<script nonce="${input.nonce}">${MY_FILM_JS}</script></body></html>`;
}
