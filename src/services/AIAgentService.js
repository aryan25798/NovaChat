import { functions } from "../firebase";
import { httpsCallable } from "firebase/functions";

const aiAgentHelper = httpsCallable(functions, 'aiAgentHelper');

/**
 * Summarizes a list of messages using Server-Side Gemini.
 * @param {Array} messages - List of message objects { senderName, text }.
 * @returns {Promise<string>} The summary text.
 */
export async function summarizeChat(messages) {
    if (!messages || messages.length === 0) return "No messages to summarize.";

    try {
        const result = await aiAgentHelper({
            mode: 'summarize',
            data: { messages }
        });
        return result.data.result;
    } catch (error) {
        console.error("Summarize Chat Failed:", error);
        return "Unable to generate summary at this time.";
    }
}

/**
 * Generates smart reply suggestions via Server-Side Gemini.
 * @param {Array} messages - List of recent message objects.
 * @returns {Promise<Array<string>>} List of suggested replies.
 */
export async function getSmartReplies(messages) {
    if (!messages || messages.length === 0) return [];

    try {
        const result = await aiAgentHelper({
            mode: 'smartReply',
            data: { messages }
        });
        return result.data.result || [];
    } catch (error) {
        // Silently fail for smart replies to avoid UI clutter
        console.debug("Smart Reply Failed:", error);
        return [];
    }
}
