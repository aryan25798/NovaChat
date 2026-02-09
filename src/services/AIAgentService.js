import { getGeminiResponse } from "./GeminiService";

/**
 * Summarizes a list of messages using Gemini AI.
 * @param {Array} messages - List of message objects { senderName, text }.
 * @returns {Promise<string>} The summary text.
 */
export async function summarizeChat(messages) {
    if (!messages || messages.length === 0) return "No messages to summarize.";

    const chatTranscript = messages
        .map(m => `${m.senderName}: ${m.text}`)
        .join("\n");

    const prompt = `Please provide a concise, bullet-pointed summary of the following chat transcript. Highlight the main topics discussed and any decisions made:\n\n${chatTranscript}`;

    return await getGeminiResponse(prompt);
}

/**
 * Generates smart reply suggestions based on the last few messages.
 * @param {Array} messages - List of recent message objects.
 * @returns {Promise<Array<string>>} List of suggested replies.
 */
export async function getSmartReplies(messages) {
    if (!messages || messages.length === 0) return [];

    const lastMessages = messages.slice(-5).map(m => `${m.senderName}: ${m.text}`).join("\n");

    const prompt = `Based on the following recent messages in a WhatsApp chat, suggest 3 very short, natural-sounding quick replies (e.g., "Sounds good!", "I'm on it", "See you then"). Return ONLY a JSON array of strings:\n\n${lastMessages}`;

    try {
        const response = await getGeminiResponse(prompt);
        // Clean response if AI adds markdown blocks
        const cleaned = response.replace(/```json|```/g, "").trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("Failed to parse smart replies", e);
        return [];
    }
}
