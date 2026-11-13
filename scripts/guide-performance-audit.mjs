import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const root=process.cwd(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),"schedule-guide-perf-")),entry=path.join(tmp,"entry.ts"),out=path.join(tmp,"out.mjs");
fs.writeFileSync(entry,`export * from ${JSON.stringify(path.join(root,"src/guide/brain/engine.ts"))};export * from ${JSON.stringify(path.join(root,"src/guide/bank.ts"))};`);
buildSync({entryPoints:[entry],bundle:true,format:"esm",platform:"node",outfile:out,logLevel:"error"});
const {buildIndex,understand,GUIDE_BANK}=await import(pathToFileURL(out).href);
/* ميزانيةُ الزمن تُقاس بالوسيط على عدّة جولات (لا قياسٍ واحد)، والهدفُ 8ms للسؤال و300ms للفهرس.
 * جهازُ CI المزدحم قد يتجاوز الهدف بلا تراجعٍ في الكود، فتجاوزُ الهدف تنبيهٌ فقط، ولا يُفشل البناء
 * إلا تجاوزُ الحدّ الصلب (4 أضعاف الهدف) — وهو ما يكشف تراجعاً خوارزمياً حقيقياً لا بطءَ الجهاز.
 * GUIDE_PERF_STRICT=1 يجعل الهدفَ نفسه صلباً (للقياس المحلي). */
const TARGET={query:8,build:300},HARD_FACTOR=4,ROUNDS=5,strict=process.env.GUIDE_PERF_STRICT==="1";
const median=xs=>[...xs].sort((a,b)=>a-b)[xs.length>>1];
const entries=Object.entries(GUIDE_BANK).map(([id,e])=>({id,title:id,ask:e.q.split("|")}));
const builds=[];let index;
for(let r=0;r<ROUNDS;r++){const t=performance.now();index=buildIndex(entries);builds.push(performance.now()-t);}
const query="أبي هذا المقرر يصير يوم الأربعاء الساعة 11 وشلون انقل المادة لقاعة ثانية";
for(let i=0;i<200;i++)understand(index,query,null);
const rounds=[];
for(let r=0;r<ROUNDS;r++){const t=performance.now();for(let i=0;i<200;i++)understand(index,query,null);rounds.push((performance.now()-t)/200);}
const buildMs=median(builds),perQuery=median(rounds),bytes=fs.statSync(path.join(root,"src/guide/bank.ts")).size;
fs.rmSync(tmp,{recursive:true,force:true});
const factor=strict?1:HARD_FACTOR,timing=`${perQuery.toFixed(2)}ms للسؤال، ${buildMs.toFixed(0)}ms للفهرس (وسيط ${ROUNDS} جولات)`;
if(perQuery>TARGET.query*factor||buildMs>TARGET.build*factor){console.error(`فشل ميزانية أداء المرشد: ${timing} — الحدّ ${TARGET.query*factor}ms/${TARGET.build*factor}ms.`);process.exit(1);}
if(perQuery>TARGET.query||buildMs>TARGET.build)console.warn(`تنبيه أداء المرشد: ${timing} فوق الهدف ${TARGET.query}ms/${TARGET.build}ms (دون الحدّ الصلب؛ قد يكون الجهاز مزدحماً).`);
if(bytes>70000){console.error(`بنك المعرفة تجاوز الميزانية: ${bytes} بايت.`);process.exit(1);}
const app=fs.readFileSync(path.join(root,"src/App.tsx"),"utf8");
if(!/lazy\(\(\) => import\("\.\/components\/guide\/GuideAssistant"\)\)/.test(app)){console.error("المرشد يجب أن يبقى في حزمة كسولة.");process.exit(1);}
console.log(`ميزانية أداء المرشد ناجحة: ${perQuery.toFixed(2)}ms للسؤال · ${buildMs.toFixed(0)}ms للفهرس · ${(bytes/1024).toFixed(0)}KB بنك.`);
