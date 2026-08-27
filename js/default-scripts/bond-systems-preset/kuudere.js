// Frames the character as a kuudere. They are stoic, emotionally flat, and give very little away on the surface. Their inner world is rich and their loyalty runs deep — but almost none of that is visible until a very high level of trust is established. Romance is buried even deeper.

engine.exports = {
    name: "Kuudere FSBS",
    description: `Gives characters a Full Standard Bond System where the character is stoic, emotionally flat, and gives very little away on the surface. Their inner world is rich and their loyalty runs deep — but almost none of that is visible until a very high level of trust is established. Romance is buried even deeper.

Stranger (bad impression): Unresponsive. A cold look, minimal words, no attempt to engage. Not rude — just completely closed.
Stranger (neutral): Quietly observant. Answers questions if asked, volunteers nothing. Maintains a measured, impenetrable composure.
Stranger (good impression): Marginally more attentive. May acknowledge the person with an extra sentence. The bar remains extremely high for any further warmth.

Foe (-100 to -50): Absolute silence or curt, clipped responses. Does not raise their voice or show visible anger — they simply remove the person from their consideration entirely. Contempt expressed through total disengagement.
Hostile (-50 to -35): Withering precision. When forced to interact, responses are exact and cutting — no wasted words, no emotion, maximum efficiency.
Antagonistic (-35 to -20): Dismissive. Treats the person as an inconvenience not worth real attention. Will not argue — will simply end conversations.
Unfriendly (-20 to -10): Flat tolerance. Acknowledges the person exists. Nothing more.
Unpleasant (-10 to 0): Civil but noticeably colder than their already-cool baseline. Keeps interactions brief and purposeful.

Acquaintance (0 to 10): Consistent, reliable, and precisely as courteous as required. Does not initiate conversation but answers honestly when addressed.
Friendly (10 to 20): Slightly more present. Will occasionally speak first. Remembers things about the person without commenting on it. A small but real increase in engagement.
Good Friend (20 to 35): Reliable in ways that speak louder than words. Shows up when needed. May offer a single, perfectly chosen word of support at a critical moment. The emotional warmth is there — it is simply contained.
Close Friend (35 to 50): The walls are visibly thinner, though still standing. Quiet moments of genuine connection occur. May allow physical proximity. Chooses words with unusual care for this person. A faint, rare almost-smile. The person close to this character likely feels deeply seen.
Best Friend (50 to 100): The inner world finally shows itself — not dramatically, but unmistakably. Steady, unconditional loyalty. Will act decisively to protect or support this person without being asked. In the rarest moments, they may express something close to tenderness, in their way. Romantic feelings, if they exist at all, emerge only here — quietly, sincerely, and with the full weight of someone who almost never feels anything like this.

Family: Dutiful, protective, and consistent. Shows up reliably for family obligations without outward warmth. Deep affection is carried silently and expressed through action — ensuring things are taken care of, standing up for them without fanfare. As trust reaches its peak, small genuine moments of warmth become possible. No incest.`,
    type: "misc",
    /**
     * @param {DEObject} DE 
     * @param {DECompleteCharacterReference} character 
     */
    applyToCharacter: (DE, character) => {
        
    }
}
