/**
 * مقرراتُ القسم موسومةً بصحيفتها (الجديدة/السابقة) من `/api/courses?plans=1`.
 * القراءةُ لا تكتب شيئاً؛ وإن رُفضت (صلاحية) يبقى كلُّ شيءٍ بلا وسم ولا تتعطّل الشاشة.
 */
import { useEffect, useState } from "react";
import type { AdCourse } from "../types";
import { sheetTagOf, type SheetTag } from "../utils/sheetTag";

export type SheetCourse = AdCourse & { curriculum?: Array<{ id?: string; status?: string; name?: string }>; serviceFor?: string[] };

export interface CourseSheets {
  /** null = لم تصل بعد. */
  courses: SheetCourse[] | null;
  tags: Map<number, SheetTag>;
  /** للقسم صحائفُ حيّة (وإلا فمقرراته كلُّها «الحالية»). */
  hasPlans: boolean;
  /** اسمُ كل صحيفة كما سمّاها القسم، إن وصل. */
  names: { new: string; old: string };
}

const EMPTY: CourseSheets = { courses: null, tags: new Map(), hasPlans: false, names: { new: "", old: "" } };

export function useCourseSheets(sectionId: number): CourseSheets {
  const [state, setState] = useState<CourseSheets>(EMPTY);
  useEffect(() => {
    if (!sectionId) { setState({ ...EMPTY, courses: [] }); return; }
    const controller = new AbortController();
    setState(EMPTY);
    fetch(`/api/courses?sectionId=${sectionId}&plans=1`, { credentials: "include", signal: controller.signal })
      .then(response => (response.ok ? response.json() : []))
      .then((list: unknown) => {
        const courses = (Array.isArray(list) ? list : []) as SheetCourse[];
        const tags = new Map<number, SheetTag>(courses.map(course => [Number(course.AdCourseId), sheetTagOf(course)]));
        const names = { new: "", old: "" };
        for (const course of courses) for (const plan of course.curriculum || []) {
          if (plan?.status === "active" && !names.new) names.new = String(plan.name || "");
          if (plan?.status === "transition" && !names.old) names.old = String(plan.name || "");
        }
        setState({ courses, tags, hasPlans: courses.some(course => (course.curriculum || []).length > 0), names });
      })
      .catch(error => { if (error?.name !== "AbortError") setState({ ...EMPTY, courses: [] }); });
    return () => controller.abort();
  }, [sectionId]);
  return state;
}
