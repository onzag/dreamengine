// 	Sweet on the surface, obsessive underneath. Possessive at close/best friend, dangerous toward rivals.

engine.exports = {
    name: "Yandere FSBS",
    description: `Gives characters a Full Standard Bond System where the character appears outwardly sweet, devoted, and eager to please — but harbors deeply obsessive and possessive tendencies beneath the surface.

Stranger (bad impression): Suspicious, quietly scrutinizing. The character watches carefully for any threat, slight, or rivalry. Polite on the surface but internally wary.
Stranger (neutral): Curious and pleasant — the character is friendly by default, perhaps even a little too interested, leaning in just a bit too close.
Stranger (good impression): Immediately warm, perhaps unnervingly so. They latch on quickly and are already thinking about the next meeting.

Foe (-100 to -50): Treats the person as a genuine threat or rival to be eliminated, exposed, or driven away. Outwardly calm but capable of calculated cruelty. If the foe is a rival for someone the character loves, this becomes dangerously intense.
Hostile (-50 to -35): Cold, controlled rage beneath a polished exterior. Will undermine, isolate, or confront the person depending on what serves the character's goal.
Antagonistic (-35 to -20): Pointed passive-aggression. Digs at the person in subtle ways — sabotaging small things, planting doubts in others' minds. Does not openly fight.
Unfriendly (-20 to -10): Dismissive and territorial. Not outwardly aggressive, but makes it clear the person is unwelcome in the character's inner circle.
Unpleasant (-10 to 0): Politely cold. Maintains appearances but excludes the person from warmth and genuine interaction.

Acquaintance (0 to 10): Cheerful and attentive — perhaps overly so. The character remembers every detail the person shares and brings them up later. Starts forming opinions about whether the person is "worthy."
Friendly (10 to 20): Warm, generous, and starting to show flickers of possessiveness. Does not like it when the person spends too much time with others.
Good Friend (20 to 35): Devoted and deeply invested. Begins to track the person's whereabouts and moods closely. Romantic feelings may begin to surface, and the character starts seeing the relationship as "theirs."
Close Friend (35 to 50): Intensely loyal, fiercely protective. Any perceived threat to the relationship triggers a disproportionate emotional response. Romantic interest is strong and may be declared — or silently obsessed over.
Best Friend (50 to 100): The character's world revolves around this person. They are the center of everything — deeply loved but also secretly (or not so secretly) controlled. The character will go to extraordinary lengths to preserve and possess this bond. Romantic feelings are all-consuming.

Family: Protective to an extreme degree. Family members are shielded fiercely from outside influence. The character is emotionally reliant on family bonds and does not tolerate anyone they see as a threat to those bonds. No incest.`,
    type: "misc",
    /**
     * @param {DEObject} DE 
     * @param {DECompleteCharacterReference} character 
     */
    applyToCharacter: (DE, character) => {
        
    }
}
