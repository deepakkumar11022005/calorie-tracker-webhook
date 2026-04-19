import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY!;
const ai = new GoogleGenAI({ apiKey });

export async function analyzeMealImage(imageBuffer: Buffer, mimeType: string) {
    console.log('Sending image to Gemini for analysis...');

    const prompt = `Identify the food in this image. Estimate the portion size and nutritional values.
    Return ONLY a valid JSON object matching exactly this structure, nothing else:
    { "dish": "name of food", "kcal": number, "protein_g": number, "carbs_g": number, "fat_g": number, "confidence": "high|medium|low" }`;

    try {
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

        const responseText = response.text || "{}";
        // Clean markdown backticks if Gemini returns them
        const cleanedJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        return JSON.parse(cleanedJson);
    } catch (error) {
        console.error('Error analyzing image with Gemini:', error);
        throw error;
    }
}
