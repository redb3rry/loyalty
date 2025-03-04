import { Router, Request, Response } from "express";
import { store } from "../models/store";
import { getAvailablePoints, consumePoints } from "../services/pointsService";

const router = Router();

router.get('/:customerId/points', (req: Request, res: Response) => {
  const customerId = req.params.customerId;
  const customer = store.customers.get(customerId);
  if (!customer || customer.deletedAt) {
    return res.status(404).json({ error: "Customer not found" });
  }
  const pointsAvailable = getAvailablePoints(customer);
  res.status(200).json({ pointsAvailable });
});

router.post('/:customerId/consume', (req: Request, res: Response) => {
  const customerId = req.params.customerId;
  const { points } = req.body;
  if (typeof points !== "number" || points <= 0) {
    return res.status(400).json({ error: "Invalid points value" });
  }
  const customer = store.customers.get(customerId);
  if (!customer || customer.deletedAt) {
    return res.status(404).json({ error: "Customer not found" });
  }
  const success = consumePoints(customer, points);
  if (!success) {
    return res.status(400).json({ error: "Insufficient points" });
  }
  const pointsAvailable = getAvailablePoints(customer);
  res.status(200).json({ pointsAvailable });
});


export default router;
