import { Router, Request, Response } from "express";
import { processEvent } from "../services/eventProcessor";

const router = Router();

router.post('/webhook', (req: Request, res: Response) => {
  try {
    const event = req.body;
    if (!event || !event.EventName || !event.Sequence) {
      return res.status(400).json({ error: "Invalid event format" });
    }
    processEvent(event);
    res.status(200).json({ status: "Event processed" });
  } catch (err) {
    console.error("Error processing event", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
