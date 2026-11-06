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
const started=performance.now();
const index=buildIndex(Object.entries(GUIDE_BANK).map(([id,e])=>({id,title:id,ask:e.q.split("|")})));
const buildMs=performance.now()-started;
const query="أبي هذا المقرر يصير يوم الأربعاء الساعة 11 وشلون انقل المادة لقاعة ثانية";
for(let i=0;i<200;i++)understand(index,query,null);
const start=performance.now();for(let i=0;i<1000;i++)understand(index,query,null);
const perQuery=(performance.now()-start)/1000,bytes=fs.statSync(path.join(root,"src/guide/bank.ts")).size;
fs.rmSync(tmp,{recursive:true,force:true});
if(perQuery>8||buildMs>300){console.error(`فشل ميزانية أداء المرشد: ${perQuery.toFixed(2)}ms للسؤال، ${buildMs.toFixed(0)}ms للفهرس.`);process.exit(1);}
if(bytes>70000){console.error(`بنك المعرفة تجاوز الميزانية: ${bytes} بايت.`);process.exit(1);}
const app=fs.readFileSync(path.join(root,"src/App.tsx"),"utf8");
if(!/lazy\(\(\) => import\("\.\/components\/guide\/GuideAssistant"\)\)/.test(app)){console.error("المرشد يجب أن يبقى في حزمة كسولة.");process.exit(1);}
console.log(`ميزانية أداء المرشد ناجحة: ${perQuery.toFixed(2)}ms للسؤال · ${buildMs.toFixed(0)}ms للفهرس · ${(bytes/1024).toFixed(0)}KB بنك.`);
