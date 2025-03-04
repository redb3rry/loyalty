# Loyalty Service

This Node.js service implements an event driven customer loyalty program. It supports:

- **Loyalty Points:** Earn 1 point per 50 DKK spent.
- **Points Expiry:** Points expire 6 months after being awarded.
- **Consumption:** Points can be consumed to purchase products.

Because of the limited time I had to dedicate to this task I chose to focus on the event processing and handling logic above all, as I believe that proper handling of consuming the supplied events is the most important part of this task. The `pointsService.ts` could definitely use a bit more time for improvements and obviously persistent data storage would need to be implemented for a production application.

Automated tests are included and cover quite a bit, although as many say, there's never too many tests - so I'd like to cover some more edge cases. The testing code also isn't as clean and well structured as I'd like, but I focused on having a wide suite of cases covered in the time I had.

## Endpoints

1. **Event Webhook** – `POST /webhook`  
   Accepts JSON events (e.g. `CustomerCreated`, `CustomerDeleted`, `OrderPlaced`, `OrderReturned`, `OrderCanceled`).  
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

## Assumptions

As this is a proof-of-concept service created for a Case, a few assumptions were made about the underlying logic:

* Customer IDs are assumed to be guaranteed unique.
* Any `OrderPlaced` events for a customer arriving after `CustomerDeleted` will be discarded. This is because from the Loyalty Points Service point of view these events are irrelevant - the customer no longer exists and as such cannot store or use points anyway.
* Similarily, any `OrderCanceled` or `OrderReturned` arriving for a deleted customer are ignored.
* `OrderCanceled` and `OrderReturned` are assumed to have the same effect for the Loyalty Points Service - order status is changed and any loyalty points gained from that order are nullified (point records removed from customer).
* The service does not guard against loyalty points gained from a given order being spent and that same order being later canceled/returned. If this is not guaranteed by the client-facing service this would need to be implemented.

## Implementation Details
- **In-Memory Store:**
For simplicity the service uses an in-memory store (customers, orders, and point records). In production you’d use persistent storage.

- **Out-of-Order Processing:**
The service handles events arriving out of order, based on the `Sequence` parameter attached to events hitting the `/webhook` endpoint.
This is straightforward for Customer Creation/Deletion, but slightly more complicated for Order events. Customer Creation will always have `Sequence = 1` and Customer Deltion will always have `Sequence = 2`. However `OrderPlaced` may have any number Sequence, as the parameter describes the order of Orders placed by a given customer. As such `OrderReturned` and `OrderCanceled` will always have `Sequence = 2` but may follow an `OrderPlaced` with any number.

- **Points Expiry:**
When calculating available points, records older than 6 months are ignored.

- **Consumption Logic:**
Points are deducted in a FIFO manner from the oldest (non-expired) records.

## Running the Service
1) Install dependencies:
```bash
npm install
```
2) Build and start:
```bash
npm run build
npm start
```
For development:
```bash
npm run dev
```
## Testing
Automated tests (using Jest and Supertest) are provided. Run tests with:

```bash
npm test
```