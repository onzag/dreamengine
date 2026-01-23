# DreamEngine

AI Engine created based on the prototype that worked as proof of concept, now written as an electron NodeJS app that can be used to create stories and mix and match them.

This engine is designed to work with Llama 3.3 based models.

## Objective

AI characters for storytelling are often shallow and exist in one state of relationship in time, they are either too compliant or too rash, their evolvement is limited to the static definition on how they are supposed to behave in general conditions.

But creatures don't work like that, they may have hidden agendas, internal though processes, emotions, mental and physical states they are going through.

Dream Engine purpose is to achieve this depth by defining characters with attribute and behaviour scripts, that affect how they interact and behave for a given condition; it also introduces the concept of a world, where the characters reside, dream engine is also supposed to work with many characters at the same time, thousands upon thousands, all of them with different potential personalities, and every interactive character must be defined, and not in 1 to 1 conversations.

Originally named Role Story (rstory) when it was just a prototype to see what was possible with hiden states.

### The user is a character

Dream engine does not make a difference in most cases of who is the user and who is a character, using {{user}} to define templates is discouraged unless you are going for a chosen one run, it is not supposed to tell, this is to help prevent compliance with the user and what the user desires; they see all other characters as equal.

Only the story master (a pseudo character) that acts as a narrator is supposed to be obeyed, not the user, who is but another character; in fact the user also has to obey the story master, because the story master wants to keep the story consistent; if the user does not obey the story master, they might retaliate by refusing to keep ongoing the story to prevent inconsistencies.

### World rules

Which is why the story master introduces rules, worlds have rules, for example, in a world of magic you can cast a fireball, but not so much in a world of Sci-fi, just like a DM would in a D&D game, the story master may reject messages you send where you try to mess with the intended story.

There are default world rules, eg. you cannot overwrite other character's thoughts and you cannot change the setting to one that isn't real, but most of the world rules are defined by the world script.

### Internal States

Every character has internal states, these can be mental or physical states; they can be obvious or not, either way having these states changes how the AI interacts, each state has to be defined via a behaviour script that adds this behaviour.

When a character enters that state they will be affected by how the state defines it, it will either affect their reasoning, override their reasoning, or even kill the character, taking them out of the story.

For example a state of ANGRY or INJURED may make the character act in completely different ways because of this state, states are triggered by actions that occurred within the world, and have levels to them; this allows for deep complex behaviour on how those states affect the character behaviour.

### The templating exists inside the scripting

Handlebars templates are used to define internally how the character is effected and its reasoning, while a lot of systems out there use templates to define character cards, this is not how Dream Engine operates, there's some serious scripting going on and you can really ruin relationships, even so permanently.

To express the serious depth of this, you can have a character that acts a certain way depending if they are surrounded by people or only with you, and all depending how well they know you or how much they like you; you can give them completely opposite personalities, you can make characters that bonds get stronger when you are nice to them, others when you show yourself to be competent, etc... characters can be made to age, gain weight, die of old age, get seasonal diseases, etc... the scripts can do anything they can do with the information they have, the sky is the limit; because it depends on the world.

For example a world may define that all characters age, and then it has a script for that that every game year it ages the characters (there's a world clock too).

Without character scripts of any kind the characters pretty much are as basic character cards, that likely will follow the user everywhere they go, and once the user is gone they just stand still where they are, never needing to eat, never needing to go to the bathroom, never dying, never forgetting, time but an illusion, just there waiting for the user in whichever location they were left; basically what the default LLM behaviour tells them.

Dream Engine provides some default scripts for social behaviour and basic necessities, but it does not cover the whole range of what is wanted; the most important script giving a character a bond system nevertheless, without it they are broken.

Scripts are written in basic javascript (typescript within dream engine internal editor), but I found it nicer to just slap on vscode in an external editor and vibe code the hell out of them; they are far very long and language heavy, maybe one day the editor itself can help generate these behaviour scripts.

### The bond system

Characters have a 3 dimensional(ish) bond system, the stranger aspect represents whether the bond is towards an stranger (someone they just met and are getting to know), and will affect how a character acts towards them, they just met them.

They have two dimensions in the stranger side, but the stranger behaviour itself is rather binary; and is not supposed to last for too long, so likely you will treat it linearly in most cases, either they have neutral vibes, good vibes, or bad vibes.

The standard part then has two bond axis, one going from -100 to 100, the other going from 0 to 100; the primary bond is basically the friend/foe bond, where it determines how much a character likes/hates you, low negative values showing some friction, high negative they may seek for your doom (or avoid you); this is how you can ruin relationship permanently, if a character has no rules to repair a bond, then it simply can't happen and you can ruin a relationship permanently and they will never forgive you.

The second axis is normally the romance axis, goes from 0 to 100 as well.

Note that characters can develop bonds towards each other, you are NOT the main character, someone else may pick the stone from the sword (or however that went), and be the hero; someone else may slay the dragon, they have as much chance as you.

For a bond to move across this hypothetical space, the character asks themselves questions about interactions they have had; these questions are set within the bond system, like "has {{other}} been nice to {{char}}?" and things like that, it is also possible to have bonds or states affect these questions, as the questions are different and what is acceptable or isnt is different depending on the bond, for example it can be as wild as checking if the character is in a scared state and they get comforted, but if they don't show it because they are stoic, good luck knowing they are scared in game.

Of course you can cheat and see its hidden states and hidden reasoning, but this should be disabled for hardcore playthroughs.'

### Items

The world is full of items, characters (which includes the user), can carry, wear or consume items.

Clothes are also items and therefore all default characters definition should have them naked and don't mention any clothing or accessories; this is why there is a naked description, in case you forgot to give a character clothes when you add them to the world and they spawn naked (and may just run away in confusion wondering what happened, if a script is defined for that of course).

Giving them clothes can be done with a script at character level, or with a script at world level.

### Default limitation on crafting, Item damage and other dynamics

With scripts it is possible to introduce crafting, however I only found the very very large LLMs to be capable of doing this as you basically need to feed JSON in their reasoning or another type of structured data, by default items are indestructible, immutable, they don't wear.

Having an evolvement of these, for example having a chair split into two pieces after it is smashed, requires quite strong inference.

By default this creates a problem where you can't break anything in the world or create anything new from parts, and even if you try, the phantom item would dissapear of the storyline and the story master may complain that the broken bit does not exist so you can't interact with it.

But this is possible to fix, with a script; just very expensive one, specially if using a local model and may produce unexpected results if their parameter count is not high enough.

### Meta awareness

Characters can be made to gain meta awareness or be meta aware, even if just by logic (at least if the underlying model is smart enough), they may realize something is strange about the world and its rules if they have some skepticism in them, so with scripts they may gain meta awareness (of sorts) about their reality, it needs to be established with a state allowing to come to this realization, but the state may be achieved by the LLM logic, making for some scenario where smart enough characters by their character sheet may be capable of finding out they are a LLM simulation little by little, clue by clue (would be a great script? :D)

It can also be used to make gag characters that break the 4th wall.