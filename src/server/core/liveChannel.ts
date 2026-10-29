/**
 * ── القناة الحيّة: بثُّ التغييرات والحضور ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Response } from "express";
import { Repository } from "../../db/repository";
import { clearScheduleCacheQuietly, onSchedulesInvalidated } from "../../db/referenceCache";
import { createChangeClock } from "../livePulse";
import { createCoalescer } from "../notificationCache";
import { state } from "./state";
import type { AuthenticatedRequest } from "./auth";
import { hallBarterBoardCache } from "./hallBarter";
import { bellBlockingMemo, studentQueueMemo } from "./notifications";
import { livingResponseCache } from "./versions";

/**
 * The living schedule: one message the moment anything changes.
 *
 * Every write to the timetable — a save, a drag, a delete, a term copy, an
 * import — already announces itself by clearing the schedule cache. This
 * channel forwards that announcement to every open screen as a server-sent
 * event, so a colleague's change appears on your board by itself, without
 * anyone pressing refresh. The event deliberately carries no rows: each
 * listener re-reads its own scope through the normal scoped road, so the
 * permission walls stay exactly where they are.
 *
 * A short debounce turns a burst of writes (a six-card drag, an import) into
 * one message, sent after the write has actually landed.
 */
/**
 * ── من غيري هنا ────────────────────────────────────────────────────────────
 *
 * A live connection used to be an anonymous socket: the registry held Response
 * objects and nothing else, which was enough to say "something changed" and not
 * enough to say anything about anyone. Presence needs the second thing, so the
 * Set becomes a Map from the same Response to what is known about the person
 * holding it — and stays keyed by the Response, so `.size` against the 400-cap
 * and delete-on-write-failure both keep working exactly as they did.
 *
 * Nothing here is ever written to a database. A hover is true for a few seconds
 * and then it is not; storing it would cost a document write per mouse move and
 * would outlive the fact it describes.
 */
interface PresenceMark {
  /** The cell under the pointer, when there is one. Touch has no hover. */
  cell: { day: string; start: string; room?: string } | null;
  /** A card in the air — by pointer or by keyboard, the two are the same news. */
  holding: { rowId: number; rev: number } | null;
  /** A row open in the editor. */
  editing: { rowId: number; rev: number } | null;
}

export interface ScheduleEventClient extends PresenceMark {
  res: Response;
  /** Names this exact stream, so a POST can address the connection it belongs to. */
  connId: string;
  userId: number;
  name: string;
  /** college:section:term — presence is scoped to a board, never to a person. */
  scopeKey: string;
  collegeId: number;
  sectionId: number;
  /** Demo streams are private to one sandbox even when their academic scope matches. */
  demoSessionId: string;
  /** When the mark was last refreshed, and when the connection last spoke. */
  markAt: number;
  seenAt: number;
}

export const scheduleEventClients = new Map<Response, ScheduleEventClient>();
let scheduleEventTimer: ReturnType<typeof setTimeout> | null = null;
let scheduleEventSerial = 0;
/* The same two pieces of news, kept as times for the screens that ask instead
   of listening (the pulse below; src/server/livePulse.ts explains why). */
export const scheduleChangeClock = createChangeClock(Date.now());
export const notifyClock = createChangeClock(Date.now());
/** Writes the event to every screen attached to THIS instance. */
export function broadcastScheduleChange(demoSessionId = "") {
  // One time for both channels, so a screen holding a stream can tell that
  // the pulse is repeating news the stream already delivered.
  const changedAt = Date.now();
  scheduleChangeClock.bump(demoSessionId, changedAt);
  scheduleEventSerial += 1;
  const payload = `id: ${scheduleEventSerial}\nevent: schedules\ndata: {"changedAt":${changedAt}}\n\n`;
  for (const [response, client] of scheduleEventClients) {
    if (demoSessionId && client.demoSessionId !== demoSessionId) continue;
    try { response.write(payload); } catch { scheduleEventClients.delete(response); }
  }
}

/**
 * ── نبضةُ الإشعارات ───────────────────────────────────────────────────────
 * لا تحمل شيئاً: تقول لكل شاشةٍ مفتوحة «اسأل عن إشعاراتك الآن»، فيسأل كلٌّ
 * بنطاقه هو. فيصل طلبُ الأستاذ أو قرارُ التسجيل في لحظته، لا بعد دقائق.
 */
/* نبضةٌ من صندوقٍ تجريبي لا توقظ إلا شاشاتِ ذلك الصندوق: قرارٌ وهميّ لا يجعل
   كلَّ شاشةٍ حقيقية تعيد سؤال جرسها. */
export function broadcastNotify(demoSessionId = "") {
  notifyClock.bump(demoSessionId);
  scheduleEventSerial += 1;
  const payload = `id: ${scheduleEventSerial}\nevent: notify\ndata: {"at":${Date.now()}}\n\n`;
  for (const [response, client] of scheduleEventClients) {
    if (demoSessionId && client.demoSessionId !== demoSessionId) continue;
    try { response.write(payload); } catch { scheduleEventClients.delete(response); }
  }
}
/* «/api/student-registration»: قرارُ اللجنة يصل التسجيلَ، وقرارُ التسجيل يصل
   القسمَ — لكن بنبضةٍ مجمّعة (ثلاث ثوانٍ): اللجنةُ تقرّر مقرّراً بعد مقرّر،
   وكلُّ نبضةٍ توقظ كلَّ شاشةٍ فتسأل جرسها. وكلُّ كتابةٍ تمحو مجموعَ الكشف
   المحفوظ للجرس (studentQueueMemo) قبل أن تصل النبضة. */
export const broadcastStudentNotifySoon = createCoalescer(3000, broadcastNotify);

/* A mark older than this is treated as stale — the person is still connected,
   but wherever their pointer was, it is not news any more. A connection that
   has not spoken at all for the longer window stops being listed: a stream is
   authorised once at connect and never re-checked, so silence is the cheap
   stand-in for asking again. */
const PRESENCE_STALE_MS = 45_000;
const PRESENCE_GONE_MS = 90_000;
const presenceDirty = new Set<string>();
let presenceFlushTimer: ReturnType<typeof setTimeout> | null = null;

export const emptyMark = (): PresenceMark => ({ cell: null, holding: null, editing: null });
export const boardScopeKey = (req: AuthenticatedRequest, collegeId: number, sectionId: number, termId: number) => `${req.demoSessionId ? `demo:${req.demoSessionId}:` : ""}${collegeId}:${sectionId}:${termId}`;
const hasMark = (mark: PresenceMark) => Boolean(mark.cell || mark.holding || mark.editing);

/**
 * Everyone on one board, as that board's own members would see them.
 *
 * Scope-symmetric on purpose: an administrator's wider reach lets them read any
 * department's DATA, but presence is other people's names and movements, and
 * there is no version of this feature where someone learns who is working in a
 * college they are not in.
 */
export function presenceRoster(scopeKey: string, now: number) {
  const peers: Array<{ connId: string; userId: number; name: string } & PresenceMark> = [];
  for (const client of scheduleEventClients.values()) {
    if (client.scopeKey !== scopeKey) continue;
    if (now - client.seenAt > PRESENCE_GONE_MS) continue;
    const fresh = now - client.markAt <= PRESENCE_STALE_MS;
    peers.push({
      // Named field by field. `req.user` is the raw stored row and still carries
      // the password hash and the login name; spreading it here would post both
      // to every colleague on the board.
      connId: client.connId, userId: client.userId, name: client.name,
      cell: fresh ? client.cell : null,
      holding: fresh ? client.holding : null,
      editing: fresh ? client.editing : null,
    });
  }
  return peers;
}

/** Writes the roster for one board to every connection watching that board. */
function broadcastPresence(scopeKey: string) {
  const now = Date.now();
  const peers = presenceRoster(scopeKey, now);
  // No `id:` line. The server never reads Last-Event-ID back, so a presence
  // frame must not look resumable — every frame is a whole roster, and a
  // reconnect is answered with a fresh one rather than a gap.
  const payload = `event: presence\ndata: ${JSON.stringify({ scope: scopeKey, at: now, peers })}\n\n`;
  for (const [res, client] of scheduleEventClients) {
    if (client.scopeKey !== scopeKey) continue;
    try { res.write(payload); } catch { scheduleEventClients.delete(res); }
  }
}

export function markPresenceDirty(scopeKey: string) {
  if (!scopeKey) return;
  presenceDirty.add(scopeKey);
  if (presenceFlushTimer) return;
  // A timer of its own. Sharing scheduleEventTimer would drop presence whenever
  // a schedule write was already pending, and would drag a Firestore write into
  // the path of a mouse move.
  presenceFlushTimer = setTimeout(() => {
    presenceFlushTimer = null;
    const scopes = [...presenceDirty];
    presenceDirty.clear();
    for (const scope of scopes) broadcastPresence(scope);
  }, 250);
}

/* A frozen tab, a closed laptop, or a session that quietly expired all look the
   same from here: the marks stop arriving. This is what turns that silence back
   into an empty chair. */
setInterval(() => {
  const now = Date.now();
  for (const client of scheduleEventClients.values()) {
    const stale = now - client.markAt > PRESENCE_STALE_MS;
    const gone = now - client.seenAt > PRESENCE_GONE_MS;
    if ((stale || gone) && hasMark(client)) {
      Object.assign(client, emptyMark());
      markPresenceDirty(client.scopeKey);
    } else if (gone) {
      markPresenceDirty(client.scopeKey);
    }
  }
}, 10_000).unref?.();
/* Everyone who wrote in the window, not only the first. The window used to keep
   the first writer's sandbox and drop the rest: a demo visitor's save and a
   coordinator's save landing in the same 350 ms became one announcement in the
   visitor's name, the coordinator's colleagues never heard of theirs, and the
   beacon stayed silent (it says nothing from inside a sandbox). */
const pendingScheduleSessions = new Set<string>();
onSchedulesInvalidated(() => {
  pendingScheduleSessions.add(Repository.currentDemoSessionId());
  if (scheduleEventTimer) return;
  scheduleEventTimer = setTimeout(() => {
    scheduleEventTimer = null;
    const sessions = [...pendingScheduleSessions];
    pendingScheduleSessions.clear();
    // A real change is written to every screen, sandboxes included, so once is enough.
    if (sessions.includes("")) broadcastScheduleChange("");
    else for (const session of sessions) broadcastScheduleChange(session);
    // …and tell the other instances, which never saw this write at all — as
    // the university, whichever sandbox happened to open the window.
    if (sessions.includes("")) void Repository.outsideDemoSandbox(() => Repository.markSchedulesChanged());
  }, 350);
});
/**
 * The other half of the live channel.
 *
 * Without this, "live" quietly meant "live for whoever shares my instance" —
 * the moment Cloud Run runs a second copy, half the users stop receiving their
 * colleagues' changes and nothing on screen suggests anything is wrong. The
 * beacon document is watched here, so a change written anywhere is announced
 * everywhere. The listener is started once the database is up.
 */
let stopScheduleBeacon: (() => void) | null = null;
export function listenForScheduleChangesAcrossInstances() {
  if (stopScheduleBeacon) return;
  stopScheduleBeacon = Repository.watchSchedulesChanged(() => {
    // Another instance wrote. Our cached rows are stale, so they are dropped —
    // quietly, because announcing a change we did not make would send the
    // beacon straight back out and the two instances would echo forever.
    clearScheduleCacheQuietly();
    studentQueueMemo.invalidate();
    bellBlockingMemo.invalidate();
    state.hallBarterSerial += 1;
    hallBarterBoardCache.clear();
    livingResponseCache.clear();
    broadcastScheduleChange();
  });
}
