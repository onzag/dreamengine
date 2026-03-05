#from llama_cpp import Llama
from sys import argv
from os import path
import os
import json
from lib.bonds import BondsHandler
from lib.emotion import EmotionHandler
from lib.states import StatesHandler
from lib.scenery import SceneryHandler
from lib.ui import ChatWindow
from PySide6.QtWidgets import QApplication
import websocket

CONTEXT_WINDOW_SIZE = 8192
REPEAT_PENALTY = 1.1
FREQUENCY_PENALTY = 0.0
PRESENCE_PENALTY = 0.0
TEMPERATURE = 1.0
TOP_P = 0.9

LAST_EMOTIONS_TRIGGERED = set()
LAST_STATES_TRIGGERED_ADD = set()
LAST_STATES_TRIGGERED_DISCARD = set()

# Path to your GGUF file (adjust to your fast SSD)
# must be Llama 3.3 compatible model for these settings to work properly
model_path = argv[1]

character_folder = argv[2]
character_system_description_path = path.join(character_folder, "system.txt")
character_name_path = path.join(character_folder, "name.txt")
character_pronouns_path = path.join(character_folder, "pronouns.txt")

#MODE = "L3"
MODE = "MISTRAL"

# SERVER_MODE = "NEW"
# SERVER_MODE = "LEGACY"

SERVER_HOST = "ws://localhost:8000"
SERVER_KEY = "dev-secret-12345678900abcdef"

# wait until the server is ready
import time
time.sleep(1)  # wait a bit for the server to start, cheap, trash code but whatever

if not path.exists(character_folder):
    print("Character folder does not exist:", character_folder)
    exit(1)

def save_settings():
    """Save current settings to settings.json"""
    global CONTEXT_WINDOW_SIZE
    global REPEAT_PENALTY
    global FREQUENCY_PENALTY
    global PRESENCE_PENALTY
    global TEMPERATURE
    global TOP_P
    global character_folder
    settings = {
        "context_window_size": CONTEXT_WINDOW_SIZE,
        "repeat_penalty": REPEAT_PENALTY,
        "frequency_penalty": FREQUENCY_PENALTY,
        "presence_penalty": PRESENCE_PENALTY,
        "temperature": TEMPERATURE,
        "top_p": TOP_P,
    }
    with open(path.join(character_folder, "settings.json"), "w", encoding="utf-8") as f:
        json.dump(settings, f, ensure_ascii=False, indent=4)

def load_settings():
    """Load settings from settings.json if it exists"""
    global CONTEXT_WINDOW_SIZE
    global REPEAT_PENALTY
    global FREQUENCY_PENALTY
    global PRESENCE_PENALTY
    global TEMPERATURE
    global TOP_P
    global character_folder
    settings_path = path.join(character_folder, "settings.json")
    if path.exists(settings_path):
        with open(settings_path, "r", encoding="utf-8") as f:
            settings = json.load(f)
            CONTEXT_WINDOW_SIZE = settings.get("context_window_size", CONTEXT_WINDOW_SIZE)
            REPEAT_PENALTY = settings.get("repeat_penalty", REPEAT_PENALTY)
            FREQUENCY_PENALTY = settings.get("frequency_penalty", FREQUENCY_PENALTY)
            PRESENCE_PENALTY = settings.get("presence_penalty", PRESENCE_PENALTY)
            TEMPERATURE = settings.get("temperature", TEMPERATURE)
            TOP_P = settings.get("top_p", TOP_P)

            print("Settings loaded from", settings_path, ":", settings)

load_settings()
save_settings()

# read character name from name.txt
with open(character_name_path, "r", encoding="utf-8") as f:
    character_name_value = f.read().strip()

with open(character_pronouns_path, "r", encoding="utf-8") as f:
    character_pronouns_value = [pronoun.strip().lower() for pronoun in f.read().strip().split("\n") if pronoun.strip()]

# check that character_folder/logs exists and if not create it
logs_folder = path.join(character_folder, "logs")
if not path.exists(logs_folder):
    os.makedirs(logs_folder)

conversation_log_value = argv[3] if len(argv) > 3 else "last.json"
if conversation_log_value == "new":
    # we must copy last.json if it exists as an archived conversation
    # check if last.json exists
    last_log_path = path.join(character_folder, "logs", "last.json")
    if path.exists(last_log_path):
        # find a new name for the archived log
        i = 1
        while True:
            archived_log_path = path.join(character_folder, "logs", f"archived_{i}.json")
            if not path.exists(archived_log_path):
                break
            i += 1
        # copy last.json to archived_{i}.json
        os.rename(last_log_path, archived_log_path)
    conversation_log_value = "last.json"
# check that last.json exists, if not create an empty one
last_log_path = path.join(character_folder, "logs", "last.json")
if not path.exists(last_log_path):
    with open(last_log_path, "w", encoding="utf-8") as f:
        f.write('{"history": [], "username": null, "bond": 0.0, "bond_2nd": 0.0, "applied_states": [], "stranger": true, "ran_post_inference_last": true}')

conversation_log_path = path.join(character_folder, "logs", conversation_log_value)
# read the conversation log from json
chat_history_all = json.load(open(conversation_log_path, "r", encoding="utf-8"))
chat_history = chat_history_all["history"]
current_bond_weight = chat_history_all["bond"]
current_2nd_bond_weight = chat_history_all["bond_2nd"]
current_applied_states = chat_history_all["applied_states"]
current_stranger = chat_history_all["stranger"]
current_ended = chat_history_all.get("ended", None)
username = chat_history_all["username"]
ran_post_inference_last = chat_history_all.get("ran_post_inference_last", False)

visited_locations = chat_history_all.get("visited_locations", [])
last_requested_location_change = chat_history_all.get("last_requested_location_change", None)
last_requested_location_change_was_rejected_since_n_inferences = chat_history_all.get("last_requested_location_change_was_rejected_since_n_inferences", 0)
last_requested_location_change_was_accepted_since_n_inferences = chat_history_all.get("last_requested_location_change_was_accepted_since_n_inferences", 0)

def save_conversation_log():
    """Save the current chat history to the conversation log file"""
    with open(conversation_log_path, "w", encoding="utf-8") as f:
        json.dump(chat_history_all, f, ensure_ascii=False, indent=4)

def update_username(new_username):
    """Update the username in the chat history and save the log"""
    chat_history_all["username"] = new_username
    save_conversation_log()

def update_bond(new_bond: float, save=True):
    """Update the bond weight in the chat history and save the log"""
    chat_history_all["bond"] = new_bond
    if save:
        save_conversation_log()

def update_2nd_bond(new_2nd_bond: float, save=True):
    """Update the second bond weight in the chat history and save the log"""
    chat_history_all["bond_2nd"] = new_2nd_bond
    if save:
        save_conversation_log()

def update_applied_states(new_states, save=True):
    """Update the applied states in the chat history and save the log"""
    chat_history_all["applied_states"] = new_states
    if save:
        save_conversation_log()

def update_stranger(is_stranger, save=True):
    """Update the stranger status in the chat history and save the log"""
    chat_history_all["stranger"] = is_stranger
    if save:
        save_conversation_log()

def update_ran_post_inference_last(ran_post_inference, save=True):
    """Update the ran_post_inference_last status in the chat history and save the log"""
    chat_history_all["ran_post_inference_last"] = ran_post_inference
    if save:
        save_conversation_log()

def update_location_change_request(location_change_request, save=True):
    """Update the last requested location change in the chat history and save the log"""
    chat_history_all["last_requested_location_change"] = location_change_request
    chat_history_all["last_requested_location_change_was_rejected_since_n_inferences"] = 0
    chat_history_all["last_requested_location_change_was_accepted_since_n_inferences"] = 0
    if save:
        save_conversation_log()

def add_visited_location(location, save=True):
    """Add a visited location to the chat history and save the log"""
    if location not in visited_locations:
        visited_locations.append(location)
        chat_history_all["visited_locations"] = visited_locations
        if save:
            save_conversation_log()

# System prompt read from bio.txt
with open(character_system_description_path, "r", encoding="utf-8") as f:
    SYSTEM_PROMPT = f.read().strip()
SYSTEM_PROMPT_EMOTIONS = None
SYSTEM_PROMPT_STATES = None
SYSTEM_PROMPT_BONDS = None

CACHE_TOKENS = {}
def count_tokens(text):
    """Estimate token count for a given text"""
    global CACHE_TOKENS
    if text in CACHE_TOKENS:
        CACHE_TOKENS[text]["used_in_last_count"] = True
        return CACHE_TOKENS[text]["value"]
    
    # call to webserver to get token count
    ws = websocket.create_connection(SERVER_HOST)
    ws.send(json.dumps({"action": "count_tokens", "text": text}))
    response = json.loads(ws.recv())
    ws.close()

    if response["type"] == "error":
        raise Exception("Failed to count tokens:", response["message"])

    token_count = response["n_tokens"]
    CACHE_TOKENS[text] = {"value": token_count, "used_in_last_count": True}
    return token_count

def clean_token_cache():
    # Remove entries not used in the last count
    global CACHE_TOKENS
    keys_to_remove = [key for key, value in CACHE_TOKENS.items() if not value["used_in_last_count"]]
    for key in keys_to_remove:
        del CACHE_TOKENS[key]

def prepare_token_cache():
    # Mark all entries as not used
    global CACHE_TOKENS
    for key in CACHE_TOKENS:
        CACHE_TOKENS[key]["used_in_last_count"] = False

def format_prompt(history, username, charname, max_context=6000, special_instructions="", special_instructions_in_assistant_space=False):
    """Format the conversation history with proper role tags for Llama 3.3
    Uses sliding window to keep only recent messages that fit in context.
    Reserves space for system prompt, new message, and response generation.
    """
    prepare_token_cache()

    # Start with system prompt
    combined_system_prompt = SYSTEM_PROMPT + "\n" + SYSTEM_PROMPT_EMOTIONS + "\n" + SYSTEM_PROMPT_STATES + "\n" + SYSTEM_PROMPT_BONDS
    if MODE == "L3":
        system_part = f"<|start_header_id|>system<|end_header_id|>\n\n{combined_system_prompt}<|eot_id|>"
    else:
        system_part = f"<s>[SYSTEM_PROMPT] {combined_system_prompt}[/SYSTEM_PROMPT][INST]"

    if MODE == "L3":
        end_prompt = "<|start_header_id|>assistant<|end_header_id|>\n\n"
    else:
        end_prompt = "[/INST]\n\n"
    
    # Format the new user message
    special_instructions_user = ""
    assistant_start = ""
    if special_instructions and not special_instructions_in_assistant_space:
        if MODE == "L3":
            special_instructions_user = f"<|start_header_id|>user<|end_header_id|>\n\n*{special_instructions}*<|eot_id|>"
        else:
            special_instructions_user = f"*{special_instructions}*\n\n"
    elif special_instructions and special_instructions_in_assistant_space:
        assistant_start = f"*{special_instructions}*\n\n"
    
    # Count tokens for system and user parts (reserve space)
    system_tokens = count_tokens(system_part)
    special_instructions_user_tokens = 0
    assistant_start_tokens = 0
    if special_instructions_user:
        special_instructions_user_tokens = count_tokens(special_instructions_user)
    if assistant_start:
        assistant_start_tokens = count_tokens(assistant_start)
    
    end_prompt_tokens = count_tokens(end_prompt)
    available_tokens = max_context - system_tokens - special_instructions_user_tokens - end_prompt_tokens - assistant_start_tokens
    
    # Build history from most recent messages backwards
    history_parts = []
    token_count = 0
        
    # Iterate through history in reverse to keep most recent messages
    for msg in reversed(history):
        role = msg["role"]
        content = msg["content"]
        if role == "user":
            if MODE == "L3":
                msg_text = f"<|start_header_id|>user<|end_header_id|>\n\n{content}<|eot_id|>"
            else:
                msg_text = f"{msg['name']}: {content}\n\n"
        elif role == "assistant":
            if MODE == "L3":
                msg_text = f"<|start_header_id|>assistant<|end_header_id|>\n\n{content}<|eot_id|>"
            else:
                name_to_use = username if msg["role"] == "user" else charname
                msg_text = f"{name_to_use}: {content}\n\n"
        else:
            #internal role, skip
            continue
            
        msg_tokens = count_tokens(msg_text)
            
        # Check if adding this message would exceed available tokens
        if token_count + msg_tokens > available_tokens:
            break
            
        history_parts.insert(0, msg_text)  # Insert at beginning to maintain order
        token_count += msg_tokens

    # wedge special instructions one before history
    if special_instructions_user:
        history_parts.insert(len(history_parts) - 1, special_instructions_user)
        token_count += special_instructions_user_tokens

    token_count += system_tokens
    token_count += assistant_start_tokens

    # Combine all parts
    prompt = system_part + "".join(history_parts) + end_prompt + assistant_start

    print(prompt)
        
    # Log token usage
    #total_tokens = system_tokens + token_count + user_tokens
    print(f"[Token usage: {token_count}/{max_context}, kept {len(history_parts)} history messages]", flush=True)

    clean_token_cache()
    
    return prompt

def format_prompt_for_analysis(
        history,
        username,
        character_name,
        special_user_message,
        system_prompt,
        confirmation_prompt,
        feed_history_raw_to=None,
    ):
    """Format the conversation history for bond calculation prompt"""

    if MODE == "L3":
        system_part = f"<|start_header_id|>system<|end_header_id|>\n\n{system_prompt}<|eot_id|>"
    else:
        system_part = f"<s>[SYSTEM_PROMPT] {system_prompt}[/SYSTEM_PROMPT][INST]"

    if MODE == "L3":
        end_prompt = "<|start_header_id|>assistant<|end_header_id|>\n\n"
    else:
        end_prompt = "[/INST]\n\n"
    
    messages_to_use = ""

    if not feed_history_raw_to:
        last_assistant_message = ""
        last_user_message = ""
        for msg in reversed(history):
            if msg["role"] == "user" and last_user_message == "":
                last_user_message = msg["content"]
            elif msg["role"] == "assistant" and last_assistant_message == "":
                last_assistant_message = msg["content"]
            if last_user_message != "" and last_assistant_message != "":
                break
        
        # because this is for evaluation the user part will be both user and assistant messages
        # to prevent confusion we will split them in lines each line starting with the speaker name
        last_user_message = username + ": " + ". ".join(lines for lines in last_user_message.split("\n") if lines.strip() != "")
        last_assistant_message = character_name + ": " + ". ".join(lines for lines in last_assistant_message.split("\n") if lines.strip() != "")
        messages_to_use = f"{last_user_message}\n{last_assistant_message}"
    else:
        for msg in history:
            if msg["role"] == "user" or msg["role"] == "assistant":
                name_to_use = username if msg["role"] == "user" else character_name
                messages_to_use = name_to_use + ": " + ". ".join(lines for lines in msg["content"].split("\n") if lines.strip() != "") + "\n" + messages_to_use
    
    # Format as a clear classification task, not continuation
    if special_user_message:
        if MODE == "L3":
            user_part = f"<|start_header_id|>user<|end_header_id|>Interaction to analyze:\n\n{special_user_message}\n{messages_to_use}\n\n{confirmation_prompt}<|eot_id|>"
        else:
            user_part = f"{special_user_message}\n\n{messages_to_use}\n\n{confirmation_prompt}\n\n"
    else:
        if MODE == "L3":
            user_part = f"<|start_header_id|>user<|end_header_id|>Interaction to analyze:\n\n{messages_to_use}\n\n{confirmation_prompt}<|eot_id|>"
        else:
            user_part = f"{messages_to_use}\n\n{confirmation_prompt}\n\n"

    # we don't count because this is guaranteed to be small enough
    prompt = system_part + user_part + end_prompt

    print(prompt)

    return prompt

# Create QApplication instance before any widgets
app = QApplication([])
chat_window = ChatWindow(character_name_value, chat_history, username)

# display the window
chat_window.show()

print("Using model:", model_path)
print("Character system loaded from:", character_system_description_path)
print("Conversation log path:", conversation_log_path)
print("Starting chat with character:", character_name_value)

states_handler = StatesHandler(character_folder)
emotion_handler = EmotionHandler(character_folder, states_handler.get_all_states())
bonds_handler = BondsHandler(character_folder)
bonds_handler.check_against_status(states_handler.get_all_states())
scenery_handler = SceneryHandler(character_folder, states_handler.get_all_states())

print("Loading Llama model...")

def prepare_llm():
    # during this call we got the username from the chat window already so we will use that
    global SYSTEM_PROMPT
    # replace {char} and {user} in system prompt too
    SYSTEM_PROMPT = SYSTEM_PROMPT.replace("{{char}}", character_name_value).replace("{{user}}", chat_window.username)
    bonds_handler.apply_names(character_name_value, chat_window.username)
    states_handler.apply_names(character_name_value, chat_window.username)
    emotion_handler.apply_names(character_name_value, chat_window.username, character_pronouns=character_pronouns_value)
    scenery_handler.apply_names(character_name_value, chat_window.username)

    global SYSTEM_PROMPT_EMOTIONS
    global SYSTEM_PROMPT_STATES
    global SYSTEM_PROMPT_BONDS
    SYSTEM_PROMPT_EMOTIONS = emotion_handler.get_system_instructions()
    SYSTEM_PROMPT_STATES = states_handler.get_system_instructions()
    SYSTEM_PROMPT_BONDS = bonds_handler.get_system_instructions()

    global LAST_STATES_TRIGGERED_ADD
    global LAST_STATES_TRIGGERED_DISCARD
    global LAST_EMOTIONS_TRIGGERED

    chat_window.update_status("Loading model...")

    # start with neutral emotion
    # check last assistant for emotion if it exist
    last_message = None
    for msg in reversed(chat_history):
        if msg["role"] == "assistant":
            last_message = msg
            break
    if last_message is not None:
        states_triggered_add = set([])
        states_triggered_discard = set([])
        emotions_triggered = set([])
        emotion_handler.restart_rolling_emotions()
        # split the message into words to simuate rolling tokens
        last_emotion = None
        for word in last_message["content"].split():
            last_emotion_given, last_states_triggered = emotion_handler.process_rolling_token(word + " ")
            if last_emotion_given is not None:
                last_emotion = last_emotion_given
                emotions_triggered.add(last_emotion_given)
            for state in last_states_triggered:
                sign = state[0]
                state_name = state[1]
                if sign == "+":
                    states_triggered_add.add(state_name)
                    if state_name in states_triggered_discard:
                        states_triggered_discard.remove(state_name)
                elif sign == "-":
                    states_triggered_discard.add(state_name)
                    if state_name in states_triggered_add:
                        states_triggered_add.remove(state_name)
        if last_emotion is None:
            last_emotion = "neutral"
            print("No emotion detected in previous assistant message, starting with neutral emotion.")
        else:
            print(f"Previous assistant message found, starting with emotion: {last_emotion}")
        chat_window.showcase_emotion_from_prepare(last_emotion)
        LAST_STATES_TRIGGERED_ADD = states_triggered_add
        LAST_STATES_TRIGGERED_DISCARD = states_triggered_discard
        LAST_EMOTIONS_TRIGGERED = emotions_triggered

        print("States carried over from previous message - Added:", states_triggered_add, "Discarded:", states_triggered_discard)

    else:
        chat_window.showcase_emotion_from_prepare("neutral")
        print("No previous assistant message found, starting with neutral emotion.")

    # call a http request to the node server to indicate we are ready
    model_path_absolute = path.abspath(model_path)
    
    # call to webserver to get token count
    ws = websocket.create_connection(SERVER_HOST)
    ws.send(json.dumps({"action": "load_model", "model_path": model_path_absolute}))
    response = json.loads(ws.recv())
    ws.close()

    if response["type"] == "error":
        chat_window.update_status("Failed to load model.")
        raise Exception("Failed to load model:", response["message"])

    chat_window.update_status("Model loaded. Ready to chat!")

def run_inference(user_input, dangling_user_message):
    if not user_input:
        return  # skip empty input
    
    global bonds_handler
    global current_applied_states
    global current_stranger
    global current_ended
    global ran_post_inference_last
    global visited_locations
    global last_requested_location_change
    global last_requested_location_change_was_rejected_since_n_inferences
    global last_requested_location_change_was_accepted_since_n_inferences
    
    if user_input.startswith("/"):
        global CONTEXT_WINDOW_SIZE
        global TEMPERATURE
        global TOP_P
        global REPEAT_PENALTY
        global FREQUENCY_PENALTY
        global PRESENCE_PENALTY
        global current_bond_weight
        global current_2nd_bond_weight

        command_parts = user_input.split(" ", 1)
        command = command_parts[0]
        argument = command_parts[1] if len(command_parts) > 1 else ""
        if command == "/help":
            help_text = "Available commands:\n"
            help_text += "/context_window [number] - Set the context window size (default 8192)\n"
            help_text += "/temperature [number] - Set the temperature for response generation (default 1.0)\n"
            help_text += "/top_p [number] - Set the top_p for nucleus sampling (default 0.9)\n"
            help_text += "/repeat_penalty [number] - Set the repeat penalty (default 1.1)\n"
            help_text += "/frequency_penalty [number] - Set the frequency penalty (default 0.5)\n"
            help_text += "/presence_penalty [number] - Set the presence penalty (default 0.5)\n"
            help_text += "/bond [number -100-100] - Shows or sets the current bond level with the character\n"
            help_text += "/bond_2nd [number 0-100] - Shows or sets the current second bond level with the character\n"
            help_text += "/stranger [true/false] - Sets whether you are a stranger to the character\n"
            help_text += "/states - Show the current applied states\n"
            help_text += "/stateset [state_name] [strength 0-4] [decay 1-3] - Sets state to the current applied states\n"
            help_text += "/help - Show this help message\n"
            #help_text += "/get_bond_prompt - Show the current bonds prompt used for bond evaluation\n"
            #help_text += "/get_2nd_bond_prompt - Show the current bonds prompt used for 2nd bond evaluation\n"
            #help_text += "/get_states_prompt - Show the current states prompt used for state evaluation\n"
            chat_window.add_system_text(help_text)
        elif command == "/context_window":
            if not argument:
                chat_window.add_system_text(f"Current context window size: {CONTEXT_WINDOW_SIZE}")
                return
            try:
                new_value = int(argument)
                CONTEXT_WINDOW_SIZE = new_value
                chat_window.add_system_text(f"Context window size set to {new_value}.")
                save_settings()
            except ValueError:
                chat_window.add_system_text("Invalid value for context window size.")
        elif command == "/temperature":
            if not argument:
                chat_window.add_system_text(f"Current temperature: {TEMPERATURE}")
                return
            try:
                new_value = float(argument)
                TEMPERATURE = new_value
                chat_window.add_system_text(f"Temperature set to {new_value}.")
                save_settings()
            except ValueError:
                chat_window.add_system_text("Invalid value for temperature.")
        elif command == "/top_p":
            if not argument:
                chat_window.add_system_text(f"Current top_p: {TOP_P}")
                return
            try:
                new_value = float(argument)
                TOP_P = new_value
                chat_window.add_system_text(f"top_p set to {new_value}.")
                save_settings()
            except ValueError:
                chat_window.add_system_text("Invalid value for top_p.")
        elif command == "/repeat_penalty":
            if not argument:
                chat_window.add_system_text(f"Current repeat penalty: {REPEAT_PENALTY}")
                return
            try:
                new_value = float(argument)
                REPEAT_PENALTY = new_value
                chat_window.add_system_text(f"Repeat penalty set to {new_value}.")
                save_settings()
            except ValueError:
                chat_window.add_system_text("Invalid value for repeat penalty.")
        elif command == "/frequency_penalty":
            if not argument:
                chat_window.add_system_text(f"Current frequency penalty: {FREQUENCY_PENALTY}")
                return
            try:
                new_value = float(argument)
                FREQUENCY_PENALTY = new_value
                chat_window.add_system_text(f"Frequency penalty set to {new_value}.")
                save_settings()
            except ValueError:
                chat_window.add_system_text("Invalid value for frequency penalty.")
        elif command == "/presence_penalty":
            if not argument:
                chat_window.add_system_text(f"Current presence penalty: {PRESENCE_PENALTY}")
                return
            try:
                new_value = float(argument)
                PRESENCE_PENALTY = new_value
                chat_window.add_system_text(f"Presence penalty set to {new_value}.")
                save_settings()
            except ValueError:
                chat_window.add_system_text("Invalid value for presence penalty.")
        elif command == "/bond":
            if argument:
                try:
                    new_value = float(argument)
                    if new_value < -100.0:
                        new_value = -100.0
                    if new_value > 100.0:
                        new_value = 100.0
                    current_bond_weight = new_value
                    update_bond(new_value)
                    chat_window.add_system_text(f"Bond level set to {new_value:.2f}.")
                except ValueError:
                    chat_window.add_system_text("Invalid value for bond level.")
                return
            chat_window.add_system_text(f"Current bond level: {current_bond_weight:.2f}")
        elif command == "/bond_2nd":
            if argument:
                try:
                    new_value = float(argument)
                    current_2nd_bond_weight = new_value
                    if new_value < 0.0:
                        new_value = 0.0
                    if new_value > 100.0:
                        new_value = 100.0
                    update_2nd_bond(new_value)
                    chat_window.add_system_text(f"Second bond level set to {new_value:.2f}.")
                except ValueError:
                    chat_window.add_system_text("Invalid value for second bond level.")
                return
            chat_window.add_system_text(f"Current second bond level: {current_2nd_bond_weight:.2f}")
        elif command == "/states":
            if not current_applied_states:
                chat_window.add_system_text("No states are currently applied.")
            else:
                states_text = "Current applied states:\n"
                for state in current_applied_states:
                    states_text += f"- {state['name']}: Strength {state['strength']}, Decay {state['decay']}\n"
                chat_window.add_system_text(states_text)
        elif command == "/stateset":
            parts = argument.split(" ")
            if len(parts) != 3:
                chat_window.add_system_text("Usage: /stateset [state_name] [strength 0-4] [decay 1-3]")
                return
            state_name = parts[0]
            try:
                strength = int(parts[1])
                decay = int(parts[2])
                if strength < 0 or strength > 4 or decay < 1 or decay > 3:
                    chat_window.add_system_text("Strength must be between 0 and 4, Decay must be between 1 and 3.")
                    return
                # check if state exists
                state_exists = False
                for state in states_handler.get_all_states():
                    if state["name"] == state_name:
                        state_exists = True
                        break
                if not state_exists:
                    chat_window.add_system_text(f"State '{state_name}' does not exist.")
                    return
                # update or add the state
                state_found = False
                for state in current_applied_states:
                    if state[0] == state_name:
                        state[1] = strength
                        state[2] = decay
                        state_found = True
                        break
                if not state_found:
                    current_applied_states.append([state_name, strength, decay])
                update_applied_states(current_applied_states)
                chat_window.add_system_text(f"State '{state_name}' set to Strength {strength}, Decay {decay}.")
            except ValueError:
                chat_window.add_system_text("Invalid strength or decay value. Strength must be 0-4 and Decay must be 1-3.")
        elif command == "/stranger":
            if not argument:
                chat_window.add_system_text(f"Current stranger status: {current_stranger}")
                return
            arg_lower = argument.lower()
            if arg_lower == "true":
                current_stranger = True
                update_stranger(True)
                chat_window.add_system_text("Stranger status set to True.")
            elif arg_lower == "false":
                current_stranger = False
                update_stranger(False)
                chat_window.add_system_text("Stranger status set to False.")
            else:
                chat_window.add_system_text("Invalid value for stranger status. Use 'true' or 'false'.")
        else:
            chat_window.add_system_text(f"Unknown command: {command}. Type /help for a list of commands.")
        return

    # check if last message is from user
    if dangling_user_message:
        chat_window.update_status("Continuing previous conversation...")
    else:
        chat_window.update_status("Running inference...")

    # Update chat history if last message is not from user
    if not dangling_user_message:
        chat_history.append({"role": "user", "content": user_input})
        save_conversation_log()

    chat_window.character_is_typing()

    scenery_change_was_just_accepted = False
    scenery_change_was_just_rejected = False
    scenery_change_wasnt_asked = False
    is_a_stubboness_repeat = False
    if last_requested_location_change is not None and last_requested_location_change_was_accepted_since_n_inferences == 0 and last_requested_location_change_was_rejected_since_n_inferences == 0:
        print(f"Pending scenery change to location: {last_requested_location_change}, performing user acceptance check in order to progress the scenery change.")
        # we first need to confirm whether the user accepted the location change
        instructions = scenery_handler.get_system_prompt_for_scenery_change_check()
        scenery_change_analysis_prompt = format_prompt_for_analysis(
            chat_history,
            chat_window.username,
            character_name_value,
            "",
            instructions,
            scenery_handler.get_system_prompt_confirmation_prompt(last_requested_location_change),
        )

        action = {
            "action": "generate",
            "prompt": scenery_change_analysis_prompt,
            "max_tokens": 24,
            "stream": True,
            "stop": ["<|eot_id|>", "<|start_header_id|>"],

            # different settings for this as we want a more focused response
            "repeat_penalty": 1.0,           # No repeat penalty
            "frequency_penalty": 0.0,        # No frequency penalty
            "presence_penalty": 0.0,          # No presence penalty
            "temperature": 0.8,              # Lower temperature for focused responses
            "top_p": 0.8,                   # Nucleus sampling
        }
        ws = websocket.create_connection("ws://localhost:8000")
        ws.send(json.dumps(action))

        scenery_change_response = ""

        next_message = json.loads(ws.recv())
        print("Location acceptance response: ", end="", flush=True)
        while next_message["type"] != "done" and next_message["type"] != "error":
            if next_message["type"] == "token":
                text = next_message["text"]
                scenery_change_response += text
                print(text, end="", flush=True)
            next_message = json.loads(ws.recv())
        ws.close()
        print()

        lowered = scenery_change_response.strip().lower()
        if "yes" in lowered or "accept" in lowered or "sure" in lowered or "yeah" in lowered or "yep" in lowered:
            # user accepted the location change
            scenery_change_was_just_accepted = True
        elif ("no" in lowered or "reject" in lowered or "not" in lowered or "don't" in lowered or "decline" in lowered) and not (("asked" in lowered) or ("question" in lowered)):
            # user rejected the location change
            scenery_change_was_just_rejected = True
        elif ("no" in lowered or "never" in lowered) and (("asked" in lowered) or ("question" in lowered)):
            print("The character was not asked to change location, so we are not already there.")
            scenery_change_wasnt_asked = True
        else:
            print("Could not determine if user accepted or rejected the location change, assuming rejection.")
            scenery_change_was_just_rejected = True

        is_a_stubboness_repeat = True

    is_dead_end_due_to_bond = bonds_handler.is_bond_dead_end(
        current_bond_weight,
        current_stranger,
    )

    scenery_change_location, scenery_change_prompt = scenery_handler.get_prompt_for_scenery_change(
        visited_locations,
        last_requested_location_change_was_accepted_since_n_inferences * 2,
        last_requested_location_change_was_rejected_since_n_inferences * 2,
        current_applied_states,
        last_requested_location_change,
        scenery_change_was_just_accepted,
        scenery_change_was_just_rejected,
        scenery_change_wasnt_asked,
    )

    scenery_change_is_already_there = False
    if scenery_change_location is not None and not is_a_stubboness_repeat:
        print(f"Scenery change detected to location: {scenery_change_location} we will do a sanity check to ensure we are not already there")

        sanity_check_prompt = scenery_handler.get_system_prompt_for_scenery_change_sanity_confirmation_check(scenery_change_location)
        scenery_change_sanity_analysis_prompt = format_prompt_for_analysis(
            chat_history,
            chat_window.username,
            character_name_value,
            "",
            sanity_check_prompt,
            scenery_handler.get_system_prompt_confirmation_sanity_prompt(scenery_change_location),
            4,
        )

        action = {
            "action": "generate",
            "prompt": scenery_change_sanity_analysis_prompt,
            "max_tokens": 24,
            "stream": True,
            "stop": ["<|eot_id|>", "<|start_header_id|>"],

            # different settings for this as we want a more focused response
            "repeat_penalty": 1.0,           # No repeat penalty
            "frequency_penalty": 0.0,        # No frequency penalty
            "presence_penalty": 0.0,          # No presence penalty
            "temperature": 0.8,              # Lower temperature for focused responses
            "top_p": 0.8,                   # Nucleus sampling
        }
        ws = websocket.create_connection("ws://localhost:8000")
        ws.send(json.dumps(action))

        scenery_change_sanity_response = ""

        next_message = json.loads(ws.recv())
        print("Sanity Location Response: ", end="", flush=True)
        while next_message["type"] != "done" and next_message["type"] != "error":
            if next_message["type"] == "token":
                text = next_message["text"]
                scenery_change_sanity_response += text
                print(text, end="", flush=True)
            next_message = json.loads(ws.recv())
        ws.close()
        print()

        lowered = scenery_change_sanity_response.strip().lower()
        if "yes" in lowered or "accept" in lowered or "sure" in lowered or "yeah" in lowered or "yep" in lowered:
            # user accepted the location change
            print("We are already at the requested location.")
            scenery_change_is_already_there = True
        elif "no" in lowered or "reject" in lowered or "not" in lowered or "don't" in lowered or "decline" in lowered:
            # user rejected the location change
            print("We are not already at the requested location.")
            scenery_change_is_already_there = False
        else:
            print("Could not determine if user accepted or rejected the sanity check for location change, assuming we are not already there.")
            scenery_change_is_already_there = False

    system_prompt_for_end = bonds_handler.get_instructions_for_bond(
        current_bond_weight,
        current_2nd_bond_weight,
        current_applied_states,
        current_stranger,
    ) + ("" if scenery_change_is_already_there or scenery_change_wasnt_asked else scenery_change_prompt)
    
    # Format the prompt with history
    prompt = format_prompt(
        chat_history,
        username=chat_window.username,
        charname=character_name_value,
        max_context=CONTEXT_WINDOW_SIZE - 512,
        special_instructions=system_prompt_for_end,
        special_instructions_in_assistant_space=is_dead_end_due_to_bond is not None,
    )

    # Generate response
    response = ""
    emotion_handler.restart_rolling_emotions()
    emotions_triggered = set([])
    states_triggered_add = set([])
    states_triggered_discard = set([])

    stop = ["<|eot_id|>", "<|start_header_id|>", f"\n{chat_window.username}:", f"\n{chat_window.username.lower()}:"]

    action = {
        "action": "generate",
        "prompt": prompt,
        "max_tokens": 512,
        "stream": True,
        "stop": stop,
        "repeat_penalty": REPEAT_PENALTY,           # Penalize repetitions (1.0 = no penalty, higher = more penalty)
        "frequency_penalty": FREQUENCY_PENALTY,        # Reduce likelihood of frequently used tokens
        "presence_penalty": PRESENCE_PENALTY,          # Encourage new topics/ideas
        "temperature": TEMPERATURE,              # Creativity of responses
        "top_p": TOP_P,                   # Nucleus sampling
        "max_characters": 1000,            # Limit response length in characters, it will cutoff gracefully at the nearest paragraph
        "max_paragraphs": 3,               # Limit response length in paragraphs
    }
    ws = websocket.create_connection("ws://localhost:8000")
    ws.send(json.dumps(action))

    next_message = json.loads(ws.recv())
    while next_message["type"] != "done" and next_message["type"] != "error":
        if next_message["type"] == "token":
            text = next_message["text"]
            chat_window.add_character_text(text)
            emotion_triggered, state_triggered = emotion_handler.process_rolling_token(text)
            if emotion_triggered is not None:
                chat_window.showcase_emotion(emotion_triggered)
                emotions_triggered.add(emotion_triggered)
            for state in state_triggered:
                sign = state[0]
                state_name = state[1]
                if sign == "+":
                    states_triggered_add.add(state_name)
                    if state_name in states_triggered_discard:
                        states_triggered_discard.remove(state_name)
                elif sign == "-":
                    states_triggered_discard.add(state_name)
                    if state_name in states_triggered_add:
                        states_triggered_add.remove(state_name)
            response += text
            print(text, end="", flush=True)
        next_message = json.loads(ws.recv())

    ws.close()

    if next_message["type"] == "error":
        chat_window.add_system_text(f"Error during generation: {next_message['message']}")
        raise Exception("Error during generation: " + next_message["message"])

    global LAST_EMOTIONS_TRIGGERED
    global LAST_STATES_TRIGGERED_ADD
    global LAST_STATES_TRIGGERED_DISCARD

    LAST_EMOTIONS_TRIGGERED = emotions_triggered
    LAST_STATES_TRIGGERED_ADD = states_triggered_add
    LAST_STATES_TRIGGERED_DISCARD = states_triggered_discard

    chat_history.append({"role": "assistant", "content": response.strip()})
    ran_post_inference_last = False
    chat_history_all["ran_post_inference_last"] = ran_post_inference_last

    if is_dead_end_due_to_bond:
        print(f"End state detected from post inference: {is_dead_end_due_to_bond}")
        ended_readable = states_handler.format_end_state_human_readable(is_dead_end_due_to_bond)
        chat_window.character_finished_typing(ended_readable)
        chat_history_all["ended"] = ended_readable
        current_ended = ended_readable
        save_conversation_log()
    else:
        chat_window.character_finished_typing(None)

    if not is_dead_end_due_to_bond:
        chat_window.update_status("Ready for next message.")

    if scenery_change_location is not None:
        last_requested_location_change = scenery_change_location
        last_requested_location_change_was_rejected_since_n_inferences = 0
        if scenery_change_is_already_there:
            # prevents from checking as it marks it as accepted
            last_requested_location_change_was_accepted_since_n_inferences = max(
                1,
                last_requested_location_change_was_accepted_since_n_inferences,
                last_requested_location_change_was_rejected_since_n_inferences,
            )
            # add the location as we are already there
            if not scenery_change_location in visited_locations:
                visited_locations.append(scenery_change_location)
                chat_history_all["visited_locations"] = visited_locations
        else:
            last_requested_location_change_was_accepted_since_n_inferences = 0
        chat_history_all["last_requested_location_change_was_rejected_since_n_inferences"] = last_requested_location_change_was_rejected_since_n_inferences
        chat_history_all["last_requested_location_change_was_accepted_since_n_inferences"] = last_requested_location_change_was_accepted_since_n_inferences
        chat_history_all["last_requested_location_change"] = last_requested_location_change
    else:
        if last_requested_location_change_was_rejected_since_n_inferences != 0 or scenery_change_was_just_rejected:
            last_requested_location_change_was_rejected_since_n_inferences += 1
        if last_requested_location_change_was_accepted_since_n_inferences != 0 or scenery_change_was_just_accepted or last_requested_location_change is None:
            # because we just started we consider that the change was accepted
            # so that the counter goes up and the character can request a new change later
            # the character should do at a increased rate because the first time
            last_requested_location_change_was_accepted_since_n_inferences += 1
            if not last_requested_location_change in visited_locations:
                visited_locations.append(last_requested_location_change)
                chat_history_all["visited_locations"] = visited_locations
        chat_history_all["last_requested_location_change_was_rejected_since_n_inferences"] = last_requested_location_change_was_rejected_since_n_inferences
        chat_history_all["last_requested_location_change_was_accepted_since_n_inferences"] = last_requested_location_change_was_accepted_since_n_inferences

    save_conversation_log()


def edit_message(index, new_content):
    """Edit a message in the chat history and save the log"""
    if 0 <= index < len(chat_history):
        chat_history[index]["content"] = new_content
        save_conversation_log()

def delete_message(index):
    """Delete a message from the chat history and save the log"""
    if 0 <= index < len(chat_history):
        del chat_history[index]
        save_conversation_log()

def run_post_inference():
    """Function to run after inference is complete (if needed)"""

    print("Running post inference analysis...")

    global LAST_EMOTIONS_TRIGGERED
    global LAST_STATES_TRIGGERED_ADD
    global LAST_STATES_TRIGGERED_DISCARD
    global current_bond_weight
    global current_2nd_bond_weight
    global current_stranger
    global current_applied_states
    global ran_post_inference_last

    special_user_message_regarding_bonds = "*" + bonds_handler.get_instructions_for_bond(
        current_bond_weight,
        current_2nd_bond_weight,
        current_applied_states,
        current_stranger,
        for_bond_change=True,
    ) + "*"

    post_bond_analysis_prompt = format_prompt_for_analysis(
        chat_history,
        chat_window.username,
        character_name_value,
        special_user_message_regarding_bonds,
        bonds_handler.get_post_inference_system_instructions(),
        bonds_handler.get_post_inference_confirmation_prompt(),
    )

    # we will start a streaming request to the server
    action = {
        "action": "generate",
        "prompt": post_bond_analysis_prompt,
        "max_tokens": 24,
        "stream": True,
        "stop": ["<|eot_id|>", "<|start_header_id|>"],

        # different settings for this as we want a more focused response
        "repeat_penalty": 1.0,           # No repeat penalty
        "frequency_penalty": 0.0,        # No frequency penalty
        "presence_penalty": 0.0,          # No presence penalty
        "temperature": 0.8,              # Lower temperature for focused responses
        "top_p": 0.8,                   # Nucleus sampling
    }
    ws = websocket.create_connection("ws://localhost:8000")
    ws.send(json.dumps(action))

    post_inference_bonds_response = ""

    next_message = json.loads(ws.recv())
    print("Post inference bond response: ", end="", flush=True)
    while next_message["type"] != "done" and next_message["type"] != "error":
        if next_message["type"] == "token":
            text = next_message["text"]
            post_inference_bonds_response += text
            print(text, end="", flush=True)
        next_message = json.loads(ws.recv())
    ws.close()
    print()

    if next_message["type"] == "error":
        chat_window.add_system_text(f"Error during post processing: {next_message['message']}", postinference_thread=True)
        raise Exception("Error during post processing: " + next_message["message"])
    
    expected_bond_change = bonds_handler.analyze_response_for_bond_change(
        post_inference_bonds_response,
    )
    
    # second bond calculation
    can_ascend_2nd_bond = bonds_handler.can_ascend_2nd_bond(
        current_bond_weight,
        current_2nd_bond_weight,
        current_stranger,
        expected_bond_change,
    )

    second_bond_change = 0
    if can_ascend_2nd_bond:
        print("Second bond can be ascended based on current bond and expected bond change, the change is: ", expected_bond_change)
        post_2nd_bond_analysis_prompt = format_prompt_for_analysis(
            chat_history,
            chat_window.username,
            character_name_value,
            special_user_message_regarding_bonds,
            bonds_handler.get_2nd_bond_post_inference_system_instructions(),
            bonds_handler.get_2nd_bond_post_inference_confirmation_prompt(current_bond_weight, current_2nd_bond_weight, current_stranger),
        )

        # we will start a streaming request to the server
        action = {
            "action": "generate",
            "prompt": post_2nd_bond_analysis_prompt,
            "max_tokens": 24,
            "stream": True,
            "stop": ["<|eot_id|>", "<|start_header_id|>"],

            # different settings for this as we want a more focused response
            "repeat_penalty": 1.0,           # No repeat penalty
            "frequency_penalty": 0.0,        # No frequency penalty
            "presence_penalty": 0.0,          # No presence penalty
            "temperature": 0.8,              # Lower temperature for focused responses
            "top_p": 0.8,                   # Nucleus sampling
        }
        ws = websocket.create_connection("ws://localhost:8000")
        ws.send(json.dumps(action))

        post_inference_2nd_bonds_response = ""

        next_message = json.loads(ws.recv())
        print("Post inference 2nd bond response: ", end="", flush=True)
        while next_message["type"] != "done" and next_message["type"] != "error":
            if next_message["type"] == "token":
                text = next_message["text"]
                post_inference_2nd_bonds_response += text
                print(text, end="", flush=True)
            next_message = json.loads(ws.recv())
        ws.close()
        print()

        if next_message["type"] == "error":
            chat_window.add_system_text(f"Error during post processing: {next_message['message']}", postinference_thread=True)
            raise Exception("Error during post processing: " + next_message["message"])
        
        second_bond_change = bonds_handler.analyze_response_for_2nd_bond_change(
            post_inference_2nd_bonds_response,
        )
        print("Second bond change analyzed as: ", second_bond_change)
    else:
        print("Second bond cannot be ascended based on current bond and expected bond change, skipping analysis.")
    
    post_inference_state_prompt = format_prompt_for_analysis(
        chat_history,
        chat_window.username,
        character_name_value,
        special_user_message_regarding_bonds,
        states_handler.get_post_inference_system_instructions(),
        states_handler.get_post_inference_confirmation_prompt(),
    )

     # we will start a streaming request to the server
    action = {
        "action": "generate",
        "prompt": post_inference_state_prompt,
        "max_tokens": 64,
        "stream": True,
        # default ones
        "stop": ["<|eot_id|>", "<|start_header_id|>"],

        # different settings for this as we want a more focused response
        "repeat_penalty": 1.0,           # No repeat penalty
        "frequency_penalty": 0.0,        # No frequency penalty
        "presence_penalty": 0.0,          # No presence penalty
        "temperature": 0.8,              # Lower temperature for focused responses
        "top_p": 0.8,                   # Nucleus sampling
    }
    ws = websocket.create_connection("ws://localhost:8000")
    ws.send(json.dumps(action))

    post_inference_state_response = ""

    next_message = json.loads(ws.recv())
    print("Post inference state response: ", end="", flush=True)
    while next_message["type"] != "done" and next_message["type"] != "error":
        if next_message["type"] == "token":
            text = next_message["text"]
            post_inference_state_response += text
            print(text, end="", flush=True)
        next_message = json.loads(ws.recv())
    print()
    ws.close()

    new_applied_states_add, new_applied_states_decrease, new_applied_states_remove = states_handler.analyze_response_for_states(
        post_inference_state_response,
    )

    new_applied_states = states_handler.get_next_applying_states(
        current_applied_states,
        new_applied_states_add,
        new_applied_states_decrease,
        new_applied_states_remove,
        LAST_STATES_TRIGGERED_ADD,
        LAST_STATES_TRIGGERED_DISCARD,
    )

    # calculate bond and states changes
    mini_bonuses = states_handler.get_mini_bonuses(new_applied_states)
    new_bond, new_2nd_bond, new_stranger = bonds_handler.calculate_bond_change(
        current_bond_weight,
        current_2nd_bond_weight,
        current_stranger,
        len([msg for msg in chat_history if msg["role"] == "user" or msg["role"] == "assistant"]),
        expected_bond_change,
        second_bond_change,
        mini_bonuses,
    )

    print(f"Updated bond: {current_bond_weight}|{current_2nd_bond_weight} -> {new_bond}|{new_2nd_bond}, stranger: {current_stranger} -> {new_stranger}, applied states: {current_applied_states} -> {new_applied_states}, bond mini bonuses: {mini_bonuses}")

    update_bond(new_bond, save=False)
    update_2nd_bond(new_2nd_bond, save=False)
    update_stranger(new_stranger, save=False)
    update_applied_states(new_applied_states, save=False)
    update_ran_post_inference_last(True, save=False)
    ran_post_inference_last = True
    current_bond_weight = new_bond
    current_2nd_bond_weight = new_2nd_bond
    current_stranger = new_stranger
    current_applied_states = new_applied_states

    save_conversation_log()

# Start the chat
chat_window.run(
    current_ended,
    ran_post_inference_last,
    prepare_llm,
    run_inference,
    run_post_inference,
    edit_message,
    delete_message,
    update_username,
)
app.exec()