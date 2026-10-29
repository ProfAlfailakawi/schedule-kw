/**
 * ── استبيانُ الطلبة وصفحةُ الحالة الفردية ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { DEMO_COPY_SCRIPT } from "../publicKit";
import { ARABIC_COUNT_SCRIPT } from "../../utils/arabicCount";
import { PUBLIC_LIGHT_VARS } from "../publicTheme";

/**
 * ── صفحة الطالب ─────────────────────────────────────────────────────────────
 *
 * Twenty seconds, one screen, no account. A student opens a link, taps the
 * courses they need, types a name and a civil ID, and is finished.
 *
 * Three things it deliberately never does:
 *   · It shows no counts. The moment a student can see how many others chose a
 *     course, this stops being a survey and becomes a campaign.
 *   · It asks nothing it can answer from the link. The section — and with it
 *     the cohort — is in the link, so nobody is asked which one they belong to.
 *   · It promises nothing. «يُساعد القسم» is true; «سيُفتح» is not, and one
 *     broken promise ends the usefulness of every survey after it.
 */
export function surveyPage(token: string, label: string, nonce: string): string {
  return `<!doctype html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>${label} · SCHEDULE</title>
<link rel="icon" href="/schedule-icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/schedule-icon-192.png">
<style>/* SCHEDULE_PUBLIC_PLEX_ARABIC */@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:400;font-display:swap;src:url("/fonts/plex-arabic-arabic-400.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:500;font-display:swap;src:url("/fonts/plex-arabic-arabic-500.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:600;font-display:swap;src:url("/fonts/plex-arabic-arabic-600.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:700;font-display:swap;src:url("/fonts/plex-arabic-arabic-700.woff2") format("woff2")}
:root{${PUBLIC_LIGHT_VARS};--cohort-rgb:31,107,92}
*{box-sizing:border-box}
body[data-cohort="boys"]{--jade:#2f6b99;--cohort-rgb:47,107,153}
body[data-cohort="girls"]{--jade:#8c4a72;--cohort-rgb:140,74,114}
body{margin:0;min-height:100dvh;background:
  radial-gradient(circle at 88% 0%,rgba(var(--cohort-rgb),.10),transparent 34%),
  var(--bg);color:var(--ink);
  font-family:"Plex Arabic",-apple-system,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;font-synthesis:none;font-kerning:normal;
  -webkit-text-size-adjust:100%;padding:22px 16px 40px}
.wrap{max-inline-size:640px;margin-inline:auto}
.kicker{font-weight:600;font-size:12px;line-height:1.4;letter-spacing:0;color:var(--brass)}
h1{margin:10px 0 4px;font-size:23px;font-weight:700;line-height:1.35}
.sub{margin:0 0 12px;font-size:13.5px;color:var(--dim);line-height:1.85}
.sub b{color:var(--ink);font-weight:600}
/* «هذا ليس تسجيلاً» — أهم سطر في الصفحة أثناء أسبوع التسجيل، فيجب أن يُقرأ
   بوضوح ولا يصرخ: إطار هادئ بلون النحاس، لا لافتة حمراء. */
.warn-line{
  margin:0 0 22px;padding:10px 13px;
  border:1px solid rgba(199,155,95,.32);border-radius:11px;
  background:rgba(199,155,95,.07);
  color:var(--dim);font-size:13px;line-height:1.8;text-align:start;
}
.warn-line b{color:var(--brass);font-weight:700}
.step{margin-block:26px 10px;display:flex;align-items:center;gap:9px;font-size:12px;color:var(--dim)}
.step b{inline-size:21px;block-size:21px;flex:none;display:grid;place-items:center;border-radius:50%;
  background:var(--card);border:1px solid var(--line);font:700 11px/1 system-ui;color:var(--jade)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:8px}
.pick{
  position:relative;display:flex;flex-direction:column;gap:4px;
  padding:13px 13px 12px;border:1px solid var(--line);border-radius:14px;
  background:var(--card);color:var(--ink);text-align:start;cursor:pointer;
  font:inherit;transition:border-color .16s,background .16s,transform .12s;
}
.pick:active{transform:scale(.985)}
.pick strong{font-size:13.5px;font-weight:600;line-height:1.4}
.pick small{font-size:11px;color:var(--dim);font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:isolate}
.pick[aria-pressed="true"]{border-color:var(--jade);background:color-mix(in srgb,var(--jade) 12%,var(--card))}
.pick i{position:absolute;inset-block-start:11px;inset-inline-end:11px;inline-size:19px;block-size:19px;
  border-radius:6px;border:1.5px solid var(--line-strong);display:grid;place-items:center;
  background:rgba(19,24,23,.015);transition:border-color .16s,background .16s,transform .16s}
.pick i::after{content:"";inline-size:6px;block-size:10px;border:0;border-right:2px solid var(--on-accent);border-bottom:2px solid var(--on-accent);
  transform:translateY(-1px) rotate(45deg) scale(.4);opacity:0;transition:.16s}
.pick[aria-pressed="true"] i{border-color:var(--jade);background:var(--jade);transform:scale(1.04)}
.pick[aria-pressed="true"] i::after{opacity:1;transform:translateY(-1px) rotate(45deg) scale(1)}
.field{display:grid;gap:6px;margin-block-end:12px}
.field label{font-size:12.5px;color:var(--dim)}
.field input{
  inline-size:100%;padding:13px 14px;border-radius:12px;border:1px solid var(--line);
  background:var(--card);color:var(--ink);font-weight:400;font-size:15px;line-height:1.5;font-family:inherit;
}
.field input:focus{outline:none;border-color:var(--jade);box-shadow:0 0 0 3px color-mix(in srgb,var(--jade) 18%,transparent)}
.field input[inputmode=numeric]{direction:ltr;text-align:start;font-variant-numeric:tabular-nums}
.send{
  inline-size:100%;min-block-size:52px;margin-block-start:8px;border-radius:14px;cursor:pointer;
  background:var(--jade);border:1px solid var(--jade);color:var(--on-accent);font-weight:700;font-size:15.5px;line-height:1;font-family:inherit;
}
.send:disabled{opacity:.45;cursor:default}
.note{margin:14px 0 0;font-size:11.5px;line-height:1.9;color:var(--muted);text-align:center}
.err{margin:12px 0 0;padding:11px 13px;border-radius:11px;font-size:13px;line-height:1.7;
  background:color-mix(in srgb,#a2402f 16%,transparent);border:1px solid color-mix(in srgb,#a2402f 40%,transparent)}
.done{text-align:center;padding-block:52px}
.done .tick{inline-size:62px;block-size:62px;margin-inline:auto;border-radius:50%;display:grid;place-items:center;
  background:color-mix(in srgb,var(--jade) 18%,transparent);border:1.5px solid var(--jade);
  font-size:29px;color:var(--jade);animation:pop .34s cubic-bezier(.2,.9,.3,1.2) both}
@keyframes pop{from{transform:scale(.6);opacity:0}to{transform:none;opacity:1}}
.done h2{margin:20px 0 6px;font-size:20px;font-weight:700}
.done p{margin:0;color:var(--dim);font-size:13.5px;line-height:1.9}
/* The button is sticky, which is right — a student choosing twelve courses
   should never hunt for it. But sticky means content scrolls UNDER it, and with
   no backdrop the last two courses showed through the button and neither could
   be read. So it carries a band of the page's own background, fading upward,
   and the page reserves room beneath it so the final row is never trapped. */
/* البحث السريع */
.seek{position:relative;margin-block-end:10px}
.seek input{
  inline-size:100%;padding:12px 14px;font:inherit;font-size:15px;
  color:var(--ink);background:var(--card);
  border:1px solid var(--line);border-radius:12px;outline:none;
}
.seek input:focus{border-color:var(--jade);box-shadow:0 0 0 3px color-mix(in srgb,var(--jade) 18%,transparent)}
.seek span{
  position:absolute;inset-block-start:50%;inset-inline-end:14px;transform:translateY(-50%);
  color:var(--dim);font-size:12px;pointer-events:none;
}

/* The hidden attribute is only display:none in the browser's own stylesheet,
   so the display:flex below would beat it and paint an empty box under the
   search. Same trap as the workspace, same one-line answer. */
[hidden]{display:none !important}

/* المختار — مثبّت فوق، فلا يضيع خلف مجموعة مطويّة */
.chosen{
  display:flex;flex-wrap:wrap;align-items:center;gap:6px;
  margin-block-end:12px;padding:10px 12px;
  border:1px solid rgba(105,192,168,.3);border-radius:12px;background:rgba(105,192,168,.07);
}
.chosen-label{color:var(--dim);font-size:12px;margin-inline-end:2px}
.chip{
  padding:5px 10px;border:1px solid rgba(105,192,168,.4);border-radius:999px;
  background:transparent;color:var(--jade);font:inherit;font-size:12.5px;cursor:pointer;
  direction:ltr;unicode-bidi:isolate;
}
.chip em{font-style:normal;opacity:.7}
.chip:hover{background:rgba(105,192,168,.12)}

/* الأكورديون — المقررات كثيرة، فالافتراضي مطويّ */
.fold{margin-block-end:8px;border:1px solid var(--line);border-radius:13px;overflow:hidden;background:var(--card)}
.fold-head{
  inline-size:100%;display:flex;align-items:center;gap:9px;
  padding:13px 14px;border:0;background:transparent;color:var(--ink);
  font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;text-align:start;
}
.fold-name{flex:1;min-inline-size:0;direction:ltr;unicode-bidi:isolate;text-align:start}
.fold-count{
  padding:2px 9px;border-radius:999px;background:rgba(19,24,23,.06);
  color:var(--dim);font-size:12px;font-weight:600;
}
.fold-caret{color:var(--dim);font-size:15px;transition:transform .18s ease}
.fold.open .fold-caret{transform:rotate(180deg)}
.fold .grid{display:none;padding:0 10px 12px}
.fold.open .grid{display:grid}
.fold[hidden]{display:none}
.cohort-badge{display:inline-flex;align-items:center;gap:8px;margin:0 0 16px;padding:8px 12px;border:1px solid rgba(var(--cohort-rgb),.32);border-radius:999px;background:rgba(var(--cohort-rgb),.08);color:var(--dim);font-size:13px}
.cohort-badge b{color:var(--jade);font-weight:700}.cohort-badge i{width:8px;height:8px;border-radius:50%;background:var(--jade);box-shadow:0 0 0 4px rgba(var(--cohort-rgb),.10)}
.gender-note{margin:-4px 0 16px;color:var(--dim);font-size:12px;line-height:1.7}

.count{
  position:sticky;inset-block-end:0;z-index:3;
  margin-block-start:18px;padding-block:12px 14px;
  background:linear-gradient(to top,var(--bg) 72%,rgba(10,16,15,0));
}
body{padding-block-end:8px}
@media (prefers-reduced-motion:reduce){.pick,.done .tick{transition:none;animation:none}}
</style></head>
<body><div class="wrap" id="root">
  <div class="kicker">استبيان المقررات</div>
  <h1 id="head">…</h1>
  <p class="sub" id="sub">اختر المقررات التي <b>تنوي تسجيلها</b> هذا الفصل. القسم يستخدم العدد ليقرّر كم شعبة يفتح.</p>
  <p class="warn-line"><b>هذا ليس تسجيلاً.</b> إجابتك لا تحجز لك مقعداً ولا تُغني عن التسجيل، ولا تضمن فتح شعبة — التسجيل يبقى في مكانه المعتاد.</p>
  <div id="body"></div>
</div>
<script nonce="${nonce}">
/* العدد والمعدود — نفس قاعدة البرنامج، مكتوبة هنا لأن هذه الصفحة لا تحمل حزمته. */
function asciiDigits(value){
  return String(value==null?"":value)
    .replace(/[٠-٩]/g,function(d){return String("٠١٢٣٤٥٦٧٨٩".indexOf(d));})
    .replace(/[۰-۹]/g,function(d){return String("۰۱۲۳۴۵۶۷۸۹".indexOf(d));});
}
${ARABIC_COUNT_SCRIPT}

(function(){
  var TOKEN=${JSON.stringify(token)};
  var picked=new Set();
  var esc=function(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});};
  var body=document.getElementById("body");

  fetch("/api/public/survey/"+encodeURIComponent(TOKEN))
    .then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});})
    .then(function(x){
      if(!x.ok){ body.innerHTML='<div class="err">'+esc(x.d.error||"تعذر فتح الاستبيان")+'</div>'; return; }
      document.body.dataset.cohort=x.d.cohort||"mixed";
      document.getElementById("head").textContent=x.d.section||x.d.label||"مقررات القسم";
      render(x.d);
    })
    .catch(function(){ body.innerHTML='<div class="err">تعذر الاتصال. تحقق من الإنترنت وأعد المحاولة.</div>'; });

  /* ── قائمة طويلة، وهاتف ────────────────────────────────────────────────
     A department can offer a hundred courses, and a student on a phone should
     not scroll a hundred cards to find four. So: a search that filters as you
     type, the list folded into groups by course code, and everything already
     chosen pinned above the fold so it is never lost behind a closed group. */
  function groupsOf(courses){
    var order=[], map={};
    courses.forEach(function(c){
      var key=String(c.code||"").trim().split(/[\\s-]/)[0].replace(/[0-9]+$/,"") || "أخرى";
      if(!map[key]){ map[key]=[]; order.push(key); }
      map[key].push(c);
    });
    return order.map(function(k){ return {key:k, items:map[k]}; });
  }

  function render(d){
    var groups=groupsOf(d.courses);
    /* Every course group starts folded, even when all courses happen to fall
       under one label such as «أخرى». The student asked for an accordion, not
       a wall of cards; search still opens only the group that contains a hit. */
    var openAll = false;
    var cohort=d.cohortLabel||"طلبة القسم";
    body.innerHTML=
      '<div class="cohort-badge"><i></i><span>الفئة: <b>'+esc(cohort)+'</b></span></div>'+
      '<p class="gender-note">الفئة محددة من رابط القسم نفسه حتى لا تختلط إجابات البنات والبنين.</p>'+
      '<div class="step"><b>1</b> أي المقررات تحتاجها؟</div>'+
      '<div class="seek"><input id="seek" type="search" inputmode="search" '+
        'placeholder="ابحث باسم المقرر أو رمزه…" autocomplete="off" enterkeyhint="search">'+
        '<span id="seekcount"></span></div>'+
      '<div id="chosen" class="chosen" hidden></div>'+
      '<div id="groups">'+groups.map(function(g,i){
        return '<section class="fold'+(openAll?" open":"")+'" data-key="'+esc(g.key)+'">'+
          '<button type="button" class="fold-head">'+
            '<span class="fold-name">'+esc(g.key)+'</span>'+
            '<span class="fold-count">'+g.items.length+'</span>'+
            '<span class="fold-caret" aria-hidden="true">⌄</span>'+
          '</button>'+
          '<div class="grid">'+g.items.map(function(c){
            return '<button type="button" class="pick" data-id="'+c.id+'" '+
                   'data-find="'+esc((c.name+" "+c.code).toLowerCase())+'" aria-pressed="false">'+
                   '<i aria-hidden="true"></i><strong>'+esc(c.name)+'</strong><small>'+esc(c.code)+'</small></button>';
          }).join("")+'</div></section>';
      }).join("")+'</div>'+
      '<p class="note" id="nohit" hidden>لا مقرر بهذا الاسم أو الرمز.</p>'+
      '<div class="step"><b>2</b> من أنت؟</div>'+
      '<div class="field"><label for="nm">الاسم</label><input id="nm" autocomplete="name" enterkeyhint="next"></div>'+
      '<div class="field"><label for="cv">الرقم المدني</label>'+
        '<input id="cv" inputmode="numeric" maxlength="12" autocomplete="off" enterkeyhint="done"></div>'+
      '<div class="count"><button type="button" class="send" id="send" disabled>اختر مقرراً واحداً على الأقل</button></div>'+
      '<p class="note">اسمك ورقمك لا يُحفظان مع إجابتك — يُستخدمان مرة واحدة لمنع التكرار فقط. '+
        'وإن غيّرت رأيك، افتح الرابط وأجب مرة أخرى فتحلّ إجابتك الجديدة محل القديمة.</p>'+
      '<div id="err"></div>';

    var send=document.getElementById("send");
    var groupsEl=document.getElementById("groups");
    var chosenEl=document.getElementById("chosen");
    var seek=document.getElementById("seek");
    var seekCount=document.getElementById("seekcount");
    var nohit=document.getElementById("nohit");
    var byId={}; d.courses.forEach(function(c){ byId[c.id]=c; });

    function paintChosen(){
      var ids=[...picked];
      chosenEl.hidden = ids.length===0;
      chosenEl.innerHTML = ids.length
        ? '<span class="chosen-label">اخترت</span>'+ids.map(function(id){
            var c=byId[id]||{};
            return '<button type="button" class="chip" data-id="'+id+'">'+
                   esc(c.code||"")+' <em>×</em></button>';
          }).join("")
        : "";
    }

    groupsEl.addEventListener("click",function(e){
      var head=e.target.closest(".fold-head");
      if(head){ head.parentNode.classList.toggle("open"); return; }
      var b=e.target.closest(".pick"); if(!b) return;
      var id=Number(b.dataset.id);
      if(picked.has(id)){ picked.delete(id); b.setAttribute("aria-pressed","false"); }
      else { picked.add(id); b.setAttribute("aria-pressed","true"); }
      paintChosen(); refresh();
    });

    // Removing from the pinned row must also un-press the card it came from.
    chosenEl.addEventListener("click",function(e){
      var chip=e.target.closest(".chip"); if(!chip) return;
      var id=Number(chip.dataset.id);
      picked.delete(id);
      var card=groupsEl.querySelector('.pick[data-id="'+id+'"]');
      if(card) card.setAttribute("aria-pressed","false");
      paintChosen(); refresh();
    });

    seek.addEventListener("input",function(){
      var q=seek.value.trim().toLowerCase();
      var hits=0;
      [...groupsEl.querySelectorAll(".fold")].forEach(function(section){
        var shown=0;
        [...section.querySelectorAll(".pick")].forEach(function(card){
          var on = !q || card.dataset.find.indexOf(q)>=0;
          card.hidden = !on;
          if(on) shown++;
        });
        section.hidden = shown===0;
        // Searching opens what it finds; clearing the box folds it back.
        if(q) section.classList.add("open");
        else section.classList.toggle("open", openAll);
        hits += shown;
      });
      nohit.hidden = hits>0;
      seekCount.textContent = q ? countOf(hits, AR.course) : "";
    });
    document.addEventListener("input",function(e){
      var input=e.target;
      if(!input||typeof input.value!=="string") return;
      var normalized=asciiDigits(input.value);
      if(normalized!==input.value) input.value=normalized;
    },true);
    ["nm","cv"].forEach(function(k){ document.getElementById(k).addEventListener("input",refresh); });

    function refresh(){
      var nm=document.getElementById("nm").value.trim();
      var cv=asciiDigits(document.getElementById("cv").value).replace(/\\D/g,"");
      var ready=picked.size>0 && nm.length>=3 && cv.length===12;
      send.disabled=!ready;
      /* The button says what is missing rather than sitting grey and silent. */
      send.textContent = picked.size===0 ? "اختر مقرراً واحداً على الأقل"
        : nm.length<3 ? "اكتب اسمك"
        : cv.length!==12 ? "أدخل الرقم المدني (12 رقماً)"
        : "إرسال · "+countOf(picked.size, AR.course);
    }

    send.onclick=function(){
      send.disabled=true; send.textContent="جارٍ الإرسال…";
      fetch("/api/public/survey/"+encodeURIComponent(TOKEN),{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name:document.getElementById("nm").value.trim(),
          civil:asciiDigits(document.getElementById("cv").value),courseIds:Array.from(picked)})
      }).then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});})
        .then(function(x){
          if(!x.ok){ document.getElementById("err").innerHTML='<div class="err">'+esc(x.d.error)+'</div>';
            send.disabled=false; refresh(); return; }
          document.getElementById("root").innerHTML=
            '<div class="done"><div class="tick"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>'+
            '<h2>وصلت إجابتك</h2>'+
            '<p>شكراً '+esc(x.d.name)+' — سجّلنا اختيارك: '+countOf(x.d.count, AR.course)+'.<br>'+
            'هذا ليس تسجيلاً؛ أكمل تسجيلك كالمعتاد. ويمكنك فتح الرابط مرة أخرى لتعديل اختيارك.</p></div>';
          window.scrollTo(0,0);
        })
        .catch(function(){ document.getElementById("err").innerHTML='<div class="err">تعذر الإرسال — تحقق من الاتصال.</div>';
          send.disabled=false; refresh(); });
    };
  }
})();
</script></body></html>`;
}

export function studentCaseSurveyPage(token:string,label:string,nonce:string,demoHint=""):string{
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>${label} · SCHEDULE</title><link rel="icon" href="/schedule-icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/schedule-icon-192.png"><style>/* SCHEDULE_PUBLIC_PLEX_ARABIC */@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:400;font-display:swap;src:url("/fonts/plex-arabic-arabic-400.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:500;font-display:swap;src:url("/fonts/plex-arabic-arabic-500.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:600;font-display:swap;src:url("/fonts/plex-arabic-arabic-600.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:700;font-display:swap;src:url("/fonts/plex-arabic-arabic-700.woff2") format("woff2")}
*{box-sizing:border-box}:root{${PUBLIC_LIGHT_VARS}}body{margin:0;min-height:100dvh;background:radial-gradient(circle at 90% 0,var(--accent-soft) 0,transparent 32%),var(--bg);color:var(--ink);font-family:"Plex Arabic",-apple-system,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;font-synthesis:none;font-kerning:normal;padding:22px 15px 42px}.wrap{max-width:720px;margin:auto}.brand{font-weight:700;font-size:11.5px;line-height:1.4;letter-spacing:0;color:var(--gold)}h1{font-size:25px;margin:10px 0 5px}.lead{color:var(--muted);line-height:1.8;margin:0 0 20px;font-size:13px}.card{background:color-mix(in srgb,var(--card) 92%,transparent);border:1px solid var(--line);border-radius:22px;padding:18px;box-shadow:0 20px 50px #1318171f}.progress{display:flex;gap:6px;margin-bottom:18px}.progress i{height:4px;border-radius:9px;background:var(--line);flex:1}.progress i{transition:background .35s ease,transform .35s ease}.progress i.on{background:var(--jade);animation:pgrow .45s cubic-bezier(.2,.8,.2,1) both;transform-origin:right center}@keyframes pgrow{from{transform:scaleX(.2);opacity:.5}to{transform:none;opacity:1}}.brand{animation:rise-b .5s ease both}@keyframes rise-b{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@media screen{.brand::before{content:"";display:inline-block;width:8px;height:8px;margin-inline-end:8px;border-radius:50%;background:var(--gold);animation:ringg 2.8s ease-out infinite}}@keyframes ringg{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--gold) 40%,transparent)}70%,100%{box-shadow:0 0 0 9px transparent}}@media screen{.progress i.on:has(+ i:not(.on)){box-shadow:0 0 0 3px color-mix(in srgb,var(--jade) 16%,transparent)}}@media screen{.progress i{height:5px}}.card{transition:box-shadow .25s}.card:focus-within{box-shadow:0 22px 56px color-mix(in srgb,var(--ink) 14%,transparent)}@media print{.brand::before{animation:none}}@media (prefers-reduced-motion:reduce){.progress i,.progress i.on,.brand,.brand::before,input,select,textarea,.card{animation:none;transition:none}}.step-head{display:flex;align-items:center;gap:10px;margin-bottom:15px}.step-head b{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:var(--accent-soft);color:var(--jade)}.step-head div{display:grid;gap:2px}.step-head strong{font-size:16px}.step-head span{font-size:11px;color:var(--muted)}.fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.field{display:grid;align-content:start;gap:6px}.field.full{grid-column:1/-1}.field label{font-size:11px;color:var(--muted)}input,select,textarea{width:100%;border:1px solid var(--line);border-radius:13px;background:var(--card2);color:var(--ink);padding:13px;font:inherit;outline:none}input:focus,select:focus,textarea:focus{border-color:var(--jade);box-shadow:0 0 0 3px color-mix(in srgb,var(--jade) 18%,transparent)}input,select,textarea{transition:border-color .16s,box-shadow .16s}input[dir=ltr]{text-align:left}input[readonly],select:disabled{opacity:1;color:var(--ink);background:var(--card2);border-color:var(--line-strong);cursor:default;-webkit-text-fill-color:var(--ink)}.identity-verified{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid #9fc8b5;border-radius:12px;background:var(--accent-soft);color:var(--jade);font-size:11.5px;line-height:1.6}.identity-verified b{font-weight:700;color:var(--jade)}.identity-reset{flex:none;border:0;background:transparent;color:var(--muted);font:inherit;font-size:11px;text-decoration:underline;text-underline-offset:3px;cursor:pointer;padding:4px;position:relative}.identity-reset::after{content:"";position:absolute;inset:-9px -6px}.identity-start{display:grid;gap:10px}.identity-start .field{max-width:430px;width:100%;margin-inline:auto}.identity-start-note{text-align:center;color:var(--muted);font-size:11px;line-height:1.75;margin:0 4px}.proof-example{display:grid;grid-template-columns:112px minmax(0,1fr);align-items:center;gap:12px;padding:10px;border:1px solid var(--line-strong);border-radius:14px;background:var(--card2);color:var(--ink);text-decoration:none;overflow:hidden}.proof-example img{display:block;width:112px;height:78px;object-fit:cover;object-position:top;border-radius:9px;border:1px solid var(--line-strong);background:#fff}.proof-example span{display:grid;gap:4px;line-height:1.55}.proof-example strong{font-size:12px;color:var(--ink)}.proof-example small{font-size:11px;color:var(--muted)}.proof-example em{font-style:normal;font-size:11px;color:var(--jade)}.action{width:100%;min-height:44px;border:0;border-radius:14px;padding:14px;margin-top:15px;background:var(--jade);color:var(--on-accent);font-weight:700;font-size:14px;line-height:1;font-family:inherit;cursor:pointer}.action:disabled{opacity:.42;cursor:default}.back{border:0;background:none;color:var(--muted);padding:8px;min-height:44px;font:inherit;cursor:pointer}.types{display:grid;gap:9px}.type{display:grid;grid-template-columns:42px 1fr auto;align-items:center;gap:11px;border:1px solid var(--line);background:var(--card2);color:var(--ink);border-radius:15px;padding:12px;text-align:right;cursor:pointer}.type>i{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:var(--accent-soft);color:var(--jade);font-style:normal;font-size:18px}.type strong{display:block;font-size:14px}.type small{display:block;color:var(--muted);margin-top:3px}.type em{font-style:normal;color:var(--muted)}.type.on{border-color:var(--jade);background:var(--accent-soft)}.course-tools{display:grid;gap:8px;margin:13px 0}.courses{display:grid;grid-template-columns:1fr 1fr;gap:7px;max-height:320px;overflow:auto}.course{position:relative;border:1px solid var(--line);background:var(--card2);color:var(--ink);border-radius:12px;padding:11px;text-align:right;cursor:pointer}.course strong{display:block;font-size:12px;line-height:1.5}.course small{color:var(--muted)}.course.on{border-color:var(--jade);background:var(--accent-soft)}.hint{font-size:11px;color:var(--muted)}.hint.ok{color:var(--jade)}.hint.bad{color:var(--bad)}.acc{border:1px solid var(--line);border-radius:15px;background:var(--card2);overflow:hidden}.acc>summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px;cursor:pointer;font-weight:700;font-size:13px;list-style:none}.acc>summary::-webkit-details-marker{display:none}.acc>summary em{font-style:normal;font-size:11px;color:var(--muted);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:2px 9px}.acc[open]>summary{border-bottom:1px solid var(--line)}.acc-body{display:grid;gap:9px;padding:12px}.acc-body .courses{max-height:250px}.course.on:after{content:"✓";position:absolute;top:8px;left:9px;color:var(--jade)}.proof{display:grid;gap:10px;padding:14px;border:1px dashed var(--line-strong);border-radius:15px;margin-top:12px}.proof input{padding:9px}.upload-meter{display:grid;grid-template-columns:1fr auto;align-items:center;gap:7px 10px}.upload-meter[hidden]{display:none!important}.upload-track{height:7px;border-radius:999px;background:var(--soft);overflow:hidden}.upload-track i{display:block;height:100%;width:0;border-radius:inherit;background:var(--jade);transition:width .12s linear}.upload-meter b{font:700 11px/1 system-ui;color:var(--jade);direction:ltr}.upload-meter small{grid-column:1/-1;color:var(--muted);font-size:11px}.proof-status{padding:12px;border-radius:13px;background:var(--card2);color:var(--muted);line-height:1.7;font-size:12px}.proof-status.ok{border:1px solid #9fc8b5;color:var(--jade)}.proof-status.reused{border:1px solid #9fc8b5;color:var(--jade);background:var(--accent-soft)}.proof-status.bad{border:1px solid #e3b7b2;color:var(--bad)}.proof-upload{display:grid;gap:10px}.reasons{display:grid;gap:8px;margin-top:12px}.reason{display:flex;align-items:flex-start;gap:9px;border:1px solid var(--line);background:var(--card2);padding:11px;border-radius:12px}.reason input{width:auto;margin-top:3px}.reason span{font-size:13px}.graduate-detail{margin-top:11px;padding:12px;border:1px solid var(--line-strong);background:var(--card2);border-radius:14px}.graduate-detail label{display:block;font-size:12px;font-weight:700;color:var(--ink);margin-bottom:7px}.graduate-detail textarea{min-height:112px;resize:vertical;line-height:1.75}.graduate-detail small{display:flex;justify-content:space-between;gap:8px;margin-top:6px;color:var(--muted);font-size:11px}.graduate-detail b{color:var(--jade);font-weight:700}.err{margin-top:12px;padding:11px;border-radius:11px;border:1px solid #e3b7b2;background:var(--bad-soft);color:var(--bad);font-size:12px;line-height:1.7}.done{text-align:center;padding:35px 10px}.tick{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;background:var(--accent-soft);color:var(--jade);font-size:29px;margin:12px auto 18px;box-shadow:0 0 0 9px color-mix(in srgb,var(--accent-soft) 46%,transparent),0 0 0 19px color-mix(in srgb,var(--accent-soft) 22%,transparent)}.done h2{font-size:22px}.done p{color:var(--muted);line-height:1.9}.done .case-ref{display:flex;align-items:center;justify-content:center;gap:10px;margin:10px auto;padding:12px 16px;max-width:320px;border:1.5px dashed color-mix(in srgb,var(--jade) 45%,var(--line));border-radius:14px;background:var(--card2);color:var(--ink);font-size:14px}.done .case-ref bdi{direction:ltr;unicode-bidi:isolate;font:700 22px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em;color:var(--jade)}.privacy{color:var(--muted);font-size:12px;line-height:1.8;text-align:center;margin:13px 6px 0}[hidden]{display:none!important}@media(max-width:580px){.fields,.courses{grid-template-columns:1fr}.field.full{grid-column:auto}.card{padding:15px;border-radius:18px}h1{font-size:22px}.proof-example{grid-template-columns:88px minmax(0,1fr);padding:8px}.proof-example img{width:88px;height:66px}}
.prior-case{margin:14px 0 0;padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:var(--card2);display:grid;gap:5px}.prior-case strong{font-size:14px}.prior-case small,.prior-case p{font-size:12.5px;color:var(--muted);margin:0}.prior-case ul{margin:4px 0;padding:0 18px;font-size:13px}.replace-note{margin:14px 0 0;padding:11px 13px;border-radius:12px;border:1px solid #e2cf9f;background:#f8eed6;color:#5b4520;font-size:13px}</style></head><body><main class="wrap"><div class="brand">SCHEDULE · مركز طلبات الطلبة</div><h1>${label}</h1><p class="lead">طلب واضح يصل إلى القسم باسمك وتفاصيله. هذا النموذج لا يُعد تسجيلاً ولا يضمن فتح مقرر.</p>${demoHint}<a href="/me" style="display:flex;gap:10px;align-items:center;margin:12px 0 0;padding:12px 14px;border-radius:14px;background:var(--accent-soft);color:var(--accent);text-decoration:none;font-size:13.5px;line-height:1.7"><b>جديد:</b><span>«مساري» — جدولك المتوقع ورغباتك وتذكرتك وتسجيلك في مكانٍ واحد دائم. افتحه من هنا.</span></a><section class="card"><div class="progress"><i class="on"></i><i></i><i></i></div><div id="host"><p>جارٍ فتح النموذج…</p></div></section></main><script nonce="${nonce}">${DEMO_COPY_SCRIPT}
(function(){var TOKEN=${JSON.stringify(token)},data=null,step=1,student={name:"",civil:"",sectionId:0},kind="",picked=[],otherCourse=0,proofToken="",proofEligible=false,identityLocked=false,identityChecked=false,caseRef="",priorSummary=null,priorInitial="",needsCaseRef=false,proofAt=0,PROOF_TTL=20*60*1000,MAX_PROOF_BYTES=14*1024*1024;var host=document.getElementById("host");
/* The same checksum the rest of the system enforces. The page used to accept
   any twelve digits, so a wrong number travelled through both remaining steps
   and was only refused by the server at the very end — the student learning at
   submit time that the first field was wrong. */
function civilValid(v){v=String(v||"");if(!/^\\d{12}$/.test(v))return false;var w=[2,1,6,3,7,9,10,5,8,4,2],sum=0;for(var i=0;i<11;i++)sum+=Number(v[i])*w[i];return 11-(sum%11)===Number(v[11])}
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}function digits(v){return String(v||"").replace(/[٠-٩]/g,function(d){return String("٠١٢٣٤٥٦٧٨٩".indexOf(d))}).replace(/[۰-۹]/g,function(d){return String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))}).replace(/\\D/g,"")}function section(){return(data.sections||[]).find(function(s){return Number(s.id)===Number(student.sectionId)})||{courses:[]}}function paintProgress(){var bars=document.querySelectorAll(".progress i");bars.forEach(function(bar,index){bar.classList.toggle("on",index<step)})}function fail(msg){var box=document.getElementById("err");if(box)box.innerHTML='<div class="err">'+esc(msg)+'</div>'}
/* Nothing about the student is kept in the browser: the civil ID and name used
   to be written to the browser's persistent storage on every shared or lab computer. */
function resetIdentity(){identityLocked=false;identityChecked=false;needsCaseRef=false;caseRef="";priorSummary=null;priorInitial="";student={name:"",civil:"",sectionId:0};identity()}
var TYPE_LABEL={"new-course":"طلب فتح مقرر","course-conflict":"تعارض مقررين","graduate":"خريج / متوقع تخرجه"};
var STATE_LABEL={"awaiting-registration":"وافقت اللجنة · بانتظار التسجيل","committee-rejected":"لم توافق اللجنة","registered":"سجّله التسجيل","rejected":"ردّه التسجيل"};
function sendLabel(){return priorSummary?"تحديث طلبي السابق":"إرسال الطلب إلى القسم"}
function replaceNote(){return priorSummary?'<p class="replace-note" role="note">سيحلّ هذا الإرسال محل طلبك السابق (رقم الحالة '+esc(priorSummary.caseRef)+'). قرارات القسم على المقررات التي تُبقيها تبقى كما هي، وما تحذفه بعد قرارٍ يظهر للقسم أنك ألغيته.</p>':''}
function priorSummaryHtml(){if(!priorSummary)return"";var p=priorSummary;return'<div class="prior-case" role="region" aria-label="طلبك الحالي"><strong>طلبك الحالي · رقم الحالة '+esc(p.caseRef)+'</strong><small>'+esc(TYPE_LABEL[p.requestType]||p.requestType)+(p.submittedAt?' · أُرسل '+esc(new Date(p.submittedAt).toLocaleDateString("ar-KW-u-nu-latn",{month:"long",day:"numeric"})):"")+'</small>'+((p.courses||[]).length?'<ul>'+p.courses.map(function(c){return'<li>'+esc(c.name)+(c.state?' — '+esc(STATE_LABEL[c.state]||c.state):'')+'</li>'}).join("")+'</ul>':'')+'<p>إذا أرسلت من جديد فسيُحدَّث هذا الطلب نفسه ولن يُنشأ طلبٌ ثانٍ.</p></div>'}
function checkCivilIdentity(){var civilBox=document.getElementById("civil"),button=document.getElementById("checkCivil"),civil=digits(civilBox&&civilBox.value||"");if(civil.length!==12)return fail("أدخل الرقم المدني من 12 رقماً");if(!civilValid(civil))return fail("هذا الرقم المدني غير صحيح. راجع الأرقام كما هي في بطاقتك المدنية.");student={name:"",civil:civil,sectionId:0};button.disabled=true;button.textContent="جارٍ التحقق…";fetch('/api/public/survey/'+encodeURIComponent(TOKEN)+'/identity-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({civil:civil})}).then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d}})}).then(function(x){if(!x.ok){button.disabled=false;button.textContent="التحقق والمتابعة";return fail(x.d.error||"تعذر التحقق من الرقم المدني")}identityChecked=true;identityLocked=false;priorSummary=null;if(x.d.exists){needsCaseRef=true;priorInitial=String(x.d.initial||"");caseRefStep();return}needsCaseRef=false;identity()}).catch(function(){button.disabled=false;button.textContent="التحقق والمتابعة";fail("تعذر التحقق من الرقم المدني. تحقق من الاتصال ثم أعد المحاولة.")})}

/* A request already exists for this civil ID: it is opened only with its case
   number. The page never learns the stored name or department before that. */
function caseRefStep(){step=1;paintProgress();host.innerHTML='<div class="step-head"><b>1</b><div><strong>لديك طلبٌ سابق</strong><span>يوجد طلبٌ مرسلٌ بهذا الرقم المدني في هذا الاستبيان'+(priorInitial?' (الاسم يبدأ بـ «'+esc(priorInitial)+'»)':'')+'</span></div></div><div class="identity-start"><div class="field full"><label for="caseRef">رقم الحالة</label><input id="caseRef" dir="ltr" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="16" enterkeyhint="go" placeholder="مثل 1B86022D" aria-describedby="caseRefHelp" style="direction:rtl"><small id="caseRefHelp" class="hint">الرقم الذي ظهر لك عند الإرسال. فقدت الرقم؟ راجع القسم — لا يُعدَّل الطلب القائم بالرقم المدني وحده.</small></div></div><button class="action" id="checkRef" type="button">فتح طلبي لتعديله</button><button type="button" class="identity-reset" id="identityReset">رقم مدني آخر</button><div id="err" role="alert" aria-live="assertive"></div>';var box=document.getElementById("caseRef"),go=document.getElementById("checkRef");document.getElementById("identityReset").onclick=resetIdentity;function verifyRef(){var ref=String(box.value||"").trim().toUpperCase();if(ref.length<6)return fail("أدخل رقم الحالة كما ظهر لك");go.disabled=true;go.textContent="جارٍ التحقق…";fetch('/api/public/survey/'+encodeURIComponent(TOKEN)+'/identity-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({civil:student.civil,caseRef:ref})}).then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d}})}).then(function(x){go.disabled=false;go.textContent="فتح طلبي لتعديله";if(!x.ok||!x.d.verified)return fail(x.d.error||"رقم الحالة لا يطابق. فقدت الرقم؟ راجع القسم.");caseRef=ref;priorSummary=x.d.summary||null;student={name:String(x.d.name||""),civil:student.civil,sectionId:Number(x.d.sectionId)||0};identityLocked=Boolean(x.d.name&&x.d.sectionId);needsCaseRef=false;identity()}).catch(function(){go.disabled=false;go.textContent="فتح طلبي لتعديله";fail("تعذر التحقق. تحقق من الاتصال ثم أعد المحاولة.")})}go.onclick=verifyRef;box.onkeydown=function(e){if(e.key==="Enter"){e.preventDefault();verifyRef()}};box.focus()}

function identity(){step=1;paintProgress();
  if(needsCaseRef){caseRefStep();return}
  if(!identityChecked){
    host.innerHTML='<div class="step-head"><b>1</b><div><strong>ابدأ بالرقم المدني</strong><span>نتحقق أولاً، ثم نعرض المسار المناسب لك</span></div></div><div class="identity-start"><div class="field full"><label for="civil">الرقم المدني</label><input id="civil" dir="ltr" inputmode="numeric" aria-describedby="civilHint" maxlength="12" autocomplete="off" enterkeyhint="go" placeholder="12 رقمًا" style="direction:rtl" value="'+esc(student.civil)+'"><small id="civilHint" class="hint"></small></div><p class="identity-start-note">لن تظهر بقية البيانات قبل التحقق من الرقم المدني. إذا سبق أن أرسلت طلبًا، سنعيد اسمك وقسمك المعتمد تلقائيًا.</p></div><button class="action" id="checkCivil" disabled>التحقق والمتابعة</button><p class="privacy">يُستخدم الرقم المدني للتعرّف على طلبك السابق ومنع تكرار الهوية، ويظهر للمسؤول المخوّل فقط.</p><div id="err" role="alert" aria-live="assertive"></div>';
    var civilBox=document.getElementById("civil"),hint=document.getElementById("civilHint"),button=document.getElementById("checkCivil");function paintCivil(){civilBox.value=digits(civilBox.value).slice(0,12);var value=civilBox.value;if(!value.length){hint.textContent="";hint.className="hint";button.disabled=true;return}if(value.length<12){hint.textContent="باقي "+(12-value.length)+" رقم";hint.className="hint";button.disabled=true;return}if(civilValid(value)){hint.textContent="رقم مدني صحيح · اضغط للمتابعة";hint.className="hint ok";button.disabled=false}else{hint.textContent="هذا الرقم المدني غير صحيح — راجع أرقام بطاقتك";hint.className="hint bad";button.disabled=true}}civilBox.oninput=paintCivil;civilBox.onkeydown=function(e){if(e.key==="Enter"&&!button.disabled){e.preventDefault();checkCivilIdentity()}};button.onclick=checkCivilIdentity;paintCivil();return;
  }
  var locked=identityLocked;host.innerHTML='<div class="step-head"><b>1</b><div><strong>'+(locked?'بياناتك المتحققة':'أكمل بياناتك')+'</strong><span>'+(locked?'تم العثور على طلب سابق لهذا الرقم المدني':'هذا أول طلب محفوظ لهذا الرقم المدني')+'</span></div></div><div class="fields"><div class="field"><label for="civil">الرقم المدني</label><input id="civil" dir="ltr" inputmode="numeric" value="'+esc(student.civil)+'" readonly aria-readonly="true"><small class="hint ok">تم التحقق من الرقم المدني</small></div><div class="field"><label for="name">الاسم الكامل</label><input id="name" autocomplete="name" value="'+esc(student.name)+'"'+(locked?' readonly aria-readonly="true"':'')+'></div><div class="field full"><label for="section">القسم العلمي</label><select id="section"'+(locked?' disabled aria-disabled="true"':'')+'><option value="">اختر القسم</option>'+(data.sections||[]).map(function(s){return'<option value="'+s.id+'"'+(Number(s.id)===Number(student.sectionId)?' selected':'')+'>'+esc(s.name)+'</option>'}).join("")+'</select></div>'+(locked?'<div class="identity-verified"><span><b>تم التحقق من بياناتك سابقًا.</b> الاسم والرقم المدني والقسم العلمي مثبتة ولا تحتاج إدخالها من جديد.</span><button type="button" class="identity-reset" id="identityReset">رقم مدني آخر</button></div>':'<div class="identity-verified"><span><b>'+(priorSummary?'أكمل بياناتك.':'طالب جديد.')+'</b> أكمل الاسم والقسم. وإذا عدّلت طلبك لاحقاً فستحتاج رقم الحالة الذي سيظهر لك عند الإرسال.</span><button type="button" class="identity-reset" id="identityReset">تغيير الرقم المدني</button></div>')+'</div>'+priorSummaryHtml()+'<button class="action" id="next">التالي · نوع الطلب</button><p class="privacy">تظهر هويتك للمسؤول المخوّل فقط، وتُحفظ مشفّرة داخل النظام لخدمة الطلب ومراجعته.</p><div id="err" role="alert" aria-live="assertive"></div>';
  var reset=document.getElementById("identityReset");if(reset)reset.onclick=resetIdentity;document.getElementById("next").onclick=function(){if(!locked){student.name=String(document.getElementById("name").value||"").trim();student.sectionId=Number(document.getElementById("section").value)||0}if(student.name.length<3)return fail("اكتب اسمك كاملاً");if(!student.sectionId)return fail("اختر قسمك العلمي");kind="";picked=[];otherCourse=0;proofToken="";proofEligible=false;chooseType()}
}

function chooseType(){step=2;paintProgress();host.innerHTML='<button class="back" id="back"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;margin-inline-end:6px"><path d="M5 12h14M13 6l6 6-6 6"/></svg>تعديل البيانات</button><div class="step-head"><b>2</b><div><strong>ما نوع طلبك؟</strong><span>اختر حالة واحدة</span></div></div><div class="types"><button type="button" class="type" data-kind="new-course"><i><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></i><span><strong>فتح مقرر جديد</strong><small>مقرر تحتاج طرحه في الفصل</small></span><em>‹</em></button><button type="button" class="type" data-kind="course-conflict"><i><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/></svg></i><span><strong>مقرر يتعارض مع مقرر آخر</strong><small>اختر المقررين المتقاطعين</small></span><em>‹</em></button><button type="button" class="type" data-kind="graduate"><i><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></i><span><strong>خريج أو متوقع تخرجه</strong><small>يتطلب كشف درجات للتحقق من الوحدات</small></span><em>‹</em></button></div>';document.getElementById("back").onclick=identity;host.querySelectorAll(".type").forEach(function(button){button.onclick=function(){kind=button.dataset.kind;picked=[];proofToken="";proofEligible=false;details()}})}
function linkCourses(){return data.courses||[]}
function sectionById(id){return(data.sections||[]).find(function(s){return Number(s.id)===Number(id)})||{courses:[]}}
function press(el,on){el.classList.toggle("on",on);el.setAttribute("aria-pressed",on?"true":"false")}
function courseButton(c){return'<button type="button" class="course" aria-pressed="'+(picked.indexOf(Number(c.id))>=0||Number(otherCourse)===Number(c.id)?"true":"false")+'" data-id="'+c.id+'" data-find="'+esc((c.name+' '+c.code).toLowerCase())+'"><strong>'+esc(c.name)+'</strong><small>'+esc(c.code)+'</small></button>'}
/* The link decides which catalogue is on offer. A student who opened the
   Islamic Education form wants an Islamic Education course; showing them the
   department they happen to be enrolled in was answering a question nobody
   asked. */
function ownCourseCards(){return'<details class="acc" open><summary><span>مقررات '+esc(data.section||"القسم")+'</span><em>'+linkCourses().length+'</em></summary><div class="acc-body"><input id="courseSearch" type="search" aria-label="ابحث في المقررات باسم المقرر أو رمزه" placeholder="ابحث باسم المقرر أو رمزه"><div class="courses" id="courses">'+linkCourses().map(courseButton).join("")+'</div></div></details>'}
/* The second course can come from anywhere in the college, and listing every
   catalogue at once is a wall of names. Nothing is revealed until the student
   types, so the list is always an answer to something they asked for. */
function otherCourseCards(){return'<div class="field" style="margin-top:12px"><label for="otherSection">القسم الآخر</label><select id="otherSection"><option value="">اختر القسم</option>'+(data.sections||[]).map(function(s){return'<option value="'+s.id+'">'+esc(s.name)+'</option>'}).join("")+'</select></div><div class="course-tools"><input id="otherSearch" type="search" aria-label="ابحث عن المقرر الآخر" placeholder="اكتب جزءاً من اسم المقرر — مثلاً: تاريخ" disabled></div><div class="courses" id="otherCourses"></div><p class="privacy" id="otherHint">اختر القسم أولاً، ثم اكتب اسم المقرر لتظهر النتائج.</p>'}

function wireOwnCourses(){var box=document.getElementById("courses"),search=document.getElementById("courseSearch");box.onclick=function(e){var button=e.target.closest(".course");if(!button)return;var id=Number(button.dataset.id);if(kind==="course-conflict"){picked=picked[0]===id?[]:[id];box.querySelectorAll(".course").forEach(function(other){press(other,Number(other.dataset.id)===picked[0])});return}var at=picked.indexOf(id);if(at>=0)picked.splice(at,1);else picked.push(id);press(button,picked.indexOf(id)>=0)};search.oninput=function(){var q=this.value.trim().toLowerCase();box.querySelectorAll(".course").forEach(function(button){button.hidden=q&&button.dataset.find.indexOf(q)<0})}}
function wireOtherCourse(){var pickSection=document.getElementById("otherSection"),search=document.getElementById("otherSearch"),box=document.getElementById("otherCourses"),hint=document.getElementById("otherHint");pickSection.onchange=function(){otherCourse=0;search.disabled=!this.value;search.value="";box.innerHTML="";hint.textContent=this.value?"اكتب جزءاً من اسم المقرر لتظهر النتائج.":"اختر القسم أولاً، ثم اكتب اسم المقرر لتظهر النتائج."};search.oninput=function(){var q=this.value.trim().toLowerCase();if(q.length<2){box.innerHTML="";hint.textContent="اكتب حرفين على الأقل.";return}var list=(sectionById(pickSection.value).courses||[]).filter(function(c){return(c.name+" "+c.code).toLowerCase().indexOf(q)>=0}).slice(0,40);box.innerHTML=list.map(courseButton).join("");hint.textContent=list.length?"":"لا مقرر بهذا الاسم في القسم المختار."};box.onclick=function(e){var button=e.target.closest(".course");if(!button)return;var id=Number(button.dataset.id);otherCourse=otherCourse===id?0:id;box.querySelectorAll(".course").forEach(function(other){press(other,Number(other.dataset.id)===otherCourse)})}}

function details(){step=3;paintProgress();var title=kind==="new-course"?"فتح مقرر جديد":kind==="course-conflict"?"تعارض مقررين":"حالة خريج أو متوقع تخرجه";
/* The free-text box is kept only where somebody reads it. On the two course
   requests the selected courses already say everything the department acts on,
   and an optional box invited an explanation nobody was going to open. */
var content=kind==="graduate"?'<div class="proof"><strong id="proofTitle">صحيفة التخرج</strong><small class="lead" id="proofLead">نتحقق أولاً إن كانت صحيفتك موثقة من طلب سابق.</small><a class="proof-example" id="proofExample" href="/graduation-sheet-example.jpg" target="_blank" rel="noopener" hidden><img src="/graduation-sheet-example.jpg" alt="نموذج صحيفة التخرج أو الخطة الدراسية المقبولة" loading="lazy"><span><strong>هذا نموذج الصحيفة المطلوبة</strong><small>الصفحة الرسمية التي يظهر فيها الرقم المدني والبرنامج والوحدات المجتازة.</small><em>اضغط على النموذج لعرضه بالحجم الكامل</em></span></a><div class="proof-upload" id="proofUpload" hidden><input id="proof" type="file" aria-label="ملف صحيفة التخرج" accept="application/pdf,image/*,.heic,.heif"><button class="action" id="verify" type="button">قراءة صحيفة التخرج والتحقق</button><div class="upload-meter" id="uploadMeter" hidden><div class="upload-track"><i id="uploadBar"></i></div><b id="uploadPct">0%</b><small id="uploadBytes">يجهّز الملف…</small></div></div><div id="proofStatus" class="proof-status" role="status" aria-live="polite">جارٍ التحقق من حالة الصحيفة السابقة…</div></div><div id="graduateOptions" hidden><div class="reasons"><label class="reason"><input type="radio" name="reason" value="field-conflict"><span>مقرر يتعارض مع وقت الميداني</span></label><label class="reason"><input type="radio" name="reason" value="field-prerequisite-conflict"><span>مقرر مسبق ميداني يتعارض مع مقرر آخر مسبق ميداني</span></label></div><div class="graduate-detail" id="graduateDetail" hidden><label for="graduateDetails">ملاحظات الطلب وسبب الاحتياج · إلزامي</label><textarea id="graduateDetails" maxlength="600" minlength="3" required placeholder="اكتب ما تحتاجه بالتحديد وسبب الطلب، مثل المقرر أو الوقت أو الترتيب المطلوب."></textarea><small><span>لن يتم إرسال طلب الخريج قبل كتابة الملاحظات، وستظهر للقسم تحت نوع الطلب الذي اخترته.</span><b id="graduateDetailsCount">0 / 600</b></small></div></div>':kind==="course-conflict"?ownCourseCards()+otherCourseCards():ownCourseCards();
host.innerHTML='<button class="back" id="back"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;margin-inline-end:6px"><path d="M5 12h14M13 6l6 6-6 6"/></svg>نوع الطلب</button><div class="step-head"><b>3</b><div><strong>'+title+'</strong><span>'+esc(data.section||"")+'</span></div></div>'+content+replaceNote()+'<button class="action" id="send" type="button">'+sendLabel()+'</button><div id="err" role="alert" aria-live="assertive"></div>';document.getElementById("back").onclick=chooseType;if(kind==="graduate"){document.getElementById("send").disabled=true;wireProof()}else{wireOwnCourses();if(kind==="course-conflict")wireOtherCourse()}document.getElementById("send").onclick=submit}

function refreshGraduateSubmit(){if(kind!=="graduate")return;var send=document.getElementById("send"),reason=host.querySelector('input[name=reason]:checked'),box=document.getElementById("graduateDetails");if(send)send.disabled=!(proofEligible&&reason&&box&&String(box.value||"").trim().length>=3)}
function wireGraduateDetails(){var options=document.getElementById("graduateOptions"),detail=document.getElementById("graduateDetail"),box=document.getElementById("graduateDetails"),count=document.getElementById("graduateDetailsCount");if(!options||!detail||!box)return;options.querySelectorAll('input[name=reason]').forEach(function(input){input.onchange=function(){detail.hidden=false;refreshGraduateSubmit();window.setTimeout(function(){box.focus({preventScroll:true})},30)}});box.oninput=function(){if(count)count.textContent=String(box.value.length)+" / 600";refreshGraduateSubmit()};refreshGraduateSubmit()}

function compactProof(file){return new Promise(function(resolve){var type=String(file.type||"").toLowerCase(),name=String(file.name||"").toLowerCase();if(type.indexOf("image/")!==0||/heic|heif/.test(type)||/\.(heic|heif)$/.test(name)){resolve(file);return}var url=URL.createObjectURL(file),img=new Image();img.onload=function(){try{var max=2200,scale=Math.min(1,max/Math.max(img.naturalWidth||1,img.naturalHeight||1));if(scale>=.98&&file.size<1800000){URL.revokeObjectURL(url);resolve(file);return}var canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));var ctx=canvas.getContext("2d",{alpha:false});if(!ctx)throw 0;ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);canvas.toBlob(function(blob){URL.revokeObjectURL(url);resolve(blob&&blob.size<file.size?blob:file)},"image/jpeg",.86)}catch(e){URL.revokeObjectURL(url);resolve(file)}};img.onerror=function(){URL.revokeObjectURL(url);resolve(file)};img.src=url})}
function formatBytes(n){if(!n)return"0 KB";if(n<1048576)return Math.max(1,Math.round(n/1024))+" KB";return(n/1048576).toFixed(1)+" MB"}
function showProofUpload(message){var upload=document.getElementById("proofUpload"),example=document.getElementById("proofExample"),title=document.getElementById("proofTitle"),lead=document.getElementById("proofLead"),status=document.getElementById("proofStatus");if(upload)upload.hidden=false;if(example)example.hidden=false;if(title)title.textContent="ارفع صحيفة التخرج";if(lead)lead.textContent="PDF أو صورة واضحة للصفحة الرسمية «الخطة الدراسية / صحيفة التخرج». يجب أن يظهر الرقم المدني والبرنامج والوحدات المجتازة بوضوح. الاسم يساعد في العرض ولا يشترط تطابقه حرفياً. أي مستند آخر لن يُقبل.";if(status){status.className="proof-status";status.textContent=message||"لم يتم التحقق بعد."}proofEligible=false;proofToken="";refreshGraduateSubmit()}
function acceptVerifiedProof(d,reused){var upload=document.getElementById("proofUpload"),example=document.getElementById("proofExample"),title=document.getElementById("proofTitle"),lead=document.getElementById("proofLead"),status=document.getElementById("proofStatus"),options=document.getElementById("graduateOptions");proofEligible=!!d.eligible;proofToken=d.proofToken||"";proofAt=proofToken?Date.now():0;if(upload)upload.hidden=true;if(example)example.hidden=true;if(title)title.textContent=reused?"تم التحقق مسبقًا":"تم التحقق من صحيفة التخرج";if(lead)lead.textContent=reused?"لا حاجة لرفع الصحيفة مرة أخرى لهذا الفصل والقسم.":"تم اعتماد بيانات الصحيفة لهذه الجلسة.";if(status){status.className="proof-status "+(reused?"reused":"ok");status.textContent=d.message||"تم التحقق، ويمكنك متابعة الطلب."}if(options){options.hidden=false;wireGraduateDetails()}refreshGraduateSubmit()}
function checkPriorGraduateProof(){var rule=section().graduateRule;if(rule&&rule.saved===false){var up=document.getElementById("proofUpload"),ex=document.getElementById("proofExample"),st=document.getElementById("proofStatus");if(up)up.hidden=true;if(ex)ex.hidden=true;if(st){st.className="proof-status bad";st.textContent="لم يعتمد قسمك العلمي قواعد التخرج في النظام بعد، فلا يمكن التحقق من صحيفة التخرج الآن. راجع القسم، ويمكنك اختيار نوع طلب آخر."}proofEligible=false;proofToken="";refreshGraduateSubmit();return}if(proofEligible&&proofToken){acceptVerifiedProof({eligible:true,proofToken:proofToken,message:"تم التحقق من صحيفة التخرج في هذه الجلسة. يمكنك متابعة الطلب."},false);return}fetch('/api/public/survey/'+encodeURIComponent(TOKEN)+'/proof-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({civil:student.civil,sectionId:student.sectionId,caseRef:caseRef})}).then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d}})}).then(function(x){if(x.ok&&x.d.verified){acceptVerifiedProof(x.d,true);return}showProofUpload(x.ok?"لم يتم التحقق من صحيفة التخرج لهذا الطالب بعد.":(x.d.error||"تعذر التحقق من الحالة السابقة."))}).catch(function(){showProofUpload("تعذر التحقق من الحالة السابقة؛ يمكنك رفع الصحيفة الآن.")})}
function wireProof(){var verify=document.getElementById("verify");if(verify)verify.onclick=function(){var file=document.getElementById("proof").files[0],button=this,status=document.getElementById("proofStatus"),meter=document.getElementById("uploadMeter"),bar=document.getElementById("uploadBar"),pct=document.getElementById("uploadPct"),bytes=document.getElementById("uploadBytes");if(!file)return fail("اختر صحيفة التخرج أولاً");button.disabled=true;button.textContent="يجهّز الملف…";meter.hidden=false;bar.style.width="0%";pct.textContent="0%";bytes.textContent="يجهّز الملف للرفع السريع…";status.className="proof-status";status.textContent="سيظهر تقدم الرفع هنا، ثم تبدأ قراءة الصحيفة والتحقق منها.";compactProof(file).then(function(payload){var original=file.size,sent=payload.size||file.size;if(sent>MAX_PROOF_BYTES){button.disabled=false;button.textContent="إعادة التحقق";meter.hidden=true;status.className="proof-status bad";status.textContent="حجم الملف "+formatBytes(sent)+" أكبر من الحد (14 MB). صوّر الصفحة الرسمية وحدها أو احفظها PDF بحجمٍ أصغر.";refreshGraduateSubmit();return}if(sent<original)bytes.textContent="تم ضغط الصورة من "+formatBytes(original)+" إلى "+formatBytes(sent);else bytes.textContent="حجم الملف "+formatBytes(sent);button.textContent="يرفع الإثبات…";var xhr=new XMLHttpRequest();xhr.open("POST",'/api/public/survey/'+encodeURIComponent(TOKEN)+'/proof');xhr.setRequestHeader('Content-Type','application/octet-stream');xhr.setRequestHeader('x-file-type',payload===file?(file.type||'application/pdf'):(payload.type||'image/jpeg'));xhr.setRequestHeader('x-student-name',encodeURIComponent(student.name));xhr.setRequestHeader('x-student-civil',student.civil);xhr.setRequestHeader('x-student-section',String(student.sectionId));xhr.upload.onprogress=function(e){if(!e.lengthComputable)return;var n=Math.min(99,Math.round(e.loaded/e.total*100));bar.style.width=n+"%";pct.textContent=n+"%";bytes.textContent="رُفع "+formatBytes(e.loaded)+" من "+formatBytes(e.total)};xhr.upload.onload=function(){bar.style.width="100%";pct.textContent="100%";bytes.textContent="اكتمل الرفع · جاري قراءة صحيفة التخرج والتحقق…";button.textContent="يتحقق من الصحيفة…"};xhr.onload=function(){bar.style.width="100%";pct.textContent="100%";var d={};try{d=JSON.parse(xhr.responseText||"{}")}catch(e){};button.disabled=false;button.textContent="إعادة التحقق";if(xhr.status<200||xhr.status>=300){proofEligible=false;proofToken="";status.className="proof-status bad";status.textContent=d.error||"تعذر التحقق";refreshGraduateSubmit();return}acceptVerifiedProof(d,false)};xhr.onerror=function(){button.disabled=false;button.textContent="إعادة التحقق";status.className="proof-status bad";status.textContent="تعذر رفع الإثبات — تحقق من الاتصال.";refreshGraduateSubmit()};xhr.send(payload)}).catch(function(){button.disabled=false;button.textContent="إعادة التحقق";status.className="proof-status bad";status.textContent="تعذر تجهيز الإثبات للرفع.";refreshGraduateSubmit()})};checkPriorGraduateProof()}
/* من يعدّل موعداً عليه اقتراحٌ معلّق ثم يُرسل يستبدل اقتراحَ القسم بطلبٍ جديد: يُقال له قبل التوقيع لا بعده. */
function submit(){var send=document.getElementById("send"),reasonEl=host.querySelector('input[name=reason]:checked'),reason=reasonEl?reasonEl.value:"";if(kind==="new-course"&&!picked.length)return fail("اختر مقرراً واحداً على الأقل");if(kind==="course-conflict"&&(!picked.length||!otherCourse))return fail("اختر مقرراً من قسمك ومقرراً آخر يتعارض معه");if(kind==="course-conflict"&&picked[0]===otherCourse)return fail("اختر مقررين مختلفين");if(kind==="graduate"&&proofEligible&&proofAt&&Date.now()-proofAt>PROOF_TTL-60000){showProofUpload("انتهت مهلة التحقق من صحيفة التخرج (20 دقيقة). أعد رفعها للتحقق — ملاحظاتك ونوع طلبك باقيان.");var up=document.getElementById("proofUpload");if(up&&up.scrollIntoView)up.scrollIntoView({block:"center"});return fail("أعد التحقق من صحيفة التخرج ثم أرسل.")}if(kind==="graduate"&&!proofEligible)return fail("تحقق من صحيفة التخرج أولاً");if(kind==="graduate"&&!reason)return fail("اختر نوع طلب الميداني");var graduateDetails=kind==="graduate"?String((document.getElementById("graduateDetails")||{}).value||"").trim():"";if(kind==="graduate"&&graduateDetails.length<3)return fail("اكتب ملاحظات الطلب وسبب احتياجك قبل الإرسال");send.disabled=true;send.textContent="جارٍ الإرسال…";fetch('/api/public/survey/'+encodeURIComponent(TOKEN),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:student.name,civil:student.civil,sectionId:student.sectionId,requestType:kind,courseIds:kind==="course-conflict"?[picked[0],otherCourse]:picked,proofToken:proofToken,graduateReason:reason,details:graduateDetails,caseRef:caseRef})}).then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d}})}).then(function(x){if(!x.ok){send.disabled=false;send.textContent=sendLabel();if(kind==="graduate"&&(x.d.code==="proof-expired"||x.d.code==="proof-required")){showProofUpload(x.d.error);var up=document.getElementById("proofUpload");if(up&&up.scrollIntoView)up.scrollIntoView({block:"center"})}return fail(x.d.error||"تعذر الإرسال")}identityLocked=true;caseRef=String(x.d.caseRef||caseRef);host.innerHTML='<div class="done"><div class="tick"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><h2>وصل طلبك إلى القسم</h2><p>شكراً '+esc(x.d.name)+' — تم حفظ الحالة للمراجعة.<br><strong class="case-ref"><span>رقم الحالة:</span> <bdi>'+esc(x.d.caseRef||"—")+'</bdi></strong>احفظ رقم الحالة أو التقط صورة للشاشة. وإذا غيّرت اختيارك، افتح الرابط نفسه وأرسل الطلب من جديد فيُحدّث طلبك الحالي.<br><a href="/m/'+encodeURIComponent(TOKEN)+'#'+encodeURIComponent(caseRef)+'" style="display:inline-block;margin-top:14px;padding:11px 18px;border-radius:11px;background:#2e7d5b;color:#fff;text-decoration:none;font-weight:700">تابع حالة طلبك</a></p></div>';step=3;paintProgress();window.scrollTo(0,0)}).catch(function(){send.disabled=false;send.textContent=sendLabel();fail("تعذر الإرسال — تحقق من الاتصال.")})}
fetch('/api/public/survey/'+encodeURIComponent(TOKEN)).then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d}})}).then(function(x){if(!x.ok){host.innerHTML='<div class="err">'+esc(x.d.error||"تعذر فتح النموذج")+'</div>';return}if(x.d.termEnded){host.innerHTML='<div class="done" role="status"><h2>انتهى هذا الفصل</h2><p>'+esc(x.d.message||"")+'</p><a href="'+esc(x.d.statusUrl||"#")+'" style="display:inline-block;margin-top:14px;padding:11px 18px;border-radius:11px;background:#2e7d5b;color:#fff;text-decoration:none;font-weight:700">حالة طلبي</a></div>';return}data=x.d;student={name:"",civil:"",sectionId:0};identityLocked=false;identityChecked=false;identity()}).catch(function(){host.innerHTML='<div class="err">تعذر الاتصال. تحقق من الإنترنت.</div>'})})();
</script></body></html>`;
}
