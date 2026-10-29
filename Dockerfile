FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
# الصورةُ تحمل ما يُحمّله dist/server.cjs وحده (scripts/runtime-deps.mjs): يُحذف
# ما سواه، ثم تُحمَّل كلُّ حزمةٍ يسمّيها الخادم من هنا — فحزمةٌ ناقصة تُفشل البناء
# على المشغّل، لا الموقعَ وهو يعمل، والخدمةُ تبقى على نسختها السابقة.
RUN npm prune --omit=dev && node scripts/runtime-deps.mjs --prune --smoke

FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
# قراءة المسح تشغّل نحو 11 عاملاً (خيوط Tesseract WASM)، ولكل خيط في glibc ساحة
# ذاكرة خاصة لا تعود إلى النظام؛ على خادم 4 GiB أُوقف الخادم لنفاد الذاكرة وهو
# يقرأ ملفاً واضحاً (سجلات 2026-09-26). ساحتان تكفيان وتُبقيان الذروة أدنى، مجاناً.
ENV MALLOC_ARENA_MAX=2

# ما يقرؤه الخادم وهو يعمل، لا أكثر: الحزمة وبناءُ الواجهة (dist)، والحزمُ التي
# يطلبها، ووجهةُ Firestore (firebase-applet-config.json — src/server/runtimeEnv.ts)،
# وملفّا لغة القراءة الضوئية (src/utils/documentOcr.ts). المصدرُ والاختبارات
# والوثائق وأدوات البناء بقيت في مرحلة البناء.
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/firebase-applet-config.json /app/ara.traineddata /app/eng.traineddata ./

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
