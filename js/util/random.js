/**
 * Creates a seeded random number generator function using the Mulberry32 algorithm.
 * @param {number} seed 
 * @returns 
 */
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

/**
 * Selects a random item from an array based on weighted probabilities.
 * Each item should have a numeric property that represents its relative likelihood.
 * 
 * @template T
 * @param {T[]} items - Array of items to choose from
 * @param {(item: T) => number} getWeight - Function that returns the weight/likelihood for each item
 * @param {number | null} [seed=null] - Optional seed for reproducible results
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
export function weightedRandom(items, getWeight, seed = null) {
    if (items.length === 0) return null;

    const totalWeight = items.reduce((sum, item) => sum + getWeight(item), 0);
    
    if (totalWeight <= 0) return items[0]; // Fallback to first item if all weights are 0
    
    const rand = (seed === null ? Math.random() : mulberry32(seed)()) * totalWeight;
    
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
 * Simplified version when items have a 'likelihood' property
 * 
 * @template T
 * @param {Array<T & {likelihood: number}>} items
 * @param {number | null} [seed=null]
 * @returns {T | null}
 */
export function weightedRandomByLikelihood(items, seed = null) {
    return weightedRandom(items, item => item.likelihood, seed);
}

/**
 * 
 * @param {number} maxNumber 
 * @param {string} inputString 
 * @returns {number} 
 */
export function generateIntSeedFromString(maxNumber, inputString) {
    let hash = 0;
    for (let i = 0; i < inputString.length; i++) {
        hash = inputString.charCodeAt(i) + ((hash << 5) - hash);
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash) % maxNumber;
}