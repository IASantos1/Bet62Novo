// Seeds the hero ("top") casino banners for the 4 headline titles the
// user asked for by name (Sweet Bonanza 1000, Gates of Olympus 1000, Big
// Bass Splash, Aviator). Each banner reuses the matching game's own
// catalog artwork (already licensed via
// Palace Casino for display) rather than a fabricated promotional image —
// there is no separate marketing-creative asset for these titles, and
// inventing one would mean shipping an image the aggregator never
// provided. Subtitles are deliberately generic (no copied multiplier/RTP
// numbers from the competitor reference) since those figures weren't
// verified against our own Palace Casino integration and would be a false
// claim on a real-money site if wrong; admin/casino/banners/ai-generate
// (routes/admin.ts) is the sanctioned way to add real marketing copy.
//
// A title only gets a banner if it's actually found, active, in the
// current Palace Casino catalog — titles not present in the catalog are
// skipped with a warning, never inserted as a dangling/broken banner.
//
// Run with: pnpm --filter @workspace/api-server run seed:featured-banners
import { and, eq, ilike, sql } from "drizzle-orm";
import { db, casinoGamesTable, casinoBannersTable, initDb } from "@workspace/db";

const FEATURED: Array<{ search: string; title: string; subtitle?: string; sortOrder: number }> = [
  { search: "Sweet Bonanza 1000", title: "Sweet Bonanza 1000", sortOrder: 0 },
  { search: "Gates of Olympus 1000", title: "Gates of Olympus 1000", sortOrder: 1 },
  { search: "Big Bass Splash", title: "Big Bass Splash", subtitle: "Ganhe Rodadas Grátis", sortOrder: 2 },
  { search: "Aviator", title: "Aviator", subtitle: "Aposte Antes que Voe", sortOrder: 3 },
];

async function main() {
  await initDb();

  for (const item of FEATURED) {
    // Wildcard, not exact-equality — the catalog often carries a longer
    // real title ("Sweet Bonanza 1000 xBomb") for the base name we're
    // searching. Shortest matching name first, same "base game over
    // variant" heuristic routes/casino.ts's gameFamilyKey() row titles use.
    const [game] = await db
      .select({
        id: casinoGamesTable.id,
        name: casinoGamesTable.name,
        img: casinoGamesTable.img,
      })
      .from(casinoGamesTable)
      .where(
        and(
          eq(casinoGamesTable.isActive, true),
          eq(casinoGamesTable.source, "palace"),
          ilike(casinoGamesTable.name, `%${item.search}%`),
        ),
      )
      .orderBy(sql`length(${casinoGamesTable.name})`)
      .limit(1);

    if (!game || !game.img) {
      console.warn(
        `Skipping "${item.search}" — not found (or no artwork) in the active Palace Casino catalog. ` +
          `Run seed:palace-casino first, or check the exact title with the catalog provider.`,
      );
      continue;
    }

    const existing = await db
      .select({ id: casinoBannersTable.id })
      .from(casinoBannersTable)
      .where(and(eq(casinoBannersTable.position, "top"), eq(casinoBannersTable.title, item.title)))
      .limit(1);

    const values = {
      title: item.title,
      subtitle: item.subtitle ?? null,
      ctaText: "Jogue Agora",
      imageUrl: game.img,
      linkUrl: null,
      position: "top",
      gameIds: [game.id],
      isActive: true,
      sortOrder: item.sortOrder,
      updatedAt: new Date(),
    };

    if (existing[0]) {
      await db.update(casinoBannersTable).set(values).where(eq(casinoBannersTable.id, existing[0].id));
      console.log(`Updated banner "${item.title}" (game #${game.id}, "${game.name}").`);
    } else {
      await db.insert(casinoBannersTable).values(values);
      console.log(`Created banner "${item.title}" (game #${game.id}, "${game.name}").`);
    }
  }

  // Deactivate any "top" banner from a previous run of this script whose
  // title is no longer in FEATURED (e.g. "Wanted Dead or a Wild", swapped
  // out for "Aviator") — otherwise re-running after changing the list
  // above would leave the old title's banner behind instead of replacing
  // it, same stale-row problem seedPalaceCasinoGames.ts's own cleanup
  // guards against.
  const keptTitles = FEATURED.map((f) => f.title);
  const deactivated = await db
    .update(casinoBannersTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(casinoBannersTable.position, "top"),
        eq(casinoBannersTable.isActive, true),
        sql`${casinoBannersTable.title} <> ALL(${keptTitles})`,
      ),
    )
    .returning({ title: casinoBannersTable.title });
  for (const row of deactivated) {
    console.log(`Deactivated stale banner "${row.title}" (no longer in FEATURED).`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Featured casino banners seed failed:", err);
  process.exit(1);
});
