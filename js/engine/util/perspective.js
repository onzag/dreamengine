import { findItemInPerspective, isPerspectiveMemoryRetained, findCharacterInPerspective, calculatePerspectiveMemory, calculateCharacterSightingHistory, calculateLocationVisitHistory, passPerspectiveThroughMemory } from './perspective-memory.js';
import {
    getListOfCarriedCharactersByCharacter,
    getExternalDescriptionOfCharacter,
    getInternalDescriptionOfCharacter,
    getBondDeclarationFromBondDescription,
    getFamilyBondRelation,
    getRelationship,
    getExternalDescriptionOfCharacterPostureOnly,
    getPerceivedGenderOfCharacterFromPerspective,
} from './character-info.js';
import { utilItemCount } from './items.js';
import {
    getNameIdentificationForOneCharacterTowardsAnother,
    getNameIdentificationForOneCharacterTowardsAnotherOnlyName,
} from './messages.js';
import { getPerceivedItemLabel } from './visibility.js';

/**
 * Count explicit identifier mentions in message content, including nested dialogue.
 * Each identifier fragment counts once for an ID, even if it names several entities.
 * @param {Omit<DEConversationMessage, "id"> | undefined} message
 * @param {string} id
 * @returns {number}
 */
function countIdentifierMentions(message, id) {
    if (!message) return 0;
    /**
     * @param {DEConversationMessage["content"][number] | DEConversationMessageNarrationFragment | DEConversationMessageDialogueFragment} fragment
     * @returns {number}
     */
    function count(fragment) {
        if (typeof fragment === "string" || fragment.type === "sound") return 0;
        if (fragment.type === "identifier") return fragment.identifiers.includes(id) ? 1 : 0;
        return fragment.fragments.reduce((total, child) => total + count(child), 0);
    }
    return message.content.reduce((total, fragment) => total + count(fragment), 0);
}

/**
 * Builds a snapshot of the world from a single character's point of view, mirroring
 * exactly what the UI surfaces (scene characters, carried/worn/slot items, and what the
 * observer can or cannot make out) through the same engine utilities the views consume.
 *
 * @param {DEObject} DE
 * @param {DECompleteCharacterReference | string} character
 * @param {string[]} [destroyedItemsIds]
 * @param {Omit<DEConversationMessage, "id">} [relatedConversationMessage]
 * @returns {Promise<DEPerspective>}
 */
export async function getPerspective(DE, character, destroyedItemsIds = [], relatedConversationMessage) {
    const ownId = typeof character === 'string' ? character : character.id;
    const ownChar = DE.characters[ownId];
    if (!ownChar) {
        throw new Error(`Character ${ownId} not found.`);
    }
    const ownState = DE.stateFor[ownId];
    if (!ownState) {
        throw new Error(`Character state for ${ownId} not found.`);
    }

    const destroyedIds = new Set(destroyedItemsIds);
    const previousPerspective = await DE.database.getLastPerspectiveOfCharacter(ownId);

    const locationId = ownState.location;
    const location = DE.world.locations[locationId];
    if (!location) {
        throw new Error(`Location ${locationId} not found.`);
    }
    const slotId = ownState.locationSlot;
    const slot = location.slots[slotId] || null;

    const self = await buildPerspectiveCharacter(DE, ownId, ownId, 'visible', previousPerspective, relatedConversationMessage);
    const ownLocation = await buildPerspectiveLocation(DE, locationId, ownId, previousPerspective, relatedConversationMessage);

    const allConversationsAtLocation = await DE.utils.conversations.getAllConversationsAtLocation(locationId);

    const locationPerception = DE.utils.world.whatCanTheyMakeOfALocation(locationId, ownId);

    const canSeeCharacters = !locationPerception.cantSee;
    const observerName = DE.utils.templates.formatCharacterName(ownChar, ownChar, { capitalize: true, justName: true });

    /**
     * @type {DESocialGroupsInPerspective}
     */
    const socialGroups = {
        soloCharacters: [],
        canSeeCharacters,
        characterListsAreUnclear: unclearReason(locationPerception, observerName, 'characters'),
        otherGroups: [],
        ownGroup: [],
    };

    /**
     * @type {DEObjectiveSocialGroupsInPerspective}
     */
    const objectiveSocialGroups = {
        soloCharacters: [],
        otherGroups: [],
        ownGroup: [],
    };

    /**
     * @type {Array<DEPerspectiveCharacter>}
     */
    const perspectiveCharactersList = [];

    // add all the characters at the location having conversations
    for (const charId of allConversationsAtLocation.foundCharacters) {
        if (charId === ownId) continue;

        const canSeeThem = DE.utils.characterInfo.canSeeCharacter(charId, ownId);

        const character = await buildPerspectiveCharacter(DE, charId, ownId, canSeeThem, previousPerspective, relatedConversationMessage);
        perspectiveCharactersList.push(character);

        const isSoloChar = allConversationsAtLocation.leftoverCharacters.includes(charId);
        if (isSoloChar) {
            objectiveSocialGroups.soloCharacters.push(charId);
            if (canSeeThem !== "invisible") {
                socialGroups.soloCharacters.push(charId);
            }
        } else {
            // we will add the rest below when we process the conversations, so we don't add them here
        }
    }

    for (const conversation of allConversationsAtLocation.conversations) {

        /**
         * @type {Array<{
         *    id: string;
         *    visibility: "visible" | "perceived";
         * }>}
         */
        const actualIdsOfVisibleParticipants = [];
        let isOwnGroup = conversation.participants.includes(ownId);
        for (const participantId of conversation.participants) {
            if (participantId === ownId) {
                continue;
            }
            const canSeeThem = isOwnGroup ? "visible" : DE.utils.characterInfo.canSeeCharacter(participantId, ownId);
            if (canSeeThem !== "invisible") {
                actualIdsOfVisibleParticipants.push({
                    id: participantId,
                    visibility: canSeeThem,
                });
            }
        }

        if (actualIdsOfVisibleParticipants.length > 0) {
            if (isOwnGroup) {
                socialGroups.ownGroup.push(...actualIdsOfVisibleParticipants.map(p => p.id));
            } else if (actualIdsOfVisibleParticipants.length === 1) {
                socialGroups.soloCharacters.push(actualIdsOfVisibleParticipants[0].id);
            } else {
                socialGroups.otherGroups.push(actualIdsOfVisibleParticipants.map(p => p.id));
            }
        }

        if (isOwnGroup) {
            objectiveSocialGroups.ownGroup.push(...conversation.participants.filter(id => id !== ownId));
        } else if (conversation.participants.length === 1) {
            objectiveSocialGroups.soloCharacters.push(conversation.participants[0]);
        } else {
            objectiveSocialGroups.otherGroups.push(conversation.participants.filter(id => id !== ownId));
        }
    }

    /**
     * @type {DEPerspective}
     */
    const activePerspective = passPerspectiveThroughMemory(DE, {
        worldMetadata: DE.world.metadata || {},
        self,
        ownId,
        ownName: ownChar.name,
        ownLocationId: locationId,
        ownLocationName: location.name,
        ownLocationSlotId: slotId,
        ownLocationSlotName: slot ? slot.name : '',
        ownLocation,
        ownCharacterBlindness: ownChar.blindness || 'no',
        socialGroups,
        objectiveSocialGroups,
        perspectiveCharacters: perspectiveCharactersList,
        rememberedCharacters: [],
        rememberedLocations: [],
        timeOfPerspective: { ...DE.currentTime },
    }, previousPerspective, DE.currentTime.time, destroyedItemsIds);
    return activePerspective;
}

/**
 * @param {DEObject} DE
 * @param {string} locationId
 * @param {string} observerId
 * @param {DEPerspective | null | undefined} previousPerspective
 * @param {Omit<DEConversationMessage, "id">} [relatedConversationMessage]
 * @returns {Promise<DEPerspectiveLocation>}
 */
async function buildPerspectiveLocation(DE, locationId, observerId, previousPerspective, relatedConversationMessage) {
    const location = DE.world.locations[locationId];
    if (!location) {
        throw new Error(`Location ${locationId} not found.`);
    }
    const observer = DE.characters[observerId];
    if (!observer) {
        throw new Error(`Character ${observerId} not found.`);
    }
    const lastPerspectiveOfObserver = previousPerspective === undefined
        ? await DE.database.getLastPerspectiveOfCharacter(observerId)
        : previousPerspective;
    const visitHistory = calculateLocationVisitHistory(lastPerspectiveOfObserver, locationId,
        DE.currentTime, observer.attention ?? 0, countIdentifierMentions(relatedConversationMessage, locationId));

    const slots = [];
    for (const slotId of Object.keys(location.slots)) {
        slots.push(await buildPerspectiveLocationSlot(DE, locationId, slotId, observerId, lastPerspectiveOfObserver, relatedConversationMessage));
    }

    const whatCanTheyMakeOfLocation = DE.utils.world.whatCanTheyMakeOfALocation(locationId, observerId);

    let description = '';
    if (whatCanTheyMakeOfLocation.cantSee) {
        description = `${DE.utils.templates.formatCharacterName(observerId, observerId, {
            justName: true,
            type: 'definite',
            capitalize: true,
        })} cannot see the ${location.name} clearly.`;
    } else {
        description = typeof location.description === 'string' ? location.description : await location.description({
            char: DE.characters[observerId],
        });
    }

    return {
        ...visitHistory,
        locationMetadata: location.metadata || {},
        locationId,
        locationName: location.name,
        weatherName: location.internalState?.currentWeather || '',
        slots,
        description: description,
    };
}

/**
 * @param {DEObject} DE
 * @param {string} locationId
 * @param {string} slotId
 * @param {string} observerId
 * @param {DEPerspective | null} previousPerspective
 * @param {Omit<DEConversationMessage, "id">} [relatedConversationMessage]
 * @returns {Promise<DEPerspectiveLocationSlot>}
 */
async function buildPerspectiveLocationSlot(DE, locationId, slotId, observerId, previousPerspective, relatedConversationMessage) {
    const location = DE.world.locations[locationId];
    const slot = location.slots[slotId];
    if (!slot) {
        throw new Error(`Location slot ${slotId} not found in location ${locationId}.`);
    }

    const observerName = DE.utils.templates.formatCharacterName(observerId, observerId, {
        justName: true,
        type: 'definite',
        capitalize: true,
    });
    const locationPerception = DE.utils.world.whatCanTheyMakeOfALocation(slotId, observerId);

    const {
        items,
        missingItems,
    } = await buildPerspectiveItems(DE, null, slot.items || [], observerId, locationId, slotId, previousPerspective, relatedConversationMessage);

    // Characters at this slot, excluding the observer, that the observer can at least perceive.
    /** @type {string[]} */
    const characters = [];
    /**
     * Missing characters at this slot, that the observer cannot perceive at all, but that are present in the slot.
     * @type {string[]}
     */
    const missingCharacters = [];
    const slotCharacterIds = DE.utils.world.getCharacterIdsAtLocationSlot(slotId);
    for (const charId of slotCharacterIds) {
        if (charId === observerId) continue;
        const visibility = DE.utils.characterInfo.canSeeCharacter(charId, observerId);
        if (visibility === 'invisible') {
            missingCharacters.push(charId);
        } else {
            characters.push(charId)
        }
    }

    const canSeeItems = !locationPerception.cantSee;
    const canSeeCharacters = !locationPerception.cantSee;

    let description = '';
    if (locationPerception.cantSee) {
        description = `${observerName} cannot see the ${slot.name} clearly.`;
    } else {
        description = typeof slot.description === 'string' ? slot.description : await slot.description({
            char: DE.characters[observerId],
        });
    }

    return {
        slotMetadata: slot.metadata || {},
        slotId,
        slotName: slot.name,
        items,
        missingItems,
        canSeeItems,
        itemListsAreUnclear: unclearReason(locationPerception, observerName, 'items'),
        characters,
        missingCharacters,
        canSeeCharacters,
        characterListsAreUnclear: unclearReason(locationPerception, observerName, 'characters'),
        description,
    };
}

/**
 * Describes whether a list obtained from a place is reliable, matching the vagueness the UI shows.
 * @param {{ cantSee: boolean, hasHighPerception: boolean }} perception
 * @param {string} observerName
 * @param {'items' | 'characters'} kind
 * @returns {false | string}
 */
function unclearReason(perception, observerName, kind) {
    if (perception.cantSee) {
        return `${observerName} cannot clearly perceive the ${kind} in here.`;
    }
    if (!perception.hasHighPerception) {
        return `${observerName}'s perception is not sharp enough, some ${kind} might be missing.`;
    }
    return false;
}

/**
 * @param {DEObject} DE
 * @param {string} targetId
 * @param {string} observerId
 * @param {DEVisibility} perceptionForm
 * @param {DEPerspective | null} previousPerspective
 * @param {Omit<DEConversationMessage, "id">} [relatedConversationMessage]
 * @returns {Promise<DEPerspectiveCharacter>}
 */
async function buildPerspectiveCharacter(
    DE,
    targetId,
    observerId,
    perceptionForm,
    previousPerspective,
    relatedConversationMessage,
) {
    const target = DE.characters[targetId];
    if (!target) {
        throw new Error(`Character ${targetId} not found.`);
    }
    const observer = DE.characters[observerId];
    if (!observer) {
        throw new Error(`Character ${observerId} not found.`);
    }
    const targetState = DE.stateFor[targetId];
    if (!targetState) {
        throw new Error(`Character state for ${targetId} not found.`);
    }
    const observerState = DE.stateFor[observerId];
    if (!observerState) {
        throw new Error(`Character state for ${observerId} not found.`);
    }

    const isSelf = targetId === observerId;

    const activeBond = DE.bonds[observerId]?.active.find(b => b.towards === targetId) || null;
    const exBond = activeBond ? null : (DE.bonds[observerId]?.ex.find(b => b.towards === targetId) || null);
    const bond = activeBond || exBond;

    const perception = DE.utils.characterInfo.whatCanTheyMakeOfAnotherCharacter(targetId, observerId);
    const genderStuffs = getPerceivedGenderOfCharacterFromPerspective(DE, target, observer);

    const characterNameComplex = getNameIdentificationForOneCharacterTowardsAnotherOnlyName(DE, observer, target);
    const characterNameSimple = DE.utils.templates.formatCharacterName(target, observer, { justName: true, capitalize: true });
    const characterNameDefinite = DE.utils.templates.formatCharacterName(target, observer, { type: 'definite', capitalize: true, justName: true });
    const characterNameIndefinite = DE.utils.templates.formatCharacterName(target, observer, { type: 'indefinite', capitalize: true, justName: true });

    /** @type {string[]} */
    let characterAllNames;
    if (isSelf) {
        characterAllNames = [target.name];
    } else if (bond && bond.knowsAs.length > 0) {
        characterAllNames = [...new Set(bond.knowsAs.map(k => k.name))];
    } else {
        characterAllNames = [];
    }

    const familyRelation = isSelf ? null : getFamilyBondRelation(observer, target);
    const bondDescription = isSelf ? '' : await buildBondDescription(DE, observer, target);

    const characterExternalDescription = await getExternalDescriptionOfCharacter(DE, targetId, observerId, false, false);
    const characterPlaceAndPostureDescription = getExternalDescriptionOfCharacterPostureOnly(DE, targetId, observerId);

    const characterCarryingItems = await buildPerspectiveItems(DE, null, targetState.carrying || [], observerId, targetState.location, targetState.locationSlot, previousPerspective, relatedConversationMessage);
    const characterWearingItems = await buildPerspectiveItems(DE, null, targetState.wearing || [], observerId, targetState.location, targetState.locationSlot, previousPerspective, relatedConversationMessage);

    const carriedCharactersBase = getListOfCarriedCharactersByCharacter(DE, targetId)
        .map(c => c.carriedId)

    const carriedCharacters = carriedCharactersBase.filter(carriedId => isSelf || DE.utils.characterInfo.canSeeCharacter(carriedId, observerId) !== 'invisible');
    const missingCarriedCharacters = carriedCharactersBase.filter(carriedId => !carriedCharacters.includes(carriedId));

    /** @type {DECharacterStateInPerspective[]} */
    const states = [];

    if (perception.canTellStates) {
        // they can tell internal states too
        if (perception.hasHighPerception || perception.hasPerfectPerception) {
            if (target.blindness === "partial-bad" || target.blindness === "partial-good") {
                states.push({
                    type: "INTERNAL",
                    stateName: "Partially Blind",
                    dominant: true,
                });
            } else if (target.blindness === "full") {
                states.push({
                    type: "INTERNAL",
                    stateName: "Blind",
                    dominant: true,
                });
            }

            if (target.autism >= 0.75) {
                states.push({
                    type: "INTERNAL",
                    stateName: "Severely Autistic",
                    dominant: true,
                });
            } else if (target.autism >= 0.5) {
                states.push({
                    type: "INTERNAL",
                    stateName: "Moderately Autistic",
                    dominant: true,
                });
            } else if (target.autism >= 0.25) {
                states.push({
                    type: "INTERNAL",
                    stateName: "Mildly Autistic",
                    dominant: true,
                });
            }

            // an observer cannot tell their own schizophrenia level
            if (target.id !== observerId) {
                if (target.schizophrenia >= 0.75) {
                    states.push({
                        type: "INTERNAL",
                        stateName: "Severely Schizophrenic",
                        dominant: true,
                    });
                } else if (target.schizophrenia >= 0.5) {
                    states.push({
                        type: "INTERNAL",
                        stateName: "Moderately Schizophrenic",
                        dominant: true,
                    });
                } else if (target.schizophrenia >= 0.25) {
                    states.push({
                        type: "INTERNAL",
                        stateName: "Mildly Schizophrenic",
                        dominant: true,
                    });
                }
            }

            if (target.violence >= 0.75) {
                states.push({
                    type: "INTERNAL",
                    stateName: "Extremely Violent",
                    dominant: true,
                });
            } else if (target.violence >= 0.5) {
                states.push({
                    type: "INTERNAL",
                    stateName: "Moderately Violent",
                    dominant: true,
                });
            } else if (target.violence >= 0.25) {
                states.push({
                    type: "INTERNAL",
                    stateName: "Mildly Violent",
                    dominant: true,
                });
            }

            const targetPerceivedGender = target.genderAppearance <= 0.25 ? "male" : target.genderAppearance >= 0.75 ? "female" : "ambiguous";
            if (target.sex !== "none" && target.sex !== "intersex" && target.sex !== targetPerceivedGender) {
                if (targetPerceivedGender !== "ambiguous") {
                    // basically must be MtF or FtM
                    states.push({
                        type: "INTERNAL",
                        stateName: "Transgender",
                        dominant: true,
                    });
                } else {
                    // The sex could be either but the presentation is unclear, so we will just say non-binary
                    states.push({
                        type: "INTERNAL",
                        stateName: "Non-Binary",
                        dominant: true,
                    });
                }
            }

            if (target.perception >= 0.75) {
                states.push({
                    type: "INTERNAL",
                    stateName: "Extremely Perceptive",
                    dominant: true,
                });
            } else if (target.perception >= 0.1) {
                // nothing
            } else if (target.perception > 0) {
                states.push({
                    type: "INTERNAL",
                    stateName: "Unusually Unperceptive",
                    dominant: true,
                });
            }
        }

        /**
         * @type {DEApplyingState[]}
         */
        const actualApplyingStatesToConsider = [];
        /**
         * @type {number[]}
         */
        const dominances = [];
        let maxDominance = 0;
        for (const applyingState of targetState.states) {
            const stateDeclaration = target.stateDefinitions[applyingState.state];
            if (!stateDeclaration) {
                console.warn(`State ${applyingState.state} not found for character ${targetId}.`);
                continue;
            }

            if (stateDeclaration.behaviourType === "HIDDEN") {
                continue;
            }

            if (stateDeclaration.hiddenToOthers) {
                const isSelf = targetId === observerId;
                const shouldBeHidden = !isSelf && (
                    stateDeclaration.hiddenToOthers === "FULLY_HIDDEN" ? true :
                        (
                            stateDeclaration.hiddenToOthers === "HIDDEN_TO_LOW_PERCEPTION" ? !perception.hasMediumPerception && !perception.hasPerfectPerception && !perception.hasHighPerception :
                                (
                                    stateDeclaration.hiddenToOthers === "HIDDEN_TO_MEDIUM_PERCEPTION_AND_UNDER" ? !perception.hasHighPerception && !perception.hasPerfectPerception :
                                        stateDeclaration.hiddenToOthers === "HIDDEN_TO_HIGH_PERCEPTION_AND_UNDER" ? !perception.hasPerfectPerception :
                                            false
                                )
                        )
                );
                if (shouldBeHidden) {
                    continue;
                }
            }

            actualApplyingStatesToConsider.push(applyingState);

            const actualDominance = applyingState.relieving ? (typeof stateDeclaration.dominanceAfterRelief !== 'undefined' ? stateDeclaration.dominanceAfterRelief : stateDeclaration.dominance) : stateDeclaration.dominance;
            dominances.push(actualDominance);

            if (actualDominance > maxDominance) {
                maxDominance = actualDominance;
            }
        }

        for (let i = 0; i < actualApplyingStatesToConsider.length; i++) {
            const applyingState = actualApplyingStatesToConsider[i];
            const stateDeclaration = target.stateDefinitions[applyingState.state];
            const dominance = dominances[i];

            if (stateDeclaration.behaviourType === "HIDDEN") {
                continue;
            }

            /**
             * @type {*}
             */
            let roundedLevel = Math.round(applyingState.intensity);
            if (roundedLevel < 0) roundedLevel = 0;
            if (roundedLevel > 4) roundedLevel = 4;

            let actualStateName = applyingState.state;
            if (stateDeclaration.behaviourType === "INTENSITY_EXPRESSIVE") {
                if (roundedLevel === 0) {
                    actualStateName = `Mildly ${applyingState.state}`;
                } else if (roundedLevel === 2) {
                    actualStateName = `Very ${applyingState.state}`;
                } else if (roundedLevel === 3) {
                    actualStateName = `Extremely ${applyingState.state}`;
                } else if (roundedLevel === 4) {
                    actualStateName = `Overwhelmingly ${applyingState.state}`;
                }
            }

            /**
             * @type {DECharacterStateInPerspective}
             */
            const stateThusFar = {
                type: stateDeclaration.behaviourType,
                stateName: actualStateName,
                level: stateDeclaration.behaviourType === "INTENSITY_EXPRESSIVE" ? roundedLevel : undefined,
                dominant: dominance === maxDominance,
                relieving: applyingState.relieving,
            };

            // self can know their own causes
            if ((isSelf || perception.hasPerfectPerception) && applyingState.causes && applyingState.causes.length > 0) {
                const nameInPerspective = getNameIdentificationForOneCharacterTowardsAnother(DE, observer, target);
                stateThusFar.causes = applyingState.causes.map(cause => {
                    const causeCausant = cause.causant;
                    /**
                     * @type {string}
                     */
                    let result;
                    if (!causeCausant) {
                        result = `${nameInPerspective} ${cause.description}`;
                    } else if (causeCausant.type === "character") {
                        const otherCharacter = DE.characters[causeCausant.id];
                        if (!otherCharacter) {
                            console.warn(`Cause causant character ${causeCausant.id} not found for character ${targetId}.`);
                            result = `${nameInPerspective} ${cause.description}`;
                        } else {
                            const causantNameInPerspective = getNameIdentificationForOneCharacterTowardsAnother(DE, observer, otherCharacter);
                            result = `${nameInPerspective} ${cause.description}, done by ${causantNameInPerspective}`;
                        }
                    } else if (causeCausant.type === "object") {
                        let nameToUse = causeCausant.name;
                        if (!nameToUse.startsWith('the ')) {
                            nameToUse = `the ${nameToUse}`;
                        }
                        result = `${nameInPerspective} ${cause.description}, done by ${nameToUse}`;
                    } else {
                        // @ts-ignore
                        console.warn(`Cause causant type ${causeCausant.type} not recognized for character ${targetId}.`);
                        result = `${nameInPerspective} ${cause.description}`;
                    }

                    if (!result.endsWith('.')) {
                        result += '.';
                    }

                    return result;
                });
            }

            states.push(stateThusFar);
        }
    }

    // factors that affect memory scoring

    // conversation gives 2 point
    let max = 0;
    const isCharacterInConversationWithObserver = (targetState.conversationId && observerState.conversationId && targetState.conversationId === observerState.conversationId) ? 2 : 0;
    max += 2;
    // bond level (positive or negative) gives 1 point depending on how powerful it is
    const bondLevelAbsolute = (Math.abs(bond ? bond.bond : 0) / 100) * 2;
    max += 2;
    // non stranger factor adds another point
    const strangerFactor = bond ? (bond.stranger ? 0 : 1) : 0;
    max += 1;
    // being in the same exact slot gives a point too
    const sameSlot = (targetState.location === observerState.location && targetState.locationSlot === observerState.locationSlot) ? 1 : 0;
    max += 1;
    // them being attractive gives a point
    const isAttractive = (DE.utils.bonds.isAttractedToWithLevelAsNumber(observer, target) / 3);
    max += 1;

    // memorability score from 0 to 2, the range allows itself to be exceeded by double the max
    // these half points added by the message count do not count towards the max, they are just a bonus for being mentioned in the conversation
    const memorability = (isCharacterInConversationWithObserver + bondLevelAbsolute + strangerFactor +
        sameSlot + isAttractive + (countIdentifierMentions(relatedConversationMessage, targetId) * 0.5)) / max;

    const lastPerspectiveOfObserver = previousPerspective === undefined
        ? await DE.database.getLastPerspectiveOfCharacter(observerId)
        : previousPerspective;
    const previousCharacter = findCharacterInPerspective(lastPerspectiveOfObserver, targetId);
    const elapsed = lastPerspectiveOfObserver ? DE.currentTime.time - lastPerspectiveOfObserver.timeOfPerspective.time : 0;

    // they are being mentioned or part of the same conversation
    const isActivelyObserved = relatedConversationMessage?.content.some((c) => {
        return c.fragments.some((f) => {
            return typeof f !== "string" && f.type === "identifier" && f.identifiers.some((id) => id === targetId);
        });
    }) || (targetState.conversationId === observerState.conversationId && targetState.conversationId !== null);

    const memory = calculatePerspectiveMemory(memorability, observer.attention ?? 0, previousPerspective,
        previousCharacter?.memory ?? null, elapsed, DE.currentTime.time, !isActivelyObserved);
    const sightingHistory = calculateCharacterSightingHistory(lastPerspectiveOfObserver, targetId, DE.currentTime);

    const canTellDetailsOfClothingOrCarriedItems = perception.canTellDetailsOfClothingOrCarriedItems === "YES";
    const canTellOtherCarriedCharacters = perception.canTellOtherCarriedCharacters === "YES";

    return {
        metadata: target.metadata || {},
        memory,
        ...sightingHistory,
        characterId: targetId,
        nameComplex: characterNameComplex,
        nameSimple: characterNameSimple,
        nameDefinite: characterNameDefinite,
        nameIndefinite: characterNameIndefinite,
        allNames: characterAllNames,
        bond: isSelf ? 0 : (bond ? bond.bond : 0),
        bond2: isSelf ? 0 : (bond ? bond.bond2 : 0),
        stranger: isSelf ? false : (bond ? bond.stranger : true),
        perceivedGender: perception.canTellGender ? (genderStuffs?.genderAppearance || "unknown") : 'unknown',
        perceivedSex: perception.canTellGender ? (genderStuffs?.sex || "unknown") : 'unknown',
        pronouns: perception.canTellGender ? (genderStuffs?.pronouns || "unknown") : 'unknown',
        familyRelation,
        bondDescription,
        canTellHeight: perception.canTellHeight,
        canTellWeight: perception.canTellWeight,
        heightCm: perception.canTellHeight ? target.heightCm : 0,
        weightKg: perception.canTellWeight ? target.weightKg : 0,
        externalDescription: characterExternalDescription.description,
        externalDescriptionForUser: characterExternalDescription.descriptionForUser,
        placeAndPostureDescription: characterPlaceAndPostureDescription,
        perceptionForm,
        canTellDetailsOfClothingOrCarriedItems,
        carriedItemsIsUnclear: characterUnclearReason(perception, "carrying"),
        clothingIsUnclear: characterUnclearReason(perception, "wearing"),
        otherCarriedCharactersIsUnclear: characterUnclearReason(perception, "carriedOtherCharacters"),
        canTellOtherCarriedCharacters,
        carryingItems: canTellDetailsOfClothingOrCarriedItems ? characterCarryingItems.items : [],
        missingCarryingItems: canTellDetailsOfClothingOrCarriedItems ? characterCarryingItems.missingItems : [...characterCarryingItems.items, ...characterCarryingItems.missingItems],
        missingWearingItems: canTellDetailsOfClothingOrCarriedItems ? characterWearingItems.missingItems : [...characterWearingItems.items, ...characterWearingItems.missingItems],
        wearingItems: canTellDetailsOfClothingOrCarriedItems ? characterWearingItems.items : [],
        carryingOtherCharacters: canTellOtherCarriedCharacters ? carriedCharacters : [],
        missingCarryingOtherCharacters: canTellOtherCarriedCharacters ? [...carriedCharacters, ...missingCarriedCharacters] : [],
        states: states,
    };
}

/**
 * Reconstructs the relationship text the observer holds about the target, reusing the same bond
 * declarations that feed the character system prompts. Returns an empty string when no bond applies.
 * @param {DEObject} DE
 * @param {DECompleteCharacterReference} observer
 * @param {DECompleteCharacterReference} target
 * @returns {Promise<string>}
 */
async function buildBondDescription(DE, observer, target) {
    try {
        let bond = DE.bonds[observer.id]?.active.find(b => b.towards === target.id)
            || DE.bonds[observer.id]?.ex.find(b => b.towards === target.id)
            || null;
        if (!bond) {
            bond = /** @type {DESingleBondDescription} */ ({
                towards: target.id,
                stranger: true,
                bond: 0,
                bond2: 0,
                knowsAs: [],
                createdAt: DE.currentTime,
                seesAs: getPerceivedGenderOfCharacterFromPerspective(DE, observer, target),
                believesDead: false,
                undoableShifts: {},
            });
        }

        const bondDeclaration = getBondDeclarationFromBondDescription(DE, observer, bond);
        if (!bondDeclaration) {
            return '';
        }

        const familyRelation = getFamilyBondRelation(observer, target);
        const generalRelationship = await getRelationship(DE, observer, target);
        const templateInfo = {
            char: observer,
            other: target,
            otherFamilyRelation: familyRelation,
            otherRelationship: generalRelationship,
        };

        let result = typeof bondDeclaration.description === 'string'
            ? bondDeclaration.description
            : (await bondDeclaration.description(templateInfo)).trim();

        const selfRef = getNameIdentificationForOneCharacterTowardsAnother(DE, observer, observer);
        const otherRef = getNameIdentificationForOneCharacterTowardsAnother(DE, observer, target);

        if (bond.knowsAs.length === 0 && bond.stranger) {
            result += `\n\n${otherRef} is a stranger to ${selfRef}, ${selfRef} does not know their name.`;
        } else if (bond.knowsAs.length === 0) {
            result += `\n\n${otherRef} is an acquaintance to ${selfRef}, but ${selfRef} does not know their name!`;
        } else if (bond.stranger) {
            result += `\n\n${otherRef} is a stranger to ${selfRef}, but ${selfRef} knows their name and some details about them.`;
        } else {
            result += `\n\n${otherRef} is known to ${selfRef}, ${selfRef} knows their name and many details about them.`;
        }

        if (familyRelation) {
            result += `\n\n${otherRef} is ${selfRef}'s ${familyRelation}.`;
        }

        const isAttractive = DE.utils.bonds.isAttractedToWithReasoning(observer, target.id);
        if (isAttractive && isAttractive.reasoning) {
            result += `\n\n${isAttractive.reasoning}.`;
        }

        return result.trim();
    } catch (error) {
        console.warn(`Unable to build bond description from ${observer.id} towards ${target.id}`, error);
        return '';
    }
}

/**
 * Deep structural equality for arbitrary values (primitives, arrays and plain objects), used to
 * compare the non-recursive properties of two items in perspective.
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
function deepEqualInPerspective(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return a === b;

    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepEqualInPerspective(a[i], b[i])) return false;
        }
        return true;
    }

    if (typeof a === 'object') {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        for (const key of keysA) {
            if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
            if (!deepEqualInPerspective(a[key], b[key])) return false;
        }
        return true;
    }

    return false;
}

/**
 * Compares two lists of nested items (contents or items on top) in an order-independent way. Each
 * item in one list must have a unique identical counterpart in the other, where "identical" always
 * takes the amount into account because these are already-merged representatives at a deeper level.
 * @param {DEItemInPerspective[]} listA
 * @param {DEItemInPerspective[]} listB
 * @returns {boolean}
 */
function checkNestedItemListsAreIdenticalInPerspective(listA, listB) {
    if (listA.length !== listB.length) return false;
    const usedB = new Array(listB.length).fill(false);
    for (const a of listA) {
        let matched = false;
        for (let i = 0; i < listB.length; i++) {
            if (usedB[i]) continue;
            if (checkItemsAreIdenticalInPerspective(a, listB[i], false)) {
                usedB[i] = true;
                matched = true;
                break;
            }
        }
        if (!matched) return false;
    }
    return true;
}

/**
 * Recursively checks whether two items are indistinguishable from the observer's point of view,
 * comparing every property except the ones that merely identify the concrete instances (`ids`) and
 * the derived display string (`nameInAmount`). At the top level the amount may be ignored (two
 * singletons can merge into a stack), but once we descend into contents/items on top the amount is
 * always compared, so a container with three apples is not identical to one with two.
 * @param {DEItemInPerspective} itemA 
 * @param {DEItemInPerspective} itemB
 * @param {boolean} ignoreAmount
 * @returns {boolean}
 */
function checkItemsAreIdenticalInPerspective(itemA, itemB, ignoreAmount = true) {
    const propertiesToIgnore = ["ids", "nameInAmount"];
    const nestedItemKeys = ["ontop", "containing"];

    const a = /** @type {Record<string, any>} */ (itemA);
    const b = /** @type {Record<string, any>} */ (itemB);
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

    for (const key of keys) {
        if (propertiesToIgnore.includes(key)) continue;
        if (ignoreAmount && key === 'amount') continue;

        if (nestedItemKeys.includes(key)) {
            if (!checkNestedItemListsAreIdenticalInPerspective(a[key] || [], b[key] || [])) {
                return false;
            }
            continue;
        }

        if (!deepEqualInPerspective(a[key], b[key])) {
            return false;
        }
    }

    return true;
}

/**
 * Groups items that are indistinguishable from the observer's perspective into single
 * representatives, collecting every underlying id and tallying how many there are, so the UI can
 * render a single stack with a count. Nested contents and items on top must match exactly
 * (including their own amounts) for two items to be considered identical.
 * @param {DEItemInPerspective[]} items
 * @returns {DEItemInPerspective[]}
 */
function mergeIdenticalItemsInPerspective(items) {
    /** @type {DEItemInPerspective[]} */
    const merged = [];
    for (const item of items) {
        const representative = merged.find(existing => checkItemsAreIdenticalInPerspective(existing, item, true));
        if (representative) {
            representative.ids.push(...item.ids);
            representative.amount = representative.ids.length;
        } else {
            merged.push(item);
        }
    }
    return merged;
}

/**
 * Recursively builds the items an observer can make out from a raw item list, dropping anything
 * invisible to them and honouring whether they can peer inside or on top of each container.
 * @param {DEObject} DE
 * @param {string | null} parentItemId
 * @param {DEItem[]} items
 * @param {string} observerId
 * @param {string} locationId
 * @param {string} locationSlotId
 * @param {DEPerspective | null} previousPerspective
 * @param {Omit<DEConversationMessage, "id">} [relatedConversationMessage]
 * @returns {Promise<{items: DEItemInPerspective[], missingItems: DEItemInPerspective[]}>}
 */
export async function buildPerspectiveItems(DE, parentItemId, items, observerId, locationId, locationSlotId, previousPerspective, relatedConversationMessage) {
    const observer = DE.characters[observerId];
    if (!observer) {
        throw new Error(`Character ${observerId} not found.`);
    }

    const observerState = DE.stateFor[observerId];
    if (!observerState) {
        throw new Error(`Character state for ${observerId} not found.`);
    }
    if (!items.length) return { items: [], missingItems: [] };

    /** @type {DEItemInPerspective[]} */
    const canSeeItems = [];
    /** @type {DEItemInPerspective[]} */
    const missingItems = [];

    const lastPerspectiveOfObserver = previousPerspective === undefined
        ? await DE.database.getLastPerspectiveOfCharacter(observerId)
        : previousPerspective;

    for (const item of items) {
        const visibility = DE.utils.items.canSeeItem(item, observerId);

        const perception = DE.utils.items.whatCanTheyMakeOfAnItem(item, observerId);

        const canSeeContents = perception.canSeeContents === 'YES';
        const canSeeOntop = perception.canSeeOntop === 'YES';

        // factors that affect memory scoring

        // A unique item contributes two points.
        let max = 0;
        const isItemNonCommon = item.oneOfAKind ? 2 : 0;
        max += 2;
        // Owning the item contributes two points.
        const ownItem = item.owner === observerId ? 2 : 0;
        max += 2;
        // being in the same exact slot gives a point too
        const sameSlot = (locationId === observerState.location && observerState.locationSlot === locationSlotId) ? 1 : 0;
        max += 1;

        // these half points added by the message count do not count towards the max, they are just a bonus for being mentioned in the conversation
        const memorability = Math.min((isItemNonCommon + ownItem + sameSlot + (countIdentifierMentions(relatedConversationMessage, item.id) * 0.5)) / max, 2);

        // memorability then goes from 0 to 2

        const previousItem = findItemInPerspective(lastPerspectiveOfObserver, item.id);
        const retainedMemory = previousItem ? previousItem.memory : null;
        // Only time since a direct observation counts as continued exposure.
        const elapsed = lastPerspectiveOfObserver ? DE.currentTime.time - lastPerspectiveOfObserver.timeOfPerspective.time : 0;
        const isActivelyObserved = relatedConversationMessage?.content.some((c) => {
            return c.fragments.some((f) => {
                return typeof f !== "string" && f.type === "identifier" && f.identifiers.some((id) => id === item.id);
            });
        }) || false;
        const memory = calculatePerspectiveMemory(memorability, observer.attention ?? 0, previousPerspective,
            retainedMemory, elapsed, DE.currentTime.time, !isActivelyObserved);

        /** @type {DEItemInPerspective} */
        const node = {
            memory,
            description: item.description,
            maxVolumeOnTopLiters: item.maxVolumeOnTopLiters,
            volumeLiters: item.volumeLiters,
            weightKg: item.weightKg,
            owner: item.owner,
            maxWeightOnTopKg: item.maxWeightOnTopKg,
            oneOfAKind: item.oneOfAKind,
            metadata: item.metadata || {},
            name: item.name,
            state: item.state,
            carriableProperties: item.carriableProperties || {},
            classes: item.classes || [],
            communicator: item.communicator || null,
            consumableProperties: item.consumableProperties || null,
            containerProperties: item.containerProperties || null,
            relativePosition: item.relativePosition || null,
            wearableProperties: item.wearableProperties || null,
            ids: [
                {
                    id: item.id,
                    parent: parentItemId,
                },
            ],
            amount: 1,
            // will make these at the very end
            nameInAmount: "",
            ontop: [],
            containing: [],
            containingCharacters: [],
            ontopCharacters: [],
            missingContaining: [],
            missingOntop: [],
            canSeeContents,
            contentsIsUnclear: containerUnclearReason(item.containerProperties, item.state, perception, 'contents'),
            canSeeOntop,
            ontopIsUnclear: containerUnclearReason(item.containerProperties, item.state, perception, 'ontop'),
            canTellTheirVolume: perception.canTellTheirVolume,
            canTellTheirWeight: perception.canTellTheirWeight,
            missingContainingCharacters: [],
            missingOntopCharacters: [],
        };

        // When the observer cannot discern the exact item, obscure identifying detail the same way
        // the engine's item name/description formatters do for perceived-only items.
        if (!perception.canTellTheirExactDescription && observer) {
            const label = getPerceivedItemLabel(item, observer);
            node.name = label;
            node.description = `An indistinct ${label} whose details cannot be made out.`;
        }

        const contents = await buildPerspectiveItems(DE, item.id, item.containing || [], observerId, locationId, locationSlotId, lastPerspectiveOfObserver, relatedConversationMessage);
        const ontop = await buildPerspectiveItems(DE, item.id, item.ontop || [], observerId, locationId, locationSlotId, lastPerspectiveOfObserver, relatedConversationMessage);
        const containingCharacters = visibleCharacterIds(DE, item.containingCharacters, observerId);
        const ontopCharacters = visibleCharacterIds(DE, item.ontopCharacters, observerId);

        if (canSeeContents) {
            node.containing = contents.items;
            node.missingContaining = contents.missingItems;
            node.containingCharacters = containingCharacters.visibleCharacterIds;
            node.missingContainingCharacters = containingCharacters.invisibleCharacterIds;
        } else {
            node.missingContaining = [...contents.items, ...contents.missingItems];
            node.missingContainingCharacters = [...containingCharacters.visibleCharacterIds, ...containingCharacters.invisibleCharacterIds];
        }
        if (canSeeOntop) {
            node.ontop = ontop.items;
            node.missingOntop = ontop.missingItems;
            node.ontopCharacters = ontopCharacters.visibleCharacterIds;
            node.missingOntopCharacters = ontopCharacters.invisibleCharacterIds;
        } else {
            node.missingOntop = [...ontop.items, ...ontop.missingItems];
            node.missingOntopCharacters = [...ontopCharacters.visibleCharacterIds, ...ontopCharacters.invisibleCharacterIds];
        }

        if (visibility === 'invisible') {
            missingItems.push(node);
        } else {
            canSeeItems.push(node);
        }
    }

    const mergedMissingItems = mergeIdenticalItemsInPerspective(missingItems);
    const mergedCanSeeItems = mergeIdenticalItemsInPerspective(canSeeItems);

    for (const node of mergedCanSeeItems) {
        // Build the nameInAmount for each item after all children have been built, so that the nameInAmount of children is available to the parent.
        node.nameInAmount = utilItemCount(DE, locationId, !!node.oneOfAKind && node.ids.length === 1, node.owner, node.ids.length, node.name, node.ids[0].id, true, false, true);
    }

    for (const node of mergedMissingItems) {
        // Build the nameInAmount for each item after all children have been built, so that the nameInAmount of children is available to the parent.
        node.nameInAmount = utilItemCount(DE, locationId, !!node.oneOfAKind && node.ids.length === 1, node.owner, node.ids.length, node.name, node.ids[0].id, true, false, true);
    }

    return {
        items: mergedCanSeeItems,
        missingItems: mergedMissingItems,
    };
}

/**
 * @param {DEObject} DE
 * @param {Array<{ id: string }> | undefined} entries
 * @param {string} observerId
 * @returns {{visibleCharacterIds: string[], invisibleCharacterIds: string[]}}
 */
function visibleCharacterIds(DE, entries, observerId) {
    if (!entries) return { visibleCharacterIds: [], invisibleCharacterIds: [] };
    const visibleCharacterIds = [];
    const invisibleCharacterIds = [];
    for (const entry of entries) {
        const canSee = DE.utils.characterInfo.canSeeCharacter(entry.id, observerId);
        if (canSee !== 'invisible') {
            visibleCharacterIds.push(entry.id);
        } else {
            invisibleCharacterIds.push(entry.id);
        }
    }
    return { visibleCharacterIds, invisibleCharacterIds };
}

/**
 * @param {DEItem["containerProperties"]} containerProperties
 * @param {*} itemState
 * @param {DEItemPerception} perception
 * @param {'contents' | 'ontop'} kind
 * @returns {false | string}
 */
function containerUnclearReason(containerProperties, itemState, perception, kind) {
    const permission = kind === 'contents' ? perception.canSeeContents : perception.canSeeOntop;
    const where = kind === 'contents' ? 'inside' : 'what is on top';
    if (permission === 'YES') {
        return perception.hasHighPerception
            ? false
            : `Perception is not sharp enough; some ${kind === 'contents' ? 'contents' : 'items on top'} might be missing.`;
    }

    if (permission === 'NO_BECAUSE_CLOSED') return `It is ${containerProperties?.usesLock && itemState.locked ? 'locked' : 'closed'}, so ${where === "inside" ? "the inside" : where} cannot be seen.`;
    if (permission === 'NO_BECAUSE_BAD_VISION') return `Vision is not clear enough to see ${where}.`;
    if (permission === 'NO') return `Cannot see ${where}.`;
    // NOT_A_CONTAINER
    return false;
}

/**
 * @param {DECharacterPerception} perception
 * @param {'carrying' | 'wearing' | 'carriedOtherCharacters'} kind
 * @returns {false | string}
 */
function characterUnclearReason(perception, kind) {
    let permission;
    let where;
    if (kind === 'carrying') {
        permission = perception.canTellDetailsOfClothingOrCarriedItems;
        where = 'carried items';
    } else if (kind === 'wearing') {
        permission = perception.canTellDetailsOfClothingOrCarriedItems;
        where = 'worn items';
    } else if (kind === 'carriedOtherCharacters') {
        permission = perception.canTellOtherCarriedCharacters;
        where = 'other characters they might be carrying';
    }
    if (permission === 'YES') {
        return perception.hasHighPerception || perception.hasPerfectPerception
            ? false
            : `Perception is not sharp enough; some ${where} might be missing.`;
    }

    if (permission === 'NO_BECAUSE_BAD_VISION') return `Vision is not clear enough to see ${where}.`;
    if (permission === 'NO') return `Cannot see ${where}.`;
    return false;
}

/**
 * @param {DEObject} DE
 * @param {DECompleteCharacterReference} character
 */
async function getInformationAboutEnvironmentDeepPerspectiveWithMemories(DE, character) {
    const charState = DE.stateFor[character.id];
    if (!charState) {
        throw new Error(`Character state for ${character.id} not found.`);
    }


}
