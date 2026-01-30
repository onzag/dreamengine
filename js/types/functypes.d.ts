interface FunctionTypes {
/**
  The name of the user, only really useful if they are the chosen one or the likes
  @returns eg. Player
*/
user_name(DE: DEObject, char: CompleteCharacterReference, ): string;
/**
  The name of the character
  @returns eg. Aria, Thalon, Mira
*/
char(DE: DEObject, char: CompleteCharacterReference, ): string;
/**
  Boolean indicating if the character is male
  @returns true or false
*/
char_is_male(DE: DEObject, char: CompleteCharacterReference, ): boolean;
/**
  Boolean indicating if the character is female
  @returns true or false
*/
char_is_female(DE: DEObject, char: CompleteCharacterReference, ): boolean;
/**
  Boolean indicating if the character is of ambiguous gender
  @returns true or false
*/
char_is_ambiguous(DE: DEObject, char: CompleteCharacterReference, ): boolean;
/**
  Boolean indicating if the character sex is male
  @returns true or false
*/
char_sex_is_male(DE: DEObject, char: CompleteCharacterReference, ): boolean;
/**
  Boolean indicating if the character sex is female
  @returns true or false
*/
char_sex_is_female(DE: DEObject, char: CompleteCharacterReference, ): boolean;
/**
  Boolean indicating if the character sex is intersex
  @returns true or false
*/
char_sex_is_intersex(DE: DEObject, char: CompleteCharacterReference, ): boolean;
/**
  Boolean indicating if the character has no sex
  @returns true or false
*/
char_sex_is_none(DE: DEObject, char: CompleteCharacterReference, ): boolean;
/**
  The list of all characters available in the world, including the user
  @returns eg. [Arya, Thalon, Mira, Dorian, Luna, Kiro]
*/
all_world_characters(DE: DEObject, char: CompleteCharacterReference, ): string[];
/**
  The list of all characters available in the world, excluding the user
  @returns eg. [Arya, Thalon, Mira, Dorian, Luna, Kiro]
*/
all_world_characters_but_user(DE: DEObject, char: CompleteCharacterReference, ): string[];
/**
  The name of the character current location
  @returns eg. Eldoria, Shadowfen
*/
current_location(DE: DEObject, char: CompleteCharacterReference, ): string;
/**
  Boolean indicating if character is in a vehicle at the current location
  @returns true or false
*/
current_location_is_in_vehicle(DE: DEObject, char: CompleteCharacterReference, ): boolean;
/**
  Boolean indicating if the character is in a safe location at the current location
  @returns true or false
*/
current_location_is_safe(DE: DEObject, char: CompleteCharacterReference, ): boolean;
/**
  The list of all characters available in the current location of the world, including the user
  @returns eg. [Luna, Kiro]
*/
all_characters_at_location(DE: DEObject, char: CompleteCharacterReference, location_name:string): string[];
/**
  Boolean indicating if the provided location is a vehicle
  @returns true or false
*/
location_is_vehicle(DE: DEObject, char: CompleteCharacterReference, location_name:string): boolean;
/**
  Boolean indicating if the provided location is a safe location
  @returns true or false
*/
location_is_safe(DE: DEObject, char: CompleteCharacterReference, location_name:string): boolean;
/**
  The name of the characters/users/objects that activated the state last, it is available everywhere but it needs track_causants enabled for the state to work
  @returns eg. ["Aria", "Thalon", "Player", "The Ancient Sword"]
*/
get_last_state_causants(DE: DEObject, char: CompleteCharacterReference, state_name:string): string[];
/**
  The cause/reason for the last activation of the state, it requires track_cause enabled for the state to work
  @returns eg. 'helped me with my chores', 'betrayed me in the past'
*/
get_last_state_cause(DE: DEObject, char: CompleteCharacterReference, state_name:string): string[];
/**
  The name of the characters only that activated the state last, it is available everywhere but it needs track_causants enabled for the state to work
  @returns eg. ["Aria", "Thalon", "Player"]
*/
get_last_state_character_causants(DE: DEObject, char: CompleteCharacterReference, state_name:string): string[];
/**
  The name of the characters only that activated the state last, it is available everywhere but it needs track_causants enabled for the state to work
  @returns eg. ["Aria", "Thalon", "Player"]
*/
get_last_state_object_causants(DE: DEObject, char: CompleteCharacterReference, state_name:string): string[];
/**
  Get the list of active states for the current character
  @returns eg. [ANGRY, TIRED, HAPPY]
*/
get_states(DE: DEObject, char: CompleteCharacterReference, ): string[];
/**
  Get the intensity of the specified active state for the current character, intensities are integer numbers from 0 to 4
  @returns eg. 0, 1, 2, 3, 4
*/
get_state_intensity(DE: DEObject, char: CompleteCharacterReference, state_name:string): number;
/**
  Check if the current character has the specified active state
  @returns eg. true or false
*/
has_state(DE: DEObject, char: CompleteCharacterReference, state_name:string): boolean;
/**
  Check if the current character has just activated the specified state in this interaction
  @returns eg. true or false
*/
state_has_just_activated(DE: DEObject, char: CompleteCharacterReference, state_name:string): boolean;
/**
  Get how many inference cycles ago the state was activated for the provided character
  @returns eg. 3, it will return -1 if the state is not found ever
*/
get_state_activation_cycles_ago(DE: DEObject, char: CompleteCharacterReference, state_name:string): number;
/**
  Get the list of social group members for the current character
  @returns eg. [Arya, Thalon, Mira]
*/
get_social_group(DE: DEObject, char: CompleteCharacterReference, min_bond_level:number, max_bond_level:number, min_2_bond_level:number, max_2_bond_level:number): string[];
/**
  Get the list of social group members for the current character that are present at the same location as our character
  @returns eg. [Arya, Thalon, Mira]
*/
get_present_social_group(DE: DEObject, char: CompleteCharacterReference, min_bond_level:number, max_bond_level:number, min_2_bond_level:number, max_2_bond_level:number): string[];
/**
  Get the list of social group members for the current character, that are not only present but also in a conversation with our character
  @returns eg. [Thalon, Mira]
*/
get_present_conversing_social_group(DE: DEObject, char: CompleteCharacterReference, min_bond_level:number, max_bond_level:number, min_2_bond_level:number, max_2_bond_level:number): string[];
/**
  Get the difference between the provided list and the present social group members
  @returns eg. [Arya, Thalon]
*/
get_difference_of_present_social_group(DE: DEObject, char: CompleteCharacterReference, list:string[]): string[];
/**
  Get the list of social group members that are gone forever (most likely dead) for the current character
  @returns eg. [Thalon, Mira]
*/
get_ex_social_group(DE: DEObject, char: CompleteCharacterReference, min_bond_level:number, max_bond_level:number, min_2_bond_level:number, max_2_bond_level:number): string[];
/**
  Get the age of the character
  @returns eg. 25
*/
get_age(DE: DEObject, char: CompleteCharacterReference, character:string): number;
/**
  Get the weight of the character
  @returns eg. 70
*/
get_weight(DE: DEObject, char: CompleteCharacterReference, character:string): number;
/**
  Get the height of the character
  @returns eg. 170
*/
get_height(DE: DEObject, char: CompleteCharacterReference, character:string): number;
/**
  Boolean indicating if the character is dead
  @returns true or false
*/
is_dead(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if the character is male
  @returns true or false
*/
is_male(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if the character is female
  @returns true or false
*/
is_female(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if the character is of ambiguous gender
  @returns true or false
*/
is_ambiguous(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if the character sex is male
  @returns true or false
*/
is_sex_male(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if the character sex is female
  @returns true or false
*/
is_sex_female(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if the character sex is intersex
  @returns true or false
*/
is_sex_intersex(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if the character has no sex
  @returns true or false
*/
is_sex_none(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if the string given is a character, this will give true to the user as well
  @returns true or false
*/
is_char(DE: DEObject, char: CompleteCharacterReference, potential_character:string): boolean;
/**
  Boolean indicating if the character is the user
  @returns true or false
*/
is_user(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if the character is a present member of the social
  @returns true or false
*/
is_present_member(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if the character is not present in the location
  @returns true or false
*/
is_not_present(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if the character is gone forever (most likely dead)
  @returns true or false
*/
is_gone(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if the character is currently in a conversation with our character
  @returns true or false
*/
is_in_conversation(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if the character is currently indoors
  @returns true or false
*/
is_indoors(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if the character is currently outdoors
  @returns true or false
*/
is_outdoors(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if the character has the specified item in their inventory
  @returns true or false
*/
has_item(DE: DEObject, char: CompleteCharacterReference, character:string, item_name:string): boolean;
/**
  Boolean indicating if the character is currently standing
  @returns true or false
*/
is_standing(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if the character is currently sitting
  @returns true or false
*/
is_sitting(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if the character is currently laying down
  @returns true or false
*/
is_laying_down(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  String indicating a location where another character should be at according to the character's knowledge
  @returns true or false
*/
last_saw(DE: DEObject, char: CompleteCharacterReference, character:string): string;
/**
  Boolean indicating if the character is a member that got lost after being left behind (known to this member)
  @returns true or false
*/
has_no_idea_where_is(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if the character does not know the questioned character and does not have a bond with them
  @returns true or false
*/
does_not_know(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if the character has a stranger relationship with the questioned character
  @returns true or false
*/
is_strangers_with(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Get the bond value of our character towards the questioned character
  @returns eg. 50
*/
get_bond_towards(DE: DEObject, char: CompleteCharacterReference, character:string): number;
/**
  Get the secondary bond value of our character towards the questioned character
  @returns eg. 30
*/
get_secondary_bond_towards(DE: DEObject, char: CompleteCharacterReference, character:string): number;
/**
  Boolean indicating if our character is at the same location of the questioned character
  @returns true or false
*/
is_at_same_location(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if our character is with the questioned character, taking the same slot
  @returns true or false
*/
is_at_same_slot(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  Boolean indicating if the character is at the current location of the world
  @returns true or false
*/
is_here(DE: DEObject, char: CompleteCharacterReference, character:string): boolean;
/**
  intersects two lists
  @returns eg. [Arya, Thalon]
*/
intersect(DE: DEObject, char: CompleteCharacterReference, list1:string[], list2:string[]): string[];
/**
  unites two lists
  @returns eg. [Arya, Thalon, Mira]
*/
union(DE: DEObject, char: CompleteCharacterReference, list1:string[], list2:string[]): string[];
/**
  difference between two lists
  @returns eg. [Arya]
*/
difference(DE: DEObject, char: CompleteCharacterReference, list1:string[], list2:string[]): string[];
/**
  formats a list with commas and 'and', do not use this for formatting causants use format_comma_list
  @returns eg. Arya, Thalon, and Mira
*/
format_and(DE: DEObject, char: CompleteCharacterReference, list:string[]): string;
/**
  formats a list with commas only, do not use this for formatting causants use format_comma_list
  @returns eg. Arya, Thalon, Mira
*/
format_comma_list(DE: DEObject, char: CompleteCharacterReference, list:string[]): string;
/**
  formats a list with commas and 'or'
  @returns eg. Arya, Thalon, or Mira
*/
format_or(DE: DEObject, char: CompleteCharacterReference, list:string[]): string;
/**
  The length of the list
  @returns eg. 3
*/
length(DE: DEObject, char: CompleteCharacterReference, list:any[]): number;
/**
  Boolean indicating if the value is in the list
  @returns true or false
*/
in(DE: DEObject, char: CompleteCharacterReference, value:any, list:any[]): boolean;
/**
  Boolean indicating if value1 is greater than value2
  @returns true or false
*/
gt(DE: DEObject, char: CompleteCharacterReference, value1:number, value2:number): boolean;
/**
  Boolean indicating if value1 is less than value2
  @returns true or false
*/
lt(DE: DEObject, char: CompleteCharacterReference, value1:number, value2:number): boolean;
/**
  Boolean indicating if value1 is equal to value2
  @returns true or false
*/
eq(DE: DEObject, char: CompleteCharacterReference, value1:number, value2:number): boolean;
/**
  Boolean indicating if value1 is not equal to value2
  @returns true or false
*/
neq(DE: DEObject, char: CompleteCharacterReference, value1:number, value2:number): boolean;
/**
  Boolean indicating if value1 is less than or equal to value2
  @returns true or false
*/
lte(DE: DEObject, char: CompleteCharacterReference, value1:number, value2:number): boolean;
/**
  Boolean indicating if value1 is greater than or equal to value2
  @returns true or false
*/
gte(DE: DEObject, char: CompleteCharacterReference, value1:number, value2:number): boolean;
/**
  Formats the object pronoun for a list of characters or a single character
  @returns eg. are, is
*/
format_verb_to_be(DE: DEObject, char: CompleteCharacterReference, list_or_character:string|string[]): string;
/**
  Formats the plural or singular form based on the list of characters or a single character
  @returns eg. sword, swords
*/
format_plural_or_singular(DE: DEObject, char: CompleteCharacterReference, list_or_character:string|string[], plural, singular): string;
/**
  Formats the object pronoun for a list of characters or a single character
  @returns eg. him, her, them
*/
format_object_pronoun(DE: DEObject, char: CompleteCharacterReference, list_or_character:string|string[]): string;
/**
  Formats the possessive pronoun for a list of characters or a single character
  @returns eg. his, her, their
*/
format_possessive(DE: DEObject, char: CompleteCharacterReference, list_or_character:string|string[]): string;
/**
  Formats the reflexive pronoun for a list of characters or a single character
  @returns eg. himself, herself, themself
*/
format_reflexive(DE: DEObject, char: CompleteCharacterReference, list_or_character:string|string[]): string;
/**
  Formats the pronoun for a list of characters or a single character
  @returns eg. he, she, they
*/
format_pronoun(DE: DEObject, char: CompleteCharacterReference, list_or_character:string|string[]): string;
/**
  Formats the ownership pronoun for a list of characters or a single character
  @returns eg. his, hers, theirs
*/
format_ownership_pronoun(DE: DEObject, char: CompleteCharacterReference, list_or_character:string|string[]): string;
/**
  Generates a random seed integer from a string input for this specific character, the range will be from 0 to options_number - 1, useful for creating random character traits for instantiable characters that will get a random name
  @returns integer
*/
get_random_seed_from_string(DE: DEObject, char: CompleteCharacterReference, options_number:number, input_string:string): number;
/**
  Generates a random seed based on the current world time, the range will be from 0 to options_number - 1, useful for creating random events that change over time
  @returns integer
*/
get_random_seed_from_time(DE: DEObject, char: CompleteCharacterReference, options_number:number): number;
/**
  Provides one of the random options by using the time as the seed
  @returns string
*/
get_random_option(DE: DEObject, char: CompleteCharacterReference, options:string[]): string;
/**
  Provides one of the random options by using the character name and time as the seed, useful for generating consistent random choices per character that change over time
  @returns string
*/
get_random_option_fixed_character(DE: DEObject, char: CompleteCharacterReference, options:string[]): string;
}
