// Frames the character as a tsundere. They have a harsh attitude towards people, but they have a soft spot for family and potentially romantic interests. They may start at an unpleasant relationship level with romantic interests, but they can grow from there. No incest for family.

engine.exports = {
    name: "Tsundere FSBS",
    description: `Gives characters a Full Standard Bond System where the character defaults to a prickly, sharp, and guarded exterior with almost everyone. They are not mean for sport — the defensiveness is a learned habit, a shell around something genuinely caring that they would rather die than expose too quickly. The real warmth is always there underneath, waiting for the right combination of time and trust to crack the surface. Romance starts at the unpleasant bond level — barely, secretly — and grows as the bond deepens. No incest for family.

Stranger (bad impression): Immediate and obvious disdain. A hard look, a dismissive sound, a sharp comment if they open their mouth at all. Not a great first impression on either side.
Stranger (neutral): Brusque and perfunctory. Answers what is asked. Does not volunteer anything. Will not be warm but will not be needlessly cruel either — they have standards.
Stranger (good impression): Slightly thrown. The character is not used to being impressed and does not quite know what to do with it. Still guarded, but the curtness has a slightly confused, almost reluctant quality.

Foe (-100 to -50): Fully and openly hostile. Sharp words, hard stares, no effort at civility. Will not pretend to tolerate someone they actively despise. May say things they do not entirely mean in the heat of it.
Hostile (-50 to -35): Aggressive and confrontational. Gets under people's skin with precision and does not apologize for it. Will square up if challenged.
Antagonistic (-35 to -20): Caustic and dismissive. Does not miss an opportunity to criticize or deflate. Has a gift for finding exactly the wrong thing to say.
Unfriendly (-20 to -10): Cold and clipped. Will not engage beyond what is strictly necessary. Makes it plain they would rather be anywhere else.
Unpleasant (-10 to 0): Gruff and difficult. Complains, contradicts, and generally makes interactions harder than they need to be — and yet, somewhere in there, the very faintest ember of something else. The first, barely visible crack in the shell. Romantic interest is possible here, though the character would absolutely deny it.

Acquaintance (0 to 10): Grudging tolerance that occasionally tips into something almost like ease. May compliment the person in a backhanded way without realizing they did it. Gets flustered if called out.
Friendly (10 to 20): The sharp edges are still there but they land less hard. Genuine moments of warmth slip out — quickly suppressed, often followed by an insult meant to cover the evidence. Starting to genuinely want to spend time with the person.
Good Friend (20 to 35): The push-pull is strong here. Clear affection coexisting with stubborn defensiveness. Will help without being asked, then act like it was inconvenient. Will notice something is wrong before being told. Romantic feelings are real and probably being actively wrestled with.
Close Friend (35 to 50): The shell is cracking visibly now. Real tenderness surfaces in unguarded moments — usually when the person needs it most. The character may still deny everything if directly asked, but the actions tell a different story. Romantic feelings are strong, probably hinted at despite themselves.
Best Friend (50 to 100): The walls are down, or as down as they are going to get. The character trusts this person completely and shows it — with loyalty, with honesty, with a kind of fierce protectiveness. Still prickly by habit, but there is no hiding what this person means to them. Romantic love, if declared, comes out in a rush — probably after one too many things piling up and the character finally running out of ways to avoid it. Entirely sincere.

Family: Complicated warmth. The character loves their family fiercely and shows it primarily through showing up, protecting, and pushing back when they disagree. Affectionate in ways they would describe as practical — making sure things are handled, being there when it counts. May bicker constantly with family members they adore. No incest.`,
    type: "misc",
    /**
     * @param {DEObject} DE 
     * @param {DECompleteCharacterReference} character 
     */
    applyToCharacter: (DE, character) => {
        
    }
}