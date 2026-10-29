/**
 * ── صفحة التحقق من الورقة المطبوعة (/v/:code) ───────────────────────────────
 *
 * يصلها من يمسح الختم في ذيل الشامل أو تقرير التغييرات. صفحةٌ عامة بلا دخول
 * ولا سكربت، تقول أمراً واحداً بوضوح: هل هذه الورقة ما زالت مطابقةً للجدول؟
 * وإن لم تكن، فأيُّ سطرٍ فيها تغيّر.
 *
 * لا تعرض اسماً ولا رقماً مدنياً ولا قيمةً جديدة: رقمَ المقرر واسمَه والشعبة
 * وأسماءَ الحقول التي تغيّرت فقط — وهو ما في الورقة نفسها لمن يمسكها.
 */
import { AR, countOf } from "../utils/arabicCount";
import { formatReportStampCode } from "../utils/reportStamp";

export interface ReportStampLine { course: string; name: string; section: string; fields?: string[]; beforePrint?: boolean }

export interface ReportStampView {
  state: "ask" | "invalid" | "unknown" | "error" | "current" | "outdated";
  code?: string;
  typed?: string;
  kindLabel?: string;
  sectionLine?: string;
  collegeLine?: string;
  termName?: string;
  rowCount?: number;
  firstPrintedAt?: string;
  lastPrintedAt?: string;
  printCount?: number;
  approvalLine?: string;
  draftChanged?: boolean;
  changed?: ReportStampLine[];
  removed?: ReportStampLine[];
  added?: ReportStampLine[];
}

const esc = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const when = (iso?: string): string => {
  const date = new Date(String(iso || ""));
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("ar-KW-u-nu-latn", { timeZone: "Asia/Kuwait", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
  } catch { return date.toISOString().slice(0, 16).replace("T", " "); }
};

const LIST_LIMIT = 60;

function lineList(title: string, lines: ReportStampLine[] | undefined, tone: "changed" | "removed" | "added"): string {
  if (!lines?.length) return "";
  const shown = lines.slice(0, LIST_LIMIT).map(line => {
    const detail = line.beforePrint
      ? "تغيّر قبل الطباعة، والشاشة التي طُبعت منها لم تكن محدّثة"
      : (line.fields || []).join("، ");
    return `<li><span class="row"><b dir="ltr">${esc(line.course || "—")}</b> ${esc(line.name || "مقرر")} <span class="sec">· شعبة <bdi dir="ltr">${esc(line.section || "—")}</bdi></span></span>${detail ? `<small>${esc(detail)}</small>` : ""}</li>`;
  }).join("");
  const more = lines.length > LIST_LIMIT ? `<p class="more">و${countOf(lines.length - LIST_LIMIT, AR.appointment)} غيرها.</p>` : "";
  return `<section class="list ${tone}"><h2>${esc(title)} <span>${lines.length}</span></h2><ul>${shown}</ul>${more}</section>`;
}

const ask = (typed = ""): string => `<form class="ask" method="get" action="/v">
<label for="c">رمز الختم المطبوع بجانب المربّع في ذيل الورقة</label>
<div class="ask-row"><input id="c" name="c" dir="ltr" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="K7Q2-9XMD" value="${esc(typed)}" required><button type="submit">تحقّق</button></div>
</form>`;

const CSS = `
:root{--bg:#f4f6f5;--card:#fff;--ink:#16211d;--muted:#5d6a64;--line:#dfe6e2;--brand:#12463c;--ok:#0f6b4f;--ok-soft:#e6f4ee;--bad:#8e2020;--bad-soft:#fbeceb;--warn:#7a5208;--warn-soft:#fff4d6}
@media (prefers-color-scheme:dark){:root{--bg:#0f1513;--card:#17201d;--ink:#e8eeeb;--muted:#9fb0a8;--line:#2a3632;--brand:#8fd1bb;--ok:#7fd3b2;--ok-soft:#173129;--bad:#f2a7a2;--bad-soft:#3a1d1c;--warn:#f0c66b;--warn-soft:#352a12}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Segoe UI",Tahoma,"Noto Sans Arabic",system-ui,sans-serif;line-height:1.7}
.wrap{max-width:640px;margin:0 auto;padding:22px 16px 48px}
.brand{margin:0 0 14px;color:var(--muted);font-size:12.5px;letter-spacing:.12em}
.brand b{color:var(--brand);letter-spacing:.18em}
.verdict{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;align-items:center;padding:20px;border-radius:20px;border:1px solid var(--line);background:var(--card)}
.verdict i{grid-row:span 2;display:grid;place-items:center;inline-size:52px;block-size:52px;border-radius:50%;font-style:normal;font-size:26px;font-weight:800}
.verdict h1{margin:0;font-size:clamp(20px,5.4vw,26px);line-height:1.35}
.verdict p{margin:0;color:var(--muted);font-size:14.5px}
.verdict.current{background:var(--ok-soft);border-color:transparent}.verdict.current i{background:var(--ok);color:var(--card)}.verdict.current h1{color:var(--ok)}
.verdict.outdated{background:var(--bad-soft);border-color:transparent}.verdict.outdated i{background:var(--bad);color:var(--card)}.verdict.outdated h1{color:var(--bad)}
.verdict.unknown i{background:var(--line);color:var(--muted)}
.counts{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0}
.counts span{padding:3px 12px;border-radius:999px;background:var(--card);border:1px solid var(--line);font-size:13px;font-weight:700}
.note{margin:12px 0 0;padding:10px 14px;border-radius:12px;background:var(--warn-soft);color:var(--warn);font-size:14px}
.card{margin-top:14px;padding:6px 18px;border-radius:18px;background:var(--card);border:1px solid var(--line)}
.facts{margin:0;display:grid;grid-template-columns:auto 1fr;gap:0 16px}
.facts dt,.facts dd{margin:0;padding:9px 0;border-bottom:1px solid var(--line);font-size:14.5px}
.facts dt{color:var(--muted)}.facts dd{font-weight:650}
.facts dt:nth-last-of-type(1),.facts dd:last-of-type{border-bottom:0}
.code{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.06em}
.list{margin-top:14px;padding:14px 18px;border-radius:18px;background:var(--card);border:1px solid var(--line)}
.list h2{margin:0 0 6px;font-size:16px;display:flex;align-items:center;gap:8px}
.list h2 span{font-size:12.5px;padding:1px 9px;border-radius:999px;background:var(--bg);color:var(--muted)}
.list ul{margin:0;padding:0;list-style:none}
.list li{padding:9px 0;border-top:1px solid var(--line);display:grid;gap:2px}
.list li:first-child{border-top:0}
.list .row{font-size:14.5px}.list .row b{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;margin-inline-end:4px}
.list .sec{color:var(--muted)}
.list small{color:var(--bad);font-size:13px}
.list.added small,.list.removed small{color:var(--muted)}
.more{margin:8px 0 0;color:var(--muted);font-size:13px}
.ask{margin-top:14px;padding:16px 18px;border-radius:18px;background:var(--card);border:1px solid var(--line);display:grid;gap:10px}
.ask label{font-size:14px;color:var(--muted)}
.ask-row{display:flex;gap:8px}
.ask input{flex:1;min-inline-size:0;font:inherit;font-size:18px;letter-spacing:.08em;padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);text-transform:uppercase}
.ask button{font:inherit;font-weight:700;padding:10px 18px;border-radius:12px;border:0;background:var(--brand);color:var(--card);cursor:pointer}
.ask input:focus-visible,.ask button:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
footer{margin-top:26px;color:var(--muted);font-size:12.5px;text-align:center}
`;

export function reportStampPage(view: ReportStampView): string {
  const code = view.code ? formatReportStampCode(view.code) : "";
  let body = "";
  if (view.state === "ask" || view.state === "invalid" || view.state === "unknown" || view.state === "error") {
    const title = view.state === "ask" ? "التحقق من ورقة مطبوعة" : view.state === "invalid" ? "الرمز غير صحيح" : view.state === "error" ? "تعذّر التحقق الآن" : "لم نجد هذا الختم";
    const lead = view.state === "ask"
      ? "اكتب الرمز لتعرف إن كانت الورقة ما زالت مطابقةً للجدول."
      : view.state === "invalid"
        ? "رمز الختم ثمانية أحرف وأرقام، مثل K7Q2-9XMD. راجعه وأعد المحاولة."
        : view.state === "error"
          ? "لم يصل النظام إلى الجدول في هذه اللحظة. أعد المحاولة بعد قليل."
          : `لا يعرف النظام الختم ${code}. قد يكون الرمز كُتب خطأً، أو طُبعت الورقة من النسخة التجريبية، أو لم يصل تسجيلها بعد. اطلب من القسم نسخةً حديثة.`;
    body = `<div class="verdict unknown"><i aria-hidden="true">?</i><h1>${esc(title)}</h1><p>${esc(lead)}</p></div>${ask(view.state === "invalid" ? view.typed : code)}`;
  } else {
    const current = view.state === "current";
    const counts = [
      view.changed?.length ? `تعدّل ${view.changed.length}` : "",
      view.removed?.length ? `حُذف ${view.removed.length}` : "",
      view.added?.length ? `أُضيف ${view.added.length}` : "",
    ].filter(Boolean).map(item => `<span>${esc(item)}</span>`).join("");
    const facts: Array<[string, string]> = [
      ["الوثيقة", esc(view.kindLabel || "—")],
      ["القسم", esc(view.sectionLine || "—")],
      ["الكلية", esc(view.collegeLine || "—")],
      ["الفصل", esc(view.termName || "—")],
      ["المواعيد فيها", esc(countOf(Number(view.rowCount) || 0, AR.appointment))],
      ["طُبعت أول مرة", esc(when(view.firstPrintedAt))],
    ];
    if ((view.printCount || 0) > 1) facts.push(["آخر طباعة", `${esc(when(view.lastPrintedAt))} <span class="sec">(${esc(countOf(Number(view.printCount), AR.visit))})</span>`]);
    if (view.approvalLine) facts.push(["حال الجدول الآن", esc(view.approvalLine)]);
    facts.push(["الختم", `<span class="code" dir="ltr">${esc(code)}</span>`]);
    body = `<div class="verdict ${current ? "current" : "outdated"}"><i aria-hidden="true">${current ? "✓" : "!"}</i>`
      + `<h1>${current ? "الورقة مطابقة للجدول الآن" : "تغيّر الجدول بعد طباعة هذه الورقة"}</h1>`
      + `<p>${current ? "لم يتغيّر شيء من مواعيدها منذ طُبعت." : "لا تعتمد عليها؛ اطلب من القسم نسخةً محدّثة."}</p></div>`
      + (counts ? `<div class="counts">${counts}</div>` : "")
      + (view.draftChanged ? `<p class="note">واعتُمد بعدها ملفٌّ أحدث من الهيئة، فقد لا تطابقه الأرقام المرجعية في الورقة.</p>` : "")
      + lineList("تغيّر في الورقة", view.changed, "changed")
      + lineList("حُذف من الجدول", view.removed, "removed")
      + lineList("أُضيف إلى الجدول بعدها", view.added, "added")
      + `<div class="card"><dl class="facts">${facts.map(([term, value]) => `<dt>${esc(term)}</dt><dd>${value}</dd>`).join("")}</dl></div>`;
  }
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light dark">
<title>${esc(code ? `ختم ${code}` : "التحقق من ورقة مطبوعة")} · SCHEDULE</title><link rel="icon" href="/schedule-icon.svg" type="image/svg+xml">
<style>${CSS}</style></head><body><main class="wrap">
<p class="brand"><b>SCHEDULE</b> · التحقق من ورقة مطبوعة</p>
${body}
<footer>تعرض هذه الصفحة ما يلزم لمطابقة الورقة فقط، بلا أسماء ولا أرقام مدنية.</footer>
</main></body></html>`;
}
