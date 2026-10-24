import { LONG_DAY_GAP_MINUTES, LONG_LECTURE_MINUTES, patternLibraryByHours, SHORT_DAY_GAP_MINUTES, SHORT_LECTURE_MINUTES } from "./scheduleRegulations";
import type { PatternLibraryInput } from "./patternLibraryView";

/** مدخلُ رسم مكتبة الأنماط من اللائحة كما هي في النظام. */
export const patternLibraryInput = (): PatternLibraryInput => ({
  groups: patternLibraryByHours(),
  shortMinutes: SHORT_LECTURE_MINUTES, longMinutes: LONG_LECTURE_MINUTES,
  shortGap: SHORT_DAY_GAP_MINUTES, longGap: LONG_DAY_GAP_MINUTES,
});
