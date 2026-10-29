/**
 * ── سجلُّ المواقع والقاعات: القراءة والتوحيد قبل الكتابة ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Repository } from "../../db/repository";
import type { FSchedule, MasterBuilding, MasterRoom } from "../../types";
import { createDataContextKey } from "../dataContextCache";
import { formatScheduleTimeRange } from "../../utils/scheduleTime";
import { PENDING_ROOM, confirmedDepartmentRoomIds as confirmedDepartmentRoomIdsFromRegistry, compareLocationCodes, resolveBuilding, resolveRoom } from "../../utils/locationRegistry";
import { collegeBranchRoot } from "../../utils/branchScope";
import { locationPreflight, mergeRegistryWithSeed } from "../locationRegistryEngine";
import { HALL_BARTER_DAY_LABEL, hallBarterAllowsRoomUse } from "./hallBarter";

/* ── ذاكرةُ العملية لها عالَمان: الحقيقي، وصندوقُ كل زائرٍ تجريبي ───────────
 *
 * البيئةُ التجريبية تعمل داخل الخدمة الحقيقية نفسها: طلبُ الزائر يُربط بصندوقه
 * (AsyncLocalStorage) فيقرأ Repository بياناتِه هو. أما ذاكرةٌ على مستوى
 * العملية فلا تعرف ذلك الربط — فكان سجلُّ المباني المحفوظ دقيقةً يمتلئ من أوّل
 * طلبٍ يسأله: إن كان زائراً تجريبياً حُفظ سجلُّ صندوقه (فارغاً) فرُفض حفظُ
 * المستخدمين الحقيقيين «اختر مبنى رسميًا من سجل المباني» دقيقةً كاملة، وإن
 * كان حقيقياً قرأ الزائرُ سجلَّ الجامعة.
 *
 * فكلُّ مفتاحٍ لذاكرةٍ تحفظ ما قرأه Repository يمرّ بـdataContextCacheKey
 * (القاعدة في src/server/dataContextCache.ts). */
export const dataContextCacheKey = createDataContextKey(() => Repository.currentDemoSessionId());

const locationRegistryCache=new Map<string,{at:number;buildings:MasterBuilding[];rooms:MasterRoom[]}>();
export async function readLocationRegistry(force=false){
  const cacheKey=dataContextCacheKey("registry");
  const held=locationRegistryCache.get(cacheKey);
  if(!force&&held&&Date.now()-held.at<60_000)return held;
  const [buildings,rooms]=await Promise.all([Repository.getLocationBuildings(),Repository.getLocationRooms()]);
  /* بذرةُ السجل مأخوذةٌ من تاريخ الجامعة الحقيقي؛ الصندوقُ التجريبي له سجلُّه
     الوهميّ وحده (demoSandbox.ts) ولا يُخلط بمباني الجامعة. */
  const merged=Repository.isDemoRequest()?{buildings:[...buildings],rooms:[...rooms]}:mergeRegistryWithSeed({buildings,rooms});
  merged.buildings.sort((a,b)=>compareLocationCodes(a.officialCode,b.officialCode));
  merged.rooms.sort((a,b)=>compareLocationCodes(a.buildingCode,b.buildingCode)||compareLocationCodes(a.canonicalCode,b.canonicalCode));
  const entry={at:Date.now(),...merged};
  if(locationRegistryCache.size>100)locationRegistryCache.clear();
  locationRegistryCache.set(cacheKey,entry);return entry;
}
export function invalidateLocationRegistry(){locationRegistryCache.delete(dataContextCacheKey("registry"));}
export const confirmedDepartmentRoomIds=confirmedDepartmentRoomIdsFromRegistry;

export async function canonicalizeLocationForWrite(row:any,collegeId:number,sectionId:number,authorityRoomId=""){
  const [registry,colleges,pinnedDepartmentRooms]=await Promise.all([readLocationRegistry(),Repository.getColleges(),Repository.getPinnedDepartmentRooms(collegeId,sectionId)]);
  const pinnedRoomIds=confirmedDepartmentRoomIds(registry,pinnedDepartmentRooms,collegeId);
  /* الموقع داخل الفرع نفسه ليس خارج النطاق: قاعة الجهراء تبقى قابلة للتعديل
     والحفظ من القسم نفسه، بينما فرع آخر (بنين مقابل بنات) يظل مرفوضاً. */
  const branchRoot=collegeBranchRoot(colleges as any,collegeId);
  /* القاعة التي أسندتها الجهة في الجدول المستورد قرارٌ رسمي: تعديل الأستاذ أو
     الوقت في الموعد نفسه لا يُرفض بحجة أن القاعة لقسم آخر ما دامت لم تتغير. */
  const directoryApprovedRoom=Boolean(row?.roomId&&(pinnedRoomIds.has(String(row.roomId))||(authorityRoomId&&String(row.roomId)===authorityRoomId)));
  let check=locationPreflight(row,registry,{collegeId,sectionId,branchRoot,allowOutOfScopeRoom:directoryApprovedRoom});
  const blocking=check.issues.filter(issue=>issue.severity==="high");
  if(blocking.length&&blocking.every(issue=>issue.type==="room_scope")&&check.canonical&&await hallBarterAllowsRoomUse({...row,...check.canonical},collegeId,sectionId)){
    check=locationPreflight(row,registry,{collegeId,sectionId,branchRoot,allowOutOfScopeRoom:true});
  }else if(blocking.some(issue=>issue.type==="room_scope")){
    /* ── الرفض يقول للمستعير ما ينقصه هو ──────────────────────────────────
     * قسمٌ استعار هذه القاعة يوم الأحد ثم وضع محاضرة يوم الثلاثاء يُرفض —
     * وهذا صحيح — لكن الرسالة كانت تقول له «القاعة مرتبطة بقسم آخر» وكأنه لم
     * يستعرها قط. فمتى كان له فيها نوافذ معتمدة، تُسمّى له نوافذه بأيامها
     * وأوقاتها ليعرف أنه خارجها لا خارج الاستعارة كلها. */
    const roomId=String((check.canonical as any)?.roomId||row?.roomId||"");
    const termId=Number(row?.AdTermId||0);
    if(roomId&&termId){
      const requests=await Repository.getHallBarterRequests(termId);
      const windows=requests.filter(request=>request.status==="approved"&&String(request.roomId||"")===roomId&&
        Number(request.requesterCollegeId)===collegeId&&Number(request.requesterSectionId)===sectionId);
      if(windows.length){
        const shown=windows.slice(0,4).map(request=>`${HALL_BARTER_DAY_LABEL.get(request.day)||request.day} ${formatScheduleTimeRange(request.startTime,request.endTime)}`).join(" · ");
        check={...check,issues:check.issues.map(issue=>issue.type==="room_scope"
          ?{...issue,message:`الموعد يتجاوز نافذة الاستعارة المعتمدة. نوافذك المعتمدة في هذه القاعة: ${shown}.`}
          :issue)};
      }
    }
  }
  return {registry,check};
}

/** Runtime-only bridge for the deployment window before the historical migration is executed.
 * It never writes legacy rows and never guesses REVIEW/PROBABLE values. The current term is
 * resolved against the confirmed registry in memory so aliases cannot hide a room conflict. */
export function canonicalizeHistoricalLocationForRuntime(row:FSchedule,registry:{buildings:MasterBuilding[];rooms:MasterRoom[]}):FSchedule{
  if(row.locationStatus==="PENDING_ROOM"||row.roomId===PENDING_ROOM)return row;
  if(row.buildingId&&row.roomId)return row;
  const building=resolveBuilding(registry,String(row.AdRoomCode||""),{collegeId:Number(row.AdCollegeId||0),sectionId:Number(row.AdSectionId||0)});
  if(building.status!=="CONFIRMED"||!building.value)return row;
  const room=resolveRoom(registry,String(row.AdRoomHall||""),building.value.id,{collegeId:Number(row.AdCollegeId||0),sectionId:Number(row.AdSectionId||0)});
  if(room.status!=="CONFIRMED"||!room.value)return {...row,buildingId:building.value.id,AdRoomCode:building.value.officialCode};
  return {...row,buildingId:building.value.id,roomId:room.value.id,AdRoomCode:building.value.officialCode,AdRoomHall:room.value.canonicalCode,locationStatus:"VERIFIED"};
}
