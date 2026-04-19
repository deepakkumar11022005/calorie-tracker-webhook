import { Request, Response } from 'express';
import crypto from 'crypto';

export const verifyMetaSignature = (req: Request, res: Response, buf: Buffer, encoding: string) => {
    // Webhook verification configuration from Meta uses a GET request
    // We only verify signatures on POST requests containing actual webhook payloads
    if (req.method !== 'POST') return;

    const signature = req.headers['x-hub-signature-256'] as string;

    if (!signature) {
        console.error('No signature found on request');
        throw new Error('No signature found');
    }

    const appSecret = process.env.APP_SECRET;
    if (!appSecret) {
        console.error('APP_SECRET is not defined in environment variables');
        throw new Error('Server configuration error');
    }

    const expectedSignature = `sha256=${crypto
        .createHmac('sha256', appSecret)
        .update(buf)
        .digest('hex')}`;

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    // Provide length protection and timing safety calculation against timing attacks
    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
        console.error('Signature verification failed');
        throw new Error('Invalid signature');
    }
};
