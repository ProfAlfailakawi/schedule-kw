/**
 * ── متابعةُ ملاحظاتنا على ملف التسجيل (تحت «تغييرات الجدول») ─────────────────────────────────────
 *
 * بطاقةٌ للقسم وحده: آخرُ فحصٍ محفوظ لملف التسجيل، وكم من «ما أُرسل ولم يظهر في ملفهم» ما زال مفتوحاً وكم
 * زال في ملفٍّ لاحق. لا يشطبها أحد: الفحصُ التالي نفسُه هو الدليل (verify)، فتتحدّث البطاقةُ وحدها،
 * وتُغلَق حين يتأكّد زوالُها كلها. لا تظهر للتسجيل المراجع (الفحصُ لنا فقط) ولا إن لم يُحفظ فحص.
 */
import React, { useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, Hourglass } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { notesCohort, type RegistrarRequestDoc } from "../utils/registrarRequest";
import { openMatchReport } from "../utils/openMatchReport";
import { requestDay } from "./RegistrarRequests";
import { SecondaryButton } from "./ui";

export default function RegistrarFollowUp({ collegeId, sectionId, termId }: { collegeId: number; sectionId: number; termId: number }) {
  const [docs, setDocs] = useState<RegistrarRequestDoc[] | null>(null);
  useEffect(() => {
    let alive = true;
    setDocs(null);
    if (!collegeId || !sectionId || !termId) return;
    fetch(`/api/schedules/registrar-requests?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { cache: "no-store" })
      .then(response => (response.ok ? response.json() : null))
      .then(body => { if (alive && Array.isArray(body?.requests) && body.requests.length) setDocs(body.requests as RegistrarRequestDoc[]); })
      .catch(() => { /* بطاقةٌ إضافية: تعذّرُها لا يُسقط التقرير */ });
    return () => { alive = false; };
  }, [collegeId, sectionId, termId]);

  if (!docs?.length) return null;
  const doc = docs[0];
  const progress = notesCohort(docs);
  if (!progress.total) return null;
  const closed = progress.open === 0;
  return (
    <section className="rfu" data-state={closed ? "closed" : "open"} aria-label="متابعة ملاحظاتنا على ملف التسجيل">
      <span className="rfu-icon" aria-hidden="true">{closed ? <CheckCircle2 /> : <Hourglass />}</span>
      <div className="rfu-body">
        <strong>{closed ? "أُغلقت ملاحظاتنا على ملف التسجيل" : "ملاحظاتنا على ملف التسجيل"}</strong>
        <span>
          آخر فحص {requestDay(doc.at)} · {closed
            ? `زالت كلها (${countOf(progress.total, AR.item)}) في الملف اللاحق`
            : `${progress.confirmed ? `زال ${progress.confirmed} من ${progress.total}، وبقي ` : ""}بانتظار التنفيذ من جانبهم: ${countOf(progress.open, AR.item)}`}
        </span>
      </div>
      <SecondaryButton type="button" data-guide-ignore="يفتح تقرير المطابقة في الاستعلامات — لا يغيّر شيئاً" onClick={openMatchReport}><ClipboardCheck aria-hidden="true" /> افتح التقرير</SecondaryButton>
    </section>
  );
}
