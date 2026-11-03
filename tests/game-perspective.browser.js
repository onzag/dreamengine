import { parseNarration } from '../js/engine/util/narration-and-dialogue.js';
import { makePerspective } from './fixtures/perspective.js';
import '../js/app/components/game/view.js';
import { openIdentifierDialog } from '../js/app/components/game/view/identifier-dialog.js';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const waitFor = async predicate => {
    const start = performance.now();
    const timeout = new Error('Timed out waiting for render');
    while (!predicate()) {
        if (performance.now() - start > 3000) throw timeout;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
};

export async function run() {
    const failures = [];
    window.addEventListener('error', event => failures.push(event.message));
    window.addEventListener('unhandledrejection', event => failures.push(String(event.reason)));
    window.DREAMENGINE_HOME = new URL('../js/', import.meta.url).href.replace(/\/$/, '');
    window.DREAMENGINE_DEFAULT_SCRIPTS_HOME = window.DREAMENGINE_HOME;
    const queries = [];
    const parseQuery = async query => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return parseNarration({ characters: { 'character-friend': { name: 'Friend' } }, world: { locations: {} } },
            query.call[0], null);
    };
    const stored = new Map([['initial', null]]);
    let listeners = 0;
    let notify;
    window.ENGINE_WORKER_CLIENT = {
        addDEObjectUpdatedListener(callback) { listeners++; notify = callback; return () => { listeners--; }; },
        async queryDEObject(query) {
            queries.push(query);
            if (query.path.join('.') === 'utils.narrationAndDialogue.parseNarration') return parseQuery(query);
            assert(query.path.join('.') === 'utils.characterInfo.getStoredPerspective',
                'Unexpected live engine query: ' + query.path.join('.'));
            return stored.get(query.call[0]) || null;
        },
    };
    const view = document.createElement('app-game-view');
    view.setAttribute('initial-perspective-id', 'initial');
    document.body.append(view);
    await view.pendingPerspectiveUpdate;
    const root = view.shadowRoot;
    assert(listeners === 1, 'Only the parent should subscribe to engine updates');
    assert(root.querySelector('.black-overlay'), 'No snapshot must render black');
    assert(!view.blackOverlayAnimation, 'Null snapshot must not start the fade');
    assert(root.querySelector('.container').inert, 'No snapshot must disable underlying controls');
    const items = root.querySelector('app-game-items-overlay');
    items.show();
    assert(!items.open, 'No snapshot must not open surroundings');
    const snapshot = makePerspective();
    snapshot.self.characterExternalDescription = 'Near <absent:someone>.';
    stored.set('initial', snapshot);
    await view.updatePerspective();
    assert(queries.filter(query => query.path[2] === 'getStoredPerspective').length === 2, 'An unchanged initial ID must retry a missing snapshot');
    assert(view.currentPerspective === snapshot, 'Snapshot should reach the parent');
    assert(view.blackOverlayAnimation.effect.getTiming().duration === 500, 'Fade must take 500 ms');
    const background = root.querySelector('app-game-background');
    const stats = root.querySelector('app-game-stats');
    const surrounding = root.querySelector('app-game-character-surrounding-view');
    for (const child of [background, stats, surrounding, items]) {
        assert(child.currentPerspective === snapshot, 'Snapshot must reach every child');
    }
    assert(background.shadowRoot.querySelector('img').src.endsWith('/places/room'), 'Slot asset should win over location asset');
    assert(stats.shadowRoot.querySelector('.user-name').textContent === snapshot.ownName, 'Stats must use snapshot labels');
    assert(stats.shadowRoot.querySelector('.weather').textContent === 'Snapshot Rain', 'Weather must use snapshot');
    assert(stats.shadowRoot.querySelector('.state-chip').textContent === 'Very Tired', 'State labels must not be rebuilt');
    view.blackOverlayAnimation.finish();
    await waitFor(() => !root.querySelector('.black-overlay'));
    await waitFor(() => {
        // Hidden Electron windows do not consistently advance animation timelines.
        for (const animation of surrounding.animations) animation.finish();
        return !surrounding.rendering;
    });
    assert(surrounding.shadowRoot.querySelectorAll('.character').length === 2, 'Social groups should render snapshot members');
    const friendCard = surrounding.shadowRoot.querySelector('[data-character-id="character-friend"]');
    assert(friendCard.querySelector('.information-chip').textContent === 'Blind', 'Nearby INTERNAL traits must render verbatim');
    assert(friendCard.querySelector('.state-chip').textContent === 'Very Tired', 'Nearby states must render verbatim');
    assert(friendCard.querySelector('.state-chip').classList.contains('relieving'), 'Nearby states must retain relieving styling');
    await waitFor(() => friendCard.querySelector('.position .identifier'));
    assert(friendCard.querySelector('.position .identifier').textContent === 'the table', 'Positions must use worker parsing');
    const causeTooltip = friendCard.querySelector('.state-chip').parentElement;
    await waitFor(() => causeTooltip.shadowRoot.querySelector('.identifier'));
    assert(causeTooltip.shadowRoot.querySelector('.tip').textContent === 'Friend stayed awake.', 'State causes use supplied narration');

    assert(surrounding.shadowRoot.querySelector('.blindness-notice').textContent === snapshot.socialGroups.characterListsAreUnclear,
        'Use the supplied uncertainty label');

    items.show();
    const inventory = items.shadowRoot.querySelector('app-character-items-view');
    const bag = inventory.shadowRoot.querySelector('app-item-node');
    const coins = bag.shadowRoot.querySelector('app-item-node');
    assert(coins.shadowRoot.querySelector('.item-node-label').textContent === 'Two coins', 'Nested stack must use nameInAmount');
    assert(coins.shadowRoot.querySelector('.item-node-count').hidden, 'Do not repeat a count already in nameInAmount');
    coins.shadowRoot.querySelector('.item-open').click();
    let dialog = document.querySelector('app-game-identifier-dialog');
    await waitFor(() => dialog.querySelector('app-game-item-dialog').shadowRoot.querySelector('.detail').getAttribute('aria-busy') === 'false');
    assert(dialog.currentPerspective === snapshot, 'Item click must carry snapshot into the dialog outside the game shadow root');
    assert(dialog.querySelector('app-game-item-dialog').shadowRoot.querySelector('.description').textContent === 'Found near Friend.',
        'Description markers should use the engine parser');
    assert(dialog.querySelector('app-dialog').getAttribute('dialog-title') === 'Two coins', 'Stack dialog should use snapshot title');
    dialog.remove();

    dialog = openIdentifierDialog('coin-b', 'item', coins, snapshot);
    const detail = dialog.querySelector('app-game-item-dialog');
    await waitFor(() => detail.shadowRoot.querySelector('.detail').getAttribute('aria-busy') === 'false');
    assert(detail.shadowRoot.querySelector('.detail').dataset.blindness === 'partial-bad', 'Item dialog blindness must match snapshot');
    assert(detail.shadowRoot.querySelector('.identifier').textContent === 'Friend', 'Description link must use stored label');
    const next = makePerspective();
    next.ownName = 'Next Self';
    next.self.characterExternalDescription = snapshot.self.characterExternalDescription;
    next.socialGroups.ownGroup.push({ ...next.socialGroups.ownGroup[0], characterId: 'absent', characterName: 'Someone' });
    next.ownCharacterBlindness = 'full';
    next.socialGroups.soloCharacters = [];
    next.socialGroups.ownGroup[0].states = [];
    next.self.characterCarryingItems[0].containing[0].description = 'New live-looking description';
    stored.set('next', next);
    view.currentPerspectiveId = 'next';
    await view.updatePerspective();
    assert(background.shadowRoot.querySelector('img').hasAttribute('data-totally-blind'), 'Full blindness must update unchanged background asset');
    assert(stats.shadowRoot.querySelector('.user-name').textContent === 'Next Self', 'New snapshot must update stats');
    assert(stats.shadowRoot.querySelector('.portrait-tooltip').shadowRoot.querySelector('.identifier'),
        'Tooltip identifiers must come from the engine parser');
    assert(detail.shadowRoot.querySelector('.description').textContent === 'Found near Friend.', 'Open dialog must retain its original snapshot');
    detail.shadowRoot.querySelector('.identifier').click();
    const dialogs = document.querySelectorAll('app-game-identifier-dialog');
    assert(dialogs.length === 2 && dialogs[1].currentPerspective === snapshot, 'Nested dialogs must keep the originating snapshot');
    assert(dialogs[1].querySelector('app-dialog').getAttribute('dialog-title') === 'Snapshot Friend', 'Nested identifier should resolve locally');
    assert(dialogs[1].querySelector('app-game-character-dialog').shadowRoot.querySelector('.information-chip').textContent === 'Blind',
        'Character dialogs must show supplied property traits');
    dialogs[1].remove();
    dialog.remove();
    items.close();
    await waitFor(() => {
        // Hidden Electron windows do not consistently advance animation timelines.
        for (const animation of surrounding.animations) animation.finish();
        return !surrounding.rendering;
    });
    assert(!surrounding.shadowRoot.querySelector('[data-character-id="character-friend"] .information-chip'),
        'A new snapshot must remove traits that are no longer supplied');

    const selfDialog = openIdentifierDialog('self', 'character', stats, next);
    assert(selfDialog.querySelector('app-game-character-dialog').shadowRoot.querySelector('.detail').dataset.blindness === 'no',
        'Self portrait should retain the existing blindness exception');
    selfDialog.remove();
    const unknownDialog = openIdentifierDialog('unknown-item', 'item', stats, next);
    assert(unknownDialog.querySelector('app-game-item-dialog').shadowRoot.querySelector('.description').textContent.includes('not available in this perspective'),
        'Unknown entities should stay unavailable rather than fall back to DE');
    unknownDialog.remove();

    view.currentPerspectiveId = '';
    await view.updatePerspective();
    assert(root.querySelector('.black-overlay'), 'Losing the perspective should restore black');
    assert(background.shadowRoot.querySelector('img').hidden, 'Missing perspective must clear the background');
    assert(!items.open, 'Missing perspective must close surroundings');
    view.currentPerspectiveId = 'next';
    await view.updatePerspective();
    assert(view.blackOverlayAnimation.effect.getTiming().duration === 500, 'Restored perspective should fade from black');
    view.currentPerspectiveId = '';
    await view.updatePerspective();
    assert(!view.blackOverlayAnimation && root.querySelector('.black-overlay'), 'Losing perspective during the fade must cancel it');
    view.remove();
    assert(listeners === 0, 'Disconnect must unsubscribe');
    assert(failures.length === 0, failures.join('\n'));

    // Exercise message-driven selection, including a one-fragment previous message.
    const messageA = { id: 'a', content: [{ type: 'narration' }], perspectiveByCharacterId: { self: { before: 'initial', after: null } } };
    const messageB = { id: 'b', content: [{ type: 'narration' }], perspectiveByCharacterId: { self: { before: 'initial', after: 'next' } } };
    const conversation = { id: 'conversation', messages: [messageA, messageB] };
    const info = message => ({ conversation, message });
    window.ENGINE_WORKER_CLIENT.queryDEObject = async query => {
        queries.push(query);
        if (query.path.join('.') === 'utils.narrationAndDialogue.parseNarration') return parseQuery(query);
        if (query.path[1] === 'characterInfo') return stored.get(query.call[0]) || null;
        assert(query.path[1] === 'conversations', 'Unexpected live display query');
        switch (query.path[2]) {
            case 'getConversation': return conversation;
            case 'getNextConversationAndMessageForCharacter': return query.call[2] === 'a' ? info(messageB) : null;
            case 'getPreviousConversationAndMessageForCharacter': return query.call[2] === 'b' ? info(messageA) : null;
            default: throw new Error('Unexpected query ' + query.path.join('.'));
        }
    };
    const navigation = document.createElement('app-game-view');
    navigation.setAttribute('initial-user-id', 'self');
    navigation.setAttribute('initial-conversation-id', 'conversation');
    navigation.setAttribute('initial-message-id', 'b');
    navigation.setAttribute('initial-perspective-id', 'next');
    document.body.append(navigation);
    await navigation.pendingPerspectiveUpdate;
    assert(navigation.currentPerspective === next, 'An initially selected message must load its unchanged perspective ID');
    assert(navigation.prevConversationMessageContentIndex === 0, 'One-fragment previous messages must remain navigable');
    await navigation.goPrevMessage();
    assert(navigation.currentPerspective === snapshot, 'Previous message must display its before snapshot');
    assert(navigation.prevConversation === null, 'Start of history must clear the old previous pointer');
    await navigation.goNextMessage();
    assert(navigation.currentPerspective === next, 'Next message must prefer its after snapshot');
    assert(navigation.nextConversation === null, 'End of history must clear the old next pointer');

    // Late reads must never replace a newer selection or resurrect a disconnected view.
    let resolveLate;
    const delayed = new Promise(resolve => { resolveLate = resolve; });
    stored.set('delayed', delayed);
    navigation.currentPerspectiveId = 'delayed';
    const lateRead = navigation.renderCurrentPerspective();
    navigation.currentPerspectiveId = 'initial';
    await navigation.renderCurrentPerspective();
    resolveLate(next);
    await lateRead;
    assert(navigation.currentPerspective === snapshot, 'A late snapshot must not replace a newer selection');
    let resolveDetached;
    stored.set('detached', new Promise(resolve => { resolveDetached = resolve; }));
    navigation.currentPerspectiveId = 'detached';
    const detachedRead = navigation.renderCurrentPerspective();
    navigation.remove();
    resolveDetached(next);
    await detachedRead;
    assert(navigation.currentPerspective === snapshot, 'A disconnected view must ignore late reads');
    assert(listeners === 0, 'Navigation view must unsubscribe');
    assert(failures.length === 0, failures.join('\n'));
    return 'Browser checks passed: initial retry, black/fade lifecycle, snapshot propagation, nested dialogs, assets, blindness, missing IDs, navigation, stale reads, cleanup, worker parsing, visible traits; no live entity queries.';
}
