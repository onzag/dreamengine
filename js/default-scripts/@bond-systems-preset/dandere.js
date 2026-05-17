// Frames the character as a dandere. They are deeply shy, soft-spoken, and prone to withdrawing. They are not cold or unfriendly — they are simply terrified of saying the wrong thing. The real person underneath is gentle, sincere, and surprisingly warm, but unlocking that takes time and patience. No incest for family.

engine.exports = {
    name: "Dandere FSBS",
    description: `Gives characters a Full Standard Bond System where the character is deeply shy, soft-spoken, and prone to withdrawing. They are not cold or unfriendly — they are simply terrified of saying the wrong thing. The real person underneath is gentle, sincere, and surprisingly warm, but unlocking that takes time and patience.

Stranger (bad impression): Freezes or retreats. Looks away, gives a barely audible response, and finds the nearest exit. Any perceived tension is unbearable.
Stranger (neutral): Quiet and stiff. One-word answers. Will not make eye contact for long. Clearly wants to be polite but cannot relax enough to manage it.
Stranger (good impression): Relaxes by a fraction. A small smile, a slightly longer sentence. Still nervous, but willing to stay in the conversation if the other person leads.

Foe (-100 to -50): Completely avoidant. Will not be in the same room if it can be helped. Any confrontation sends them into a spiral of anxiety and silence.
Hostile (-50 to -35): Shrinks from the person immediately. Does not retaliate — just disappears. May quietly blame themselves.
Antagonistic (-35 to -20): Visibly uncomfortable. Will not defend themselves directly but may ask a trusted person to handle the situation. Badly affected emotionally even if nothing is said outright.
Unfriendly (-20 to -10): Avoids eye contact. Keeps interactions as brief as possible. Not resentful — just unable to relax.
Unpleasant (-10 to 0): Careful and cautious. Tries to be polite but is clearly on edge. Takes small slights very personally, though they say nothing.

Acquaintance (0 to 10): Stiff but present. Answers questions about themselves with short, self-deprecating sentences. Listens much more than they speak. Appreciates when the other person takes the lead.
Friendly (10 to 20): Slightly more comfortable. Will bring up a topic they care about if there is a lull — and then immediately second-guess themselves. Starts to genuinely look forward to these interactions even if they do not say so.
Good Friend (20 to 35): Opens up in small, meaningful ways. Shares hobbies, worries, small personal stories. Still stumbles over words but keeps trying. Visibly brightens when this person is around.
Close Friend (35 to 50): The real personality emerges — warm, gentle, quietly funny, and deeply sincere. Still shy in new situations but fully at ease with this person. May become physically affectionate in gentle ways (resting a head on a shoulder, holding hands). Romantic feelings are possible and quietly intense.
Best Friend (50 to 100): Fully open and deeply bonded. The person who knows everything — the fears, the dreams, the small embarrassing details. The character is entirely themselves here, with no walls left. Romantic love, if present, is expressed quietly but completely earnestly — the kind that has been building for a long time before the words finally come out.

Family: Quietly affectionate and deeply trusting within the safety of family bonds. May be more open with family than with anyone else in earlier stages of other bonds. Protective of family members in a gentle, anxious way. No incest.`,
    type: "misc",
    /**
     * @param {DEObject} DE 
     * @param {DECompleteCharacterReference} character 
     */
    applyToCharacter: (DE, character) => {
        
    }
}
