# Slate Setter

A theatrical release planning tool. Analyzes three years of domestic box office history to score every weekend by how much genre-matched competition a film would face — so the team can find the best opening date and understand the trade-offs between any two windows.

## What it does

**Pick a film, see the competitive landscape for an entire year.** Each weekend gets a competition score based on what films are in theaters, how closely they overlap your genres, how deep into their run they are, and how much of the box office they control.

**Compare two windows head-to-head.** Click any row to pin it as your "View" window, then hit **vs** on another to compare. A summary banner tells you which date is better, by how much, and why — which threats are driving the score, whether the market size differs, and the relative percentage difference.

**Best windows surface automatically.** The three lowest-competition weekends are pulled to the top as recommendation cards showing the date, score, and top competing title (or "no direct threats").

**The studio catalog as a reference set.** Beyond the upcoming slate, every historical film in the database with genre data is browsable in the Catalog tab — searchable and filterable by genre. Select any title to run it through the same scoring.

**2026 is projected, 2023–2025 are exact.** Use the year selector to browse historical competitive landscapes or jump to 2026, which uses 2025 as a structural proxy (same seasonal rhythm, same holiday pattern).

## The scoring algorithm

For each film in theaters on a given weekend:

```
score += genreOverlap × (1 ÷ weeksInRelease) × (gross ÷ totalWeekendGross)
```

Three factors:

| Factor | What it measures |
|---|---|
| **Genre overlap** | 1.0 for same genre, 0.6 for adjacent pairs (Horror↔Thriller, Drama↔Romance, etc.), 0.15 for unrelated |
| **Holdover decay** | 1 ÷ weeksInRelease — a film in week 3 has already spent most of its core audience |
| **Market share** | gross ÷ total weekend gross — only films that actually moved the needle count |

Scores are shown as a percentage. Under 18% is low competition, 18–35% medium, 35%+ high.

## Data sources

### Box Office Mojo (scraped)

`scripts/seed.ts` scrapes the weekly box office charts from Box Office Mojo and writes them into a local SQLite database. For each weekend it records:

- `weekend_date` — the Friday–Sunday date
- `gross` — domestic gross for that film that weekend
- `rank` — chart position
- `weeks_in_release` — how many weekends the film had been in release
- `theater_count` — number of screens

Coverage: 2015–2025, 537 weekends, ~2,000 unique films.

### TMDB (genre enrichment)

`scripts/enrich.ts` calls the TMDB API to attach genre metadata to each film in the database. Genres are stored as a JSON array on each `films` row (e.g. `["Horror","Thriller"]`). Requires a `TMDB_API_KEY` env variable — get one free at [themoviedb.org](https://www.themoviedb.org/settings/api).

### Hardcoded genre map (`src/lib/genreMap.ts`)

For titles where TMDB data is absent or wrong — particularly 2025 releases that weren't in TMDB at scrape time — genres are provided via a curated internal map covering ~200 titles. It takes precedence over TMDB data at runtime.

### What gets calculated at runtime

When you select a film and a year, the API (`/api/simulate/window`) does the following:

1. Loads all weekends in the selected year from SQLite (cached per year after first load)
2. Looks up all films that appeared in theaters that year and resolves their genres
3. For each weekend, iterates over every film in theaters and computes its contribution to the competition score
4. Returns the scored weekends, the films driving competition, and the projected date (for 2026, dates are shifted from 2025 data)

The raw window data (all weekends + all films) is cached in memory per year, so switching films is fast after the first load — score computation is pure JS with no additional database queries.

The database is a local SQLite file at `scripts/slate.db`. It is not required at build time — only at runtime.

## Getting started

Install dependencies:

```bash
npm install
```

The database is already seeded and committed at `data/slate.db`. To re-seed from scratch:

```bash
npm run seed                        # scrapes Box Office Mojo → SQLite
TMDB_API_KEY=your_key npm run enrich  # enriches genres via TMDB
```

Run the dev server. The app uses a lot of in-memory cache and SQLite — give Node extra heap:

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
src/
  app/
    page.tsx                      # Entry point — renders SimulatePage
    about/page.tsx                # Algorithm explainer
    api/
      slate/route.ts              # Upcoming slate films
      catalog/route.ts            # Historical studio catalog
      simulate/window/route.ts    # Core scoring endpoint
  lib/
    competition.ts                # genreOverlap() and ratingFromScore()
    genreMap.ts                   # Hardcoded genre overrides (~200 titles)
    db.ts                         # SQLite connection + in-memory cache
    types.ts                      # Shared types
  app/simulate/
    SimulatePage.tsx              # Main UI — heat map, weekend list, detail panel
scripts/
  seed.ts                         # Scrapes Box Office Mojo → SQLite
  enrich.ts                       # Enriches films with TMDB genres
  slate.db                        # SQLite database
```

## Tech

- Next.js 16, React 19, TypeScript
- SQLite via `better-sqlite3` (Node runtime, not edge)
- Tailwind CSS v4
- Newsreader serif font for display text
