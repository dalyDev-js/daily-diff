"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_GUESSES, dayNumber, msUntilTomorrow, score, termForDay, type Mark } from "@/lib/daily";
import { loadDay, loadStats, recordResult, saveDay, type DayState, type Stats } from "@/lib/storage";

const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "+ZXCVBNM-"];
const FLIP_STEP = 140; // ms between tiles
const FLIP_TIME = 520;

const MARK_VAR: Record<Mark, string> = { hit: "var(--hit)", near: "var(--near)", miss: "var(--miss)" };
const MARK_GLYPH: Record<Mark, string> = { hit: "+", near: "~", miss: "−" };
const MARK_EMOJI: Record<Mark, string> = { hit: "🟩", near: "🟨", miss: "⬛" };
const RANK: Record<Mark, number> = { miss: 0, near: 1, hit: 2 };

type Modal = "none" | "help" | "result";

export default function Game() {
  const [day] = useState(() => dayNumber());
  const term = useMemo(() => termForDay(day), [day]);
  const answer = term.w;
  const len = answer.length;

  const [state, setState] = useState<DayState>(() => loadDay(day));
  const [stats, setStats] = useState<Stats>(() => loadStats(day));
  const [input, setInput] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const [revealing, setRevealing] = useState<number | null>(null); // row being flipped
  const [celebrate, setCelebrate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(() => {
    if (state.status !== "playing") return "result";
    try {
      return localStorage.getItem("dd:seenHelp") ? "none" : "help";
    } catch {
      return "none";
    }
  });
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const marks = useMemo(() => state.guesses.map((g) => score(g, answer)), [state.guesses, answer]);
  const keyMarks = useMemo(() => {
    const m: Record<string, Mark> = {};
    // ignore the row still flipping so keys don't spoil it
    state.guesses.forEach((g, r) => {
      if (r === revealing) return;
      [...g].forEach((ch, i) => {
        const k = marks[r][i];
        if (!m[ch] || RANK[k] > RANK[m[ch]]) m[ch] = k;
      });
    });
    return m;
  }, [state.guesses, marks, revealing]);

  const flash = useCallback((msg: string, ms = 1600) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  const update = useCallback(
    (next: DayState) => {
      setState(next);
      saveDay(day, next);
    },
    [day],
  );

  const submit = useCallback(() => {
    if (input.length < len) {
      setShakeKey((k) => k + 1);
      flash(`Need ${len} letters`);
      return;
    }
    if (state.guesses.includes(input)) {
      setShakeKey((k) => k + 1);
      flash("Already tried that one");
      return;
    }
    const guesses = [...state.guesses, input];
    const won = input === answer;
    const lost = !won && guesses.length >= MAX_GUESSES;
    const status = won ? "won" : lost ? "lost" : "playing";
    const row = guesses.length - 1;
    update({ ...state, guesses, status });
    setInput("");
    setRevealing(row);
    const done = FLIP_STEP * (len - 1) + FLIP_TIME;
    setTimeout(() => setRevealing(null), done);
    if (won || lost) {
      setStats(recordResult(day, won, guesses.length));
      setTimeout(() => {
        if (won) {
          setCelebrate(true);
          flash(["Ship it!", "LGTM 🚀", "Merged!", "Clean build", "No conflicts", "Phew"][row], 1800);
        } else {
          flash(answer, 2400);
        }
      }, done);
      setTimeout(() => setModal("result"), done + (won ? 1500 : 1900));
    }
  }, [input, len, state, answer, update, day, flash]);

  const press = useCallback(
    (key: string) => {
      if (state.status !== "playing" || revealing !== null || modal !== "none") return;
      if (key === "ENTER") return submit();
      if (key === "BACKSPACE") return setInput((s) => s.slice(0, -1));
      if (/^[A-Z]$/.test(key) && input.length < len) setInput((s) => s + key);
    },
    [state.status, revealing, modal, submit, input.length, len],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") return setModal("none");
      const k = e.key === "Enter" ? "ENTER" : e.key === "Backspace" ? "BACKSPACE" : e.key.toUpperCase();
      if (k === "ENTER" || k === "BACKSPACE" || /^[A-Z]$/.test(k)) {
        e.preventDefault();
        press(k);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const closeHelp = () => {
    try {
      localStorage.setItem("dd:seenHelp", "1");
    } catch {}
    setModal("none");
  };

  const shareText = useMemo(() => {
    const won = state.status === "won";
    const lines = marks.map((r) => r.map((m) => MARK_EMOJI[m]).join(""));
    const head = `Daily Diff #${day} · ${won ? state.guesses.length : "X"}/${MAX_GUESSES}${state.hints ? ` · 💡${state.hints}` : " · no hints"}`;
    const streak = stats.streak > 1 ? `\n🔥 ${stats.streak}-day streak` : "";
    const url = typeof window !== "undefined" ? `\n${window.location.origin}` : "";
    return `${head}\n${lines.join("\n")}${streak}${url}`;
  }, [marks, state, day, stats.streak]);

  const share = async () => {
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ text: shareText });
        return;
      }
      await navigator.clipboard.writeText(shareText);
      flash("Copied to clipboard");
    } catch {
      flash("Couldn't share, try again");
    }
  };

  const rows = Array.from({ length: MAX_GUESSES }, (_, r) => {
    if (r < state.guesses.length) return { text: state.guesses[r], marks: marks[r] as Mark[] | null };
    if (r === state.guesses.length && state.status === "playing") return { text: input, marks: null };
    return { text: "", marks: null };
  });
  const activeRow = state.status === "playing" ? state.guesses.length : -1;
  const tileSize = `min(3.6rem, calc((100vw - 4.5rem - ${(len - 1) * 0.375}rem) / ${len}), calc((100dvh - 25rem) / 6))`;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pb-3">
      <Header onHelp={() => setModal("help")} onStats={() => setModal("result")} />

      {/* file tab */}
      <div className="mt-3 flex items-center justify-between rounded-t-xl border border-b-0 border-line bg-panel/70 px-3 py-2 font-mono text-xs text-muted backdrop-blur">
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-accent" />
          <span>
            today<span className="text-fg">.diff</span>
          </span>
        </span>
        <span>
          #{day} · {len} letters · {MAX_GUESSES} tries
        </span>
      </div>

      <main className="flex flex-1 flex-col rounded-b-xl border border-line bg-panel/40 backdrop-blur">
        <Hints
          term={term}
          hints={state.hints}
          disabled={state.status !== "playing"}
          onReveal={() => update({ ...state, hints: Math.min(2, state.hints + 1) })}
        />

        <div className="flex flex-1 items-center justify-center py-4">
          <div className="grid gap-1.5" role="grid" aria-label="Guesses">
            {rows.map((row, r) => {
              const isActive = r === activeRow;
              const flipping = r === revealing;
              const won = state.status === "won" && r === state.guesses.length - 1 && revealing === null;
              return (
                <div
                  key={isActive ? `active-${shakeKey}` : r}
                  role="row"
                  className={`flex items-center gap-1.5 ${isActive && shakeKey ? "row-shake" : ""}`}
                >
                  <Gutter n={r + 1} marks={row.marks} active={isActive} />
                  {Array.from({ length: len }, (_, i) => (
                    <Tile
                      key={i}
                      ch={row.text[i] ?? ""}
                      mark={row.marks?.[i] ?? null}
                      flip={flipping}
                      hop={won && celebrate}
                      index={i}
                      size={tileSize}
                      caret={isActive && i === input.length}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      <Keyboard marks={keyMarks} onKey={press} />

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center">
          <div className="rise rounded-lg bg-fg px-4 py-2 font-mono text-sm font-semibold text-bg shadow-xl">{toast}</div>
        </div>
      )}

      {celebrate && <Confetti />}

      {modal === "help" && <HelpModal onClose={closeHelp} />}
      {modal === "result" && (
        <ResultModal
          day={day}
          state={state}
          stats={stats}
          answer={answer}
          clue={term.h}
          category={term.c}
          onShare={share}
          onClose={() => setModal("none")}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Header({ onHelp, onStats }: { onHelp: () => void; onStats: () => void }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? "dark");
  const toggle = () => {
    const t = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("dd:theme", t);
    } catch {}
    setTheme(t);
  };
  return (
    <header className="flex items-center justify-between pt-4">
      <div className="flex items-center gap-2.5">
        <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-hit font-mono text-sm font-bold text-white shadow-lg shadow-accent/20">
          ±
        </div>
        <div className="leading-tight">
          <h1 className="font-mono text-lg font-bold tracking-tight">
            daily<span className="text-accent">_</span>diff
          </h1>
          <p className="text-[11px] text-muted">guess the code word</p>
        </div>
      </div>
      <nav className="flex items-center gap-1">
        <IconButton label="How to play" onClick={onHelp}>
          <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5M12 18h.01" />
          <circle cx="12" cy="12" r="10" />
        </IconButton>
        <IconButton label="Stats" onClick={onStats}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </IconButton>
        <IconButton label="Toggle theme" onClick={toggle}>
          {theme === "dark" ? (
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </>
          ) : (
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          )}
        </IconButton>
      </nav>
    </header>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-10 place-items-center rounded-xl text-muted transition hover:bg-key hover:text-fg active:scale-95"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

function Hints({
  term,
  hints,
  disabled,
  onReveal,
}: {
  term: { c: string; h: string };
  hints: number;
  disabled: boolean;
  onReveal: () => void;
}) {
  const shown = disabled ? 2 : hints;
  return (
    <div className="flex flex-col gap-1.5 border-b border-line px-3 py-2.5 font-mono text-xs">
      <HintLine label="category" value={term.c} open={shown >= 1} />
      <HintLine label="clue" value={term.h} open={shown >= 2} />
      {!disabled && hints < 2 && (
        <button
          type="button"
          onClick={onReveal}
          onMouseDown={(e) => e.preventDefault()}
          className="mt-0.5 self-start rounded-md border border-dashed border-line px-2 py-1 text-muted transition hover:border-accent hover:text-accent"
        >
          💡 reveal {hints === 0 ? "category" : "clue"} <span className="opacity-60">(shows in your score)</span>
        </button>
      )}
    </div>
  );
}

function HintLine({ label, value, open }: { label: string; value: string; open: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-accent">{"//"}</span>
      <span className="shrink-0 text-muted">{label}:</span>
      {open ? (
        <span className="fade text-fg">{value}</span>
      ) : (
        <span className="select-none rounded bg-key px-2 text-transparent blur-[1px]">{"█".repeat(Math.min(24, value.length))}</span>
      )}
    </div>
  );
}

function Gutter({ n, marks, active }: { n: number; marks: Mark[] | null; active: boolean }) {
  const solved = marks?.every((m) => m === "hit");
  return (
    <div
      className={`w-5 text-right font-mono text-xs tabular-nums transition-colors ${
        marks ? (solved ? "text-hit" : "text-muted") : active ? "text-accent" : "text-muted/50"
      }`}
    >
      {marks ? (solved ? "+" : "−") : n}
    </div>
  );
}

function Tile({
  ch,
  mark,
  flip,
  hop,
  index,
  size,
  caret,
}: {
  ch: string;
  mark: Mark | null;
  flip: boolean;
  hop: boolean;
  index: number;
  size: string;
  caret: boolean;
}) {
  const style: React.CSSProperties & Record<string, string> = { width: size, height: size, fontSize: `calc(${size} * 0.48)` };
  let cls = "border-tile-line bg-tile text-fg";
  if (mark) {
    style["--mark"] = MARK_VAR[mark];
    if (flip) {
      style.animationDelay = `${index * FLIP_STEP}ms`;
      cls = "tile-flip";
    } else {
      cls = "text-white";
      style.background = MARK_VAR[mark];
      style.borderColor = MARK_VAR[mark];
    }
    if (hop) {
      cls += " tile-hop";
      style.animationDelay = `${index * 90}ms`;
    }
  } else if (ch) {
    cls = "tile-pop border-fg/70 bg-tile text-fg";
  }
  return (
    <div
      role="gridcell"
      aria-label={ch ? `${ch}${mark ? ` ${mark}` : ""}` : "empty"}
      style={style}
      className={`relative grid select-none place-items-center rounded-lg border-2 font-mono font-bold uppercase ${cls}`}
    >
      {mark && (
        <span className="absolute left-1 top-0.5 text-[10px] leading-none opacity-80" aria-hidden>
          {MARK_GLYPH[mark]}
        </span>
      )}
      {ch}
      {caret && !ch && <span className="caret absolute bottom-2 h-0.5 w-1/3 rounded bg-accent" aria-hidden />}
    </div>
  );
}

function Keyboard({ marks, onKey }: { marks: Record<string, Mark>; onKey: (k: string) => void }) {
  return (
    <div className="mt-3 flex flex-col gap-1.5 select-none" aria-label="Keyboard">
      {KEY_ROWS.map((row, r) => (
        <div key={r} className="flex justify-center gap-1.5">
          {[...row].map((k) => {
            if (k === "+")
              return (
                <Key key={k} wide onClick={() => onKey("ENTER")} label="Enter">
                  <span className="font-mono text-xs font-semibold">push</span>
                </Key>
              );
            if (k === "-")
              return (
                <Key key={k} wide onClick={() => onKey("BACKSPACE")} label="Backspace">
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM18 9l-6 6M12 9l6 6" />
                  </svg>
                </Key>
              );
            const m = marks[k];
            return (
              <Key key={k} mark={m} onClick={() => onKey(k)} label={k}>
                {k}
              </Key>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Key({
  children,
  onClick,
  label,
  mark,
  wide,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  mark?: Mark;
  wide?: boolean;
}) {
  const style = mark ? { background: MARK_VAR[mark], color: "#fff" } : undefined;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      style={style}
      className={`grid h-12 sm:h-13 place-items-center rounded-lg bg-key font-mono text-sm font-semibold text-fg transition-[transform,background] duration-300 active:scale-90 ${
        wide ? "flex-[1.6] px-1" : "flex-1"
      } max-w-12 ${wide ? "max-w-20" : ""}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */

function Sheet({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  return (
    <div className="fade fixed inset-0 z-40 flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={label}
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="rise relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-panel p-5 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg text-muted hover:bg-key hover:text-fg"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  const demo: { w: string; m: Mark[] } = { w: "CACHE", m: ["hit", "miss", "near", "miss", "miss"] };
  return (
    <Sheet onClose={onClose} label="How to play">
      <h2 className="font-mono text-lg font-bold">$ man daily_diff</h2>
      <p className="mt-2 text-sm text-muted">
        Guess today&apos;s programming term in <b className="text-fg">6 tries</b>. Its length changes every day (4 to 8
        letters). Each guess comes back as a diff:
      </p>
      <div className="my-4 flex gap-1.5">
        {[...demo.w].map((ch, i) => (
          <Tile key={i} ch={ch} mark={demo.m[i]} flip={false} hop={false} index={i} size="2.6rem" caret={false} />
        ))}
      </div>
      <ul className="space-y-1.5 font-mono text-sm">
        <li>
          <span className="font-bold text-hit">+ added</span> <span className="text-muted">right letter, right spot</span>
        </li>
        <li>
          <span className="font-bold text-near">~ moved</span> <span className="text-muted">in the word, wrong spot</span>
        </li>
        <li>
          <span className="font-bold text-muted">− removed</span> <span className="text-muted">not in the word</span>
        </li>
      </ul>
      <p className="mt-4 text-sm text-muted">
        Stuck? Reveal the <span className="text-fg">category</span>, then a <span className="text-fg">clue</span>. Each
        hint shows as 💡 on your share card. A new word drops at midnight, so keep your streak alive.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="mt-5 w-full rounded-xl bg-accent py-3 font-mono font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
      >
        git checkout today
      </button>
    </Sheet>
  );
}

function ResultModal({
  day,
  state,
  stats,
  answer,
  clue,
  category,
  onShare,
  onClose,
}: {
  day: number;
  state: DayState;
  stats: Stats;
  answer: string;
  clue: string;
  category: string;
  onShare: () => void;
  onClose: () => void;
}) {
  const done = state.status !== "playing";
  const won = state.status === "won";
  const maxDist = Math.max(1, ...stats.dist);
  const hash = useMemo(() => {
    let h = 2166136261;
    for (const c of `${day}${answer}${state.guesses.join("")}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return (h >>> 0).toString(16).padStart(8, "0").slice(0, 7);
  }, [day, answer, state.guesses]);

  return (
    <Sheet onClose={onClose} label="Results">
      {done ? (
        <div className="mt-7 rounded-xl border border-line bg-bg/60 p-3 font-mono text-xs leading-relaxed">
          <div>
            <span className="text-near">commit {hash}</span>{" "}
            <span className="text-muted">(</span>
            <span className="text-accent">HEAD -&gt; main</span>
            <span className="text-muted">)</span>
          </div>
          <div className="text-muted">Puzzle: #{day}</div>
          <div className={`mt-2 rounded-md px-2 py-1 ${won ? "bg-hit-soft text-hit" : "bg-miss-soft text-red-400"}`}>
            {won ? "+" : "−"} {won ? `solved in ${state.guesses.length}/${MAX_GUESSES}` : "build failed"}
            {state.hints ? ` · 💡${state.hints}` : " · no hints"}
          </div>
          <div className="mt-3 text-2xl font-bold tracking-[0.2em] text-fg">{answer}</div>
          <div className="text-muted">
            <span className="text-accent">{"// "}</span>
            {category}: {clue}
          </div>
        </div>
      ) : (
        <h2 className="font-mono text-lg font-bold">$ git log --stats</h2>
      )}

      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        <Stat n={stats.played} label="played" />
        <Stat n={stats.played ? Math.round((stats.wins / stats.played) * 100) : 0} label="win %" />
        <Stat n={stats.streak} label="streak" fire={stats.streak > 1} />
        <Stat n={stats.maxStreak} label="best" />
      </div>

      <div className="mt-4 space-y-1">
        {stats.dist.map((v, i) => {
          const mine = won && state.guesses.length === i + 1;
          return (
            <div key={i} className="flex items-center gap-2 font-mono text-xs">
              <span className="w-3 text-muted">{i + 1}</span>
              <div
                className={`flex h-5 items-center justify-end rounded px-1.5 font-semibold text-white transition-all duration-700 ${
                  mine ? "bg-hit" : "bg-miss"
                }`}
                style={{ width: `${Math.max(8, (v / maxDist) * 100)}%` }}
              >
                {v}
              </div>
            </div>
          );
        })}
      </div>

      {done && (
        <div className="mt-5 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-wider text-muted">next word in</div>
            <Countdown />
          </div>
          <button
            type="button"
            onClick={onShare}
            className="flex items-center gap-2 rounded-xl bg-hit px-5 py-3 font-mono font-semibold text-white shadow-lg shadow-hit/25 transition hover:brightness-110 active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13" />
            </svg>
            share
          </button>
        </div>
      )}
    </Sheet>
  );
}

function Stat({ n, label, fire }: { n: number; label: string; fire?: boolean }) {
  return (
    <div className="rounded-xl bg-key/60 py-2">
      <div className="font-mono text-2xl font-bold tabular-nums">
        {n}
        {fire && <span className="text-base">🔥</span>}
      </div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

function Countdown() {
  const [ms, setMs] = useState(() => msUntilTomorrow());
  useEffect(() => {
    const id = setInterval(() => setMs(msUntilTomorrow()), 1000);
    return () => clearInterval(id);
  }, []);
  if (ms <= 1000)
    return (
      <button type="button" onClick={() => location.reload()} className="font-mono text-lg font-bold text-accent underline">
        play the new word
      </button>
    );
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="font-mono text-2xl font-bold tabular-nums">
      {pad(Math.floor(s / 3600))}:{pad(Math.floor((s % 3600) / 60))}:{pad(s % 60)}
    </div>
  );
}

const CONFETTI_COLORS = ["var(--hit)", "var(--near)", "var(--accent)", "#38bdf8", "#f472b6"];
function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 70 }, (_, i) => ({
      left: Math.random() * 100,
      dx: `${(Math.random() - 0.5) * 240}px`,
      rot: `${(Math.random() - 0.5) * 1080}deg`,
      dur: `${2.2 + Math.random() * 1.6}s`,
      delay: `${Math.random() * 0.5}s`,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    })),
  );
  return (
    <div aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti"
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              "--dx": p.dx,
              "--rot": p.rot,
              "--dur": p.dur,
              "--delay": p.delay,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
