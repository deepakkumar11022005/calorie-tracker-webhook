import express from 'express';
import dotenv from 'dotenv';
import { verifyMetaSignature } from './middleware/verifySignature';
import { errorHandler } from './middleware/errorHandler';
import { webhookRouter } from './controllers/webhook';

// Load environment variables immediately
dotenv.config();

const app = express();

// Webhook route - using JSON parser with signature verification
app.use('/webhook', express.json({ verify: verifyMetaSignature }), webhookRouter);

// Middleware for other generic routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic health check endpoint to verify server is running
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Server is healthy' });
});

app.use(errorHandler);

export default app;
