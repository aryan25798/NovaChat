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
        const sanitized = messages.map(m => ({
            senderName: m.senderName,
            text: m.text
        }));

        const result = await aiAgentHelper({
            mode: 'summarize',
            data: { messages: sanitized }
        });
        return result.data.result;
    } catch (error) {
        console.warn("Summarize Chat Failed (Stability Handled)");
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
        const sanitized = messages.map(m => ({
            senderId: m.senderId,
            text: m.text,
            timestamp: m.timestamp?.seconds || m.timestamp
        }));

        const result = await aiAgentHelper({
            mode: 'smartReply',
            data: { messages: sanitized }
        });
        return result.data.result || [];
    } catch (error) {
        // Silently fail for smart replies to avoid UI clutter
        console.warn("Smart Reply Failed (Stability Handled)");
        return [];
    }
}
