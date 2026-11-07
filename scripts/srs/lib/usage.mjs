/**
 * الاستخدام الفعلي: سنة بدء التشغيل وأرقام الجمهور التي أقرّتها إدارة النظام، تُقرأ من
 * src/utils/audienceBaseline.ts نفسه (المصدر الذي تعرضه لوحة الجمهور)، فلا يُكتب رقمٌ مرتين.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./common.mjs";

export const USAGE_SOURCE = "src/utils/audienceBaseline.ts";

export function readUsage() {
  const src = fs.readFileSync(path.join(ROOT, USAGE_SOURCE), "utf8");
  const num = key => { const m = new RegExp(`\\b${key}:\\s*([\\d_]+)`).exec(src); if (!m) throw new Error(`${USAGE_SOURCE}: لا قيمة لـ ${key}`); return Number(m[1].replace(/_/g, "")); };
  const asOf = /asOf:\s*"(\d{4}-\d{2}-\d{2})"/.exec(src)?.[1];
  if (!asOf) throw new Error(`${USAGE_SOURCE}: لا تاريخ asOf`);
  return {
    since: num("since"), asOf,
    students: num("students"), visits: num("visits"), instructors: num("instructors"),
    instructorOpens: num("instructorOpens"), instructorOpenRate: num("instructorOpenRate"),
  };
}

const fmtNum = n => n.toLocaleString("en-US");
const compact = (n, lang) => {
  if (n >= 1_000_000) { const v = (n / 1_000_000).toFixed(1).replace(/\.0$/, ""); return lang === "ar" ? `${v} مليون` : `${v} million`; }
  return fmtNum(n);
};

/** البطاقات بترتيبها: «حوالي» للتقدير، و«أكثر من» للحدّ الأدنى، كما تقول لوحة الجمهور نفسها. */
export function usageCards(u) {
  return [
    { key: "students", icon: "graduation-cap", kind: "about", value: l => compact(u.students, l), label: { ar: "طالب استفاد من النظام", en: "students served" } },
    { key: "visits", icon: "mouse-pointer-click", kind: "min", value: l => compact(u.visits, l), label: { ar: "زيارة", en: "visits" } },
    { key: "instructors", icon: "presentation", kind: "about", value: l => compact(u.instructors, l), label: { ar: "عضو هيئة تدريس", en: "faculty members" } },
    { key: "instructorOpens", icon: "id-card", kind: "min", value: l => compact(u.instructorOpens, l), label: { ar: "فتحٍ لبطاقات الأساتذة", en: "faculty card opens" } },
    { key: "", icon: "badge-percent", kind: "min", value: () => `${u.instructorOpenRate}%`, label: { ar: "من الأساتذة يفتحون بطاقاتهم", en: "of faculty open their card" } },
  ];
}
export const USAGE_PREFIX = { about: { ar: "حوالي", en: "about" }, min: { ar: "أكثر من", en: "over" } };
