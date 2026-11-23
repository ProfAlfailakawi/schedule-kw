/**
 * ── نبض القاعات: النموذج والمخطِّط (نقيّ بلا React ولا three.js) ─────────────
 *
 * يقرأ ما تملكه الشاشات أصلاً — صفوف الجدول، وسجلّ المواقع (السعة والنوع)،
 * وسعة المقرر لكل شعبة (MaxStudent) — ويبني منها:
 *  - مباني القسم طوابقَ من القاعات، والطابق من رمز القاعة متى أمكن؛
 *  - لون كل قاعة في كل لحظة بحسب ملاءمتها لشعبتها (مضغوطة/ممتلئة/مناسبة/واسعة)؛
 *  - مقترحات قاعاتٍ أنسب وفارغة من النوع نفسه؛
 *  - خطة «رتّب قاعاتي» ليومٍ كامل دفعةً واحدة، بنقلاتٍ مترابطة، لا تحجز قاعةً
 *    لشعبتين في الوقت نفسه، ولا تنقل شعبة إلى قاعةٍ من نوعٍ آخر.
 *
 * عدد الطلبة هنا تقدير: سعة المقرر لكل شعبة كما يستعملها البرنامج في كل مكان،
 * لا التسجيل الفعلي. والواجهة تقول ذلك صراحةً.
 *
 * لا يكتب هذا الملف شيئاً: الحفظ عند الشاشة عبر مسار النقل المعتاد
 * (/api/schedules/move-batch) الذي يعيد فحص التعارض على الخادم.
 */

export const PULSE_DAYS = [
  { key: "fsunday", label: "الأحد", short: "أحد" },
  { key: "fmonday", label: "الاثنين", short: "اثنين" },
  { key: "ftuesday", label: "الثلاثاء", short: "ثلاثاء" },
  { key: "fwednesday", label: "الأربعاء", short: "أربعاء" },
  { key: "fthursday", label: "الخميس", short: "خميس" },
] as const;
export type PulseDay = typeof PULSE_DAYS[number]["key"];

export type FitClass = "pressed" | "full" | "fit" | "wide" | "unknown";
export const FIT_LABEL: Record<FitClass, string> = {
  pressed: "مضغوطة",
  full: "ممتلئة",
  fit: "مناسبة",
  wide: "واسعة على شعبتها",
  unknown: "السعة غير مسجّلة",
};

/** أكثر من السعة مضغوطة، ومن 90٪ ممتلئة، ومن 45٪ مناسبة، وما دونها واسعة. */
export function fitClass(students: number | null | undefined, capacity: number | null | undefined): FitClass {
  const n = Number(students || 0), cap = Number(capacity || 0);
  if (!(n > 0) || !(cap > 0)) return "unknown";
  const r = n / cap;
  if (r > 1) return "pressed";
  if (r >= 0.9) return "full";
  if (r >= 0.45) return "fit";
  return "wide";
}

/** أصغر أفضل: 0–0.45 داخل النطاق المناسب، و1+ خارجه، و9 لا تتسع. */
export function fitScore(students: number, capacity: number | null | undefined): number {
  const cap = Number(capacity || 0);
  if (!(cap > 0) || !(students > 0)) return 99;
  if (cap < students) return 9;
  const r = students / cap;
  return r >= 0.45 && r < 0.9 ? Math.abs(r - 0.7) : 1 + (r >= 0.9 ? r - 0.9 : 0.45 - r);
}

export interface PulseHall {
  key: string;
  roomId?: string;
  buildingId?: string;
  buildingCode: string;
  buildingLabel: string;
  code: string;
  capacity: number | null;
  type: string;
  lab: boolean;
  /** قاعةٌ متخصّصة لقسمٍ آخر: تُعرض ولا يُقترح النقل إليها. */
  foreignSpecialised?: boolean;
  floor: number;
}

export interface PulseSession {
  id: number;
  rev?: number;
  sectionId: number;
  courseId: number;
  /** رقم الأستاذ لمسارات التنقّل (لا يُعرض؛ الاسم من instructorName وحده). */
  instructorId: number;
  courseName: string;
  sectionCode: string;
  instructor: string;
  students: number | null;
  expectedType: string;
  mode: string;
  days: PulseDay[];
  start: number;
  end: number;
  hallKey: string;
  /** صفّ الجدول الأصلي: يعود إلى الشاشة عند الحفظ كما هو. */
  source?: unknown;
}

export interface BusyWindow { day: PulseDay; from: number; to: number }

export interface PulseModel {
  halls: PulseHall[];
  hallByKey: Map<string, PulseHall>;
  sessions: PulseSession[];
  sessionById: Map<number, PulseSession>;
  /** أوقاتٌ تشغلها جهاتٌ أخرى في قاعاتنا (من /api/reports/room-load): لا يُنقل إليها. */
  foreignBusy: Map<string, BusyWindow[]>;
  /**
   * القاعات التي عُرف إشغالها كله (من room-load): لا يُقترح النقل إلى قاعةٍ خارجها.
   * null = لم يُطلب الفحص (الاختبارات ومن يملك الإشغال كاملاً).
   */
  checked: Set<string> | null;
  dayStart: number;
  dayEnd: number;
}

/** الإسناد: رقم الموعد ← مفتاح قاعته. الأصل هو ما في الجدول، والخطة تُطبَّق عليه نسخةً. */
export type Assignment = Map<number, string>;

const DIGITS = (text: string) => text
  .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
export const normalizeToken = (value: unknown): string => DIGITS(String(value ?? "").normalize("NFKC"))
  .replace(/[\s‎‏؜‪-‮_.\-‐-―ـ/]+/g, "").toUpperCase();
export const hallKeyOf = (building: unknown, hall: unknown) => {
  const b = normalizeToken(building), h = normalizeToken(hall);
  return b || h ? `${b}|${h}` : "";
};

/** «مبنى 3» من الرمز الرسمي «901A03» (رقم المبنى آخر خانتين بعد حرف الموقع)، وإلا الرمز كما هو. */
export function buildingLabelOf(code: unknown): string {
  const raw = String(code ?? "").trim();
  const m = raw.match(/^\d+[A-Za-z](\d{1,3})$/);
  return m ? `مبنى ${Number(m[1])}` : raw ? `مبنى ${raw}` : "بلا مبنى";
}

export const isLabType = (type: unknown) => /lab|مختبر|معمل|ورشة|استوديو/i.test(String(type ?? ""));

/**
 * الطابق من رمز القاعة متى دلّ عليه: «G20» أرضي، و«101»/«F13 2xx» بالمئات،
 * و«2-14» بما قبل الشرطة. وما لا يدلّ على طابق يبقى في الطابق الأرضي.
 */
export function floorOf(code: unknown): number {
  const raw = DIGITS(String(code ?? "").normalize("NFKC")).trim().toUpperCase();
  if (!raw) return 0;
  if (/^(G|GF|B)\b|^G\d/.test(raw)) return 0;
  const dashed = raw.match(/^(\d{1,2})\s*[-–]\s*\d+/);
  if (dashed) return Math.min(9, Number(dashed[1]));
  const digits = raw.match(/(\d{3,4})(?!.*\d)/);
  if (digits) return Math.min(9, Math.floor(Number(digits[1]) / (digits[1].length === 4 ? 1000 : 100)));
  return 0;
}

const minutesOf = (value: unknown) => {
  const [h, m] = String(value ?? "").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

export interface PulseRowInput {
  id: number; rev?: number; AdSectionId?: number; AdCourseId?: number; AdCourseName?: string; SCode?: string;
  AdInstructorId?: number; fstarttime?: string; fendtime?: string; AdRoomCode?: string; AdRoomHall?: string;
  roomId?: string; buildingId?: string;
  fsunday?: boolean; fmonday?: boolean; ftuesday?: boolean; fwednesday?: boolean; fthursday?: boolean;
}
export interface PulseCourseInput { AdCourseId: number; CourseName?: string; MaxStudent?: number; CourseRoomType?: string; CourseTeachingMode?: string }
export interface PulseRegistryInput {
  buildings?: Array<{ id: string; officialCode?: string; buildingNumber?: string; siteName?: string; description?: string; collegeIds?: number[] }>;
  rooms?: Array<{ id: string; buildingId: string; canonicalCode?: string; capacity?: number | null; roomType?: string; foreignSpecialised?: boolean; bookingPolicy?: string }>;
}

/**
 * يبني النموذج. القاعة تُعرَّف بمعرّف السجل متى وُجد، وإلا بالمبنى والقاعة نصّاً.
 * قاعةٌ في الجدول ليست في السجل تظهر أيضاً (بسعةٍ مجهولة) فلا تختفي شعبتها.
 * `buildingFilter` يحصر المباني (العميد: مباني كليته التي تُدرَّس فيها شعبها).
 */
export function buildPulseModel(input: {
  rows: readonly PulseRowInput[];
  courses: readonly PulseCourseInput[];
  registry?: PulseRegistryInput | null;
  roomLoad?: { rooms?: Array<{ room?: string; hall?: string; roomId?: string; busy?: Array<{ day: number; from: number; to: number; mine: boolean }> }>; checkedRoomIds?: string[] } | null;
  /** لا تُعدّ قاعةٌ فارغةً إلا إن غطّاها room-load (أو قراءةٌ فاشلة = لا مقترحات). */
  requireOccupancyCheck?: boolean;
  instructorName?: (id: number) => string;
  dayStart?: number;
  dayEnd?: number;
  /** القسم يرى مباني قاعاته المسجّلة كلها؛ والكلية مباني شعبها وحدها. */
  includeUnusedRegistryHalls?: boolean;
}): PulseModel {
  const courseById = new Map(input.courses.map(c => [Number(c.AdCourseId), c]));
  const buildings = new Map((input.registry?.buildings || []).map(b => [String(b.id), b]));
  const halls = new Map<string, PulseHall>();
  const keyByRoomId = new Map<string, string>();
  const keyByText = new Map<string, string>();
  const buildingLabel = (code: string, b?: { buildingNumber?: string; siteName?: string; description?: string }) => {
    const number = String(b?.buildingNumber || "").trim();
    return number ? `مبنى ${number}` : buildingLabelOf(code);
  };
  for (const room of input.registry?.rooms || []) {
    if (room.bookingPolicy && room.bookingPolicy !== "normal") continue;
    const b = buildings.get(String(room.buildingId));
    const buildingCode = String(b?.officialCode || "").trim();
    const code = String(room.canonicalCode || "").trim();
    if (!code) continue;
    const key = `id:${room.id}`;
    const cap = Math.round(Number(room.capacity));
    const type = String(room.roomType || "").trim();
    halls.set(key, {
      key, roomId: String(room.id), buildingId: String(room.buildingId), buildingCode, buildingLabel: buildingLabel(buildingCode, b), code,
      capacity: Number.isFinite(cap) && cap > 0 ? cap : null, type, lab: isLabType(type),
      foreignSpecialised: Boolean(room.foreignSpecialised), floor: floorOf(code),
    });
    keyByRoomId.set(String(room.id), key);
    keyByText.set(hallKeyOf(buildingCode, code), key);
  }
  const used = new Set<string>();
  const sessions: PulseSession[] = [];
  for (const row of input.rows) {
    const code = String(row.AdRoomHall || "").trim(), building = String(row.AdRoomCode || "").trim();
    let key = (row.roomId && keyByRoomId.get(String(row.roomId))) || keyByText.get(hallKeyOf(building, code)) || "";
    if (!key) {
      if (!code) continue;
      key = `tx:${hallKeyOf(building, code)}`;
      if (!halls.has(key)) {
        halls.set(key, { key, buildingCode: building, buildingLabel: buildingLabel(building), code, capacity: null, type: "", lab: false, floor: floorOf(code) });
        keyByText.set(hallKeyOf(building, code), key);
      }
    }
    const days = PULSE_DAYS.map(d => d.key).filter(d => Boolean((row as any)[d]));
    const start = minutesOf(row.fstarttime), end = minutesOf(row.fendtime);
    if (!days.length || !(end > start)) continue;
    const course = courseById.get(Number(row.AdCourseId));
    const seats = Math.round(Number(course?.MaxStudent || 0));
    used.add(key);
    sessions.push({
      id: Number(row.id), rev: row.rev, sectionId: Number(row.AdSectionId || 0),
      courseId: Number(row.AdCourseId || 0), instructorId: Number(row.AdInstructorId || 0),
      courseName: String(row.AdCourseName || course?.CourseName || "مقرر"),
      sectionCode: String(row.SCode || "").trim(),
      instructor: input.instructorName ? input.instructorName(Number(row.AdInstructorId || 0)) : "",
      students: seats > 0 ? seats : null,
      expectedType: String(course?.CourseRoomType || "").trim(),
      mode: String(course?.CourseTeachingMode || ""),
      days, start, end, hallKey: key, source: row,
    });
  }
  /* الكلية: لا تُرسم مبانٍ لا تُدرَّس فيها شعبةٌ من النطاق. */
  if (!input.includeUnusedRegistryHalls) {
    const usedBuildings = new Set([...used].map(k => halls.get(k)?.buildingCode));
    for (const [key, hall] of halls) if (!usedBuildings.has(hall.buildingCode)) halls.delete(key);
  }
  const foreignBusy = new Map<string, BusyWindow[]>();
  for (const room of input.roomLoad?.rooms || []) {
    const key = (room.roomId && keyByRoomId.get(String(room.roomId))) || keyByText.get(hallKeyOf(room.room, room.hall));
    if (!key) continue;
    const list = (room.busy || []).filter(b => !b.mine && PULSE_DAYS[b.day]).map(b => ({ day: PULSE_DAYS[b.day].key as PulseDay, from: b.from, to: b.to }));
    if (list.length) foreignBusy.set(key, list);
  }
  let checked: Set<string> | null = null;
  if (input.requireOccupancyCheck) {
    checked = new Set<string>();
    for (const id of input.roomLoad?.checkedRoomIds || []) { const key = keyByRoomId.get(String(id)); if (key) checked.add(key); }
    for (const room of input.roomLoad?.rooms || []) {
      const key = (room.roomId && keyByRoomId.get(String(room.roomId))) || keyByText.get(hallKeyOf(room.room, room.hall));
      if (key) checked.add(key);
    }
  }
  const hallList = [...halls.values()].sort((a, b) =>
    a.buildingCode.localeCompare(b.buildingCode, "en", { numeric: true }) || a.floor - b.floor || a.code.localeCompare(b.code, "en", { numeric: true }));
  return {
    halls: hallList, hallByKey: new Map(hallList.map(h => [h.key, h])),
    sessions, sessionById: new Map(sessions.map(s => [s.id, s])),
    foreignBusy, checked, dayStart: input.dayStart ?? 8 * 60, dayEnd: input.dayEnd ?? 20 * 60,
  };
}

export const originalAssignment = (model: PulseModel): Assignment => new Map(model.sessions.map(s => [s.id, s.hallKey]));

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;
const sharesDay = (a: PulseSession, b: PulseSession) => a.days.some(d => b.days.includes(d));

/** من يشغل القاعة في اليوم والدقيقة بحسب الإسناد. */
export function occupantsAt(model: PulseModel, assignment: Assignment, day: PulseDay, minute: number): Map<string, PulseSession> {
  const out = new Map<string, PulseSession>();
  for (const s of model.sessions) {
    if (!s.days.includes(day) || minute < s.start || minute >= s.end) continue;
    const key = assignment.get(s.id) || s.hallKey;
    const prev = out.get(key);
    /* تعارضٌ قائم في الجدول نفسه: تُعرض الأضيق على القاعة (الأسوأ) لا الأولى. */
    if (!prev || Number(s.students || 0) > Number(prev.students || 0)) out.set(key, s);
  }
  return out;
}

/**
 * عدّادات اللحظة من الإشغال نفسه الذي يُلوَّن به المشهد: مصدرٌ واحد للرأس وللقاعات،
 * فلا يقول الرأس «مشغولة 0» وقاعةٌ حمراء أمامه.
 */
export function slotStats(model: PulseModel, occ: ReadonlyMap<string, PulseSession>): { busy: number; over: number; full: number; fit: number; wide: number } {
  const out = { busy: 0, over: 0, full: 0, fit: 0, wide: 0 };
  for (const h of model.halls) {
    const s = occ.get(h.key);
    if (!s) continue;
    out.busy++;
    const c = fitClass(s.students, h.capacity);
    if (c === "pressed") out.over++; else if (c === "full") out.full++; else if (c === "fit") out.fit++; else if (c === "wide") out.wide++;
  }
  return out;
}

/** أزحم لحظةٍ في اليوم (أكثر القاعات المشغولة، والأبكر عند التساوي): بها يُفتح المشهد بدل قاعاتٍ فارغة. */
export function busiestMinute(model: PulseModel, assignment: Assignment, day: PulseDay): number | null {
  let best: number | null = null, bestCount = 0;
  for (let m = model.dayStart; m < model.dayEnd; m += 5) {
    const count = occupantsAt(model, assignment, day, m).size;
    if (count > bestCount) { bestCount = count; best = m; }
  }
  return best;
}

export function foreignAt(model: PulseModel, hallKey: string, day: PulseDay, minute: number): boolean {
  return (model.foreignBusy.get(hallKey) || []).some(w => w.day === day && minute >= w.from && minute < w.to);
}

/** هل القاعة فارغة لهذه الشعبة في كل أيامها وطوال وقتها؟ `ignore` شعبٌ تُعدّ مغادرة. */
export function hallFreeFor(model: PulseModel, assignment: Assignment, hallKey: string, session: PulseSession, ignore: ReadonlySet<number> = new Set()): boolean {
  for (const other of model.sessions) {
    if (other.id === session.id || ignore.has(other.id)) continue;
    if ((assignment.get(other.id) || other.hallKey) !== hallKey) continue;
    if (sharesDay(other, session) && overlaps(other, session)) return false;
  }
  for (const w of model.foreignBusy.get(hallKey) || []) {
    if (session.days.includes(w.day) && session.start < w.to && w.from < session.end) return false;
  }
  return true;
}

/**
 * النوع يُحترم: مقررٌ له نوع قاعة يذهب إلى ذلك النوع وحده؛ وبلا نوعٍ مسجّل تبقى
 * الشعبة في جنس قاعتها (مختبر إلى مختبر، ونظري إلى غير مختبر). ولا يُنقل إلى قاعة
 * سعتها مجهولة أو متخصّصةٍ لقسمٍ آخر.
 */
export function compatible(model: PulseModel, session: PulseSession, target: PulseHall): boolean {
  /* إشغالٌ لم يُقرأ لا يُعدّ فراغاً: قد يشغلها قسمٌ آخر فيردّ النقلَ فحصُ التعارض. */
  if (model.checked && !model.checked.has(target.key)) return false;
  return typeFits(model, session, target);
}

/** السعة والنوع وحدهما (بلا الإشغال): يحكم بها اقتراح القسم واقتراح الاستعارة معاً. */
export function typeFits(model: PulseModel, session: PulseSession, target: Pick<PulseHall, "capacity" | "type" | "lab" | "foreignSpecialised">): boolean {
  if (!target.capacity || target.foreignSpecialised) return false;
  if (session.students && target.capacity < session.students) return false;
  if (session.expectedType) return target.type === session.expectedType || (!target.type && !isLabType(session.expectedType) && !target.lab);
  const current = model.hallByKey.get(session.hallKey);
  const wantsLab = current ? current.lab : /applied|practical/.test(session.mode);
  return target.lab === wantsLab;
}

export interface BarterOpportunityInput {
  id: string; roomId: string; buildingId?: string; roomCode: string; roomHall: string; day: string; startTime: string; endTime: string;
  ownerSectionName?: string; roomType?: string; fit?: { capacity?: number; specialised?: boolean };
}
export interface BorrowCandidate {
  roomId: string; buildingId?: string; roomCode: string; roomHall: string; capacity: number | null; type: string; owner: string;
  opportunities: BarterOpportunityInput[];
}

/**
 * قاعات الأقسام الأخرى التي تصلح لاستعارةٍ لهذه الشعبة: فارغةٌ (نافذة استعارة) في أيامها كلها
 * طوال وقتها، وسعتها معروفة وتكفي، ونوعها يوافق نوع الشعبة بالحكم نفسه في اقتراح القسم
 * (typeFits) — فلا تُقترح قاعة محاضرات لشعبة مختبر، ولا قاعةٌ متخصّصة لغير قسمنا.
 * وما لا يصلح لكنه فارغٌ في يومها الأول يُعاد في `others` ليُرسم باهتاً.
 */
export function borrowCandidates(model: PulseModel, session: PulseSession, opportunities: readonly BarterOpportunityInput[]): { options: BorrowCandidate[]; others: BorrowCandidate[] } {
  const dayKeys = session.days.map(d => d.replace(/^f/, ""));
  const same = (o: BarterOpportunityInput, d: string) => o.day === d || o.day === `f${d}`;
  const byRoom = new Map<string, BarterOpportunityInput[]>();
  opportunities.forEach(o => { const list = byRoom.get(o.roomId) || []; list.push(o); byRoom.set(o.roomId, list); });
  const options: BorrowCandidate[] = [], others: BorrowCandidate[] = [];
  for (const [roomId, list] of byRoom) {
    const first = list[0];
    const cap = Math.round(Number(first?.fit?.capacity || 0)) || null;
    const type = String(first?.roomType || "").trim();
    const covering = dayKeys.map(d => list.find(o => same(o, d) && minutesOf(o.startTime) <= session.start && minutesOf(o.endTime) >= session.end));
    const fits = Boolean(session.students) && typeFits(model, session, { capacity: cap, type, lab: isLabType(type), foreignSpecialised: Boolean(first?.fit?.specialised) });
    const candidate: BorrowCandidate = { roomId, buildingId: first.buildingId, roomCode: first.roomCode, roomHall: first.roomHall, capacity: cap, type, owner: String(first.ownerSectionName || ""), opportunities: covering.filter(Boolean) as BarterOpportunityInput[] };
    if (covering.every(Boolean) && fits) options.push(candidate);
    else if (list.some(o => same(o, dayKeys[0]))) others.push(candidate);
  }
  options.sort((a, b) => fitScore(session.students || 0, a.capacity) - fitScore(session.students || 0, b.capacity));
  return { options, others };
}

/** حتى ثلاث قاعاتٍ أنسب وفارغة في وقت الشعبة كله، الأقرب إلى 120٪ من طلبتها أولاً. */
export function suggestHalls(model: PulseModel, assignment: Assignment, sessionId: number, limit = 3): PulseHall[] {
  const session = model.sessionById.get(sessionId);
  if (!session?.students) return [];
  const currentKey = assignment.get(sessionId) || session.hallKey;
  const current = model.hallByKey.get(currentKey);
  const cls = fitClass(session.students, current?.capacity);
  if (cls === "fit") return [];
  const now = fitScore(session.students, current?.capacity);
  return model.halls
    .filter(h => h.key !== currentKey && compatible(model, session, h) && fitScore(session.students!, h.capacity) < now && hallFreeFor(model, assignment, h.key, session))
    .sort((a, b) => fitScore(session.students!, a.capacity) - fitScore(session.students!, b.capacity) || Math.abs(a.capacity! - session.students! * 1.2) - Math.abs(b.capacity! - session.students! * 1.2))
    .slice(0, limit);
}

export interface PlanMove { sessionId: number; from: string; to: string }
export interface PlanGroup { id: number; moves: PlanMove[]; deps: number[]; on: boolean; start: number }
export interface DayPlan { day: PulseDay; groups: PlanGroup[]; unsolved: number[] }

/**
 * «رتّب قاعاتي» ليومٍ واحد: كل شعبةٍ تلتقي فيه تُنظر مرةً واحدة.
 * أولاً الواسعة على شعبها (الأكبر قاعةً أولاً) لتُفرغ القاعات التي تحتاجها المضغوطة،
 * ثم الممتلئة والمضغوطة (الأسوأ أولاً)؛ والمضغوطة التي لا تجد فارغةً تطلب من شعبةٍ
 * صغيرة أن تتنحّى إلى قاعةٍ أخرى (نقلتان مترابطتان). كل نقلة تُفحص على كل أيام
 * الشعبة لا على اليوم المعروض وحده، لأن القاعة تتغيّر للشعبة في أيامها كلها.
 */
export function planDay(model: PulseModel, base: Assignment, day: PulseDay): DayPlan {
  const assignment: Assignment = new Map(base);
  const groups: PlanGroup[] = [];
  const unsolved: number[] = [];
  const moved = new Set<number>();
  /* من أفرغ ماذا: [قاعة، الشعبة المغادرة، المجموعة] لحساب الاعتماد. */
  const vacated: Array<{ hall: string; session: PulseSession; group: number }> = [];
  const hallOf = (s: PulseSession) => assignment.get(s.id) || s.hallKey;
  const ratio = (s: PulseSession) => {
    const cap = model.hallByKey.get(hallOf(s))?.capacity;
    return s.students && cap ? s.students / cap : NaN;
  };
  const bestFree = (s: PulseSession, ignore: ReadonlySet<number> = new Set(), maxScore = 1): PulseHall | null => {
    let best: PulseHall | null = null, bs = maxScore;
    for (const h of model.halls) {
      if (h.key === hallOf(s) || !compatible(model, s, h)) continue;
      const sc = fitScore(s.students!, h.capacity);
      if (sc >= bs || !hallFreeFor(model, assignment, h.key, s, ignore)) continue;
      bs = sc; best = h;
    }
    return best;
  };
  const add = (moves: PlanMove[]) => {
    const g: PlanGroup = { id: groups.length, moves, deps: [], on: true, start: Math.min(...moves.map(m => model.sessionById.get(m.sessionId)!.start)) };
    for (const mv of moves) {
      const s = model.sessionById.get(mv.sessionId)!;
      for (const v of vacated) {
        if (v.hall === mv.to && v.group !== g.id && sharesDay(v.session, s) && overlaps(v.session, s) && !g.deps.includes(v.group)) g.deps.push(v.group);
      }
    }
    for (const mv of moves) {
      const s = model.sessionById.get(mv.sessionId)!;
      assignment.set(mv.sessionId, mv.to);
      moved.add(mv.sessionId);
      vacated.push({ hall: mv.from, session: s, group: g.id });
    }
    groups.push(g);
  };
  const today = model.sessions.filter(s => s.days.includes(day) && s.students && model.hallByKey.get(hallOf(s))?.capacity);
  today.filter(s => ratio(s) < 0.45)
    .sort((a, b) => (model.hallByKey.get(hallOf(b))!.capacity! - model.hallByKey.get(hallOf(a))!.capacity!) || a.start - b.start || a.id - b.id)
    .forEach(s => {
      if (moved.has(s.id) || !(ratio(s) < 0.45)) return;
      const to = bestFree(s);
      if (to) add([{ sessionId: s.id, from: hallOf(s), to: to.key }]);
    });
  today.filter(s => ratio(s) >= 0.9)
    .sort((a, b) => ratio(b) - ratio(a) || a.start - b.start || a.id - b.id)
    .forEach(s => {
      if (moved.has(s.id) || !(ratio(s) >= 0.9)) return;
      /* المضغوطة تقبل أي قاعةٍ تتّسع لها (ولو ممتلئة)؛ والممتلئة لا تنتقل إلا إلى مناسبة. */
      const pressedNow = ratio(s) > 1;
      const to = bestFree(s, new Set(), pressedNow ? 9 : 1);
      if (to) { add([{ sessionId: s.id, from: hallOf(s), to: to.key }]); return; }
      if (ratio(s) <= 1) return;
      /* سلسلة: شعبةٌ تتنحّى من قاعةٍ تناسبنا إلى قاعةٍ تناسبها هي. */
      for (const h of model.halls) {
        if (h.key === hallOf(s) || !compatible(model, s, h) || fitScore(s.students!, h.capacity) >= 9) continue;
        const blockers = model.sessions.filter(o => o.id !== s.id && hallOf(o) === h.key && sharesDay(o, s) && overlaps(o, s));
        if (blockers.length !== 1) continue;
        const k = blockers[0];
        if (moved.has(k.id) || !k.students) continue;
        if ((model.foreignBusy.get(h.key) || []).some(w => s.days.includes(w.day) && s.start < w.to && w.from < s.end)) continue;
        const kNow = fitScore(k.students, h.capacity);
        let m: PulseHall | null = null, ms = Math.max(1, kNow) + 1e-9;
        for (const cand of model.halls) {
          if (cand.key === h.key || !compatible(model, k, cand)) continue;
          const sc = fitScore(k.students, cand.capacity);
          /* تبادل: الصغيرة قد تأخذ قاعة المضغوطة نفسها بعد أن تغادرها. */
          const ignore = cand.key === hallOf(s) ? new Set([s.id]) : new Set<number>();
          if (sc >= ms || !hallFreeFor(model, assignment, cand.key, k, ignore)) continue;
          ms = sc; m = cand;
        }
        if (!m) continue;
        /* بعد تنحّي k هل القاعة فارغةٌ لنا في كل أيامنا؟ */
        const trial: Assignment = new Map(assignment); trial.set(k.id, m.key);
        if (!hallFreeFor(model, trial, h.key, s)) continue;
        add([{ sessionId: k.id, from: h.key, to: m.key }, { sessionId: s.id, from: hallOf(s), to: h.key }]);
        return;
      }
      unsolved.push(s.id);
    });
  return { day, groups, unsolved };
}

/** تشغيل مجموعةٍ أو إيقافها مع ما يعتمد عليها: الإيقاف يُسقط من بعدها، والتشغيل يُعيد من قبلها. */
export function toggleGroup(plan: DayPlan, id: number, on: boolean): number[] {
  const changed: number[] = [];
  const set = (gid: number, value: boolean) => {
    const g = plan.groups[gid];
    if (!g || g.on === value) return;
    g.on = value; changed.push(gid);
    if (value) g.deps.forEach(d => set(d, true));
    else plan.groups.forEach(x => { if (x.deps.includes(gid)) set(x.id, false); });
  };
  set(id, on);
  return changed;
}

export function applyPlan(base: Assignment, plan: DayPlan | null): Assignment {
  const out: Assignment = new Map(base);
  if (!plan) return out;
  for (const g of plan.groups) if (g.on) for (const mv of g.moves) out.set(mv.sessionId, mv.to);
  return out;
}

export const planMoves = (plan: DayPlan | null): PlanMove[] => plan ? plan.groups.filter(g => g.on).flatMap(g => g.moves) : [];

export interface PulseMetrics { occ: number; over: number; full: number; fit: number; wide: number; waste: number; pct: number }
/** مقاييس اليوم (أو الأسبوع كله بلا يوم): كل لقاءٍ يُعدّ مرةً في كل يومٍ يلتقي فيه. */
export function metrics(model: PulseModel, assignment: Assignment, day?: PulseDay): PulseMetrics {
  const m: PulseMetrics = { occ: 0, over: 0, full: 0, fit: 0, wide: 0, waste: 0, pct: 0 };
  for (const s of model.sessions) {
    const reps = day ? (s.days.includes(day) ? 1 : 0) : s.days.length;
    if (!reps) continue;
    const cap = model.hallByKey.get(assignment.get(s.id) || s.hallKey)?.capacity;
    const cls = fitClass(s.students, cap);
    if (cls === "unknown") continue;
    m.occ += reps;
    if (cls === "pressed") m.over += reps;
    else if (cls === "full") m.full += reps;
    else if (cls === "fit") m.fit += reps;
    else { m.wide += reps; m.waste += reps * (cap! - s.students!); }
  }
  m.pct = m.occ ? Math.round((m.fit * 100) / m.occ) : 0;
  return m;
}

/** حرارة الأسبوع لكل قاعة: نسبة دقائق اليوم المشغولة لكل يوم، وأسوأ ملاءمةٍ رأتها. */
export function weeklyHeat(model: PulseModel, assignment: Assignment): Map<string, { days: number[]; week: number; worst: FitClass; meetings: number }> {
  const span = Math.max(1, model.dayEnd - model.dayStart);
  const out = new Map(model.halls.map(h => [h.key, { days: [0, 0, 0, 0, 0], week: 0, worst: "unknown" as FitClass, meetings: 0 }]));
  const rank: Record<FitClass, number> = { unknown: 0, wide: 1, fit: 2, full: 3, pressed: 4 };
  for (const s of model.sessions) {
    const key = assignment.get(s.id) || s.hallKey;
    const entry = out.get(key);
    if (!entry) continue;
    const len = Math.max(0, Math.min(s.end, model.dayEnd) - Math.max(s.start, model.dayStart));
    s.days.forEach(d => { entry.days[PULSE_DAYS.findIndex(x => x.key === d)] += len / span; });
    entry.meetings += s.days.length;
    const cls = fitClass(s.students, model.hallByKey.get(key)?.capacity);
    if (rank[cls] > rank[entry.worst]) entry.worst = cls;
  }
  for (const [key, entry] of out) {
    for (const w of model.foreignBusy.get(key) || []) {
      const i = PULSE_DAYS.findIndex(x => x.key === w.day);
      entry.days[i] += Math.max(0, Math.min(w.to, model.dayEnd) - Math.max(w.from, model.dayStart)) / span;
    }
    entry.days = entry.days.map(v => Math.min(1, v));
    entry.week = entry.days.reduce((a, b) => a + b, 0) / 5;
  }
  return out;
}

/** فحص الإسناد: أزواج شعبٍ في القاعة نفسها في وقتٍ متداخل (للاختبار وللتحقق قبل العرض). */
export function doubleBookings(model: PulseModel, assignment: Assignment, only?: ReadonlySet<number>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const list = model.sessions;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (only && !only.has(a.id) && !only.has(b.id)) continue;
    if ((assignment.get(a.id) || a.hallKey) !== (assignment.get(b.id) || b.hallKey)) continue;
    if (sharesDay(a, b) && overlaps(a, b)) out.push([a.id, b.id]);
  }
  return out;
}

/** أول مضغوطةٍ لا قاعة لها في القسم (لعرض الاستعارة): اليوم، ثم الوقت. */
export function firstUnsolvedPressed(model: PulseModel, assignment: Assignment, day: PulseDay): PulseSession | null {
  return model.sessions
    .filter(s => s.days.includes(day) && fitClass(s.students, model.hallByKey.get(assignment.get(s.id) || s.hallKey)?.capacity) === "pressed")
    .filter(s => !suggestHalls(model, assignment, s.id, 1).length)
    .sort((a, b) => a.start - b.start)[0] || null;
}

/* ── التخطيط المكاني: المباني صفوفاً، والطابق فوق الطابق، والقاعات إلى العمق ── */
export const HALL_W = 2.6, HALL_D = 2.6, HALL_H = 1.45, GAP_X = 0.32, GAP_Z = 0.5, FLOOR_H = 2.05;
export interface HallSpot { key: string; x: number; y: number; z: number; building: string; floorIndex: number }
export interface BuildingSpot { code: string; label: string; cx: number; cz: number; w: number; d: number; floors: number; top: number }
export interface PulseLayout { spots: Map<string, HallSpot>; buildings: BuildingSpot[]; width: number; depth: number; height: number; cx: number; cz: number }

export function layoutHalls(halls: readonly PulseHall[], opts: { perRow?: number; offsetX?: number; cols?: number } = {}): PulseLayout {
  const groups = new Map<string, PulseHall[]>();
  halls.forEach(h => { const k = h.buildingCode || "—"; (groups.get(k) || groups.set(k, []).get(k)!).push(h); });
  const perRow = opts.perRow ?? 8;
  const spots = new Map<string, HallSpot>();
  const buildings: BuildingSpot[] = [];
  const all = [...groups.entries()];
  /* الهاتف عمودٌ واحد من المباني (opts.cols = 1) فيملأ المجسّم الشاشة الطويلة. */
  const cols = opts.cols ?? (all.length <= 3 ? all.length : Math.ceil(Math.sqrt(all.length * 1.6)));
  let x0 = opts.offsetX ?? 0, z0 = 0, rowDepth = 0, maxX = x0, col = 0;
  for (const [code, list] of all) {
    /* الطوابق المستعملة فقط، مضغوطةً: مبنى قاعاتُه في 1 و3 يُرسم طابقين. */
    const floors = [...new Set(list.map(h => h.floor))].sort((a, b) => a - b);
    const floorIndex = new Map(floors.map((f, i) => [f, i]));
    const byFloor = floors.map(f => list.filter(h => h.floor === f));
    const across = Math.min(perRow, Math.max(...byFloor.map(r => r.length)));
    const rows = Math.max(...byFloor.map(r => Math.ceil(r.length / across)));
    const w = across * (HALL_W + GAP_X) + GAP_X, d = rows * (HALL_D + GAP_Z) + GAP_Z;
    byFloor.forEach(row => row.forEach((h, i) => {
      const r = Math.floor(i / across), c = i % across;
      spots.set(h.key, {
        key: h.key, building: code, floorIndex: floorIndex.get(h.floor)!,
        x: x0 + GAP_X + c * (HALL_W + GAP_X) + HALL_W / 2,
        y: floorIndex.get(h.floor)! * FLOOR_H + HALL_H / 2 + 0.08,
        z: z0 - (GAP_Z + r * (HALL_D + GAP_Z) + HALL_D / 2),
      });
    }));
    buildings.push({ code, label: list[0].buildingLabel, cx: x0 + w / 2, cz: z0 - d / 2, w, d, floors: floors.length, top: floors.length * FLOOR_H });
    rowDepth = Math.max(rowDepth, d);
    x0 += w + 2.4; maxX = Math.max(maxX, x0 - 2.4); col++;
    if (col >= cols) { col = 0; x0 = opts.offsetX ?? 0; z0 -= rowDepth + (opts.cols === 1 ? 5.5 : 3); rowDepth = 0; }
  }
  const minX = opts.offsetX ?? 0;
  const depth = -Math.min(0, ...buildings.map(b => b.cz - b.d / 2));
  return {
    spots, buildings, width: maxX - minX, depth,
    height: Math.max(FLOOR_H, ...buildings.map(b => b.top)),
    cx: (minX + maxX) / 2, cz: -depth / 2,
  };
}

export const clockText = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(Math.floor(minute % 60)).padStart(2, "0")}`;
