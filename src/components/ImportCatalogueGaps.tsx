/**
 * ملخص ما ينقص كتالوج القسم من ملف الهيئة، في مكان واحد وبتأكيد واحد: مقررات تُنشأ
 * برقمها واسمها المطبوعين، وأرقام توافق مقرراً باسم آخر تنتظر اختيار المستخدم.
 */
import React, { useState } from "react";
import { Plus } from "lucide-react";
import { PrimaryButton } from "./ui";
import type { CatalogueGaps } from "../utils/importCatalogueGaps";
import { AR, countOf } from "../utils/arabicCount";

export type GapDecisions = { create: string[]; link: Record<string, number> };

type Props = { key?: React.Key; gaps: CatalogueGaps; canCreate: boolean; busy: boolean; onConfirm: (decisions: GapDecisions) => void };

export default function ImportCatalogueGaps({ gaps, canCreate, busy, onConfirm }: Props) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  if (!gaps.courses.length && !gaps.choices.length) return null;
  const decisions: GapDecisions = {
    create: [...gaps.courses.map(course => course.code), ...gaps.choices.filter(item => picked[item.code] === "create").map(item => item.code)],
    link: Object.fromEntries(gaps.choices.filter(item => Number(picked[item.code]) > 0).map(item => [item.code, Number(picked[item.code])])),
  };
  const pending = gaps.choices.length - Object.keys(picked).length;
  const actions = decisions.create.length + Object.keys(decisions.link).length;
  const unknownHours = gaps.courses.filter(course => !course.credit).length;
  return (
    <section className="import-gaps" aria-label="مقررات غير مسجلة في القسم">
      {gaps.courses.length ? <>
        <h4>مقررات غير مسجلة في القسم ({gaps.courses.length})</h4>
        <ul>{gaps.courses.map(course => (
          <li key={course.code}><bdi dir="ltr">{course.code}</bdi><span>{course.name || "—"}</span><small>{countOf(course.rows, AR.section)}</small></li>
        ))}</ul>
        {unknownHours ? <p>لا تطبع الهيئة الوحدات. أكملها من شاشة المقررات لـ{countOf(unknownHours, AR.course)}.</p> : null}
      </> : null}
      {gaps.choices.length ? <>
        <h4>رقم يوافق مقرراً باسم آخر ({gaps.choices.length})</h4>
        {gaps.choices.map(item => (
          <fieldset key={item.code}>
            <legend><bdi dir="ltr">{item.code}</bdi> {item.name || "—"}</legend>
            {item.candidates.map(candidate => (
              <label key={candidate.AdCourseId}>
                <input type="radio" name={`gap-${item.code}`} checked={picked[item.code] === String(candidate.AdCourseId)} onChange={() => setPicked(prev => ({ ...prev, [item.code]: String(candidate.AdCourseId) }))} />
                ربط بـ <bdi dir="ltr">{candidate.code}</bdi> {candidate.name}
              </label>
            ))}
            {canCreate ? <label>
              <input type="radio" name={`gap-${item.code}`} checked={picked[item.code] === "create"} onChange={() => setPicked(prev => ({ ...prev, [item.code]: "create" }))} />
              إنشاء مقرر جديد برقمه المطبوع
            </label> : null}
          </fieldset>
        ))}
      </> : null}
      {canCreate || Object.keys(decisions.link).length ? (
        <footer>
          <PrimaryButton type="button" data-guide-ignore="إنشاء المقررات الناقصة من ملف الجدول وربط صفوفها بعد التأكيد" disabled={busy || !actions || (!canCreate && !Object.keys(decisions.link).length)} onClick={() => onConfirm(canCreate ? decisions : { create: [], link: decisions.link })}>
            <Plus aria-hidden="true" />{canCreate ? `إنشاء وربط (${actions})` : `ربط (${Object.keys(decisions.link).length})`}
          </PrimaryButton>
          {pending > 0 ? <small>بقي اختيار {countOf(pending, AR.course)}.</small> : null}
        </footer>
      ) : null}
      {!canCreate ? <p role="note">إضافة المقررات تتطلب صلاحية إدارة المقررات.</p> : null}
    </section>
  );
}
