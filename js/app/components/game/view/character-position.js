/** @type {Record<DEPosture, string>} */
export const postureLabels = {
    standing: 'Standing',
    crawling: 'Crawling',
    climbing: 'Climbing',
    sitting: 'Sitting',
    lying_down: 'Lying down',
    'lying_down+belly_up': 'Lying on their back',
    'lying_down+belly_down': 'Lying on their stomach',
    on_all_fours: 'On all fours',
    crouching: 'Crouching',
    kneeling: 'Kneeling',
    hanging: 'Hanging',
    floating: 'Floating',
    flying: 'Flying',
    swimming: 'Swimming',
};

/** @param {DEPosture | null | undefined} posture @param {string | null} [relativePosition] */
export function formatCharacterPosition(posture, relativePosition) {
    return [posture ? postureLabels[posture] : '', relativePosition?.trim()].filter(Boolean).join(' - ');
}
