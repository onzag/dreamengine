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