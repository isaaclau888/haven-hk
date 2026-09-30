import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "$env/dynamic/private";

/**
 * False in a local checkout with no database configured. The public pages
 * check this and render with no events rather than failing to load, so the
 * site can be worked on without any secrets.
 */
export const hasDatabase = Boolean(env.DATABASE_URL);

if (!hasDatabase) {
  console.warn("DATABASE_URL is not set — serving empty data");
}

// Without a URL the pool is still created, since nothing connects until the
// first query; anything that does query without checking `hasDatabase` fails
// on that request instead of taking the whole server down at import.
export const db = drizzle(env.DATABASE_URL ?? "");
