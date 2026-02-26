import { describe, expect, it } from "vitest";

describe("prompts module", () => {
  describe("buildBacklogRefillPrompt", () => {
    it("returns non-empty string", async () => {
      const { buildBacklogRefillPrompt } = await import("./prompts.js");
      const prompt = buildBacklogRefillPrompt();

      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("contains key phrases", async () => {
      const { buildBacklogRefillPrompt } = await import("./prompts.js");
      const prompt = buildBacklogRefillPrompt();

      expect(prompt).toContain("backlog");
      expect(prompt).toContain("improvement");
      expect(prompt).toContain("Quality grade improvements");
      expect(prompt).toContain("Harness/tooling improvements");
    });

    it("includes the output format section", async () => {
      const { buildBacklogRefillPrompt } = await import("./prompts.js");
      const prompt = buildBacklogRefillPrompt();

      expect(prompt).toContain("BACKLOG:");
    });
  });

  describe("buildTaskPlanPrompt", () => {
    it("includes the task text in the prompt", async () => {
      const { buildTaskPlanPrompt } = await import("./prompts.js");
      const taskText = "Fix the authentication flow";
      const prompt = buildTaskPlanPrompt(taskText);

      expect(prompt).toContain(taskText);
    });

    it("returns non-empty string", async () => {
      const { buildTaskPlanPrompt } = await import("./prompts.js");
      const prompt = buildTaskPlanPrompt("Some task");

      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("contains planning context", async () => {
      const { buildTaskPlanPrompt } = await import("./prompts.js");
      const prompt = buildTaskPlanPrompt("Test task");

      expect(prompt).toContain("planning");
      expect(prompt).toContain("plan");
      expect(prompt).toContain("ralph-improvement.md");
    });

    it("contains PLAN: output marker", async () => {
      const { buildTaskPlanPrompt } = await import("./prompts.js");
      const prompt = buildTaskPlanPrompt("Test task");

      expect(prompt).toContain("PLAN:");
    });
  });

  describe("buildPlanPrompt", () => {
    it("includes improvement number and target", async () => {
      const { buildPlanPrompt } = await import("./prompts.js");
      const prompt = buildPlanPrompt(5, 10);

      expect(prompt).toContain("#5");
      expect(prompt).toContain("10");
    });

    it("returns non-empty string", async () => {
      const { buildPlanPrompt } = await import("./prompts.js");
      const prompt = buildPlanPrompt(1, 5);

      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("contains harness improvement context", async () => {
      const { buildPlanPrompt } = await import("./prompts.js");
      const prompt = buildPlanPrompt(3, 10);

      expect(prompt).toContain("harness");
      expect(prompt).toContain("plan");
    });

    it("correctly formats different n and target values", async () => {
      const { buildPlanPrompt } = await import("./prompts.js");
      const prompt1 = buildPlanPrompt(1, 1);
      const prompt2 = buildPlanPrompt(50, 100);

      expect(prompt1).toContain("#1");
      expect(prompt2).toContain("#50");
      expect(prompt2).toContain("100");
    });
  });

  describe("buildImplPrompt", () => {
    it("returns non-empty string", async () => {
      const { buildImplPrompt } = await import("./prompts.js");
      const prompt = buildImplPrompt();

      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("contains implementation context", async () => {
      const { buildImplPrompt } = await import("./prompts.js");
      const prompt = buildImplPrompt();

      expect(prompt).toContain("implementing");
      expect(prompt).toContain("ralph-improvement.md");
      expect(prompt).toContain("test");
    });

    it("contains QA section", async () => {
      const { buildImplPrompt } = await import("./prompts.js");
      const prompt = buildImplPrompt();

      expect(prompt).toContain("QA");
      expect(prompt).toContain("MANDATORY");
    });
  });

  describe("buildMergeConflictResolvePrompt", () => {
    it("includes the task text", async () => {
      const { buildMergeConflictResolvePrompt } = await import(
        "./prompts.js"
      );
      const taskText = "Resolve conflict in src/index.ts";
      const prompt = buildMergeConflictResolvePrompt(taskText);

      expect(prompt).toContain(taskText);
    });

    it("returns non-empty string", async () => {
      const { buildMergeConflictResolvePrompt } = await import(
        "./prompts.js"
      );
      const prompt = buildMergeConflictResolvePrompt("Test task");

      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("contains merge conflict resolution context", async () => {
      const { buildMergeConflictResolvePrompt } = await import(
        "./prompts.js"
      );
      const prompt = buildMergeConflictResolvePrompt("Test");

      expect(prompt).toContain("merge");
      expect(prompt).toContain("conflict");
    });

    it("contains DONE: output marker", async () => {
      const { buildMergeConflictResolvePrompt } = await import(
        "./prompts.js"
      );
      const prompt = buildMergeConflictResolvePrompt("Test");

      expect(prompt).toContain("DONE:");
    });
  });

  describe("buildFixPrompt", () => {
    it("returns prompt with review output", async () => {
      const { buildFixPrompt } = await import("./prompts.js");
      const reviewOutput = "Issue 1: Missing test\nIssue 2: Type error";
      const prompt = buildFixPrompt(reviewOutput);

      expect(prompt).toContain(reviewOutput);
    });

    it("returns non-empty string", async () => {
      const { buildFixPrompt } = await import("./prompts.js");
      const prompt = buildFixPrompt("Some review output");

      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("truncates review output longer than 4000 characters", async () => {
      const { buildFixPrompt } = await import("./prompts.js");
      const longOutput = "x".repeat(5000);
      const prompt = buildFixPrompt(longOutput);

      expect(prompt).toContain("... (truncated)");
      expect(prompt.length).toBeLessThan(longOutput.length + 1000);
    });

    it("includes truncation marker with correct message", async () => {
      const { buildFixPrompt } = await import("./prompts.js");
      const longOutput = "x".repeat(5000);
      const prompt = buildFixPrompt(longOutput);

      expect(prompt).toMatch(/\.\.\.\s*\(truncated\)/);
    });

    it("does NOT truncate review output <= 4000 characters", async () => {
      const { buildFixPrompt } = await import("./prompts.js");
      const shortOutput = "This is a short review output";
      const prompt = buildFixPrompt(shortOutput);

      expect(prompt).toContain(shortOutput);
      expect(prompt).not.toContain("(truncated)");
    });

    it("exactly at 4000 characters does NOT truncate", async () => {
      const { buildFixPrompt } = await import("./prompts.js");
      const exactOutput = "x".repeat(4000);
      const prompt = buildFixPrompt(exactOutput);

      expect(prompt).toContain(exactOutput);
      expect(prompt).not.toContain("(truncated)");
    });

    it("4001 characters DOES truncate", async () => {
      const { buildFixPrompt } = await import("./prompts.js");
      // Create a unique pattern that will be truncated
      const reviewBefore4000 = "Important review: ";
      const padding = "x".repeat(4000 - reviewBefore4000.length);
      const reviewAfter4000 = " SHOULD_NOT_APPEAR";
      const longOutput = reviewBefore4000 + padding + reviewAfter4000;

      const prompt = buildFixPrompt(longOutput);

      expect(prompt).toContain("... (truncated)");
      expect(prompt).toContain("Important review:");
      expect(prompt).not.toContain("SHOULD_NOT_APPEAR");
    });

    it("contains fixing context", async () => {
      const { buildFixPrompt } = await import("./prompts.js");
      const prompt = buildFixPrompt("Some issues");

      expect(prompt).toContain("fixing");
      expect(prompt).toContain("reviewer");
    });

    it("contains FIXED: output marker", async () => {
      const { buildFixPrompt } = await import("./prompts.js");
      const prompt = buildFixPrompt("Some issues");

      expect(prompt).toContain("FIXED:");
    });
  });

  describe("buildReviewPrompt", () => {
    it("returns non-empty string", async () => {
      const { buildReviewPrompt } = await import("./prompts.js");
      const prompt = buildReviewPrompt();

      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("contains review context", async () => {
      const { buildReviewPrompt } = await import("./prompts.js");
      const prompt = buildReviewPrompt();

      expect(prompt).toContain("reviewer");
      expect(prompt).toContain("review");
    });

    it("contains evaluation criteria", async () => {
      const { buildReviewPrompt } = await import("./prompts.js");
      const prompt = buildReviewPrompt();

      expect(prompt).toContain("Correctness");
      expect(prompt).toContain("Tests");
      expect(prompt).toContain("Conventions");
      expect(prompt).toContain("Architecture");
      expect(prompt).toContain("Leverage");
    });

    it("contains REVIEW_PASSED output marker", async () => {
      const { buildReviewPrompt } = await import("./prompts.js");
      const prompt = buildReviewPrompt();

      expect(prompt).toContain("REVIEW_PASSED");
    });

    it("contains REVIEW_FAILED output marker", async () => {
      const { buildReviewPrompt } = await import("./prompts.js");
      const prompt = buildReviewPrompt();

      expect(prompt).toContain("REVIEW_FAILED");
    });
  });
});
