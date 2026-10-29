/* __BUILD__ is replaced at build time. Identical sw bytes between releases
   meant the browser never saw an update, so tabs that stayed open never
   learned a new version existed; a changed stamp makes every deploy a real
   service-worker update — install, activate, claim, and the page reloads. */
const BUILD="__BUILD__";
const SHELL_CACHE="schedule-shell-"+BUILD;
const API_CACHE="schedule-api-"+BUILD;
/** One document answers every route in a single-page app. */
const APP_SHELL_KEY="/index.html";
const SHELL=["/manifest.webmanifest","/schedule-icon.svg","/schedule-icon-192.png","/schedule-icon-512.png","/schedule-maskable-512.png","/fonts/plex-arabic-arabic-400.woff2","/fonts/plex-arabic-arabic-600.woff2","/fonts/plex-arabic-latin-400.woff2","/fonts/plex-arabic-latin-600.woff2","/fonts/plex-mono-latin-500.woff2"];
const CACHEABLE_API_PREFIXES=[
  "/api/dashboard","/api/colleges","/api/sections","/api/terms","/api/instructors","/api/courses","/api/schedules",
  "/api/intelligence/overview","/api/intelligence/drafts","/api/intelligence/versions","/api/intelligence/room","/api/intelligence/professor",
  "/api/audit-logs","/api/form-names","/api/admin-user-options"
];
/* Student cases carry names and civil IDs. They are never written to the
   device cache, even though they sit under a cacheable prefix. */
const PERSONAL_API_PREFIXES=["/api/schedules/demand","/api/student-registration"];
const isPersonalApi=pathname=>PERSONAL_API_PREFIXES.some(prefix=>pathname===prefix||pathname.startsWith(prefix+"/")||pathname.startsWith(prefix+"?"));
const isCacheableApi=pathname=>!isPersonalApi(pathname)&&CACHEABLE_API_PREFIXES.some(prefix=>pathname===prefix||pathname.startsWith(prefix+"/")||pathname.startsWith(prefix+"?"));
/*
 * A build asset carries its own content hash in its filename, so the bytes at
 * that URL can never change. Those are the only requests here that may be
 * answered from the cache WITHOUT touching the network — and they are also the
 * heaviest: the stylesheet and the schedule chunk are together most of what a
 * cold start has to download. Under the old network-first rule every launch
 * waited on a round trip for each of them before the app could paint, which is
 * the difference between "instant" and "several seconds" on a weak connection.
 * A new release publishes new filenames, so a stale copy is impossible.
 */
const isHashedAsset=pathname=>pathname.startsWith("/assets/")&&/-[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(pathname);
/*
 * «نُحدّث البرنامج» بدل صفحة Google الإنجليزية.
 *
 * أثناء النشر يتبدّل الخادم، فتجيب واجهةُ Google الأمامية عن التنقّل بصفحة
 * «Error: Server Error … try again in 30 seconds» لا يراها خادمُنا أصلاً.
 * الصفحةُ البديلة (/updating.html) تُحفظ هنا عند التثبيت في ذاكرةٍ ثابتة الاسم
 * يشاركها عاملُ تنبيهات البطاقة (push-sw.js)، وتُقدَّم للتنقّل وحده — لا لـ/api
 * ولا لغير GET ولا لجوابٍ ناجح — حين يعود 500/502/503/504 أو ينقطع الطلب.
 * لا يُحفظ جوابُ 5xx في أيّ ذاكرة هنا أبداً.
 */
const UPDATING_CACHE="schedule-updating";
const UPDATING_PAGE="/updating.html";
const isUpdatingStatus=status=>status===500||status===502||status===503||status===504;
const storeUpdatingPage=async()=>{
  const response=await fetch(UPDATING_PAGE,{cache:"no-store"});
  if(response.ok&&(response.headers.get("content-type")||"").includes("text/html"))await (await caches.open(UPDATING_CACHE)).put(UPDATING_PAGE,response);
};
/* مسحتها الاستعادةُ مع كل الذاكرة؟ تُعاد بعد أول تنقّلٍ ناجح، ولا يُنتظر ذلك. */
const refillUpdatingPage=()=>caches.open(UPDATING_CACHE).then(cache=>cache.match(UPDATING_PAGE)).then(hit=>hit?undefined:storeUpdatingPage()).catch(()=>undefined);
const updatingResponse=async()=>{
  const page=await caches.open(UPDATING_CACHE).then(cache=>cache.match(UPDATING_PAGE)).catch(()=>undefined);
  if(!page)return null;
  return new Response(await page.text(),{status:503,statusText:"Service Unavailable",headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Retry-After":"5","X-Schedule-Updating":"1"}});
};
/** تنقّلٌ إلى صفحةٍ تُبنى في الخادم: الشبكة كما هي، إلا 5xx أو الانقطاع فصفحةُ التحديث. */
const navigateOrUpdating=async event=>{
  let response;
  try{response=await fetch(event.request)}
  catch(error){const page=await updatingResponse();if(page)return page;throw error}
  if(isUpdatingStatus(response.status))return await updatingResponse()||response;
  if(response.ok)void refillUpdatingPage();
  return response;
};
self.addEventListener("install",event=>{event.waitUntil(caches.open(SHELL_CACHE).then(async cache=>{
  await cache.addAll(SHELL).catch(()=>undefined);
  await storeUpdatingPage().catch(()=>undefined);
  // Fetch the shell document once at install so the very first offline launch
  // already has a page to open, rather than waiting for a lucky online visit.
  try{const shell=await fetch("/",{cache:"no-store"});if(shell.ok)await cache.put(APP_SHELL_KEY,shell.clone());}catch{}
}).catch(()=>undefined));self.skipWaiting()});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>![SHELL_CACHE,API_CACHE,UPDATING_CACHE].includes(key)).map(key=>caches.delete(key)))));self.clients.claim()});
self.addEventListener("message",event=>{if(event.data?.type==="CLEAR_API_CACHE")event.waitUntil(caches.delete(API_CACHE));});
self.addEventListener("fetch",event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=="GET"||url.origin!==self.location.origin)return;
  /* الصفحاتُ المستقلّة أدناه تذهب إلى الشبكة ولا تمرّ بهيكل التطبيق أبداً؛ وتنقّلُها
     وحده يمرّ من navigateOrUpdating، فلا يتغيّر فيه إلا جوابُ الخطأ. */
  const leaveToNetwork=()=>{if(request.mode==="navigate")event.respondWith(navigateOrUpdating(event))};
  if(url.pathname===UPDATING_PAGE)return leaveToNetwork();
  /* Standalone pages under /plans/ (department study-plan infographics) are not
     part of the app. Left to the navigation rule below, opening one would store
     it under APP_SHELL_KEY and an offline launch of the app would show the plan
     instead of the app. They go straight to the network, untouched. */
  if(url.pathname.startsWith("/plans/"))return leaveToNetwork();
  /* صفحتا باب القاعة ولوحة المبنى (/d/ و/b/) مستقلتان كذلك، وتُسألان كل دقيقة: شبكةٌ مباشرة. */
  if(url.pathname.startsWith("/d/")||url.pathname.startsWith("/b/"))return leaveToNetwork();
  /* الإعلانات والنبض: شبكةٌ مباشرة دائماً؛ نسخةٌ قديمة تعني إعلاناً منتهياً أو عدّاداً لا يُحتسب. */
  if(url.pathname.startsWith("/_ads/")||url.pathname==="/_pulse")return;
  /* صفحتا الشركاء مستقلتان عن التطبيق وبرمزٍ سرّي: لو مرّتا بقاعدة التنقّل لحلّتا محلّ هيكل التطبيق دون اتصال. */
  if(url.pathname.startsWith("/ad-report/")||url.pathname.startsWith("/partners/")||url.pathname.startsWith("/verify/")||url.pathname==="/measurement")return leaveToNetwork();
  /* صفحاتُ الروابط العامة — كرتُ الأستاذ (/r/) وبطاقةُ القسم (/s/) ومساري (/me) وأخواتها — تُبنى في
     الخادم لكل رمز. لا تُخزَّن هنا ولا تُجاب من هيكل التطبيق: لو مرّت بقاعدة التنقّل لصار الكرتُ هو
     «التطبيق» دون اتصال، ولقُدِّم كرتٌ قديم. ولها عاملُها الخاص للتنبيهات (/push-sw.js) بلا ذاكرة. */
  if(/^\/(?:r|s|q|m|t)\//.test(url.pathname)||url.pathname==="/me"||url.pathname.startsWith("/me/")||url.pathname==="/push-sw.js")return leaveToNetwork();
  if(url.pathname.startsWith("/api/")){
    // Never persist authentication responses or credential/admin-user payloads.
    if(url.pathname.startsWith("/api/auth/")||url.pathname==="/api/users"||!isCacheableApi(url.pathname))return;
    event.respondWith((async()=>{
      const cache=await caches.open(API_CACHE);
      try{
        const response=await fetch(request);
        if(response.ok&&response.headers.get("content-type")?.includes("application/json"))await cache.put(request,response.clone());
        return response;
      }catch{
        const hit=await cache.match(request);
        return hit||new Response(JSON.stringify({error:"لا يوجد اتصال ولا توجد نسخة محفوظة لهذه البيانات بعد."}),{status:503,headers:{"Content-Type":"application/json; charset=utf-8","X-Schedule-Offline":"1"}});
      }
    })());
    return;
  }
  // Navigation requests for HTML documents must always be served from network to avoid stale JS asset references.
  // But every successful document is kept under ONE key, so that going offline
  // has something real to fall back to. Previously the fallback searched for the
  // exact URL that was never stored, so it could only ever miss — an installed
  // app opened to a dead page while onboarding promised the opposite. The SPA
  // serves the same document on every route, so one copy answers every path.
  // A 5xx is the platform swapping servers mid-deploy: the updating page waits
  // for the server and reopens this same URL. A dropped request while the
  // device says it is online is the same moment; truly offline keeps the shell.
  if(request.mode==="navigate"){
    const offlineShell=async()=>{
      const cache=await caches.open(SHELL_CACHE);
      const hit=await cache.match(APP_SHELL_KEY)||await cache.match(request);
      return hit||new Response("<html><body><h2 style='text-align:center;margin-top:50px;font-family:sans-serif'>لا يوجد اتصال بالإنترنت حالياً</h2></body></html>",{headers:{"Content-Type":"text/html; charset=utf-8"}});
    };
    event.respondWith(fetch(request,{cache:"no-store"}).then(async response=>{
      if(isUpdatingStatus(response.status))return await updatingResponse()||response;
      if(response.ok){
        caches.open(SHELL_CACHE).then(cache=>cache.put(APP_SHELL_KEY,response.clone())).catch(()=>undefined);
        void refillUpdatingPage();
      }
      return response;
    }).catch(async()=>{
      if(self.navigator?.onLine!==false){const page=await updatingResponse();if(page)return page}
      return offlineShell();
    }));
    return;
  }
  event.respondWith((async()=>{
    const cache=await caches.open(SHELL_CACHE);
    /* Immutable by filename: answer from disk and do not wait for the wire. */
    if(isHashedAsset(url.pathname)){
      const stored=await cache.match(request);
      if(stored)return stored;
      try{
        const response=await fetch(request);
        if(response.ok)cache.put(request,response.clone()).catch(()=>undefined);
        return response;
      }catch{
        return new Response("Not found",{status:404});
      }
    }
    try{
      const response=await fetch(request);
      if(response.ok)cache.put(request,response.clone()).catch(()=>undefined);
      /* A font or icon asked for mid-deploy gets the platform's 5xx page: the copy on disk is better. */
      else if(isUpdatingStatus(response.status))return await cache.match(request)||response;
      return response;
    }catch{
      const hit=await cache.match(request);
      return hit||new Response("Not found",{status:404});
    }
  })());
});
