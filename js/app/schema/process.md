Build initial prompt text that species the first scenario

PROCESS

Manipulation check, check if the prompt (Inference) given talks about other characters in a way that manipulates their behaviour and reject the prompt if that is the case, basically the prompt has to be validated before proceeding.

World consistency check, check if the prompt is consistent with the world, eg. no magic if no magic is allowed, this is a world rule, described in the world.

Death check (Inference) check if the user has been killed.

Check time skip (Inference) will cause decaying states to fully decay, time skip should also occur if location changed with far away locations

Reroll Location of Characters that are not currently present, some characters may end up in the unknown zone by their lost potential
rerolls happen every inference, so they may end back at a location
    World has a property that may absorb some characters at a given location, more likely there
    Apply change of states due to being lost

LOC_CALC: If at a given location, are they still at the same given location or has it changed? (Inference)
    YES:
        is it to one of the recognized locations?... (Inference) Is it close or far away?...
            YES:
                Calculate location information, location is x
                Update scenario and location variables for all prompts, next location and all
                Calculate character list for location, who tagged along? (Inference)
                Recalculate present characters and any characters have reunited
            NO:
                Calculate for unknown, location is somewhere near x or location far from x if far away
                If a character is lost from the original source location, with a random roll encounter, they may be there at this unknown provided they got lost at source
                Who tagged along? (inference)
    NO:
        Who is still at location? (inference) Did any character leave?...

CHAR_CALC: Collect characters at the given location, if it had changed from
Find if user/character last message is forcing a character to spawn where not present. (Inference) who is most likely to be? from a list.
    YES, user/character spawned them:
        Add them to the character at a given location

If the location changed:
    Describe the location and the characters available for ui purposes, but inject it into the location; use bonds, everything available, to make a description and put it just before the user message as if user has explained that. (Inference) ensure it is described and consistent with the last user message, and add this scenario randomly if it didnt include one.

    Put this message too to be visible about the area, why not?...

Per character list
Did user interact with any of the characters in the current character available list?... (Inference)
    YES, PER Character (Must include short context references, like calling them out not by name):
        Save in interacted with.

Are there characters non-interacted?...
    YES, PER Character.
        Does Character have a friendship/stranger bond with player?...
            Roll initiative x 2
            Add to list if pass
        No:
            Roll initiative / 2
            Add to list if pass

Is the list still empty?
    Roll initative for everyone, with the x2 and /2 modifiers for bond.

Is the list still empty?
    None replies...

Loop per interacted character
    Calculate character state (Inference)
    Calculate dead ends (Inference)
    Run prompt with rolling emotion (Inference Heavy), use collective memory [important] rather than whole prompt
    Go to LOC_CALC
    Go to CHAR_CALC

Loop per interacted character
    Calculate bond progression (Inference)
    Calculate cross bond progression (Inference) among characters