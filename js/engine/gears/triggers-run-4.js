// Action probabilities, cooldowns, and ordered action stages.
import { runAffectionActions } from './triggers-run-5.js';
import { runIntimateAffectionActions } from './triggers-run-6.js';
import { runSexActions } from './triggers-run-7.js';

/** @param {import('./triggers-run-3.js').BondTriggerContext} context */
export async function runIntimacyActions(context) {
    const {
        character, deObject, bond, bondDeclaration, multiplier, alreadyInAffectionateAct,
        alreadyInIntimateAct, alreadyInSex,
    } = context;

    let proneToInitiateAffectionProbability = await bondDeclaration.intimacy.proneToInitiatingAffection.probability(character, deObject.characters[bond.towards]);
    let proneToInitiateIntimateAffectionProbability = await bondDeclaration.intimacy.proneToInitiatingIntimateAffection.probability(character, deObject.characters[bond.towards]);
    let proneToInitiateSexProbability = await bondDeclaration.intimacy.proneToInitiatingSex.probability(character, deObject.characters[bond.towards]);

    proneToInitiateAffectionProbability *= alreadyInAffectionateAct ? 2 : proneToInitiateAffectionProbability;
    proneToInitiateAffectionProbability *= multiplier;
    if (proneToInitiateAffectionProbability > 1) {
        proneToInitiateAffectionProbability = 1;
    }
    proneToInitiateIntimateAffectionProbability *= alreadyInIntimateAct || alreadyInAffectionateAct ? 2 : proneToInitiateIntimateAffectionProbability;
    proneToInitiateIntimateAffectionProbability *= multiplier;
    if (proneToInitiateIntimateAffectionProbability > 1) {
        proneToInitiateIntimateAffectionProbability = 1;
    }
    proneToInitiateSexProbability *= alreadyInSex ? 0 : (alreadyInIntimateAct || alreadyInAffectionateAct ? 2 : proneToInitiateSexProbability);
    proneToInitiateSexProbability *= multiplier;
    if (proneToInitiateSexProbability > 1) {
        proneToInitiateSexProbability = 1;
    }

    await runAffectionActions(context, proneToInitiateAffectionProbability);

    const characterLibido = character.libido;
    if (!characterLibido) {
        return;
    }

    const cooldownPeriodHours = (1 - characterLibido) * 48; // from 0 hours at libido 1 to 48 hours at libido 0
    const cooldownPeriodMilliseconds = cooldownPeriodHours * 60 * 60 * 1000;

    const intimateCooldownPeriodHours = (1 - characterLibido) * 1;
    const intimateCooldownPeriodMilliseconds = intimateCooldownPeriodHours * 60 * 60 * 1000;

    const timeSinceLastSexualFullfillment = character.state["last_sexual_fullfillment_act"] ? deObject.currentTime.time - (character.state["last_sexual_fullfillment_act"]) : null;
    const timeSinceLastIntimateAffection = deObject.currentTime.time - (character.state["last_intimate_affectionate_act_initiated_towards_" + bond.towards] || 0);

    const sexCooldownActive = timeSinceLastSexualFullfillment === null ? false : timeSinceLastSexualFullfillment < cooldownPeriodMilliseconds;
    let sexCooldownRatio = sexCooldownActive && cooldownPeriodMilliseconds > 0 && timeSinceLastSexualFullfillment !== null ? (timeSinceLastSexualFullfillment / cooldownPeriodMilliseconds) : 1;
    if (sexCooldownRatio > 1) {
        sexCooldownRatio = 1;
    }

    const intimateAffectionCooldownActive = timeSinceLastIntimateAffection < intimateCooldownPeriodMilliseconds;
    let intimateAffectionCooldownRatio = intimateAffectionCooldownActive && intimateCooldownPeriodMilliseconds > 0 ? (timeSinceLastIntimateAffection / intimateCooldownPeriodMilliseconds) : 1;
    if (intimateAffectionCooldownRatio > 1) {
        intimateAffectionCooldownRatio = 1;
    }

    proneToInitiateSexProbability *= sexCooldownRatio;
    if (sexCooldownActive && sexCooldownRatio > intimateAffectionCooldownRatio) {
        proneToInitiateIntimateAffectionProbability *= sexCooldownRatio;
    } else {
        proneToInitiateIntimateAffectionProbability *= intimateAffectionCooldownRatio;
    }

    await runIntimateAffectionActions(context, proneToInitiateIntimateAffectionProbability);
    await runSexActions(context, proneToInitiateSexProbability);
}
