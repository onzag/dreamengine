import './tooltip.js';

/** Render the traits and states already selected and named by the perspective.
 * @param {DECharacterStateInPerspective[]} states
 * @returns {HTMLElement[]}
 */
export function createCharacterTags(states) {
    const ordered = [...states].sort((a, b) =>
        Number(b.type === 'INTERNAL') - Number(a.type === 'INTERNAL') || Number(b.dominant) - Number(a.dominant));
    return ordered.map(state => {
        const tooltip = document.createElement('app-game-tooltip');
        tooltip.setAttribute('align-with', 'bottom');
        tooltip.setAttribute('text', (state.causes || []).join('\n'));
        const chip = document.createElement('span');
        chip.tabIndex = 0;
        if (state.type === 'INTERNAL') {
            chip.className = 'information-chip';
            chip.dataset.traitId = state.stateName;
        } else {
            chip.className = `state-chip${state.relieving ? ' relieving' : ''}`;
            chip.dataset.stateId = state.stateName;
            chip.dataset.colorScheme = state.type !== 'INTENSITY_EXPRESSIVE' ? 'standard'
                : (state.level || 0) < 1 ? 'somewhat' : state.level === 1 ? 'standard'
                    : state.level === 2 ? 'very' : 'overwhelming';
        }
        const label = document.createElement('span');
        label.textContent = state.stateName;
        chip.append(label);
        tooltip.append(chip);
        return tooltip;
    });
}
