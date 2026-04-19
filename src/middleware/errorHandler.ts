import { Request, Response, NextFunction } from 'express';

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Error encountered:', err.message);

    if (err.message === 'Invalid signature' || err.message === 'No signature found') {
        res.status(403).json({ error: 'Signature verification failed' });
        return;
    }

    res.status(500).json({ error: 'Internal Server Error' });
};
