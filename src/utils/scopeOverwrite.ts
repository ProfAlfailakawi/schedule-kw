/**
 * ── «تغيّر الجدول بعد هذه النسخة» — الطرف الذي يسأل ────────────────────────
 *
 * The server refuses a publish / restore / undo once when the live scope moved
 * on after the draft or version was made, and lists what would be erased
 * (`code: "scope-changed-since-base"`, `changes: string[]`). Every screen that
 * starts one of those actions asks the same question the same way, through
 * this one helper, and repeats the request only with the person's yes.
 */
import React from "react";
import { ScopeOverwriteBody } from "../components/ScopeOverwriteBody";

export const SCOPE_CHANGED_CODE = "scope-changed-since-base";

export const withOverwriteNewer = (confirm: string) => `${confirm}, overwrite-newer`;

/** Reads the refusal from whichever error shape the caller's fetch helper throws. */
export function scopeChangedRefusal(error: any): { message: string; changes: string[]; total: number } | null {
  const data = error?.data || error;
  if (data?.code !== SCOPE_CHANGED_CODE) return null;
  const changes = Array.isArray(data?.changes) ? data.changes.map(String) : [];
  /* The server sends at most forty lines; `total` is the whole count. An older
     server sends no total, and then the lines are all there is to count. */
  const total = Math.max(changes.length, Number.isFinite(Number(data?.total)) ? Number(data.total) : 0);
  return { message: String(data?.error || error?.message || "تغيّر الجدول بعد هذه النسخة."), changes, total };
}

/** The arguments for `visualConfirm`, so every screen shows the same dialog. */
export function overwriteConfirmOptions(refusal: { message: string; changes: string[]; total?: number }) {
  const shown = refusal.changes.slice(0, 12);
  const total = Math.max(refusal.changes.length, Number(refusal.total) || 0);
  const more = total - shown.length;
  return {
    title: "تغيّر الجدول بعد هذه النسخة",
    message: [refusal.message, ...shown.map(line => `• ${line}`), more > 0 ? `• و${more} غيرها` : ""].filter(Boolean).join("\n"),
    /* Visual body; `message` stays the accessible/plain text. */
    body: React.createElement(ScopeOverwriteBody, { changes: refusal.changes, total }),
    confirmLabel: "امحُ هذه التغييرات وتابع",
    tone: "danger" as const,
    /* Keeping the newer schedule is the safe choice, so «إلغاء» leads visually. */
    safeCancel: true,
  };
}

/**
 * Runs `send` with the plain confirmation; if the server says the scope moved
 * on, asks, and runs it once more with «overwrite-newer». Returns `null` when
 * the person declines — nothing was written.
 */
export async function applyWithOverwriteConfirm<T>(
  confirm: string,
  send: (confirmHeader: string) => Promise<T>,
  ask: (options: ReturnType<typeof overwriteConfirmOptions>) => Promise<boolean>,
): Promise<T | null> {
  try {
    return await send(confirm);
  } catch (error) {
    const refusal = scopeChangedRefusal(error);
    if (!refusal) throw error;
    if (!(await ask(overwriteConfirmOptions(refusal)))) return null;
    return send(withOverwriteNewer(confirm));
  }
}
