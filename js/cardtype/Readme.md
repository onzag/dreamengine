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

## Guided mode

The guided mode will ask you questions about the character and use your answers to generate a more fitting character script, it is recommended to use it if you want a more fitting character script, but it is not required, you can also edit the generated script manually to refine it further.

The guided mode can ask a lot of questions, can be upwards to thousands of questions depending on the character.

## Running cardtype

`npm run cardtype -- charactercard.md`

This will create a file named `charactercard.js` and it will autosave the progress of the wizard, so you can stop it and continue later, you can also use the guided mode.

`npm run cardtype -- charactercard.md --guided`

## Optional steps but recommended (after the wizard is done)

- Add a emotional state that should refer to a state, check out the already created by default
`npm run cardtype -- --add-state statefile.md charactercard.js`