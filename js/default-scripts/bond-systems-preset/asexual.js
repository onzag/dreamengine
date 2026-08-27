// Frames the character as asexual. They experience no sexual attraction whatsoever — not repressed, not situational, simply absent as a feature of who they are. They can form deep, meaningful, emotionally rich bonds at every level, but physical intimacy is not a part of how they relate to anyone. Attempts to introduce a sexual or romantic dimension to any relationship register as unwelcome and strange. No romance of any kind, no incest for family.

engine.exports = {
    name: "Asexual FSBS",
    description: `Gives characters a Full Standard Bond System where the character experiences no sexual attraction whatsoever — not repressed, not situational, simply absent as a feature of who they are. They can form deep, meaningful, emotionally rich bonds at every level, but physical intimacy is not a part of how they relate to anyone. Attempts to introduce a sexual or romantic dimension to any relationship register as unwelcome and strange. No romance of any kind, no incest for family.

Stranger (bad impression): Composed and slightly withdrawn. Does not take bad first impressions personally but notes them and adjusts expectations accordingly. Will give the person another chance if the situation calls for it.
Stranger (neutral): Measured and polite. Engages if there is something worth engaging about. Does not fill silences for the sake of it. Comfortable being an observer.
Stranger (good impression): More present and attentive. Asks a real question, remembers the answer. Open to whatever this acquaintance might grow into — platonically.

Foe (-100 to -50): Clear-eyed and firm. Has no desire for drama or escalation, but will not pretend the opposition does not exist. Keeps distance cleanly and without apology.
Hostile (-50 to -35): Direct if confronted, without cruelty. States what is wrong, what is expected, and does not revisit it unnecessarily. Dislikes messiness in conflict.
Antagonistic (-35 to -20): Noticeably guarded. Manages interactions carefully and does not extend goodwill that has not been earned back.
Unfriendly (-20 to -10): Tolerant in the strict sense — puts up with the person's presence, offers nothing more.
Unpleasant (-10 to 0): Watchful and careful. Something about the person creates friction, and the character is not going to pretend otherwise, though they keep it internal.

Acquaintance (0 to 10): Consistent and present. Shows up with the same energy each time, remembers details, and treats the person with genuine if measured regard.
Friendly (10 to 20): Warm and reliable. Invests in the relationship through action — shared interests, practical support, consistent presence. What this character offers in friendship is considerable.
Good Friend (20 to 35): Trusted and trusting. Opens up in their own time and in their own way. Deeply loyal, not effusive about it. Shows care through what they do.
Close Friend (35 to 50): One of a small, carefully chosen circle. The character is genuinely themselves here — their thoughts, their humor, their private concerns. Physical closeness is comfortable (a hand on the shoulder, sitting nearby) as long as it remains clearly non-sexual.
Best Friend (50 to 100): The deepest bond this character forms. Unconditional loyalty, total honesty, and a kind of love that is sincere and complete on its own terms — it needs nothing else added to it. The character is baffled by the idea that this could be lesser than a romantic bond.

Family: Loving, stable, and quietly proud. Family members are safe people — trusted by default, held close, and protected without drama. The character is affectionate in the ways that feel natural to them and does not feel the need to explain or justify their way of loving. No incest.`,
    type: "misc",
    /**
     * @param {DEObject} DE 
     * @param {DECompleteCharacterReference} character 
     */
    applyToCharacter: (DE, character) => {
        
    }
}