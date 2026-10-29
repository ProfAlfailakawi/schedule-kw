/**
 * ── منتقي الكلية والقسم في رأس شاشات الإرشاد ─────────────────────────────────
 *
 * «كشف التسجيل» و«رادار التسجيل» شاشتان لقسمٍ في فصل، ومن يرشد أكثر من قسمٍ (أو
 * من له الكلّ) كان لا يرى أين يبدّل: الكليةُ والقسم مدفونان في شريط البحث تحت
 * بطاقة المقاعد، والرادارُ بلا منتقٍ أصلاً. المنتقي هنا في رأس الشاشة، بجانب
 * العنوان، بأيقونةٍ لكلٍّ منهما — كما في شاشات الجدول.
 *
 * الخيارات نطاقُ القارئ وحده: الخادم يصفّي /api/colleges و/api/sections بصلاحياته،
 * فلا يظهر هنا ما لا يحقّ له. قائمةٌ بخيارٍ واحد لا تُرسم منتقياً بل وسماً ثابتاً.
 */
import { useEffect, useState } from "react";
import { Building2, Layers } from "lucide-react";

export type ScopeOption = { value: number; label: string };

/** كلياتُ القارئ وأقسامُه بأسمائها، كما يصفّيها الخادم بنطاقه. */
export function useAdvisingScopeCatalog() {
  const [catalog, setCatalog] = useState<{ colleges: Array<{ id: number; name: string }>; sections: Array<{ id: number; collegeId: number; name: string }> } | null>(null);
  useEffect(() => {
    let live = true;
    const read = (url: string) => fetch(url, { credentials: "include", cache: "no-store" }).then(response => (response.ok ? response.json() : [])).catch(() => []);
    void Promise.all([read("/api/colleges"), read("/api/sections")]).then(([colleges, sections]) => {
      if (!live) return;
      const list = (value: any, key: string) => (Array.isArray(value) ? value : Array.isArray(value?.[key]) ? value[key] : []);
      setCatalog({
        colleges: list(colleges, "colleges").map((row: any) => ({ id: Number(row.AdCollegeId), name: String(row.AdCollegeName || "") })).filter((row: any) => row.id > 0),
        sections: list(sections, "sections").map((row: any) => ({ id: Number(row.AdSectionId), collegeId: Number(row.AdCollegeId), name: String(row.AdSectionName || "") })).filter((row: any) => row.id > 0),
      });
    });
    return () => { live = false; };
  }, []);
  return catalog;
}

/** ما يجب اختيارُه تلقائياً: خيارٌ وحيد يُعرض وسماً ثابتاً ولم يُختر بعد (0 = لا شيء). */
export function advisingAutoPick({ colleges, sections, collegeId, sectionId, allLabel }: { colleges: ScopeOption[]; sections: ScopeOption[]; collegeId: number; sectionId: number; allLabel: boolean }) {
  if (allLabel) return { college: 0, section: 0 };
  const soleCollege = colleges.length === 1 ? colleges[0].value : 0;
  const soleSection = sections.length === 1 ? sections[0].value : 0;
  const college = soleCollege && collegeId !== soleCollege ? soleCollege : 0;
  /* القسمُ بعد الكلية: لا يُختار قسمٌ لكليةٍ لم تُثبَّت بعد. */
  const section = !college && soleSection && sectionId !== soleSection ? soleSection : 0;
  return { college, section };
}

export default function AdvisingScopePicker({ colleges, sections, collegeId, sectionId, onCollege, onSection, allLabel, idPrefix = "advising" }: {
  colleges: ScopeOption[];
  sections: ScopeOption[];
  collegeId: number;
  sectionId: number;
  onCollege: (id: number) => void;
  onSection: (id: number) => void;
  /** حين يُسمح بـ«الكل» (الرادار يجمع النطاق كله)، اسمُ هذا الخيار. */
  allLabel?: { college: string; section: string };
  idPrefix?: string;
}) {
  const fixedCollege = colleges.length <= 1 && !allLabel;
  const fixedSection = sections.length <= 1 && !allLabel;
  /* الوسمُ الثابت يُعرض قيمةً مختارة فعلاً، لا اسماً على خانةٍ فارغة: كليةٌ أو قسمٌ وحيد
     يُرسَل اختيارُه (onCollege/onSection) — وإلا بقي القسم 0 لمن له الكلّ ولم يُقرأ الكشف. */
  const auto = advisingAutoPick({ colleges, sections, collegeId, sectionId, allLabel: Boolean(allLabel) });
  useEffect(() => { if (auto.college) onCollege(auto.college); }, [auto.college]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (auto.section) onSection(auto.section); }, [auto.section]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!colleges.length && !sections.length) return null;
  const collegeName = colleges.find(option => option.value === collegeId)?.label || colleges[0]?.label || "";
  const sectionName = sections.find(option => option.value === sectionId)?.label || sections[0]?.label || "";
  return (
    <div className="adv-scope no-print" role="group" aria-label="الكلية والقسم">
      <label className={`adv-scope-pick${fixedCollege ? " is-fixed" : ""}`} htmlFor={`${idPrefix}-college`} title={collegeName || undefined}>
        <Building2 aria-hidden="true" />
        {fixedCollege ? <span id={`${idPrefix}-college`}>{collegeName || "—"}</span> : (
          <select id={`${idPrefix}-college`} aria-label="الكلية" value={collegeId || 0} onChange={event => onCollege(Number(event.target.value) || 0)}
            data-guide-ignore="منتقي الكلية في رأس شاشات الإرشاد — يغيّر المعروض فقط">
            {allLabel ? <option value={0}>{allLabel.college}</option> : collegeId ? null : <option value={0}>اختر الكلية</option>}
            {colleges.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        )}
      </label>
      <label className={`adv-scope-pick${fixedSection ? " is-fixed" : ""}`} htmlFor={`${idPrefix}-section`} title={sectionName || undefined}>
        <Layers aria-hidden="true" />
        {fixedSection ? <span id={`${idPrefix}-section`}>{sectionName || "—"}</span> : (
          <select id={`${idPrefix}-section`} aria-label="القسم" value={sectionId || 0} onChange={event => onSection(Number(event.target.value) || 0)}
            disabled={!allLabel && !collegeId} data-guide-ignore="منتقي القسم في رأس شاشات الإرشاد — يغيّر المعروض فقط">
            {allLabel ? <option value={0}>{allLabel.section}</option> : sectionId ? null : <option value={0}>اختر القسم</option>}
            {sections.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        )}
      </label>
    </div>
  );
}
