/**
 * لوحة العميد: «نبض القاعات في الكلية» و«الحرم كله» للقراءة فقط.
 *
 * بطاقةٌ صغيرة في الحزمة الأولى، والمجسّم كلّه لا يُحمَّل إلا حين يفتحه العميد.
 * النطاق نطاق اللوحة المشترك (كلية العميد، والقسم إن اختاره)، والمواعيد من
 * /api/schedules التي يقصرها الخادم على المعتمدة للعميدين.
 *
 * «الحرم كله» (FR-SCH-100): أقسام الكلية أحياءً في مشهدٍ واحد. ضغطة حيٍّ تفتح
 * نبض ذلك القسم هنا في البطاقة نفسها (العميد لا يملك شاشة الجدول)، ولمسؤول
 * النظام (`admin`) تفتحه في شاشة الجدول برابط النبض (pulseLink).
 */
import React, { useEffect, useState } from "react";
import { Box, Building2, ChevronDown } from "lucide-react";
import HallPulseLazy from "./HallPulseLazy";
import CampusCityLazy, { type CampusOpen } from "./CampusCityLazy";
import { readSharedScope, resolveSharedScope, useSharedScope, writeSharedScope } from "../../utils/sharedScope";
import { openInApp, pulseFocusHref, registryKeyOfPulseHall, type PulseFocus } from "../../utils/pulseLink";

type CardView = "closed" | "pulse" | "campus";

export default function DeanHallPulseCard({ scopes, termId, admin = false }: { scopes: any[]; termId: number; admin?: boolean }) {
  const resolve = () => resolveSharedScope(readSharedScope(), { scopes, isAdmin: admin, fallbackTermId: termId });
  const [scope, setScope] = useState(resolve);
  const [view, setView] = useState<CardView>("closed");
  const [focus, setFocus] = useState<PulseFocus | null>(null);
  /* فتحٌ من الحرم كله: قسم النطاق قبله يعود عند الرجوع، فلا يتغيّر نطاق اللوحة خلسة. */
  const [cameFrom, setCameFrom] = useState<{ sectionId: number; serial: number } | null>(null);
  /* المسؤول: أقسام كل الكليات من مسار الأقسام؛ والعميد: أقسام نطاقه نفسه. */
  const [sections, setSections] = useState<any[]>([]);
  useSharedScope(incoming => setScope(resolveSharedScope(incoming, { scopes, isAdmin: admin, fallbackTermId: termId })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setScope(resolve()); }, [termId]);
  useEffect(() => {
    if (!admin) return;
    let alive = true;
    fetch("/api/sections", { credentials: "include" }).then(r => (r.ok ? r.json() : [])).then(list => { if (alive && Array.isArray(list)) setSections(list); }).catch(() => {});
    return () => { alive = false; };
  }, [admin]);
  const collegeId = Number(scope.collegeId) || (admin ? Number(sections[0]?.AdCollegeId) || 0 : 0);
  const sectionId = Number(scope.sectionId) || 0, term = Number(scope.termId) || termId;
  const departments = (admin ? sections : scopes)
    .filter((row: any) => Number(row?.AdCollegeId) === collegeId && Number(row?.AdSectionId) > 0)
    .map((row: any) => ({ id: Number(row.AdSectionId), name: String(row.AdSectionName || "") }));
  if (!collegeId || !term) return null;

  const openDepartment = (open: CampusOpen) => {
    const hall = open.hallKey ? registryKeyOfPulseHall({ key: open.hallKey, roomId: open.roomId, buildingCode: open.buildingCode, code: open.code }) : "";
    const next: PulseFocus | null = hall ? { collegeId, sectionId: open.dept, termId: term, hall, day: open.day, at: open.at, from: "campus" } : null;
    if (admin) {
      /* المسؤول يملك شاشة الجدول: النبض نفسه برابطه المعتاد، في اللسان نفسه. */
      writeSharedScope({ collegeId, sectionId: open.dept, termId: term }, { source: "campus-city" });
      openInApp(next ? pulseFocusHref(next) : "/FSchedule/Index");
      return;
    }
    setCameFrom(prev => ({ sectionId: prev ? prev.sectionId : sectionId, serial: (prev?.serial || 0) + 1 }));
    writeSharedScope({ collegeId, sectionId: open.dept, termId: term }, { source: "campus-city" });
    setScope({ collegeId, sectionId: open.dept, termId: term });
    setFocus(next);
    setView("pulse");
  };
  const leavePulse = (to: CardView) => {
    if (cameFrom) {
      writeSharedScope({ collegeId, sectionId: cameFrom.sectionId, termId: term }, { source: "campus-city" });
      setScope({ collegeId, sectionId: cameFrom.sectionId, termId: term });
      setCameFrom(null);
    }
    setFocus(null);
    setView(to);
  };

  const campusButton = (
    <button data-guide-ignore="يفتح الحرم كله: أقسام الكلية أحياءً في مشهدٍ واحد؛ قراءة فقط" type="button" className="hp-plain-btn" onClick={() => { setFocus(null); setView("campus"); }} aria-expanded={view === "campus"}>
      <Building2 aria-hidden="true" style={{ width: 16, height: 16 }} /> الحرم كله
    </button>
  );

  return (
    <section className="hp-host" aria-label={admin ? "الحرم كله" : "نبض القاعات"}>
      {view === "closed" ? (
        <div className="hp-dean-card">
          <div>
            <strong><Box aria-hidden="true" style={{ width: 18, height: 18, verticalAlign: -3, marginInlineEnd: 6 }} />{admin ? "الحرم كله" : "نبض القاعات في الكلية"}</strong>
            <small>{admin
              ? "أقسام الكلية أحياءً في مشهدٍ واحد يضيء بحمله في ساعة اليوم، وضغطة حيٍّ تفتح نبض قسمه. للقراءة فقط."
              : "مباني الكلية مجسّمةً: أين القاعات المضغوطة، وأين الهدر، وحرارة الأسبوع لكل قاعة. و«الحرم كله» يجمع الأقسام أحياءً في مشهدٍ واحد. للقراءة فقط."}</small>
          </div>
          <div className="hp-dean-actions">
            {departments.length ? campusButton : null}
            {!admin ? (
              <button data-guide-ignore="يفتح نبض القاعات للعميد أو يغلقه؛ قراءة فقط" type="button" className="hp-plain-btn" onClick={() => { setFocus(null); setView("pulse"); }} aria-expanded={false}>
                افتح المجسّم <ChevronDown aria-hidden="true" style={{ width: 16, height: 16 }} />
              </button>
            ) : null}
          </div>
        </div>
      ) : view === "campus" ? (
        <>
          <CampusCityLazy collegeId={collegeId} termId={term} departments={departments} onOpenDepartment={openDepartment} />
          <div className="hp-dean-actions is-end">
            <button data-guide-ignore="يغلق الحرم كله؛ قراءة فقط" type="button" className="hp-plain-btn" onClick={() => setView("closed")} aria-expanded>إغلاق الحرم كله</button>
          </div>
        </>
      ) : (
        <>
          <React.Fragment key={`${sectionId}:${cameFrom?.serial || 0}`}><HallPulseLazy context="dean" collegeId={collegeId} sectionId={sectionId} termId={term} focus={focus} onFocusDone={() => setFocus(null)} /></React.Fragment>
          <div className="hp-dean-actions is-end">
            {departments.length ? (
              <button data-guide-ignore="يعود من نبض القسم إلى الحرم كله؛ قراءة فقط" type="button" className="hp-plain-btn" onClick={() => leavePulse("campus")}>
                <Building2 aria-hidden="true" style={{ width: 16, height: 16 }} /> عودة إلى الحرم كله
              </button>
            ) : null}
            <button data-guide-ignore="يفتح نبض القاعات للعميد أو يغلقه؛ قراءة فقط" type="button" className="hp-plain-btn" onClick={() => leavePulse("closed")} aria-expanded>إغلاق المجسّم</button>
          </div>
        </>
      )}
    </section>
  );
}
