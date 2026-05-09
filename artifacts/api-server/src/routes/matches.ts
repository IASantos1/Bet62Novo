import { Router, type IRouter } from "express";

const router: IRouter = Router();

// Mock matches data
const MATCHES = [
  {
    id: "pl-1",
    sport: "Futebol",
    league: "Premier League",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    startTime: new Date(Date.now() + 3600000 * 24).toISOString(), // 24h from now
    odds: {
      home: 1.85,
      draw: 3.60,
      away: 4.20
    },
    bannerUrl: "@assets/file_1778342439847_1778342557288.jpeg"
  },
  {
    id: "pl-2",
    sport: "Futebol",
    league: "Premier League",
    homeTeam: "Manchester United",
    awayTeam: "Liverpool",
    startTime: new Date(Date.now() + 3600000 * 48).toISOString(), // 48h from now
    odds: {
      home: 2.90,
      draw: 3.50,
      away: 2.35
    },
    bannerUrl: "@assets/file_1778342451290_1778342557288.jpeg"
  },
  {
    id: "pl-3",
    sport: "Futebol",
    league: "Premier League",
    homeTeam: "Manchester City",
    awayTeam: "Aston Villa",
    startTime: new Date(Date.now() + 3600000 * 72).toISOString(), // 72h from now
    odds: {
      home: 1.25,
      draw: 6.50,
      away: 11.00
    },
    bannerUrl: "@assets/file_1778342444770_1778342557288.jpeg"
  },
  {
    id: "br-1",
    sport: "Futebol",
    league: "Brasileirão Série A",
    homeTeam: "Flamengo",
    awayTeam: "Corinthians",
    startTime: new Date(Date.now() + 3600000 * 12).toISOString(),
    odds: {
      home: 1.70,
      draw: 3.40,
      away: 5.25
    }
  }
];

router.get("/", (_req, res) => {
  res.json(MATCHES);
});

export default router;
