"use client";

import dynamic from "next/dynamic";

function BoardSkeleton() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="grid gap-1.5">
        {Array.from({ length: 6 }).map((_, r) => (
          <div key={r} className="flex gap-1.5">
            {Array.from({ length: 5 }).map((_, c) => (
              <div key={c} className="size-12 rounded-lg border-2 border-tile-line/60 animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// The puzzle depends on the visitor's local date and saved progress,
// so it renders only in the browser.
export const ClientGame = dynamic(() => import("./Game"), { ssr: false, loading: BoardSkeleton });
