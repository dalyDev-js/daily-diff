import { PLAYABLE, type Term } from "./words";

export const MAX_GUESSES = 6;
const EPOCH = Date.UTC(2026, 10, 16); // puzzle #1

export type Mark = "hit" | "near" | "miss";

/** Local-calendar day number, #1 = 2026-11-16 */
export function dayNumber(now = new Date()): number {
  const local = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((local - EPOCH) / 86_400_000) + 1;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ORDER: Term[] = (() => {
  const rand = mulberry32(0xd1ff);
  const a = [...PLAYABLE];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
})();

export function termForDay(day: number): Term {
  const n = ORDER.length;
  return ORDER[(((day - 1) % n) + n) % n];
}

/** Two-pass scoring so duplicate letters are handled correctly. */
export function score(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array(answer.length).fill("miss");
  const left: Record<string, number> = {};
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) marks[i] = "hit";
    else left[answer[i]] = (left[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < answer.length; i++) {
    if (marks[i] === "hit") continue;
    const ch = guess[i];
    if (left[ch]) {
      marks[i] = "near";
      left[ch]--;
    }
  }
  return marks;
}

export function msUntilTomorrow(now = new Date()): number {
  const t = new Date(now);
  t.setHours(24, 0, 0, 0);
  return t.getTime() - now.getTime();
}
