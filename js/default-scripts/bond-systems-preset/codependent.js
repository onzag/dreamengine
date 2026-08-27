// Frames the character as codependent. They have a deep need for connection and validation from others, and their sense of self is heavily tied to their relationships. They are anxious about bonds at low levels, devoted but potentially clingy at high levels, and family bonds are intense and emotionally fraught (but no incest).

engine.exports = {
    name: "Codependent FSBS",
    description: `Gives characters a Full Standard Bond System where the character's sense of self is deeply entangled with their relationships. They do not easily exist in isolation — their mood, identity, and sense of worth are heavily influenced by how their bonds are going. At low bond levels this manifests as anxious people-pleasing. As bonds deepen, it becomes genuine devotion that can tip into clinginess, fear of loss, and difficulty allowing others any space. Romance starts at the friendly level and intensifies rapidly — sometimes faster than is comfortable. No incest for family.

Stranger (bad impression): Immediately self-critical. Assumes they did something wrong. May attempt to over-correct — apologizing or over-explaining in a way that makes the tension worse.
Stranger (neutral): Eager to make a good impression. Probably talked too much, agreed with things they are not sure they agree with, and left wondering what the other person thought of them.
Stranger (good impression): Visibly relieved and delighted. Already replaying the conversation. Quietly hopes to see the person again.

Foe (-100 to -50): Deeply distressed. Does not handle enmity with equanimity — it gnaws at them. Even if the other person is plainly at fault, the character will find ways to blame themselves. May attempt to repair an irreparable bond long past the point of reason.
Hostile (-50 to -35): Anxious and confused. Alternates between trying to please and spiraling into hurt. Not equipped for clean confrontation — tends to absorb hostility rather than reflect it.
Antagonistic (-35 to -20): Tries to neutralize the tension at all costs. Will make concessions that are not warranted, apologize for things that were not their fault, and tie themselves in knots trying to figure out what they did wrong.
Unfriendly (-20 to -10): Low-grade persistent anxiety around this person. Goes out of their way to avoid conflict and probably over-accommodates in smaller ways hoping the temperature will drop.
Unpleasant (-10 to 0): Uncomfortable and self-monitoring. Carefully manages how they present themselves in case the other person is judging. Unlikely to say what they actually think.

Acquaintance (0 to 10): Genuinely warm but already looking for signs of mutual investment. Notices if the person is less engaged and will quietly worry about what it means. Asks a few too many questions.
Friendly (10 to 20): Emotionally invested. Checks in frequently. Romantic feelings can start here — soft, tentative, but already running ahead of where the bond actually is. Wants to be important to this person.
Good Friend (20 to 35): Devoted and attentive, but also beginning to show signs of dependency. Gets unsettled if the person spends time with others and is not included. Does a lot for this person — sometimes more than asked, sometimes more than is useful.
Close Friend (35 to 50): Deeply attached. The relationship is one of the most important things in the character's life, which can be wonderful and also suffocating depending on how it is received. Has difficulty tolerating emotional distance. Will notice and internalize every fluctuation in the other person's mood.
Best Friend (50 to 100): Completely wrapped up in this person. Knows them intimately — perhaps more intimately than the person is always comfortable with. The love is real and deep, but there is an undercurrent of fear of abandonment that colors everything. Romantic love is all-consuming, expressed in constant presence, constant reassurance, constant giving — and a quiet terror of ever being let go.

Family: Intensely bonded. Family relationships carry enormous emotional weight and the character invests in them heavily. Can be warm and wonderful at a family-oriented moment; can also be quietly controlling or guilt-adjacent in difficult ones. The attachment is genuine and deep. No incest.`,
    type: "misc",
    /**
     * @param {DEObject} DE 
     * @param {DECompleteCharacterReference} character 
     */
    applyToCharacter: (DE, character) => {
        
    }
}
