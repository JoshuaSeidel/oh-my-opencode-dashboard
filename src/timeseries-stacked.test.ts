import { describe, it, expect } from "vitest";
import { computeStackedSegments, AgentCounts, StackedSegment } from "./timeseries-stacked";

describe("computeStackedSegments", () => {
  describe("Edge cases", () => {
    it("should return empty array when chartHeight <= 0", () => {
      const counts: AgentCounts = { sisyphus: 10, prometheus: 5, atlas: 3 };
      
      expect(computeStackedSegments(counts, 20, 0)).toEqual([]);
      expect(computeStackedSegments(counts, 20, -5)).toEqual([]);
    });

    it("should return empty array when scaleMax <= 0", () => {
      const counts: AgentCounts = { sisyphus: 10, prometheus: 5, atlas: 3 };
      
      expect(computeStackedSegments(counts, 0, 100)).toEqual([]);
      expect(computeStackedSegments(counts, -10, 100)).toEqual([]);
    });

    it("should return empty array when all counts are zero", () => {
      const counts: AgentCounts = { sisyphus: 0, prometheus: 0, atlas: 0 };
      
      const result = computeStackedSegments(counts, 20, 100);
      expect(result).toEqual([]);
    });

    it("should handle invalid/missing counts gracefully", () => {
      const invalidCounts = {
        sisyphus: NaN,
        prometheus: Infinity,
        atlas: -5,
      } as unknown as AgentCounts;
      
      const result = computeStackedSegments(invalidCounts, 20, 100);
      expect(result).toEqual([]);
    });

    it("should handle mixed valid/invalid counts", () => {
      const mixedCounts = {
        sisyphus: 10,
        prometheus: NaN,
        atlas: -3,
      } as unknown as AgentCounts;
      
      const result = computeStackedSegments(mixedCounts, 20, 100);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        tone: "teal",
        y: 50,
        height: 50,
      });
    });
  });

  describe("Single agent scenarios", () => {
    it("should return one segment when only sisyphus is non-zero", () => {
      const counts: AgentCounts = { sisyphus: 10, prometheus: 0, atlas: 0 };
      
      const result = computeStackedSegments(counts, 20, 100);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        tone: "teal",
        y: 50,
        height: 50,
      });
    });

    it("should return one segment when only prometheus is non-zero", () => {
      const counts: AgentCounts = { sisyphus: 0, prometheus: 15, atlas: 0 };
      
      const result = computeStackedSegments(counts, 30, 120);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        tone: "red",
        y: 60,
        height: 60,
      });
    });

    it("should return one segment when only atlas is non-zero", () => {
      const counts: AgentCounts = { sisyphus: 0, prometheus: 0, atlas: 8 };
      
      const result = computeStackedSegments(counts, 16, 80);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        tone: "green",
        y: 40,
        height: 40,
      });
    });

    it("should round to at least 1px for non-zero values", () => {
      const counts: AgentCounts = { sisyphus: 1, prometheus: 0, atlas: 0 };
      
      const result = computeStackedSegments(counts, 1000, 100);
      expect(result).toHaveLength(1);
      expect(result[0].height).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Multiple agent scenarios", () => {
    it("should return multiple segments in correct order (bottom to top)", () => {
      const counts: AgentCounts = { sisyphus: 10, prometheus: 20, atlas: 15 };
      
      const result = computeStackedSegments(counts, 50, 100);
      expect(result).toHaveLength(3);
      
      // Check order: teal (sisyphus) -> red (prometheus) -> green (atlas)
      expect(result[0].tone).toBe("teal");
      expect(result[1].tone).toBe("red");
      expect(result[2].tone).toBe("green");
      
      // Check positions (y increases upward, so atlas should have smallest y)
      expect(result[0].y).toBeGreaterThan(result[1].y);
      expect(result[1].y).toBeGreaterThan(result[2].y);
    });

    it("should correctly calculate heights for all agents", () => {
      const counts: AgentCounts = { sisyphus: 10, prometheus: 20, atlas: 15 };
      
      const result = computeStackedSegments(counts, 50, 100);
      const totalHeight = result.reduce((sum, seg) => sum + seg.height, 0);
      
      expect(totalHeight).toBeLessThanOrEqual(100);
      
      // Expected heights: 20, 40, 30
      expect(result[0].height).toBe(20); // sisyphus
      expect(result[1].height).toBe(40); // prometheus  
      expect(result[2].height).toBe(30); // atlas
    });

    it("should handle zero values mixed with non-zero values", () => {
      const counts: AgentCounts = { sisyphus: 10, prometheus: 0, atlas: 15 };
      
      const result = computeStackedSegments(counts, 30, 90);
      expect(result).toHaveLength(2);
      
      // Should only have teal (sisyphus) and green (atlas)
      expect(result[0].tone).toBe("teal");
      expect(result[1].tone).toBe("green");
      
      // Check positioning
      expect(result[0].y).toBeGreaterThan(result[1].y);
    });
  });

  describe("Clamping and overflow behavior", () => {
    it("should ensure sum of heights never exceeds chartHeight", () => {
      const counts: AgentCounts = { sisyphus: 100, prometheus: 100, atlas: 100 };
      
      const result = computeStackedSegments(counts, 100, 50); // Should overflow
      const totalHeight = result.reduce((sum, seg) => sum + seg.height, 0);
      
      expect(totalHeight).toBeLessThanOrEqual(50);
    });

    it("should preserve at least 1px for non-zero agents when possible", () => {
      const counts: AgentCounts = { sisyphus: 1, prometheus: 1, atlas: 1 };
      
      const result = computeStackedSegments(counts, 100, 10);
      
      // All agents should be visible with at least 1px each
      expect(result).toHaveLength(3);
      expect(result.every(seg => seg.height >= 1)).toBe(true);
    });

    it("should distribute overflow reduction fairly", () => {
      const counts: AgentCounts = { sisyphus: 40, prometheus: 35, atlas: 25 };
      
      const result = computeStackedSegments(counts, 100, 80);
      const totalHeight = result.reduce((sum, seg) => sum + seg.height, 0);
      
      expect(totalHeight).toBeLessThanOrEqual(80);
      
      // Larger segments should be reduced more
      const heights = result.map(seg => seg.height);
      expect(Math.max(...heights)).toBeLessThanOrEqual(40); // Original largest was 40
    });

    it("should handle extreme overflow gracefully", () => {
      const counts: AgentCounts = { sisyphus: 1000, prometheus: 1000, atlas: 1000 };
      
      const result = computeStackedSegments(counts, 100, 5);
      const totalHeight = result.reduce((sum, seg) => sum + seg.height, 0);
      
      expect(totalHeight).toBeLessThanOrEqual(5);
      // Should still try to show all agents
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Deterministic behavior", () => {
    it("should produce identical results for identical inputs", () => {
      const counts: AgentCounts = { sisyphus: 15, prometheus: 25, atlas: 10 };
      
      const result1 = computeStackedSegments(counts, 60, 100);
      const result2 = computeStackedSegments(counts, 60, 100);
      
      expect(result1).toEqual(result2);
    });

    it("should maintain consistent segment order regardless of input magnitudes", () => {
      const testCases = [
        { sisyphus: 100, prometheus: 1, atlas: 1 },
        { sisyphus: 1, prometheus: 100, atlas: 1 },
        { sisyphus: 1, prometheus: 1, atlas: 100 },
        { sisyphus: 50, prometheus: 25, atlas: 75 },
      ] as AgentCounts[];
      
      testCases.forEach(counts => {
        const result = computeStackedSegments(counts, 100, 100);
        const tones = result.map(seg => seg.tone);
        
        if (result.length === 3) {
          expect(tones).toEqual(["teal", "red", "green"]);
        } else if (result.length === 2) {
          // Should still be in correct order, just missing zero-valued agents
          expect(tones).toEqual(expect.arrayContaining([
            expect.stringMatching(/teal|red|green/)
          ]));
          // Check that order is preserved for present agents
          const toneIndex = (t: string) => ["teal", "red", "green"].indexOf(t);
          for (let i = 1; i < tones.length; i++) {
            expect(toneIndex(tones[i])).toBeGreaterThan(toneIndex(tones[i-1]));
          }
        }
      });
    });
  });

  describe("Boundary conditions", () => {
    it("should handle very small chartHeight", () => {
      const counts: AgentCounts = { sisyphus: 10, prometheus: 5, atlas: 3 };
      
      const result = computeStackedSegments(counts, 20, 1);
      const totalHeight = result.reduce((sum, seg) => sum + seg.height, 0);
      
      expect(totalHeight).toBeLessThanOrEqual(1);
    });

    it("should handle very large scaleMax", () => {
      const counts: AgentCounts = { sisyphus: 10, prometheus: 5, atlas: 3 };
      
      const result = computeStackedSegments(counts, 1000000, 100);
      
      // Should produce very small but non-zero heights
      expect(result.length).toBeGreaterThan(0);
      expect(result.every(seg => seg.height >= 1)).toBe(true);
    });

    it("should handle fractional results correctly", () => {
      const counts: AgentCounts = { sisyphus: 1, prometheus: 1, atlas: 1 };
      
      const result = computeStackedSegments(counts, 3, 10);
      
      // All heights should be integers
      expect(result.every(seg => Number.isInteger(seg.height))).toBe(true);
      expect(result.every(seg => Number.isInteger(seg.y))).toBe(true);
    });
  });
});