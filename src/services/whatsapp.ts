// WhatsApp messaging and logic handler
const token = process.env.WHATSAPP_TOKEN!;
const phoneId = process.env.PHONE_NUMBER_ID!;
const GRAPH_API_VER = 'v19.0';

export async function sendWhatsAppReply(to: string, message: string) {
    console.log(`Sending WhatsApp message to ${to}`);

    const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VER}/${phoneId}/messages`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: to,
            type: 'text',
            text: { body: message }
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error('Failed to send WhatsApp message', errText);
        throw new Error(`WhatsApp API Error: ${errText}`);
    }

    return response.json();
}

export async function downloadMedia(mediaId: string): Promise<Buffer> {
    console.log(`Downloading media ID: ${mediaId}`);

    // 1. Fetch media URL from Meta
    const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VER}/${mediaId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
        throw new Error(`Failed to get media details: ${await res.text()}`);
    }

    const mediaObj = await res.json();

    // 2. Download the actual binary using the retrieved URL
    const mediaRes = await fetch(mediaObj.url, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!mediaRes.ok) {
        throw new Error(`Failed to download binary media: ${await mediaRes.text()}`);
    }

    const arrayBuffer = await mediaRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
