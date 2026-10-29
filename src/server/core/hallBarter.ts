/**
 * ── تبادلُ القاعات: الحالة المشتركة والفحوص ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Repository } from "../../db/repository";
import { timeToMinutes } from "../../utils/scheduleIntelligence";
import type { FSchedule, HallBarterRequest } from "../../types";
import { DAY_LABELS } from "../../utils/naturalQuery";
import { roomIdentityKey, roomKeyOf } from "../../utils/locationRegistry";
import { SCHEDULE_DAY_KEYS } from "./scheduleRules";

export const HALL_BARTER_DAY_LABEL = new Map(SCHEDULE_DAY_KEYS.map((key,index)=>[key,DAY_LABELS[index]]));
export const hallBarterBoardCache = new Map<string,{ scheduleSerial:number; barterSerial:number; expiresAt:number; body:any }>();

export function academicStartYear(name: unknown): number | null {
  const match=String(name||"").match(/(?:19|20)\d{2}/);
  return match?Number(match[0]):null;
}
/**
 * ── مفتاح واحد للقاعة، وإلا فالحجز لا يُطابَق أبداً ─────────────────────────
 *
 * A hall barter reservation is matched against a schedule row by comparing
 * this key with `roomIdentityKey`. The two were built by different rules: the
 * registry uppercases and unifies Arabic/Persian digits through NFKC, this one
 * lowercased and did nothing else. On the legacy branch — any room or request
 * without a registry `roomId` — `legacy:012B08|G20` was compared against
 * `legacy:012b08|g20`, so the two could never be equal for ANY room.
 *
 * The consequence was silent and it was a blocker: «القاعة محجوزة رقمياً عبر
 * استعارة القاعات» never fired for those rooms, and neither did «الموعد يتجاوز
 * نافذة الاستعارة المعتمدة». The modern `id:` branch always worked, which is
 * why nobody saw it.
 *
 * Both sides now spell the room the one way the registry spells it.
 */
export function barterRequestRoomKey(request:Partial<HallBarterRequest>){
  return roomKeyOf(request.roomId,request.roomCode,request.roomHall);
}
export function barterRequestMatchesRow(request:Partial<HallBarterRequest>,row:Partial<FSchedule>){const rowKey=roomIdentityKey(row);return Boolean(rowKey)&&barterRequestRoomKey(request)===rowKey;}
export async function hallBarterAllowsRoomUse(row:Partial<FSchedule>,collegeId:number,sectionId:number){
  const termId=Number(row.AdTermId||0),roomId=String(row.roomId||"");
  const start=String(row.fstarttime||""),end=String(row.fendtime||"");
  const days=SCHEDULE_DAY_KEYS.filter(day=>Boolean((row as any)[day]));
  if(!termId||!roomId||!start||!end||!days.length)return false;
  const requests=await Repository.getHallBarterRequests(termId);
  const mine=requests.filter(request=>request.status==="approved"&&String(request.roomId||"")===roomId&&Number(request.requesterCollegeId)===collegeId&&Number(request.requesterSectionId)===sectionId);
  return days.every(day=>mine.some(request=>request.day===day&&timeToMinutes(start)>=timeToMinutes(request.startTime)&&timeToMinutes(end)<=timeToMinutes(request.endTime)));
}
