/**
 * ── تبادلُ القاعات ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { RequestReservationConflict } from "../../utils/instructorRequestReservations";
import { Response } from "express";
import { Repository, withSerialLock } from "../../db/repository";
import { byRoom, byArabic } from "../../utils/sorting";
import { minutesToTime } from "../../utils/scheduleIntelligence";
import type { FSchedule, HallBarterRequest } from "../../types";
import { normalizeClock, SCHEDULE_DAY_END, SCHEDULE_DAY_START, SCHEDULE_SLOT_MINUTES } from "../../utils/scheduleTime";
import { roomKeyOf, rowOccupiesRoom, resolveBuilding, resolveRoom } from "../../utils/locationRegistry";
import { fairShareByOwner } from "../../utils/hallBarterFairness";
import { state } from "../core/state";
import { type AuthenticatedRequest, requirePermission } from "../core/auth";
import { barterRequestMatchesRow, barterRequestRoomKey, HALL_BARTER_DAY_LABEL, hallBarterBoardCache } from "../core/hallBarter";
import { broadcastScheduleChange } from "../core/liveChannel";
import { dataContextCacheKey, readLocationRegistry } from "../core/locations";
import { driftSerial } from "../core/rhythm";
import { SCHEDULE_DAY_KEYS, scheduleOverlap } from "../core/scheduleRules";
import { isScopeAllowed } from "../core/scope";

/**
 * ── استعارة القاعات الساكنة بين الأقسام ──────────────────────────────────────
 *
 * No room is declared "owned" in the legacy schema. Ownership is therefore a
 * reading of ten years of behaviour: the section that used a room most often,
 * with a clear majority, is treated as its historical steward. A free window
 * is offered only when it has repeatedly stayed free across terms AND is free
 * right now. Approval creates a digital reservation, never a fake lecture.
 */
/* أقصر نافذة تُعرض: مدة محاضرة. ما دونها فراغٌ لا يُحجز فيه درس، وعرضُه
   يملأ الشاشة بما لا ينفع. */
const HALL_BARTER_MIN_WINDOW_MINUTES = 50;
const HALL_BARTER_MAX_OPPORTUNITIES = 400;
/* مهلة الطلب المعلّق: أسبوع. بعده يُلغى تلقائياً بسبب واضح، فلا يبقى معلّقاً
 * إلى الأبد ولا يُبقي العدّاد مضيئاً — ويظهر في السجل «ملغي» بسببه. */
const HALL_BARTER_STALE_DAYS = 7;
const HALL_BARTER_STALE_REASON = "انتهت المهلة (أسبوع دون رد)";
/** يُلغي كل طلبٍ معلّق تجاوز مهلته، ويعيد القائمة بعد التحديث. */
async function sweepStaleHallBarter(requests:HallBarterRequest[]):Promise<HallBarterRequest[]>{
  const cutoff=Date.now()-HALL_BARTER_STALE_DAYS*86400000;
  const stale=requests.filter(request=>request.status==="pending"&&(Date.parse(String(request.createdAt||""))||Date.now())<cutoff);
  if(!stale.length)return requests;
  const updatedById=new Map<string,HallBarterRequest>();
  for(const request of stale){
    try { const updated=await Repository.updateHallBarterRequest(request.id,{status:"cancelled",cancelReason:HALL_BARTER_STALE_REASON},"pending"); if(updated)updatedById.set(String(request.id),updated); }
    catch(error){ if(!(error instanceof RequestReservationConflict))throw error; }
  }
  if(updatedById.size){state.hallBarterSerial++;hallBarterBoardCache.clear();}
  return requests.map(request=>updatedById.get(String(request.id))||request);
}
type HallCampusGender = "male" | "female" | null;
function hallCampusGender(name: unknown): HallCampusGender {
  const value=String(name||"").trim().toLocaleLowerCase("ar");
  if(!value)return null;
  /* اسم الكلية في صندوق العرض عامّ، بينما القاعات التعليمية التجريبية
     تمثل مسار البنات؛ لا نضعف هذا الإغلاق في بيانات الإنتاج. */
  if(Repository.isDemoRequest()&&value==="كلية التربية الأساسية")return "female";
  if(/بنات|إناث|اناث|طالبات|girls?|women|female/.test(value))return "female";
  if(/بنين|ذكور|طلاب|boys?|men|male/.test(value))return "male";
  return null;
}
function sameHallCampusGender(a: unknown,b: unknown){
  const left=hallCampusGender(a),right=hallCampusGender(b);
  // The university operates fully segregated male/female campuses. If a legacy
  // college name does not identify its campus, the barter market fails closed:
  // no cross-college borrowing is safer than guessing the wrong campus.
  return Boolean(left&&right&&left===right);
}
function rowOccupiesWindow(row:any,day:string,start:string,end:string){
  return Boolean(row?.[day])&&scheduleOverlap(String(row.fstarttime||""),String(row.fendtime||""),start,end);
}
function barterRequestOverlaps(request:HallBarterRequest,roomCode:string,roomHall:string,day:string,start:string,end:string,roomId?:string){
  const target=roomKeyOf(roomId,roomCode,roomHall);
  if(!target) return false;
  return request.status==="approved"&&barterRequestRoomKey(request)===target&&request.day===day&&scheduleOverlap(request.startTime,request.endTime,start,end);
}
function hallBarterRequestShape(request:HallBarterRequest,sections:any[],colleges:any[]){
  const requesterSection=sections.find(section=>Number(section.AdSectionId)===Number(request.requesterSectionId));
  const ownerSection=sections.find(section=>Number(section.AdSectionId)===Number(request.ownerSectionId));
  const requesterCollege=colleges.find(college=>Number(college.AdCollegeId)===Number(request.requesterCollegeId));
  const ownerCollege=colleges.find(college=>Number(college.AdCollegeId)===Number(request.ownerCollegeId));
  const created=Date.parse(String(request.createdAt||""));
  const ageDays=Number.isFinite(created)?Math.max(0,Math.floor((Date.now()-created)/86400000)):0;
  return{
    ...request,
    ageDays,
    dayLabel:HALL_BARTER_DAY_LABEL.get(request.day)||request.day,
    requesterSectionName:requesterSection?.AdSectionName||"قسم طالب",
    requesterCollegeName:requesterCollege?.AdCollegeName||"كلية طالبة",
    ownerSectionName:ownerSection?.AdSectionName||"القسم المضيف",
    ownerCollegeName:ownerCollege?.AdCollegeName||"الكلية المضيفة",
  };
}

async function buildHallBarterBoard(req:AuthenticatedRequest,collegeId:number,sectionId:number,termId:number){
  const cacheKey=dataContextCacheKey(`${collegeId}:${sectionId}:${termId}:${String((req.query as any)?.ownerSectionId||"")}:${String((req.query as any)?.day||"")}:${String((req.query as any)?.buildingCode||"")}`);
  const cached=hallBarterBoardCache.get(cacheKey);
  if(cached&&cached.scheduleSerial===driftSerial&&cached.barterSerial===state.hallBarterSerial&&cached.expiresAt>Date.now())return cached.body;
  /* لا قراءة لكل جداول النظام بعد اليوم: السؤال صار عن هذا الفصل وحده،
     وقراءة عشر سنوات لكل لوحة كانت أثقل شيء فيها. */
  const [termRowsRaw,collegeHistoryRaw,sections,colleges,requestsRaw,registry]=await Promise.all([
    Repository.getSchedulesByScope({termId}),
    /* تاريخ هذه الكلية وحدها — لا جداول النظام كلها — ليُعرف صاحبُ كل قاعة
       ولو لم يكتب السجل اسمه ولم يُدخل القسمُ جدولَه بعد. */
    Repository.getSchedulesByScope({collegeId}),
    Repository.getSections(),Repository.getColleges(),Repository.getHallBarterRequests(termId),readLocationRegistry(),
  ]);
  /* طلبٌ معلّق تجاوز أسبوعاً يُلغى تلقائياً هنا، فيظهر في السجل «ملغي» بسببه
     ولا يعود يُحسب على أحد. */
  const requests=await sweepStaleHallBarter(requestsRaw);
  const canonicalForBarter=(row:FSchedule):FSchedule=>{
    if(row.buildingId&&row.roomId)return row;
    const b=resolveBuilding(registry,row.AdRoomCode,{collegeId:Number(row.AdCollegeId||0),sectionId:Number(row.AdSectionId||0)});
    if(b.status!=="CONFIRMED"||!b.value)return row;
    const r=resolveRoom(registry,row.AdRoomHall,b.value.id,{collegeId:Number(row.AdCollegeId||0),sectionId:Number(row.AdSectionId||0)});
    if(r.status!=="CONFIRMED"||!r.value)return {...row,buildingId:b.value.id,AdRoomCode:b.value.officialCode};
    return {...row,buildingId:b.value.id,roomId:r.value.id,AdRoomCode:b.value.officialCode,AdRoomHall:r.value.canonicalCode,locationStatus:"VERIFIED"};
  };
  const termRows=termRowsRaw.map(canonicalForBarter);
  const collegeHistory=collegeHistoryRaw.map(canonicalForBarter);
  const requesterCollege=colleges.find(college=>Number(college.AdCollegeId)===collegeId);
  const requesterGender=hallCampusGender(requesterCollege?.AdCollegeName);
  const activeReservations=requests.filter(request=>request.status==="approved");

  /* ── الفراغ اليوم، لا العادة قبل عشر سنوات ───────────────────────────────
   *
   * كانت اللوحة تسأل سؤال المؤرخ: أي قاعة في مباني قسمي جرت العادة أن تكون
   * ساكنة؟ فتقرأ عشر سنوات، وتشترط ثلاثة فصول ونسبة فراغ لا تقل عن ٧٢٪، ثم
   * تعرض ما نجا من هذه المصفاة. والنتيجة أن قاعة فارغة تماماً هذا الفصل لا
   * تُعرض لأن تاريخها لا يشهد لها، وقاعة في مبنى لا تاريخ لقسمي فيه لا تُرى
   * أصلاً.
   *
   * وصاحب الجدول يسأل سؤالاً أبسط وأصدق: ما القاعات الفارغة في كليتي الآن؟
   * فصار هذا هو السؤال: كل قاعة رسمية في الكلية — بأي قسم كانت — يُطرح من
   * نطاق دوامها ما حجزه جدول هذا الفصل وما اعتُمد من نوافذ استعارة، فما بقي
   * فراغاً متصلاً يكفي لمحاضرة صار بطاقة تُطلب. والقاعة الواحدة في اليوم
   * الواحد تعطي بطاقة لكل نافذة: من ٨ إلى ١٠، ومن ٤ إلى ٥، ولكل واحدة طلبها.
   *
   * ولا شيء من هذا يتعدى فصله: النوافذ تُقرأ من جدول هذا الفصل، والطلبات
   * محفوظة برقمه، فلا ينتقل إذنٌ إلى فصل قادم بحال.
   */
  /* ── القاعة المشتركة لها أكثر من صاحب ────────────────────────────────────
   * كان يُؤخذ أولُ قسم مسجَّل مالكاً وحيداً، فقسمٌ لا يظهر اسمه إلا ثانياً في
   * قاعة مشتركة لا يُرى في اللوحة قط — ولا في مرشِّح الأقسام — فيقول صاحب
   * الجدول: «في أقسام لم تظهر». فصارت الأسماء كلها تُذكر، ويبقى الطلبُ إلى
   * الأول: قاعةٌ واحدة وإذنٌ واحد، لكن القارئ يعرف مع مَن يتشاركها. */
  const roomOwnerSections=(room:any)=>[...new Set([
    ...(Array.isArray(room.primarySectionIds)?room.primarySectionIds:[]),
    ...(Array.isArray(room.sectionIds)?room.sectionIds:[]),
  ].map(Number).filter(Boolean))];
  const buildingById=new Map(registry.buildings.map(building=>[building.id,building]));

  /* ── الجدول شاهدٌ على الملكية كما هو شاهد على الفراغ ─────────────────────
   *
   * «أقسام لم تظهر إطلاقاً — اللغة العربية وغيرها — ولها فراغات.» والسبب أن
   * اللوحة كانت تسأل السجلَّ وحده: أي قسم مكتوبٌ في حقل القاعة؟ وسجلُّ
   * القاعات بُني من تاريخٍ ناقص، فقاعةٌ لم يُكتب لها قسم — أو كُتب لها قسمٌ
   * من كلية أخرى — تسقط من القائمة ومعها كل أقسامها.
   *
   * وجدول هذا الفصل شاهدٌ لا يُردّ: قسمٌ يحجز قاعة اليوم فهي قاعته عملياً،
   * وكليةٌ تحجز فيها فهي من قاعاتها. فصار الحجز الفعلي مصدراً ثانياً
   * للانتماء: يُكمل السجل حيث سكت، ولا ينقض ما نطق به.
   */
  const tallyUsage=(target:Map<string,{colleges:Set<number>;sections:Map<number,number>}>,rows:readonly any[])=>{
    for(const row of rows){
      const key=String(row.roomId||"").trim();
      if(!key)continue;
      const entry=target.get(key)||{colleges:new Set<number>(),sections:new Map<number,number>()};
      const rowCollege=Number(row.AdCollegeId||0),rowSection=Number(row.AdSectionId||0);
      if(rowCollege)entry.colleges.add(rowCollege);
      if(rowSection)entry.sections.set(rowSection,(entry.sections.get(rowSection)||0)+1);
      target.set(key,entry);
    }
    return target;
  };
  /* شاهدان لا شاهد: جدولُ هذا الفصل أولاً — فهو الأقرب إلى الحال — ثم تاريخ
     الكلية كله. وقسمٌ لم يُدخل جدوله بعد يبقى معروفاً بقاعاته من تاريخه، فلا
     يسقط من اللوحة لأنه تأخّر في الإدخال. */
  const usageByRoom=tallyUsage(new Map(),termRows);
  const historyByRoom=tallyUsage(new Map(),collegeHistory);
  /* القسم الذي يحجزها أكثر هو صاحبها في الواقع؛ وعند التساوي أصغر رقم، حتى
     يكون الترتيب ثابتاً لا يتبدل بين نداء وآخر. */
  const rankSections=(usage?:{sections:Map<number,number>})=>usage
    ? [...usage.sections.entries()].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).map(entry=>entry[0])
    : [] as number[];
  const usageOwnerSections=(roomId:string)=>{
    const now=rankSections(usageByRoom.get(roomId));
    return now.length?now:rankSections(historyByRoom.get(roomId));
  };

  const collegeRooms=registry.rooms.filter(room=>{
    if(!room.active||room.confidence!=="CONFIRMED"||(room.bookingPolicy&&room.bookingPolicy!=="normal"))return false;
    const building=buildingById.get(room.buildingId);
    if(!building||!building.active||building.confidence!=="CONFIRMED")return false;
    const roomColleges=[...new Set([...(room.collegeIds||[]),...(building.collegeIds||[])].map(Number).filter(Boolean))];
    if(roomColleges.includes(collegeId))return true;
    return Boolean(usageByRoom.get(room.id)?.colleges.has(collegeId))
      ||Boolean(historyByRoom.get(room.id)?.colleges.has(collegeId));
  });
  const opportunities:any[]=[];
  for(const room of collegeRooms){
    /* السجل أولاً، فإن سكت عن هذه القاعة — أو نسب أقسامها إلى كلية أخرى —
       نطق بها جدولُ الفصل. */
    const registeredIds=roomOwnerSections(room);
    const collegeSectionIds=new Set(sections.filter((section:any)=>Number(section.AdCollegeId)===collegeId).map((section:any)=>Number(section.AdSectionId)));
    const ownerIds=registeredIds.some(id=>collegeSectionIds.has(id))?registeredIds:usageOwnerSections(room.id);
    const ownerSectionId=ownerIds[0]||0;
    /* قاعة بلا قسم مسجَّل لا أحد يأذن فيها، وقاعة قسمي لا تُستعار من نفسي —
       ولو كنت أحد شركائها. */
    if(!ownerSectionId||ownerIds.includes(sectionId))continue;
    const ownerSection=sections.find(section=>Number(section.AdSectionId)===ownerSectionId);
    if(!ownerSection)continue;
    const ownerSections=ownerIds
      .map(id=>sections.find(section=>Number(section.AdSectionId)===id))
      .filter(Boolean)
      .map(section=>({id:Number(section!.AdSectionId),name:String(section!.AdSectionName||"")}));
    const ownerCollegeId=Number(ownerSection.AdCollegeId||0);
    const ownerCollege=colleges.find(college=>Number(college.AdCollegeId)===ownerCollegeId);
    if(!ownerCollege)continue;
    if(!requesterGender||hallCampusGender(ownerCollege.AdCollegeName)!==requesterGender)continue;
    const building=buildingById.get(room.buildingId);
    const roomCode=String(building?.officialCode||room.buildingCode||"").trim();
    const roomHall=String(room.canonicalCode||"").trim();
    if(!roomCode||!roomHall)continue;
    const roomKey=roomKeyOf(room.id,roomCode,roomHall);
    const roomRows=termRows.filter(row=>rowOccupiesRoom(row,room.id,roomCode,roomHall));
    for(const day of SCHEDULE_DAY_KEYS){
      let runStart:number|null=null,runEnd=0;
      const flush=()=>{
        if(runStart==null)return;
        const duration=runEnd-runStart;
        if(duration>=HALL_BARTER_MIN_WINDOW_MINUTES){
          const start=minutesToTime(runStart),end=minutesToTime(runEnd);
          const pendingSame=requests.some(request=>request.status==="pending"&&request.requesterCollegeId===collegeId&&request.requesterSectionId===sectionId&&
            barterRequestRoomKey(request)===roomKey&&request.day===day&&scheduleOverlap(request.startTime,request.endTime,start,end));
          if(!pendingSame){
            const rawId=`${roomCode}|${roomHall}|${day}|${start}|${end}|${ownerSectionId}`;
            opportunities.push({
              id:Buffer.from(rawId,"utf8").toString("base64url"),buildingId:room.buildingId,roomId:room.id,roomCode,roomHall,building:roomCode,
              day,dayLabel:HALL_BARTER_DAY_LABEL.get(day)||day,startTime:start,endTime:end,durationMinutes:duration,
              confidence:0,historyTerms:0,ownerShare:0,
              ownerCollegeId,ownerSectionId,
              ownerCollegeName:ownerCollege.AdCollegeName,ownerSectionName:ownerSection.AdSectionName,
              ownerSections,shared:ownerSections.length>1,
            });
          }
        }
        runStart=null;runEnd=0;
      };
      for(let minute=SCHEDULE_DAY_START;minute<SCHEDULE_DAY_END;minute+=SCHEDULE_SLOT_MINUTES){
        const start=minutesToTime(minute),end=minutesToTime(Math.min(SCHEDULE_DAY_END,minute+SCHEDULE_SLOT_MINUTES));
        const free=!roomRows.some(row=>rowOccupiesWindow(row,day,start,end))
          &&!activeReservations.some(request=>barterRequestOverlaps(request,roomCode,roomHall,day,start,end,room.id));
        if(free){
          if(runStart==null)runStart=minute;
          runEnd=Math.min(SCHEDULE_DAY_END,minute+SCHEDULE_SLOT_MINUTES);
        }else flush();
      }
      flush();
    }
  }
  opportunities.sort((a,b)=>byRoom(a.roomCode,a.roomHall,b.roomCode,b.roomHall)||SCHEDULE_DAY_KEYS.indexOf(a.day)-SCHEDULE_DAY_KEYS.indexOf(b.day)||a.startTime.localeCompare(b.startTime));

  /* ── القصُّ الأعمى يحذف أقساماً بأكملها ──────────────────────────────────
   *
   * كانت النوافذ تُرتَّب برمز المبنى ثم تُقصّ عند الأربعمائة الأولى. والقسم
   * الذي تقع قاعاته بعد القصّ لا تنقص نوافذه: تختفي كلها، ويختفي اسمه من
   * مرشِّح الأقسام، فيقول صاحب الجدول «أقسامٌ لم تظهر» وهو محقّ — ولم يكن
   * السجل ولا الفراغ سبباً، بل رقمٌ ثابت في سطر واحد.
   *
   * فصار الاختيار بالتناوب: نافذةٌ من كل قسم ثم دورة أخرى، حتى يمتلئ العدد.
   * فإن ضاق المكان نقصت حصص الجميع بالتساوي ولم يسقط أحد، ثم تُعاد المختارة
   * إلى ترتيب القراءة. ومعها تُرسل قائمة الأقسام والأيام والمباني كاملةً غير
   * مقصوصة، ليبقى المرشِّح يعرف ما لا تعرضه الصفحة الواحدة. */
  const facetsOf=(rows:readonly any[])=>{
    const owners=new Map<number,{id:number;name:string;count:number}>();
    const days=new Map<string,{key:string;label:string;count:number}>();
    const buildings=new Map<string,{code:string;count:number}>();
    for(const row of rows){
      for(const owner of (row.ownerSections?.length?row.ownerSections:[{id:row.ownerSectionId,name:row.ownerSectionName}])){
        const entry=owners.get(owner.id)||{id:owner.id,name:owner.name,count:0};entry.count+=1;owners.set(owner.id,entry);
      }
      const day=days.get(row.day)||{key:row.day,label:row.dayLabel,count:0};day.count+=1;days.set(row.day,day);
      const building=buildings.get(row.roomCode)||{code:row.roomCode,count:0};building.count+=1;buildings.set(row.roomCode,building);
    }
    return {
      owners:[...owners.values()].sort((a,b)=>byArabic(a.name,b.name)),
      days:[...days.values()],
      buildings:[...buildings.values()].sort((a,b)=>byRoom(a.code,"",b.code,"")),
    };
  };
  const fairSlice=(rows:readonly any[],limit:number)=>fairShareByOwner(rows,limit,row=>Number(row.ownerSectionId||0));

  /* ومتى ضيّق القارئ بمرشِّح — قسماً أو يوماً أو مبنى — رجع السؤال إلى الخادم
     ليُصفّي قبل القصّ، فيرى نوافذ ذلك القسم كاملةً لا حصته من الأربعمائة. */
  const filterOwner=Number((req.query as any)?.ownerSectionId||0);
  const filterDay=String((req.query as any)?.day||"").trim();
  const filterBuilding=String((req.query as any)?.buildingCode||"").trim().toUpperCase();
  /* ── المرشِّحات تتراكم، وكل قائمة تعرف ما اختير في أخواتها ────────────────
   * القوائم كانت تُحسب من الكل دائماً، فيختار القارئ قسماً ويوماً ثم يفتح
   * قائمة المباني فيجدها كما هي بأعدادها الأولى — فيظنّ أن اختياره لم يُحسب.
   * فصارت كل قائمة تُحسب بعد تطبيق المرشِّحات الأخرى وحدها: قائمة المباني
   * تعرف القسم واليوم المختارين ولا تعرف نفسها، وهكذا الثلاث. */
  const matchesOwner=(row:any)=>!filterOwner||(row.ownerSections?.length?row.ownerSections:[{id:row.ownerSectionId}]).some((owner:any)=>Number(owner.id)===filterOwner);
  const matchesDay=(row:any)=>!filterDay||row.day===filterDay;
  const matchesBuilding=(row:any)=>!filterBuilding||String(row.roomCode||"").toUpperCase()===filterBuilding;
  const facets={
    owners:facetsOf(opportunities.filter(row=>matchesDay(row)&&matchesBuilding(row))).owners,
    days:facetsOf(opportunities.filter(row=>matchesOwner(row)&&matchesBuilding(row))).days,
    buildings:facetsOf(opportunities.filter(row=>matchesOwner(row)&&matchesDay(row))).buildings,
  };
  const narrowed=opportunities.filter(row=>matchesOwner(row)&&matchesDay(row)&&matchesBuilding(row));
  const visible=fairSlice(narrowed,HALL_BARTER_MAX_OPPORTUNITIES);
  const shaped=requests.map(request=>hallBarterRequestShape(request,sections,colleges));
  const sameCampusRequests=shaped.filter(request=>sameHallCampusGender(request.requesterCollegeName,request.ownerCollegeName));
  const body={
    opportunities:visible,
    total:narrowed.length,
    truncated:visible.length<narrowed.length,
    facets,
    incoming:sameCampusRequests.filter(request=>request.ownerCollegeId===collegeId&&request.ownerSectionId===sectionId),
    outgoing:sameCampusRequests.filter(request=>request.requesterCollegeId===collegeId&&request.requesterSectionId===sectionId),
  };
  hallBarterBoardCache.set(cacheKey,{scheduleSerial:driftSerial,barterSerial:state.hallBarterSerial,expiresAt:Date.now()+2*60*1000,body});
  if(hallBarterBoardCache.size>120)hallBarterBoardCache.clear();
  return body;
}

export function registerHallBarterRoutes(app: Express): void {

// ============================================================================
// INTER-COLLEGE PASSIVE HALL BARTER
// ============================================================================

app.get("/api/hall-barter", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0),termId=Number(req.query.termId||0);
  if(!collegeId||!sectionId||!termId){res.status(400).json({error:"حدد الكلية والقسم والفصل أولاً"});return;}
  if(!isScopeAllowed(req,collegeId,sectionId)&&!req.user.IsAdminUser){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  res.json(await buildHallBarterBoard(req,collegeId,sectionId,termId));
});

app.post("/api/hall-barter/requests", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.body?.collegeId||0),sectionId=Number(req.body?.sectionId||0),termId=Number(req.body?.termId||0);
  const opportunityId=String(req.body?.opportunityId||"").trim();
  if(!collegeId||!sectionId||!termId||!opportunityId){res.status(400).json({error:"طلب الاستعارة ناقص البيانات"});return;}
  if(!isScopeAllowed(req,collegeId,sectionId)&&!req.user.IsAdminUser){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const board=await buildHallBarterBoard(req,collegeId,sectionId,termId);
  const opportunity=board.opportunities.find((item:any)=>item.id===opportunityId);
  if(!opportunity){res.status(409).json({error:"هذه النافذة لم تعد متاحة كما كانت. حدّث القائمة واختر نافذة أخرى."});return;}
  if(Number(opportunity.ownerCollegeId)===collegeId&&Number(opportunity.ownerSectionId)===sectionId){res.status(409).json({error:"لا يمكن للقسم استعارة قاعة من نفسه."});return;}
  const request=await Repository.createHallBarterRequest({
    AdTermId:termId,buildingId:opportunity.buildingId,roomId:opportunity.roomId,roomCode:opportunity.roomCode,roomHall:opportunity.roomHall,day:opportunity.day,
    startTime:normalizeClock(opportunity.startTime),endTime:normalizeClock(opportunity.endTime),
    requesterCollegeId:collegeId,requesterSectionId:sectionId,requesterUserId:Number(req.user.SystemUserId||0),requesterName:String(req.user.Name||""),
    ownerCollegeId:Number(opportunity.ownerCollegeId),ownerSectionId:Number(opportunity.ownerSectionId),
    confidence:Number(opportunity.confidence||0),historyTerms:Number(opportunity.historyTerms||0),
  });
  state.hallBarterSerial++;hallBarterBoardCache.clear();
  broadcastScheduleChange();void Repository.markSchedulesChanged();
  res.status(201).json({request,message:"أُرسل طلب الاستعارة رقمياً إلى القسم المضيف. لم يتغير أي موعد دراسي بعد."});
});

app.post("/api/hall-barter/requests/:id/respond", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const requestId=String(req.params.id||"");
  const decision=String(req.body?.decision||"");
  if(decision!=="approve"&&decision!=="reject"){res.status(400).json({error:"حدد الموافقة أو الرفض"});return;}
  const pending=await Repository.getHallBarterRequestById(requestId);
  if(!pending){res.status(404).json({error:"طلب الاستعارة غير موجود"});return;}
  /**
   * The approval decides from what it reads — "is the room free in this window,
   * and is no overlapping reservation already approved?" — and then writes. Two
   * approvals for *different* overlapping requests could each read a free room
   * and each write `approved`, because the pair was only ever in conflict
   * together. The `status !== "pending"` guard never saw this: it protects one
   * request from being answered twice, not two requests from colliding.
   *
   * So the key is the term, not the request — a term is the widest span an
   * overlap can reach, and it is what both readings are drawn from. Approvals
   * are rare and human-paced, so serialising them costs nothing, and other terms
   * are untouched. Everything is re-read *inside* the lock, so a decision taken
   * while this one waited is seen and respected.
   */
  await withSerialLock(`barter:term:${Number(pending.AdTermId)||0}`, async () => {
  const request=await Repository.getHallBarterRequestById(requestId);
  if(!request){res.status(404).json({error:"طلب الاستعارة غير موجود"});return;}
  if(request.status!=="pending"){res.status(409).json({error:"تمت معالجة هذا الطلب مسبقاً"});return;}
  if(!isScopeAllowed(req,request.ownerCollegeId,request.ownerSectionId)&&!req.user.IsAdminUser){res.status(403).json({error:"الموافقة تخص القسم المضيف فقط"});return;}
  if(decision==="approve"){
    if(Number(request.requesterCollegeId)===Number(request.ownerCollegeId)&&Number(request.requesterSectionId)===Number(request.ownerSectionId)){
      res.status(409).json({error:"لا يمكن اعتماد استعارة لأن القسم الطالب هو نفسه القسم المضيف."});return;
    }
    const [requesterCollege,ownerCollege]=await Promise.all([
      Repository.getCollegeById(Number(request.requesterCollegeId)),
      Repository.getCollegeById(Number(request.ownerCollegeId)),
    ]);
    if(!sameHallCampusGender(requesterCollege?.AdCollegeName,ownerCollege?.AdCollegeName)){
      res.status(409).json({error:"لا يمكن اعتماد استعارة بين حرم البنين وحرم البنات. القاعات منفصلة بالكامل بين الجهتين."});return;
    }
    const [termRows,allRequests]=await Promise.all([Repository.getSchedulesByScope({termId:request.AdTermId}),Repository.getHallBarterRequests(request.AdTermId)]);
    const roomBusy=termRows.some(row=>barterRequestMatchesRow(request,row)&&rowOccupiesWindow(row,request.day,request.startTime,request.endTime));
    if(roomBusy){res.status(409).json({error:"القاعة أصبحت مشغولة في هذه النافذة؛ لم تتم الموافقة حتى لا ينشأ تضارب."});return;}
    const reserved=allRequests.some(other=>other.id!==request.id&&barterRequestOverlaps(other,request.roomCode,request.roomHall,request.day,request.startTime,request.endTime,request.roomId));
    if(reserved){res.status(409).json({error:"تم اعتماد استعارة أخرى متداخلة لهذه القاعة. اختر نافذة مختلفة."});return;}
  }
  const now=new Date().toISOString();
  let updated: HallBarterRequest;
  try {
    updated=await Repository.updateHallBarterRequest(request.id,{
      status:decision==="approve"?"approved":"rejected",respondedAt:now,
      responderUserId:Number(req.user.SystemUserId||0),responderName:String(req.user.Name||""),
    },"pending");
  } catch(error:any) {
    if(error instanceof RequestReservationConflict){res.status(409).json({error:error.message,code:error.code});return;}
    throw error;
  }
  state.hallBarterSerial++;hallBarterBoardCache.clear();
  broadcastScheduleChange();void Repository.markSchedulesChanged();
  res.json({request:updated,message:decision==="approve"?"تم اعتماد الاستعارة. أصبحت النافذة محجوزة رقمياً للقسم الطالب وتظهر للطرفين.":"تم رفض الطلب دون أي تغيير على الجدول."});
  });
});

app.post("/api/hall-barter/requests/:id/cancel", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const request=await Repository.getHallBarterRequestById(String(req.params.id||""));
  if(!request){res.status(404).json({error:"طلب الاستعارة غير موجود"});return;}
  if(!isScopeAllowed(req,request.requesterCollegeId,request.requesterSectionId)&&!req.user.IsAdminUser){res.status(403).json({error:"إلغاء الطلب متاح للقسم الطالب فقط"});return;}
  if(!["pending","approved"].includes(request.status)){res.status(409).json({error:"لا يمكن إلغاء هذا الطلب في حالته الحالية"});return;}
  if(request.status==="approved"){
    const rows=await Repository.getSchedulesByScope({collegeId:request.requesterCollegeId,sectionId:request.requesterSectionId,termId:request.AdTermId});
    const inUse=rows.some(row=>barterRequestMatchesRow(request,row)&&rowOccupiesWindow(row,request.day,request.startTime,request.endTime));
    if(inUse){res.status(409).json({error:"لا يمكن إلغاء الاستعارة لأن جدول قسمك يستخدم القاعة فعلياً في هذه النافذة. انقل الموعد أولاً."});return;}
  }
  let updated: HallBarterRequest;
  try { updated=await Repository.updateHallBarterRequest(request.id,{status:"cancelled"},request.status); }
  catch(error:any){if(error instanceof RequestReservationConflict){res.status(409).json({error:error.message,code:error.code});return;}throw error;}
  state.hallBarterSerial++;hallBarterBoardCache.clear();
  broadcastScheduleChange();void Repository.markSchedulesChanged();
  res.json({request:updated,message:"تم إلغاء طلب الاستعارة وتحرير النافذة."});
});

/* ── التنبيه يتبع القسم لا الشاشة ────────────────────────────────────────────
 * عدّاد الطلبات المنتظرة يُقرأ من الشريط الجانبي أينما كان المستخدم في النظام،
 * لا في شاشة الجدول وحدها: طلبٌ ينتظر قرار قسمه لا ينام لأن صاحبه لم يفتح
 * الجدول اليوم. خفيفٌ متعمَّد — عدٌّ فقط، بلا بناء لوحةٍ كاملة. */
app.get("/api/hall-barter/inbox", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const all=await sweepStaleHallBarter(await Repository.getHallBarterRequests(0));
  /* ── العدّاد لصاحب القاعة، لا للمدير الذي يرى كل شيء ──────────────────────
   * يُقاس بعضوية النطاق صراحةً — لا بـ isScopeAllowed الذي يعيد «نعم» لكل شيء
   * للمدير — فلا يُنبَّه مديرُ النظام بطلبٍ لقسمٍ ليس قسمه. من له أقسام يُعدّ
   * ما ينتظر أقسامه؛ ومن لا قسم له (مديرٌ عامّ) لا شيء ينتظر قراره شخصياً. */
  const scopes=Array.isArray(req.scopes)?req.scopes:[];
  const me=Number(req.user?.SystemUserId||0);
  const owns=(request:HallBarterRequest)=>scopes.some(scope=>Number(scope.AdCollegeId)===Number(request.ownerCollegeId)&&Number(scope.AdSectionId)===Number(request.ownerSectionId));
  /* لا يُنبَّه المستخدمُ بطلبٍ أرسله هو نفسه، ولو كان قسمُه المضيفَ أيضاً
   * (مديرٌ يستعير من قسمٍ يديره) — فطلبك لا ينتظر قرارَك أنت. */
  const mine=(request:HallBarterRequest)=>me>0&&Number(request.requesterUserId||0)===me;
  const pending=all.filter(request=>request.status==="pending"&&owns(request)&&!mine(request));
  const oldest=pending.reduce((max,request)=>{const created=Date.parse(String(request.createdAt||""));return Number.isFinite(created)?Math.min(max,created):max;},Date.now());
  const oldestDays=pending.length?Math.max(0,Math.floor((Date.now()-oldest)/86400000)):0;
  res.json({pending:pending.length,oldestDays});
});
}
