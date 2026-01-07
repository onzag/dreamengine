/**
 * Selects a random item from an array based on weighted probabilities.
 * Each item should have a numeric property that represents its relative likelihood.
 * 
 * @template T
 * @param {T[]} items - Array of items to choose from
 * @param {(item: T) => number} getWeight - Function that returns the weight/likelihood for each item
 * @returns {T | null} The selected item, or null if array is empty
 * 
 * @example
 * const weather = [
 *   { type: 'sunny', likelyhood: 60 },
 *   { type: 'cloudy', likelyhood: 30 },
 *   { type: 'rainy', likelyhood: 10 }
 * ];
 * const selected = weightedRandom(weather, w => w.likelyhood);
 */
export function weightedRandom(items, getWeight) {
    if (items.length === 0) return null;

    const totalWeight = items.reduce((sum, item) => sum + getWeight(item), 0);
    
    if (totalWeight <= 0) return items[0]; // Fallback to first item if all weights are 0
    
    const rand = Math.random() * totalWeight;
    
    let cumulative = 0;
    for (const item of items) {
        cumulative += getWeight(item);
        if (rand < cumulative) {
            return item;
        }
    }
    
    // Fallback (should rarely happen due to floating point precision)
    return items[items.length - 1];
}

/**
 * Simplified version when items have a 'weight' or 'likelyhood' property
 * 
 * @template T
 * @param {Array<T & {likelyhood: number}>} items
 * @returns {T | null}
 */
export function weightedRandomByLikelyhood(items) {
    return weightedRandom(items, item => item.likelyhood);
}
