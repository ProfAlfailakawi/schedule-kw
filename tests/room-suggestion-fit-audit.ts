import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roomMatchesCourseSuggestion as fits } from "../src/utils/roomSuggestionFit";

const room = (roomType?: string) => ({ roomType });
const course = (CourseRoomType?: string, CourseTeachingMode?: "theoretical" | "applied" | "practical" | "field_training") => ({ CourseRoomType, CourseTeachingMode });

assert.equal(fits(course("مختبر حاسوب", "applied"), room("مختبر حاسوب")), true);
assert.equal(fits(course("مختبر حاسوب", "applied"), room("تدريسية")), false);
assert.equal(fits(course("مختبر حاسوب", "applied"), room("مختبر")), false);
assert.equal(fits(course("مختبر حاسوب", "applied"), room()), false);
assert.equal(fits(course("تدريسية", "theoretical"), room("تدريسية")), true);
assert.equal(fits(course("تدريسية", "theoretical"), room("مختبر")), false);
// A declared room type wins even when a workshop's teaching nature is theoretical.
assert.equal(fits(course("مختبر", "theoretical"), room("مختبر")), true);
assert.equal(fits(course("مختبر", "theoretical"), room("تدريسية")), false);
assert.equal(fits(course("مختبر", "practical"), room("مختبر")), true);
assert.equal(fits(course("تدريسية", "applied"), room("تدريسية")), true);
assert.equal(fits(course("استوديو التلفزيون", "theoretical"), room("استوديو التلفزيون")), true);
assert.equal(fits(course("استوديو التلفزيون", "practical"), room("استوديو التلفزيون")), true);
// No explicit type: stay flexible, don't silently turn teaching nature into an exclusion.
assert.equal(fits(course(undefined, "theoretical"), room("مختبر")), true);
assert.equal(fits(course(undefined, "applied"), room("قاعة تدريسية")), true);
assert.equal(fits(course(undefined, "practical"), room()), true);
assert.equal(fits(course(undefined, "field_training"), room("قاعة تدريسية")), true);
assert.equal(fits(course("مختبر حاسوب", "applied"), room("  مختبر  حاسوب  ")), true);
assert.equal(fits(course(undefined, undefined), room()), true);
assert.equal(fits(null, room("مختبر")), true);

const server = readFileSync("server.ts", "utf8");
const schedule = readFileSync("src/components/Schedules.tsx", "utf8");
const quick = readFileSync("src/components/QuickCreatePopover.tsx", "utf8");
assert.match(server, /const matchingHalls=halls\.filter\(hall=>roomMatchesCourseSuggestion\(course,roomById\.get\(String\(hall\.roomId\)\)\)\)/);
assert.match(server, /for \(const hall of matchingHalls\)/);
assert.match(server, /if \(!matchingHalls\.length\)/);
assert.match(server, /const halls=eligibleHallsForSection\(registry,sectionId,borrowedRoomIds\)/);
assert.match(server, /borrowingRequired && dayKeys\.some\(day=>!borrowCovers/);
assert.match(schedule, /\/api\/schedules\/suggest-slots/g);
assert.match(quick, /\/api\/schedules\/suggest-slots/);
assert.match(schedule, /const roomIdeasKey = .+form\.AdCourseId/);
assert.match(schedule, /roomIdeasNote \|\|/);
assert.match(schedule, /slotIdeasNote \|\|/);
const picker = readFileSync("src/components/LocationPicker.tsx", "utf8");
assert.match(picker, /modeMismatch=Boolean\(selectedRoom&&!String\(courseRoomType\|\|""\)\.trim\(\)/);
assert.match(server, /if\(expectedRoomType\)\{fitAdjustment\+=12;fitReasons\.push/);
assert.doesNotMatch(server, /fitReasons\.push\("مطابقة لطبيعة المقرر"\)/);
console.log("Room suggestion eligibility: selected room type wins, teaching nature never blocks ✓");
