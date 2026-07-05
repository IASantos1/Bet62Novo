import { settleFootball } from "../rules/football";

export function routeMarket(input: any) {
  const { match } = input;

  switch (match.sport) {
    case "football":
      return settleFootball(input);

    default:
      return "pending";
  }
}
