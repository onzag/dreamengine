
/**
 * @param {DEObject} DE
 * @param {Array<string>} ids
 * @param {string} name
 * @param {boolean} force
 * @returns {DEConversationMessageFragmentIdentifier|null}
 */
function findIdentifierNaive(DE, ids, name, force) {
    // try to find as character first
    if (ids.every(id => id.startsWith("character-"))) {
        const everyCharacterExists = ids.every(id => DE.characters[id]);
        if (everyCharacterExists) {
            return {
                identifiers: ids,
                text: name || DE.utils.templates.formatAnd(ids.map(id => DE.characters[id].name)),
                foundAs: ids.length === 1 ? "single-character" : "characters",
                type: "identifier",
            };
        } else if (force) {
            return {
                identifiers: ids,
                text: name || (ids.length === 1 ? "Unknown Character" : "Unknown Characters"),
                foundAs: ids.length === 1 ? "single-character" : "characters",
                type: "identifier",
            };
        } else {
            return null;
        }
    } else if (ids.every(id => id.startsWith("location-"))) {
        const everyLocationExistsAndIsLocation = ids.every(id => DE.world.locations[id]);
        if (everyLocationExistsAndIsLocation) {
            return {
                identifiers: ids,
                text: name || DE.utils.templates.formatAnd(ids.map(id => DE.world.locations[id].name)),
                foundAs: ids.length === 1 ? "single-location" : "locations",
                type: "identifier",
            };
        }

        const everyLocationExistsAndIsSlotNamesList = ids.map(id => {
            for (const locationId in DE.world.locations) {
                const location = DE.world.locations[locationId];
                if (location.slots && location.slots[id]) {
                    return location.slots[id].name;
                }
            }
            return null;
        });
        const everyLocationExistsAndIsSlot = everyLocationExistsAndIsSlotNamesList.every(name => name !== null);
        if (everyLocationExistsAndIsSlot) {
            return {
                identifiers: ids,
                text: name || DE.utils.templates.formatAnd(everyLocationExistsAndIsSlotNamesList.map(name => name || "Unknown Location")),
                foundAs: ids.length === 1 ? "single-location-slot" : "location-slots",
                type: "identifier",
            };
        }

        if (force) {
            return {
                identifiers: ids,
                text: name || (ids.length === 1 ? "Unknown Location" : "Unknown Locations"),
                foundAs: ids.length === 1 ? "single-location" : "locations",
                type: "identifier",
            };
        }

        return null;
    } else if (ids.every(id => id.startsWith("item-"))) {
        return {
            identifiers: ids,
            text: name || (ids.length === 1 ? "Unknown Item" : "Unknown Items"),
            foundAs: ids.length === 1 ? "single-item" : "items",
            type: "identifier",
        };
    }

    const manualCheckMixedTypesNames = ids.map(id => {
        if (id.startsWith("character-")) {
            const character = DE.characters[id];
            return character ? character.name : "Unknown Character";
        } else if (id.startsWith("location-")) {
            const location = DE.world.locations[id];
            if (location) {
                return location.name;
            }
            for (const locationId in DE.world.locations) {
                const location = DE.world.locations[locationId];
                if (location.slots && location.slots[id]) {
                    return location.slots[id].name;
                }
            }
            return "Unknown Location";
        } else if (id.startsWith("item-")) {
            return "Unknown Item";
        } else {
            return null;
        }
    });

    if (manualCheckMixedTypesNames.every(name => name !== null) || force) {
        return {
            identifiers: ids,
            text: name || DE.utils.templates.formatAnd(manualCheckMixedTypesNames.map(name => name || "Unknown Item")),
            foundAs: "mixed",
            type: "identifier",
        };
    }

    return null;
}

/**
 * Check if the given identifier starts with a basic prefix (character-, location-, item-).
 * @param {string} idLower
 * @returns {boolean}
 */
function startsWithBasicPrefix(idLower) {
    return idLower.startsWith("character-") || idLower.startsWith("location-") || idLower.startsWith("item-");
}

/**
 * @param {DEObject} DE
 * @param {string} nameLower
 * @param {string|null} characterIdThatEmittedTheIdentifier
 * @returns {DECompleteCharacterReference|null}
 */
function findACharacterWithTheName(DE, nameLower, characterIdThatEmittedTheIdentifier) {
    /**
     * @type {DECompleteCharacterReference[]}
     */
    const allCharacterAtLocation = [];

    for (const characterId in DE.stateFor) {
        const character = DE.characters[characterId];
        if (character && DE.stateFor[characterId].location === DE.world.currentLocation) {
            allCharacterAtLocation.push(character);
        }
    }

    for (const character of allCharacterAtLocation) {
        if (character.name.toLowerCase() === nameLower) {
            return character;
        }
    }

    if (characterIdThatEmittedTheIdentifier) {
        const bondsOfEmitter = DE.bonds[characterIdThatEmittedTheIdentifier];
        if (bondsOfEmitter) {
            const tryWith = ["active", "ex"];
            for (const bondType of tryWith) {
                const actualBondType = bondType === "active" ? "active" : "ex";
                const bondWithName = bondsOfEmitter[actualBondType].find(bond => {
                    const otherCharacterId = bond.towards;
                    const otherCharacter = DE.characters[otherCharacterId];
                    if (otherCharacter && otherCharacter.name.toLowerCase().trim() === nameLower) {
                        return true;
                    }
                    const knownAsOne = bond.knowsAs.find(knownAs => knownAs.name.toLowerCase().trim() === nameLower);
                    if (knownAsOne) {
                        return true;
                    }
                    return false;
                });
                if (bondWithName) {
                    const otherCharacterId = bondWithName.towards;
                    const otherCharacter = DE.characters[otherCharacterId];
                    if (otherCharacter) {
                        return otherCharacter;
                    }
                }
            }
        }
    }

    return null;
}

/**
 * @param {DEObject} DE
 * Search the emitter's conversation snapshots, including other participants' locations.
 * @param {string} name
 * @param {string|null} characterIdThatEmittedTheIdentifier
 * @returns {Promise<DEConversationMessageFragmentIdentifier|null>}
 */
async function findALocationWithTheName(DE, name, characterIdThatEmittedTheIdentifier) {
    if (!characterIdThatEmittedTheIdentifier) return null;
    // Use the same name normalization as the database when distinguishing location/slot hits.
    /** @param {string} value */
    const normalize = value => value.normalize("NFKD").toLowerCase()
        .replace(/[\p{M}]/gu, "").replace(/[^\p{L}\p{N}]/gu, "");
    const search = normalize(name);
    if (!search) return null;

    const matches = await DE.database.getPossibleLocationsCharKnowsAlikeTo(
        characterIdThatEmittedTheIdentifier, name,
    );
    // The database returns newest conversations first. Skip locations that no longer exist.
    for (const match of matches) {
        const location = DE.world.locations[match.locationId];
        if (!location) continue;
        const matchesLocation = normalize(match.locationNameAtTheTime).includes(search);
        if (!matchesLocation && !location.slots?.[match.locationSlotId]) continue;
        return {
            identifiers: matchesLocation ? [match.locationId] : [match.locationSlotId],
            text: name,
            foundAs: matchesLocation ? "single-location" : "single-location-slot",
            type: "identifier",
        };
    }
    return null;
}

/**
 * Resolve the usual correct input cheaply; widen bounded recovery only on a
 * miss. Well-formed item ID/name pairs are trusted without an item lookup.
 * ID-only item searches preserve the ID and only try to fill its missing name.
 * Nearby recovery may succeed before a distant, stronger match is inspected.
 * Always return a fragment, preserving unresolved inputs as an item reference.
 * @param {DEObject} DE
 * @param {string} ids
 * @param {string} name
 * @param {string|null} characterIdThatEmittedTheIdentifier
 * @returns {Promise<DEConversationMessageFragmentIdentifier>}
 */
export async function findBestIdentifier(DE, ids, name, characterIdThatEmittedTheIdentifier) {
    const nameLower = name.toLowerCase().trim();
    const idsLower = ids.toLowerCase().trim();
    const idsLowerSplit = idsLower.split(/,|\|/g);
    const shouldReverse = nameLower.startsWith("character-") || nameLower.startsWith("item-") || nameLower.startsWith("location-");

    const actualIds1 = (shouldReverse ? nameLower : idsLower).split(/,|\|/g);
    const actualName1 = shouldReverse ? ids : name;

    const naiveResult = findIdentifierNaive(DE, actualIds1, actualName1, false);
    if (naiveResult) {
        return naiveResult;
    }
    
    if (shouldReverse) {
        const naiveResult2 = findIdentifierNaive(DE, idsLowerSplit, name, false);
        if (naiveResult2) {
            return naiveResult2;
        }
    }

    const isBasicPrefix = idsLowerSplit.every(id => startsWithBasicPrefix(id));
    if (!isBasicPrefix) {
        // we got no naive result, let's try to see if we can force it somehow
        const potentialIdsAsCharacter = idsLowerSplit.map(id => "character-" + id);
        const potentialIdsAsLocation = idsLowerSplit.map(id => "location-" + id);

        // try to find them as character or location
        const naiveResult3 = findIdentifierNaive(DE, potentialIdsAsCharacter, name, false);
        if (naiveResult3) {
            return naiveResult3;
        }
        const naiveResult4 = findIdentifierNaive(DE, potentialIdsAsLocation, name, false);
        if (naiveResult4) {
            return naiveResult4;
        }
    }

    // okay now we are stuck we cannot quite find what it is, let's do our last resort
    const shouldBeSingleCharacter = actualIds1.length === 1 && actualIds1[0].startsWith("character-");
    if (shouldBeSingleCharacter) {
        const potentialCharacter = findACharacterWithTheName(DE, actualName1.toLowerCase().trim(), characterIdThatEmittedTheIdentifier);
        if (potentialCharacter) {
            return {
                identifiers: [potentialCharacter.id],
                text: actualName1 || potentialCharacter.name,
                foundAs: "single-character",
                type: "identifier",
            };
        }
    }

    const shouldBeSingleLocation = actualIds1.length === 1 && actualIds1[0].startsWith("location-");
    if (shouldBeSingleLocation) {
        const potentialLocation = await findALocationWithTheName(DE, actualName1, characterIdThatEmittedTheIdentifier);
        if (potentialLocation) {
            return potentialLocation;
        }
    }

    return {
        identifiers: actualIds1,
        text: actualName1,
        foundAs: "mixed",
        type: "identifier",
    };
}
