/**
 * ── صفحةُ رابط عضو الفريق: /k/<رمز> (docs/SEATS.md) ──────────────────────────
 *
 * يفتحها عضوُ لجنة الجدول أو موظفُ التسجيل من رسالة واتساب أو رمز QR. تقول له
 * على أيّ كرسيٍّ يدخل وباسم من، وتطلب آخر أربعة أرقام من رقمه المدني — كما تطلب
 * بطاقةُ الأستاذ رقمه — ثم تدخله. لا كلمة سرّ يحفظها، ولا يعرف كلمةَ سرّ الكرسي.
 *
 * النصُّ داخل String.raw: لا علامةَ اقتباسٍ مائلة ولا ‎${‎ داخل السكربت.
 */
import { PUBLIC_FONT_FACES } from "./publicKit";
import { PUBLIC_DARK_VARS, PUBLIC_LIGHT_VARS } from "./publicTheme";

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));

const CSS = String.raw`
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px 16px;background:radial-gradient(120% 80% at 50% -10%,var(--accent-soft),transparent 60%),var(--bg);color:var(--ink);font:400 16px/1.7 "Plex Arabic","Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;font-synthesis:none;-webkit-text-size-adjust:100%}
button,input{font:inherit}
.card{inline-size:min(100%,440px);background:var(--card);border:1px solid var(--line);border-radius:28px;padding:28px 22px 22px;box-shadow:0 24px 60px rgba(17,48,38,.10);display:grid;gap:18px;animation:rise .45s cubic-bezier(.2,.8,.2,1)}
@keyframes rise{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}
.brand{display:flex;align-items:center;gap:10px;color:var(--brass);font:700 12px/1 system-ui,sans-serif;letter-spacing:.28em}
.brand i{inline-size:26px;block-size:26px;border-radius:8px;background:var(--accent);display:grid;place-items:center}
.brand i::after{content:"";inline-size:10px;block-size:10px;border-radius:3px;background:var(--on-accent);opacity:.9}
.seat{display:grid;gap:4px;padding:14px 16px;border-radius:18px;background:var(--soft)}
.seat small{color:var(--muted);font-size:12.5px;font-weight:600}
.seat b{font-size:15px;line-height:1.5}
.who{display:flex;align-items:center;gap:14px}
.avatar{inline-size:56px;block-size:56px;flex:none;border-radius:18px;background:var(--accent);color:var(--on-accent);display:grid;place-items:center;font-size:24px;font-weight:700}
.who h1{margin:0;font-size:22px;line-height:1.35;letter-spacing:-.01em}
.who p{margin:2px 0 0;color:var(--muted);font-size:13.5px}
.lbl{margin:0;font-size:13.5px;font-weight:700;color:var(--muted);text-align:center}
.otp{position:relative;display:flex;gap:10px;justify-content:center;direction:ltr}
.otp i{inline-size:58px;block-size:66px;border-radius:16px;border:1.5px solid var(--line-strong);display:grid;place-items:center;font:700 26px/1 inherit;font-style:normal;font-variant-numeric:tabular-nums;background:var(--card);transition:border-color .15s,box-shadow .15s}
.otp i.on{border-color:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 20%,transparent)}
.otp i.fill{border-color:color-mix(in srgb,var(--accent) 55%,var(--line-strong))}
.otp input{position:absolute;inset:0;inline-size:100%;block-size:100%;opacity:0;font-size:16px;border:0;background:transparent;direction:ltr}
.remember{display:flex;align-items:center;justify-content:center;gap:9px;font-size:13.5px;color:var(--muted);cursor:pointer}
.remember input{inline-size:18px;block-size:18px;accent-color:var(--accent)}
.go{inline-size:100%;min-block-size:56px;border:0;border-radius:18px;background:var(--accent);color:var(--on-accent);font-weight:700;font-size:17px;cursor:pointer;box-shadow:0 10px 24px color-mix(in srgb,var(--accent) 28%,transparent);transition:transform .1s}
.go:active{transform:scale(.985)}
.go:disabled{opacity:.5;box-shadow:none;cursor:not-allowed}
.err{padding:11px 13px;border-radius:14px;background:var(--bad-soft);color:var(--bad);font-size:14px;font-weight:600;text-align:center}
.err[hidden]{display:none}
.note{margin:0;font-size:12px;color:var(--muted);text-align:center;line-height:1.8}
.gone{text-align:center;display:grid;gap:10px}
.gone .mark{margin:0 auto;inline-size:64px;block-size:64px;border-radius:20px;background:var(--soft);display:grid;place-items:center;color:var(--brass);font-size:30px}
.gone h1{margin:0;font-size:20px}
.gone p{margin:0;color:var(--muted);font-size:14.5px}
@media (prefers-reduced-motion:reduce){.card{animation:none}}
`;

const SCRIPT = String.raw`
(function(){
var TOKEN=__TOKEN__,NEEDS=__NEEDS__;
var form=document.getElementById("f"),go=document.getElementById("go"),err=document.getElementById("err");
var tail=document.getElementById("tail"),boxes=[].slice.call(document.querySelectorAll(".otp i"));
function paint(){if(!tail)return;var v=tail.value.replace(/[^0-9]/g,"").slice(0,4);tail.value=v;
 boxes.forEach(function(b,i){b.textContent=v[i]||"";b.className=(i===v.length?"on ":"")+(v[i]?"fill":"");});
 go.disabled=v.length!==4;}
if(tail){tail.addEventListener("input",paint);tail.addEventListener("focus",paint);paint();setTimeout(function(){tail.focus();},250);}
form.addEventListener("submit",function(e){e.preventDefault();if(go.disabled)return;go.disabled=true;err.hidden=true;
 var body={tail:tail?tail.value:"",remember:!!(document.getElementById("rem")||{}).checked};
 fetch("/api/public/team/"+encodeURIComponent(TOKEN),{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify(body)})
 .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});})
 .then(function(x){if(x.ok){location.replace(x.j.redirect||"/");return;}
   err.textContent=(x.j&&x.j.error)||"تعذّر الدخول. حاول مرة أخرى.";err.hidden=false;
   if(tail){tail.value="";paint();tail.focus();}go.disabled=NEEDS;})
 .catch(function(){err.textContent="تعذّر الاتصال. تحقّق من الشبكة وحاول مرة أخرى.";err.hidden=false;go.disabled=false;});
});
})();
`;

export function seatTeamPage(input: { nonce?: string; token: string; error?: string; memberName?: string; seatName?: string; caption?: string; needsTail?: boolean; demo?: boolean }): string {
  const head = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><meta name="theme-color" content="#f2f3ef"><title>دخول الفريق · SCHEDULE</title><style>${PUBLIC_FONT_FACES}:root{${PUBLIC_LIGHT_VARS}}@media (prefers-color-scheme:dark){:root{${PUBLIC_DARK_VARS}}}${CSS}</style></head><body>`;
  const brand = `<div class="brand"><i aria-hidden="true"></i>SCHEDULE</div>`;
  if (input.error || !input.memberName) {
    return `${head}<main class="card">${brand}<div class="gone"><div class="mark" aria-hidden="true">⌁</div><h1>تعذّر فتح الرابط</h1><p>${esc(input.error || "هذا الرابط لم يعد صالحاً.")}</p></div></main></body></html>`;
  }
  const initial = esc(String(input.memberName).trim().replace(/^(د|أ|م)\.\s*/, "").charAt(0) || "؟");
  const tail = input.needsTail
    ? `<p class="lbl" id="tl">آخر أربعة أرقام من رقمك المدني</p>
<label class="otp"><span class="sr-only" style="position:absolute;inline-size:1px;block-size:1px;overflow:hidden;clip:rect(0 0 0 0)">آخر أربعة أرقام من رقمك المدني</span><input id="tail" inputmode="numeric" autocomplete="one-time-code" maxlength="4" aria-describedby="tl"><i></i><i></i><i></i><i></i></label>
<label class="remember"><input type="checkbox" id="rem" checked> تذكّر هذا الجهاز ثلاثين يوماً</label>`
    : `<p class="note">هذا الجهاز معروفٌ لديك. اضغط للدخول.</p>`;
  return `${head}<main class="card">${brand}
<div class="who"><div class="avatar" aria-hidden="true">${initial}</div><div><h1>${esc(input.memberName)}</h1><p>${esc(input.caption || "عضو فريق")}</p></div></div>
<div class="seat"><small>تدخل في فريق</small><b>${esc(input.seatName)}</b></div>
<form id="f" novalidate>
<div style="display:grid;gap:14px">${tail}
<div class="err" id="err" role="alert" hidden></div>
<button class="go" id="go" type="submit"${input.needsTail ? " disabled" : ""}>ادخل إلى مساحة العمل</button></div>
</form>
<p class="note">${input.demo ? "رابطٌ من البيئة التجريبية. " : ""}لا تشارك هذا الرابط: هو مفتاحك الشخصي، ويُبطله رئيس الفريق متى شاء.</p>
</main><script${input.nonce ? ` nonce="${esc(input.nonce)}"` : ""}>${SCRIPT.replace("__TOKEN__", JSON.stringify(input.token)).replace("__NEEDS__", input.needsTail ? "true" : "false")}</script></body></html>`;
}
