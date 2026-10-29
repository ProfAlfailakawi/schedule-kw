/*
 * ── عاملُ التنبيهات وحده (Web Push) ─────────────────────────────────────────
 *
 * عاملٌ مستقلّ عن sw.js، لا يخزّن صفحةً ولا يجيب طلباً من ذاكرة، فلا يقدّم
 * صفحةً قديمة، ولا يمسّ كرتَ الأستاذ الذي يُبنى في الخادم (إلا جوابَ الخطأ، أدناه).
 *
 *   • في التطبيق نطاقُه "/push/" — لا صفحةَ هناك، فلا يتحكّم بشيء، ولا تمسّه
 *     استعادةُ الإصدار القديم في main.tsx (تُسقط sw.js وتُبقي هذا، وإلا ماتت
 *     اشتراكاتُ الأجهزة معه: إلغاءُ تسجيل العامل يُلغي اشتراكه).
 *   • في كرت الأستاذ نطاقُه "/r/<الرمز>" — الكرتُ وحده، وهو بدايةُ «بطاقتي» على
 *     الشاشة الرئيسية (iOS 16.4+ لا يدفع إلا لتطبيقٍ هناك).
 *
 * ثابتٌ بين الإصدارات عمداً: لا ختمَ بناءٍ فيه، فلا يُعاد تثبيتُه مع كل نشر.
 *
 * معالجُ fetch الوحيد فيه لا يخزّن صفحةً ولا يجيب من ذاكرة: يمرّر تنقّلَ الكرت
 * إلى الشبكة كما هو، فإن جاء 500/502/503/504 (Google أثناء تبديل الخادم) أو
 * انقطع، قدّم صفحةَ «نُحدّث البرنامج» (/updating.html) بدل صفحة Google
 * الإنجليزية، وهي تعيد فتحَ الكرت نفسه حين يعود الخادم. الصفحةُ وحدها في
 * ذاكرةٍ ثابتة الاسم يشاركها sw.js ويجدّدها مع كل نشر.
 */
var UPDATING_CACHE = "schedule-updating";
var UPDATING_PAGE = "/updating.html";
function isUpdatingStatus(status) { return status === 500 || status === 502 || status === 503 || status === 504; }
function storeUpdatingPage() {
  return fetch(UPDATING_PAGE, { cache: "no-store" }).then(function (response) {
    if (!response.ok || String(response.headers.get("content-type") || "").indexOf("text/html") < 0) return;
    return caches.open(UPDATING_CACHE).then(function (cache) { return cache.put(UPDATING_PAGE, response); });
  }).catch(function () { /* تُعاد بعد أول تنقّلٍ ناجح */ });
}
function updatingResponse() {
  return caches.open(UPDATING_CACHE).then(function (cache) { return cache.match(UPDATING_PAGE); }).then(function (page) {
    if (!page) return null;
    return page.text().then(function (body) {
      return new Response(body, { status: 503, statusText: "Service Unavailable",
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "5", "X-Schedule-Updating": "1" } });
    });
  }).catch(function () { return null; });
}

self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(storeUpdatingPage());
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.mode !== "navigate" || request.method !== "GET") return;
  event.respondWith(fetch(request).then(function (response) {
    if (!isUpdatingStatus(response.status)) {
      if (response.ok) caches.open(UPDATING_CACHE).then(function (cache) { return cache.match(UPDATING_PAGE); })
        .then(function (hit) { return hit || storeUpdatingPage(); }).catch(function () {});
      return response;
    }
    return updatingResponse().then(function (page) { return page || response; });
  }, function (error) {
    return updatingResponse().then(function (page) { if (page) return page; throw error; });
  }));
});

/* ما يُفتح عند اللمس صفحةٌ من الموقع نفسه، وإلا فبدايةُ نطاق العامل. */
function targetOf(data) {
  var fallback = new URL(self.registration.scope);
  if (/\/push\/$/.test(fallback.pathname)) fallback = new URL("/", self.location.origin);
  try {
    var url = new URL(String((data && data.url) || ""), self.location.origin);
    if (url.origin === self.location.origin) return url;
  } catch (_) { /* رابطٌ معطوب: البداية */ }
  return fallback;
}

self.addEventListener("push", function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (_) { data = { body: event.data ? event.data.text() : "" }; }
  var title = String(data.title || "SCHEDULE").slice(0, 120);
  var options = {
    body: String(data.body || "").slice(0, 240),
    icon: "/schedule-icon-192.png",
    dir: "rtl",
    lang: "ar",
    data: { url: targetOf(data).href },
    timestamp: Date.parse(data.at) || Date.now()
  };
  /* الوسمُ نفسه يستبدل التنبيهَ السابق في القائمة، ويُنبّه من جديد. */
  if (data.tag) { options.tag = String(data.tag).slice(0, 64); options.renotify = true; }
  event.waitUntil(self.registration.showNotification(title, options));
});

/* صفحاتُ الروابط العامة ليست التطبيق: لا يُستعمل لسانُها لفتح شاشةٍ من التطبيق. */
function isPublicPage(pathname) {
  return /^\/(r|s|q|m|t)\//.test(pathname) || pathname === "/me" || pathname.indexOf("/me/") === 0;
}

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    var same = null, app = null;
    for (var i = 0; i < list.length; i++) {
      var path = new URL(list[i].url).pathname;
      if (!same && path === target.pathname) same = list[i];
      if (!app && !isPublicPage(path)) app = list[i];
    }
    /* اللسانُ المفتوح على الصفحة نفسها يُستدعى ويُخبَر فيحدّث نفسه؛ وشاشةٌ من
       التطبيق تنتقل إلى الوارد بلا إعادة تحميل؛ وإلا تُفتح الصفحة. */
    var open = same || (!isPublicPage(target.pathname) ? app : null);
    if (open && "focus" in open) {
      return open.focus().then(function (client) {
        (client || open).postMessage({ type: "schedule-push-open", url: target.href });
      }, function () { return self.clients.openWindow(target.href); });
    }
    return self.clients.openWindow ? self.clients.openWindow(target.href) : undefined;
  }));
});

/*
 * المتصفّحُ يجدّد الاشتراكَ أحياناً والتطبيقُ مغلق. يُثبت العاملُ ملكيتَه بالاشتراك
 * القديم (رابطُه وسرُّه) فينتقل السجلُّ إلى الجديد بصاحبه نفسه — حساباً أو كرتاً.
 */
self.addEventListener("pushsubscriptionchange", function (event) {
  var old = event.oldSubscription;
  var oldJson = old && old.toJSON ? old.toJSON() : null;
  var key = old && old.options ? old.options.applicationServerKey : null;
  if (!oldJson || !oldJson.endpoint || !oldJson.keys || !key) return;
  event.waitUntil((event.newSubscription ? Promise.resolve(event.newSubscription)
    : self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }))
    .then(function (next) {
      return fetch("/api/public/push/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ old: { endpoint: oldJson.endpoint, auth: oldJson.keys.auth }, subscription: next.toJSON() })
      });
    })
    .catch(function () { /* تعيده الصفحةُ في الزيارة التالية */ }));
});
