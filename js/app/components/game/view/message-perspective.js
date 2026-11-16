/** Select the snapshot for one displayed narration, thought or dialogue fragment.
 * @param {DEConversationMessage | null} message
 * @param {string} userId
 * @param {number} index
 */
export function selectMessagePerspective(message, userId, index) {
    const info = message?.perspectiveByCharacterId?.[userId];
    const contents = message?.perspectiveMessageByCharacterId?.[userId] || [];
    const isAfter = contents.length > 0 && index === contents.length - 1 && !!info?.after;
    return { id: (isAfter ? info.after : info?.before) || '', isAfter };
}

/** Entering the player's turn requires the terminal message's actual after snapshot.
 * @param {DEConversationMessage | null} message
 * @param {string} userId
 * @param {number} index
 * @param {string} loadedId
 * @param {boolean} [hasNextMessage]
 */
export function isWaitingForAfter(message, userId, index, loadedId, hasNextMessage = false) {
    if (hasNextMessage) return false;
    const contents = message?.perspectiveMessageByCharacterId?.[userId] || [];
    if (!contents.length || index !== contents.length - 1) return false;
    const after = message?.perspectiveByCharacterId?.[userId]?.after;
    return !after || loadedId !== after;
}

/** Only actual changes with descriptions become notifications (older saves may lack changes).
 * @param {DEPerspective['changes'] | undefined} changes
 * @returns {Array<{label: string, description: string}>}
 */
export function getChangeNotifications(changes) {
    if (!changes) return [];
    const entries = [];
    if (changes.timeForwards?.time?.inSeconds > 0) {
        entries.push({ label: 'Time passes', description: changes.timeForwards.description });
    }
    if (changes.atNewLocation?.case) {
        entries.push({ label: 'Location', description: changes.atNewLocation.description });
    }
    const groups = /** @type {const} */ ([
        ['justStartedSpeakingWith', 'Conversation'], ['charactersArrived', 'Arrival'],
        ['charactersLeft', 'Departure'], ['charactersMoved', 'Movement'],
        ['itemsDroppedByCharacters', 'Item dropped'], ['itemsPickedUpByCharacters', 'Item acquired'],
        ['itemsMoved', 'Item moved'],
    ]);
    for (const [key, label] of groups) {
        for (const entry of changes[key] || []) entries.push({ label, description: entry.description });
    }
    return entries.filter(entry => entry.description?.trim());
}
