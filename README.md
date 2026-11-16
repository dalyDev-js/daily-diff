# daily_diff

A daily code-word puzzle. Guess today's programming term in six tries, and every guess comes back as a diff:

- `+` added: right letter, right spot
- `~` moved: in the word, wrong spot
- `−` removed: not in the word

The word length changes daily (4 to 8 letters). Stuck? Reveal the category, then a clue, but each hint shows up as 💡 on your share card. Streaks, a guess distribution and an emoji share grid are saved locally.

Built with Next.js 16 (App Router), React 19 and Tailwind CSS v4. No backend: the daily word is picked deterministically from the visitor's local date, and progress lives in `localStorage`.

```bash
npm install
npm run dev
```

Day 2 of the Everyday App challenge.
