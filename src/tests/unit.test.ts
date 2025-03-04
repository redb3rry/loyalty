import { getEntityKey, processEvent } from "../services/eventProcessor";
import { store, Customer } from "../models/store";
import { getAvailablePoints, consumePoints } from "../services/pointsService";

describe("Event Processor Unit Tests", () => {
  beforeEach(() => {
    store.customers.clear();
    store.orders.clear();
    store.pendingEvents = {};
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-01-01T00:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("Point Calculation and Consumption", () => {
    test("getAvailablePoints returns correct sum, ignoring expired records", () => {
      const customer: Customer = {
        id: "custUnit",
        pointRecords: [],
        processedSequence: 1,
        deletedAt: null
      };
      const now = new Date();
      const pastDate = new Date(now);
      pastDate.setMonth(now.getMonth() - 7); // expired

      customer.pointRecords.push({
        points: 5,
        earnedAt: now,
        orderId: "order"
      });
      customer.pointRecords.push({
        points: 3,
        earnedAt: pastDate,
        orderId: "order2"
      });
      const available = getAvailablePoints(customer, now);
      expect(available).toBe(5);
    });

    test("consumePoints deducts points using FIFO strategy", () => {
      const customer: Customer = {
        id: "custConsumeUnit",
        pointRecords: [],
        processedSequence: 1,
        deletedAt: null
      };
      const now = new Date();
      customer.pointRecords.push({
        points: 2,
        earnedAt: new Date(now.getTime() - 10000),
        orderId: "order"
      });
      customer.pointRecords.push({
        points: 4,
        earnedAt: new Date(now.getTime() - 5000),
        orderId: "order2"
      });
      const success = consumePoints(customer, 5, now);
      expect(success).toBe(true);
      const remaining = getAvailablePoints(customer, now);
      expect(remaining).toBe(1);
    });
  });

  describe("Buffering Logic", () => {
    test("OrderPlaced event buffered when customer does not exist, then processed after CustomerCreated", () => {
      // Order event arrives before customer.
      const orderEvent = {
        EventTime: new Date().toISOString(),
        EventName: "OrderPlaced",
        EntityName: "Order",
        Sequence: 1,
        Payload: { OrderId: "orderMissingCust", CustomerId: "custMissing", TotalOrderAmount: 200 }
      };
      processEvent(orderEvent);
      expect(store.customers.has("custMissing")).toBe(false);

      // Now create customer.
      const customerEvent = {
        EventTime: new Date().toISOString(),
        EventName: "CustomerCreated",
        EntityName: "Customer",
        Sequence: 1,
        Payload: { CustomerId: "custMissing" }
      };
      processEvent(customerEvent);
      const customer = store.customers.get("custMissing")!;
      expect(getAvailablePoints(customer)).toBe(4);
    });

    test("Old order events are discarded after customer deletion", () => {
      // Create customer.
      const customerEvent = {
        EventTime: new Date().toISOString(),
        EventName: "CustomerCreated",
        EntityName: "Customer",
        Sequence: 1,
        Payload: { CustomerId: "custToDelete" }
      };
      processEvent(customerEvent);
      // Create order event.
      const orderEvent = {
        EventTime: new Date().toISOString(),
        EventName: "OrderPlaced",
        EntityName: "Order",
        Sequence: 1,
        Payload: { OrderId: "orderToDelete", CustomerId: "custToDelete", TotalOrderAmount: 150 }
      };
      processEvent(orderEvent);
      let customer = store.customers.get("custToDelete")!;
      expect(getAvailablePoints(customer)).toBe(3);

      // Delete customer.
      const deleteEvent = {
        EventTime: new Date().toISOString(),
        EventName: "CustomerDeleted",
        EntityName: "Customer",
        Sequence: 2,
        Payload: { CustomerId: "custToDelete" }
      };
      processEvent(deleteEvent);
      expect(store.customers.get("custToDelete")?.deletedAt).not.toBeNull();

      // Send new order event after deletion.
      const newOrderEvent = {
        EventTime: new Date().toISOString(),
        EventName: "OrderPlaced",
        EntityName: "Order",
        Sequence: 2,
        Payload: { OrderId: "orderAfterDelete", CustomerId: "custToDelete", TotalOrderAmount: 100 }
      };
      processEvent(newOrderEvent);
      expect(store.pendingEvents[getEntityKey(newOrderEvent)][2]).toBeUndefined();
    });

    test("OrderReturn event arriving before OrderPlaced is buffered and processed correctly", () => {
      // Create customer.
      const customerEvent = {
        EventTime: new Date().toISOString(),
        EventName: "CustomerCreated",
        EntityName: "Customer",
        Sequence: 1,
        Payload: { CustomerId: "custReturnBeforePlaced" }
      };
      processEvent(customerEvent);
      // Send OrderReturned event with sequence 2 before OrderPlaced.
      const returnEvent = {
        EventTime: new Date().toISOString(),
        EventName: "OrderReturned",
        EntityName: "Order",
        Sequence: 2,
        Payload: { OrderId: "orderReturnBefore", CustomerId: "custReturnBeforePlaced", TotalOrderAmount: 100 }
      };
      processEvent(returnEvent);
      let customer = store.customers.get("custReturnBeforePlaced")!;
      expect(getAvailablePoints(customer)).toBe(0);

      // Now send OrderPlaced event with sequence 1.
      const placedEvent = {
        EventTime: new Date().toISOString(),
        EventName: "OrderPlaced",
        EntityName: "Order",
        Sequence: 1,
        Payload: { OrderId: "orderReturnBefore", CustomerId: "custReturnBeforePlaced", TotalOrderAmount: 100 }
      };
      processEvent(placedEvent);
      expect(getAvailablePoints(customer)).toBe(0);
    });
  });
});
