const { onCall, HttpsError } = require("firebase-functions/v2/https");

/**
 * Callable Function to securely generate AI responses.
 * API key loaded from functions/.env (server-side only).
 */
exports.generateAIResponse = onCall({
    secrets: ["GEMINI_API_KEY"]
}, async (request) => {
    // 1. Auth Check
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be logged in.');
    }

    const { messages, senderName } = request.data;

    // 2. Input Validation
    if (!messages || !Array.isArray(messages)) {
        throw new HttpsError('invalid-argument', 'Messages array is required.');
    }

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
        throw new HttpsError('failed-precondition', 'Gemini API Key not configured.');
    }

    const SYSTEM_INSTRUCTION = `You are the Gemini AI Assistant in a WhatsApp Clone app. 
    - Keep your anwers concise and helpful.
    - Format responses using Markdown.
    - You are talking to ${senderName || 'Active User'}.`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: messages.map(msg => ({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.text }]
                })),
                system_instruction: {
                    parts: [{ text: SYSTEM_INSTRUCTION }]
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Gemini API Error: ${response.statusText}`);
        }

        const data = await response.json();
        const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm thinking...";

        return { text: aiText };

    } catch (error) {
        console.error("Gemini AI Error:", error);
        throw new HttpsError('internal', 'AI generation failed');
    }
});
