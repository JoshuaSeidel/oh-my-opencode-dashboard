/**
 * Pure helper for computing stacked bar segment dimensions.
 * Independent of React/DOM for testability.
 */

export type AgentTone = "teal" | "red" | "green";

export interface StackedSegment {
  tone: AgentTone;
  y: number;
  height: number;
}

export interface AgentCounts {
  sisyphus: number;
  prometheus: number;
  atlas: number;
}

/**
 * Compute stacked bar segments for a single bucket.
 * 
 * Segment order (bottom to top):
 * 1. Sisyphus (teal) - bottom
 * 2. Prometheus (red) - middle  
 * 3. Atlas (green) - top
 * 
 * @param counts - Agent counts for this bucket
 * @param scaleMax - Maximum value for scaling (must be > 0)
 * @param chartHeight - Available height in pixels
 * @returns Ordered segments from bottom to top
 */
export function computeStackedSegments(
  counts: AgentCounts,
  scaleMax: number,
  chartHeight: number
): StackedSegment[] {
  // Handle edge cases
  if (chartHeight <= 0 || scaleMax <= 0) {
    return [];
  }

  // Validate and sanitize counts
  const sanitized = {
    sisyphus: Math.max(0, Number.isFinite(counts.sisyphus) ? counts.sisyphus : 0),
    prometheus: Math.max(0, Number.isFinite(counts.prometheus) ? counts.prometheus : 0),
    atlas: Math.max(0, Number.isFinite(counts.atlas) ? counts.atlas : 0),
  };

  const total = sanitized.sisyphus + sanitized.prometheus + sanitized.atlas;
  if (total === 0) {
    return [];
  }

  // Compute raw heights
  const rawHeights = {
    sisyphus: (sanitized.sisyphus / scaleMax) * chartHeight,
    prometheus: (sanitized.prometheus / scaleMax) * chartHeight,
    atlas: (sanitized.atlas / scaleMax) * chartHeight,
  };

  // Round to pixels, ensuring sum never exceeds chartHeight
  const roundedHeights = {
    sisyphus: Math.max(1, Math.round(rawHeights.sisyphus)) * (sanitized.sisyphus > 0 ? 1 : 0),
    prometheus: Math.max(1, Math.round(rawHeights.prometheus)) * (sanitized.prometheus > 0 ? 1 : 0),
    atlas: Math.max(1, Math.round(rawHeights.atlas)) * (sanitized.atlas > 0 ? 1 : 0),
  };

  // Ensure non-zero agents remain visible when possible
  let totalRounded = roundedHeights.sisyphus + roundedHeights.prometheus + roundedHeights.atlas;
  
  // Distribute any overflow reduction fairly
  if (totalRounded > chartHeight) {
    const excess = totalRounded - chartHeight;
    const weights = [
      { key: 'sisyphus' as keyof typeof roundedHeights, height: roundedHeights.sisyphus },
      { key: 'prometheus' as keyof typeof roundedHeights, height: roundedHeights.prometheus },
      { key: 'atlas' as keyof typeof roundedHeights, height: roundedHeights.atlas },
    ].filter(w => w.height > 0);

    if (weights.length > 0) {
      let remainingExcess = excess;
      const totalWeight = weights.reduce((sum, w) => sum + w.height, 0);
      
      for (const weight of weights) {
        if (remainingExcess <= 0) break;
        const reduction = Math.min(
          Math.max(1, weight.height - 1), // Keep at least 1px for non-zero agents
          Math.round((weight.height / totalWeight) * excess)
        );
        roundedHeights[weight.key] -= reduction;
        remainingExcess -= reduction;
      }
      
      // If still over, trim from largest segments
      totalRounded = roundedHeights.sisyphus + roundedHeights.prometheus + roundedHeights.atlas;
      while (totalRounded > chartHeight) {
        const sortedWeights = weights
          .map(w => ({ ...w, height: roundedHeights[w.key] }))
          .filter(w => w.height > 1) // Only trim segments > 1px
          .sort((a, b) => b.height - a.height);
        
        if (sortedWeights.length === 0) break;
        roundedHeights[sortedWeights[0].key]--;
        totalRounded--;
      }
    }
  }

  // Build segments from bottom to top
  const segments: StackedSegment[] = [];
  let currentY = chartHeight; // Start from bottom

  // Sisyphus (teal) - bottom
  if (roundedHeights.sisyphus > 0) {
    currentY -= roundedHeights.sisyphus;
    segments.push({
      tone: "teal",
      y: currentY,
      height: roundedHeights.sisyphus,
    });
  }

  // Prometheus (red) - middle
  if (roundedHeights.prometheus > 0) {
    currentY -= roundedHeights.prometheus;
    segments.push({
      tone: "red",
      y: currentY,
      height: roundedHeights.prometheus,
    });
  }

  // Atlas (green) - top
  if (roundedHeights.atlas > 0) {
    currentY -= roundedHeights.atlas;
    segments.push({
      tone: "green",
      y: currentY,
      height: roundedHeights.atlas,
    });
  }

  return segments;
}