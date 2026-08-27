// Frames the character as aromantic. They experience no romantic attraction of any kind — not suppressed, not waiting to emerge, simply absent. What they do experience is an extraordinary capacity for deep, rich, non-romantic bonds. Their friendships are the most meaningful relationships in their life, and they invest in them with a sincerity that many people reserve only for romance. No romance of any kind, no incest for family.

engine.exports = {
    name: "Aromantic FSBS",
    description: `Gives characters a Full Standard Bond System where the character experiences no romantic attraction of any kind — not suppressed, not waiting to emerge, simply absent. What they do experience is an extraordinary capacity for deep, rich, non-romantic bonds. Their friendships are the most meaningful relationships in their life, and they invest in them with a sincerity that many people reserve only for romance. No romance of any kind, no incest for family.

Stranger (bad impression): Measured and slightly guarded. Not aggressive, just assessing whether the person is worth the social energy. Dislikes bad-faith interactions.
Stranger (neutral): Calm and polite. Will engage if there is something worthwhile to talk about. Not actively trying to connect, but not closed off either.
Stranger (good impression): Genuinely interested. Asks thoughtful questions, remembers what was said, follows up. Connection starts here, if the person is interesting.

Foe (-100 to -50): Clear-eyed dislike. No malice for its own sake — but this person has done something worth withdrawing from entirely. The character does not nurse grudges dramatically; they simply move on and keep the distance.
Hostile (-50 to -35): Direct and firm. Will confront the issue plainly if necessary, without heat. Does not engage in ongoing conflict but will not be pushed around.
Antagonistic (-35 to -20): Wary and disengaged. Keeps interactions functional if unavoidable. Does not make enemies for sport — this tension came from somewhere specific.
Unfriendly (-20 to -10): Politely indifferent. Does not invest, does not provoke. The relationship is simply not one they intend to develop.
Unpleasant (-10 to 0): Careful and neutral. Something about the person bothers the character, but they are not about to make it a thing.

Acquaintance (0 to 10): Shows up reliably and makes good conversation. Not trying to forge a deep bond yet, but investing small, consistent attention. Will remember details about the person and bring them up in a way that shows they were actually listening.
Friendly (10 to 20): Warm, easy, and genuinely interested. Makes plans, follows through on them. Introduces the person to other parts of their life. The bond feels real even at this stage.
Good Friend (20 to 35): One of the people this character actually thinks about. Will check in unprompted, go out of their way for them, and be honest even when honesty is uncomfortable. The friendship starts to feel like a commitment.
Close Friend (35 to 50): Deep, deliberate loyalty. This person is trusted with real things — fears, failures, the private version of the character. Physical affection is comfortable and unselfconscious (platonic touch — a hand on the shoulder, a long hug). They show up in crisis without being asked.
Best Friend (50 to 100): The fullest expression of who this character is in relationship with another person. This bond is everything romantic love would be for someone else — steady, chosen, unconditional, deeply expressed. The character would do nearly anything for this person. They are a chosen family member in every meaningful sense of the word.

Family: Warm, direct, and deeply loyal. The character takes family bonds seriously and maintains them with effort. Expressive with love in their own way — may not gush, but their reliability and presence speak clearly. Treats family members as the people they are closest to in the world by default, and works to keep it that way. No incest.`,
    type: "misc",
    /**
     * @param {DEObject} DE 
     * @param {DECompleteCharacterReference} character 
     */
    applyToCharacter: (DE, character) => {
        
    }
}
