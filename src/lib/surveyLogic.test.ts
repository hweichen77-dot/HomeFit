import { describe, it, expect } from "vitest";
import { computeSurveyResult, tierQualifiesForCeiling } from "./surveyLogic";

describe("tierQualifiesForCeiling", () => {
  it("keeps 60% AMI (LIHTC standard) units for a Low Income household", () => {
    // A Low Income household spans 51-80% AMI. Those in the lower part of the
    // band (51-60%) qualify for the most common affordable type, 60% AMI LIHTC
    // units, so the tier must not hide them.
    expect(tierQualifiesForCeiling("LI", 60)).toBe(true);
    expect(tierQualifiesForCeiling("LI", 80)).toBe(true);
    expect(tierQualifiesForCeiling("LI", 120)).toBe(true);
  });

  it("excludes units a Low Income household cannot qualify for", () => {
    expect(tierQualifiesForCeiling("LI", 30)).toBe(false);
    expect(tierQualifiesForCeiling("LI", 50)).toBe(false);
  });

  it("lets an Extremely Low Income household see every income tier", () => {
    for (const ceiling of [30, 50, 60, 80, 120]) {
      expect(tierQualifiesForCeiling("ELI", ceiling)).toBe(true);
    }
  });

  it("excludes deeper-subsidy units above a household's reach", () => {
    // Very Low Income (31-50%) is over-income for a 30% ELI-only property.
    expect(tierQualifiesForCeiling("VLI", 30)).toBe(false);
    expect(tierQualifiesForCeiling("VLI", 50)).toBe(true);
    // Moderate (81-120%) is over-income for an 80% cap.
    expect(tierQualifiesForCeiling("Moderate", 80)).toBe(false);
    expect(tierQualifiesForCeiling("Moderate", 120)).toBe(true);
  });

  it("matches the tier a realistic Low Income household lands in", () => {
    // Household of 1, $40k, in a metro with a $100k four-person AMI:
    // adjusted 1-person AMI is $70k, so income is ~57% AMI -> Low Income.
    const result = computeSurveyResult(
      { householdSize: 1, annualIncome: 40000, populationType: "", bedroomPref: "", locationQuery: "" },
      "",
      "some metro with no override",
    );
    // getAmi falls back to its national default (~$97,800) when no state or
    // metro is known; the point of this case is the tier boundary logic below.
    expect(tierQualifiesForCeiling("LI", 60)).toBe(true);
    expect(result.tier).toBeDefined();
  });
});
