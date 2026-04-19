import { Router, Request, Response } from 'express';
import { downloadMedia, sendWhatsAppReply } from '../services/whatsapp';
import { analyzeMealImage, analyzeDietConversation } from '../services/gemini';
import { logMeal, getUserGoal, getDailyKcalSum, getMealsForToday, getStreakAndWeekly } from '../services/database';

export const webhookRouter = Router();

// In-Memory cache for holding image analysis state before logging
const pendingMealCache = new Map<string, any[]>();

webhookRouter.get('/', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;

    if (mode && token) {
        if (mode === 'subscribe' && token === verifyToken) {
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.status(400).send('Missing parameters');
    }
});

webhookRouter.post('/', async (req: Request, res: Response) => {
    res.sendStatus(200);

    const body = req.body;

    if (body.object && body.entry && body.entry[0].changes) {
        const value = body.entry[0].changes[0].value;

        if (value.statuses && value.statuses[0]) {
            return;
        }

        if (value.messages && value.messages[0]) {
            const msg = value.messages[0];
            const from = msg.from;

            try {
                if (msg.type === 'image') {
                    const mediaId = msg.image.id;
                    const mimeType = msg.image.mime_type;

                    const imageBuffer = await downloadMedia(mediaId);

                    // Returns an ARRAY of items now!
                    const mealItems = await analyzeMealImage(imageBuffer, mimeType);

                    if (!Array.isArray(mealItems) || mealItems.length === 0) {
                        await sendWhatsAppReply(from, "I couldn't identify specific items in this image. Please try another one!");
                        return;
                    }

                    // Save array to memory cache using user's phone number as key
                    pendingMealCache.set(from, mealItems);

                    let reply = `📸 *I identified ${mealItems.length} items in your photo:*\n`;
                    mealItems.forEach((item, index) => {
                        reply += `\n*${index + 1}. ${item.dish}* (🔥 ~${item.kcal} kcal)`;
                    });
                    reply += `\n\nReply with the *numbers* you decided to eat (like "1, 2"), reply *"all"* to log everything, or *"none"* to cancel!`;

                    await sendWhatsAppReply(from, reply);

                } else if (msg.type === 'text') {
                    const text = msg.text.body.trim().toLowerCase();

                    // 1. STATEFUL MODE: If they are actively deciding what to log from an image
                    if (pendingMealCache.has(from)) {
                        const cachedItems = pendingMealCache.get(from)!;
                        pendingMealCache.delete(from); // Clear cache immediately

                        if (text === 'none') {
                            await sendWhatsAppReply(from, "Cancelled! Nothing was logged.");
                            return;
                        }

                        let itemsToLog: any[] = [];
                        if (text === 'all') {
                            itemsToLog = cachedItems;
                        } else {
                            // Extract numbers from text (e.g. "1, 3")
                            const numbers = text.match(/\d+/g);
                            if (numbers) {
                                numbers.forEach((num: string) => {
                                    const idx = parseInt(num) - 1;
                                    if (cachedItems[idx]) itemsToLog.push(cachedItems[idx]);
                                });
                            }
                        }

                        if (itemsToLog.length === 0) {
                            await sendWhatsAppReply(from, "I didn't understand that selection, so I cancelled the log. Please upload the photo again!");
                            return;
                        }

                        // Log the items
                        let totalKcalLogged = 0;
                        let names = [];
                        let macros = { p: 0, c: 0, f: 0 };

                        for (const item of itemsToLog) {
                            await logMeal(from, item);
                            totalKcalLogged += item.kcal;
                            macros.p += item.protein_g;
                            macros.c += item.carbs_g;
                            macros.f += item.fat_g;
                            names.push(item.dish);
                        }

                        const dailySum = await getDailyKcalSum(from);
                        const goal = await getUserGoal(from);
                        const { streak } = await getStreakAndWeekly(from, goal);

                        await sendWhatsAppReply(from, `✅ *Successfully Logged:*\n${names.join(', ')}\n\n🔥 +${totalKcalLogged} kcal\n🥩 ${macros.p}g Protein | 🍞 ${macros.c}g Carbs | 🥑 ${macros.f}g Fat\n\n📊 *Today's Progress*: ${dailySum}/${goal} kcal\n🔥 *${streak} Day Goal Streak!*`);
                        return; // Escape! Don't let the generic AI coach trigger.
                    }

                    // 2. STATELESS MODE: Fetch user history to feed to generic Gemini conversational coach
                    const dailySum = await getDailyKcalSum(from);
                    const goal = await getUserGoal(from);
                    const mealsString = await getMealsForToday(from);
                    const { streak, weeklySummary } = await getStreakAndWeekly(from, goal);

                    const aiReply = await analyzeDietConversation(text, mealsString, dailySum, goal, weeklySummary);

                    await sendWhatsAppReply(from, aiReply);

                } else {
                    await sendWhatsAppReply(from, `Sorry, I only understand photos of food and text messages!`);
                }
            } catch (err) {
                console.error('❌ [FATAL DEBUG ERROR]', err);
                // Clear cache on error just in case
                if (pendingMealCache.has(from)) pendingMealCache.delete(from);
                await sendWhatsAppReply(from, `Sorry, an internal error occurred while tracking your diet!`);
            }
        }
    }
});
