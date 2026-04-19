import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY!;
const ai = new GoogleGenAI({ apiKey });

export async function analyzeMealImage(imageBuffer: Buffer, mimeType: string) {
    const prompt = `Identify ALL individual food items in this image separately. Estimate portion and nutrition for each relative to a standard portion.
    If there are multiple pieces of the same item (e.g. 2 idlis, 3 cookies), strictly include the exact count and quantity inside the "dish" name!
    Return ONLY a valid JSON Array of objects matching exactly this structure, nothing else:
    [
      { "dish": "Apple (1 medium)", "kcal": 95, "protein_g": 0, "carbs_g": 25, "fat_g": 0 },
      { "dish": "Idli (2 pieces)", "kcal": 120, "protein_g": 4, "carbs_g": 24, "fat_g": 1 }
    ]`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
            {
                role: 'user',
                parts: [
                    { inlineData: { data: imageBuffer.toString('base64'), mimeType } },
                    { text: prompt }
                ]
            }
        ]
    });

    const responseText = response.text || "[]";
    const cleanedJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanedJson);
}

export async function analyzeDietConversation(userText: string, mealsString: string, dailySum: number, goal: number, weeklySummary: string): Promise<{ reply: string, mealToLog?: any }> {
    console.log('Asking Gemini for conversational coaching...');

    const prompt = `You are a supportive, concise WhatsApp weight loss coach. 
STRICT GROUNDING RULES:
- The ONLY source of truth for the user's progress is: Goal: ${goal} kcal, Consumed: ${dailySum} kcal.
- Do NOT invent or estimate a daily total. If the data says ${dailySum}, you must use ${dailySum}.
- Use the following meal log for today's history:
${mealsString}
- Use this weekly performance:
${weeklySummary}

The user just sent you: "${userText}"

YOUR TASKS:
1. LOGGING: If the user clearly states they ATE or WANT TO LOG a food (e.g. "ate one banana", "log coffee"), return:
[LOG_MEAL: {"dish": "Banana (1 piece)", "kcal": 105, "protein_g": 1, "carbs_g": 27, "fat_g": 0}]
Only log if it is an explicit action. Do NOT log if they are just asking a question (e.g. "How many calories in a banana?").

2. COACHING: If they ask for a summary, progress, or advice, use the STRICT GROUNDING data. If they've eaten nothing, acknowledge they are starting fresh.

3. SUGGESTIONS: If they type "/suggest", recommend a meal within their remaining ${goal - dailySum} kcal balance. Be specific.

Reply strictly as the coach. Use emojis. Keep it very concise (1-2 sentences where possible).`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
    });

    const reply = response.text || "I'm having trouble thinking of a reply right now.";

    // Parse out potential LOG_MEAL signal
    let mealToLog = null;
    const logMatch = reply.match(/\[LOG_MEAL:\s*({.*?})\]/);
    if (logMatch) {
        try {
            mealToLog = JSON.parse(logMatch[1]);
        } catch (e) {
            console.error("Failed to parse meal log from AI reply");
        }
    }

    // Clean the signal out of the user-visible reply
    const cleanReply = reply.replace(/\[LOG_MEAL:.*?\]/, '').trim();

    return { reply: cleanReply, mealToLog };
}

export async function parseUserFoodSelection(userText: string, cachedItems: any[]): Promise<any> {
    const prompt = `The user was presented with this menu of detected foods:
${JSON.stringify(cachedItems, null, 2)}

The user replied with this text: "${userText}"

Is the user trying to make a selection or add foods from this menu? (e.g. "3", "add 4", "number 2", "1 and 4").
If YES: Figure out exactly which items they are selecting. If they specify a quantity, mathematically multiply the kcal and macros. Return ONLY a valid formatted JSON Array of the items they ate.
If NO (e.g. the user is asking a general question, asking for a summary, or conversational chatting): Return EXACTLY this strict string: EXIT_CACHE`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
    });

    const responseText = (response.text || "").trim();
    if (responseText.includes('EXIT_CACHE')) return 'EXIT_CACHE';

    const cleanedJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
        return JSON.parse(cleanedJson);
    } catch (err) {
        return [];
    }
}
