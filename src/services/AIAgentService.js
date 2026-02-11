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
        if (!response) return [];

        // Find JSON array in the text (in case AI adds conversational filler outside triple backticks)
        const jsonMatch = response.match(/\[.*\]/s);
        if (jsonMatch) {
            const cleaned = jsonMatch[0].trim();
            return JSON.parse(cleaned);
        }

        // Fallback: strip markdown
        const stripped = response.replace(/```json|```/g, "").trim();
        if (stripped.startsWith("[") && stripped.endsWith("]")) {
            return JSON.parse(stripped);
        }

        console.warn("AI response did not contain a valid JSON array:", response);
        return [];
    } catch (e) {
        if (e.code === 'MISSING_API_KEY') {
            // Silently fail for smart replies if key is missing
            return [];
        }
        console.error("Failed to generate or parse smart replies:", e);
        return [];
    }
}
