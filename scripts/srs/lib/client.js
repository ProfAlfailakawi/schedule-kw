/* سلوك الصفحة التفاعلية: تبويبات رئيسية، ووحدة واحدة في كل مرة، ومرشحات في تبويب المتطلبات. بلا مكتبات. */
(function () {
  var root = document.documentElement, body = document.body;
  var safe = function (fn) { try { return fn(); } catch (e) { return null; } };
  var norm = function (s) { return String(s).toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه"); };
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── اللغة والسمة ───────────────────────────────────────────── */
  function setLang(l, silent) {
    root.lang = l; root.dir = l === "ar" ? "rtl" : "ltr";
    $$("[data-lang-btn]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-lang-btn") === l)); });
    var q = $("#q"); if (q) q.placeholder = q.getAttribute("data-ph-" + l) || "";
    $$("[data-pdf]").forEach(function (a) { a.href = a.getAttribute("data-pdf-" + l) || "#"; });
    $$("[data-live]").forEach(function (a) { a.href = a.getAttribute("data-live-" + l) || "#"; });
    $$("option[data-ar]").forEach(function (o) { o.textContent = o.getAttribute("data-" + l); });
    $$("optgroup[data-ar]").forEach(function (g) { g.label = g.getAttribute("data-" + l); });
    if (!silent) safe(function () { localStorage.setItem("srs-lang", l); });
  }
  var initial = safe(function () { return localStorage.getItem("srs-lang"); }) || (/^en/i.test(navigator.language || "") ? "en" : "ar");
  setLang(initial === "en" ? "en" : "ar", true);
  $$("[data-lang-btn]").forEach(function (b) { b.addEventListener("click", function () { setLang(b.getAttribute("data-lang-btn")); }); });
  var theme = safe(function () { return localStorage.getItem("srs-theme"); });
  if (theme) root.setAttribute("data-theme", theme);
  var tbtn = $("#theme");
  if (tbtn) tbtn.addEventListener("click", function () {
    var dark = root.getAttribute("data-theme") === "dark" || (!root.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
    var next = dark ? "light" : "dark"; root.setAttribute("data-theme", next); safe(function () { localStorage.setItem("srs-theme", next); });
  });

  /* ── العدّادات ──────────────────────────────────────────────── */
  function counters() {
    $$("[data-count]").forEach(function (el) {
      var target = +el.getAttribute("data-count"), suffix = el.getAttribute("data-suffix") || "";
      if (reduce) { el.textContent = target.toLocaleString("en") + suffix; return; }
      var t0 = performance.now();
      (function tick(t) { var p = Math.min(1, (t - t0) / 800); el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString("en") + suffix; if (p < 1) requestAnimationFrame(tick); })(t0);
    });
  }

  /* ── المرشحات ──────────────────────────────────────────────── */
  var fresh = function () { return { q: "", status: {}, priority: {}, kind: {}, module: "", actor: "", inferred: false }; };
  var state = fresh();
  var reqs = $$(".req"), mods = $$(".mod"), tabs = $$(".tab[data-view]");
  var cur = { view: "overview", mod: "", panel: "" }, panelOf = {};
  var stage = $("#stage"), map = $("#modmap");
  var qin = $("#q"), fm = $("#f-module"), fa = $("#f-actor");

  function filtersOn() { return state.q || state.module || state.actor || state.inferred || Object.keys(state.status).length || Object.keys(state.priority).length || Object.keys(state.kind).length; }
  function applyFilters() {
    var live = cur.view === "requirements";
    var q = norm(state.q.trim()), words = q ? q.split(/\s+/) : [], shown = 0, per = {};
    reqs.forEach(function (r) {
      var d = r.dataset, ok = true;
      if (live) {
        if (Object.keys(state.status).length && !state.status[d.status]) ok = false;
        if (Object.keys(state.priority).length && !state.priority[d.priority]) ok = false;
        if (Object.keys(state.kind).length && !state.kind[d.kind]) ok = false;
        if (state.module && d.module !== state.module) ok = false;
        if (state.actor && (" " + d.actors + " ").indexOf(" " + state.actor + " ") < 0) ok = false;
        if (state.inferred && d.inferred !== "1") ok = false;
        if (ok && words.length) { for (var i = 0; i < words.length; i++) if (d.q.indexOf(words[i]) < 0) { ok = false; break; } }
      }
      r.hidden = !ok; if (ok) { shown++; per[d.module] = (per[d.module] || 0) + 1; }
    });
    var none = live && filtersOn() && !shown;
    body.classList.toggle("none", !!none);
    mods.forEach(function (m) { m.hidden = live && !per[m.dataset.module]; });
    var rc = $("#resultcount"); if (rc) rc.textContent = live ? shown : reqs.length;
    $$("[data-fchip]").forEach(function (b) { b.setAttribute("aria-pressed", String(!!state[b.dataset.fchip][b.dataset.val])); });
    var inf = $("#f-inferred"); if (inf) inf.setAttribute("aria-pressed", String(state.inferred));
  }

  /* ── التنقل ─────────────────────────────────────────────────── */
  function panelsFor() {
    mods.forEach(function (m) {
      var id = m.dataset.module, want = cur.view === "requirements" ? "reqs" : (panelOf[id] || "about");
      $$(".panel", m).forEach(function (p) { p.hidden = p.dataset.p !== want; });
      $$(".subtab", m).forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.p === (panelOf[id] || "about"))); });
    });
  }
  function hashFor() {
    if (cur.view === "modules" && cur.mod) return "#/modules/" + cur.mod + (cur.panel && cur.panel !== "about" ? "/" + cur.panel : "");
    return "#/" + cur.view;
  }
  function show(view, mod, panel, opts) {
    opts = opts || {};
    cur.view = view; cur.mod = view === "modules" ? (mod || "") : cur.mod;
    if (view === "modules" && mod && panel) panelOf[mod] = panel;
    cur.panel = (view === "modules" && cur.mod) ? (panelOf[cur.mod] || "about") : "";
    body.dataset.view = view; body.dataset.mod = view === "modules" ? cur.mod : "";
    $$(".view").forEach(function (v) { v.hidden = v.id !== "v-" + view; });
    var onStage = view === "modules" || view === "requirements";
    if (stage) stage.hidden = !onStage;
    tabs.forEach(function (t) { t.setAttribute("aria-selected", String(t.dataset.view === view)); });
    mods.forEach(function (m) { m.classList.toggle("on", view === "modules" && m.dataset.module === cur.mod); });
    if (map) map.hidden = !(view === "modules" && !cur.mod);
    $$(".mod-list [data-mod]").forEach(function (b) { b.setAttribute("aria-current", String(view === "modules" && b.dataset.mod === cur.mod)); });
    var pick = $("#modpick"); if (pick) pick.value = view === "modules" ? cur.mod : "";
    panelsFor(); applyFilters();
    if (view === "overview" && !opts.noCount) counters();
    if (!opts.silent && history.replaceState) safe(function () { history.replaceState(null, "", location.pathname + location.search + hashFor()); });
    if (!opts.keepScroll) window.scrollTo({ top: 0 });
  }
  function route() {
    var h = decodeURIComponent(location.hash || "");
    var m;
    if ((m = /^#\/modules(?:\/([A-Z]{3})(?:\/([a-z]+))?)?$/.exec(h))) { show("modules", m[1] || "", m[2] || "", { silent: true }); return; }
    if ((m = /^#\/([a-z]+)$/.exec(h)) && (m[1] === "requirements" || $("#v-" + m[1]))) { show(m[1], "", "", { silent: true }); return; }
    if ((m = /^#((?:FR|NFR|DR|IR)-[A-Z]{3}-\d{3})$/.exec(h))) { openReq(m[1]); return; }
    if ((m = /^#(ALG-([A-Z]{3})-\d{2})$/.exec(h))) { panelOf[m[2]] = "algos"; show("modules", m[2], "algos", { silent: true, keepScroll: true }); var el = document.getElementById(m[1]); if (el) el.scrollIntoView({ block: "center" }); return; }
    show("overview", "", "", { silent: true, keepScroll: true });
  }
  function openReq(id) {
    var el = document.getElementById(id); if (!el || !el.classList.contains("req")) { show("overview", "", "", { silent: true }); return; }
    panelOf[el.dataset.module] = "reqs";
    show("modules", el.dataset.module, "reqs", { silent: true, keepScroll: true });
    el.hidden = false; var d = $("details", el); if (d) d.open = true;
    el.scrollIntoView({ block: "center" });
    if (el.animate && !reduce) el.animate([{ boxShadow: "0 0 0 4px var(--brass-bright)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1600 });
  }
  window.addEventListener("hashchange", route);

  tabs.forEach(function (t) { t.addEventListener("click", function () { show(t.dataset.view, "", ""); }); });
  $$("[data-mod]").forEach(function (b) { if (b === document.body) return; b.addEventListener("click", function () { show("modules", b.dataset.mod, ""); }); });
  $$("[data-go]").forEach(function (b) { b.addEventListener("click", function () { show(b.dataset.go, "", ""); }); });
  $$(".subtab").forEach(function (b) { b.addEventListener("click", function () { var m = b.closest(".mod").dataset.module; show("modules", m, b.dataset.p, { keepScroll: true }); }); });
  var pick = $("#modpick"); if (pick) pick.addEventListener("change", function () { show("modules", pick.value, ""); });
  $$("[data-more]").forEach(function (b) { b.addEventListener("click", function () { b.parentNode.classList.add("open"); b.remove(); }); });
  $$(".back-map").forEach(function (b) { b.addEventListener("click", function () { show("modules", "", ""); }); });

  /* ── البحث والمرشحات ───────────────────────────────────────── */
  if (qin) qin.addEventListener("input", function () { state.q = qin.value; if (cur.view !== "requirements") show("requirements", "", "", { keepScroll: true }); else applyFilters(); });
  document.addEventListener("keydown", function (e) { if (e.key === "/" && document.activeElement !== qin && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); qin && qin.focus(); } });
  $$("[data-fchip]").forEach(function (b) { b.addEventListener("click", function () { var s = state[b.dataset.fchip]; if (s[b.dataset.val]) delete s[b.dataset.val]; else s[b.dataset.val] = 1; applyFilters(); }); });
  var fi = $("#f-inferred"); if (fi) fi.addEventListener("click", function () { state.inferred = !state.inferred; applyFilters(); });
  if (fm) fm.addEventListener("change", function () { state.module = fm.value; applyFilters(); });
  if (fa) fa.addEventListener("change", function () { state.actor = fa.value; applyFilters(); });
  $$("[data-clear]").forEach(function (b) { b.addEventListener("click", function () { state = fresh(); if (qin) qin.value = ""; if (fm) fm.value = ""; if (fa) fa.value = ""; applyFilters(); }); });
  $$("[data-filter-actor]").forEach(function (a) { a.addEventListener("click", function () { state = fresh(); state.actor = a.dataset.filterActor; if (fa) fa.value = state.actor; if (qin) qin.value = ""; show("requirements", "", ""); }); });
  var openAll = $("#openall"); if (openAll) openAll.addEventListener("click", function () { var o = openAll.getAttribute("aria-pressed") !== "true"; openAll.setAttribute("aria-pressed", String(o)); $$(".req details").forEach(function (d) { d.open = o; }); });
  $$(".req-id").forEach(function (a) { a.addEventListener("click", function () { var u = location.origin + location.pathname + "#" + a.getAttribute("href").slice(1); safe(function () { navigator.clipboard.writeText(u); }); }); });

  /* ── اسما المؤلفَين في سطر واحد دائماً: يتقلّص الخط حتى يتسع السطر ──────── */
  function fitOneLine() {
    $$(".hchip.authors, .foot .authors-line").forEach(function (el) {
      el.style.fontSize = "";
      if (!el.clientWidth) return;
      var fs = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth + 1 && fs > 6.5) { fs -= 0.5; el.style.fontSize = fs + "px"; }
    });
  }
  var fitQueued = false, fitSoon = function () { if (fitQueued) return; fitQueued = true; requestAnimationFrame(function () { fitQueued = false; fitOneLine(); }); };
  window.addEventListener("resize", fitSoon);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitSoon);
  $$("[data-lang-btn]").forEach(function (b) { b.addEventListener("click", fitSoon); });
  tabs.forEach(function (t) { t.addEventListener("click", fitSoon); });
  fitSoon();

  /* ── أرقام «النظام في الاستخدام» حيّة: من لوحة الجمهور نفسها، وتتحرك عند التغيّر ── */
  function fmtN(n, l) {
    if (n >= 1e6) { var v = (n / 1e6).toFixed(1).replace(/\.0$/, ""); return l === "ar" ? v + " مليون" : v + " million"; }
    return Math.round(n).toLocaleString("en-US");
  }
  var shown = {};
  function paint(el, n) {
    var a = el.querySelector(".ar"), e = el.querySelector(".en");
    if (a) a.textContent = fmtN(n, "ar"); if (e) e.textContent = fmtN(n, "en");
  }
  function animateTo(el, key, target) {
    var from = shown[key] || 0;
    shown[key] = target;
    if (reduce || from === target) { paint(el, target); return; }
    var t0 = performance.now();
    (function tick(t) { var p = Math.min(1, (t - t0) / 1400), v = from + (target - from) * (1 - Math.pow(1 - p, 3)); paint(el, p < 1 && target < 1e6 ? Math.round(v) : (p < 1 ? v : target)); if (p < 1) requestAnimationFrame(tick); })(t0);
  }
  var DAY = 24 * 60 * 60 * 1000;
  function applyUsage(d) {
    if (!d || typeof d.students !== "number") return;
    $$("[data-usage]").forEach(function (el) { var k = el.getAttribute("data-usage"); if (typeof d[k] === "number") animateTo(el, k, d[k]); });
    var base = $("#unote-base"), live = $("#unote-live"), dot = $(".live-dot"), tm = $("#unote-time");
    if (base) base.hidden = true; if (live) live.hidden = false; if (dot) dot.hidden = false;
    if (tm && d.computedAt) { tm.dateTime = d.computedAt; tm.textContent = new Date(d.computedAt).toLocaleDateString(root.lang === "ar" ? "ar-KW-u-nu-latn" : "en-GB", { dateStyle: "medium" }); }
  }
  /* طلبٌ واحد في اليوم على الأكثر لكل متصفح، والخادم نفسه يحسبها مرةً في اليوم: بلا كلفة. */
  function liveUsage() {
    var cached = safe(function () { return JSON.parse(localStorage.getItem("srs-usage") || "null"); });
    if (cached && cached.d) applyUsage(cached.d);
    if (cached && Date.now() - cached.at < DAY) return;
    if (!window.fetch) return;
    fetch("/api/public/audience-headline", { credentials: "omit" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || typeof d.students !== "number") return;
      safe(function () { localStorage.setItem("srs-usage", JSON.stringify({ at: Date.now(), d: d })); });
      applyUsage(d);
    }).catch(function () { /* بلا اتصال: يبقى الرصيد المعتمد مع تاريخه */ });
  }
  $$("[data-usage]").forEach(function (el) { var t = (el.querySelector(".en") || el).textContent; var m = /([\d.,]+)\s*(million)?/.exec(t); if (m) shown[el.getAttribute("data-usage")] = parseFloat(m[1].replace(/,/g, "")) * (m[2] ? 1e6 : 1); });
  liveUsage();
  setInterval(function () { if (!document.hidden) liveUsage(); }, 60 * 60 * 1000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) liveUsage(); });

  /* ── تبويب الخوارزميات: تصفية بالنوع ───────────────────────────── */
  var akind = "";
  $$("[data-akind]").forEach(function (b) { b.addEventListener("click", function () {
    akind = akind === b.dataset.akind ? "" : b.dataset.akind;
    $$("[data-akind]").forEach(function (x) { x.setAttribute("aria-pressed", String(x.dataset.akind === akind)); });
    $$("#v-algos .algo").forEach(function (a) { a.hidden = !!akind && a.dataset.kind !== akind; });
    $$("#v-algos .agroup").forEach(function (g) { g.hidden = !$$(".algo", g).some(function (a) { return !a.hidden; }); });
  }); });

  /* ── سهم العودة إلى الأعلى: يظهر بعد النزول، ويصعد بنعومة ───────── */
  var top = $("#totop");
  if (top) {
    var onScroll = function () { top.classList.toggle("show", window.scrollY > 520); };
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    top.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); });
  }

  route();
})();
