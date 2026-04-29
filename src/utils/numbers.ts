/**
 * Round numeric match metrics (e.g. 0–100 similarity) to 2 decimal places for stable reports and JSON.
 * Uses arithmetic rounding to avoid the string allocation of toFixed + parseFloat.
 */
export function roundMetric2(value: number): number {
    return Math.round(value * 100) / 100
}
