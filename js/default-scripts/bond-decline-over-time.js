/**
 * Causes bonds to decline over time if they are not interacted with.
 * losing friendship bonds at a given rate if the character is not interacted with
 * over a period of time, simulating neglect; also adds the state that may make
 * a character be upset about having their friendship neglected; you need to specify this
 * as by default the character bond will simply degenerate without any special behavior.
 * 
 * Characters with only stranger bonds will also lose those bonds over time and then
 * dissapear from the character's bonds if the bond level reaches zero (as in they forgot about these strangers).
 * 
 * You can cap a character bond decline to a minimum level
 * 
 * This should not be added to user as the user bonds are not managed.
 */