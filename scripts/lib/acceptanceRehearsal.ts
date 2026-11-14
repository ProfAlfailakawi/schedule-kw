/**
 * ── «جولة القبول»: الجزء النقيّ ────────────────────────────────────────────────
 *
 * نموذجُ نتيجة الخطوة، وفهرسُ الخطوات (المصدرُ الوحيد لمعرّفاتها)، والتلخيص، ورمزُ الخروج، وصفحةُ التقرير.
 * لا خادمَ هنا ولا متصفحاً ولا ملفاتٍ: يستعمله scripts/acceptance-rehearsal.ts ويفحصه tests/acceptance-rehearsal-audit.ts.
 *
 * القاعدة: ما لا يستطيع الديمو إثباتَه (تسليمُ تنبيهٍ حقيقي، جهازٌ حقيقي، موظفٌ وطالبٌ على مخزنين) يُسجَّل «يحتاج جولةً حقيقية»
 * ولا يُسجَّل نجاحاً أبداً. والوثيقة docs/ACCEPTANCE_ROUND.md تحمل المعرّفاتِ نفسها.
 */

export type StepStatus = "pass" | "warn" | "fail" | "skip";
export type RoleId = "student" | "recovery" | "teacher" | "department" | "admin";

export interface RoleDef { id: RoleId; title: string; icon: string }
export interface StepDef {
  id: string;
  role: RoleId;
  title: string;
  /** auto: يشغّله السكربت على الديمو · manual: يحتاج بيانات أو جهازاً حقيقياً فيُسجَّل ⏭️ دائماً. */
  mode: "auto" | "manual";
  /** لخطوة manual: لماذا لا يثبتها الديمو. */
  skipReason?: string;
}

export const ROLES: readonly RoleDef[] = [
  { id: "student", title: "الطالب · مساري", icon: "🎓" },
  { id: "recovery", title: "نسيتُ رمزي · استعادةٌ عبر القسم", icon: "🔑" },
  { id: "teacher", title: "الأستاذ · كرت الجدول", icon: "👩‍🏫" },
  { id: "department", title: "القسم · وارد الأساتذة والقاعات", icon: "🏛️" },
  { id: "admin", title: "المسؤول · سلامة النظام", icon: "🩺" },
];

export const STEPS: readonly StepDef[] = [
  { id: "S1", role: "student", title: "فتح مساري والدخول", mode: "auto" },
  { id: "S2", role: "student", title: "إنشاء الملف: الكلية ثم القسم ثم الصحيفة", mode: "auto" },
  { id: "S3", role: "student", title: "حفظ الرغبات", mode: "auto" },
  { id: "S4", role: "student", title: "«محاضرتك القادمة»", mode: "auto" },
  { id: "S5", role: "student", title: "«فعّل التنبيهات» وتسليمُ تنبيهٍ حقيقي", mode: "manual", skipReason: "تسليمُ التنبيه يحتاج مفاتيح الإنتاج وجهازاً حقيقياً، والديمو لا يرسل شيئاً." },
  { id: "S6", role: "student", title: "اشتراك التقويم", mode: "auto" },
  { id: "S7", role: "student", title: "«شارك مرشدك» والصفحة للقراءة فقط", mode: "auto" },
  { id: "R1", role: "recovery", title: "بطاقة «رمز استعادة لطالب» في كشف التسجيل", mode: "auto" },
  { id: "R2", role: "recovery", title: "الموظف يُصدر الرمز لطالبٍ حقيقي", mode: "manual", skipReason: "ملفُّ الطالب والموظفُ في مخزنين منفصلين في الديمو، فلا يُثبت الديمو الإصدارَ عبر الاثنين." },
  { id: "R3", role: "recovery", title: "الطالب يستعيد ملفّه برمز القسم", mode: "manual", skipReason: "يحتاج رمزاً أصدره موظفٌ لطالبٍ حقيقي (بيانات حقيقية)." },
  { id: "T1", role: "teacher", title: "فتح الكرت: لا قاعةَ ولا مبنى", mode: "auto" },
  { id: "T2", role: "teacher", title: "نقل محاضرة واحدة والأوقات المقترحة", mode: "auto" },
  { id: "T3", role: "teacher", title: "التوقيع بالرقم المدني", mode: "auto" },
  { id: "T4", role: "teacher", title: "«الحركة» بالعربية", mode: "auto" },
  { id: "T5", role: "teacher", title: "صفحة التحقق من التوقيع", mode: "auto" },
  { id: "D1", role: "department", title: "شريط «نبض الكروت»", mode: "auto" },
  { id: "D2", role: "department", title: "«ذكّر الباقين»", mode: "auto" },
  { id: "D3", role: "department", title: "لوحة «قاعات بلا سعة»", mode: "auto" },
  { id: "D4", role: "department", title: "إدخال سعة قاعة", mode: "auto" },
  { id: "A1", role: "admin", title: "«سلامة النظام» و«تحقق الآن»", mode: "auto" },
];

export const stepById = (id: string): StepDef | undefined => STEPS.find(step => step.id === id);

export interface Shot { caption: string; /** صورةٌ JPEG مرمَّزة base64 بلا بادئة data: */ data: string; width: number }
export type IssueKind = "console" | "pageerror" | "http" | "requestfailed";
export interface Issue { kind: IssueKind; text: string }
export interface StepResult {
  id: string;
  status: StepStatus;
  /** سطرٌ واحد يقول ما حدث (أو لماذا لم يُجرَّب). */
  note: string;
  /** ما فُحص بالتفصيل، سطراً سطراً. */
  details: string[];
  shots: Shot[];
  issues: Issue[];
  ms: number;
}

export const STATUS_META: Record<StepStatus, { icon: string; label: string; color: string }> = {
  pass: { icon: "✅", label: "نجحت", color: "#1f7a4d" },
  warn: { icon: "⚠️", label: "ملاحظة", color: "#a96a00" },
  fail: { icon: "❌", label: "فشلت", color: "#b3261e" },
  skip: { icon: "⏭️", label: "يحتاج بيانات أو جهازاً حقيقياً", color: "#5c6a7a" },
};
const ORDER: StepStatus[] = ["pass", "warn", "fail", "skip"];

/** الأسوأ بين نتيجتين (فشل > ملاحظة > نجاح)؛ والتخطّي لا يدخل المقارنة. */
export function worseOf(a: StepStatus, b: StepStatus): StepStatus {
  const rank: Record<StepStatus, number> = { pass: 0, skip: 0, warn: 1, fail: 2 };
  return rank[b] > rank[a] ? b : a;
}

/** الأخطاء التي تُنزل خطوةً ناجحةً إلى «ملاحظة»: استثناءٌ في الصفحة، أو خطأ كونسول، أو رفضُ خادم (5xx) أو انقطاعُ طلب. */
export function issuesDowngrade(issues: readonly Issue[]): boolean {
  return issues.some(issue => issue.kind === "pageerror" || issue.kind === "console" || issue.kind === "requestfailed" || (issue.kind === "http" && /^5\d\d\b/.test(issue.text)));
}

export interface Summary {
  total: number;
  counts: Record<StepStatus, number>;
  /** الخطوات التي شغّلها السكربت فعلاً (كل ما ليس «تخطّي»). */
  automated: number;
  /** نسبةُ الناجحة نظيفةً من المشغَّلة، عددٌ صحيح 0..100 (بلا مشغَّلة = 0). */
  percentClean: number;
  issueCount: number;
  failedIds: string[];
}

export function summarize(results: readonly StepResult[]): Summary {
  const counts: Record<StepStatus, number> = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const result of results) counts[result.status]++;
  const automated = counts.pass + counts.warn + counts.fail;
  return {
    total: results.length,
    counts,
    automated,
    percentClean: automated ? Math.round((counts.pass / automated) * 100) : 0,
    issueCount: results.reduce((sum, result) => sum + result.issues.length, 0),
    failedIds: results.filter(result => result.status === "fail").map(result => result.id),
  };
}

/** صفرٌ إلا إن فشلت خطوةٌ يستطيع الديمو إثباتَها. «ملاحظة» و«تخطّي» لا يُسقطان الأمر. */
export function exitCodeFor(results: readonly StepResult[]): number {
  return results.some(result => result.status === "fail") ? 1 : 0;
}

/** نتيجةٌ لكل خطوة في الفهرس، بالترتيب: ما لم يُسجَّل يُعدّ فاشلاً (لا يُترك فراغٌ يوحي بالنجاح). */
export function completeResults(recorded: readonly StepResult[]): StepResult[] {
  const byId = new Map(recorded.map(result => [result.id, result]));
  return STEPS.map(step => byId.get(step.id) || { id: step.id, status: "fail" as const, note: "لم تُسجَّل نتيجةٌ لهذه الخطوة.", details: [], shots: [], issues: [], ms: 0 });
}

/* ── اتساق الوثيقة والسكربت ── */

/** معرّفات الخطوات في جداول الوثيقة: الخليةُ الأولى من صفٍّ في جدول، مثل «| S1 |». */
export function parseDocStepIds(markdown: string): string[] {
  return [...markdown.matchAll(/^\|\s*`?\*{0,2}([A-Z]\d{1,2})\*{0,2}`?\s*\|/gm)].map(match => match[1]);
}

/** معرّفات الخطوات في السكربت: run("S1", …) أو runWidths("A1", …) للمشغَّلة، و skip("S5", …) لما يحتاج جولةً حقيقية. */
export function parseScriptStepIds(source: string): { run: string[]; skip: string[] } {
  const grab = (verb: string) => [...source.matchAll(new RegExp(`\\b${verb}\\(\\s*"([A-Z]\\d{1,2})"`, "g"))].map(match => match[1]);
  return { run: grab("run(?:Widths)?"), skip: grab("skip") };
}

/* ── التقرير ── */

export const escapeHtml = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));

const pad = (n: number) => String(n).padStart(2, "0");
/** تاريخٌ ووقت بأرقامٍ لاتينية ثابتة الصيغة (UTC)، لا يتبع لغة الجهاز. */
export function formatStamp(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  const seconds = ms / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)} s` : `${Math.floor(seconds / 60)}m ${pad(Math.round(seconds % 60))}s`;
}

export interface ReportMeta {
  generatedAt: Date;
  durationMs: number;
  browser: string;
  widths: readonly number[];
  /** لا عناوين ولا منافذ: يكفي أن الخادم محلّيٌّ وتجريبي. */
  serverNote: string;
}

/** قوسُ حلقة الملخّص: يبدأ من الأعلى، ويطول بنسبة العدد. */
export function ringArcs(counts: Record<StepStatus, number>, radius = 54): Array<{ status: StepStatus; dash: string; offset: number }> {
  const total = ORDER.reduce((sum, status) => sum + counts[status], 0);
  const circumference = 2 * Math.PI * radius;
  let used = 0;
  const arcs: Array<{ status: StepStatus; dash: string; offset: number }> = [];
  for (const status of ORDER) {
    if (!counts[status] || !total) continue;
    const length = (counts[status] / total) * circumference;
    arcs.push({ status, dash: `${length.toFixed(2)} ${(circumference - length).toFixed(2)}`, offset: -used });
    used += length;
  }
  return arcs;
}

const ISSUE_LABEL: Record<IssueKind, string> = { console: "كونسول", pageerror: "استثناء صفحة", http: "طلب مرفوض", requestfailed: "طلب فشل" };

export function renderReport(results: readonly StepResult[], meta: ReportMeta): string {
  const summary = summarize(results);
  const arcs = ringArcs(summary.counts);
  const verdict = summary.counts.fail ? "فشلت خطوات يثبتها الديمو" : summary.counts.warn ? "نجحت كلُّ الخطوات مع ملاحظات" : "نجحت كلُّ الخطوات التي يثبتها الديمو";
  const verdictTone = summary.counts.fail ? "fail" : summary.counts.warn ? "warn" : "pass";

  const stepCard = (result: StepResult): string => {
    const def = stepById(result.id);
    const meta = STATUS_META[result.status];
    const shots = result.shots.length
      ? `<div class="shots">${result.shots.map(shot => `<figure><img loading="lazy" alt="${escapeHtml(shot.caption)}" src="data:image/jpeg;base64,${shot.data}"><figcaption>${escapeHtml(shot.caption)} · ${shot.width}px</figcaption></figure>`).join("")}</div>`
      : "";
    const details = result.details.length ? `<ul class="det">${result.details.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : "";
    const issues = result.issues.length
      ? `<details class="iss"><summary>أخطاءٌ ظهرت في هذه الخطوة (${result.issues.length})</summary><ul>${result.issues.map(issue => `<li><b>${ISSUE_LABEL[issue.kind]}</b> <code dir="ltr">${escapeHtml(issue.text)}</code></li>`).join("")}</ul></details>`
      : "";
    return `<article class="step" data-s="${result.status}" id="step-${escapeHtml(result.id)}">
  <header><span class="sid">${escapeHtml(result.id)}</span><h3>${escapeHtml(def?.title || result.id)}</h3><span class="badge" data-s="${result.status}">${meta.icon} ${escapeHtml(meta.label)}</span></header>
  <p class="note">${escapeHtml(result.note)}</p>${details}${shots}${issues}
  <footer>${formatDuration(result.ms)}</footer>
</article>`;
  };

  const roleSection = (role: RoleDef): string => {
    const rows = results.filter(result => stepById(result.id)?.role === role.id);
    if (!rows.length) return "";
    return `<section class="role"><h2><span>${role.icon}</span>${escapeHtml(role.title)}<small>${rows.map(row => STATUS_META[row.status].icon).join(" ")}</small></h2>${rows.map(stepCard).join("\n")}</section>`;
  };

  const allIssues = results.flatMap(result => result.issues.map(issue => ({ id: result.id, ...issue })));
  const issueTable = allIssues.length
    ? `<section class="role"><h2><span>🧯</span>كلُّ الأخطاء التي رُصدت<small>${allIssues.length}</small></h2><table><thead><tr><th>الخطوة</th><th>النوع</th><th>النص</th></tr></thead><tbody>${allIssues.map(issue => `<tr><td>${escapeHtml(issue.id)}</td><td>${ISSUE_LABEL[issue.kind]}</td><td dir="ltr"><code>${escapeHtml(issue.text)}</code></td></tr>`).join("")}</tbody></table></section>`
    : `<section class="role"><h2><span>🧯</span>الأخطاء التي رُصدت<small>0</small></h2><p class="note">لم يُرصد استثناءُ صفحةٍ ولا خطأُ كونسول ولا طلبٌ مرفوض أثناء الجولة.</p></section>`;

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>تقرير جولة القبول</title>
<style>
:root{--bg:#f4f6f8;--card:#fff;--ink:#17202a;--muted:#5c6a7a;--line:#dde3ea;--pass:#1f7a4d;--warn:#a96a00;--fail:#b3261e;--skip:#5c6a7a;--accent:#0b5cad}
@media (prefers-color-scheme:dark){:root{--bg:#0f1419;--card:#18202a;--ink:#e8edf2;--muted:#9aa8b8;--line:#2a3542;--pass:#46c27f;--warn:#f0b04a;--fail:#ff7b72;--skip:#9aa8b8;--accent:#6cb2ff}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 "Noto Sans Arabic","IBM Plex Sans Arabic",Tahoma,system-ui,sans-serif}
main{max-inline-size:980px;margin-inline:auto;padding:24px 16px 64px}
.hero{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:20px;display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:center}
@media (max-width:560px){.hero{grid-template-columns:1fr;justify-items:center;text-align:center}}
.ring{inline-size:150px;block-size:150px;position:relative}
.ring svg{inline-size:100%;block-size:100%;transform:rotate(-90deg)}
.ring circle{fill:none;stroke-width:14}
.ring .bg{stroke:var(--line)}
.ring .a{stroke-linecap:butt}
.ring .a[data-s=pass]{stroke:var(--pass)}.ring .a[data-s=warn]{stroke:var(--warn)}.ring .a[data-s=fail]{stroke:var(--fail)}.ring .a[data-s=skip]{stroke:var(--skip);opacity:.45}
.ring b{position:absolute;inset:0;display:grid;place-items:center;font-size:34px}
.ring small{position:absolute;inset-inline:0;bottom:34px;text-align:center;color:var(--muted);font-size:12px}
h1{margin:0 0 4px;font-size:26px}
.verdict{display:inline-block;padding:2px 12px;border-radius:99px;font-weight:700;margin:6px 0}
.verdict[data-s=pass]{background:color-mix(in srgb,var(--pass) 16%,transparent);color:var(--pass)}
.verdict[data-s=warn]{background:color-mix(in srgb,var(--warn) 16%,transparent);color:var(--warn)}
.verdict[data-s=fail]{background:color-mix(in srgb,var(--fail) 16%,transparent);color:var(--fail)}
.kpis{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 0;padding:0;list-style:none}
.kpis li{padding:2px 12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);font-size:14px}
.meta{color:var(--muted);font-size:13px;margin:8px 0 0}
.role{margin-block-start:28px}
.role h2{display:flex;align-items:center;gap:10px;font-size:19px;margin:0 0 10px}
.role h2 small{margin-inline-start:auto;font-size:14px;letter-spacing:2px}
.step{background:var(--card);border:1px solid var(--line);border-inline-start:6px solid var(--skip);border-radius:14px;padding:12px 16px;margin-block-end:10px}
.step[data-s=pass]{border-inline-start-color:var(--pass)}.step[data-s=warn]{border-inline-start-color:var(--warn)}.step[data-s=fail]{border-inline-start-color:var(--fail)}
.step header{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.step h3{margin:0;font-size:16px;flex:1 1 200px}
.sid{font:700 13px ui-monospace,Menlo,monospace;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:0 8px}
.badge{font-size:13px;font-weight:700;padding:1px 10px;border-radius:99px;border:1px solid currentColor}
.badge[data-s=pass]{color:var(--pass)}.badge[data-s=warn]{color:var(--warn)}.badge[data-s=fail]{color:var(--fail)}.badge[data-s=skip]{color:var(--skip)}
.note{margin:6px 0}
.det{margin:4px 0;padding-inline-start:20px;color:var(--muted);font-size:14px}
.shots{display:flex;gap:10px;overflow-x:auto;padding:6px 0}
.shots figure{margin:0;flex:0 0 auto}
.shots img{display:block;max-block-size:340px;inline-size:auto;border-radius:10px;border:1px solid var(--line);background:#fff}
.shots figcaption{font-size:12px;color:var(--muted);text-align:center;margin-block-start:2px}
.iss{margin-block-start:6px;font-size:13px}
.iss ul{margin:4px 0;padding-inline-start:20px}
code{font:12px ui-monospace,Menlo,monospace;word-break:break-all;white-space:pre-wrap}
footer{color:var(--muted);font-size:12px;text-align:end}
table{inline-size:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:13px}
th,td{padding:6px 10px;border-block-end:1px solid var(--line);text-align:start;vertical-align:top}
.legend{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0 0;color:var(--muted);font-size:13px}
</style>
</head>
<body>
<main>
<section class="hero" aria-label="الملخص">
  <div class="ring" role="img" aria-label="${summary.counts.pass} من ${summary.automated} خطوة مشغَّلة نجحت نظيفة">
    <svg viewBox="0 0 140 140"><circle class="bg" cx="70" cy="70" r="54"/>${arcs.map(arc => `<circle class="a" data-s="${arc.status}" cx="70" cy="70" r="54" stroke-dasharray="${arc.dash}" stroke-dashoffset="${arc.offset.toFixed(2)}"/>`).join("")}</svg>
    <b>${summary.percentClean}%</b>
  </div>
  <div>
    <h1>تقرير جولة القبول</h1>
    <span class="verdict" data-s="${verdictTone}">${escapeHtml(verdict)}</span>
    <ul class="kpis">
      <li>✅ نجحت: ${summary.counts.pass}</li>
      <li>⚠️ ملاحظات: ${summary.counts.warn}</li>
      <li>❌ فشلت: ${summary.counts.fail}</li>
      <li>⏭️ تحتاج جولةً حقيقية: ${summary.counts.skip}</li>
      <li>🧯 أخطاء مرصودة: ${summary.issueCount}</li>
    </ul>
    <p class="meta">${escapeHtml(formatStamp(meta.generatedAt))} · المدة ${escapeHtml(formatDuration(meta.durationMs))} · ${escapeHtml(meta.browser)} · العروض ${meta.widths.join(" و")}px · ${escapeHtml(meta.serverNote)}</p>
  </div>
</section>
<p class="legend"><span>✅ نجحت على الديمو</span><span>⚠️ نجحت مع ملاحظة تستحق النظر</span><span>❌ فشلت</span><span>⏭️ لا يثبتها الديمو: تُجرَّب على الموقع الحيّ بجهازٍ وبياناتٍ حقيقية (docs/ACCEPTANCE_ROUND.md)</span></p>
${ROLES.map(roleSection).join("\n")}
${issueTable}
</main>
</body>
</html>
`;
}

/** ملخّصٌ قابلٌ للقراءة الآلية: بلا صور. */
export function jsonSummary(results: readonly StepResult[], meta: ReportMeta) {
  return {
    generatedAt: meta.generatedAt.toISOString(),
    durationMs: Math.round(meta.durationMs),
    browser: meta.browser,
    widths: [...meta.widths],
    summary: summarize(results),
    exitCode: exitCodeFor(results),
    steps: results.map(result => ({ id: result.id, title: stepById(result.id)?.title || "", status: result.status, note: result.note, details: result.details, issues: result.issues, ms: Math.round(result.ms) })),
  };
}
