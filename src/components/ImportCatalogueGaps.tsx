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

type Props = { key?: React.Key; gaps: CatalogueGaps; canCreate: boolean; canCreateSites: boolean; busy: boolean; onConfirm: (decisions: GapDecisions) => void };

export default function ImportCatalogueGaps({ gaps, canCreate, canCreateSites, busy, onConfirm }: Props) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const sites = gaps.sites || [];
  if (!gaps.courses.length && !gaps.choices.length && !sites.length) return null;
  const siteKeys = canCreateSites ? sites.map(site => `site:${site.collegeId}`) : [];
  const courseCodes = canCreate ? [...gaps.courses.map(course => course.code), ...gaps.choices.filter(item => picked[item.code] === "create").map(item => item.code)] : [];
  const decisions: GapDecisions = {
    create: [...siteKeys, ...courseCodes],
    link: Object.fromEntries(gaps.choices.filter(item => Number(picked[item.code]) > 0).map(item => [item.code, Number(picked[item.code])])),
  };
  const pending = gaps.choices.length - Object.keys(picked).length;
  const actions = decisions.create.length + Object.keys(decisions.link).length;
  const unknownHours = gaps.courses.filter(course => !course.credit).length;
  return (
    <section className="import-gaps" aria-label="مقررات غير مسجلة في القسم">
      {sites.length ? <>
        <h4>مواقع بلا هذا القسم ({sites.length})</h4>
        <ul>{sites.map(site => (
          <li key={site.collegeId}><span />{<span>{site.siteLabel}</span>}<small>{countOf(site.rows, AR.row)}</small></li>
        ))}</ul>
        {!canCreateSites ? <p role="note">إضافة القسم في الموقع لمدير النظام.</p> : null}
      </> : null}
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
      {actions ? (
        <footer>
          <PrimaryButton type="button" data-guide-ignore="إنشاء المقررات الناقصة من ملف الجدول وربط صفوفها بعد التأكيد" disabled={busy} onClick={() => onConfirm(decisions)}>
            <Plus aria-hidden="true" />{decisions.create.length ? `إنشاء وربط (${actions})` : `ربط (${actions})`}
          </PrimaryButton>
          {pending > 0 ? <small>بقي اختيار {countOf(pending, AR.course)}.</small> : null}
        </footer>
      ) : null}
      {!canCreate && (gaps.courses.length || gaps.choices.length) ? <p role="note">إضافة المقررات تتطلب صلاحية إدارة المقررات.</p> : null}
    </section>
  );
}
