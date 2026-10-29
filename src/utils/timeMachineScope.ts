/**
 * Which scope a loaded Time Machine context belongs to. After the college or the
 * department changes, a context loaded for the previous scope must not be shown
 * (its workbench and «اعتمد» would act on the wrong department) — only the one
 * loaded for the scope now selected.
 */
export const timeMachineScopeKey = (scope: { collegeId?: number; sectionId?: number; termId?: number }) =>
  `${scope.collegeId || 0}:${scope.sectionId || 0}:${scope.termId || 0}`;

/** Only a context loaded for the scope now selected is usable; anything else means «still loading». */
export function contextForScope<T>(loaded: { key: string; context: T } | null, key: string): T | null {
  return loaded && loaded.key === key ? loaded.context : null;
}
