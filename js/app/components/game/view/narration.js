/**
 * Render narration as text and inline controls without interpreting it as HTML.
 * @param {DEConversationMessageNarrationFragment[]} fragments
 * @param {(identifier: string, foundAs: DEConversationMessageFragmentIdentifier['foundAs']) => void} onIdentifier
 * @returns {Node[]}
 */
export function createNarrationNodes(fragments, onIdentifier) {
    return fragments.map(fragment => {
        if (typeof fragment === 'string') return document.createTextNode(fragment);
        // Native buttons are atomic boxes even with display:inline, so their
        // labels cannot flow across lines alongside the surrounding narration.
        const link = document.createElement('span');
        link.setAttribute('role', 'button');
        link.tabIndex = 0;
        link.className = 'identifier';
        link.textContent = fragment.text;
        link.setAttribute('aria-haspopup', 'dialog');
        link.addEventListener('click', event => {
            event.stopPropagation();
            onIdentifier(fragment.identifier, fragment.foundAs);
        });
        link.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            if (!event.repeat) link.click();
        });
        return link;
    });
}
