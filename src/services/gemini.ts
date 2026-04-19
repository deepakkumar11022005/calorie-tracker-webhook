import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY!;
const ai = new GoogleGenAI({ apiKey });

export async function analyzeMealImage(imageBuffer: Buffer, mimeType: string) {
    const prompt = `Identify ALL individual food items in this image separately. Estimate portion and nutrition for each relative to a standard portion.
    Return ONLY a valid JSON Array of objects matching exactly this structure, nothing else:
    [
      { "dish": "Apple", "kcal": 95, "protein_g": 0, "carbs_g": 25, "fat_g": 0 },
      { "dish": "Boiled Egg", "kcal": 70, "protein_g": 6, "carbs_g": 1, "fat_g": 5 }
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
