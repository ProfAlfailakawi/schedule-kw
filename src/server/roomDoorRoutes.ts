/**
 * ── بابُ القاعة وشاشةُ الممر: المسارات ───────────────────────────────────────
 *
 *   GET /d/:token            صفحةُ القاعة (‎?screen=1‎ وضعُ الشاشة)
 *   GET /d/:token/now        بياناتُها الحيّة (JSON) — تُسأل كل دقيقة
 *   GET /b/:token            لوحةُ المبنى: بلاطةٌ لكل قاعة (‎?screen=1‎ للممر)
 *   GET /b/:token/now        بياناتُ اللوحة (JSON)
 *   GET /api/room-door/links?buildingId=…   روابطُ المبنى وقاعاته لشاشة السجل
 *
 * الصفحاتُ عامّة للقراءة وحدها: رمزُ الملصق هو المفتاح (roomDoorSecret.ts)،
 * ولا يخرج منها إلا رمزُ المقرر واسمُه وشعبتُه ووقتُه (roomDoorData.ts).
 * وهي خارج ‎/api/public‎ عن قصد: ذاك سقفُه ستون طلباً في الدقيقة لكل عنوان،
 * وشبكةُ الجامعة عنوانٌ واحدٌ لآلاف الطلبة يمسحون الملصقات بين محاضرتين.
 * فلها حدُّها السخيّ لكل عنوان (ROOM_DOOR_PER_IP_PER_MINUTE)، وذاكرةٌ لكل قاعةٍ
 * ولكل مبنى دقيقةً — فلا تقرأ ألفُ زيارةٍ الفصلَ ألفَ مرّة.
 *
 * والروابطُ يأخذها مديرُ السجل وحده (حارسُ شاشة المباني والقاعات نفسُه).
 */
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { Repository } from "../db/repository";
import { BUILD_STAMP } from "../generated/buildStamp";
import type { FSchedule, MasterBuilding, MasterRoom } from "../types";
import { compareDoorRooms, doorClockAt, roomFloor } from "../utils/roomDoor";
import { createTtlMemo } from "./notificationCache";
import {
  boardDoorData, buildDoorTermIndex, currentDoorTerm, doorBuildingEligible, doorBuildingInfo, doorRoomEligible, roomDoorData,
  type BoardDoorData, type DoorTermIndex, type RoomDoorData,
} from "./roomDoorData";
import { boardDoorPage, doorMissingPage, roomDoorPage } from "./roomDoorPage";
import {
  buildingDoorToken, createRoomDoorKeyResolver, demoDoorTag, demoDoorToken, parseDoorToken, roomDoorToken,
} from "./roomDoorSecret";

type Registry = { buildings: MasterBuilding[]; rooms: MasterRoom[] };

export interface RoomDoorDeps {
  /** يضبط سياسة المحتوى الصارمة للصفحة العامة ويعيد رقمها الخاص (nonce). */
  publicPageNonce: (res: Response) => string;
  /** سجلُّ المباني والقاعات كما يقرؤه الخادم (مع بذرته، وبذاكرته). */
  readLocationRegistry: () => Promise<Registry>;
  /** يحوّل صفاً قديماً إلى هويته في السجل بنطاق كليته (canonicalizeHistoricalLocationForRuntime). */
  normalizeLocation: (row: FSchedule, registry: Registry) => FSchedule;
  /** حارسُ شاشة السجل: من يدير المباني والقاعات يأخذ روابط ملصقاتها. */
  requireRegistryAdmin: RequestHandler[];
  /** اللحظةُ الحاضرة (للاختبار). */
  now?: () => number;
  /** السرُّ المشترك (للاختبار)؛ الافتراضيُّ Repository.getSharedServerSecret. */
  sharedSecret?: () => Promise<string>;
}

export const roomDoorHref = (token: string): string => `/d/${token}`;
export const boardDoorHref = (token: string): string => `/b/${token}`;

const intFromEnv = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
};

/**
 * ساعةُ التطوير: في البيئة التجريبية خارج الإنتاج وحدها يمكن أن تبدأ الصفحةُ من
 * لحظةٍ مختارة (ROOM_DOOR_FAKE_NOW) ثم تمضي — لتصوير الشاشة في وقت المحاضرات.
 * لا أثر لها في أي نشرٍ حقيقي.
 */
function doorClock(): () => number {
  const fake = Date.parse(String(process.env.ROOM_DOOR_FAKE_NOW || ""));
  if (!Number.isFinite(fake) || process.env.NODE_ENV === "production" || process.env.DATA_MODE !== "demo") return Date.now;
  const boot = Date.now();
  return () => fake + (Date.now() - boot);
}

/* الذاكرةُ للعالم الحقيقي وحده: صندوقُ التجربة صغيرٌ ويُقرأ كما هو، ولا يدخل ذاكرةً
   مشتركة ولا يقرأ منها (كما في studentDoorRoutes). */
const scoped = <T,>(memo: ReturnType<typeof createTtlMemo<T>>) => ({
  get: (key: string, load: () => Promise<T>): Promise<T> => (Repository.isDemoRequest() ? load() : memo.get(key, load)),
});

/** وسومُ الصناديق التجريبية التي أخذت روابط: وسمٌ ← جلسة. تُنسى بعد ساعتين، ولا تتجاوز خمسمئة. */
const demoTags = new Map<string, { sessionId: string; at: number }>();
const DEMO_TAG_TTL_MS = 2 * 60 * 60_000;
function rememberDemoTag(tag: string, sessionId: string): void {
  demoTags.delete(tag);
  demoTags.set(tag, { sessionId, at: Date.now() });
  while (demoTags.size > 500) demoTags.delete(demoTags.keys().next().value as string);
}

interface DoorDirectory {
  roomByToken: Map<string, MasterRoom>;
  buildingByToken: Map<string, MasterBuilding>;
  buildingById: Map<string, MasterBuilding>;
  tokenOfRoom: Map<string, string>;
  tokenOfBuilding: Map<string, string>;
  roomsOfBuilding: Map<string, MasterRoom[]>;
}

function buildDirectory(registry: Registry, key: string): DoorDirectory {
  const buildingById = new Map(registry.buildings.filter(doorBuildingEligible).map(building => [building.id, building]));
  const dir: DoorDirectory = {
    roomByToken: new Map(), buildingByToken: new Map(), buildingById,
    tokenOfRoom: new Map(), tokenOfBuilding: new Map(), roomsOfBuilding: new Map(),
  };
  for (const room of registry.rooms) {
    if (!doorRoomEligible(room) || !buildingById.has(room.buildingId)) continue;
    const token = roomDoorToken(key, room.id);
    dir.roomByToken.set(token, room);
    dir.tokenOfRoom.set(room.id, token);
    const list = dir.roomsOfBuilding.get(room.buildingId);
    if (list) list.push(room); else dir.roomsOfBuilding.set(room.buildingId, [room]);
  }
  for (const building of buildingById.values()) {
    const token = buildingDoorToken(key, building.id);
    dir.buildingByToken.set(token, building);
    dir.tokenOfBuilding.set(building.id, token);
  }
  return dir;
}

/** ما يعود به فتحُ الرمز: القيمة، أو حالُ الخطأ ورسالتُه. */
type Outcome<T> = { ok: boolean; value?: T; status: number; message: string };
const missing = <T,>(message = "هذا الرمز لا يشير إلى قاعةٍ الآن."): Outcome<T> => ({ ok: false, status: 404, message });

export function registerRoomDoorRoutes(app: Express, deps: RoomDoorDeps): void {
  const now = deps.now || doorClock();
  const doorKey = createRoomDoorKeyResolver(deps.sharedSecret || (() => Repository.getSharedServerSecret()));
  const directoryMemo = scoped(createTtlMemo<DoorDirectory>({ ttlMs: 60_000 }));
  const indexMemo = scoped(createTtlMemo<DoorTermIndex>({ ttlMs: 60_000 }));
  /* ذاكرةٌ لكل قاعة ولكل مبنى، بمفتاح التاريخ: أسبوعُ القاعة يتغيّر مع اليوم لا مع الدقيقة. */
  const roomMemo = scoped(createTtlMemo<RoomDoorData>({ ttlMs: 60_000 }));
  const boardMemo = scoped(createTtlMemo<BoardDoorData>({ ttlMs: 60_000 }));

  const directory = async (registry: Registry): Promise<DoorDirectory> => {
    const key = await doorKey();
    return directoryMemo.get("directory", async () => buildDirectory(registry, key));
  };
  const termIndex = (termId: number, registry: Registry) => indexMemo.get(`term:${termId}`, async () => {
    const [rows, courses, exceptions] = await Promise.all([
      Repository.getSchedulesByScope({ termId }), Repository.getCourses(), Repository.getScheduleWeekExceptions(termId),
    ]);
    return buildDoorTermIndex({ termId, rows, courses, exceptions, normalize: row => deps.normalizeLocation(row, registry) });
  });
  const indexFor = async (registry: Registry, nowMs: number): Promise<DoorTermIndex | null> => {
    const terms = await Repository.getTerms();
    const current = currentDoorTerm(terms, nowMs);
    return current.term && current.inSession ? termIndex(Number(current.term.AdTermId), registry) : null;
  };

  /**
   * يفتح الرمزَ في عالَمه: الحقيقيُّ في البيانات الحقيقية (ولو حمل المتصفّحُ جلسةً
   * تجريبية)، والتجريبيُّ في صندوق صاحبه وحده — وإن انتهى الصندوق قيل ذلك.
   */
  const inWorld = async <T,>(raw: string, run: (token: string, wrap: (token: string) => string) => Promise<Outcome<T>>): Promise<Outcome<T>> => {
    const parsed = parseDoorToken(raw);
    if (!parsed) return missing();
    if (!parsed.demoTag) return Repository.outsideDemoSandbox(() => run(parsed.token, token => token));
    const entry = demoTags.get(parsed.demoTag);
    if (!entry || Date.now() - entry.at > DEMO_TAG_TTL_MS) return missing("انتهت جلسةُ التجربة التي أُنشئ منها هذا الرمز.");
    try {
      return await Repository.withDemoSandbox(entry.sessionId, () => run(parsed.token, token => demoDoorToken(parsed.demoTag!, token)));
    } catch (error: any) {
      if (String(error?.message) === "DEMO_SESSION_EXPIRED") { demoTags.delete(parsed.demoTag); return missing("انتهت جلسةُ التجربة التي أُنشئ منها هذا الرمز."); }
      throw error;
    }
  };

  const loadRoom = (raw: string) => inWorld<RoomDoorData>(raw, async (token, wrap) => {
    const registry = await deps.readLocationRegistry();
    const dir = await directory(registry);
    const room = dir.roomByToken.get(token);
    if (!room) return missing();
    const nowMs = now();
    const data = await roomMemo.get(`${room.id}|${doorClockAt(nowMs).date}`, async () => {
      const boardToken = dir.tokenOfBuilding.get(room.buildingId);
      return roomDoorData({
        room, building: dir.buildingById.get(room.buildingId), index: await indexFor(registry, nowMs), terms: await Repository.getTerms(),
        nowMs, build: BUILD_STAMP, boardHref: boardToken ? boardDoorHref(wrap(boardToken)) : "",
      });
    });
    return { ok: true, value: { ...data, at: nowMs }, status: 200, message: "" };
  });

  const loadBoard = (raw: string) => inWorld<BoardDoorData>(raw, async (token, wrap) => {
    const registry = await deps.readLocationRegistry();
    const dir = await directory(registry);
    const building = dir.buildingByToken.get(token);
    if (!building) return missing("هذا الرمز لا يشير إلى مبنىً الآن.");
    const nowMs = now();
    const data = await boardMemo.get(`${building.id}|${doorClockAt(nowMs).date}`, async () => boardDoorData({
      building,
      rooms: (dir.roomsOfBuilding.get(building.id) || []).map(room => ({ room, href: roomDoorHref(wrap(dir.tokenOfRoom.get(room.id)!)) })),
      index: await indexFor(registry, nowMs), terms: await Repository.getTerms(), nowMs, build: BUILD_STAMP,
    }));
    return { ok: true, value: { ...data, at: nowMs }, status: 200, message: "" };
  });

  /* ── الحدُّ: سخيٌّ لكل عنوان (شبكةُ الجامعة عنوانٌ واحد)، والذاكرةُ تحمل الباقي. ── */
  const wantsJson = (req: Request) => /\/now\/?$/.test(req.path);
  const limit = rateLimit({
    windowMs: 60_000,
    limit: intFromEnv("ROOM_DOOR_PER_IP_PER_MINUTE", 600),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req => `door:${ipKeyGenerator(req.ip || "unknown")}`,
    handler: (req, res) => {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.setHeader("Cache-Control", "no-store");
      if (wantsJson(req)) { res.status(429).json({ error: "طلباتٌ كثيرة من هذه الشبكة. انتظر دقيقةً ثم أعد المحاولة." }); return; }
      deps.publicPageNonce(res);
      res.status(429).type("html").send(doorMissingPage("طلباتٌ كثيرة من هذه الشبكة. انتظر دقيقةً ثم أعد المحاولة."));
    },
  });
  const quiet = (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Cache-Control", "no-store");
    next();
  };
  const page = (res: Response, status: number, html: string) => { res.status(status).setHeader("Content-Type", "text/html; charset=utf-8"); res.send(html); };
  const fail = (res: Response, json: boolean, error: unknown) => {
    console.error("[room-door]", error);
    if (json) { res.status(500).json({ error: "تعذّر تحميل حال القاعة الآن." }); return; }
    deps.publicPageNonce(res);
    page(res, 500, doorMissingPage("تعذّر تحميل حال القاعة الآن. أعد المحاولة بعد قليل."));
  };

  app.get("/d/:token/now", limit, quiet, async (req: Request, res: Response) => {
    try {
      const outcome = await loadRoom(String(req.params.token || ""));
      if (!outcome.ok || !outcome.value) { res.status(outcome.status).json({ error: outcome.message }); return; }
      res.json(outcome.value);
    } catch (error) { fail(res, true, error); }
  });
  app.get("/d/:token", limit, quiet, async (req: Request, res: Response) => {
    try {
      const raw = String(req.params.token || "");
      const outcome = await loadRoom(raw);
      const nonce = deps.publicPageNonce(res);
      if (!outcome.ok || !outcome.value) { page(res, outcome.status, doorMissingPage(outcome.message)); return; }
      const self = roomDoorHref(raw);
      page(res, 200, roomDoorPage(outcome.value, { nonce, screen: req.query.screen === "1", live: `${self}/now`, self }));
    } catch (error) { fail(res, false, error); }
  });
  app.get("/b/:token/now", limit, quiet, async (req: Request, res: Response) => {
    try {
      const outcome = await loadBoard(String(req.params.token || ""));
      if (!outcome.ok || !outcome.value) { res.status(outcome.status).json({ error: outcome.message }); return; }
      res.json(outcome.value);
    } catch (error) { fail(res, true, error); }
  });
  app.get("/b/:token", limit, quiet, async (req: Request, res: Response) => {
    try {
      const raw = String(req.params.token || "");
      const outcome = await loadBoard(raw);
      const nonce = deps.publicPageNonce(res);
      if (!outcome.ok || !outcome.value) { page(res, outcome.status, doorMissingPage(outcome.message)); return; }
      const self = boardDoorHref(raw);
      page(res, 200, boardDoorPage(outcome.value, { nonce, screen: req.query.screen === "1", live: `${self}/now`, self }));
    } catch (error) { fail(res, false, error); }
  });

  /* ── روابطُ المبنى لشاشة السجل: لوحةُ المبنى وشاشتُه، ورابطُ كل قاعة. ──
     في البيئة التجريبية تحمل الروابطُ وسمَ صندوق الزائر، فتُفتح من هاتفه على صندوقه. */
  app.get("/api/room-door/links", ...deps.requireRegistryAdmin, async (req: Request, res: Response) => {
    const buildingId = String(req.query.buildingId || "").slice(0, 120);
    const registry = await deps.readLocationRegistry();
    const building = registry.buildings.find(item => item.id === buildingId);
    if (!building || !doorBuildingEligible(building)) { res.status(404).json({ error: "المبنى غير موجود أو غير فعّال." }); return; }
    const key = await doorKey();
    const session = Repository.currentDemoSessionId();
    let wrap = (token: string) => token;
    if (session) {
      const tag = demoDoorTag(key, session);
      rememberDemoTag(tag, session);
      wrap = token => demoDoorToken(tag, token);
    }
    const board = boardDoorHref(wrap(buildingDoorToken(key, building.id)));
    const rooms = registry.rooms
      .filter(room => room.buildingId === building.id && doorRoomEligible(room))
      .sort((a, b) => compareDoorRooms(a.canonicalCode, b.canonicalCode));
    res.setHeader("Cache-Control", "no-store");
    res.json({
      building: { id: building.id, ...doorBuildingInfo(building, building.officialCode), board, screen: `${board}?screen=1` },
      rooms: rooms.map(room => {
        const url = roomDoorHref(wrap(roomDoorToken(key, room.id)));
        return { id: room.id, code: room.canonicalCode, floor: roomFloor(room.canonicalCode).label, url, screen: `${url}?screen=1` };
      }),
      demo: Boolean(session),
    });
  });
}
