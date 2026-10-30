/**
 * ── «زميلان يعملان الآن» للإرشاد والتسجيل، على الخادم (src/utils/teamWork.ts للحساب) ─────────
 *
 * كلُّ لسانٍ مفتوحٍ على كشف التسجيل أو الرادار يسأل النبضةَ (/api/schedules/pulse) كما يسألها لوحُ
 * الجدول، ويزيد عليها: «أنا في فريقي ونطاقي، وأعمل على هذا». يُحفظ ذلك هنا في الذاكرة وحدها —
 * حضورٌ عمرُه ثوانٍ لا يستحقّ وثيقةً تُكتب كل نبضة — ويُجاب بمن في الفريق والنطاق نفسيهما.
 *
 *   • النطاقُ: الفريق + الكلية + القسم + الفصل (+ صندوقُ العرض). لا يرى أحدٌ من خارجه أحداً.
 *   • الشخصُ لا الاتصال: عضوُ الفريق بحسابٍ مشترك شخصٌ مستقل (holdHolderOf)، ولسانان لشخصٍ واحد واحد.
 *   • «أعمل على هذا» يعيش دقيقتين بعد آخر نبضةٍ وهو أمام شاشته (TEAM_HOLD_TTL_MS)، كحجز اللجنة.
 *   • ساعةُ التغيير لكل كليةٍ وفصل (workClock): حفظُ زميلٍ يوقظ شاشاتِ نطاقه وحدها.
 *
 * والنبضةُ نفسُها تنام حين ينام اللسان، وتبطؤ حين يكون وحده (livePulse.ts): لا كلفةَ لمن لا رفقةَ له.
 */
import { createHash, randomBytes } from "crypto";
import { isAdvisorRole, isRegistrarRole } from "../utils/academicRoles";
import {
  orderPeers, sameWork, TEAM_GONE_MS, TEAM_HOLD_TTL_MS, TEAM_PEERS_MAX,
  type Team, type TeamPeer, type TeamScreen, type WorkMark,
} from "../utils/teamWork";

/** الفريقُ من صفة الحساب: التسجيلُ، والإرشاد، وما سواهما لجنةُ القسم (ومنها الإدارة). */
export function teamOf(user: any): Team {
  if (isRegistrarRole(user?.Role)) return "registration";
  if (isAdvisorRole(user?.Role)) return "advising";
  return "committee";
}

export const teamScopeKey = (demoSessionId: string, team: Team, collegeId: number, sectionId: number, termId: number) =>
  `${demoSessionId ? `demo:${demoSessionId}:` : ""}team:${team}:${collegeId}:${sectionId}:${termId}`;

export interface TeamEntry {
  connId: string;
  /** holdHolderOf(user).key — لا يغادر الخادم. */
  holder: string;
  name: string;
  team: Team;
  scopeKey: string;
  screen: TeamScreen;
  work: WorkMark | null;
  since: number;
  /** آخرُ نبضةٍ وهو أمام شاشته على العمل نفسه: منها ينتهي «أعمل على هذا». */
  workAt: number;
  activeAt: number;
  active: boolean;
  seenAt: number;
}

export interface TeamTouch {
  connId: string; holder: string; name: string; team: Team; scopeKey: string; screen: TeamScreen;
  work: WorkMark | null; active: boolean;
}

/** يسجّل نبضةً واحدة. العملُ الجديد يبدأ عدّاده من الآن، والقديمُ يتجدّد ما دام صاحبُه أمامه. */
export function touchTeamEntry(entries: Map<string, TeamEntry>, input: TeamTouch, now: number): TeamEntry {
  const prev = entries.get(input.connId);
  const samePlace = Boolean(prev && prev.scopeKey === input.scopeKey && prev.holder === input.holder);
  const sameTask = samePlace && (sameWork(prev!.work, input.work) || (!prev!.work && !input.work));
  const next: TeamEntry = {
    ...input,
    since: sameTask ? prev!.since : now,
    workAt: input.work ? (input.active || !sameTask ? now : prev!.workAt) : 0,
    activeAt: input.active ? now : (samePlace ? prev!.activeAt : now - TEAM_GONE_MS / 2),
    seenAt: now,
  };
  entries.set(input.connId, next);
  return next;
}

/** ينسى من توقّف عن السؤال. يُستدعى مع كل نبضة؛ فالذاكرةُ تبقى صغيرة. */
export function sweepTeamEntries(entries: Map<string, TeamEntry>, now: number, goneMs = TEAM_GONE_MS): void {
  for (const [key, entry] of entries) if (now - entry.seenAt > goneMs) entries.delete(key);
}

const SALT = randomBytes(12).toString("hex");
/** معرّفٌ ثابتٌ للشخص لا يكشف رقم حسابه ولا رقمَ عضوه. */
export const peerIdOf = (holder: string) => `p${createHash("sha256").update(`${SALT}:${holder}`).digest("base64url").slice(0, 12)}`;

/**
 * زملائي في نطاقي: كلُّ شخصٍ مرةً واحدة (أحدثُ ألسنته نشاطاً، ومن يعمل على شيءٍ يغلب من لا يعمل
 * إن تساويا)، بلا أنا، مرتّبين بالأحدث نشاطاً. حقولٌ مسمّاةٌ بأعيانها — لا holder ولا connId.
 */
export function teamRoster(entries: Iterable<TeamEntry>, scopeKey: string, selfHolder: string, now: number): TeamPeer[] {
  if (!scopeKey) return [];
  const best = new Map<string, TeamEntry>();
  for (const entry of entries) {
    if (entry.scopeKey !== scopeKey || entry.holder === selfHolder || now - entry.seenAt > TEAM_GONE_MS) continue;
    const have = best.get(entry.holder);
    const working = (row: TeamEntry) => Boolean(row.work && row.workAt + TEAM_HOLD_TTL_MS > now);
    if (!have || entry.activeAt > have.activeAt || (entry.activeAt === have.activeAt && working(entry) && !working(have))) best.set(entry.holder, entry);
  }
  const peers: TeamPeer[] = [...best.values()].map(entry => {
    const live = Boolean(entry.work && entry.workAt + TEAM_HOLD_TTL_MS > now);
    return {
      id: peerIdOf(entry.holder),
      name: entry.name,
      team: entry.team,
      screen: entry.screen,
      work: live ? { ...entry.work! } : null,
      since: entry.since,
      activeAt: entry.activeAt,
      expiresAt: live ? entry.workAt + TEAM_HOLD_TTL_MS : 0,
      away: !entry.active,
    };
  });
  return orderPeers(peers).slice(0, TEAM_PEERS_MAX);
}

/** كم زميلاً أمام شاشته الآن — ما يُسرع النبضة (livePulse.ts). */
export const teamCompany = (peers: readonly TeamPeer[]) => peers.filter(peer => !peer.away).length;

/**
 * متى تغيّر شيءٌ في كليةٍ وفصل — للجامعة، ولكل صندوق عرضٍ وحده. الصندوقُ يسمع الحقيقيَّ وما
 * يخصّه، كساعة الجدول (createChangeClock). يبدأ من لحظة تشغيل العملية: إعادةُ تشغيلٍ قد تُضيع
 * تغييراً قبلها، وقراءةٌ زائدةٌ واحدة ثمنٌ صحيح لكي لا يضيع شيء.
 */
export function createScopedClock(startedAt: number, cap = 4000) {
  const stamps = new Map<string, number>();
  const key = (demo: string, collegeId: number, termId: number) => `${demo}|${Number(collegeId) || 0}:${Number(termId) || 0}`;
  return {
    bump(demoSessionId: string, collegeId: number, termId: number, at = Date.now()) {
      const k = key(demoSessionId || "", collegeId, termId);
      stamps.set(k, Math.max(stamps.get(k) || 0, at));
      if (stamps.size > cap) {
        const oldest = [...stamps].sort((a, b) => a[1] - b[1]).slice(0, stamps.size - cap);
        for (const [gone] of oldest) stamps.delete(gone);
      }
    },
    read(demoSessionId: string, collegeId: number, termId: number): number {
      const real = stamps.get(key("", collegeId, termId)) || startedAt;
      return demoSessionId ? Math.max(real, stamps.get(key(demoSessionId, collegeId, termId)) || 0) : real;
    },
  };
}

export const teamEntries = new Map<string, TeamEntry>();
export const workClock = createScopedClock(Date.now());

/** حفظُ زميلٍ في كليةٍ وفصل: شاشاتُ النطاق تقرأ من جديد في نبضتها التالية. */
export function bumpTeamWork(demoSessionId: string, collegeId: number, termId: number): void {
  if (!collegeId || !termId) return;
  workClock.bump(demoSessionId || "", collegeId, termId);
}
