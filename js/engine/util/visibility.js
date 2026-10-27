import { generateIntSeedFromString } from '../../util/random.js';

/** @typedef {'invisible'|'perceived'|'visible'} Visibility */
/** @typedef {Pick<DECompleteCharacterReference, 'blindness'|'perception'|'weightKg'>} Observer */

/**
 * Size-based sensory resolution, independent of distance and occlusion.
 * Body weight in kg is body volume in litres at the assumed water density.
 * Thresholds are volume ratios, not linear dimensions. Perception reduces the
 * detection and recognition thresholds by up to a factor of five.
 * @param {number} targetVolumeLiters
 * @param {Observer|null} observer Null means an unrestricted narrator.
 * @returns {Visibility}
 */
export function getSizeVisibility(targetVolumeLiters, observer) {
    if (!observer || observer.blindness === 'no' || !observer.blindness) return 'visible';
    const perception = Number.isFinite(observer.perception) ? Math.max(0, Math.min(1, observer.perception)) : 0;
    const volume = Number.isFinite(targetVolumeLiters) ? Math.max(0, targetVolumeLiters) : 0;
    // Avoid division by zero without treating invalid body sizes as super senses.
    const bodyVolume = Number.isFinite(observer.weightKg) && observer.weightKg > 0 ? observer.weightKg : 70;
    const ratio = volume / bodyVolume;
    const sensitivity = 1 + perception * 4;
    const good = observer.blindness === 'partial-good';
    const detectionThreshold = (good ? 1e-6 : 1e-4) / sensitivity;
    if (ratio < detectionThreshold) return 'invisible';
    if (observer.blindness === 'full') return perception >= .5 ? 'perceived' : 'invisible';
    const recognitionThreshold = (good ? 1e-4 : 1e-2) / sensitivity;
    return ratio >= recognitionThreshold ? 'visible' : 'perceived';
}

/**
 * Describe only broad size and structural properties, never the true name,
 * ownership, uniqueness, contents or narrative description of a sensed item.
 * Word variation depends only on item ID, so repeated calls are stable.
 * @param {DEItem} item
 * @param {Observer} observer
 * @returns {string}
 */
export function getPerceivedItemLabel(item, observer) {
    const ratio = Math.max(0, item.volumeLiters) / (observer.weightKg > 0 ? observer.weightKg : 70);
    const size = ratio < .0001 ? 'tiny' : ratio < .01 ? 'small' : ratio < .5 ? '' : ratio < 2 ? 'large' : 'huge';
    let nouns = ['object', 'shape', 'form'];
    // Even without vision these coarse categories can describe sensed structure.
    if (item.wearableProperties) nouns = ['wearable object', 'garment-like object'];
    else if (item.containerProperties) nouns = ['hollow object', 'container-like object'];
    else if (item.communicator) nouns = ['device-like object', 'object with controls'];
    const noun = nouns[generateIntSeedFromString(nouns.length, item.id)];
    return [size, noun].filter(Boolean).join(' ');
}
