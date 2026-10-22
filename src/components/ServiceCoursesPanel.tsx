/**
 * ── مقررات الأقسام الخدمية (التي لا صحيفة لها) ─────────────────────────────────
 * تُقرأ من الصحائف الجديدة (الأشيع لكل مقرر)، ويختار المسؤول لكل رمز قسمٍ القسمَ الذي تُحفظ فيه، ثم معاينةٌ فإنشاء.
 * المقررات تُنشأ برمزها الكامل في كل كليات ذلك القسم، فلا يلتبس رقمٌ بقسمٍ آخر. بعدها يُعاد رفع الصحائف لتُربط المجموعات.
 */
import React, { useState } from "react";
import { AR, countOf } from "../utils/arabicCount";
import { FileUp, Loader2 } from "lucide-react";

export interface ServiceCourse { key: string; name: string; units: number; hours: number }
interface Group { deptKey: string; courses: ServiceCourse[] }
interface Row { deptKey: string; section: string; sites: number; created: number; existing: number; names: string[] }

/** الأشيعُ بين الصحائف لكل مقرر؛ ولا أغلبية له يُترك. */
export function voteServiceCourses(lists: Array<Array<[string, string, number, number]>>): { winners: ServiceCourse[]; ambiguous: string[] } {
  const votes = new Map<string, Map<string, { count: number; name: string; units: number; hours: number }>>();
  for (const list of lists) for (const [key, name, units, hours] of list) {
    const sig = `${name}|${units}|${hours}`, bucket = votes.get(key) || new Map();
    bucket.set(sig, { count: (bucket.get(sig)?.count || 0) + 1, name, units, hours }); votes.set(key, bucket);
  }
  const winners: ServiceCourse[] = [], ambiguous: string[] = [];
  for (const [key, bucket] of votes) {
    const ranked = [...bucket.values()].sort((a, b) => b.count - a.count);
    if (ranked.length > 1 && ranked[0].count === ranked[1].count) ambiguous.push(key); else winners.push({ key, name: ranked[0].name, units: ranked[0].units, hours: ranked[0].hours });
  }
  return { winners, ambiguous: ambiguous.sort() };
}

const post = async (url: string, body: unknown) => {
  const response = await fetch(url, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({} as any));
  if (!response.ok) throw new Error(data.error || "تعذّر");
  return data;
};

export default function ServiceCoursesPanel({ targets, winners, onWinners }: { targets: Array<{ sectionId: number; label: string }>; winners: ServiceCourse[]; onWinners: (winners: ServiceCourse[]) => void }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [assign, setAssign] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState("");
  const [working, setWorking] = useState("");
  const run = async (label: string, job: () => Promise<void>) => { if (working) return; setWorking(label); setMsg(""); try { await job(); } catch (e: any) { setMsg(String(e?.message || "تعذّر")); } finally { setWorking(""); } };

  const load = async (list: ServiceCourse[]) => {
    const data = await post("/api/plan-review/service-courses/groups", { courses: list });
    setGroups(data.groups || []); setRows(null);
  };
  const readFiles = async (files: File[]) => {
    const lists: Array<Array<[string, string, number, number]>> = [];
    for (const file of files) {
      const response = await fetch("/api/plan-review/sheet/scan", { method: "POST", credentials: "include", headers: { "content-type": "application/octet-stream" }, body: file });
      const data = await response.json().catch(() => ({} as any));
      if (response.ok && data.isNew && Array.isArray(data.others)) lists.push(data.others);
    }
    const { winners: voted } = voteServiceCourses(lists);
    onWinners(voted); await load(voted);
  };
  const payload = () => ({ courses: winners, assignments: Object.entries(assign).filter(([, id]) => id).map(([deptKey, sectionId]) => ({ deptKey, sectionId })) });
  const preview = async () => { const data = await post("/api/plan-review/service-courses/apply", { ...payload(), dryRun: true }); setRows(data.report || []); };
  const create = async () => {
    const data = await post("/api/plan-review/service-courses/apply", { ...payload(), dryRun: false });
    setRows(data.report || []); setMsg(`أُنشئت ${countOf(Number(data.created || 0), AR.course)}. أعد رفع الصحائف الآن لتُربط المجموعات.`);
  };

  return (
    <div className="pr-sheet-result pr-sheet-service" role="group" aria-label="مقررات الأقسام الخدمية">
      <b>مقررات الأقسام الخدمية</b>
      <small>أقسامٌ بلا صحائف تدخل مقرراتُها مجموعاتِ الثقافة العامة. اختر لكل رمزٍ قسمَه ثم عاين فأنشئ.</small>
      <div>
        <label className="btn btn-secondary">
          <FileUp aria-hidden="true" size={16} /> اقرأ الصحائف الجديدة (بلا كتابة)
          <input type="file" accept="application/pdf,.pdf" multiple hidden disabled={Boolean(working)} aria-label="الصحائف الجديدة لقراءة مقررات الأقسام الخدمية" onChange={e => { const files = [...(e.target.files || [])].slice(0, 120); e.target.value = ""; void run("جارٍ قراءة الصحائف", () => readFiles(files)); }} />
        </label>
        {winners.length && !groups ? <button type="button" className="btn btn-secondary" disabled={Boolean(working)} onClick={() => void run("جارٍ التجميع", () => load(winners))} data-guide-ignore="تجميع مقررات الأقسام الخدمية المقروءة من آخر دفعة رفع">استعمل آخر دفعة رفع</button> : null}
      </div>
      {working ? <small className="pr-working" role="status" aria-live="polite"><Loader2 aria-hidden="true" className="spin" size={14} /> {working}… قد يطول</small> : null}
      {msg ? <small role="status">{msg}</small> : null}
      {groups ? (groups.length ? (
        <>
          <ul>
            {groups.map(group => (
              <li key={group.deptKey}>
                <b>رمز {group.deptKey}</b> <small>{countOf(group.courses.length, AR.course)}: {group.courses.slice(0, 4).map(course => course.name).join("، ")}{group.courses.length > 4 ? "…" : ""}</small>
                <select aria-label={`قسم الرمز ${group.deptKey}`} value={assign[group.deptKey] || 0} onChange={e => { setAssign(current => ({ ...current, [group.deptKey]: Number(e.target.value) })); setRows(null); }}>
                  <option value={0}>— اختر القسم —</option>
                  {targets.map(target => <option key={target.sectionId} value={target.sectionId}>{target.label}</option>)}
                </select>
              </li>
            ))}
          </ul>
          <div>
            <button type="button" className="btn btn-secondary" disabled={Boolean(working) || !Object.values(assign).some(Boolean)} onClick={() => void run("جارٍ المعاينة", preview)} data-guide-ignore="معاينة ما سيُنشأ من مقررات الأقسام الخدمية؛ لا تكتب شيئاً">عاين</button>
            <button type="button" className="btn btn-primary" disabled={Boolean(working) || !rows} onClick={() => { if (window.confirm("إنشاء هذه المقررات في أقسامها؟")) void run("جارٍ الإنشاء", create); }} data-guide-ignore="إنشاء مقررات الأقسام الخدمية في الأقسام المختارة بعد المعاينة">أنشئ</button>
          </div>
          {rows ? <ul>{rows.map(row => <li key={row.deptKey}><b>{row.deptKey}</b> ← {row.section} <small>({countOf(row.sites, AR.site)}) · ستُنشأ {row.created} · موجودة {row.existing}{row.names.length ? ` · مثل: ${row.names.slice(0, 3).join("، ")}` : ""}</small></li>)}</ul> : null}
        </>
      ) : <small role="status">لا مقررات خدمية ناقصة</small>) : null}
    </div>
  );
}
