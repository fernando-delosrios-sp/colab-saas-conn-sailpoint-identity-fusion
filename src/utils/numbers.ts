/**
 * Round numeric match metrics (e.g. 0–100 similarity) to 2 decimal places for stable reports and JSON.
 */
export function roundMetric2(value: number): number {
    return parseFloat(Number(value).toFixed(2))
}
