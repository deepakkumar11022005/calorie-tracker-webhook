import { Router, Request, Response } from 'express';
import { downloadMedia, sendWhatsAppReply } from '../services/whatsapp';
import { analyzeMealImage } from '../services/gemini';
import { logMeal, getUserGoal, getDailyKcalSum } from '../services/database';

export const webhookRouter = Router();

// This endpoint handles Meta webhook verification when setting up 
webhookRouter.get('/', (req: Request, res: Response) => {
    console.log('--- GET /webhook (Meta Handshake) ---');
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;

    if (mode && token) {
        if (mode === 'subscribe' && token === verifyToken) {
            console.log('✅ WEBHOOK_VERIFIED successfully!');
            res.status(200).send(challenge);
        } else {
            console.error(`❌ Verification Failed. Expected Token: ${verifyToken}, Received: ${token}`);
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

    console.log('====================================');
    console.log('🔥 [DEBUG] INCOMING POST TARGETED AT /webhook');
    console.log('🔥 [DEBUG] RAW PAYLOAD:', JSON.stringify(body, null, 2));
    console.log('====================================');

    if (body.object && body.entry && body.entry[0].changes) {
        const value = body.entry[0].changes[0].value;

        // Handle message status updates (e.g., delivered/read receipts) silently to avoid clutter
        if (value.statuses && value.statuses[0]) {
            console.log('📬 [DEBUG] Ignoring a message delivery/read status update:', value.statuses[0].status);
            return;
        }

        // Handle actual incoming user messages
        if (value.messages && value.messages[0]) {
            const msg = value.messages[0];
            const from = msg.from;
            console.log(`💬 [DEBUG] Received a physical message of type [${msg.type}] from Sender [${from}]`);

            try {
                if (msg.type === 'image') {
                    const mediaId = msg.image.id;
                    const mimeType = msg.image.mime_type;
                    console.log(`📸 [DEBUG] Identified Image ID [${mediaId}] with MimeType [${mimeType}]`);

                    console.log(`[DEBUG] Attempting to download media from Meta...`);
                    const imageBuffer = await downloadMedia(mediaId);
                    console.log(`✅ [DEBUG] Successfully downloaded ${imageBuffer.length} bytes of image data!`);

                    console.log(`[DEBUG] Handing image off to Gemini for analysis...`);
                    const mealData = await analyzeMealImage(imageBuffer, mimeType);
                    console.log(`✅ [DEBUG] Gemini Analysis Success! Payload:`, mealData);

                    console.log(`[DEBUG] Saving meal object to Supabase database...`);
                    await logMeal(from, mealData);
                    console.log(`✅ [DEBUG] Successfully saved to database!`);

                    console.log(`[DEBUG] Fetching daily calorie sums and goals...`);
                    const dailySum = await getDailyKcalSum(from);
                    const goal = await getUserGoal(from);
                    console.log(`✅ [DEBUG] DB Fetch complete. Today: ${dailySum}, Goal: ${goal}`);

                    const reply = `🍽️ *${mealData.dish}*\n🔥 ~${mealData.kcal} kcal\n🥩 ${mealData.protein_g}g Protein\n\n📊 *Today's Progress*: ${dailySum}/${goal} kcal`;
                    console.log(`[DEBUG] Transmitting final response text via Meta Graph API...`);
                    await sendWhatsAppReply(from, reply);
                    console.log('🚀 [DEBUG] EXACT WORKFLOW COMPLETE!');

                } else if (msg.type === 'text') {
                    const text = msg.text.body.trim().toLowerCase();
                    console.log(`📝 [DEBUG] User sent text: "${text}"`);

                    if (text === 'summary') {
                        const dailySum = await getDailyKcalSum(from);
                        const goal = await getUserGoal(from);
                        console.log(`[DEBUG] Formatted summary. Today: ${dailySum}, Goal: ${goal}`);
                        await sendWhatsAppReply(from, `📊 *Today's Progress*: ${dailySum}/${goal} kcal`);
                    } else {
                        console.log(`[DEBUG] Received unknown command, sending instructions.`);
                        await sendWhatsAppReply(from, `Send me a photo of your meal to track it!`);
                    }
                } else {
                    console.log(`⚠️ [DEBUG] Received unknown or unsupported message type: ${msg.type}`);
                    await sendWhatsAppReply(from, `Sorry, I only understand photos of food and the word "summary"!`);
                }
            } catch (err) {
                console.error('❌ [FATAL DEBUG ERROR] The processing pipeline threw an error!', err);
                await sendWhatsAppReply(from, `Sorry, an internal error occurred while tracking that meal!`);
            }
        } else {
            console.log('⚠️ [DEBUG] No messages array found in the body. (Probably just an empty structure ping from Meta).');
        }
    } else {
        console.log('⚠️ [DEBUG] Valid object/entry/changes hierarchy was missing from the POST payload!');
    }
});
