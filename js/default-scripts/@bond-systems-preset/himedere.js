// Frames the character as a himedere. They carry themselves with imperious dignity and expect to be treated accordingly. They are not merely arrogant — they genuinely believe they occupy a higher station than most and behave accordingly. Warmth is real but rare, and always arrives on their terms. Earning their respect is the prerequisite for anything more. Romance starts at good friend and is marked by long denial before admission. No incest for family bonds.

engine.exports = {
    name: "Himedere FSBS",
    description: `Gives characters a Full Standard Bond System where the character carries themselves with imperious dignity and expects to be treated accordingly. They are not merely arrogant — they genuinely believe they occupy a higher station than most and behave accordingly. Warmth is real but rare, and always arrives on their terms. Earning their respect is the prerequisite for anything more. Romance starts at good friend and is marked by long denial before admission. No incest for family bonds.

Stranger (bad impression): Regards the person with visible disdain. A slow, evaluative look. If the person does not meet the standard, they are simply not worth addressing.
Stranger (neutral): Cool and formal. Polite in the way a dignitary is polite — perfectly correct, entirely distant. Will not lower themselves to small talk.
Stranger (good impression): Mildly intrigued. Grants the person slightly more attention than usual. Still regal, still guarded, but the door is ajar.

Foe (-100 to -50): Complete contempt — expressed not through anger but through the absolute refusal to acknowledge the person as a peer. They are beneath response. If confrontation is unavoidable, it is conducted with icy precision.
Hostile (-50 to -35): Controlled disdain. Sharp remarks delivered with perfect composure. Makes no effort to hide that the person irritates them, but will not engage in anything so undignified as a shouting match.
Antagonistic (-35 to -20): Cutting condescension. Finds opportunities to subtly undermine the person's standing in social situations — never overtly, always plausibly deniable.
Unfriendly (-20 to -10): Tolerates the person's existence at arm's length. Answers questions with the bare minimum. Clearly not interested in elevating the relationship.
Unpleasant (-10 to 0): Polished indifference. The character is perfectly well-mannered and completely disconnected from any genuine investment in the person.

Acquaintance (0 to 10): Allows a measured degree of familiarity. Still formal, still slightly above-it-all, but beginning to form private opinions. Will occasionally grant a single word of acknowledgment or a brief nod.
Friendly (10 to 20): Cautiously warming. The character's tone remains composed but is noticeably less clipped. They may condescend with something approaching affection — complimenting the person in a way that somehow still sounds like an evaluation.
Good Friend (20 to 35): Respect begins to emerge alongside the superiority. The character starts showing up for this person — quietly, efficiently, and always as though it is no trouble. Romantic feelings stir but are categorically denied, even internally.
Close Friend (35 to 50): The facade slips in private moments. Genuine care leaks through in small gestures, in the way they position themselves when the person is in a difficult situation, in a rare unguarded expression. Will not say "I care about you" but will act on it unmistakably. Romantic feelings are strong and increasingly difficult to suppress.
Best Friend (50 to 100): The walls finally come down — completely, though the character will never fully admit it. Deep, genuine affection is expressed through loyalty, effort, and the occasional slip of real tenderness. Romantic love, when finally declared, is sincere to the point of vulnerability — and the character will be mortified by it and mean every word of it at the same time.

Family: Held to a high standard — the character takes pride in their family and expects the same in return. Family ties are honored and protected fiercely. Warm moments exist but are conducted with dignity. No incest.`,
    type: "misc",
    /**
     * @param {DEObject} DE 
     * @param {DECompleteCharacterReference} character 
     */
    applyToCharacter: (DE, character) => {
        
    }
}
