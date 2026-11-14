/**
 * ── السؤال بالصوت ────────────────────────────────────────────────────────────
 *
 * يستعمل خدمةَ الكلام في المتصفّح نفسها التي تستعملها صفحةُ الأستاذ (voiceInputScript):
 * لا يُحفظ صوتٌ عندنا، والعربيةُ إملاءً. يظهر الميكروفون حيث يُدعم فقط (Safari وChrome)،
 * ويُوقف نفسه بعد جملةٍ واحدة: السؤال جملةٌ لا خطبة.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toEnglishDigits } from "../utils/naturalQuery";

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((event: any) => void) | null; onerror: ((event: any) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};

const ctor = (): (new () => Recognition) | null => {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

/** ٩:٣٠ و«9 : 30» ← 09:30، والأرقام الهندية عاديةً: كي يفهمها محلّل السؤال. */
export const speechToQuestion = (text: string) =>
  toEnglishDigits(text).replace(/[‎‏‪-‮⁦-⁩]/g, "").replace(/(\d{1,2})\s*[:：]\s*(\d{2})/g, "$1:$2").replace(/\s+/g, " ").trim();

export const SPEECH_ERRORS: Record<string, string> = {
  "not-allowed": "الميكروفون غير مسموح",
  "service-not-allowed": "الصوت غير مفعّل في المتصفح",
  "no-speech": "لم أسمع شيئاً",
  "audio-capture": "لا ميكروفون",
  network: "تعذّر الاتصال",
  "language-not-supported": "العربية غير مدعومة هنا",
};

export function useSpeechAsk(onText: (text: string, final: boolean) => void) {
  const supported = Boolean(ctor());
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState("");
  const recRef = useRef<Recognition | null>(null);
  const callback = useRef(onText);
  callback.current = onText;

  const stop = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    setListening(false);
    if (!rec) return;
    try { rec.onresult = null; rec.onerror = null; rec.onend = null; rec.stop(); } catch { /* أُغلق */ }
  }, []);

  const start = useCallback(() => {
    const Rec = ctor();
    if (!Rec) return;
    if (recRef.current) { stop(); return; }
    setProblem("");
    const rec = new Rec();
    rec.lang = "ar"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    rec.onresult = event => {
      let text = "", final = false;
      for (let i = 0; i < event.results.length; i++) { text += event.results[i][0].transcript + " "; final = final || event.results[i].isFinal; }
      callback.current(speechToQuestion(text), final);
      if (final) stop();
    };
    rec.onerror = event => {
      const code = String(event?.error || "");
      if (code !== "aborted") setProblem(SPEECH_ERRORS[code] || "انقطع الإملاء");
      stop();
    };
    rec.onend = () => stop();
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { stop(); setProblem("تعذّر البدء"); }
  }, [stop]);

  useEffect(() => stop, [stop]);
  return { supported, listening, problem, toggle: start, stop };
}
