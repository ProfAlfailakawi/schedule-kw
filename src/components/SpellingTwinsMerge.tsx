/**
 * ── مقررٌ واحد بإملاءين: معاينة ثم دمج بتأكيد (G5) ─────────────────────────────
 * «اداره/إدارة مراكز مصادر التعلم»: لكل إملاء ما يشير إليه (📅 مواعيد · 📄 صحائف · 👥 طلبة · 📏 قواعد)،
 * يختار المسؤول المقرر الباقي والاسم المعتمد، ثم دمجٌ واحد على الخادم: تُنقل المواعيد والروابط ويُؤرشف المكرّر.
 * لا حذف صامت، وما تشير إليه بيانات الطلبة أو القواعد لا يُدمج آلياً.
 */
import React, { useState } from "react";
import { CalendarDays, FileText, Loader2, Merge, Ruler, UsersRound } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";

interface TwinCourse { id: number; code: string; name: string; schedules: number; plans: number; students: boolean; rules: boolean; mergeable: boolean; blockedBy: string }
interface TwinGroup { names: string[]; courses: TwinCourse[] }
interface TwinSection { sectionId: number; section: string; groups: TwinGroup[] }

const weight = (course: TwinCourse) => course.schedules * 4 + course.plans * 2 + (course.students ? 8 : 0) + (course.rules ? 8 : 0);

export default function SpellingTwinsMerge() {
  const [data, setData] = useState<TwinSection[] | null>(null);
  const [choice, setChoice] = useState<Record<string, { keeper: number; name: string }>>({});
  const [working, setWorking] = useState("");
  const [msg, setMsg] = useState("");
  const keyOf = (sectionId: number, group: TwinGroup) => `${sectionId}:${group.courses.map(course => course.id).sort().join("-")}`;
  const scan = async () => {
    setWorking("فحص"); setMsg("");
    try {
      const response = await fetch("/api/plan-review/sheet/spelling-twins", { credentials: "include" });
      const body = await response.json().catch(() => ({} as any));
      if (!response.ok) throw new Error(body.error || "تعذّر الفحص");
      const sections: TwinSection[] = body.sections || [];
      const next: Record<string, { keeper: number; name: string }> = {};
      for (const section of sections) for (const group of section.groups) {
        const keeper = [...group.courses].sort((a, b) => weight(b) - weight(a) || a.id - b.id)[0];
        next[keyOf(section.sectionId, group)] = { keeper: keeper.id, name: group.names.find(name => /[أإآ]/.test(name)) || keeper.name };
      }
      setChoice(next); setData(sections);
    } catch (e: any) { setMsg(String(e?.message || "تعذّر")); } finally { setWorking(""); }
  };
  const merge = async (section: TwinSection, group: TwinGroup) => {
    const picked = choice[keyOf(section.sectionId, group)];
    if (!picked) return;
    const others = group.courses.filter(course => course.id !== picked.keeper);
    const moving = others.reduce((sum, course) => sum + course.schedules, 0);
    const links = others.reduce((sum, course) => sum + course.plans, 0);
    const keeper = group.courses.find(course => course.id === picked.keeper)!;
    if (!window.confirm(`دمج ${others.map(course => `${course.code} «${course.name}»`).join(" و")} في ${keeper.code} باسم «${picked.name}»؟\n— تُنقل ${countOf(moving, AR.appointment)} و${links} رابط صحيفة إلى ${keeper.code}.\n— يُؤرشف المكرّر (لا حذف بلا أثر).`)) return;
    setWorking(keyOf(section.sectionId, group)); setMsg("");
    try {
      const response = await fetch("/api/plan-review/sheet/spelling-twins/merge", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ keeperId: picked.keeper, mergeIds: others.map(course => course.id), canonicalName: picked.name, confirm: true }),
      });
      const body = await response.json().catch(() => ({} as any));
      if (!response.ok) throw new Error(body.error || "تعذّر الدمج");
      setMsg(`دُمج: ${keeper.code} «${picked.name}» · نُقل ${countOf(Number(body.schedules || 0), AR.appointment)}`);
      await scan();
    } catch (e: any) { setMsg(String(e?.message || "تعذّر")); } finally { setWorking(""); }
  };
  return (
    <div className="pr-sheet-result twins-merge" role="group" aria-label="مقرر واحد بإملاءين">
      <button type="button" className="btn btn-secondary" disabled={Boolean(working)} onClick={() => void scan()} data-guide-ignore="فحص المقررات المكتوبة بإملاءين في القسم الواحد؛ معاينة فقط">
        <Merge aria-hidden="true" size={15} /> افحص الإملاءات المكررة
      </button>
      {working === "فحص" ? <small className="pr-working" role="status"><Loader2 aria-hidden="true" className="spin" size={14} /> جارٍ الفحص…</small> : null}
      {msg ? <small role="status">{msg}</small> : null}
      {data ? (data.length ? data.map(section => (
        <section key={section.sectionId} className="twins-section">
          <b>{section.section}</b>
          {section.groups.map(group => {
            const key = keyOf(section.sectionId, group);
            const picked = choice[key];
            const blocked = group.courses.filter(course => course.id !== picked?.keeper && !course.mergeable);
            return <article key={key} className="twins-group">
              <ul className="twins-courses">
                {group.courses.map(course => <li key={course.id} className={course.id === picked?.keeper ? "is-keeper" : ""}>
                  <label>
                    <input type="radio" name={`keeper-${key}`} checked={course.id === picked?.keeper} onChange={() => setChoice(current => ({ ...current, [key]: { ...current[key], keeper: course.id } }))} data-guide-ignore="اختيار المقرر الباقي بعد الدمج" />
                    <bdi dir="ltr">{course.code}</bdi> <span>{course.name}</span>
                  </label>
                  <span className="twins-refs">
                    <small title="مواعيد في كل الفصول"><CalendarDays aria-hidden="true" />{course.schedules}</small>
                    <small title="روابط صحائف"><FileText aria-hidden="true" />{course.plans}</small>
                    {course.students ? <small className="is-warn" title="تشير إليه بيانات طلبة"><UsersRound aria-hidden="true" /></small> : null}
                    {course.rules ? <small className="is-warn" title="تشير إليه قواعد صحيفة"><Ruler aria-hidden="true" /></small> : null}
                  </span>
                </li>)}
              </ul>
              <div className="twins-name">
                <span>الاسم المعتمد</span>
                {group.names.map(name => <label key={name}><input type="radio" name={`name-${key}`} checked={picked?.name === name} onChange={() => setChoice(current => ({ ...current, [key]: { ...current[key], name } }))} data-guide-ignore="اختيار الإملاء المعتمد لاسم المقرر" />{name}</label>)}
              </div>
              {blocked.length ? <small className="twins-blocked">لا يُدمج آلياً: {blocked.map(course => `${course.code} (${course.blockedBy})`).join("، ")}</small> : null}
              <button type="button" className="btn btn-primary" disabled={Boolean(working) || Boolean(blocked.length)} onClick={() => void merge(section, group)} data-guide-ignore="يدمج إملاءي المقرر بعد التأكيد: ينقل المواعيد والروابط ويؤرشف المكرر">
                {working === key ? "جارٍ الدمج…" : "دمج"}
              </button>
            </article>;
          })}
        </section>
      )) : <small role="status">لا مقررات بإملاءين</small>) : null}
    </div>
  );
}
