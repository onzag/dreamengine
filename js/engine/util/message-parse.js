/**
 * Takes a complete message in the narrative form and converts it into components that conform the message
 * 
 * Returns an array of messages with each author and content separated, for example the following message:
 * 
 * *Alice looks around worried* Hello Jonh how are you doing?
 * 
 * Will turn into:
 * 
 * [
 *   { author: null, origin: "Alice", content: "Alice looks around worried" },
 *   { author: "Alice", origin: "Alice", content: "Hello John how are you doing?" }
 * ]
 * 
 * This allows the engine to separate the narrative parts of the message from the dialogue parts, and also to know who is saying what in a message that may contain multiple sentences and multiple narrative actions.
 * this can later be passed onto parseMessageInComponentsAsText to get
 * 
 * *Alice Looks Around Worried*
 * [Alice]: Hello Jonh how are you doing?
 * 
 * or it can be used to create more complex UI
 * 
 * This function is also able to take output in the same format, but cannot distinguish character when in such case as it
 * is expected that every time an author is given no spoken part belongs to another character, for example:
 * 
 * When the author is Alice and the message is:
 * 
 * *Alice looks around worried*
 * [Bob]: Hello Jonh how are you doing?
 * *Alice looks at Bob and smiles*
 * [Alice]: I'm doing great Bob, thanks for asking!
 * 
 * Would just cause all messages to be attributed to Alice because she is the author
 * 
 * @param {string} author 
 * @param {string} message
 */
export function parseMessageInComponents(author, message) {
    /**
     * @type {Array<{author: string | null, origin: string, content: string}>}
     */
    const finalMessages = [];

    if (author === "Story Master") {
        // for story master messages we will not do any parsing, we will just return the whole message as a single component
        return [{
            author: null,
            origin: author,
            content: message,
        }];
    }

    const splittedLines = message.split("\n");
    for (const line of splittedLines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith("[" + author + "]:")) {
            finalMessages.push({
                author: author,
                origin: author,
                content: trimmedLine.substring(author.length + 3).trim(),
            });
        }
        let inContext = false;
        let accumulatedContext = "";
        for (const char of line) {
            if (char === "*") {
                if (accumulatedContext.trim().length > 0) {
                    finalMessages.push({
                        author: inContext ? null : author,
                        origin: author,
                        content: accumulatedContext.trim(),
                    });
                }

                inContext = !inContext;
                accumulatedContext = "";
            } else {
                accumulatedContext += char;
            }
        }

        if (accumulatedContext.trim().length > 0) {
            finalMessages.push({
                author: inContext ? null : author,
                origin: author,
                content: accumulatedContext.trim(),
            });
        }
    }

    return finalMessages;
}

/**
 * @param {string} author 
 * @param {string} message 
 * @returns {string}
 */
export function parseMessageInComponentsAsText(author, message) {
    const components = parseMessageInComponents(author, message);
    let finalText = "";
    for (const component of components) {
        if (component.author) {
            finalText += `[${component.author}]: ${component.content}\n`;
        } else {
            finalText += `*${component.content}*\n`;
        }
    }
    return finalText.trim();
}