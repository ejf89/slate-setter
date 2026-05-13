import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const films = sqliteTable("films", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  studio: text("studio"),
  tmdbId: integer("tmdb_id"),
  genres: text("genres").notNull().default("[]"), // JSON string
  mpaaRating: text("mpaa_rating"),
  overview: text("overview"),
});

export const weekendPerformances = sqliteTable("weekend_performances", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filmId: integer("film_id").references(() => films.id),
  weekendDate: text("weekend_date").notNull(), // "YYYY-MM-DD" (Friday)
  rank: integer("rank"),
  gross: integer("gross"),
  cumulativeGross: integer("cumulative_gross"),
  weeksInRelease: integer("weeks_in_release"),
  theaters: integer("theaters"),
});

export const slateFilms = sqliteTable("slate_films", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  genres: text("genres").notNull().default("[]"), // JSON string
  director: text("director"),
  logline: text("logline"),
  tentativeDate: text("tentative_date"),
  status: text("status").notNull().default("unscheduled"),
});
