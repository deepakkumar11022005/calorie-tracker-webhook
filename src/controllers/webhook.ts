import { Router, Request, Response } from 'express';
import { downloadMedia, sendWhatsAppReply } from '../services/whatsapp';
import { analyzeMealImage } from '../services/gemini';
import { logMeal, getUserGoal, getDailyKcalSum } from '../services/database';

export const webhookRouter = Router();

// This endpoint handles Meta webhook verification when setting up 
webhookRouter.get('/', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;

    if (mode && token) {
        if (mode === 'subscribe' && token === verifyToken) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.status(400).send('Missing parameters');
    }
});

// This endpoint receives incoming WhatsApp payloads
webhookRouter.post('/', async (req: Request, res: Response) => {
    // Crucial: Respond 200 OK to Meta instantly to prevent retries
    res.sendStatus(200);

    const body = req.body;

    if (body.object && body.entry && body.entry[0].changes) {
        const value = body.entry[0].changes[0].value;

        // Ensure there is a message
        if (value.messages && value.messages[0]) {
            const msg = value.messages[0];
            const from = msg.from;

            try {
                // If the user sent an image, handle meal tracking
                if (msg.type === 'image') {
                    const mediaId = msg.image.id;
                    const mimeType = msg.image.mime_type;

                    // 1. Download image from Meta
                    const imageBuffer = await downloadMedia(mediaId);

                    // 2. Identify food and estimate calories using Gemini
                    const mealData = await analyzeMealImage(imageBuffer, mimeType);

                    // 3. Save to database
                    await logMeal(from, mealData);

                    // 4. Calculate progress
                    const dailySum = await getDailyKcalSum(from);
                    const goal = await getUserGoal(from);

                    // 5. Reply to User
                    const reply = `🍽️ *${mealData.dish}*\n🔥 ~${mealData.kcal} kcal\n🥩 ${mealData.protein_g}g Protein\n\n📊 *Today's Progress*: ${dailySum}/${goal} kcal`;
                    await sendWhatsAppReply(from, reply);
                }
                // Alternatively, handle text commands (e.g. 'summary')
                else if (msg.type === 'text') {
                    const text = msg.text.body.trim().toLowerCase();
                    if (text === 'summary') {
                        const dailySum = await getDailyKcalSum(from);
                        const goal = await getUserGoal(from);
                        await sendWhatsAppReply(from, `📊 *Today's Progress*: ${dailySum}/${goal} kcal`);
                    } else {
                        await sendWhatsAppReply(from, `Send me a photo of your meal to track it!`);
                    }
                }
            } catch (err) {
                console.error('Error processing message flow:', err);
                // Send fallback message so user isn't stuck waiting
                await sendWhatsAppReply(from, `Sorry, we experienced an issue tracking that meal. Please try again!`);
            }
        }
    }
});
