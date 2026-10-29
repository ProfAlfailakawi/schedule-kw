/**
 * ── منتقي المقرر لـ«شعبة جديدة»: الموقعُ وسمٌ، والمقررُ مرّةً واحدة ─────────────
 *
 * يُستعمل في البطاقة السريعة وفي النموذج الكامل. الموقعُ (بنين/بنات/الكلية) شريطٌ صغير
 * لا يظهر إلا حين يكون في الكتالوج أكثرُ من موقع، ويبدأ بموقع الطلب؛ والمقررُ قائمةٌ
 * يُبحث فيها، كلُّ مقررٍ سطرٌ واحد، وبجانب مقرر الصحيفة الجديدة وسمُ «🆕 صحيفة جديدة».
 * القواعد كلّها في utils/proposalCourseChoices.ts.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import SearchableSelect from "../SearchableSelect";
import {
  NEW_SHEET_BADGE, proposalCourseChoices, proposalCourseScopes, sameCourseIn, scopeKeyOf, type ProposalCourseChoice,
} from "../../utils/proposalCourseChoices";
import type { Workspace } from "./useProposalWorkspace";

export function useProposalCourseChoices(ws: Workspace) {
  const { ctx, draft } = ws;
  const courses = ctx?.courses || [];
  const scopes = useMemo(() => proposalCourseScopes(courses, ctx?.scope), [courses, ctx?.scope]);
  const chosen = courses.find(course => course.id === draft.courseId);
  const [picked, setPicked] = useState<string>("");
  /* الموقعُ: موقعُ المقرر المختار إن وُجد، ثم ما اختاره المستخدم، ثم موقعُ الطلب. */
  const scopeKey = chosen ? scopeKeyOf(chosen) : (picked && scopes.some(s => s.key === picked) ? picked : scopes[0]?.key || "");
  const scope = scopes.find(s => s.key === scopeKey) || null;
  const choices = useMemo(() => proposalCourseChoices(courses, scope, ctx?.usedCodes || {}), [courses, scope, ctx?.usedCodes]);
  const setScope = (key: string) => {
    const next = scopes.find(s => s.key === key);
    if (!next) return;
    setPicked(key);
    if (draft.courseId) ws.patchDraft({ courseId: sameCourseIn(courses, draft.courseId, next, ctx?.usedCodes || {}) });
  };
  return { scopes, scope, scopeKey, setScope, choices };
}

export default function ProposalCoursePicker({ ws, choices, scopes, scopeKey, setScope, autoFocus = false, compact = false }: {
  ws: Workspace;
  choices: ProposalCourseChoice[];
  scopes: ReturnType<typeof proposalCourseScopes>;
  scopeKey: string;
  setScope: (key: string) => void;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const { draft } = ws;
  /* يركّز زرَّ القائمة مرّةً عند فتح البطاقة (بديلُ autoFocus في <select>). */
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (autoFocus) window.requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })); }, [autoFocus]);
  /* المقررُ المختار قد يكون سجلّاً أخاً للممثِّل (مسودةٌ قديمة): يُعرض على سطره. */
  const value = choices.find(choice => choice.memberIds.includes(Number(draft.courseId)))?.id ?? draft.courseId ?? "";
  const options = useMemo(() => choices.map(choice => ({
    value: choice.id, label: choice.name, hint: choice.code, keywords: choice.code,
    badge: choice.isNew ? NEW_SHEET_BADGE : undefined,
  })), [choices]);
  return (
    <div className="sp-course-pick" data-compact={compact || undefined}>
      {scopes.length > 1 ? (
        <div className="sp-seg sp-seg-sm sp-campus-seg" role="radiogroup" aria-label="الموقع">
          {scopes.map(scope => (
            <button key={scope.key} type="button" role="radio" aria-checked={scope.key === scopeKey} title={scope.collegeName}
              onClick={() => setScope(scope.key)} data-guide-ignore="يختار موقع الشعبة الجديدة — لا يكتب في الجدول">
              <MapPin aria-hidden="true" />{scope.label}
            </button>
          ))}
        </div>
      ) : null}
      <SearchableSelect fixed className="ss-compact sp-course-select" ariaLabel="المقرر" value={value}
        onChange={next => ws.patchDraft({ courseId: Number(next) || null })} options={options}
        placeholder="اختر المقرر…" searchPlaceholder="اكتب اسم المقرر أو رقمه" emptyText="لا مقرر بهذا الاسم"
        guideIgnore="يختار مقرر الشعبة الجديدة — لا يكتب في الجدول"
        triggerRef={trigger} />
    </div>
  );
}
