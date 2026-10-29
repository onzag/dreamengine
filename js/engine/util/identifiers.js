
/**
 * @param {DEObject} DE
 * @param {string} id
 * @param {string} name
 * @param {boolean} force
 * @returns {DEConversationMessageFragmentIdentifier|null}
 */
function findIdentifierNaive(DE, id, name, force) {
    // try to find as character first
    if (id.startsWith("character-")) {
        const character = DE.characters[id];
        if (character) {
            return {
                identifier: id,
                text: name || character.name,
                foundAs: "character",
                type: "identifier",
            };
        } else if (force) {
            return {
                identifier: id,
                text: name || "Unknown Character",
                foundAs: "character",
                type: "identifier",
            };
        }
    } else if (id.startsWith("location-")) {
        const location = DE.world.locations[id];
        if (location) {
            return {
                identifier: id,
                text: name || location.name,
                foundAs: "location",
                type: "identifier",
            };
        }

        for (const locationId in DE.world.locations) {
            const location = DE.world.locations[locationId];
            if (location.slots && location.slots[id]) {
                return {
                    identifier: locationId,
                    text: name || location.slots[id].name,
                    foundAs: "location-slot",
                    type: "identifier",
                };
            }
        }

        if (force) {
            return {
                identifier: id,
                text: name || "Unknown Location",
                foundAs: "location",
                type: "identifier",
            };
        }
    } else if (id.startsWith("item-") || force) {
        return {
            identifier: id,
            text: name || "Unknown Item",
            foundAs: "item",
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
 * @param {string} nameLower
 * @param {string} characterIdThatEmittedTheIdentifier
 * @returns {Promise<DECompleteLocationReference|null>}
 */
function findALocationWithTheName(DE, nameLower, characterIdThatEmittedTheIdentifier) {
    
}

/**
 * Resolve the usual correct input cheaply; widen bounded recovery only on a
 * miss. Well-formed item ID/name pairs are trusted without an item lookup.
 * ID-only item searches preserve the ID and only try to fill its missing name.
 * Nearby recovery may succeed before a distant, stronger match is inspected.
 * Always return a fragment, preserving unresolved inputs as an item reference.
 * @param {DEObject} DE
 * @param {string} id
 * @param {string} name
 * @param {string|null} characterIdThatEmittedTheIdentifier
 * @returns {Promise<DEConversationMessageFragmentIdentifier>}
 */
export async function findBestIdentifier(DE, id, name, characterIdThatEmittedTheIdentifier) {
    const nameLower = name.toLowerCase().trim();
    const idLower = id.toLowerCase().trim();
    const shouldReverse = nameLower.startsWith("character-") || nameLower.startsWith("item-") || nameLower.startsWith("location-");

    const actualId1 = shouldReverse ? nameLower : idLower;
    const actualName1 = shouldReverse ? id : name;

    const naiveResult = findIdentifierNaive(DE, actualId1, actualName1, false);
    if (naiveResult) {
        return naiveResult;
    }

    if (shouldReverse) {
        const naiveResult2 = findIdentifierNaive(DE, idLower, name, false);
        if (naiveResult2) {
            return naiveResult2;
        }
    }

    const isBasicPrefix = startsWithBasicPrefix(idLower);
    if (!isBasicPrefix) {
        // we got no naive result, let's try to see if we can force it somehow
        const potentialIdAsCharacter = "character-" + idLower;
        const potentialIdAsLocation = "location-" + idLower;

        // try to find them as character or location
        const naiveResult3 = findIdentifierNaive(DE, potentialIdAsCharacter, name, false);
        if (naiveResult3) {
            return naiveResult3;
        }
        const naiveResult4 = findIdentifierNaive(DE, potentialIdAsLocation, name, false);
        if (naiveResult4) {
            return naiveResult4;
        }
    }

    // okay now we are stuck we cannot quite find what it is, let's do our last resort
    const shouldBeCharacter = idLower.startsWith("character-");
    if (shouldBeCharacter) {
        const potentialCharacter = findACharacterWithTheName(DE, nameLower, characterIdThatEmittedTheIdentifier);
        if (potentialCharacter) {
            return {
                identifier: potentialCharacter.id,
                text: name || potentialCharacter.name,
                foundAs: "character",
                type: "identifier",
            };
        }
    }

    const shouldBeLocation = nameLower.startsWith("location-");
    if (shouldBeLocation) {
        const potentialLocation = await findALocationWithTheName(DE, nameLower, characterIdThatEmittedTheIdentifier);
        if (potentialLocation) {
            return {
                identifier: potentialLocation.id,
                text: name || potentialLocation.name,
                foundAs: "location",
                type: "identifier",
            };
        }
    }
}
