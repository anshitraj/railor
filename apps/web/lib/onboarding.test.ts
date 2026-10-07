import { describe, expect, it } from "vitest";
import { OnboardingAnswers } from "@railor/types";
import { onboardingCustomerType, onboardingPriceProfile } from "./onboarding";
import { signInDestination, onboardingFinishPath } from "./security";

describe("new-account onboarding", () => {
  it("sends incomplete accounts through setup while preserving their destination", () => {
    expect(signInDestination("/app/connections?provider=wise", false)).toBe("/welcome?next=%2Fapp%2Fconnections%3Fprovider%3Dwise");
    expect(signInDestination("/welcome?q=India%20to%20UAE", false)).toBe("/welcome?q=India%20to%20UAE");
  });
  it("preserves invitation acceptance and does not restart completed onboarding", () => {
    expect(signInDestination("/invite/fixture", false)).toBe("/invite/fixture");
    expect(signInDestination("/welcome", true)).toBe("/app");
    expect(signInDestination("/app/prices", true)).toBe("/app/prices");
  });
  it("keeps unsafe and recursive finish destinations out", () => {
    expect(onboardingFinishPath("https://outside.invalid")).toBe("/app");
    expect(onboardingFinishPath("/welcome?next=/app")).toBe("/app");
    expect(onboardingFinishPath("/app/prices?provider=wise")).toBe("/app/prices?provider=wise");
  });
  it.each([
    ["personal", "individual"], ["freelancer", "individual"],
    ["freelancer_business", "business"], ["payments", "business"],
  ] as const)("persists %s and uses %s eligibility", (building, expected) => {
    const answers = OnboardingAnswers.parse({ building });
    expect(onboardingCustomerType(answers.building)).toBe(expected);
  });
  it("keeps the chosen account profile in price comparisons", () => {
    expect(onboardingPriceProfile("personal")).toBe("personal");
    expect(onboardingPriceProfile("freelancer")).toBe("freelancer");
    expect(onboardingPriceProfile("freelancer_business")).toBe("business");
    expect(onboardingPriceProfile("payments")).toBe("business");
  });
});
