/**
 * ── طبقة التسجيل في نبض القاعات: فروقُ ملف التسجيل على قاعاتها ─────────────────
 *
 * لا مقارنةَ ثانية هنا: البنودُ هي بنودُ تقرير المطابقة نفسه (registrarRequest، من
 * /api/schedules/registrar-requests/:id/live)، وهذا الملف يضع كلَّ بندٍ على قاعته في
 * المجسّم، ويكتب سطرَ الطلب نصّاً يُنسخ. دوالُّ نقيّة: لا شبكة ولا كتابة.
 *
 * القاعة من فرق المكان والزمان وحده (القاعة، الأيام، الوقت، وشعبةٌ تُضاف أو تُحذف):
 * قاعتُها عندنا، والقاعةُ التي طبعها ملفهم إن كانت من قاعات المجسّم. وما سوى ذلك
 * (الأستاذ، المقرر، رقم الشعبة) لا قاعة له، فيظهر في «بلا قاعة» ولا يختفي.
 * وما سوّيناه في جدولنا بعد الفحص (صار كما في ملفهم) يسقط بـ settleSavedItems.
 */
import { settleSavedItems, withFullCourseCodes, type RegistrarRequestItem } from "./registrarRequest";
import { normalizeCrn } from "./registrarCheck";
import { hallKeyOf, type PulseModel } from "./hallPulse";

/** حقولٌ تخصّ مكان الشعبة وزمانها: بها يوضع البند على قاعة. */
const HALL_FIELDS = new Set(["room", "days", "time"]);

export interface HallRegistrarEntry {
  item: RegistrarRequestItem;
  /** ours: الشعبة في هذه القاعة في جدولنا. theirs: ملفهم يضعها هنا. */
  role: "ours" | "theirs";
  /** مفتوح: لم يشطبه التسجيل «نُفّذ» بعد. */
  open: boolean;
}

export interface RegistrarLayer {
  byHall: Map<string, HallRegistrarEntry[]>;
  /** بنودٌ لا قاعة لها (الأستاذ وحده، أو قاعةٌ خارج المجسّم). */
  noHall: RegistrarRequestItem[];
  /** القاعات التي فيها بندٌ مفتوح. */
  halls: number;
  /** البنود المفتوحة كلها (على قاعة أو بلا قاعة). */
  open: number;
  total: number;
}

const digits = (value: unknown) => String(value ?? "").replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");
const tailOf = (code: unknown) => { const d = digits(code); return d.length >= 3 ? d.slice(-3) : d; };
const sectionOf = (value: unknown) => digits(value).replace(/^0+/, "") || String(value ?? "").trim();
export const isOpenItem = (item: Pick<RegistrarRequestItem, "done" | "state">) => !item.done && item.state !== "confirmed";

/** «012B01 / 105 · 012B02 / 201» ← مفاتيح قاعات المجسّم. */
function hallsFromRoomText(text: string, byText: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  for (const part of String(text || "").split(" · ")) {
    const [building, hall] = part.split(" / ");
    if (!hall) continue;
    const key = byText.get(hallKeyOf(building, hall));
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

export interface RegistrarLayerOptions {
  /** رمز المقرر الكامل برقمه (من المقررات)؛ وإلا من لقطة الصف. */
  courseCodeOf?: (courseId: number) => string;
  /** نصوص شعبنا الآن (liveSectionTexts): ما سوّيناه بعد الفحص يسقط. */
  texts?: ReadonlyMap<string, Record<string, string>>;
}

/**
 * يضع بنود التقرير على قاعاتها. البند يُعرف في جدولنا بالرقم المرجعي، وإلا بنهاية رمز المقرر
 * ورقم الشعبة (كما يقرن تقرير المطابقة)، وقاعته قاعةُ الشعبة في الجدول كما هو (لا خطةَ معاينة).
 */
export function registrarLayer(model: PulseModel, items: readonly RegistrarRequestItem[], options: RegistrarLayerOptions = {}): RegistrarLayer {
  const settled = (options.texts ? settleSavedItems(items, options.texts).items : [...items]).filter(item => item.state !== "confirmed");
  const byText = new Map<string, string>();
  for (const h of model.halls) byText.set(hallKeyOf(h.buildingCode, h.code), h.key);
  const byCrn = new Map<string, Set<string>>(), byPair = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, key: string, hall: string) => { if (key && hall) (map.get(key) || map.set(key, new Set()).get(key)!).add(hall); };
  for (const s of model.sessions) {
    const row = (s.source || {}) as Record<string, any>;
    const crn = normalizeCrn(row.referenceNumber || row.source?.referenceNumber);
    add(byCrn, crn, s.hallKey);
    const code = options.courseCodeOf?.(s.courseId) || row.CourseCodeSnapshot || row.CourseCode || "";
    const tail = tailOf(code);
    if (tail) add(byPair, `${tail}|${sectionOf(s.sectionCode)}`, s.hallKey);
  }
  const byHall = new Map<string, HallRegistrarEntry[]>();
  const noHall: RegistrarRequestItem[] = [];
  const place = (hall: string, entry: HallRegistrarEntry) => {
    const list = byHall.get(hall) || byHall.set(hall, []).get(hall)!;
    if (!list.some(e => e.item.id === entry.item.id)) list.push(entry);
  };
  for (const item of settled) {
    const open = isOpenItem(item);
    const room = item.fields.find(f => f.field === "room");
    const hallBound = item.action !== "edit" || item.fields.some(f => HALL_FIELDS.has(f.field));
    if (!hallBound) { noHall.push(item); continue; }
    const crn = normalizeCrn(item.crn);
    const pair = `${tailOf(item.courseCode)}|${sectionOf(item.action === "delete" ? item.pdfSection || item.section : item.section)}`;
    const ours = item.action === "delete" ? [] : [...((crn && byCrn.get(crn)) || byPair.get(pair) || [])];
    const oursFromText = !ours.length && room && item.action !== "delete" ? hallsFromRoomText(room.ours, byText) : [];
    const theirs = room ? hallsFromRoomText(room.pdf, byText) : [];
    const mine = [...ours, ...oursFromText];
    mine.forEach(key => place(key, { item, role: "ours", open }));
    theirs.filter(key => !mine.includes(key)).forEach(key => place(key, { item, role: "theirs", open }));
    if (!mine.length && !theirs.length) noHall.push(item);
  }
  /* الترتيب: المفتوح أولاً، ثم ما هو في القاعة عندنا قبل ما يضعه ملفهم فيها. */
  for (const list of byHall.values()) list.sort((a, b) => Number(b.open) - Number(a.open) || (a.role === b.role ? 0 : a.role === "ours" ? -1 : 1));
  let halls = 0;
  for (const list of byHall.values()) if (list.some(e => e.open)) halls++;
  return { byHall, noHall, halls, open: settled.filter(isOpenItem).length, total: settled.length };
}

/** عدد البنود المفتوحة على قاعة: شارة النبض. */
export const openCountOf = (entries: readonly HallRegistrarEntry[] | undefined) => (entries || []).filter(e => e.open).length;

const fullCode = (code: string) => String(code || "").trim();

/**
 * سطرُ الطلب كما يُرسل إلى التسجيل، من البند نفسه وبقيم التقرير: بالرقم المرجعي دائماً
 * («عدّلوا الرقم المرجعي …: الحقل: ما عندهم ← المطلوب»)، ورمزُ المقرر بسبع خانات على جانبي السهم.
 */
export function requestLineText(item: RegistrarRequestItem): string {
  const it = withFullCourseCodes(item);
  const course = `${fullCode(it.courseCode)} ${it.courseName}`.trim();
  const section = it.pdfSection || it.section;
  const who = it.crn ? `الرقم المرجعي ${it.crn} (${course} · شعبة ${section})` : `${course} · شعبة ${section} (بلا رقم مرجعي)`;
  if (it.action === "edit") {
    const deltas = it.fields.map(f => `${f.label}: ${f.pdf} ← ${f.ours}`).join("؛ ");
    return `عدّلوا ${who}: ${deltas}`;
  }
  if (it.action === "add") {
    const values = it.fields.filter(f => f.ours && f.ours !== "—").map(f => `${f.label}: ${f.ours}`).join("؛ ");
    return `أضيفوا ${course} · شعبة ${it.section}${values ? `: ${values}` : ""}`;
  }
  return `احذفوا ${who}`;
}

/** نصُّ طلبات قاعةٍ (أو قائمة) للنسخ: سطرٌ لكل بند، بلا تكرار. */
export function requestBlockText(items: readonly RegistrarRequestItem[]): string {
  const seen = new Set<string>();
  return items.filter(item => (seen.has(item.id) ? false : (seen.add(item.id), true))).map(requestLineText).join("\n");
}

/** يوم الفحص بالأرقام اللاتينية: «12 نوفمبر». */
export const checkDay = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ar-KW-u-nu-latn", { day: "numeric", month: "long" });
};
