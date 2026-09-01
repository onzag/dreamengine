# Dreamengine App

This app is an UI frontend for the Dreamengine itself, in theory the engine is agnostic to the frontend, but this app is designed to work with it.

Because an app is a frontend, it supports extra metadata that is not designed to be used by the engine itself, but rather to help the app to work better with the engine.

## Script Level Metadata Fields (Characters)

### __name

The `__name` field is used to specify the name of a character. A script may be denoted as "characters" type but such script can contain any number of characters, and the `__name` field is used to specify a single character name for the script. This is useful for scripts that are designed to be used with a single character, and the app can use this field to display the character's name in the UI.

After all the name of a character is unknown without running the script, so this field is used to specify the name of a character for the app to use in the UI.

Format: `__name = "Character Name"`

### height

The `height` field is used to specify the height of a character in centimeters. The app can use this field to display the character's height in the UI.

Format: `height = 170`

### gender

The `gender` field is used to specify the gender identity of a character. The app can use this field to display the character's gender in the UI.

Format: `gender = "male" | "female" | "ambiguous"`

### sex

The `sex` field is used to specify the biological sex of a character. The app can use this field to display the character's sex in the UI.

Format: `sex = "male" | "female" | "intersex" | "none"`

### age

The `age` field is used to specify the age of a character in years. The app can use this field to display the character's age in the UI.

Format: `age = 25`

### weight

The `weight` field is used to specify the weight of a character in kilograms. The app can use this field to display the character's weight in the UI.

Format: `weight = 70`

### species

The `species` field is used to specify the species of a character. The app can use this field to display the character's species in the UI.

Format: `species = "Human"`

### speciesType

The `speciesType` field is used to specify the type of species of a character. The app can use this field to display the character's species type in the UI.

Format: `speciesType = "feral" | "animal" | "humanoid"`

### sounds

TODO implement the sound system in the app, maybe move it to DE as standard?... how would the sound engine even work, hmmm?...

The `sounds` field is used to specify the sounds a character can make.

The keys can be arbitrary.

The sounds should be wav files.

Format: `sounds = {cough: ["cough1.wav", "cough2.wav", "cough3.wav"], laugh: ["laugh1.wav", "laugh2.wav", "laugh3.wav"], sigh: ["sigh1.wav", "sigh2.wav", "sigh3.wav"], ...}`

## Script Level Metadata Fields (World)

### intro

An introduction for the world, only really read in the world script, an array of title subtitle pairs, the app can use this field to display the introduction in the UI.

Delay is optional, and if not specified, the app will request the user to click to continue.

Format: `intro = [{title: "Title", subtitle: "Subtitle", delay?: 1000}, {title: "Title 2", subtitle: "Subtitle 2", delay?: 1000}, ...]`

### voice

The voice of the narrator of the world, this is used to specify how the narrator's voice sounds

Format: `voice = {sample: "voice_narrator.wav", prompt: "a powerful narrator voice"}`

## Internal Metadata Fields

### DE.world.metadata.theme

The theme song of the world, this is used to specify the base theme song of the world, and the app can use this field to play the theme song when loading the world.

Format: `DE.world.metadata.theme = {asset: "song.mp3", volume: 1.0}`

### DE.world[locationID].metadata.theme

The theme song of a specific location, this is used to specify the theme song of a specific location, and the app can use this field to play the theme song when loading the location.

Format: `DE.world[locationID].metadata.theme = {asset: "song.mp3", volume: 1.0}`

### DE.world[locationID].slots[slotID].metadata.theme

The theme song of a specific slot, this is used to specify the theme song of a specific slot, and the app can use this field to play the theme song when loading the slot.

Format: `DE.world[locationID].slots[slotID].metadata.theme = {asset: "song.mp3", volume: 1.0}`

### DE.world[locationID].metadata.asset

The image asset of a specific location, this is used to specify the image asset of a specific location, and the app can use this field to display the image when loading the location.

Format: `DE.world[locationID].metadata.asset = "image.png"`

### DE.world[locationID].slots[slotID].metadata.asset

The image asset of a specific slot, this is used to specify the image asset of a specific slot, and the app can use this field to display the image when loading the slot.

Format: `DE.world[locationID].slots[slotID].metadata.asset = "image.png"`

### DE.characters[characterID].metadata.asset[emotion]

The image asset of a specific character's emotion, this is used to specify the image asset of a specific character's emotion, and the app can use this field to display the image when loading the character's emotion.

Format: `DE.characters[characterID].metadata.asset[emotion] = "image.png"`

### DE.characters[characterID].metadata.asset[emotion].voice

The `voice` field is used to specify how the voice of a character sounds, it should be distributed by different emotions, based on the emotions.js file.

The sample should be an ogg/mp3 file less than 1MB in size, the transcript is not required by default.

Format: `DE.characters[characterID].metadata.voice[emotion].voice = {sample: "voice_happy.ogg", transcript: "hello..."}`

### DE.characters[characterID].metadata.voiceModifiers[name]

The `voiceModifiers` field is used to specify modifiers the character's voice can have, it should be distributed by different emotions, based on the emotions.js file, for example, whispering, mumbling, shouting, etc...

The sample should be an ogg/mp3 file less than 1MB in size, the transcript is not required by default.

The name is arbitrary, but should be descriptive of the modifier, for example, "whispering", "mumbling", "shouting", etc...

Format: `DE.characters[characterID].metadata.voiceModifiers[name] = {sample: "voicemod_whispering.ogg", prompt: "whispering", transcript: "hello..."}`

### DE.characters[characterID].metadata.sounds[name]

The `sounds` field is used to specify sounds the character can make, it should be distributed by different emotions, based on the emotions.js file, for example, cough, laugh, sigh, etc...

The samples array should be an ogg/mp3 file less than 1MB in size, for options, the name is arbitrary, but should be descriptive of the sound, for example, "cough", "laugh", "sigh", etc...

Format: `DE.characters[characterID].metadata.sounds[name] = {samples: ["sound_cough_0.ogg", "sound_cough_1.ogg"], written: "{char} coughs", type: "narrative"}`

Format: `DE.characters[characterID].metadata.sounds[name] = {samples: ["sound_scream_0.ogg", "sound_scream_1.ogg"], written: "ARGH!", type: "dialogue"}`

Format: `DE.characters[characterID].metadata.sounds[name] = {samples: ["sound_sigh_0.ogg", "sound_sigh_1.ogg"], type: "invisible"}`