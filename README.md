# Slate Setter

A theatrical release planning tool. Scrapes Box Office Mojo for the past decade of weekly grosses, scores every weekend by how much genre-matched competition a film would face (including holdovers), and turns that data into a strategic brief — including an AI-generated opening-weekend forecast and downloadable PDF report.

## What it does

**Pick a film, see the competitive landscape for an entire year.** Each weekend gets a competition score based on what films are in theaters (including holdovers from prior weeks), how closely they overlap your genres, how deep into their run they are, and how much of the box office they control. A smooth color gradient lets you eyeball intensity at a glance.

**Multi-year stacked heat map.** Four years (2023–2026) shown side-by-side as horizontal strips so you can spot seasonal patterns across years instantly. Click any year on the left to switch the detail view.

**Compare two windows head-to-head.** Click any row to pin it as your "View" window, then hit **vs** on another to compare. A summary banner tells you which date is better, by how much, and why — which threats are driving the score, whether the market size differs, and the relative percentage difference. Holiday frames (July 4th, Thanksgiving, etc.) are surfaced as context.

**Best windows surface automatically.** The three lowest-competition weekends are pulled to the top as recommendation cards showing the date, holiday context, competition %, top competing title, and uncontested market dollars.

**AI strategic brief.** Once you've picked a window, click **Analyze with AI** to get a structured release brief from Claude: an opening weekend forecast range anchored on real comp grosses, the reasoning behind it, top three risks naming specific competitors, and a recommended release play (wide / platform / limited). A "What Claude saw" disclosure shows the exact data sent so the user can verify it's grounded.

**Multi-studio catalog as a reference set.** Browse historical wide releases from 21 tracked studios (A24, Universal, Disney, Warner Bros., Paramount, Sony, MGM, Lionsgate, 20th Century, Neon, Focus, Searchlight, Angel, Vertical, Bleecker Street, Magnolia, Ketchup, Black Bear, Icon). Filter by studio or genre, search by title. Selecting any film runs it through the same scoring.

**Downloadable PDF report.** Generates a polished multi-section release brief: AI forecast, primary/compare window breakdowns with full threat + holdover lists, year's top low-competition windows, genre comparables, and a methodology footer. The artifact a theatrical lead actually sends.

**2026 = 2025 baseline + real announced releases.** The 2025 competitive landscape supplies the structural baseline (typical seasonal patterns, market sizes, holdovers from smaller films). Layered on top, the actual **announced 2026 wide releases from The Numbers** — 221 titles from 21 tracked studios — get injected onto their announced dates with multi-week holdover decay modeled. So when you analyze, say, a horror film on June 12 2026, you see both the structural picture *and* the specific known competitors (Universal blockbuster X opening that day, Disney's tentpole still in its W3 holdover, etc.). Films from The Numbers are marked with a purple ● badge so you can tell what's real-announced vs. structural-proxy.

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

### The Numbers (announced wide releases)

`scripts/scrape-numbers.ts` fetches [the-numbers.com/movies/release-schedule](https://www.the-numbers.com/movies/release-schedule), parses out wide releases from the 21 tracked studios, and writes `data/upcoming-numbers.json` (date + title + studio per release).

`scripts/enrich-numbers-genres.ts` then sends every title to Claude in one batch call to infer genres, and writes `data/upcoming-numbers-enriched.json` with per-studio opening gross estimates added.

At runtime, when scoring a 2026 window, the API loads the enriched JSON and **merges each announced release into the closest 2025 baseline weekend** (within ±7 days), then propagates 6 weeks of holdover decay (100% / 50% / 30% / 18% / 11% / 7%). The merged films are flagged `isAnnounced`, so the UI can render them with a purple ● to distinguish from structural-proxy films.

Re-run when the schedule changes:
```bash
ANTHROPIC_API_KEY=... npm run scrape-numbers && npm run enrich-numbers
```

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
