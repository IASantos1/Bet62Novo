import { footballRouter } from "../router/footballRouter";

export function routeMarket(input: any) {
  const sport = String(
    input.match.sport ??
    ""
  ).toLowerCase();

  switch (sport) {
    case "football":
        return footballRouter(input);

    default:
        return "pending";
  }
}
