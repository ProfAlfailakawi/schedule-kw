/**
 * ── «الحرم كله مدينة»: الكلية كلها في مشهدٍ واحد (حسابٌ نقيّ بلا React ولا three.js) ──
 *
 * يأخذ نموذج «نبض القاعات» نفسه مبنيّاً على الكلية كلها (buildPulseModel) ويقسمه
 * أحياءً: كل قسمٍ حيّ، وكل مبنى يُرسم مرةً واحدة في حيّ القسم الغالب عليه. ومنه:
 *  - صاحب كل قاعة: القسم الأكثر لقاءاتٍ فيها، وإلا القسم الأساسي في سجلّ المواقع؛
 *  - صاحب كل مبنى ونصيب كل قسمٍ منه (المبنى المشترك يُرسم مرةً بشريطٍ مقسوم)؛
 *  - حال كل حيٍّ في لحظةٍ من اليوم: قاعاتٌ مشغولة، ومضغوطة، وفارغة، ومزاجه؛
 *  - مخطّط المدينة: الأحياء صفوفاً، ومباني كل حيٍّ بمخطّط النبض نفسه (layoutHalls).
 *
 * لا يكتب شيئاً، ولا يقرأ إلا ما تقرؤه بطاقة العميد أصلاً.
 */
import {
  fitClass, foreignAt, layoutHalls, occupantsAt, originalAssignment, PULSE_DAYS,
  type Assignment, type BuildingSpot, type FitClass, type HallSpot, type PulseDay, type PulseHall, type PulseModel,
} from "./hallPulse";

export interface CampusDepartment { id: number; name: string }

/** ما يلزم من غرفة سجلّ المواقع لنسبة قاعةٍ لا لقاء فيها إلى قسمها. */
export interface CampusRegistryRoom { id: string; primarySectionIds?: number[]; sectionIds?: number[] }

export interface CampusShare { dept: number; weight: number }

export interface CampusBuilding {
  code: string;
  label: string;
  halls: string[];
  /** القسم الغالب (0 = لا قسم معروف). */
  owner: number;
  /** نصيب كل قسمٍ من المبنى (دقائق اللقاء في الأسبوع، وإلا عدد قاعاته)، الأكبر أولاً. */
  shares: CampusShare[];
  shared: boolean;
}

export interface CampusDistrict {
  dept: CampusDepartment;
  /** رقم لونه في لوحة الأحياء (ثابتٌ بترتيب الأقسام). */
  tone: number;
  buildings: string[];
  /** قاعات القسم (صاحبها هو) أينما كانت، ولو في مبنى يغلب عليه غيره. */
  halls: string[];
  /** لقاءات القسم في الأسبوع (كل يومٍ لقاء). */
  meetings: number;
}

export interface CampusCity {
  model: PulseModel;
  assignment: Assignment;
  departments: CampusDepartment[];
  /** صاحب كل قاعة (0 = لا قسم). */
  hallOwner: Map<string, number>;
  buildings: CampusBuilding[];
  buildingOf: Map<string, string>;
  districts: CampusDistrict[];
  districtOf: Map<number, CampusDistrict>;
}

export const DISTRICT_TONES = [0x3f8f7d, 0x7a6cc4, 0xc49a5a, 0x4f86b8, 0xb86f8a, 0x6f9c4f, 0x5aa7b0, 0xa87b4f, 0x8a8fb8, 0x4fa88a, 0xb8a04f, 0x9a6fb8];

const sessionWeight = (s: { start: number; end: number; days: readonly string[] }) => Math.max(0, s.end - s.start) * s.days.length;

/**
 * يبني المدينة. الأقسام بالترتيب المعطى (ترتيب نطاق العميد)، وكل قسمٍ حيٌّ ولو لم
 * يُعتمد له موعدٌ بعد: يظهر أرضاً فارغة فلا يختفي من خريطة الكلية.
 */
export function buildCampusCity(input: {
  model: PulseModel;
  departments: readonly CampusDepartment[];
  registryRooms?: readonly CampusRegistryRoom[] | null;
}): CampusCity {
  const { model } = input;
  const departments = dedupeDepartments(input.departments);
  const known = new Set(departments.map(d => d.id));
  const assignment = originalAssignment(model);
  const byHall = new Map<string, Map<number, number>>();
  for (const s of model.sessions) {
    if (!known.has(s.sectionId)) continue;
    const key = assignment.get(s.id) || s.hallKey;
    const m = byHall.get(key) || byHall.set(key, new Map()).get(key)!;
    m.set(s.sectionId, (m.get(s.sectionId) || 0) + sessionWeight(s));
  }
  const roomById = new Map((input.registryRooms || []).map(r => [String(r.id), r]));
  const hallOwner = new Map<string, number>();
  for (const h of model.halls) hallOwner.set(h.key, ownerOf(byHall.get(h.key), h, roomById, known));

  const groups = new Map<string, PulseHall[]>();
  for (const h of model.halls) {
    const code = h.buildingCode || "—";
    (groups.get(code) || groups.set(code, []).get(code)!).push(h);
  }
  const buildings: CampusBuilding[] = [];
  const buildingOf = new Map<string, string>();
  for (const [code, halls] of groups) {
    const weights = new Map<number, number>();
    for (const h of halls) for (const [dept, w] of byHall.get(h.key) || []) weights.set(dept, (weights.get(dept) || 0) + w);
    /* مبنى بلا لقاء: نصيب كل قسمٍ عدد قاعاته فيه. */
    if (!weights.size) for (const h of halls) { const o = hallOwner.get(h.key) || 0; if (o) weights.set(o, (weights.get(o) || 0) + 1); }
    const shares = [...weights.entries()].map(([dept, weight]) => ({ dept, weight }))
      .sort((a, b) => b.weight - a.weight || departments.findIndex(d => d.id === a.dept) - departments.findIndex(d => d.id === b.dept));
    buildings.push({ code, label: halls[0].buildingLabel, halls: halls.map(h => h.key), owner: shares[0]?.dept || 0, shares, shared: shares.length > 1 });
    for (const h of halls) buildingOf.set(h.key, code);
  }
  buildings.sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));

  const districts: CampusDistrict[] = departments.map((dept, i) => ({
    dept, tone: i % DISTRICT_TONES.length,
    buildings: buildings.filter(b => b.owner === dept.id).map(b => b.code),
    halls: model.halls.filter(h => hallOwner.get(h.key) === dept.id).map(h => h.key),
    meetings: model.sessions.filter(s => s.sectionId === dept.id).reduce((n, s) => n + s.days.length, 0),
  }));
  /* مبانٍ لا قسم معروفاً لها: حيٌّ واحد «مشترك» في آخر المدينة، لا تُخفى قاعاته. */
  const orphan = buildings.filter(b => !b.owner);
  if (orphan.length) {
    districts.push({
      dept: { id: 0, name: "قاعات مشتركة" }, tone: departments.length % DISTRICT_TONES.length,
      buildings: orphan.map(b => b.code), halls: model.halls.filter(h => !hallOwner.get(h.key)).map(h => h.key), meetings: 0,
    });
  }
  return { model, assignment, departments, hallOwner, buildings, buildingOf, districts, districtOf: new Map(districts.map(d => [d.dept.id, d])) };
}

function dedupeDepartments(list: readonly CampusDepartment[]): CampusDepartment[] {
  const seen = new Set<number>();
  const out: CampusDepartment[] = [];
  for (const d of list) {
    const id = Math.trunc(Number(d.id));
    if (!(id > 0) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: String(d.name || "").trim() || `القسم ${id}` });
  }
  return out;
}

function ownerOf(weights: Map<number, number> | undefined, hall: PulseHall, rooms: Map<string, CampusRegistryRoom>, known: Set<number>): number {
  if (weights && weights.size) {
    let best = 0, bestW = -1;
    for (const [dept, w] of weights) if (w > bestW || (w === bestW && dept < best)) { best = dept; bestW = w; }
    return best;
  }
  const room = hall.roomId ? rooms.get(hall.roomId) : undefined;
  for (const id of [...(room?.primarySectionIds || []), ...(room?.sectionIds || [])]) if (known.has(Number(id))) return Number(id);
  return 0;
}

/* ── اللحظة ─────────────────────────────────────────────────────────────── */

export type DistrictMood = "choke" | "busy" | "calm" | "idle";
export const MOOD_LABEL: Record<DistrictMood, string> = { choke: "يختنق", busy: "مزدحم", calm: "هادئ", idle: "خالٍ" };

export interface DistrictNow {
  dept: number;
  /** قاعاتٌ يشغلها القسم الآن (أينما كانت). */
  inUse: number;
  pressed: number;
  full: number;
  /** قاعات القسم الفارغة الآن (لا يشغلها أحد). */
  empty: number;
  owned: number;
  /** نحو كم طالب في قاعات القسم الآن (سعة المقرر لكل شعبة: تقدير). */
  students: number;
  /** مشغولٌ ÷ قاعات القسم، بين 0 و1 (قسمٌ بلا قاعات يشغل غيره = 1). */
  load: number;
  mood: DistrictMood;
}

export interface HallNow { occupied: boolean; fit: FitClass; dept: number; level: number }

export interface CityMoment {
  halls: Map<string, HallNow>;
  districts: Map<number, DistrictNow>;
  /** مجموع الكلية الآن. */
  total: { inUse: number; pressed: number; empty: number; halls: number };
}

/** حال المدينة في يومٍ ودقيقة: لون كل قاعة، وأعداد كل حي. */
export function cityAt(city: CampusCity, day: PulseDay, minute: number): CityMoment {
  const occ = occupantsAt(city.model, city.assignment, day, minute);
  const halls = new Map<string, HallNow>();
  const districts = new Map<number, DistrictNow>();
  for (const d of city.districts) districts.set(d.dept.id, { dept: d.dept.id, inUse: 0, pressed: 0, full: 0, empty: 0, owned: d.halls.length, students: 0, load: 0, mood: "idle" });
  let inUse = 0, pressed = 0, empty = 0;
  for (const h of city.model.halls) {
    const s = occ.get(h.key);
    const owner = city.hallOwner.get(h.key) || 0;
    if (!s && foreignAt(city.model, h.key, day, minute)) {
      /* محجوزةٌ لجدولٍ خارج صفوف العميد (من حمل القاعات): مشغولةٌ بلا شعبةٍ نعرف ملاءمتها، تُحسب لحيّ مالكها. */
      halls.set(h.key, { occupied: true, fit: "unknown", dept: owner, level: 0.55 });
      inUse++;
      const d = districts.get(owner);
      if (d) d.inUse++;
      continue;
    }
    if (!s) {
      halls.set(h.key, { occupied: false, fit: "unknown", dept: owner, level: 0 });
      const d = districts.get(owner);
      if (d) d.empty++;
      empty++;
      continue;
    }
    const fit = fitClass(s.students, h.capacity);
    halls.set(h.key, { occupied: true, fit, dept: s.sectionId, level: fit === "unknown" ? 0.55 : Math.min(1.15, (s.students || 0) / (h.capacity || 1)) });
    inUse++;
    if (fit === "pressed") pressed++;
    const d = districts.get(s.sectionId) || districts.get(owner);
    if (!d) continue;
    d.inUse++;
    d.students += Number(s.students || 0);
    if (fit === "pressed") d.pressed++;
    else if (fit === "full") d.full++;
  }
  for (const d of districts.values()) {
    d.load = d.owned ? Math.min(1, d.inUse / d.owned) : d.inUse ? 1 : 0;
    d.mood = moodOf(d);
  }
  return { halls, districts, total: { inUse, pressed, empty, halls: city.model.halls.length } };
}

export function moodOf(d: Pick<DistrictNow, "inUse" | "pressed" | "load">): DistrictMood {
  if (d.pressed > 0) return "choke";
  if (d.inUse > 0 && d.load >= 0.7) return "busy";
  if (d.inUse > 0) return "calm";
  return "idle";
}

/** القاعات المشغولة في دقيقة: شعب الكلية، ومعها ما يحجزه جدولٌ خارجها (من حمل القاعات). */
function busyCount(city: CampusCity, occ: Map<string, unknown>, day: PulseDay, minute: number): number {
  let n = occ.size;
  for (const h of city.model.halls) if (!occ.has(h.key) && foreignAt(city.model, h.key, day, minute)) n++;
  return n;
}

/** أزحم لحظةٍ في اليوم للكلية كلها (أكثر القاعات المشغولة، والأبكر عند التساوي). */
export function busiestCityMinute(city: CampusCity, day: PulseDay): number | null {
  let best: number | null = null, bestCount = 0;
  for (let m = city.model.dayStart; m < city.model.dayEnd; m += 5) {
    const count = busyCount(city, occupantsAt(city.model, city.assignment, day, m), day, m);
    if (count > bestCount) { bestCount = count; best = m; }
  }
  return best;
}

/** منحنى اليوم: عدد القاعات المشغولة والمضغوطة كل خطوة (لشريط الساعة). */
export function cityCurve(city: CampusCity, day: PulseDay, step = 10): Array<{ minute: number; busy: number; pressed: number }> {
  const out: Array<{ minute: number; busy: number; pressed: number }> = [];
  for (let m = city.model.dayStart; m < city.model.dayEnd; m += step) {
    const occ = occupantsAt(city.model, city.assignment, day, m);
    let pressed = 0;
    for (const [key, s] of occ) if (fitClass(s.students, city.model.hallByKey.get(key)?.capacity) === "pressed") pressed++;
    out.push({ minute: m, busy: busyCount(city, occ, day, m), pressed });
  }
  return out;
}

/** القاعة التي يُفتح عليها نبض القسم: أشدّ قاعاته الآن، ثم أي مشغولةٍ له، ثم أولى قاعاته. */
export function districtFocusHall(city: CampusCity, moment: CityMoment, dept: number): string | null {
  const rank: Record<FitClass, number> = { pressed: 4, full: 3, fit: 2, wide: 1, unknown: 0 };
  let best: string | null = null, bestRank = -1;
  for (const [key, h] of moment.halls) {
    if (!h.occupied || h.dept !== dept) continue;
    if (rank[h.fit] > bestRank) { best = key; bestRank = rank[h.fit]; }
  }
  return best || city.districtOf.get(dept)?.halls[0] || null;
}

export const dayIndexOf = (day: PulseDay) => Math.max(0, PULSE_DAYS.findIndex(d => d.key === day));

/* ── المخطّط ────────────────────────────────────────────────────────────── */

export const STREET = 7;
const EMPTY_PLOT_W = 12, EMPTY_PLOT_D = 9, PLOT_PAD = 2.6;

export interface DistrictSpot {
  dept: number;
  /** حدود أرض الحي. */
  x0: number; z0: number; w: number; d: number;
  cx: number; cz: number;
  /** ارتفاع أعلى مبنى فيه. */
  top: number;
}

export interface CampusBuildingSpot extends BuildingSpot { owner: number; shares: CampusShare[]; shared: boolean }

export interface CampusLayout {
  districts: DistrictSpot[];
  spots: Map<string, HallSpot>;
  buildings: CampusBuildingSpot[];
  width: number; depth: number; height: number;
  cx: number; cz: number;
}

/**
 * الأحياء صفوفاً بعرض مربّعٍ تقريباً، وبينها شوارع؛ ومباني كل حيٍّ بمخطّط النبض نفسه
 * فتبدو المدينة عالم النبض مبتعداً. حيٌّ بلا مبنى أرضٌ صغيرة فارغة.
 */
export function layoutCampus(city: CampusCity, opts: { cols?: number; perRow?: number } = {}): CampusLayout {
  const parts = city.districts.map(district => {
    const halls = district.buildings.flatMap(code => {
      const b = city.buildings.find(x => x.code === code)!;
      return b.halls.map(k => city.model.hallByKey.get(k)!).filter(Boolean);
    });
    const inner = halls.length ? layoutHalls(halls, { perRow: opts.perRow ?? (halls.length > 40 ? 8 : 6), cols: district.buildings.length <= 2 ? district.buildings.length : 2 }) : null;
    const w = inner ? inner.width + PLOT_PAD * 2 : EMPTY_PLOT_W;
    const d = inner ? inner.depth + PLOT_PAD * 2 : EMPTY_PLOT_D;
    return { district, inner, w, d };
  });
  const n = parts.length;
  const cols = Math.max(1, opts.cols ?? (n <= 2 ? n : Math.ceil(Math.sqrt(n * 1.2))));
  const districts: DistrictSpot[] = [];
  const spots = new Map<string, HallSpot>();
  const buildings: CampusBuildingSpot[] = [];
  let x = 0, z = 0, rowDepth = 0, col = 0, maxX = 0, height = 0;
  /* صفوفٌ يُقاس عرض كلٍّ منها، فتُوسَّط تحت بعضها لا تُلصق بالحافة. */
  const rows: Array<typeof parts> = [];
  for (let i = 0; i < n; i += cols) rows.push(parts.slice(i, i + cols));
  const rowWidths = rows.map(r => r.reduce((s, p) => s + p.w, 0) + STREET * (r.length - 1));
  const widest = Math.max(0, ...rowWidths);
  rows.forEach((row, ri) => {
    x = (widest - rowWidths[ri]) / 2; rowDepth = 0; col = 0;
    for (const p of row) {
      const ox = x + PLOT_PAD, oz = z - PLOT_PAD;
      let top = 0;
      if (p.inner) {
        for (const s of p.inner.spots.values()) spots.set(s.key, { ...s, x: s.x + ox, z: s.z + oz });
        for (const b of p.inner.buildings) {
          const cb = city.buildings.find(c => c.code === b.code)!;
          buildings.push({ ...b, cx: b.cx + ox, cz: b.cz + oz, owner: cb.owner, shares: cb.shares, shared: cb.shared });
          top = Math.max(top, b.top);
        }
      }
      districts.push({ dept: p.district.dept.id, x0: x, z0: z, w: p.w, d: p.d, cx: x + p.w / 2, cz: z - p.d / 2, top });
      height = Math.max(height, top);
      rowDepth = Math.max(rowDepth, p.d);
      x += p.w + STREET; col++;
      maxX = Math.max(maxX, x - STREET);
    }
    z -= rowDepth + STREET;
  });
  const depth = -(z + STREET);
  /* القراءة من اليمين: أول الأقسام في يمين المدينة. يُنقل كل حيٍّ كتلةً واحدة، ومبانيه
     وقاعاته داخله كما يرسمها النبض. */
  const W = Math.max(maxX, widest);
  const shift = new Map<number, number>();
  for (const d of districts) { const dx = W - d.x0 - d.w - d.x0; shift.set(d.dept, dx); d.x0 += dx; d.cx += dx; }
  const deptOfBuilding = new Map<string, number>();
  for (const p of parts) for (const code of p.district.buildings) deptOfBuilding.set(code, p.district.dept.id);
  for (const b of buildings) b.cx += shift.get(deptOfBuilding.get(b.code) ?? -1) || 0;
  for (const [key, s] of spots) s.x += shift.get(deptOfBuilding.get(city.buildingOf.get(key) || "") ?? -1) || 0;
  return { districts, spots, buildings, width: Math.max(maxX, widest), depth: Math.max(0, depth), height: Math.max(2, height), cx: Math.max(maxX, widest) / 2, cz: -Math.max(0, depth) / 2 };
}

/* ── النصوص ─────────────────────────────────────────────────────────────── */

/** ترتيب القائمة: الأشدّ ضغطاً أولاً، ثم الأعلى حملاً، ثم ترتيب الأقسام. */
export function districtOrder(city: CampusCity, moment: CityMoment): CampusDistrict[] {
  const rank: Record<DistrictMood, number> = { choke: 3, busy: 2, calm: 1, idle: 0 };
  return [...city.districts].sort((a, b) => {
    const x = moment.districts.get(a.dept.id)!, y = moment.districts.get(b.dept.id)!;
    return rank[y.mood] - rank[x.mood] || y.pressed - x.pressed || y.load - x.load || city.districts.indexOf(a) - city.districts.indexOf(b);
  });
}
