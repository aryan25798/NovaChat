
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const SYSTEM_INSTRUCTION = `You are the Gemini AI Assistant in a WhatsApp Clone app. 
- Keep your anwers concise and helpful, like a real chat friend.
- You can use emojis.
- Format responses using Markdown (bold, italic, lists).
- If asked about the app, say it's a WhatsApp Clone built with React and Firebase.`;

export async function getGeminiResponse(message, history = []) {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_API_KEY_HERE") {
        console.warn("Gemini API Key missing. Please set VITE_GEMINI_API_KEY in .env");
        return "I am Gemini, but my API key is missing. Please add VITE_GEMINI_API_KEY to your .env file to enable me.";
    }

    try {
        // Convert local message format to Gemini format if needed, 
        // or expect 'history' to be passed in correct format: { role: 'user' | 'model', parts: [{ text: ... }] }
        // For simplicity, we'll assume the caller formats it or we just send the new message if history is complex to sync.

        // Simple construct:
        const contents = [
            {
                role: "user",
                parts: [{ text: SYSTEM_INSTRUCTION }]
            },
            ...history,
            {
                role: "user",
                parts: [{ text: message }]
            }
        ];

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ contents })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || "API Request Failed");
        }

        if (data.candidates && data.candidates.length > 0) {
            return data.candidates[0].content.parts[0].text;
        } else {
            return "I couldn't generate a response.";
        }
    } catch (error) {
        console.error("Gemini API Error:", error);
        return "Sorry, I'm having trouble connecting to Gemini right now. Error: " + error.message;
    }
}
