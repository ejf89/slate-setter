import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <Link
          href="/"
          className="text-neutral-500 text-sm hover:text-neutral-300 transition-colors"
        >
          ← Back to planner
        </Link>
        <span className="text-neutral-700 text-xs tracking-widest uppercase">
          How it works
        </span>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="font-[family-name:var(--font-newsreader)] text-5xl text-white font-normal mb-4 leading-tight">
          The algorithm,<br />explained.
        </h1>
        <p className="text-neutral-500 text-base mb-16 leading-relaxed">
          Slate Setter analyzes three years of box office history to score every
          upcoming weekend by how much genre-matched competition your film would
          face. Here's exactly how it works.
        </p>

        {/* Step 1 */}
        <section className="mb-14">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-neutral-700 text-xs tracking-widest uppercase font-mono">01</span>
            <h2 className="text-white text-xl font-[family-name:var(--font-newsreader)]">
              Genre overlap
            </h2>
          </div>
          <p className="text-neutral-400 text-sm leading-relaxed mb-4">
            For each film in theaters on a given weekend, we measure how
            closely its audience overlaps with yours. Genres aren't all-or-nothing —
            adjacent genres share meaningful audiences.
          </p>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-5 space-y-2 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-neutral-500">Same genre (e.g. Horror → Horror)</span>
              <span className="text-white">1.0 ×</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Adjacent pair (Horror ↔ Thriller)</span>
              <span className="text-white">0.6 ×</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Adjacent pair (Drama ↔ Romance)</span>
              <span className="text-white">0.6 ×</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Adjacent pair (Action ↔ Adventure)</span>
              <span className="text-white">0.6 ×</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Unrelated genres</span>
              <span className="text-neutral-600">0.15 ×</span>
            </div>
          </div>
          <p className="text-neutral-600 text-xs mt-3">
            A Horror film competing against a Thriller counts as 60% of a direct
            horror-on-horror conflict. A Comedy barely registers against a Drama.
          </p>
        </section>

        {/* Step 2 */}
        <section className="mb-14">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-neutral-700 text-xs tracking-widest uppercase font-mono">02</span>
            <h2 className="text-white text-xl font-[family-name:var(--font-newsreader)]">
              Holdover decay
            </h2>
          </div>
          <p className="text-neutral-400 text-sm leading-relaxed mb-4">
            A film in its second or third weekend has already captured most of its
            core audience. Holdovers pose less of a threat to a new opening — so
            we discount them by their week in release.
          </p>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-5 space-y-2 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-neutral-500">Week 1 (opening weekend)</span>
              <span className="text-white">1.0 ÷ 1 = 1.00</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Week 2</span>
              <span className="text-white">1.0 ÷ 2 = 0.50</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Week 3</span>
              <span className="text-white">1.0 ÷ 3 = 0.33</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Week 6+</span>
              <span className="text-neutral-600">≤ 0.17</span>
            </div>
          </div>
          <p className="text-neutral-600 text-xs mt-3">
            This rewards weekends where genre-similar films are deep into their
            runs — their audience is largely spent.
          </p>
        </section>

        {/* Step 3 */}
        <section className="mb-14">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-neutral-700 text-xs tracking-widest uppercase font-mono">03</span>
            <h2 className="text-white text-xl font-[family-name:var(--font-newsreader)]">
              Market share weighting
            </h2>
          </div>
          <p className="text-neutral-400 text-sm leading-relaxed mb-4">
            Not every film in theaters matters equally. A film doing 5% of the
            weekend gross barely moves the needle. We weight each competitor by
            its share of total box office that weekend.
          </p>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-5 font-mono text-xs">
            <div className="text-neutral-500 mb-2">Market share per film:</div>
            <div className="text-white">film.gross ÷ total weekend gross</div>
          </div>
        </section>

        {/* The formula */}
        <section className="mb-14">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-neutral-700 text-xs tracking-widest uppercase font-mono">04</span>
            <h2 className="text-white text-xl font-[family-name:var(--font-newsreader)]">
              The competition score
            </h2>
          </div>
          <p className="text-neutral-400 text-sm leading-relaxed mb-4">
            We multiply all three factors together for each film in theaters,
            then sum them up for the weekend's total competition score.
          </p>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-5 font-mono text-xs">
            <div className="text-neutral-500 mb-3">For each film in theaters that weekend:</div>
            <div className="text-white mb-1">
              score += genreOverlap × (1 ÷ weeksInRelease) × (gross ÷ totalGross)
            </div>
            <div className="border-t border-white/[0.06] mt-3 pt-3 text-neutral-500">
              Final score is shown as a percentage. 0% = no competition · 100% = dominated.
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { label: "Low", color: "bg-emerald-500", range: "0–18%", desc: "Clear runway. Genre-matched competition is minimal." },
              { label: "Medium", color: "bg-amber-500", range: "18–35%", desc: "Moderate competition. Could cost 15–25% of opening." },
              { label: "High", color: "bg-red-500", range: "35%+", desc: "Direct genre competition is dominant. Reconsider the date." },
            ].map((tier) => (
              <div key={tier.label} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${tier.color}`} />
                  <span className="text-white text-xs font-medium">{tier.label}</span>
                </div>
                <div className="text-neutral-600 text-xs font-mono mb-2">{tier.range}</div>
                <p className="text-neutral-500 text-xs leading-relaxed">{tier.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Future windows */}
        <section className="mb-14">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-neutral-700 text-xs tracking-widest uppercase font-mono">05</span>
            <h2 className="text-white text-xl font-[family-name:var(--font-newsreader)]">
              Projecting future windows
            </h2>
          </div>
          <p className="text-neutral-400 text-sm leading-relaxed mb-4">
            We don't know what films will be in theaters in Fall 2026. Instead,
            we use the equivalent window from 2025 as a structural proxy — same
            seasonal rhythm, same holiday pattern, similar competitive landscape.
          </p>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-5 space-y-2 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-neutral-500">Fall 2026 (projected)</span>
              <span className="text-white">→ uses Fall 2025 data</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Summer 2026 (projected)</span>
              <span className="text-white">→ uses Summer 2025 data</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Fall 2025, 2024 (historical)</span>
              <span className="text-white">→ exact data</span>
            </div>
          </div>
          <p className="text-neutral-600 text-xs mt-3">
            Projected windows are marked clearly in the UI. The structural
            competition profile (how holidays, holdovers, and genre cycles behave)
            is remarkably stable year-over-year.
          </p>
        </section>

        {/* Data sources */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-neutral-700 text-xs tracking-widest uppercase font-mono">06</span>
            <h2 className="text-white text-xl font-[family-name:var(--font-newsreader)]">
              Data sources
            </h2>
          </div>
          <div className="space-y-3">
            {[
              {
                name: "Box Office Mojo",
                desc: "Weekend gross, rank, theater count, weeks in release — scraped for 2015–2025 (537 weekends, ~1,900 unique films).",
              },
              {
                name: "TMDB (The Movie Database)",
                desc: "Genre metadata for each film. Used to power the genre-overlap scoring. Enriched at seed time — not required at runtime.",
              },
              {
                name: "Hardcoded genre map",
                desc: "For films where TMDB data is sparse or missing (notably Fall 2025 releases), genres are provided via a curated internal map covering 200+ titles.",
              },
            ].map((src) => (
              <div
                key={src.name}
                className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4"
              >
                <div className="text-white text-sm font-medium mb-1">{src.name}</div>
                <p className="text-neutral-500 text-xs leading-relaxed">{src.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="border-t border-white/5 pt-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
          >
            Start planning your release →
          </Link>
        </div>
      </div>
    </div>
  );
}
