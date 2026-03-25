# CardType

Card type is used to generate character scripts from their cards, and then converted into code that more or less resembles the character; characters that are written in code are more defined and can have far more complexity and depth, so it is the recommended way to create characters, but the card type can be used for quick character creation and to get a general overview of the character, which can then be used as a basis for writing the character in code. It is also useful for creating characters that are not meant to be interacted with in depth, such as background characters or characters that are only mentioned in passing.

CardType generator connects to the de-server, and then builds a character card based on the information provided in the character code, and then generates a character card based on that information, which can then be used to generate a character code based on the information provided in the card, it is a two way process that allows for quick character creation and refinement.

The content of this card will be fed onto a LLM and then the AI model of your choice in the server and it will attempt to generate the character code, it will use the standard 4 dimensional relationship setting building around 203 potential relationship types.

Use the card type generation result to refine a character further after the initial generation, the card type is meant to be a starting point for character creation, and it is expected that the character will be further refined and developed after the initial generation, so use the generated code as a basis for further development and refinement of the character.

## Limitations of the card type

 1. No complex sexualities, only the basic ones are supported, heterosexual, homosexual, bisexual, and asexual; sexualities can be as complex as needed in code, but in the card type the code generator only creates simplified sexualities
 2. No complex relationships, only basic relationships are supported.
 3. No wander heuristics, the card type is meant to be a starting point for character creation, so it has no simulation code added to it, only the basic character code.
 4. Basic emotional states only, no complex states or traits, some examples of states added are Happy, Sad, Angry, etc...

You must check the generated code to fine tune behaviour, traits, and other aspects of the character, the card type is meant to be a starting point for character creation, the created script is very barebones by default.

## Usage from command line

Generate the initial character script from the card, this will produce invalid js code, but it will be the start point

`npm run cardtype charactercard.md`

That should produce an output file named `charactercard.js` which will contain the generated character code, you can then edit that file to refine the character further, the process of the initial generation is broken in two because it is very expensive to run, then you can run.

Before running check the configuration and make sure that your character config in the // config comment is correct for what you want, for example, the character asexuality is set there, asexual characters will receive a 4d_creepy bond system which allows for tension being created with one sided non reciprocating sexual and romantic bonds, and non asexual characters will receive a standard bond system.

`npm run cardtype --infer-bonds charactercard.js`

This will modify charactercard.js to add the bond system that was missing, 