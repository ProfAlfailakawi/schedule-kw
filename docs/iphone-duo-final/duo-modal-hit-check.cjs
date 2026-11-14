/* iPhone Duo — مع نافذةٍ أو درجٍ مفتوح على الكتاب، الضغط على وجهةٍ في الفهرس لا يصل إليها (الخلفية تحجبه).
   NODE_PATH=… PLAYWRIGHT_BROWSERS_PATH=… DUO_BASE=http://127.0.0.1:5120 node docs/iphone-duo-final/duo-modal-hit-check.cjs 669x867,951x585
   يطبع لكل نافذة: ما تحت نقطة الضغط (top=) وهل انتقلت الصفحة (navigated=). المطلوب: top خلفية النافذة، وnavigated=false. */
const { webkit } = require("playwright");
const BASE=process.env.DUO_BASE||"http://127.0.0.1:5120"; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const scenes=[
 ["/Home/Index","البحث الشامل",p=>p.evaluate(()=>[...document.querySelectorAll("button")].find(b=>b.getAttribute("aria-label")==="فتح البحث الشامل"||/بحث شامل/.test(b.innerText))?.click())],
 ["/FSchedule/Index","تفاصيل موعد",p=>p.evaluate(()=>document.querySelector(".agenda-card")?.click())],
 ["/FSchedule/Index","النشر",async p=>{await p.evaluate(()=>[...document.querySelectorAll("main button")].find(b=>b.offsetParent&&(b.innerText||"").trim()==="المزيد")?.click()); await sleep(500); await p.evaluate(()=>[...document.querySelectorAll("button")].find(b=>b.offsetParent&&/أدوات البيانات/.test(b.innerText))?.click()); await sleep(800); await p.evaluate(()=>[...document.querySelectorAll("button")].find(b=>b.offsetParent&&(b.innerText||"").trim()==="نشر")?.click()); await sleep(800); await p.evaluate(()=>[...document.querySelectorAll("button")].find(b=>b.offsetParent&&(b.innerText||"").trim()==="نشر الجدول")?.click());}],
 ["/Home/Index","الأثر",p=>p.evaluate(()=>document.querySelector(".user-card-tools .trail-open")?.click())],
 ["/AdInstructor/Index","نموذج",p=>p.evaluate(()=>[...document.querySelectorAll("button")].find(x=>x.offsetParent&&/^(إضافة|جديد|إنشاء|\+)/.test((x.innerText||"").trim()))?.click())],
 ["/Schedule/Intelligence","درج القاعة",async p=>{await p.evaluate(()=>document.querySelector("#insight-tab-rooms")?.click()); await sleep(1200); await p.evaluate(()=>document.querySelector("#insight-panel-rooms .intel-rank-list button")?.click());}],
];
(async()=>{ const b=await webkit.launch();
 for (const s of process.argv[2].split(",")){ const [w,h]=s.split("x").map(Number); const ctx=await b.newContext({viewport:{width:w,height:h},hasTouch:true,locale:"ar-KW"});
 await ctx.addInitScript(() => { const read = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { return String(k).startsWith("schedule-onboarding") ? "done" : read.call(this, k); }; });
 const r=await ctx.request.post(BASE+"/api/auth/demo",{data:{}}); const sc=(r.headers()["set-cookie"]||"").match(/session_id=([^;]+)/); await ctx.addCookies([{name:"session_id",value:sc[1],url:BASE}]);
 const p=await ctx.newPage();
 for (const [route,name,open] of scenes){ await p.goto(BASE+route); await sleep(3500); await open(p); await sleep(1500);
   const pt=await p.evaluate(()=>{const a=[...document.querySelectorAll(".sidebar .side-nav-link")].find(x=>{const r=x.getBoundingClientRect();return r.width>0&&r.top>100&&r.bottom<innerHeight-10&&!x.classList.contains("active")}); if(!a) return null; const r=a.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,label:a.innerText.trim()}});
   const before=p.url(); const dialogs=await p.locator("[role=dialog]:visible,[aria-modal=true]:visible,.schedule-context:visible,.intel-drawer:visible,.catalog-form-drawer:visible").count();
   const top=pt?await p.evaluate(({x,y})=>{const e=document.elementFromPoint(x,y);return e?(e.tagName+"."+String(e.className).slice(0,40)):null},pt):null;
   if(pt) await p.mouse.click(pt.x,pt.y); await sleep(1200);
   console.log(s,name,"open="+dialogs,"target="+(pt&&pt.label),"top="+top,"navigated="+(p.url()!==before));
   for(let i=0;i<3;i++){await p.keyboard.press("Escape");await sleep(150);} }
 await ctx.close(); } await b.close(); })();
