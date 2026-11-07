import {
    getListOfCarriedCharactersByCharacter,
    getExternalDescriptionOfCharacter,
    getInternalDescriptionOfCharacter,
    getBondDeclarationFromBondDescription,
    getFamilyBondRelation,
    getRelationship,
    getExternalDescriptionOfCharacterPostureOnly,
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
 * @param {Omit<DEConversationMessage, "id">} [relatedConversationMessage]
 * @returns {Promise<DECharacterPerspective>}
 */
export async function getPerspective(DE, character, relatedConversationMessage) {
    const ownId = typeof character === 'string' ? character : character.id;
    const ownChar = DE.characters[ownId];
    if (!ownChar) {
        throw new Error(`Character ${ownId} not found.`);
    }
    const ownState = DE.stateFor[ownId];
    if (!ownState) {
        throw new Error(`Character state for ${ownId} not found.`);
    }

    const locationId = ownState.location;
    const location = DE.world.locations[locationId];
    if (!location) {
        throw new Error(`Location ${locationId} not found.`);
    }
    const slotId = ownState.locationSlot;
    const slot = location.slots[slotId] || null;

    const self = await buildPerspectiveCharacter(DE, ownId, ownId, 'visible', relatedConversationMessage);
    const ownLocation = await buildPerspectiveLocation(DE, locationId, ownId, relatedConversationMessage);

    const allConversationsAtLocation = await DE.utils.conversations.getAllConversationsAtLocation(locationId);

    const locationPerception = DE.utils.world.whatCanTheyMakeOfALocation(locationId, ownId);

    const canSeeCharacters = !locationPerception.cantSee;
    const observerName = DE.utils.templates.formatCharacterName(ownChar, ownChar, { capitalize: true, justName: true });

    /**
     * @type {DESocialGroupInPerspective}
     */
    const result = {
        soloCharacters: [],
        canSeeCharacters,
        characterListsAreUnclear: unclearReason(locationPerception, observerName, 'characters'),
        otherGroups: [],
        ownGroup: [],
    };

    // now we need to check with each character to see if we can actually see them
    for (const soloCharId of allConversationsAtLocation.leftoverCharacters) {
        if (soloCharId === ownId) continue;
        const canSeeThem = DE.utils.characterInfo.canSeeCharacter(soloCharId, ownId);
        if (canSeeThem !== "invisible") {
            result.soloCharacters.push(await buildPerspectiveCharacter(DE, soloCharId, ownId, canSeeThem, relatedConversationMessage));
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
                for (const { id: participantId, visibility } of actualIdsOfVisibleParticipants) {
                    result.ownGroup.push(await buildPerspectiveCharacter(DE, participantId, ownId, visibility, relatedConversationMessage));
                }
            } else if (actualIdsOfVisibleParticipants.length === 1) {
                result.soloCharacters.push(await buildPerspectiveCharacter(DE, actualIdsOfVisibleParticipants[0].id, ownId, actualIdsOfVisibleParticipants[0].visibility, relatedConversationMessage));
            } else {
                const otherGroup = [];
                for (const { id: participantId, visibility } of actualIdsOfVisibleParticipants) {
                    otherGroup.push(await buildPerspectiveCharacter(DE, participantId, ownId, visibility, relatedConversationMessage));
                }
                result.otherGroups.push(otherGroup);
            }
        }
    }

    return {
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
        socialGroups: result,
        timeOfPerspective: { ...DE.currentTime },
    };
}

/**
 * @param {DEObject} DE
 * @param {string} locationId
 * @param {string} observerId
 * @returns {Promise<DECharacterPerspectiveLocation>}
 * @param {Omit<DEConversationMessage, "id">} [relatedConversationMessage]
 */
async function buildPerspectiveLocation(DE, locationId, observerId, relatedConversationMessage) {
    const location = DE.world.locations[locationId];
    if (!location) {
        throw new Error(`Location ${locationId} not found.`);
    }

    const slots = [];
    for (const slotId of Object.keys(location.slots)) {
        slots.push(await buildPerspectiveLocationSlot(DE, locationId, slotId, observerId, relatedConversationMessage));
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
 * @returns {Promise<DECharacterPerspectiveLocationSlot>}
 * @param {Omit<DEConversationMessage, "id">} [relatedConversationMessage]
 */
async function buildPerspectiveLocationSlot(DE, locationId, slotId, observerId, relatedConversationMessage) {
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

    const items = await buildPerspectiveItems(DE, null, slot.items || [], observerId, locationId, slotId, relatedConversationMessage);

    // Characters at this slot, excluding the observer, that the observer can at least perceive.
    /** @type {DECharacterPerspectiveCharacter[]} */
    const characters = [];
    const slotCharacterIds = DE.utils.world.getCharacterIdsAtLocationSlot(slotId);
    for (const charId of slotCharacterIds) {
        if (charId === observerId) continue;
        const visibility = DE.utils.characterInfo.canSeeCharacter(charId, observerId);
        if (visibility === 'invisible') continue;
        characters.push(await buildPerspectiveCharacter(DE, charId, observerId, visibility, relatedConversationMessage));
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
        canSeeItems,
        itemListsAreUnclear: unclearReason(locationPerception, observerName, 'items'),
        characters,
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
 * @param {'visible' | 'perceived'} perceptionForm
 * @returns {Promise<DECharacterPerspectiveCharacter>}
 * @param {Omit<DEConversationMessage, "id">} [relatedConversationMessage]
 */
async function buildPerspectiveCharacter(DE, targetId, observerId, perceptionForm, relatedConversationMessage) {
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

    const characterCarryingItems = perception.canTellDetailsOfClothingOrCarriedItems ? await buildPerspectiveItems(DE, null, targetState.carrying || [], observerId, targetState.location, targetState.locationSlot, relatedConversationMessage) : [];
    const characterWearingItems = perception.canTellDetailsOfClothingOrCarriedItems ? await buildPerspectiveItems(DE, null, targetState.wearing || [], observerId, targetState.location, targetState.locationSlot, relatedConversationMessage) : [];

    const carriedCharacters = getListOfCarriedCharactersByCharacter(DE, targetId)
        .map(c => c.carriedId)
        .filter(carriedId => isSelf || DE.utils.characterInfo.canSeeCharacter(carriedId, observerId) !== 'invisible');

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

            if (target.sex !== "none" && target.sex !== "intersex" && target.sex !== target.gender) {
                states.push({
                    type: "INTERNAL",
                    stateName: "Transgender",
                    dominant: true,
                });
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

    // 0 no memory
    // 1 minute memory
    // 2 day memory
    // 3 week memory
    // 4 month memory
    // 5 forever memory (more or less)

    // now we need to apply attention, this will indeed cause a rather small number
    // eg for same location with observer, in conversation and a good bond they could get 0.6 or something akin
    // with attention applied they get 0.35 further memory per hour (for a normal person)
    // eg2 for same location slot with a stranger, they could get 0.14 at most
    const attentionAffectedMemorability = memorability * (observer.attention ?? 0);

    // the attention baseline is the baseline imprinting effect of the memory
    // we will double the value, eg. this very memorable friend meetup will have a baseline of 0.7 * 10, which is 7 and then halving it gives 3.5
    // after rounding this means they will remember for a month
    // the stranger with 0.14 * 10 = 1.4, halving gives 0.7, rounding gives 1, which is a minute memory, which is correct for a stranger just passing by
    let attentionBaseLine = Math.round((memorability * 10) * (observer.attention ?? 0));
    if (attentionBaseLine > 5) {
        attentionBaseLine = 5;
    }

    // now we need to figure out the actual value by fetching our previous, so ironically we need to fetch the previous perspective and see how many hours have passed
    // since that previous perspective and this one, provided the character was there too, if it was, then we will increase the memory score by
    // attentionAffectedMemorability per hour of the last perspective, therefore it increases the memory score, unless it is lower than attentionBaseLine, in which case we will set it to attentionBaseLine
    const lastPerspectiveOfObserver = await DE.database.getLastPerspectiveOfCharacter(observerId);

    let expectedLevel = /** @type {0 | 1 | 2 | 3 | 4 | 5} */ (attentionBaseLine);
    let expectedSoftLevel = attentionBaseLine;

    if (lastPerspectiveOfObserver) {
        const characterInfo = lastPerspectiveOfObserver.socialGroups.soloCharacters.find(c => c.characterId === targetId) ||
            lastPerspectiveOfObserver.socialGroups.ownGroup.find(c => c.characterId === targetId) ||
            lastPerspectiveOfObserver.socialGroups.otherGroups.flat().find(c => c.characterId === targetId);

        const diffTimeInHours = (DE.currentTime.time - lastPerspectiveOfObserver.timeOfPerspective.time) / (1000 * 60 * 60);

        if (characterInfo) {
            expectedSoftLevel = characterInfo.memory.softLevel + (attentionAffectedMemorability * diffTimeInHours);
            if (expectedSoftLevel > 5) {
                expectedSoftLevel = 5;
            }
            if (expectedSoftLevel < attentionBaseLine) {
                expectedSoftLevel = attentionBaseLine;
            }
            // @ts-ignore
            expectedLevel = Math.round(expectedSoftLevel);
        }
    }

    return {
        characterMetadata: target.metadata || {},
        memory: { level: expectedLevel, softLevel: expectedSoftLevel },
        characterId: targetId,
        characterNameComplex,
        characterNameSimple,
        characterNameDefinite,
        characterNameIndefinite,
        characterAllNames,
        bond: isSelf ? 0 : (bond ? bond.bond : 0),
        bond2: isSelf ? 0 : (bond ? bond.bond2 : 0),
        stranger: isSelf ? false : (bond ? bond.stranger : true),
        perceivedGender: perception.canTellGender ? target.gender : 'unknown',
        familyRelation,
        bondDescription,
        canTellHeight: perception.canTellHeight,
        canTellWeight: perception.canTellWeight,
        characterHeightCm: perception.canTellHeight ? target.heightCm : 0,
        characterWeightKg: perception.canTellWeight ? target.weightKg : 0,
        characterExternalDescription,
        characterPlaceAndPostureDescription,
        perceptionForm,
        canTellDetailsOfClothingOrCarriedItems: perception.canTellDetailsOfClothingOrCarriedItems,
        characterCarryingItems,
        characterWearingItems,
        characterCarryingOtherCharactersIds: carriedCharacters,
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
 * Find an item by its concrete ID in a snapshot, including stacks and nested items.
 * @param {DECharacterPerspective} perspective
 * @param {string} itemId
 * @returns {DEItemInPerspective | null}
 */
function findItemInPerspective(perspective, itemId) {
    /** @param {DEItemInPerspective[]} items @returns {DEItemInPerspective | null} */
    function findInItems(items) {
        for (const item of items) {
            if (item.ids.some(entry => entry.id === itemId)) return item;
            const nested = findInItems(item.containing) || findInItems(item.ontop);
            if (nested) return nested;
        }
        return null;
    }
    /** @param {DECharacterPerspectiveCharacter} character @returns {DEItemInPerspective | null} */
    function findOnCharacter(character) {
        return findInItems(character.characterCarryingItems) || findInItems(character.characterWearingItems);
    }
    const ownItem = findOnCharacter(perspective.self);
    if (ownItem) return ownItem;
    for (const slot of perspective.ownLocation.slots) {
        const item = findInItems(slot.items);
        if (item) return item;
        for (const character of slot.characters) {
            const carriedItem = findOnCharacter(character);
            if (carriedItem) return carriedItem;
        }
    }
    const groups = perspective.socialGroups;
    for (const character of [...groups.soloCharacters, ...groups.ownGroup, ...groups.otherGroups.flat()]) {
        const item = findOnCharacter(character);
        if (item) return item;
    }
    return null;
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
 * @returns {Promise<DEItemInPerspective[]>}
 * @param {Omit<DEConversationMessage, "id">} [relatedConversationMessage]
 */
async function buildPerspectiveItems(DE, parentItemId, items, observerId, locationId, locationSlotId, relatedConversationMessage) {
    const observer = DE.characters[observerId];
    if (!observer) {
        throw new Error(`Character ${observerId} not found.`);
    }

    const observerState = DE.stateFor[observerId];
    if (!observerState) {
        throw new Error(`Character state for ${observerId} not found.`);
    }
    if (!items.length) return [];

    /** @type {DEItemInPerspective[]} */
    const result = [];

    const lastPerspectiveOfObserver = await DE.database.getLastPerspectiveOfCharacter(observerId);

    for (const item of items) {
        const visibility = DE.utils.items.canSeeItem(item, observerId);
        if (visibility === 'invisible') continue;

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
        const memorability = (isItemNonCommon + ownItem + sameSlot + (countIdentifierMentions(relatedConversationMessage, item.id) * 0.5)) / max;

        // 0 no memory
        // 1 minute memory
        // 2 day memory
        // 3 week memory
        // 4 month memory
        // 5 forever memory (more or less)

        // now we need to apply attention, this will indeed cause a rather small number
        // eg for same location with observer, in conversation and a good bond they could get 0.6 or something akin
        // with attention applied they get 0.35 further memory per hour (for a normal person)
        // eg2 for same location slot with a stranger, they could get 0.14 at most
        const attentionAffectedMemorability = memorability * (observer.attention ?? 0);

        // the attention baseline is the baseline imprinting effect of the memory
        // we will double the value, eg. this very memorable friend meetup will have a baseline of 0.7 * 10, which is 7 and then halving it gives 3.5
        // after rounding this means they will remember for a month
        // the stranger with 0.14 * 10 = 1.4, halving gives 0.7, rounding gives 1, which is a minute memory, which is correct for a stranger just passing by
        let attentionBaseLine = Math.round((memorability * 10) * (observer.attention ?? 0));
        if (attentionBaseLine > 5) {
            attentionBaseLine = 5;
        }

        // now we need to figure out the actual value by fetching our previous, so ironically we need to fetch the previous perspective and see how many hours have passed
        // since that previous perspective and this one, provided the character was there too, if it was, then we will increase the memory score by
        // attentionAffectedMemorability per hour of the last perspective, therefore it increases the memory score, unless it is lower than attentionBaseLine, in which case we will set it to attentionBaseLine

        let expectedLevel = /** @type {0 | 1 | 2 | 3 | 4 | 5} */ (attentionBaseLine);
        let expectedSoftLevel = attentionBaseLine;

        if (lastPerspectiveOfObserver) {
            const itemInfo = findItemInPerspective(lastPerspectiveOfObserver, item.id);

            const diffTimeInHours = (DE.currentTime.time - lastPerspectiveOfObserver.timeOfPerspective.time) / (1000 * 60 * 60);

            if (itemInfo) {
                expectedSoftLevel = itemInfo.memory.softLevel + (attentionAffectedMemorability * diffTimeInHours);
                if (expectedSoftLevel > 5) {
                    expectedSoftLevel = 5;
                }
                if (expectedSoftLevel < attentionBaseLine) {
                    expectedSoftLevel = attentionBaseLine;
                }
                // @ts-ignore
                expectedLevel = Math.round(expectedSoftLevel);
            }
        }

        /** @type {DEItemInPerspective} */
        const node = {
            memory: { level: expectedLevel, softLevel: expectedSoftLevel },
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
            canSeeContents,
            contentsIsUnclear: containerUnclearReason(item.containerProperties, item.state, perception, 'contents'),
            canSeeOntop,
            ontopIsUnclear: containerUnclearReason(item.containerProperties, item.state, perception, 'ontop'),
        };

        // When the observer cannot discern the exact item, obscure identifying detail the same way
        // the engine's item name/description formatters do for perceived-only items.
        if (!perception.canTellTheirExactDescription && observer) {
            const label = getPerceivedItemLabel(item, observer);
            node.name = label;
            node.description = `An indistinct ${label} whose details cannot be made out.`;
        }
        if (!perception.canTellTheirVolume) node.volumeLiters = 0;
        if (!perception.canTellTheirWeight) node.weightKg = 0;

        if (canSeeContents) {
            node.containing = await buildPerspectiveItems(DE, item.id, item.containing || [], observerId, locationId, locationSlotId, relatedConversationMessage);
            node.containingCharacters = visibleCharacterIds(DE, item.containingCharacters, observerId);
        }
        if (canSeeOntop) {
            node.ontop = await buildPerspectiveItems(DE, item.id, item.ontop || [], observerId, locationId, locationSlotId, relatedConversationMessage);
            node.ontopCharacters = visibleCharacterIds(DE, item.ontopCharacters, observerId);
        }

        result.push(node);
    }

    const mergedResult = mergeIdenticalItemsInPerspective(result);

    for (const node of mergedResult) {
        // Build the nameInAmount for each item after all children have been built, so that the nameInAmount of children is available to the parent.
        node.nameInAmount = utilItemCount(DE, locationId, !!node.oneOfAKind && node.ids.length === 1, node.owner, node.ids.length, node.name, node.ids[0].id, true, false, true);
    }

    return mergedResult;
}

/**
 * @param {DEObject} DE
 * @param {Array<{ id: string }> | undefined} entries
 * @param {string} observerId
 * @returns {string[]}
 */
function visibleCharacterIds(DE, entries, observerId) {
    if (!entries) return [];
    return entries
        .map(entry => entry.id)
        .filter(id => DE.utils.characterInfo.canSeeCharacter(id, observerId) !== 'invisible');
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
