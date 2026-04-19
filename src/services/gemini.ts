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

export async function analyzeDietConversation(userText: string, mealsString: string, dailySum: number, goal: number, weeklySummary: string): Promise<string> {
    const prompt = `You are a supportive, concise WhatsApp weight loss coach.
The user's daily calorie goal is ${goal} kcal. 
They have consumed ${dailySum} kcal today.

Here is the exact list of foods they ate today:
${mealsString}

Here is their calorie performance over the last 7 days:
${weeklySummary}

The user just sent you this message: "${userText}"

Reply to the user strictly in your persona as the coach. Be highly interactive, give analytics or insights on their diet if they ask. Keep it relatively short (1-3 small paragraphs max) since it's a WhatsApp message. Use emojis. 
If they ask to "List all food I ate", print out the list cleanly. If they ask about their streaks, remind them! 

If they ask for meal suggestions or type "/suggest", explicitly calculate their remaining calories (${goal - dailySum} kcal) and recommend a specific, culturally appropriate meal (based on their food history) that fits perfectly into their remaining balance! Provide rough macros for the suggestion. Support their weight loss journey!`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
    });

    return response.text || "I'm having trouble thinking of a reply right now, but you're doing great!";
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
