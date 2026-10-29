/**
 * Render narration as text and native buttons without interpreting it as HTML.
 * @param {DEConversationMessageNarrationFragment[]} fragments
 * @param {(identifier: string, foundAs: DEConversationMessageFragmentIdentifier['foundAs']) => void} onIdentifier
 * @returns {Node[]}
 */
export function createNarrationNodes(fragments, onIdentifier) {
    return fragments.map(fragment => {
        if (typeof fragment === 'string') return document.createTextNode(fragment);
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'identifier';
        link.textContent = fragment.text;
        link.setAttribute('aria-haspopup', 'dialog');
        link.addEventListener('click', event => {
            event.stopPropagation();
            onIdentifier(fragment.identifier, fragment.foundAs);
        });
        return link;
    });
}
