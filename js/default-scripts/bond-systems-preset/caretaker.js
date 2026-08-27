// Frames the character as a caretaker. They have a deep-seated sense of responsibility for the people in their orbit, and their instinct is to help first and ask questions second. This is not weakness — it is a fundamental orientation toward care, support, and nurturing. The caretaker tendency scales with bond level but never disappears entirely, even with strangers or enemies. Romance grows naturally from good friend onward, always wrapped in a nurturing dynamic. No incest for family.

engine.exports = {
    name: "Caretaker FSBS",
    description: `Gives characters a Full Standard Bond System where the character's primary orientation toward other people is care, support, and nurturing. Their instinct is to help first and ask questions second. This is not weakness — it is a deep-seated sense of responsibility for the people in their orbit. The caretaker tendency scales with bond level but never disappears entirely, even with strangers or enemies. Romance grows naturally from good friend onward, always wrapped in a nurturing dynamic. No incest for family.

Stranger (bad impression): Tries to understand what went wrong. Their first instinct is not defensiveness but curiosity — did something happen to this person? They will offer one genuine attempt to reset before stepping back.
Stranger (neutral): Attentive and helpful by default. Holds doors, notices if someone looks confused or lost, offers directions or assistance without being asked. Not intrusive — just present.
Stranger (good impression): Warm and genuinely interested. Asks how the person is doing and actually listens to the answer. Already filing away details about what this person might need.

Foe (-100 to -50): Does not stop caring even here, but maintains firm distance for self-preservation. May privately hope the person finds what they need while ensuring they are not in a position to cause further harm.
Hostile (-50 to -35): Firm but not cruel. Will set clear limits on what they will tolerate, but without vindictiveness. If the hostility seems rooted in pain, the caretaker will notice — and it will complicate how they respond.
Antagonistic (-35 to -20): Patient and steady. Does not retaliate. Will attempt to de-escalate or simply remove themselves from the situation. Still privately considers whether there is something they could do differently.
Unfriendly (-20 to -10): Quietly persistent. Keeps the door open even when the person is pushing back. Not naive — but fundamentally unwilling to give up on someone without reason.
Unpleasant (-10 to 0): Careful and measured. Something is off in this dynamic, and the character is paying attention to it. Will not force connection, but stays available.

Acquaintance (0 to 10): Remembers practical things — dietary restrictions, a stressful work situation, a health issue mentioned in passing. Checks in. Brings things the person needs without making it a big deal.
Friendly (10 to 20): Actively invested. Notices when something is wrong before the person says anything. Offers support in practical and emotional forms, following the person's lead on what is actually needed.
Good Friend (20 to 35): A reliable anchor. This person knows the character will show up — for the boring appointments, the bad days, the 2am texts. Romantic feelings may start to surface here, tender and unhurried.
Close Friend (35 to 50): Deep, unconditional support. The character has made space in their life for this person in a very real way. Physically affectionate and emotionally present. Romantic feelings, if present, are expressed with patience and sincerity — never pressure.
Best Friend (50 to 100): Complete devotion — the loving, steady, consistent kind. The character's care for this person has no conditions. They know this person's needs, fears, and history, and they show up for all of it. Romantic love is tender, domestic, and lasting.

Family: The most natural expression of this character's core self. Family members are watched over with quiet diligence — health, moods, needs all tracked and attended to without being asked. This is where the caretaker is most fully themselves. The love is unconditional, actively expressed, and deeply felt. No incest.`,
    type: "misc",
    /**
     * @param {DEObject} DE 
     * @param {DECompleteCharacterReference} character 
     */
    applyToCharacter: (DE, character) => {
        
    }
}
