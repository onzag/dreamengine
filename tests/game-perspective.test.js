import test from 'node:test';
import assert from 'node:assert/strict';
import { makePerspective } from './fixtures/perspective.js';
import { getPerspectiveIndex, parsePerspectiveNarration } from '../js/app/components/game/view/perspective-data.js';
import { getItemTreeContext, loadItemNode, loadItemGroups, loadCharacterItemGroups, loadLocationSlotItemGroups } from '../js/app/components/game/view/item-tree-data.js';
import { buildSurroundingGroups } from '../js/app/components/game/view/surrounding-groups.js';

test('indexes all merged IDs and nested items without consulting an engine', () => {
    const snapshot = makePerspective();
    const index = getPerspectiveIndex(snapshot);
    assert.equal(index.items.get('coin-a'), index.items.get('coin-b'));
    assert.equal(index.items.get('cup').name, 'cup');
    const node = loadItemNode('coin-b', getItemTreeContext(snapshot));
    assert.equal(node.id, 'coin-b');
    assert.equal(node.label, 'Two coins');
    assert.equal(node.amount, 2);
    assert.equal(node.asset, 'items/coin-a');
    assert.throws(() => loadItemNode('not-in-snapshot', getItemTreeContext(snapshot)), /perspective/);
});

test('container visibility and supplied uncertainty control branches', () => {
    const snapshot = makePerspective();
    const context = getItemTreeContext(snapshot);
    const bag = loadItemNode('bag', context);
    assert.equal(loadItemGroups(bag, context)[0].message, 'Some contents may be missing.');
    const hidden = makePerspective();
    hidden.self.characterCarryingItems[0].canSeeContents = false;
    hidden.self.characterCarryingItems[0].contentsIsUnclear = 'It is closed.';
    const hiddenContext = getItemTreeContext(hidden);
    const groups = loadItemGroups(loadItemNode('bag', hiddenContext), hiddenContext);
    assert.equal(groups[0].message, 'It is closed.');
    assert.deepEqual(groups[0].items, []);
    assert.equal(getPerspectiveIndex(hidden).items.has('coin-b'), false);
});

test('slot and clothing lists respect visibility while preserving self', () => {
    const snapshot = makePerspective();
    snapshot.ownLocation.slots[0].canSeeItems = false;
    snapshot.ownLocation.slots[0].itemListsAreUnclear = 'Items are unclear.';
    snapshot.ownLocation.slots[0].canSeeCharacters = false;
    snapshot.self.canTellDetailsOfClothingOrCarriedItems = false;
    const context = getItemTreeContext(snapshot);
    const [characters, items] = loadLocationSlotItemGroups('room', context);
    assert.deepEqual(characters.items.map(node => node.id), ['self']);
    assert.deepEqual(items.items, []);
    assert.equal(items.message, 'Items are unclear.');
    assert.equal(getPerspectiveIndex(snapshot).items.size, 0);
    assert.deepEqual(loadCharacterItemGroups('self', context)[0].items, []);
});

test('snapshot groups include perceived characters and exclude the observer', () => {
    const snapshot = makePerspective();
    const groups = buildSurroundingGroups(snapshot);
    assert.equal(groups[0].primary, true);
    assert.equal(groups[0].characters[0].name, 'Snapshot Friend');
    assert.equal(groups[1].characters[0].id, 'stranger');
    assert.equal(groups.flatMap(group => group.characters).some(character => character.id === 'self'), false);
    assert.equal(groups[0].characters[0].locationSlot, 'room');
    assert.equal(groups[0].characters[0].states, snapshot.socialGroups.ownGroup[0].states);
    assert.equal(groups[0].characters[0].positionDescription, snapshot.socialGroups.ownGroup[0].characterPlaceAndPostureDescription);
});

test('narration uses the worker parser and preserves its resolved identifiers', async t => {
    const rawText = '*<someone:character-offscreen>*';
    const fragments = [{ type: 'identifier', identifier: 'character-offscreen', foundAs: 'character', text: 'someone' }];
    const queries = [];
    const previous = globalThis.window;
    globalThis.window = { ENGINE_WORKER_CLIENT: {
        async queryDEObject(query) { queries.push(query); return fragments; },
    } };
    t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
    assert.equal(await parsePerspectiveNarration(rawText), fragments);
    assert.deepEqual(queries, [{ path: ['utils', 'narrationAndDialogue', 'parseNarration'], call: [rawText] }]);
    assert.deepEqual(await parsePerspectiveNarration('  '), []);
    assert.equal(queries.length, 1);
});

test('different snapshots keep their own labels, assets and blindness', () => {
    const old = makePerspective();
    const next = makePerspective();
    next.self.characterCarryingItems[0].nameInAmount = 'New bag';
    next.ownCharacterBlindness = 'full';
    const oldContext = getItemTreeContext(old);
    const nextContext = getItemTreeContext(next);
    assert.equal(loadItemNode('bag', oldContext).label, 'bag');
    assert.equal(loadItemNode('bag', nextContext).label, 'New bag');
    assert.equal(oldContext.blindness, 'partial-bad');
    assert.equal(nextContext.blindness, 'full');
});
