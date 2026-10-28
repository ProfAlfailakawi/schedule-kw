/**
 * ── M2: «هذه مقترحات فقط، وليست تسجيلاً نهائياً» ─────────────────────────────
 *
 * بطاقةٌ كبيرة عند دخول مساري: 💡 مقترحات ← 👀 مراجعة ← ✅ التسجيل الرسمي يتمّ في
 * النظام الرسمي. لا يكمل الطالب قبل «فهمت ✓». تُعرض مرةً لكل فصل، وتعود إن تغيّر
 * مساره (القسم أو الصحيفة). بعدها شريطٌ صغيرٌ ثابت «مقترح · غير نهائي» في كل شاشة.
 *
 * «فهمت» تُحفظ في ملف الطالب على الخادم (‎/api/public/me/ack‎) — لا شيء في تخزين
 * المتصفح (قاعدة باب الطالب) — فتتبعه على كل أجهزته.
 */
export const MASARI_ACK_TEXT = "هذه مقترحات فقط، وليست تسجيلاً نهائياً";

export const MASARI_ACK_CSS = `
.mack{display:grid;gap:18px;justify-items:center;text-align:center;padding:28px 18px;margin:12px auto;max-inline-size:560px;border-radius:24px;background:var(--card);border:1px solid var(--line);box-shadow:0 18px 40px -24px rgba(0,0,0,.35)}
.mack h1{margin:0;font-size:22px;line-height:1.5}
.mack-flow{display:flex;align-items:stretch;gap:6px;inline-size:100%;justify-content:center}
.mack-step{flex:1 1 0;display:grid;gap:6px;justify-items:center;padding:14px 6px;border-radius:18px;background:var(--soft);min-inline-size:0}
.mack-step i{font-style:normal;font-size:30px;line-height:1}.mack-step b{font-size:13.5px}.mack-step small{font-size:11.5px;color:var(--muted);line-height:1.6}
.mack-step[data-k=official]{background:color-mix(in srgb,var(--accent) 12%,var(--card));border:1px solid color-mix(in srgb,var(--accent) 30%,transparent)}
.mack-arrow{align-self:center;color:var(--muted);font-size:18px}
.mack-ok{min-block-size:56px;min-inline-size:220px;border:0;border-radius:18px;background:var(--accent);color:#fff;font:inherit;font-size:18px;font-weight:800;cursor:pointer;box-shadow:0 10px 24px -12px var(--accent)}
.mack-ok:focus-visible{outline:3px solid var(--accent-soft);outline-offset:3px}
.mribbon{position:fixed;inset-block-start:10px;inset-inline-start:50%;transform:translateX(50%);z-index:40;display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;background:color-mix(in srgb,#f5c542 22%,var(--card));border:1px solid color-mix(in srgb,#8a6100 35%,var(--line));color:var(--ink,inherit);font-size:12px;font-weight:800;box-shadow:0 6px 16px -10px rgba(0,0,0,.4);pointer-events:none}
[dir=rtl] .mribbon{transform:translateX(50%)}
@media(max-width:520px){.mack-flow{flex-direction:column}.mack-arrow{transform:rotate(90deg)}.mribbon{inset-block-start:auto;inset-block-end:calc(env(safe-area-inset-bottom,0px) + 74px)}}
@media print{.mribbon{display:none}}
`;

export const MASARI_ACK_JS = String.raw`
function masariAckKey(){var s=S.state||{},p=s.profile||{},t=s.term||{};return "masari-ack:"+(t.id||"")+":"+(p.sectionId||"")+":"+(p.planId||p.curriculumPlanId||"")}
function masariAcked(){var p=(S.state||{}).profile||{};return p.masariAck===masariAckKey()}
function masariRibbon(){var r=document.getElementById("mribbon");if(!r){r=document.createElement("div");r.id="mribbon";r.className="mribbon";r.setAttribute("role","note");document.body.appendChild(r)}r.textContent="💡 مقترح · غير نهائي"}
function viewAck(){var r=document.getElementById("mribbon");if(r)r.remove();
  app.innerHTML='<section class="mack fade" role="dialog" aria-modal="true" aria-labelledby="mackT"><h1 id="mackT">${MASARI_ACK_TEXT}</h1>'+
  '<div class="mack-flow" aria-hidden="true"><div class="mack-step"><i>💡</i><b>مقترحات</b><small>مساري يقترح</small></div><span class="mack-arrow">←</span>'+
  '<div class="mack-step"><i>👀</i><b>مراجعة</b><small>أنت ومرشدك</small></div><span class="mack-arrow">←</span>'+
  '<div class="mack-step" data-k="official"><i>✅</i><b>التسجيل الرسمي</b><small>في النظام الرسمي للجامعة</small></div></div>'+
  '<button type="button" class="mack-ok" id="mackOk">فهمت ✓</button></section>';
  var b=document.getElementById("mackOk");b.focus();b.addEventListener("click",function(){var k=masariAckKey();if(S.state&&S.state.profile)S.state.profile.masariAck=k;api("POST","/api/public/me/ack",{key:k});viewHome();masariRibbon()})}
`;
