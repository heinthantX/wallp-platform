import { describe, it, expect } from "vitest";
import {
  recipeSchema,
  hueTupleSchema,
  chromaSchema,
  defaultRecipeFormData,
} from "./recipeSchema";

describe("Recipe Editor Zod Validation", () => {
  describe("hue range bounds", () => {
    it("accepts valid hue ranges within [0, 360]", () => {
      expect(hueTupleSchema.safeParse([0, 360]).success).toBe(true);
      expect(hueTupleSchema.safeParse([20, 50]).success).toBe(true);
      expect(hueTupleSchema.safeParse([350, 20]).success).toBe(true);
    });

    it("rejects hue values less than 0", () => {
      const result = hueTupleSchema.safeParse([-1, 100]);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("between 0 and 360");
      }
    });

    it("rejects hue values greater than 360", () => {
      const result = hueTupleSchema.safeParse([0, 361]);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("between 0 and 360");
      }
    });

    it("rejects recipe with out-of-bounds hueRanges", () => {
      const invalidRecipe = {
        ...defaultRecipeFormData,
        id: "test-recipe",
        name: "Test Recipe",
        hueRanges: [[-10, 400]],
      };
      const result = recipeSchema.safeParse(invalidRecipe);
      expect(result.success).toBe(false);
    });
  });

  describe("costBudget validation", () => {
    it("accepts positive costBudget > 0", () => {
      const validRecipe = {
        ...defaultRecipeFormData,
        id: "test-recipe",
        name: "Test Recipe",
        costBudget: 200,
      };
      const result = recipeSchema.safeParse(validRecipe);
      expect(result.success).toBe(true);
    });

    it("rejects costBudget of 0", () => {
      const invalidRecipe = {
        ...defaultRecipeFormData,
        id: "test-recipe",
        name: "Test Recipe",
        costBudget: 0,
      };
      const result = recipeSchema.safeParse(invalidRecipe);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("costBudget must be > 0");
      }
    });

    it("rejects negative costBudget", () => {
      const invalidRecipe = {
        ...defaultRecipeFormData,
        id: "test-recipe",
        name: "Test Recipe",
        costBudget: -50,
      };
      const result = recipeSchema.safeParse(invalidRecipe);
      expect(result.success).toBe(false);
    });
  });

  describe("id and name validation", () => {
    it("rejects invalid kebab-case id", () => {
      const invalid = {
        ...defaultRecipeFormData,
        id: "Invalid_Recipe_Name",
        name: "Valid Name",
      };
      const result = recipeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("accepts valid kebab-case id", () => {
      const valid = {
        ...defaultRecipeFormData,
        id: "valid-kebab-123",
        name: "Valid Name",
      };
      const result = recipeSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects empty recipe name", () => {
      const invalid = {
        ...defaultRecipeFormData,
        id: "valid-id",
        name: "",
      };
      const result = recipeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("chroma validation", () => {
    it("accepts valid chroma range where max >= min", () => {
      expect(chromaSchema.safeParse({ min: 0.05, max: 0.2 }).success).toBe(true);
      expect(chromaSchema.safeParse({ min: 0.1, max: 0.1 }).success).toBe(true);
    });

    it("rejects chroma where max < min", () => {
      const result = chromaSchema.safeParse({ min: 0.2, max: 0.05 });
      expect(result.success).toBe(false);
    });
  });
});
