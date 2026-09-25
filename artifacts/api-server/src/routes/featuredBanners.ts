import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
// See routes/admin.ts for why this is a relative import instead of the
// "@workspace/db" alias — a tsc alias-resolution quirk, not a runtime issue.
import { featuredMatchBannersTable } from "../../../../lib/db/src/schema/featuredMatchBanners.js";
import { bannerTemplatesTable } from "../../../../lib/db/src/schema/bannerTemplates.js";
import { and, asc, eq, gt } from "drizzle-orm";

const router: IRouter = Router();

// Public — powers the "Jogos em Destaque" strip on the Destaques/home page.
// Only banners currently in their admin-scheduled window are returned:
// once endsAt passes, a banner just stops appearing here on its own, no
// manual cleanup needed on the admin side. Joins in the picked template's
// logo/colors — the public CompetitionBanner render needs them, not just
// the plain-text `competition` label.
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select({ banner: featuredMatchBannersTable, template: bannerTemplatesTable })
    .from(featuredMatchBannersTable)
    .leftJoin(bannerTemplatesTable, eq(featuredMatchBannersTable.bannerTemplateId, bannerTemplatesTable.id))
    .where(
      and(
        eq(featuredMatchBannersTable.isActive, true),
        gt(featuredMatchBannersTable.endsAt, new Date()),
      ),
    )
    .orderBy(asc(featuredMatchBannersTable.kickoffAt));

  const banners = rows.map(({ banner, template }) => ({ ...banner, template: template ?? null }));
  res.json({ banners });
});

export default router;
