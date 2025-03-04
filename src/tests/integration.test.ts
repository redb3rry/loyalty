import request from "supertest";
import app from "../app";
import { store } from "../models/store";

describe("Loyalty Service Endpoints", () => {
  beforeEach(() => {
    store.customers.clear();
    store.orders.clear();
    store.pendingEvents = {};
    jest.useRealTimers();
  });

  describe("Basic Endpoints", () => {
    test("Should return error for invalid event payload", async () => {
      await request(app)
        .post("/webhook")
        .send({ wrong: "payload" })
        .expect(400);
    });

    test("Customer creation and point accumulation via OrderPlaced", async () => {
      // Create customer.
      await request(app)
        .post("/webhook")
        .send({
          EventTime: new Date().toISOString(),
          EventName: "CustomerCreated",
          EntityName: "Customer",
          Sequence: 1,
          Payload: { CustomerId: "cust123" }
        })
        .expect(200);

      // Place order for 120 DKK → 2 points.
      await request(app)
        .post("/webhook")
        .send({
          EventTime: new Date().toISOString(),
          EventName: "OrderPlaced",
          EntityName: "Order",
          Sequence: 1,
          Payload: { OrderId: "order1", CustomerId: "cust123", TotalOrderAmount: 120 }
        })
        .expect(200);

      const res = await request(app)
        .get("/cust123/points")
        .expect(200);
      expect(res.body.pointsAvailable).toBe(2);
    });

    test("Should not double-count duplicate events", async () => {
      await request(app)
        .post("/webhook")
        .send({
          EventTime: new Date().toISOString(),
          EventName: "CustomerCreated",
          EntityName: "Customer",
          Sequence: 1,
          Payload: { CustomerId: "custDup" }
        })
        .expect(200);

      const orderEvent = {
        EventTime: new Date().toISOString(),
        EventName: "OrderPlaced",
        EntityName: "Order",
        Sequence: 1,
        Payload: { OrderId: "orderDup", CustomerId: "custDup", TotalOrderAmount: 200 }
      };
      await request(app).post("/webhook").send(orderEvent).expect(200);
      // Send duplicate.
      await request(app).post("/webhook").send(orderEvent).expect(200);

      const res = await request(app)
        .get("/custDup/points")
        .expect(200);
      expect(res.body.pointsAvailable).toBe(4);
    });

    test("Consume loyalty points successfully and handle insufficient balance", async () => {
      await request(app)
        .post("/webhook")
        .send({
          EventTime: new Date().toISOString(),
          EventName: "CustomerCreated",
          EntityName: "Customer",
          Sequence: 1,
          Payload: { CustomerId: "custConsume" }
        })
        .expect(200);

      await request(app)
        .post("/webhook")
        .send({
          EventTime: new Date().toISOString(),
          EventName: "OrderPlaced",
          EntityName: "Order",
          Sequence: 1,
          Payload: { OrderId: "orderConsume", CustomerId: "custConsume", TotalOrderAmount: 200 }
        })
        .expect(200);

      let res = await request(app)
        .get("/custConsume/points")
        .expect(200);
      expect(res.body.pointsAvailable).toBe(4);

      // Consume 3 points.
      res = await request(app)
        .post("/custConsume/consume")
        .send({ points: 3 })
        .expect(200);
      expect(res.body.pointsAvailable).toBe(1);

      // Attempt to consume more than available.
      await request(app)
        .post("/custConsume/consume")
        .send({ points: 5 })
        .expect(400);
    });

    test("Invalid consumption request returns error", async () => {
      await request(app)
        .post("/webhook")
        .send({
          EventTime: new Date().toISOString(),
          EventName: "CustomerCreated",
          EntityName: "Customer",
          Sequence: 1,
          Payload: { CustomerId: "custInvalid" }
        })
        .expect(200);

      await request(app)
        .post("/custInvalid/consume")
        .send({ points: -5 })
        .expect(400);
      await request(app)
        .post("/custInvalid/consume")
        .send({ points: "ten" })
        .expect(400);
    });

    test("OrderReturned reverses points", async () => {
      await request(app)
        .post("/webhook")
        .send({
          EventTime: new Date().toISOString(),
          EventName: "CustomerCreated",
          EntityName: "Customer",
          Sequence: 1,
          Payload: { CustomerId: "custReturn" }
        })
        .expect(200);

      await request(app)
        .post("/webhook")
        .send({
          EventTime: new Date().toISOString(),
          EventName: "OrderPlaced",
          EntityName: "Order",
          Sequence: 1,
          Payload: { OrderId: "orderReturn", CustomerId: "custReturn", TotalOrderAmount: 100 }
        })
        .expect(200);

      let res = await request(app)
        .get("/custReturn/points")
        .expect(200);
      expect(res.body.pointsAvailable).toBe(2);

      await request(app)
        .post("/webhook")
        .send({
          EventTime: new Date().toISOString(),
          EventName: "OrderReturned",
          EntityName: "Order",
          Sequence: 2,
          Payload: { OrderId: "orderReturn", CustomerId: "custReturn", TotalOrderAmount: 100 }
        })
        .expect(200);

      res = await request(app)
        .get("/custReturn/points")
        .expect(200);
      expect(res.body.pointsAvailable).toBe(0);
    });
  });

  describe("Buffering and Out‑of‑Order Events", () => {
    test("OrderPlaced before CustomerCreated: buffered order event processed after customer creation", async () => {
      // Send OrderPlaced event for a non-existent customer.
      const orderEvent = {
        EventTime: new Date().toISOString(),
        EventName: "OrderPlaced",
        EntityName: "Order",
        Sequence: 1,
        Payload: { OrderId: "orderBuffer1", CustomerId: "custBuffer1", TotalOrderAmount: 150 }
      };
      await request(app).post("/webhook").send(orderEvent).expect(200);
      await request(app).get("/custBuffer1/points").expect(404);

      // Now create the customer.
      await request(app)
        .post("/webhook")
        .send({
          EventTime: new Date().toISOString(),
          EventName: "CustomerCreated",
          EntityName: "Customer",
          Sequence: 1,
          Payload: { CustomerId: "custBuffer1" }
        })
        .expect(200);

      const res = await request(app)
        .get("/custBuffer1/points")
        .expect(200);
      expect(res.body.pointsAvailable).toBe(3);
    });

    test("Old orders coming in after customer deletion: buffered events are discarded", async () => {
      // Create then delete customer.
      await request(app)
        .post("/webhook")
        .send({
          EventTime: new Date().toISOString(),
          EventName: "CustomerCreated",
          EntityName: "Customer",
          Sequence: 1,
          Payload: { CustomerId: "custDel" }
        })
        .expect(200);
      await request(app)
        .post("/webhook")
        .send({
          EventTime: new Date().toISOString(),
          EventName: "CustomerDeleted",
          EntityName: "Customer",
          Sequence: 2,
          Payload: { CustomerId: "custDel" }
        })
        .expect(200);

      // Now send an OrderPlaced event after deletion.
      await request(app)
        .post("/webhook")
        .send({
          EventTime: new Date().toISOString(),
          EventName: "OrderPlaced",
          EntityName: "Order",
          Sequence: 1,
          Payload: { OrderId: "orderDel", CustomerId: "custDel", TotalOrderAmount: 100 }
        })
        .expect(200);
      await request(app).get("/custDel/points").expect(404);
    });

    test("OrderReturn/Cancellation arriving before OrderPlaced: buffered and processed correctly", async () => {
      // Create customer.
      await request(app)
        .post("/webhook")
        .send({
          EventTime: new Date().toISOString(),
          EventName: "CustomerCreated",
          EntityName: "Customer",
          Sequence: 1,
          Payload: { CustomerId: "custReturnOrder" }
        })
        .expect(200);

      // Send OrderReturned (sequence 2) before OrderPlaced.
      const returnEvent = {
        EventTime: new Date().toISOString(),
        EventName: "OrderReturned",
        EntityName: "Order",
        Sequence: 2,
        Payload: { OrderId: "orderReturnOrder" }
      };
      await request(app).post("/webhook").send(returnEvent).expect(200);

      let res = await request(app)
        .get("/custReturnOrder/points")
        .expect(200);
      expect(res.body.pointsAvailable).toBe(0);

      // Now send OrderPlaced (sequence 1).
      const placedEvent = {
        EventTime: new Date().toISOString(),
        EventName: "OrderPlaced",
        EntityName: "Order",
        Sequence: 1,
        Payload: { OrderId: "orderReturnOrder", CustomerId: "custReturnOrder", TotalOrderAmount: 100 }
      };
      await request(app).post("/webhook").send(placedEvent).expect(200);

      res = await request(app)
        .get("/custReturnOrder/points")
        .expect(200);
      // OrderPlaced would add 2 points then OrderReturned reverses them.
      expect(res.body.pointsAvailable).toBe(0);
    });
  });
});
