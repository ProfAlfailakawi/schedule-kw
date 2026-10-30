/**
 * ── «زميلان يعملان الآن» للإرشاد والتسجيل: حسابٌ صرف يقرؤه الخادمُ والمتصفّح معاً ──────────
 *
 * لجنةُ الجدول ترى من يبني موعداً معها (scheduleHolds). وهنا الشيءُ نفسه لفريق الإرشاد وفريق
 * التسجيل ولجنة القسم على كشف التسجيل: من في فريقي ونطاقي الآن، وعلى ماذا يعمل كلٌّ منهم.
 *
 *   • الفريقُ يقوله الخادمُ من صفة الحساب (teamOf)، لا المتصفّح: المرشدُ لا يرى التسجيلَ ولا العكس.
 *   • «على ماذا» شيءٌ واحد بعينه: طلبُ شعبة، أو مقاعدُ مرشدٍ لمقرّر، أو حالةُ طالب (WorkMark).
 *   • والتقاءُ اثنين على الشيء نفسه تنبيهٌ لا منع (workClashes). ما يمنع الكتابةَ فوق زميلٍ
 *     هو ختمُ الإصدار عند الحفظ، لا هذا.
 *
 * لا قراءةَ هنا ولا كتابة: الخادمُ يحفظ ما يصله في الذاكرة (src/server/teamPresence.ts) مع نبضة
 * اللسان (livePulse)، فلا وثيقةَ تُكتب لحضورٍ عمرُه ثوانٍ.
 */

export type Team = "advising" | "registration" | "committee";
export type WorkKind = "sectionRequest" | "advisorSeats" | "studentCase";
export type TeamScreen = "registration" | "radar";

export const TEAMS: readonly Team[] = ["advising", "registration", "committee"];
export const WORK_KINDS: readonly WorkKind[] = ["sectionRequest", "advisorSeats", "studentCase"];
export const TEAM_SCREENS: readonly TeamScreen[] = ["registration", "radar"];

/** عمرُ «أعمل على هذا» بعد آخر لمسة — كحجز لجنة الجدول (دقيقتان). */
export const TEAM_HOLD_TTL_MS = 120_000;
/** من لم يسأل منذ هذا فقد غادر (ثلاثُ نبضاتٍ بطيئة، كـPULSE_TTL_MS). */
export const TEAM_GONE_MS = 90_000;
/** أقصى ما يُعاد من الزملاء في جوابٍ واحد. */
export const TEAM_PEERS_MAX = 40;

export const TEAM_LABEL: Record<Team, string> = { advising: "فريق الإرشاد", registration: "فريق التسجيل", committee: "لجنة القسم" };
/** لونُ الفريق: حلقةٌ حول الوجوه، والأشخاصُ بألوانهم داخلها. */
export const TEAM_HUE: Record<Team, number> = { advising: 178, registration: 262, committee: 200 };
export const WORK_ICON: Record<WorkKind, string> = { sectionRequest: "📝", advisorSeats: "🎟️", studentCase: "🎓" };
export const WORK_NOUN: Record<WorkKind, string> = { sectionRequest: "طلب شعبة", advisorSeats: "مقاعد", studentCase: "حالة" };
export const SCREEN_ICON: Record<TeamScreen, string> = { registration: "📋", radar: "🧭" };
export const SCREEN_LABEL: Record<TeamScreen, string> = { registration: "كشف التسجيل", radar: "رادار التسجيل" };

export interface WorkMark { kind: WorkKind; id: string; label: string }

/** زميلٌ كما يصل المتصفّح. لا رقمَ حسابٍ فيه: `id` معرّفٌ ثابتٌ مشتقّ لا يُعكس. */
export interface TeamPeer {
  id: string;
  name: string;
  team: Team;
  screen: TeamScreen;
  work: WorkMark | null;
  /** متى بدأ العملَ على ما هو عليه (أو متى فتح الشاشة). */
  since: number;
  /** آخرُ لحظةٍ كان فيها أمام شاشته. الترتيبُ بها: الأحدثُ أولاً. */
  activeAt: number;
  /** ينتهي «أعمل على هذا» إن لم يلمسه؛ 0 بلا عمل. بساعة الخادم حتى يصحّحها المتصفّح. */
  expiresAt: number;
  /** حاضرٌ لكنه ليس أمام شاشته الآن (لسانٌ في الخلفية). */
  away: boolean;
}

const ID_TEXT = /^[A-Za-z0-9:._-]{1,80}$/;
const cleanText = (value: unknown, max: number) =>
  String(value ?? "").replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

export const isTeam = (value: unknown): value is Team => TEAMS.includes(value as Team);
export const isWorkKind = (value: unknown): value is WorkKind => WORK_KINDS.includes(value as WorkKind);
export const isTeamScreen = (value: unknown): value is TeamScreen => TEAM_SCREENS.includes(value as TeamScreen);

/** «أعمل على…» من طلب النبضة: نوعٌ معروف ومعرّفٌ بحروفٍ آمنة ووصفٌ قصير، أو null. */
export function parseWorkMark(kind: unknown, id: unknown, label: unknown): WorkMark | null {
  if (!isWorkKind(kind)) return null;
  const key = String(id ?? "").trim();
  if (!ID_TEXT.test(key)) return null;
  return { kind, id: key, label: cleanText(label, 40) };
}

export const sameWork = (a: WorkMark | null | undefined, b: WorkMark | null | undefined) =>
  Boolean(a && b && a.kind === b.kind && a.id === b.id);

/** «📝 طلب شعبة إدارة مراكز» — ما يُقال عن عمل الزميل في القائمة والتنبيه. */
export function workText(work: WorkMark | null | undefined, screen?: TeamScreen): { icon: string; text: string } {
  if (work) return { icon: WORK_ICON[work.kind], text: `${WORK_NOUN[work.kind]}${work.label ? ` ${work.label}` : ""}` };
  const where: TeamScreen = screen && isTeamScreen(screen) ? screen : "registration";
  return { icon: SCREEN_ICON[where], text: SCREEN_LABEL[where] };
}

/** الزملاءُ الذين يعملون الآن على الشيء نفسه الذي أعمل عليه (أو أنظر إليه). */
export function workClashes(peers: readonly TeamPeer[] | null | undefined, target: { kind: WorkKind; id: string } | null | undefined, now = Date.now()): TeamPeer[] {
  if (!target || !Array.isArray(peers)) return [];
  return peers.filter(peer => peer?.work && peer.work.kind === target.kind && peer.work.id === String(target.id) && Number(peer.expiresAt) > now);
}

/** الأحدثُ نشاطاً أولاً، ثم الأقدمُ عملاً، ثم الاسم — ترتيبٌ ثابت لا يرتجف بين نبضتين. */
export function orderPeers<T extends { activeAt: number; since: number; name: string; id: string }>(peers: readonly T[]): T[] {
  return [...peers].sort((a, b) => Number(b.activeAt) - Number(a.activeAt) || Number(a.since) - Number(b.since)
    || String(a.name).localeCompare(String(b.name), "ar") || String(a.id).localeCompare(String(b.id)));
}

/** ما يصل من الخادم يُقرأ بحذر: حقولٌ معروفة فقط، ووقتٌ مصحّحٌ بفارق الساعتين. */
export function readPeers(raw: unknown, skewMs = 0): TeamPeer[] {
  if (!Array.isArray(raw)) return [];
  const out: TeamPeer[] = [];
  for (const item of raw.slice(0, TEAM_PEERS_MAX)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, any>;
    const work = row.work ? parseWorkMark(row.work.kind, row.work.id, row.work.label) : null;
    const id = cleanText(row.id, 40);
    if (!id) continue;
    out.push({
      id,
      name: cleanText(row.name, 80) || "زميل",
      team: isTeam(row.team) ? row.team : "committee",
      screen: isTeamScreen(row.screen) ? row.screen : "registration",
      work,
      since: Number(row.since) - skewMs || 0,
      activeAt: Number(row.activeAt) - skewMs || 0,
      expiresAt: work && Number(row.expiresAt) > 0 ? Number(row.expiresAt) - skewMs : 0,
      away: row.away === true,
    });
  }
  return orderPeers(out);
}
