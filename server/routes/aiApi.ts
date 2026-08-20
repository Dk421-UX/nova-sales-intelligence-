import { Router, Request, Response } from 'express';
import { aiService } from '../services/ai/aiService.ts';

export const aiRouter = Router();

aiRouter.post('/ask', async (req: Request, res: Response) => {
  try {
    const { messages, projectSlug } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    const response = await aiService.askNova(messages, projectSlug);
    res.json({
      success: true,
      answer: response.text,
      executedTools: response.executedTools,
      verifiedData: response.verifiedData
    });
  } catch (err: any) {
    console.error('[AI Route Error]:', err);
    res.status(500).json({
      error: 'Ask Nova is currently unable to process your request. Please try again or explore properties directly on the interactive map.'
    });
  }
});
