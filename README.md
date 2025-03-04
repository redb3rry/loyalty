# Loyalty Service

This Node.js service implements a customer loyalty program for Whiteaway. It supports:

- **Loyalty Points:** Earn 1 point per 50 DKK spent.
- **Points Expiry:** Points expire 6 months after being awarded.
- **Consumption:** Points can be consumed to purchase products.

## Endpoints

1. **Event Webhook** – `POST /webhook`  
   Accepts JSON events (e.g. `CustomerCreated`, `OrderPlaced`, `OrderReturned`, `OrderCanceled`).  
   Events are processed idempotently using a sequence number and entity key.

2. **Get Loyalty Points** – `GET /:customerId/points`  
   Returns the current available points for the customer:
   ```
   {
     "pointsAvailable": int
   }
   ```
3. **Consume Loyalty Points** – `POST /:customerId/consume`  
   Subtracts the specified number of points from the customer's balance and returns the new balance:
   ```
   {
     "points": int
   }
   ```