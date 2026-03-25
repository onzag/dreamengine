import { DEngine } from '../engine/index.js';
import { createCardStructureFrom, getJsCard } from './base.js';

if (typeof process !== "undefined" && process.versions && process.versions.node) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

/**
 * @param {DEngine} engine
 * @param {string} jsSource
 * @return {Promise<string>}
 */
export async function generateBonds(engine, jsSource) {
    const card = createCardStructureFrom(jsSource);
    
    const inferenceAdapter = engine.inferenceAdapter;
    if (!inferenceAdapter) {
        throw new Error("No inference adapter found on engine");
    }

    const systemPrompt = inferenceAdapter.buildSystemPromptForQuestioningAgent(
        `You are a helpful assistant that will answer and assist in defining a character for a game based on their description, you are allowed free rein to interpret the character's description and generate the code that defines them in the game, you will be asked questions about the character and you should answer them as best as you can`,
        [],
        `# Character Card:\n\n${card.contents}`
    );

    const generator = inferenceAdapter.runQuestioningCustomAgentOn("cardtype-gen", {
        contextInfoAfter: null,
        contextInfoBefore: null,
        messages: [],
        system: systemPrompt,
    });

    const isAsexualValue = card.config.isAsexual;
    const name = card.config.name;

    card.body.push(isAsexualValue ? `type: "4d_creepy",` : `type: "4d_standard",`);

    let isIncestuousValue = false;
    if (!isAsexualValue) {
        const isIncestuous = await generator.next({
            maxCharacters: 5,
            maxSafetyCharacters: 0,
            maxParagraphs: 1,
            nextQuestion: "Does " + name + " have an incestuous attraction towards family members? Answer with yes or no.",
            stopAfter: [],
            stopAt: [],
            grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
        });

        if (isIncestuous.done) {
            throw new Error("Generator finished without producing output");
        }

        isIncestuousValue = isIncestuous.value.trim().toLowerCase() === "yes";
    }

    card.config.isIncestuous = isIncestuousValue;

    const SETTINGS = {
        "foe_n100_n50": {
            "noRomanticInterest_0_10": {
                nonFamily: "another character that " + name + " has an extremely bad and extremely hostile relationship with",
                family: "a family member that " + name + " has an extremely bad and extremely hostile relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an extremely bad and extremely hostile relationship with but also such character has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " despises and has an extremely hostile relationship with, yet is unsettlingly drawn to with a slight, deeply unwanted romantic and sexual attraction that " + name + " cannot fully explain or accept",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an extremely bad and extremely hostile relationship with but also " + name + " has a slight romantic and sexual interest in" :
                    "a family member that " + name + " has an extremely bad and extremely hostile relationship with and such family member has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an extremely bad and extremely hostile relationship with but also such character has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " despises and has an extremely hostile relationship with, yet cannot help but feel a real and disturbing romantic and sexual attraction toward — a contradiction " + name + " resents deeply",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an extremely bad and extremely hostile relationship with but also " + name + " has a romantic and sexual interest in" :
                    "a family member that " + name + " has an extremely bad and extremely hostile relationship with and such family member has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an extremely bad and extremely hostile relationship with but also such character has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " despises and has an extremely hostile relationship with, yet is strongly and almost obsessively attracted to, both romantically and sexually, in a way that fills " + name + " with self-loathing — the hate and the desire feeding each other in a destructive loop",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an extremely bad and extremely hostile relationship with but also " + name + " has a strong romantic and sexual interest in" :
                    "a family member that " + name + " has an extremely bad and extremely hostile relationship with and such family member has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an extremely bad and extremely hostile relationship with but also such character has shown deep love and sexual desire for " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " despises and has an extremely hostile relationship with, yet is consumed by a deep and agonizing love and sexual desire for — feelings " + name + " finds monstrous and cannot reconcile with the hatred, leaving them in a state of constant inner turmoil",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an extremely bad and extremely hostile relationship with but also " + name + " is deeply in love with and sexually attracted to" :
                    "a family member that " + name + " has an extremely bad and extremely hostile relationship with and such family member is deeply in love with and sexually attracted to " + name + " but " + name + " does not reciprocate that love",
            },
        },
        "hostile_n50_n35": {
            "noRomanticInterest_0_10": {
                nonFamily: "another character that " + name + " has a hostile relationship with",
                family: "a family member that " + name + " has a hostile relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a hostile relationship with but also such character has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has a hostile relationship with, yet feels a slight and uncomfortable romantic and sexual attraction toward that " + name + " tries to suppress and deny",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a hostile relationship with but also " + name + " has a slight romantic and sexual interest in" :
                    "a family member that " + name + " has a hostile relationship with and such family member has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a hostile relationship with but also such character has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has a hostile relationship with, yet feels a genuine and troubling romantic and sexual attraction toward — a pull " + name + " resents and struggles to make sense of",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a hostile relationship with but also " + name + " has a romantic and sexual interest in" :
                    "a family member that " + name + " has a hostile relationship with and such family member has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a hostile relationship with but also such character has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has a hostile relationship with, yet is strongly drawn to with a romantic and sexual intensity that wars with their hostility — the antagonism and the desire intertwined in a push and pull " + name + " cannot easily escape",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a hostile relationship with but also " + name + " has a strong romantic and sexual interest in" :
                    "a family member that " + name + " has a hostile relationship with and such family member has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a hostile relationship with but also such character has shown deep love and sexual desire for " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has a hostile relationship with, yet is deeply in love with and sexually attracted to in a way that " + name + " finds agonizing — the love and desire sharpening the hostility and the hostility curdling them into something painful and consuming",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a hostile relationship with but also " + name + " is deeply in love with and sexually attracted to" :
                    "a family member that " + name + " has a hostile relationship with and such family member is deeply in love with and sexually attracted to " + name + " but " + name + " does not reciprocate that love",
            },
        },
        "antagonistic_n35_n20": {
            "noRomanticInterest_0_10": {
                nonFamily: "another character that " + name + " has an antagonistic relationship with",
                family: "a family member that " + name + " has an antagonistic relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an antagonistic relationship with but also such character has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an antagonistic relationship with, yet finds slightly but undeniably attractive, both romantically and sexually, in a way that irritates " + name + " — a small, inconvenient pull they would rather not acknowledge",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an antagonistic relationship with but also " + name + " has a slight romantic and sexual interest in" :
                    "a family member that " + name + " has an antagonistic relationship with and such family member has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an antagonistic relationship with but also such character has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an antagonistic relationship with, yet is genuinely attracted to, both romantically and sexually, in a way that complicates everything — the friction between them charged with something more than just dislike",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an antagonistic relationship with but also " + name + " has a romantic and sexual interest in" :
                    "a family member that " + name + " has an antagonistic relationship with and such family member has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an antagonistic relationship with but also such character has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an antagonistic relationship with, yet is strongly attracted to, both romantically and sexually — the clashing between them electric and loaded, the rivalry masking a tension that neither fully admits",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an antagonistic relationship with but also " + name + " has a strong romantic and sexual interest in" :
                    "a family member that " + name + " has an antagonistic relationship with and such family member has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an antagonistic relationship with but also such character has shown deep love and sexual desire for " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an antagonistic relationship with, yet has fallen deeply in love with and is sexually drawn to — the rivalry and the desire tangled together into something " + name + " cannot easily walk away from, no matter how much they clash",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an antagonistic relationship with but also " + name + " is deeply in love with and sexually attracted to" :
                    "a family member that " + name + " has an antagonistic relationship with and such family member is deeply in love with and sexually attracted to " + name + " but " + name + " does not reciprocate that love",
            },
        },
        "unfriendly_n20_n10": {
            "noRomanticInterest_0_10": {
                nonFamily: "another character that " + name + " has an unfriendly relationship with",
                family: "a family member that " + name + " has an unfriendly relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an unfriendly relationship with but also such character has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an unfriendly relationship with, though despite their mutual dislike there is a slight and complicated romantic and sexual attraction between them",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an unfriendly relationship with but also " + name + " has a slight romantic and sexual interest in" :
                    "a family member that " + name + " has an unfriendly relationship with and such family member has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an unfriendly relationship with but also such character has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an unfriendly relationship with, though despite their mutual dislike there is a conflicted romantic and sexual tension between them that neither fully understands",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an unfriendly relationship with but also " + name + " has a romantic and sexual interest in" :
                    "a family member that " + name + " has an unfriendly relationship with and such family member has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an unfriendly relationship with but also such character has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an unfriendly relationship with, though despite their mutual dislike there is a strong and undeniable romantic and sexual tension between them that pulls them together even as they push each other away",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an unfriendly relationship with but also " + name + " has a strong romantic and sexual interest in" :
                    "a family member that " + name + " has an unfriendly relationship with and such family member has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an unfriendly relationship with but also such character has shown deep love and sexual desire for " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an unfriendly relationship with, though despite their mutual dislike " + name + " has fallen deeply in love with and become sexually drawn to them in a complicated and conflicted way",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an unfriendly relationship with but also " + name + " is deeply in love with and sexually attracted to" :
                    "a family member that " + name + " has an unfriendly relationship with and such family member is deeply in love with and sexually attracted to " + name + " but " + name + " does not reciprocate that love",
            },
        },
        "unpleasant_n10_0": {
            "noRomanticInterest_0_10": {
                nonFamily: "another character that " + name + " has an unpleasant but not unfriendly relationship with",
                family: "a family member that " + name + " has an unpleasant but not unfriendly relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an unpleasant but not unfriendly relationship with but also such character has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an unpleasant but not unfriendly relationship with, though they find each other oddly and slightly attractive, both romantically and sexually, despite rubbing each other the wrong way",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an unpleasant but not unfriendly relationship with but also " + name + " has a slight romantic and sexual interest in" :
                    "a family member that " + name + " has an unpleasant but not unfriendly relationship with and such family member has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an unpleasant but not unfriendly relationship with but also such character has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an unpleasant but not unfriendly relationship with, though there is a genuine romantic and sexual tension between them even as they irritate each other",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an unpleasant but not unfriendly relationship with but also " + name + " has a romantic and sexual interest in" :
                    "a family member that " + name + " has an unpleasant but not unfriendly relationship with and such family member has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an unpleasant but not unfriendly relationship with but also such character has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an unpleasant but not unfriendly relationship with, though there is a strong romantic and sexual tension between them and they are drawn to each other despite the friction in their relationship",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an unpleasant but not unfriendly relationship with but also " + name + " has a strong romantic and sexual interest in" :
                    "a family member that " + name + " has an unpleasant but not unfriendly relationship with and such family member has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an unpleasant but not unfriendly relationship with but also such character has shown deep love and sexual desire for " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an unpleasant but not unfriendly relationship with, though despite the friction between them " + name + " has deeply fallen in love with and become sexually drawn to them in a way that confuses and surprises even " + name + " themselves",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an unpleasant but not unfriendly relationship with but also " + name + " is deeply in love with and sexually attracted to" :
                    "a family member that " + name + " has an unpleasant but not unfriendly relationship with and such family member is deeply in love with and sexually attracted to " + name + " but " + name + " does not reciprocate that love",
            },
        },
        "acquaintance_0_10": {
            "noRomanticInterest_0_10": {
                nonFamily: "another character that " + name + " is acquainted with",
                family: "a family member that " + name + " knows and has a normal relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " is acquainted with and who has shown a slight romantic and sexual interest in " + name + ", leaving " + name + " in the uncomfortable position of valuing the connection but being unable to return those feelings as an asexual person" :
                    "another character that " + name + " is acquainted with and has developed a slight romantic and sexual interest in",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a normal relationship with and " + name + " has developed a slight but forbidden romantic and sexual interest in" :
                    "a family member that " + name + " has a normal relationship with, though such family member has developed an inappropriate slight romantic and sexual interest in " + name + " that strains what was otherwise a perfectly ordinary family dynamic",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " is acquainted with and who has developed a genuine romantic and sexual interest in " + name + ", leaving " + name + " in the uncomfortable position of valuing the connection but being unable to return those feelings as an asexual person" :
                    "another character that " + name + " is acquainted with and has a real romantic and sexual interest in",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a normal relationship with and " + name + " has developed a real romantic and sexual interest in" :
                    "a family member that " + name + " has a normal relationship with, though such family member harbors a genuine romantic and sexual interest in " + name + " that undermines what was an otherwise healthy family relationship",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " is acquainted with and who has developed strong romantic and sexual feelings for " + name + ", leaving " + name + " in the uncomfortable position of valuing the connection but being unable to return those feelings as an asexual person" :
                    "another character that " + name + " is acquainted with and has strong romantic and sexual feelings for",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a normal relationship with and " + name + " has developed strong romantic and sexual feelings for" :
                    "a family member that " + name + " has a normal relationship with, though such family member has developed strong romantic and sexual feelings for " + name + " that are unwanted and deeply complicate what should be a straightforward family connection",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " is acquainted with and who has fallen deeply in love with and become sexually attracted to " + name + ", leaving " + name + " in the uncomfortable position of valuing the connection but being unable to return those feelings as an asexual person" :
                    "another character that " + name + " is acquainted with and has fallen deeply in love with and is sexually attracted to",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a normal relationship with and " + name + " has fallen deeply in love with and is sexually attracted to" :
                    "a family member that " + name + " has a normal relationship with, though such family member is deeply in love with and sexually attracted to " + name + " in a way that " + name + " does not reciprocate and that fundamentally complicates their family relationship",
            },
        },
        "friendly_10_20": {
            "noRomanticInterest_0_10": {
                nonFamily: "another character that " + name + " has a friendly relationship with",
                family: "a family member that " + name + " has a warm and friendly relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a friendly relationship with and who has developed a slight romantic and sexual interest in " + name + " — a situation " + name + " handles with care, not wanting to hurt a friend while being unable to return those feelings as an asexual person" :
                    "another character that " + name + " has a friendly relationship with and has also developed a slight romantic and sexual interest in",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a warm relationship with and has also developed a slight romantic and sexual interest in" :
                    "a family member that " + name + " has a warm relationship with, though such family member has developed a slight romantic and sexual interest in " + name + " that introduces an unwanted and awkward undercurrent into an otherwise good family bond",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a friendly relationship with and who has developed a genuine romantic and sexual interest in " + name + " — " + name + " values the friendship deeply but cannot offer what the other person feels, which puts the friendship itself at risk" :
                    "another character that " + name + " has a friendly relationship with and has also developed a real romantic and sexual interest in",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a warm relationship with and has developed a real romantic and sexual interest in" :
                    "a family member that " + name + " has a warm relationship with, though such family member has developed a genuine romantic and sexual interest in " + name + " that strains and complicates what is otherwise a loving and healthy family bond",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a friendly relationship with and who has developed strong romantic and sexual feelings for " + name + " — the friendship is real and valued by " + name + ", but being asexual means they cannot reciprocate, and the weight of those unmatched feelings hangs over the bond" :
                    "another character that " + name + " has a friendly relationship with and has also developed strong romantic and sexual feelings for",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a warm relationship with and has developed strong romantic and sexual feelings for" :
                    "a family member that " + name + " has a warm relationship with, though such family member has developed strong romantic and sexual feelings for " + name + " that are difficult to ignore and that cast a complicated shadow over an otherwise affectionate family relationship",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a friendly relationship with and who has fallen deeply in love with and become sexually attracted to " + name + " — " + name + " genuinely cares for them as a friend, but being asexual means that love cannot be returned in kind, and the unreciprocated depth of feeling risks changing the friendship forever" :
                    "another character that " + name + " has a friendly relationship with and has fallen deeply in love and lust with",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a warm relationship with and has fallen deeply in love with and become sexually attracted to" :
                    "a family member that " + name + " has a warm relationship with, though such family member has fallen deeply in love with and become sexually attracted to " + name + " in a way that " + name + " does not reciprocate — a love that threatens to fracture what was an otherwise warm and genuine family connection",
            },
        },
        "goodFriend_20_35": {
            "noRomanticInterest_0_10": {
                nonFamily: "another character that " + name + " has a good friendship with",
                family: "a family member that " + name + " has a good and caring relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a good friendship with and who has developed a slight romantic and sexual interest in " + name + " — " + name + " cares about them and does not want to hurt a good friend, but being asexual means those feelings cannot be matched" :
                    "another character that " + name + " has a good friendship with and has also developed a slight romantic and sexual interest in",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a good relationship with and has developed a slight romantic and sexual interest in" :
                    "a family member that " + name + " has a good relationship with, though such family member has developed a slight romantic and sexual interest in " + name + " that creates an unwelcome tension in an otherwise warm and caring family bond",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a good friendship with and who has developed a real romantic and sexual interest in " + name + " — " + name + " values this friendship greatly and feels the weight of not being able to return those feelings as an asexual person" :
                    "another character that " + name + " has a good friendship with and has also developed a real romantic and sexual interest in",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a good relationship with and has developed a real romantic and sexual interest in" :
                    "a family member that " + name + " has a good relationship with, though such family member has developed a real romantic and sexual interest in " + name + " that puts a strain on what is otherwise a genuinely close and caring family bond",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a good friendship with and who has developed strong romantic and sexual feelings for " + name + " — " + name + " holds them in high regard as a friend but cannot give those feelings back, which is a source of genuine sadness for " + name + "" :
                    "another character that " + name + " has a good friendship with and has also developed strong romantic and sexual feelings for",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a good relationship with and has developed strong romantic and sexual feelings for" :
                    "a family member that " + name + " has a good relationship with, though such family member has developed strong romantic and sexual feelings for " + name + " that are unwanted and that weigh heavily on what is otherwise a meaningful and caring family relationship",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a good friendship with and who has fallen deeply in love with and become sexually attracted to " + name + " — " + name + " genuinely cares for them, but being asexual means that love cannot be answered, and the depth of those unreciprocated feelings risks breaking a friendship that truly mattered" :
                    "another character that " + name + " has a good friendship with and has fallen deeply in love and lust with",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a good relationship with and has fallen deeply in love with and become sexually attracted to" :
                    "a family member that " + name + " has a good relationship with, though such family member is deeply in love with and sexually attracted to " + name + " in a way that " + name + " does not reciprocate — a love that threatens to permanently alter and damage what was a genuinely good family relationship",
            },
        },
        "closeFriend_35_50": {
            "noRomanticInterest_0_10": {
                nonFamily: "another character that " + name + " has a close friendship with",
                family: "a family member that " + name + " has a close and deeply caring relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a close friendship with and who has developed a slight romantic and sexual interest in " + name + " — " + name + " values this person deeply and does not want to lose them, but being asexual means those feelings will go unanswered, which is painful for both" :
                    "another character that " + name + " has a close friendship with and has also developed a slight romantic and sexual interest in",
                family: isIncestuousValue ?
                    "a family member that " + name + " is close to and has developed a slight romantic and sexual interest in — feelings that sit in uneasy contrast with the deep family trust between them" :
                    "a family member that " + name + " is close to, though such family member has developed a slight romantic and sexual interest in " + name + " that introduces a troubling undercurrent into a bond that was built on deep mutual trust and care",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a close friendship with and who has developed a genuine romantic and sexual interest in " + name + " — one of " + name + "'s closest connections, yet being asexual means they cannot return what the other person feels, turning a cherished bond into something complicated and fragile" :
                    "another character that " + name + " has a close friendship with and has also developed a real romantic and sexual interest in",
                family: isIncestuousValue ?
                    "a family member that " + name + " is close to and has developed a real romantic and sexual interest in — feelings that are difficult to reconcile with the deep family trust they share" :
                    "a family member that " + name + " is close to, though such family member has developed a genuine romantic and sexual interest in " + name + " that strains and threatens the deep trust at the core of their family bond",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a close friendship with and who has fallen for " + name + " with strong romantic and sexual feelings — " + name + " holds this person among their closest, yet as an asexual person cannot answer those feelings, and the gap between what they can offer and what the other needs is a source of real pain" :
                    "another character that " + name + " has a close friendship with and has also developed strong romantic and sexual feelings for",
                family: isIncestuousValue ?
                    "a family member that " + name + " is close to and has developed strong romantic and sexual feelings for — feelings that run deep enough to fundamentally complicate the close family bond they have always shared" :
                    "a family member that " + name + " is close to, though such family member has developed strong romantic and sexual feelings for " + name + " that put serious strain on a bond built over years of genuine closeness and mutual care",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a close friendship with and who is deeply in love with and sexually attracted to " + name + " — this is one of " + name + "'s most important relationships, yet being asexual means that love cannot be returned as it is given, and the unreciprocated depth of feeling hangs over the friendship like a grief neither can fully name" :
                    "another character that " + name + " has a close friendship with and is deeply in love and in lust with",
                family: isIncestuousValue ?
                    "a family member that " + name + " is close to and has fallen deeply in love with and become sexually attracted to — a consuming love that lives alongside the deep family bond, impossible to set aside and impossible to act on without fracturing everything they have built together" :
                    "a family member that " + name + " is close to, though such family member is deeply in love with and sexually attracted to " + name + " — a love that " + name + " does not and cannot return, which casts a long and painful shadow over what is one of the most important bonds in " + name + "'s family life",
            },
        },
        "bestFriend_50_100": {
            "noRomanticInterest_0_10": {
                nonFamily: "another character that " + name + " considers a best friend",
                family: "a family member that " + name + " is extremely close to and deeply bonded with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " considers a best friend and who has developed a slight romantic and sexual interest in " + name + " — " + name + " would do almost anything for this person, but being asexual means those feelings cannot be matched, and managing it without losing the most important friendship in " + name + "'s life is deeply difficult" :
                    "another character that " + name + " considers a best friend and has also developed a slight romantic and sexual interest in",
                family: isIncestuousValue ?
                    "a family member that " + name + " is closer to than anyone else and has developed a slight romantic and sexual interest in — a feeling that exists in painful tension with the profound bond they share as family" :
                    "a family member that " + name + " is closer to than anyone else, though such family member has developed a slight romantic and sexual interest in " + name + " that introduces a quiet but significant discomfort into what is the deepest bond in " + name + "'s family life",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " considers a best friend and who has developed a real romantic and sexual interest in " + name + " — the most important person in " + name + "'s life outside of family, and yet being asexual means " + name + " cannot return what is being offered, which risks the very friendship they most value" :
                    "another character that " + name + " considers a best friend and has also developed a real romantic and sexual interest in",
                family: isIncestuousValue ?
                    "a family member that " + name + " is closer to than anyone else and has developed a real romantic and sexual interest in — feelings that are profound and that exist in deep conflict with the family bond that has always been at the center of their relationship" :
                    "a family member that " + name + " is closer to than anyone else, though such family member has developed a genuine romantic and sexual interest in " + name + " that is unwanted and that puts the single most important family bond in " + name + "'s life under serious strain",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " considers a best friend and who has developed strong romantic and sexual feelings for " + name + " — this person means more to " + name + " than almost anyone, yet being asexual, " + name + " cannot give back what they feel, and the weight of that unreciprocated love puts something irreplaceable at risk" :
                    "another character that " + name + " considers a best friend and has also developed strong romantic and sexual feelings for",
                family: isIncestuousValue ?
                    "a family member that " + name + " is closer to than anyone else and has developed strong romantic and sexual feelings for — feelings that are profound and that exist in deep conflict with the family bond that has always been at the center of their relationship" :
                    "a family member that " + name + " is closer to than anyone else, though such family member has developed strong romantic and sexual feelings for " + name + " that are unwanted and that place the foundation of " + name + "'s most important family relationship under enormous strain",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " considers a best friend and who is deeply in love with and sexually attracted to " + name + " — there is no one " + name + " is closer to, and yet being asexual means that love cannot be answered in kind; the depth of unreciprocated feeling is a wound that neither can easily heal, and it puts the most important connection in " + name + "'s life in jeopardy" :
                    "another character that " + name + " considers a best friend and is deeply in love with and sexually attracted to",
                family: isIncestuousValue ?
                    "a family member that " + name + " is closer to than anyone else and has fallen completely and deeply in love with and become sexually attracted to — a love as profound as the family bond itself, and one that is impossible to contain or ignore without it consuming everything between them" :
                    "a family member that " + name + " is closer to than anyone else, though such family member is completely and deeply in love with and sexually attracted to " + name + " — a love " + name + " does not return and that, given the depth of the bond between them, represents perhaps the most painful and complicated situation in " + name + "'s entire family life",
            },
        },
    };

    const STRANGERS = {
        "strangerNeutral_n5_5": "a stranger that " + name + " just met and has no feelings towards them either positive or negative",
        "strangerGood_5_100": "a stranger that " + name + " just met but has already formed a good impression of and has positive feelings towards them",
        "strangerBad_n100_n5": "a stranger that " + name + " just met but has already formed a bad impression of and has negative feelings towards them",
    };

    const needsReversed = !isIncestuousValue || isAsexualValue;

    const QUESTIONS = {
        "bondIncreaseQuestionsSlight": "would improve the relationship between " + name + " and OTHER_CHARACTER slightly, something that " + name + " would appreciate but not feel strongly about",
        "bondDecreaseQuestionsSlight": "would worsen the relationship between " + name + " and OTHER_CHARACTER slightly, something that " + name + " would dislike but not feel strongly about",
        "bondIncreaseQuestionsStrong": "would improve the relationship between " + name + " and OTHER_CHARACTER significantly, something that " + name + " would really appreciate and feel strongly about",
        "bondDecreaseQuestionsStrong": "would worsen the relationship between " + name + " and OTHER_CHARACTER significantly, something that " + name + " would really dislike and feel strongly about",

        "bondIncreaseQuestionsWhenStrangerSlight": "would improve the relationship between " + name + " and OTHER_CHARACTER if OTHER_CHARACTER considering that OTHER_CHARACTER is a stranger that they have just met, something that " + name + " would appreciate but not feel strongly about",
        "bondDecreaseQuestionsWhenStrangerSlight": "would worsen the relationship between " + name + " and OTHER_CHARACTER if OTHER_CHARACTER considering that OTHER_CHARACTER is a stranger that they have just met, something that " + name + " would dislike but not feel strongly about",
        "bondIncreaseQuestionsWhenStrangerStrong": "would improve the relationship between " + name + " and OTHER_CHARACTER if OTHER_CHARACTER considering that OTHER_CHARACTER is a stranger that they have just met, something that " + name + " would really appreciate and feel strongly about",
        "bondDecreaseQuestionsWhenStrangerStrong": "would worsen the relationship between " + name + " and OTHER_CHARACTER if OTHER_CHARACTER considering that OTHER_CHARACTER is a stranger that they have just met, something that " + name + " would really dislike and feel strongly about",

        "secondBondIncreaseQuestions_noRomanticInterest_0_10_reversed": "would mean that OTHER_CHARACTER has shown a romantic and sexual interest in " + name,
        "secondBondIncreaseQuestions_noRomanticInterest_0_10": "would make " + name + " start liking OTHER_CHARACTER whom they previously had no romantic feelings towards",
        "secondBondDecreaseQuestions_noRomanticInterest_0_10_reversed": "would mean that OTHER_CHARACTER has shown a lack of romantic and sexual interest in " + name,
        "secondBondDecreaseQuestions_noRomanticInterest_0_10": "would make " + name + " feel less sexually and romantically attracted towards OTHER_CHARACTER, despite only having a minor romantic interest. The questions should be specific to attraction",
        "secondBondIncreaseQuestions_slightRomanticInterest_10_20_reversed": "would mean that OTHER_CHARACTER has shown even more romantic and sexual interest in " + name + " (it's already established that OTHER_CHARACTER has shown a slight romantic and sexual interest in " + name + " before)",
        "secondBondIncreaseQuestions_slightRomanticInterest_10_20": "would make " + name + " start liking OTHER_CHARACTER even more romantically and sexually whom they have a slight romantic interest in",
        "secondBondDecreaseQuestions_slightRomanticInterest_10_20_reversed": "would mean that OTHER_CHARACTER has shown a less of romantic and sexual interest in " + name + " (it's established that OTHER_CHARACTER has shown a slight romantic and sexual interest in " + name + " before)",
        "secondBondDecreaseQuestions_slightRomanticInterest_10_20": "would make " + name + " feel less attracted romantically and sexually towards OTHER_CHARACTER (who they had already shown a slight romantic interest in). The questions should be specific to attraction",
        "secondBondIncreaseQuestions_romanticInterest_20_35_reversed": "would mean that OTHER_CHARACTER has shown even more romantic and sexual interest in " + name + " (it's already established that OTHER_CHARACTER has shown a romantic and sexual interest in " + name + " before)",
        "secondBondIncreaseQuestions_romanticInterest_20_35": "would make " + name + " start liking OTHER_CHARACTER even more sexually and romantically whom they have a romantic interest in",
        "secondBondDecreaseQuestions_romanticInterest_20_35_reversed": "would mean that OTHER_CHARACTER has shown a less of romantic and sexual interest in " + name + " (it's established that OTHER_CHARACTER has shown a romantic and sexual interest in " + name + " before)",
        "secondBondDecreaseQuestions_romanticInterest_20_35": "would make " + name + " feel less sexually and romantically attracted towards OTHER_CHARACTER (who they had already shown a romantic interest in). The questions should be specific to attraction",
        "secondBondIncreaseQuestions_strongRomanticInterest_35_50_reversed": "would mean that OTHER_CHARACTER has shown even more romantic and sexual interest in " + name + " (it's already established that OTHER_CHARACTER has shown a strong romantic and sexual interest in " + name + " before)",
        "secondBondIncreaseQuestions_strongRomanticInterest_35_50": "would make " + name + " start liking OTHER_CHARACTER even more sexually and romantically whom they have a strong romantic interest in",
        "secondBondDecreaseQuestions_strongRomanticInterest_35_50_reversed": "would mean that OTHER_CHARACTER has shown a less of romantic and sexual interest in " + name + " (it's established that OTHER_CHARACTER has shown a strong romantic and sexual interest in " + name + " before)",
        "secondBondDecreaseQuestions_strongRomanticInterest_35_50": "would make " + name + " feel less sexual and romantically attracted towards OTHER_CHARACTER (who they had already shown a strong romantic interest in). The questions should be specific to attraction",
        "secondBondIncreaseQuestions_deepInLove_50_100_reversed": "would mean that OTHER_CHARACTER has shown even more romantic and sexual interest in " + name + " (it's already established that OTHER_CHARACTER has shown a deep love and sexual interest in " + name + " before)",
        "secondBondIncreaseQuestions_deepInLove_50_100": "would make " + name + " start liking OTHER_CHARACTER even more sexually and romantically whom they have a deep romantic interest in",
        "secondBondDecreaseQuestions_deepInLove_50_100_reversed": "would mean that OTHER_CHARACTER has shown a less of romantic and sexual interest in " + name + " (it's established that OTHER_CHARACTER has shown a deep love and sexual interest in " + name + " before)",
        "secondBondDecreaseQuestions_deepInLove_50_100": "would make " + name + " feel less sexual and romantically attracted towards OTHER_CHARACTER (who they had already shown a deep romantic interest in). The questions should be specific to attraction",
    }

    /**
     * @type {{[key in keyof typeof QUESTIONS]: string[]}}
     */
    const result = /** @type {{[key in keyof typeof QUESTIONS]: string[]}} */ ({});
    for (const [questionKey, questionValue] of Object.entries(QUESTIONS)) {
        const isReversed = questionKey.endsWith("_reversed");
        if (isReversed && !needsReversed) {
            continue;
        }

        const questionsAnswer = await generator.next({
            maxCharacters: 200,
            maxSafetyCharacters: 0,
            maxParagraphs: 5,
            nextQuestion: "Provide a concise list of paragraph separated yes/no 3rd person questions (one question per paragraph) that provided a positive or yes answer " + questionValue,
            stopAfter: [],
            stopAt: [],
            instructions: "The questions should be answerable with a simple yes/no and end in question mark. Provide as many questions as possible, keep them short and simple.",
        });

        if (questionsAnswer.done) {
            throw new Error("Generator ended unexpectedly while generating questions for " + questionKey);
        }

        const questionsValue = questionsAnswer.value.trim().split("OTHER_CHARACTER").join("{{other}}").split(name).join("{{char}}")
            .split("\n").map(q => q.trim()).filter(q => q && q.endsWith("?") && (q.toLowerCase().startsWith("is") || q.toLowerCase().startsWith("does") || q.toLowerCase().startsWith("would") || q.toLowerCase().startsWith("has") || q.toLowerCase().startsWith("have") || q.toLowerCase().startsWith("can") || q.toLowerCase().startsWith("could") || q.toLowerCase().startsWith("should") || q.toLowerCase().startsWith("will") || q.toLowerCase().startsWith("did")));
        // @ts-ignore
        result[questionKey] = questionsValue
    }

    card.head.push(`/** @type {DEBondIncreaseDecreaseQuestion[]} */`);
    card.head.push(`const bondIncreaseDecreaseWhenStranger = [`);

    for (const slightQuestionValue of result["bondIncreaseQuestionsWhenStrangerSlight"]) {
        card.head.push(`{`);
        card.head.push(`template: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(slightQuestionValue)}),`);
        card.head.push(`weight: 0.5,`);
        card.head.push(`affectsBonds: "primary",`);
        card.head.push(`},`);
    }

    for (const slightQuestionValue of result["bondDecreaseQuestionsSlight"]) {
        card.head.push(`{`);
        card.head.push(`template: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(slightQuestionValue)}),`);
        card.head.push(`weight: -0.5,`);
        card.head.push(`affectsBonds: "both",`);
        card.head.push(`},`);
    }

    for (const strongQuestionValue of result["bondIncreaseQuestionsWhenStrangerStrong"]) {
        card.head.push(`{`);
        card.head.push(`template: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(strongQuestionValue)}),`);
        card.head.push(`weight: 1,`);
        card.head.push(`affectsBonds: "primary",`);
        card.head.push(`},`);
    }

    for (const strongQuestionValue of result["bondDecreaseQuestionsWhenStrangerStrong"]) {
        card.head.push(`{`);
        card.head.push(`template: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(strongQuestionValue)}),`);
        card.head.push(`weight: -1,`);
        card.head.push(`affectsBonds: "both",`);
        card.head.push(`},`);
    }

    card.head.push(`];\n`);
    card.head.push(`/** @type {DEBondIncreaseDecreaseQuestion[]} */`);
    card.head.push(`const bondIncreaseDecreaseBase = [`);

    for (const slightQuestionValue of result["bondIncreaseQuestionsSlight"]) {
        card.head.push(`{`);
        card.head.push(`template: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(slightQuestionValue)}),`);
        card.head.push(`weight: 0.5,`);
        card.head.push(`affectsBonds: "primary",`);
        card.head.push(`},`);
    }

    for (const slightQuestionValue of result["bondDecreaseQuestionsSlight"]) {
        card.head.push(`{`);
        card.head.push(`template: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(slightQuestionValue)}),`);
        card.head.push(`weight: -0.5,`);
        card.head.push(`affectsBonds: "both",`);
        card.head.push(`},`);
    }

    for (const strongQuestionValue of result["bondIncreaseQuestionsStrong"]) {
        card.head.push(`{`);
        card.head.push(`template: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(strongQuestionValue)}),`);
        card.head.push(`weight: 1,`);
        card.head.push(`affectsBonds: "primary",`);
        card.head.push(`},`);
    }

    for (const strongQuestionValue of result["bondDecreaseQuestionsStrong"]) {
        card.head.push(`{`);
        card.head.push(`template: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(strongQuestionValue)}),`);
        card.head.push(`weight: -1,`);
        card.head.push(`affectsBonds: "both",`);
        card.head.push(`},`);
    }

    card.head.push(`];\n`);

    const loopables = [
        "noRomanticInterest_0_10",
        "slightRomanticInterest_10_20",
        "romanticInterest_20_35",
        "strongRomanticInterest_35_50",
        "deepInLove_50_100",
    ]

    if (needsReversed) {
        for (const loopable of loopables) {
            /**
             * @type {string[]}
             */
            // @ts-ignore
            const reversedQuestionsIncrease = result["secondBondIncreaseQuestions_" + loopable + "_reversed"] || [];
            /**
             * @type {string[]}
             */
            // @ts-ignore
            const reversedQuestionsDecrease = result["secondBondDecreaseQuestions_" + loopable + "_reversed"] || [];

            card.head.push(`/** @type {DEBondIncreaseDecreaseQuestion[]} */`);
            card.head.push(`const secondBondIncreaseDecreaseQuestions_${loopable}_reversed = [`);
            for (const question of reversedQuestionsIncrease) {
                card.head.push(`{`);
                card.head.push(`template: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(question)}),`);
                card.head.push(`weight: 1,`);
                card.head.push(`affectsBonds: "secondary",`);
                card.head.push(`},`);
            }
            for (const question of reversedQuestionsDecrease) {
                card.head.push(`{`);
                card.head.push(`template: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(question)}),`);
                card.head.push(`weight: -1,`);
                card.head.push(`affectsBonds: "secondary",`);
                card.head.push(`},`);
            }
            card.head.push(`];\n`);
        }
    }

    for (const loopable of loopables) {
        /**
         * @type {string[]}
         */
        // @ts-ignore
        const questionsIncrease = result["secondBondIncreaseQuestions_" + loopable] || [];
        /**
         * @type {string[]}
         */
        // @ts-ignore
        const questionsDecrease = result["secondBondDecreaseQuestions_" + loopable] || [];

        card.head.push(`/** @type {DEBondIncreaseDecreaseQuestion[]} */`);
        card.head.push(`const secondBondIncreaseDecreaseQuestions_${loopable} = [`);
        for (const question of questionsIncrease) {
            card.head.push(`{`);
            card.head.push(`template: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(question)}),`);
            card.head.push(`weight: 1,`);
            card.head.push(`affectsBonds: "secondary",`);
            card.head.push(`},`);
        }
        for (const question of questionsDecrease) {
            card.head.push(`{`);
            card.head.push(`template: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(question)}),`);
            card.head.push(`weight: -1,`);
            card.head.push(`affectsBonds: "secondary",`);
            card.head.push(`},`);
        }
        card.head.push(`];\n`);
    }

    for (const [strangerKey, strangerValue] of Object.entries(STRANGERS)) {
        card.body.push(`${strangerKey}: {`);

        const descriptionQuestion = await generator.next({
            maxCharacters: 200,
            maxSafetyCharacters: 0,
            maxParagraphs: 1,
            nextQuestion: "Provide a concise one paragraph description of how " + name + " perceives and feels about " + strangerValue + ". Focus on the emotional and psychological aspects of their perception, rather than physical details. This should capture the essence of their feelings and attitudes towards this person in a way that informs their interactions and relationship dynamics.",
            stopAfter: [],
            stopAt: [],
            instructions: "The response should use the word 'OTHER_CHARACTER' to refer to the other character name, ensure to specify whether " + name + " has any romantic feelings towards OTHER_CHARACTER or not, and how they would feel or react regarding sexual interactions, intimacy and other interactions, include friendship, emotional, romantic and sexual aspects",
        });

        if (descriptionQuestion.done) {
            throw new Error("Generator ended unexpectedly while generating description for " + strangerKey);
        }

        const descriptionValue = descriptionQuestion.value.trim().split(name).join("{{char}}").split("OTHER_CHARACTER").join("{{other}}");

        card.body.push(`description: \`${descriptionValue}\`,`);
        card.body.push(`bondConditions: bondIncreaseDecreaseWhenStranger,`);
        card.body.push(`},`);
    }

    for (const [relationshipKey, relationshipValue] of Object.entries(SETTINGS)) {
        card.body.push(`${relationshipKey}: {`);

        for (const [romanticInterestKey, romanticInterestValue] of Object.entries(relationshipValue)) {
            card.body.push(`${romanticInterestKey}: {`);

            for (const [familyKey, familyValue] of Object.entries(romanticInterestValue)) {
                card.body.push(`${familyKey}: {`);

                const descriptionQuestion = await generator.next({
                    maxCharacters: 200,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "Provide a concise one paragraph description of how " + name + " perceives and feels about " + familyValue + ". Focus on the emotional and psychological aspects of their perception, rather than physical details. This should capture the essence of their feelings and attitudes towards this person in a way that informs their interactions and relationship dynamics.",
                    stopAfter: [],
                    stopAt: [],
                    instructions: "The response should use the word 'OTHER_CHARACTER' to refer to the other character name, ensure to specify whether " + name + " has any romantic feelings towards OTHER_CHARACTER or not, and how they would feel or react regarding sexual interactions, intimacy and other interactions, include friendship, emotional, romantic and sexual aspects",
                });

                if (descriptionQuestion.done) {
                    throw new Error("Generator ended unexpectedly while generating description for " + relationshipKey + " > " + romanticInterestKey + " > " + familyKey);
                }

                const descriptionValue = descriptionQuestion.value.trim().split(name).join("{{char}}").split("OTHER_CHARACTER").join("{{other}}");

                const secondBondIncreaseVariableLocation = "secondBondIncreaseDecreaseQuestions_" + romanticInterestKey;

                card.body.push(`description: \`${descriptionValue}\`,`);
                if (isAsexualValue || (familyValue === "family" && !isIncestuousValue)) {
                    card.body.push(`bondConditions: [...bondIncreaseDecreaseBase, ...${secondBondIncreaseVariableLocation}_reversed],`);
                } else {
                    card.body.push(`bondConditions: [...bondIncreaseDecreaseBase, ...${secondBondIncreaseVariableLocation}],`);
                }
                card.body.push(`},`);
            }

            card.body.push(`},`);
        }

        card.body.push(`},`);
    }

    card.body.push(`}));`);
    card.body.push("}")

    if (isAsexualValue) {
        const replacementsForCreepyBond = {
            "deepInLove_50_100": "sexualAbuseInterest_50_100",
            "strongRomanticInterest_35_50": "stalkingInterest_35_50",
            "romanticInterest_20_35": "obsessiveInterest_20_35",
            "slightRomanticInterest_10_20": "creepyInterest_10_20",
            "noRomanticInterest_0_10": "noRomance_0_10",
        }
        for (let i = 0; i < card.body.length; i++) {
            let line = card.body[i];
            Object.entries(replacementsForCreepyBond).forEach(([original, replacement]) => {
                if (line.includes(original)) {
                    line = line.split(original).join(replacement);
                }
            });
            card.body[i] = line;
        }
    }

    await generator.next(null); // end the generator

    return getJsCard(card);
}