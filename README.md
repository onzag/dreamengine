# WildReality DreamEngine (WIP)

AI Simulation Engine created based on the RStory prototype, now written as an electron NodeJS app that can be used to create stories and mix and match them.

## Differences from Kobold / SillyTavern

DreamEngine is made as a LLM Roleplay Simulation engine, not as a simple method to interact with language models in roleplay settings; therefore it is considerably more advanced than thin LLM clients that set up character cards.

The name DreamEngine is not merely a name, it is indeed akin a small RPG game engine with lifecycles, that orchestate using a LLM to mantain an internal game state, therefore:

### Item Persistance
If you head to a location, and pick up an item and place it on a table; then come back after 10000 messages, the item will still be right where you left it, unless someone else moved it.

### Character Evolvement
Characters have an extremely complex bond system that can cause them to evolve differently, depending on their behaviour, not only towards the user but towards the other characters.

The strength of a bond with a character causes them to build relationships, that change over time; and how they change is fully customizable.

### The User is a Character
From the Engine Perspective, the user is also a character; they are not trated any specially than the others, the user is not the main character and does not dictate the rules.

### Story Rules
A sci-fi world does not allow magic, you are not strong enough to carry an item, you cannot beat the dragon, etc... these are all rules that can be set up in the story, and the characters will abide by them, they will not do things that are not allowed in the story, and they will not do things that they are not strong enough to do.

### Characters have traits, states and triggers
Characters are a complex dynamic of traits, hidden mental and emotional states and triggers (reactions to the environment); that cause them to behave a certain way, since a script can also define these, a character can be constructed of many imported traits, states and triggers; or otherwise fully customized.

The level of customization of the behaviour of a character is virtually endless, and because it doesn't consume attention in the final execution; a character can be absurdly complex, even, and it will not affect quality of the output.

### Characters experience the world individually
Each character experiences the world in their own way, they have their own perspective and knowledge and even remember events differently.

### No omnicience
Character do not have omnicience, that includes you, the user. Things that happen when a character is not present are simply unknowable by such character.

### Virtually Endless Context Size
The context is automatically resized as the story flows, DreamEngine uses a Dynamic exponential resizing context that keeps the story fresh and limits repetition by itself.

### Power Scaling
Builtin base and extendable power scaling system means you cannot just solo a universe by default, not even if you believe in yourself.

### Works with any underlying model
So as long as it is compatible with the inner infrastructure, Llama, Mistral, GLM, etc...

### NSFW Capable
Capable of being explicit, capable of being conditionally explicit too; you may need to build bonds and relationships first or otherwise you will destroy your relationship, the conditional nature means characters can respond very negatively to unproper advances, highly realistic, the 2nd axis of the bond system is often used for romantic/sexual advances with characters and determines what is and isn't possible.

### Enforced World Layout
The world is defined granulary, every item, every location, every character position, place, posture, etc... is determined, and the characters will abide by it.

### Volume and Weight
The world is physical, therefore items have weight and volume, characters have strength and carrying capacity, and the world behaves accordingly.

### And More
The engine behaviour is fully customizable via scripting, after all; entire verses can be coded. The engine only shines then, it is meant as a world simulator not as a simple roleplay engine.

You can have missions, events, quests, etc... the world is your oyster.

## Key Considerations

### Extra Inference

DreamEngine quite often uses the LLM to keep track of the characters and their states, while some of the features are analyzed using heuristic, others come from LLM analysis, therefore, with very small models with low reasoning, DreamEngine can easily corrupt its own state (Chair stacking problem, as it tends to pile chairs when the model reasoning is low).

The extra inference also costs many input tokens, while it is mostly mere yes/no questions, this can cause the model to take its time before it actually updates the game state. This means that DreamEngine works best with models that are at least 120B+ parameters with at least a RTX 6000 Blackwell powering a 4-quant version.

The more characters and the more things at a location at once, the more these extra costs.

While it will still work with smaller models, there is increased likelyhood of "ghostly actions" and a disconnect of the game state with the flow of the story.

### Scripting

DreamEngine ditches the concept of character cards, it's just not how it works, instead characters, worlds and items are all scripts.

Written in simple JavaScript, these are sandboxed scripts that run during LLM playthroughs to affect the game state and therefore the world behaviour.

Character cards are simply not compatible, so they cannot be reused.

On the other hand, the behaviour characters can display with DreamEngine scripting system is arbitrary and highly rich and complex, even in weaker LLM models (even in those that fail at keeping track of the world state), therefore the behaviour is rich and complex.

Character can be made to age, mature, change depending on circumstances, etc... the sky is the limit.

Because the system is not attention based, it doesn't consume tokens.

## Local Servers

For local servers check out [DreamServer](https://github.com/onzag/de-server), a local server implementation for the DreamEngine protocol, that can be used to run the engine on your own hardware, and connect to it via this client, either in NodeJS or the Electron app client.