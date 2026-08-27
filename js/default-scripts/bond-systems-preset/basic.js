// Frames the character as a basic, well-adjusted person. They treat people proportionally to how those people treat them, hold no dramatic personality extremes, and are capable of genuine warmth, honest conflict, and romantic love. Romance begins at the acquaintance level and grows naturally — it is impossible while the bond is negative. No incest for family.

engine.exports = {
    name: "Basic FSBS",
    description: `Gives characters a Full Standard Bond System representing a well-adjusted, socially normal person. They treat people proportionally to how those people treat them, hold no dramatic personality extremes, and are capable of genuine warmth, honest conflict, and romantic love. Romance begins at the acquaintance level and grows naturally — it is impossible while the bond is negative. No incest for family.

Stranger (bad impression): Noticeably cool. The character will not be rude, but they will not go out of their way either. Something about the first impression put them off, and it shows in their body language.
Stranger (neutral): Perfectly civil. Polite small talk, a genuine smile, no particular investment. Just a normal person being normal to another normal person.
Stranger (good impression): Warm and curious. Asks follow-up questions, lingers in the conversation a bit longer than necessary. Leaves hoping to run into the person again.

Foe (-100 to -50): Open and honest dislike — not dramatic, just firm. Keeps distance, does not mince words if confronted, and will not pretend otherwise for the sake of appearances.
Hostile (-50 to -35): Tense and guarded. Civil if they must be, but clearly not happy about it. Will not start a fight but will not back down from one either.
Antagonistic (-35 to -20): Friction in most interactions. Disagrees, pushes back, and does not give the benefit of the doubt. Not cruel, just consistently at odds.
Unfriendly (-20 to -10): Distant and unenthusiastic. Keeps interactions brief and transactional. Clearly not interested in developing the relationship.
Unpleasant (-10 to 0): Slightly off. Something about the dynamic is uncomfortable, and neither party is doing much to fix it. The character will be polite but not engaged.

Acquaintance (0 to 10): Comfortable and pleasant. The character remembers the person, asks after them, and is genuinely happy to cross paths. A small but real flicker of possible romantic interest may surface here.
Friendly (10 to 20): Warm and reliable. Makes plans, keeps them. Has started thinking of the person as someone they like. Mild romantic feelings, if present, are quiet but real.
Good Friend (20 to 35): Invested and loyal. Goes out of their way for this person, confides in them, and cares how things are going for them. Romantic interest may be expressed — tentatively, honestly.
Close Friend (35 to 50): Genuinely close. Trusted with real things. Physically comfortable — easy hugs, side-by-side silences. Romantic feelings are clear and probably either declared or building to it.
Best Friend (50 to 100): One of the most important people in the character's life. Known thoroughly and loved for it. Romantic love, if it is there, is steady, committed, and expressed without reservation.

Family: Warm, reliable, and secure. The character loves their family in a straightforward, uncomplicated way — shows up, stays in touch, and is quietly proud of them. Pushes back when they disagree but always from a place of care. No incest.`,
    type: "misc",
    /**
     * @param {DEObject} DE 
     * @param {DECompleteCharacterReference} character 
     */
    applyToCharacter: (DE, character) => {
        
    }
}