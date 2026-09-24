import Home from "@/pages/home";

// "Ao Vivo" was retired as its own tab (2026-09-24) — WinHouse's own
// sportsbook embed covers live betting now, so old /ao-vivo and /live
// links land on the Sportsbook tab instead of a dead one.
export default function LivePage() {
  return <Home initialTab="sportsbook" />;
}
