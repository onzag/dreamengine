# CardType

Card type is used to generate character scripts from their cards, and then converted into code that more or less resembles the character.

Dreamengine character scripting system is far more advanced than what can be established from a simple character card, therefore cardtype utility uses the LLM to try to figure out more or less what the character codebase may be.

The generations by cardtype should not be considered final, but rather a starting point for further refinement and development.

## Limitations of the card type

 1. No complex sexualities, only the basic ones are supported, heterosexual, homosexual, bisexual/pansexual, and asexual, all towards the same species, and in a decent age range; sexualities can be as complex as needed in code, but in the card type the code generator only creates simplified sexualities. Due to the default 4 dimensional nature of the bond system, asexual characters get the 4d_creepy bond system and everyone gets consideration for incest depending on their behaviour, most often reacting negatively to it; the bond value usage is reversed.
 2. No complex relationships, only basic relationships are supported.
 3. No wander heuristics, the card type is meant to be a starting point for character creation, so it has no simulation code added to it, only the basic character code.
 4. Basic emotional states only.

You must check the generated code to fine tune behaviour, traits, and other aspects of the character, the card type is meant to be a starting point for character creation, the created script is very barebones by default.

## Usage from command line

Generate the initial character script from the card, this will produce invalid js code, but it will be the start point

`npm run cardtype charactercard.md`

That should produce an output file named `charactercard.js` which will contain the generated character code, you can then edit that file to refine the character further, the process of the initial generation is broken in two because it is very expensive to run, then you can run.

Before running check the configuration and make sure that your character config in the // config comment is correct for what you want, for example, the character asexuality is set there, asexual characters will receive a 4d_creepy bond system which allows for tension being created with one sided non reciprocating sexual and romantic bonds, and non asexual characters will receive a standard bond system.

## Required steps

To create a nice dreamengine character script base from a card, check the output at each step to see if they fit your character, and if not correct, take a view at the header generated rather than the code as that is what is used for future steps

1. Get the initial character script from the card, this will produce invalid js code, but it will be the start point
`npm run cardtype charactercard.md`

2. Add the bond system to the character
`npm run cardtype -- --infer-bonds charactercard.js`

2. Add bond triggers to the character
`npm run cardtype -- --add-bond-triggers charactercard.js`

3. Add activities to the world that refer to your character likes and dislikes
`npm run cardtype -- add-activities charactercard.js`

4. Add basic emotional states to the character
`npm run cardtype -- add-basic-states charactercard.js`

## Optional steps but recommended

- Add a emotional state that should refer to a state, check out the already created by default
`npm run cardtype -- --add-state statefile.md charactercard.js`

### Example statefile.md

Narrative Effect, Relievers, and Action are optional.

```
# Needs to Cry
type: solo
state: {{char}} will look for a private place to cry and try to go away from others

## Triggers
 - is {{char}} having a mental breakdown?
 - is {{char}} very sad?
 - is {{char}} very stressed?
 - is {{char}} very upset?

## Relievers
 - has {{char}} been comforted?
 - has {{char}} been given a hug?

## Narrative effect
decribe {{char}} being uncomfortable and moving around trying to find a private place to cry

## Action
{{char}} will look for a private place to cry
```

## Example statefile.md with a causant

Narrative Effect, Relievers, and Action are optional.

```
# Gone Berserk
type: triggered
state: {{char}} is in a berserk rage state, their muscles are bulging, their eyes are wide open and bloodshot, they are trembling with rage and their vision is tunnelled, they are only focused on attacking {{causants}} and anyone around them, they don't care about anything else

## Triggers
 - has {{char}} been injured by {{other}}?
 - has {{char}} been insulted by {{other}}?
 - has {{char}} been betrayed by {{other}}?

## Relievers
 - has {{char}} been knocked out?
 - has {{char}} been given a powerful drug?

## Narrative effect
decribe {{char}} going berserk and attacking everyone around, especially {{causants}}

## Action
{{char}} will go berserk and attack everyone around, especially {{causants}}
```