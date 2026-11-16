export type DayState = {
  guesses: string[];
  hints: number; // 0, 1 (category) or 2 (category + clue)
  status: "playing" | "won" | "lost";
};

export type Stats = {
  played: number;
  wins: number;
  streak: number;
  maxStreak: number;
  lastWinDay: number | null;
  dist: number[]; // index 0 -> solved in 1
};

const EMPTY_STATS: Stats = { played: 0, wins: 0, streak: 0, maxStreak: 0, lastWinDay: null, dist: [0, 0, 0, 0, 0, 0] };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export const loadDay = (day: number): DayState =>
  read(`dd:day:${day}`, { guesses: [], hints: 0, status: "playing" } as DayState);
export const saveDay = (day: number, s: DayState) => write(`dd:day:${day}`, s);

export function loadStats(day: number): Stats {
  const s = read("dd:stats", EMPTY_STATS);
  // streak breaks if yesterday wasn't won (and today isn't won yet)
  if (s.lastWinDay !== null && s.lastWinDay < day - 1) return { ...s, streak: 0 };
  return s;
}

export function recordResult(day: number, won: boolean, guesses: number): Stats {
  const s = loadStats(day);
  const dist = [...s.dist];
  if (won) dist[guesses - 1]++;
  const streak = won ? (s.lastWinDay === day - 1 ? s.streak + 1 : 1) : 0;
  const next: Stats = {
    played: s.played + 1,
    wins: s.wins + (won ? 1 : 0),
    streak,
    maxStreak: Math.max(s.maxStreak, streak),
    lastWinDay: won ? day : s.lastWinDay,
    dist,
  };
  write("dd:stats", next);
  return next;
}
