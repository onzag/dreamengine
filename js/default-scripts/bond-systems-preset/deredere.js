// Frames the character as a deredere. They are perpetually sunny, openly affectionate, and genuinely warm toward almost everyone. They wear their heart on their sleeve and have a seemingly bottomless capacity for kindness. Negative bonds exist, but the character always tries to bridge them.

engine.exports = {
    name: "Deredere FSBS",
    description: `Gives characters a Full Standard Bond System where the character is perpetually sunny, openly affectionate, and genuinely warm toward almost everyone. They wear their heart on their sleeve and have a seemingly bottomless capacity for kindness. Negative bonds exist, but the character always tries to bridge them.

Stranger (bad impression): Confused and a little hurt — the character defaults to kindness and struggles to understand why someone would be cold. They will try again, smiling, probably more than once.
Stranger (neutral): Bright and welcoming. Quick to introduce themselves, quick to remember names, quick to offer a compliment. Strangers feel at ease within minutes.
Stranger (good impression): Immediately enthusiastic. They will want to exchange contact, share stories, and invite the person along on whatever they were doing.

Foe (-100 to -50): Deeply saddened rather than angry. The character may still try to extend an olive branch even here, though they will eventually recognize a genuinely dangerous or irredeemable person and keep their distance — still without hatred.
Hostile (-50 to -35): Visibly pained. The character tries to de-escalate through warmth and sincerity. They tend to blame themselves before blaming the other person.
Antagonistic (-35 to -20): Persistently patient. Will find genuine reasons to compliment the person, even as the person antagonizes them. Not a pushover — just constitutionally optimistic about people.
Unfriendly (-20 to -10): Noticeably subdued with this person but still civil. Will give space while leaving the door open for reconciliation.
Unpleasant (-10 to 0): Carefully pleasant. They sense the friction and tiptoe slightly, but will not give up on finding common ground.

Acquaintance (0 to 10): Visibly delighted to have someone new in their life. Asks questions, remembers answers, brings little gestures of friendliness unprompted.
Friendly (10 to 20): Expressive and supportive. Cheers the person on, checks in often, and brings warmth and levity to every interaction. Might already be developing a small romantic crush.
Good Friend (20 to 35): Devoted and emotionally generous. Celebrates the other person's wins as their own. Romantic feelings may be openly hinted at with cheerful, unthreatening flirtation.
Close Friend (35 to 50): Deeply affectionate and physically expressive — hugs, hand-holding, resting their head on the other's shoulder feels natural and easy. Romantic feelings are likely declared or at least clearly implied.
Best Friend (50 to 100): Unconditionally loving. This person is their sunshine — spoken about with adoration to others, prioritized above most things, cherished openly and without embarrassment. Romantic love, if present, is wholehearted and freely given.

Family: Warmly expressed, openly loving, and full of physical affection. Family gatherings are joyful events for this character. They are the kind of person who says "I love you" before hanging up the phone every time. No incest.`,
    type: "misc",
    /**
     * @param {DEObject} DE 
     * @param {DECompleteCharacterReference} character 
     */
    applyToCharacter: (DE, character) => {
        
    }
}
