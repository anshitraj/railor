import type { BuildingType, CorridorQuery } from "@railor/types";
import type { CustomerContext } from "@railor/core";

/** The customer is chosen explicitly, never inferred from their email domain. */
export function onboardingCustomerType(building?: BuildingType): CorridorQuery["customerType"] {
  return building === "personal" || building === "freelancer" ? "individual" : "business";
}

export function onboardingPriceProfile(building?: string | null): CustomerContext["profile"] {
  return building === "personal" ? "personal" : building === "freelancer" ? "freelancer" : "business";
}
