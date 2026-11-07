/* سلوك الصفحة التفاعلية: اللغة والسمة والبحث والمرشحات والتنقل. بلا مكتبات. */
(function () {
  var root = document.documentElement, body = document.body;
  var safe = function (fn) { try { return fn(); } catch (e) { return null; } };
  var norm = function (s) { return String(s).toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه"); };
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* اللغة */
  function setLang(l, silent) {
    root.lang = l; root.dir = l === "ar" ? "rtl" : "ltr";
    $$("[data-lang-btn]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-lang-btn") === l)); });
    var q = $("#q"); if (q) q.placeholder = q.getAttribute("data-ph-" + l) || "";
    $$("[data-pdf]").forEach(function (a) { a.href = a.getAttribute("data-pdf-" + l) || "#"; });
    if (!silent) safe(function () { localStorage.setItem("srs-lang", l); });
    updateHash();
  }
  var initial = (location.hash.match(/lang=(ar|en)/) || [])[1] || safe(function () { return localStorage.getItem("srs-lang"); }) || (/^en/i.test(navigator.language || "") ? "en" : "ar");
  setLang(initial === "en" ? "en" : "ar", true);
  $$("[data-lang-btn]").forEach(function (b) { b.addEventListener("click", function () { setLang(b.getAttribute("data-lang-btn")); }); });

  /* السمة */
  var theme = safe(function () { return localStorage.getItem("srs-theme"); });
  if (theme) root.setAttribute("data-theme", theme);
  var tbtn = $("#theme");
  if (tbtn) tbtn.addEventListener("click", function () {
    var dark = root.getAttribute("data-theme") === "dark" || (!root.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
    var next = dark ? "light" : "dark"; root.setAttribute("data-theme", next); safe(function () { localStorage.setItem("srs-theme", next); });
  });

  /* العدّادات */
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  $$("[data-count]").forEach(function (el) {
    var target = +el.getAttribute("data-count"), suffix = el.getAttribute("data-suffix") || "";
    if (reduce || !("IntersectionObserver" in window)) { el.textContent = target.toLocaleString("en") + suffix; return; }
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) {
      if (!e.isIntersecting) return; io.disconnect();
      var t0 = performance.now();
      (function tick(t) { var p = Math.min(1, (t - t0) / 900); el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString("en") + suffix; if (p < 1) requestAnimationFrame(tick); })(t0);
    }); }); io.observe(el);
  });

  /* المرشحات والبحث */
  var state = { q: "", status: {}, priority: {}, kind: {}, module: "", actor: "", inferred: false };
  var reqs = $$(".req"), chapters = $$(".chapter");
  function active() { return state.q || state.module || state.actor || state.inferred || Object.keys(state.status).length || Object.keys(state.priority).length || Object.keys(state.kind).length; }
  function apply() {
    var q = norm(state.q.trim()), words = q ? q.split(/\s+/) : [], shown = 0, per = {};
    reqs.forEach(function (r) {
      var d = r.dataset, ok = true;
      if (Object.keys(state.status).length && !state.status[d.status]) ok = false;
      if (Object.keys(state.priority).length && !state.priority[d.priority]) ok = false;
      if (Object.keys(state.kind).length && !state.kind[d.kind]) ok = false;
      if (state.module && d.module !== state.module) ok = false;
      if (state.actor && (" " + d.actors + " ").indexOf(" " + state.actor + " ") < 0) ok = false;
      if (state.inferred && d.inferred !== "1") ok = false;
      if (ok && words.length) { var hay = d.q; for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) { ok = false; break; } }
      r.hidden = !ok; if (ok) { shown++; per[d.module] = (per[d.module] || 0) + 1; }
    });
    var on = !!active();
    body.classList.toggle("filtering", on); body.classList.toggle("none", on && !shown);
    chapters.forEach(function (c) { c.hidden = on && !per[c.dataset.module]; });
    var rc = $("#resultcount"); if (rc) rc.textContent = shown;
    $$("[data-fchip]").forEach(function (b) { b.setAttribute("aria-pressed", String(!!state[b.dataset.fchip][b.dataset.val])); });
    var inf = $("#f-inferred"); if (inf) inf.setAttribute("aria-pressed", String(state.inferred));
    updateHash();
  }
  var qin = $("#q"); if (qin) qin.addEventListener("input", function () { state.q = qin.value; apply(); });
  document.addEventListener("keydown", function (e) { if (e.key === "/" && document.activeElement !== qin && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); qin && qin.focus(); } });
  $$("[data-fchip]").forEach(function (b) { b.addEventListener("click", function () { var s = state[b.dataset.fchip]; if (s[b.dataset.val]) delete s[b.dataset.val]; else s[b.dataset.val] = 1; apply(); }); });
  var fi = $("#f-inferred"); if (fi) fi.addEventListener("click", function () { state.inferred = !state.inferred; apply(); });
  var fm = $("#f-module"); if (fm) fm.addEventListener("change", function () { state.module = fm.value; apply(); });
  var fa = $("#f-actor"); if (fa) fa.addEventListener("change", function () { state.actor = fa.value; apply(); });
  var clear = function () { state = { q: "", status: {}, priority: {}, kind: {}, module: "", actor: "", inferred: false }; if (qin) qin.value = ""; if (fm) fm.value = ""; if (fa) fa.value = ""; apply(); };
  $$("[data-clear]").forEach(function (b) { b.addEventListener("click", clear); });
  $$("[data-filter-actor]").forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); state.actor = a.dataset.filterActor; if (fa) fa.value = state.actor; apply(); window.scrollTo({ top: 0 }); }); });
  $$("[data-filter-status]").forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); state.status = {}; state.status[a.dataset.filterStatus] = 1; apply(); window.scrollTo({ top: 0 }); }); });
  var ft = $("#ftoggle"); if (ft) ft.addEventListener("click", function () { var o = $("#filterbar").classList.toggle("open"); ft.setAttribute("aria-expanded", String(o)); });
  var openAll = $("#openall"); if (openAll) openAll.addEventListener("click", function () { var o = openAll.getAttribute("aria-pressed") !== "true"; openAll.setAttribute("aria-pressed", String(o)); $$(".req details").forEach(function (d) { d.open = o; }); });

  /* الرابط الحي */
  function updateHash() { /* اللغة في الرابط للمشاركة؛ والمرشحات لا تُحفظ فيه */ if (history.replaceState && !/^#(FR|NFR|DR|IR)-/.test(location.hash) && !/^#mod-/.test(location.hash)) safe(function () { history.replaceState(null, "", location.pathname + location.search + "#lang=" + root.lang); }); }
  function openTarget() { var id = decodeURIComponent(location.hash.slice(1)); var el = id && document.getElementById(id); if (el && el.classList.contains("req")) { el.hidden = false; var d = $("details", el); if (d) d.open = true; el.scrollIntoView({ block: "center" }); el.animate && !reduce && el.animate([{ boxShadow: "0 0 0 4px var(--brass-bright)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1600 }); } }
  window.addEventListener("hashchange", openTarget); openTarget();
  $$(".req-id").forEach(function (a) { a.addEventListener("click", function () { var u = location.origin + location.pathname + "#" + a.getAttribute("href").slice(1); safe(function () { navigator.clipboard.writeText(u); }); }); });

  /* متابعة التمرير في الفهرس */
  var links = $$(".toc a[data-sec]");
  if ("IntersectionObserver" in window && links.length) {
    var map = {}; links.forEach(function (a) { map[a.dataset.sec] = a; });
    var io2 = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { links.forEach(function (a) { a.classList.remove("on"); }); var a = map[e.target.id]; if (a) a.classList.add("on"); } }); }, { rootMargin: "-140px 0px -65% 0px" });
    $$("[data-secid]").forEach(function (s) { io2.observe(s); });
  }
  var pr = $$("[data-print]"); pr.forEach(function (b) { b.addEventListener("click", function () { window.print(); }); });
  apply();
})();
