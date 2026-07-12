import { promises as fs } from "node:fs";
import path from "node:path";

type CoverageStatus = "Tested" | "Partial" | "Manual/Admin" | "Gap";

type FamilyDefinition = {
  area: string;
  family: string;
  notes: string;
  sourcePatterns: RegExp[];
  testPatterns?: RegExp[];
  forceStatus?: CoverageStatus;
};

type CanonicalAliasCoverage = {
  canonical: string;
  aliases: string[];
  testedAliases: string[];
  status: "Tested" | "Gap";
};

type DynamicPatternDefinition = {
  area: string;
  pattern: string;
  notes: string;
  matchers: RegExp[];
  expectedExamples: string[];
};

type DynamicPatternCoverage = {
  area: string;
  pattern: string;
  notes: string;
  matchedSelections: string[];
  expectedExamples: string[];
  status: "Tested" | "Partial" | "Gap";
};

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const settlementPath = path.join(
  repoRoot,
  "artifacts",
  "api-server",
  "src",
  "settlement.ts",
);
const settleBetPath = path.join(
  repoRoot,
  "artifacts",
  "api-server",
  "src",
  "services",
  "settlement",
  "settleBet.ts",
);
const settlementWorkerPath = path.join(
  repoRoot,
  "artifacts",
  "api-server",
  "src",
  "engine",
  "settlement",
  "worker",
  "settlementWorker.ts",
);
const settlementRecoveryPath = path.join(
  repoRoot,
  "artifacts",
  "api-server",
  "src",
  "jobs",
  "settlementRecovery.ts",
);
const testsDir = path.join(
  repoRoot,
  "artifacts",
  "api-server",
  "src",
  "tests",
  "settlement",
);
const outputPath = path.join(
  repoRoot,
  "artifacts",
  "api-server",
  "docs",
  "settlement-coverage.md",
);

const familyDefinitions: FamilyDefinition[] = [
  {
    area: "Football",
    family: "`1x2`, double chance, totals, BTTS, odd/even",
    notes: "Derived from core football result and totals branches.",
    sourcePatterns: [/s === "home"/, /s === "away"/, /s === "draw"/, /dc-hd/, /bts-yes/, /goe-odd/],
    testPatterns: [/1x2-home/, /dc-hd/, /bts-yes/, /o25/, /goe-odd/],
  },
  {
    area: "Football",
    family: "team totals, exact goals, correct score, clean sheet, win to nil",
    notes: "Team goals, exact goals, correct score and clean-sheet style families.",
    sourcePatterns: [/tgh-/, /tga-/, /eg-g/, /s\.startsWith\("cs-"\)/, /wtn-h/, /cs-h/],
    testPatterns: [/tgh-o15/, /tga-u05/, /eg-g3/, /cs-3-2/, /wtn-h/, /cs-a/],
  },
  {
    area: "Football",
    family: "HT, 2H, HT/FT, win both halves, highest scoring half",
    notes: "Requires half-time data and covers score-dependent second-half families.",
    sourcePatterns: [/s\.startsWith\("ht-"\)/, /s\.startsWith\("b1h-"\)/, /s\.startsWith\("b2h-"\)/, /s\.startsWith\("htft-"\)/, /s\.startsWith\("2h-"\)/, /wbh-/, /hsf-/],
    testPatterns: [/ht-home/, /b1h-no/, /b2h-yes/, /htft-hh/, /2h-away/, /2h-o15g/, /h2cs-2-0/, /wbh-h/, /hsf-e/],
  },
  {
    area: "Football",
    family: "corners/cards",
    notes: "Covers totals plus half-scoped football cards from event extras.",
    sourcePatterns: [/cornersTotal/, /1hcard-/, /2hcard-/, /cardsTotal/],
    testPatterns: [/corners-o10/, /1hcard-o2/, /corners-u105/],
  },
  {
    area: "Football",
    family: "first goal",
    notes: "Uses provider extra metadata for the first scorer side.",
    sourcePatterns: [/fg-home/, /fg-away/, /fg-none/],
    testPatterns: [/fg-home/],
  },
  {
    area: "Football",
    family: "player goal/assist/card",
    notes: "Name-based settlement from football goal/card event summaries.",
    sourcePatterns: [/parseSelectionPlayerMarket/, /playerSelection\.market === "card"/, /goal\.assistName/],
    testPatterns: [/pg:John Doe/, /pa:John Doe/, /pc1h:John Doe/],
  },
  {
    area: "Football",
    family: "DNB, asian handicap, puck line alias",
    notes: "Includes side handicap and push or split-resolution flows.",
    sourcePatterns: [/dnb-home/, /s === "ah-home"/, /s === "ah-away"/, /pl-home/, /pl-away/],
    testPatterns: [/dnb-home/, /ah:home/, /pl:home/],
  },
  {
    area: "Football",
    family: "extra time, penalties",
    notes: "Extra-time winner, totals, tie-winner and penalty shootout winner.",
    sourcePatterns: [/s\.startsWith\("et-"\)/, /pen-home/, /pen-away/],
    testPatterns: [/et-home/, /pen-home/],
  },
  {
    area: "Football",
    family: "delayed/cancelled timeout behavior",
    notes: "Operational state transitions before settlement data becomes available.",
    sourcePatterns: [/resolveSettlementStatusOutcome/, /hasSettlementTimedOut/, /auto_void_timeout/],
    testPatterns: [/cancelled event is immediately voided/i, /postponed event remains pending/i, /auto-voids after settlement timeout/i],
  },
  {
    area: "Tennis",
    family: "set winner, exact sets, total sets",
    notes: "Match and set count families based on set breakdowns.",
    sourcePatterns: [/set\[123\]-\(home\|away\)/, /es-\(h20\|h21\|a02\|a12\)/, /sets\(35\|25\)\?/],
    testPatterns: [/total-sets-o2\.5/, /es-h20/],
  },
  {
    area: "Tennis",
    family: "set handicap, game handicap, total games",
    notes: "Line-based tennis settlement from completed set aggregates.",
    sourcePatterns: [/sh\(\\d\+\)-\(home\|away\)/, /gh-\(home\|away\)-/, /tg-\(\[ou\]\)-/],
    testPatterns: [/sh15-home/, /gh-home-2\.5/, /tg-o-21\.5/],
  },
  {
    area: "Tennis",
    family: "set games, set correct score, odd/even",
    notes: "First/second-set games and parity families.",
    sourcePatterns: [/s\(\[12\]\)g-/, /sc\(\[12\]\)-/, /oe1-odd/, /oe2-even/],
    testPatterns: [/s1g-o-9\.5/, /sc1-6-4/, /oe1-even/],
  },
  {
    area: "Tennis",
    family: "win at least one set, set + match combo",
    notes: "Tennis combo and at-least-one-set families.",
    sourcePatterns: [/wal1-yes/, /wal2-no/, /sm2-\(11\|12\|21\|22\)/],
    testPatterns: [/wal2-no/, /sm2-11/],
  },
  {
    area: "Basketball",
    family: "quarter winner, quarter total, quarter spread",
    notes: "Quarter result families from per-period score breakdowns.",
    sourcePatterns: [/const q = s\.match/, /q1H/, /q1A/],
    testPatterns: [/q1-home/, /q2t-o-45\.5/, /q1s-home-5/],
  },
  {
    area: "Basketball",
    family: "total points, 1H points, team totals",
    notes: "Full-game and first-half totals plus team totals.",
    sourcePatterns: [/b-pts-/, /b-h1-pts-/, /b-tt-/],
    testPatterns: [/b-pts-o-180\.5/, /b-h1-pts-o-100\.5/, /b-tt-home-o-95\.5/],
  },
  {
    area: "Basketball",
    family: "any/all quarters",
    notes: "Team must win any quarter or all quarters.",
    sourcePatterns: [/b-anyq-home/, /b-allq-home/],
    testPatterns: [/b-allq-home/],
  },
  {
    area: "Hockey",
    family: "period result, period total",
    notes: "Period winner and totals derived from period breakdowns.",
    sourcePatterns: [/p\[123\]-\(home\|draw\|away\)/, /p\[123\]t-/],
    testPatterns: [/p1-home/, /p2t-o-1\.5/],
  },
  {
    area: "Hockey",
    family: "shots on goal",
    notes: "Uses direct or derived shots-on-goal extras, including live extraction.",
    sourcePatterns: [/sog-/, /getHockeyShotsOnGoalTotalFromExtras/],
    testPatterns: [/sog-o-60\.5/, /sog-o-63/, /sog-o-40\.5/, /shots on goal total/i],
  },
  {
    area: "Volleyball",
    family: "set winner, exact match score, set handicap",
    notes: "Set-derived volleyball settlement families.",
    sourcePatterns: [/vs-s\(30\|31\|32\|03\|13\|23\)/, /hcap-vb-home/, /set\[123\]-\(home\|away\)/],
    testPatterns: [/set1-home/, /vs-s31/, /hcap-vb-home/],
  },
  {
    area: "Volleyball",
    family: "total points, points handicap",
    notes: "Volleyball total points and line-based points handicap.",
    sourcePatterns: [/pt-\(\[ou\]\)-/, /s === "pth"/, /s === "pta"/],
    testPatterns: [/pt-o-180\.5/, /pth/],
  },
  {
    area: "Baseball",
    family: "game total, run line",
    notes: "MLB full game totals and run line families.",
    sourcePatterns: [/mlb-tot-/, /rl-home/, /rl-away/],
    testPatterns: [/mlb-o85/, /rl-home/],
  },
  {
    area: "Baseball",
    family: "F5 result, F5 total",
    notes: "First five innings result and totals.",
    sourcePatterns: [/f5-home/, /f5-away/, /f5t-/],
    testPatterns: [/f5-home/, /f5t-o-4\.5/, /f5t-o-4/],
  },
  {
    area: "Live Engine",
    family: "early wins/losses for totals and HT-scoped markets",
    notes: "Early-settlement paths from `resolveLiveSelectionSettlement`.",
    sourcePatterns: [/resolveLiveSelectionSettlement/, /liveDefinitiveOutcomeForSel/, /buildLiveSettlementScore/],
    testPatterns: [/live half time home/i, /live over 2\.5 goals/i, /live corners under 10\.5/i],
  },
  {
    area: "Ticket Aggregation",
    family: "`won`, `lost`, `voided`, `pending`",
    notes: "Aggregated ticket outcome calculation in `deriveSettlementDecision`.",
    sourcePatterns: [/deriveSettlementDecision/],
    testPatterns: [/won plus void/i, /marks ticket as lost/i, /remains pending/i, /refunds stake/i],
  },
  {
    area: "Ticket Aggregation",
    family: "`half_won`, `half_lost`",
    notes: "Partial outcome math on accumulator payouts.",
    sourcePatterns: [/half_won/, /half_lost/],
    testPatterns: [/half-won/i, /half-lost/i],
  },
  {
    area: "Recovery / Worker / Idempotency",
    family: "integration against DB + ledger side effects",
    notes: "Covers worker, recovery, idempotency and ledger side effects through the settlement integration harness.",
    sourcePatterns: [/ensureSettlementTransitionIdempotency/, /acquireBetSettlementLock/, /releaseBetSettlementLock/, /runSettlementRecovery/, /runSettlementWorker/],
    testPatterns: [
      /keeps payout ledger idempotent/i,
      /worker integration settles pending tickets/i,
      /recovery integration only reprocesses stale unlocked bets/i,
    ],
  },
  {
    area: "Manual settlement families",
    family: "admin-only or provider-fragile branches",
    notes: "Kept out of the pure unit-style suite unless fixtures become stable.",
    sourcePatterns: [/resolveSelectionMarketFallback/, /scoreOutcomeForSelLastResort/],
    forceStatus: "Manual/Admin",
  },
];

const dynamicPatternDefinitions: DynamicPatternDefinition[] = [
  {
    area: "Football",
    pattern: "compact result aliases: `r:*`, `ht:*`, `sh:*`, `dc:*`",
    notes: "Compact football selections normalized before main settlement scoring.",
    matchers: [/^\d+:(home|draw|away)$/, /^r:(home|draw|away)$/, /^ht:(home|draw|away)$/, /^sh:(home|draw|away)$/, /^dc:(hd|ad|ha)$/],
    expectedExamples: ["r:home", "ht:home", "sh:away", "dc:hd"],
  },
  {
    area: "Football",
    pattern: "compact totals and team goals: `tg:*`, `htg:*`, `atg:*`",
    notes: "Dynamic line-based football markets from compact provider keys.",
    matchers: [/^tg:[ou]\d+(?:[.,]\d+)?$/, /^(htg|atg):[ou]\d+(?:[.,]\d+)?$/],
    expectedExamples: ["tg:o2.5", "htg:o1.5", "atg:u0.5"],
  },
  {
    area: "Football",
    pattern: "compact cards/corners: `cn:*`, `cd:*`, `cd1h:*`, `cd2h:*`",
    notes: "Dynamic football stats aliases for corners and cards.",
    matchers: [/^cn:[ou]\d+(?:[.,]\d+)?$/, /^cd:[ou]\d+(?:[.,]\d+)?$/, /^cd1h:[ou]\d+(?:[.,]\d+)?$/, /^cd2h:[ou]\d+(?:[.,]\d+)?$/],
    expectedExamples: ["cn:o10.5", "cd:o4.5", "cd1h:o2.5", "cd2h:u1.5"],
  },
  {
    area: "Football",
    pattern: "compact HT/FT and half patterns: `htft:*`, `twbh:*`, `hsh:*`",
    notes: "Dynamic football combination keys that become canonical half-scoped markets.",
    matchers: [/^htft:[hda]{2}$/, /^twbh:(h|a)$/, /^hsh:(1|2|eq)$/],
    expectedExamples: ["htft:hh", "twbh:h", "hsh:eq"],
  },
  {
    area: "Tennis",
    pattern: "set and total aliases: `s{1|2|3}-*`, `ts-*`, `games-set*`",
    notes: "Dynamic tennis normalization for set winners and set game totals.",
    matchers: [/^s[123]-(home|away)$/, /^ts-[ou](15|25|35|45)$/, /^games-set[12]-[ou]-\d+(?:\.\d+)?$/],
    expectedExamples: ["s1-home", "ts-o25", "games-set1-o-9.5"],
  },
  {
    area: "Tennis",
    pattern: "line aliases: `sh*`, `gh-*`, `total-games-*`",
    notes: "Dynamic tennis handicaps and total games aliases.",
    matchers: [/^sh\d+-(home|away)\d*$/, /^gh-(home|away)\d*$/, /^total-games-[ou]\d+(?:\.\d+)?$/],
    expectedExamples: ["sh15-home", "gh-home", "total-games-o21.5"],
  },
  {
    area: "Basketball",
    pattern: "quarter totals/spreads: `b-q{1-4}t-*`, `b-q{1-4}s-*`",
    notes: "Dynamic basketball quarter lines normalized to canonical quarter markets.",
    matchers: [/^b-q[1-4]t-[ou]-[\d.]+$/, /^b-q[1-4]s-(home|away)-[\d.]+$/, /^q[1-4]t-[ou]-[\d.]+$/, /^q[1-4]s-(home|away)-[\d.]+$/],
    expectedExamples: ["b-q1t-o-45.5", "b-q1s-home-5.5", "q2t-o-45.5", "q1s-home-5"],
  },
  {
    area: "Basketball",
    pattern: "quarter result and any/all quarter families",
    notes: "Basketball winner-by-quarter and any/all quarter markets.",
    matchers: [/^q[1-4]-(home|away)$/, /^b-anyq-(home|away)$/, /^b-allq-(home|away)$/],
    expectedExamples: ["q1-home", "b-anyq-home", "b-allq-home"],
  },
  {
    area: "Hockey",
    pattern: "period aliases: `per{1-3}-*`, `p{1-3}t-*`",
    notes: "Dynamic hockey period result and total families.",
    matchers: [/^per[1-3]-(home|draw|away)$/, /^p[1-3]-(home|draw|away)$/, /^p[1-3]t-[ou](?:-[\d.]+)?$/],
    expectedExamples: ["per1-home", "p1-home", "p2t-o-1.5"],
  },
  {
    area: "Hockey",
    pattern: "shots on goal lines: `sog-*`",
    notes: "Dynamic hockey shots on goal line families.",
    matchers: [/^sog-[ou](?:-[\d.]+)?$/],
    expectedExamples: ["sog-o-40.5", "sog-o-63"],
  },
  {
    area: "Baseball",
    pattern: "MLB totals and run line aliases",
    notes: "Dynamic baseball aliases for totals and run line.",
    matchers: [/^mlb-tot-[ou]-[\d.]+$/, /^mlb-[ou][\d.]+$/, /^mlb-rl-(home|away)(?:-[\d.]+)?$/, /^rl-(home|away)$/],
    expectedExamples: ["mlb-tot-o-8.5", "mlb-o85", "mlb-rl-home-1.5", "rl-home"],
  },
  {
    area: "Baseball",
    pattern: "F5 result and total aliases",
    notes: "Dynamic first-five baseball markets.",
    matchers: [/^mlb-f5-(home|away)$/, /^f5-(home|away)$/, /^mlb-f5t-[ou]-[\d.]+$/, /^f5t-[ou](?:-[\d.]+)?$/],
    expectedExamples: ["mlb-f5-home", "f5-home", "mlb-f5t-o-4.5", "f5t-o-4.5"],
  },
  {
    area: "Football",
    pattern: "second-half dynamic families: `2h-*`, `h2cs-*`, `htcs-*`",
    notes: "Dynamic second-half and half-time correct score families from settlement scoring.",
    matchers: [/^2h-(home|draw|away)$/, /^2h-[ou]\d+g$/, /^h2cs-\d+-\d+$/, /^htcs-\d+-\d+$/],
    expectedExamples: ["2h-away", "2h-o15g", "h2cs-2-0", "htcs-1-0"],
  },
];

async function readDirFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return readDirFiles(fullPath);
      return [fullPath];
    }),
  );
  return files.flat();
}

function regexMatches(patterns: RegExp[], text: string): boolean {
  return patterns.every((pattern) => pattern.test(text));
}

function collectSelectionsFromTests(testContent: string): string[] {
  const selections = new Set<string>();
  const regex = /makeSelection\("([^"]+)"/g;
  let match: RegExpExecArray | null = regex.exec(testContent);
  while (match) {
    selections.add(match[1]);
    match = regex.exec(testContent);
  }
  return [...selections].sort();
}

function extractNormalizeFunctionBlock(settlementSource: string): string {
  const startToken = "export function normalizeSettlementSelectionKey";
  const endToken = "function parsePeriodsFromScore";
  const start = settlementSource.indexOf(startToken);
  const end = settlementSource.indexOf(endToken);
  if (start === -1 || end === -1 || end <= start) return "";
  return settlementSource.slice(start, end);
}

function extractCanonicalAliasCoverage(
  normalizationBlock: string,
  testedSelections: string[],
): CanonicalAliasCoverage[] {
  const canonicalMap = new Map<string, Set<string>>();
  const assignmentRegex = /(?:if|else if)\s*\(([^)]*?)\)\s*s\s*=\s*"([^"]+)"/g;

  let match: RegExpExecArray | null = assignmentRegex.exec(normalizationBlock);
  while (match) {
    const condition = match[1] ?? "";
    const canonical = match[2] ?? "";
    const aliases = [...condition.matchAll(/s === "([^"]+)"/g)].map(
      (entry) => entry[1]!,
    );
    if (aliases.length > 0 && canonical) {
      const existing = canonicalMap.get(canonical) ?? new Set<string>();
      for (const alias of aliases) existing.add(alias);
      existing.add(canonical);
      canonicalMap.set(canonical, existing);
    }
    match = assignmentRegex.exec(normalizationBlock);
  }

  return [...canonicalMap.entries()]
    .map(([canonical, aliases]) => {
      const sortedAliases = [...aliases].sort((left, right) =>
        left.localeCompare(right),
      );
      const testedAliasMatches = sortedAliases.filter((alias) =>
        testedSelections.includes(alias),
      );
      return {
        canonical,
        aliases: sortedAliases,
        testedAliases: testedAliasMatches,
        status: (testedAliasMatches.length > 0 ? "Tested" : "Gap") as
          | "Tested"
          | "Gap",
      };
    })
    .sort((left, right) => left.canonical.localeCompare(right.canonical));
}

function deriveStatus(
  family: FamilyDefinition,
  settlementSource: string,
  testsJoined: string,
): CoverageStatus {
  if (family.forceStatus) return family.forceStatus;
  const sourceCovered = regexMatches(family.sourcePatterns, settlementSource);
  if (!sourceCovered) return "Gap";
  if (!family.testPatterns || family.testPatterns.length === 0) return "Gap";
  const tested = family.testPatterns.every((pattern) => pattern.test(testsJoined));
  if (tested) return "Tested";
  const partial = family.testPatterns.some((pattern) => pattern.test(testsJoined));
  return partial ? "Partial" : "Gap";
}

function deriveDynamicPatternCoverage(
  definitions: DynamicPatternDefinition[],
  testedSelections: string[],
): DynamicPatternCoverage[] {
  return definitions.map((definition) => {
    const matchedSelections = testedSelections.filter((selection) =>
      definition.matchers.some((matcher) => matcher.test(selection)),
    );
    const expectedHits = definition.expectedExamples.filter((example) =>
      testedSelections.includes(example),
    );
    const status: "Tested" | "Partial" | "Gap" =
      expectedHits.length === definition.expectedExamples.length
        ? "Tested"
        : expectedHits.length > 0 || matchedSelections.length > 0
          ? "Partial"
          : "Gap";
    return {
      area: definition.area,
      pattern: definition.pattern,
      notes: definition.notes,
      matchedSelections,
      expectedExamples: definition.expectedExamples,
      status,
    };
  });
}

async function main(): Promise<void> {
  const [
    settlementSource,
    settleBetSource,
    settlementWorkerSource,
    settlementRecoverySource,
    testFiles,
  ] = await Promise.all([
    fs.readFile(settlementPath, "utf8"),
    fs.readFile(settleBetPath, "utf8"),
    fs.readFile(settlementWorkerPath, "utf8"),
    fs.readFile(settlementRecoveryPath, "utf8"),
    readDirFiles(testsDir),
  ]);
  const sourceJoined = [
    settlementSource,
    settleBetSource,
    settlementWorkerSource,
    settlementRecoverySource,
  ].join("\n\n");

  const specFiles = testFiles
    .filter((file) => file.endsWith(".spec.ts"))
    .sort((left, right) => left.localeCompare(right));

  const testContents = await Promise.all(
    specFiles.map(async (file) => ({
      file,
      content: await fs.readFile(file, "utf8"),
    })),
  );

  const joinedTests = testContents.map((entry) => entry.content).join("\n\n");
  const testedSelections = collectSelectionsFromTests(joinedTests);
  const normalizationBlock = extractNormalizeFunctionBlock(settlementSource);
  const canonicalAliasCoverage = extractCanonicalAliasCoverage(
    normalizationBlock,
    testedSelections,
  );
  const dynamicPatternCoverage = deriveDynamicPatternCoverage(
    dynamicPatternDefinitions,
    testedSelections,
  );
  const coverageRows = familyDefinitions.map((family) => ({
    ...family,
    status: deriveStatus(family, sourceJoined, joinedTests),
  }));
  const aliasCoverageSummary = {
    total: canonicalAliasCoverage.length,
    tested: canonicalAliasCoverage.filter((entry) => entry.status === "Tested")
      .length,
    gap: canonicalAliasCoverage.filter((entry) => entry.status === "Gap").length,
  };
  const missingCanonicalAliases = canonicalAliasCoverage.filter(
    (entry) => entry.status === "Gap",
  );
  const dynamicPatternSummary = {
    total: dynamicPatternCoverage.length,
    tested: dynamicPatternCoverage.filter((entry) => entry.status === "Tested")
      .length,
    partial: dynamicPatternCoverage.filter((entry) => entry.status === "Partial")
      .length,
    gap: dynamicPatternCoverage.filter((entry) => entry.status === "Gap").length,
  };

  const now = new Date().toISOString();
  const lines: string[] = [
    "# Settlement Coverage Matrix",
    "",
    "> This file is generated by `pnpm settlement:coverage`.",
    `> Generated at: \`${now}\``,
    "",
    "## Scope",
    "",
    "This matrix compares the market families implemented in `artifacts/api-server/src/settlement.ts` with the current automated suite in `artifacts/api-server/src/tests/settlement/**`.",
    "",
    "Status legend:",
    "",
    "- `Tested`: exercised in the current automated suite",
    "- `Partial`: source branch exists and the suite covers part of the family",
    "- `Manual/Admin`: intentionally kept outside the pure unit-style suite",
    "- `Gap`: branch exists but still lacks dedicated automated coverage",
    "",
    `Detected settlement test files: \`${specFiles.length}\``,
    "",
    "## Coverage",
    "",
    "| Area | Market Family | Status | Notes |",
    "| --- | --- | --- | --- |",
    ...coverageRows.map(
      (row) => `| ${row.area} | ${row.family} | ${row.status} | ${row.notes} |`,
    ),
    "",
    "## Canonical Alias Coverage",
    "",
    `Exact canonical alias groups detected from \`normalizeSettlementSelectionKey\`: \`${aliasCoverageSummary.total}\``,
    "",
    `- Tested groups: \`${aliasCoverageSummary.tested}\``,
    `- Missing groups: \`${aliasCoverageSummary.gap}\``,
    "",
    "| Canonical key | Status | Tested aliases/examples | Known aliases |",
    "| --- | --- | --- | --- |",
    ...canonicalAliasCoverage.map((entry) => {
      const tested = entry.testedAliases.length
        ? entry.testedAliases.map((alias) => `\`${alias}\``).join(", ")
        : "-";
      const aliases = entry.aliases.map((alias) => `\`${alias}\``).join(", ");
      return `| \`${entry.canonical}\` | ${entry.status} | ${tested} | ${aliases} |`;
    }),
    "",
    "## Missing Canonical Alias Groups",
    "",
    ...(missingCanonicalAliases.length > 0
      ? missingCanonicalAliases.map(
          (entry) =>
            `- \`${entry.canonical}\`: ${entry.aliases
              .map((alias) => `\`${alias}\``)
              .join(", ")}`,
        )
      : ["- None"]),
    "",
    "## Dynamic Pattern Coverage",
    "",
    `Dynamic regex-style pattern groups tracked: \`${dynamicPatternSummary.total}\``,
    "",
    `- Tested groups: \`${dynamicPatternSummary.tested}\``,
    `- Partial groups: \`${dynamicPatternSummary.partial}\``,
    `- Missing groups: \`${dynamicPatternSummary.gap}\``,
    "",
    "| Area | Pattern | Status | Tested examples found | Expected examples | Notes |",
    "| --- | --- | --- | --- | --- | --- |",
    ...dynamicPatternCoverage.map((entry) => {
      const matched = entry.matchedSelections.length
        ? entry.matchedSelections.map((selection) => `\`${selection}\``).join(", ")
        : "-";
      const expected = entry.expectedExamples
        .map((example) => `\`${example}\``)
        .join(", ");
      return `| ${entry.area} | ${entry.pattern} | ${entry.status} | ${matched} | ${expected} | ${entry.notes} |`;
    }),
    "",
    "## Tested Selection Keys",
    "",
    testedSelections.length > 0
      ? testedSelections.map((selection) => `- \`${selection}\``).join("\n")
      : "- None found",
    "",
    "## Test Files",
    "",
    ...specFiles.map((file) => {
      const relative = path.relative(repoRoot, file).replaceAll("\\", "/");
      return `- \`${relative}\``;
    }),
    "",
    "## Suggested Next Additions",
    "",
    "1. Add DB-backed stale pending bet expiry coverage for the 72h refund path in `expireStalePendingBets()`.",
    "2. Add DB-backed integration tests for worker/recovery + ledger idempotency with seeded ledger assertions.",
    "3. Add provider-variance fixtures to validate alias normalization against real upstream payload samples.",
    "4. Add manual/admin settlement fixtures only if those branches stabilize enough for deterministic tests.",
    "",
  ];

  await fs.writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
  process.stdout.write(`Generated ${path.relative(repoRoot, outputPath)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
