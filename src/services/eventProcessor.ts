import { store } from "../models/store";
import { handleCustomerCreated, handleCustomerDeleted, handleOrderPlaced, handleOrderReturnedOrCanceled } from "./eventHandlers";

export interface Event {
    EventTime: string; // ISO Date string
    EventName: string;
    EntityName: string;
    Sequence: number;
    Payload: any
}

export interface CustomerEvent extends Event {
    Payload: {
        CustomerId: string;
    }
}

export interface OrderEvent extends Event {
    Payload: {
        OrderId: string;
    }
}

export interface OrderPlacedEvent extends Event {
    Payload: {
        OrderId: string;
        CustomerId: string;
        TotalOrderAmount: number;
    }
}



// Helper: Extract entity key from event.
export function getEntityKey(event: Event, read?: boolean): string {
    if (event.EventName === 'CustomerCreated' || event.EventName === 'CustomerDeleted') {
        return `Customer:${(<CustomerEvent>event).Payload.CustomerId}`;
    } else if (
        event.EventName === 'OrderReturned' ||
        event.EventName === 'OrderCanceled' ||
        (event.EventName === 'OrderPlaced' && read)
    ) {
        return `Order:${(<OrderEvent>event).Payload.OrderId}`;
    } else if (event.EventName === 'OrderPlaced') {
        return `OrderPlaced:${(<OrderPlacedEvent>event).Payload.CustomerId}`
    } else {
        throw Error("Unsupported EventName")
    }
}

function handleEvent(event: Event) {
    console.log(`Processing Event with sequence ${event.Sequence}: ${event.EventName} ${event.EventTime}, ${JSON.stringify(event.Payload)}`)

    switch (event.EventName) {
        case "OrderPlaced":
            const { OrderId, CustomerId, TotalOrderAmount } = (<OrderPlacedEvent>event).Payload;
            handleOrderPlaced(CustomerId!, OrderId, TotalOrderAmount!, event.Sequence, event.EventTime);
            break;
        case "OrderReturned": // Assuming both returns and cancellations mean removing related loyalty points, leveraging fall-through
        case "OrderCanceled":
            handleOrderReturnedOrCanceled(event.Sequence, event.EventName, (<OrderEvent>event).Payload.OrderId) 
            break;
        case "CustomerCreated":
            handleCustomerCreated(event.Sequence, (<CustomerEvent>event).Payload.CustomerId);
            break;
        case "CustomerDeleted":
            handleCustomerDeleted(event.Sequence, (<CustomerEvent>event).Payload.CustomerId, event.EventTime);
            break;
        default:
            throw Error("Unknown event type")
    }
}

enum EventOrder {
    IN_ORDER = 'in order',
    OUT_OF_ORDER = 'out of order',
    DUPLICATE = 'duplicate',
    DROP = 'drop'
}

function getEventOrder(event: Event): EventOrder {
    if (event.EventName === "OrderPlaced"){
        const customer = store.customers.get((<OrderPlacedEvent>event).Payload.CustomerId)
        if (!customer || event.Sequence > customer.processedSequence + 1) {
            return EventOrder.OUT_OF_ORDER;
        } else if (customer && event.Sequence == customer.processedSequence) {
            return EventOrder.DUPLICATE;
        } else if (customer && customer.deletedAt) {
            return EventOrder.DROP;
        } else {
            return EventOrder.IN_ORDER;
        }
    } else if (event.EventName === "OrderReturned" || event.EventName === "OrderCanceled") {
        const order = store.orders.get((<OrderEvent>event).Payload.OrderId);
        if (!order) {
            return EventOrder.OUT_OF_ORDER;
        } else if (event.Sequence === order.processedSequence) {
            return EventOrder.DUPLICATE;
        } else {
            return EventOrder.IN_ORDER;
        }
    } else if (event.EventName === "CustomerCreated"){
        const customer = store.customers.get((<CustomerEvent>event).Payload.CustomerId)
        if (customer && !customer.deletedAt) {
            return EventOrder.DUPLICATE;
        } else if (customer && customer.deletedAt) {
            return EventOrder.DROP; // We don't allow duplicate client ids - although as they are UUIDs this shouldn't really happen
        } else {
            return EventOrder.IN_ORDER;
        }
    } else if (event.EventName === "CustomerDeleted"){
        const customer = store.customers.get((<CustomerEvent>event).Payload.CustomerId)
        if (customer && !customer.deletedAt) {
            return EventOrder.IN_ORDER;
        } else if (customer && customer.deletedAt) {
            return EventOrder.DROP;
        } else {
            return EventOrder.OUT_OF_ORDER;
        }
    } else {
        throw Error("Unsupported event")
    }
}

function handleBufferedEvents(event: Event) {
    const entityKey = getEntityKey(event, true);

    // If the event was Customer creation or placing an order, we need to check if we have any order events buffered for processing.
    if (event.EventName === "CustomerCreated" || event.EventName === "OrderPlaced") {
        // If we processed an order we're looking for the next one in sequence. If we created a customer we're looking for the initial order.
        let nextSeq = event.EventName === "OrderPlaced" ? event.Sequence + 1 : 1;
        const orderKey = `OrderPlaced:${event.Payload.CustomerId}`
        while (store.pendingEvents[orderKey] && store.pendingEvents[orderKey][nextSeq]) {
            const bufferedEvent = store.pendingEvents[orderKey][nextSeq];
            delete store.pendingEvents[orderKey][nextSeq];
            handleEvent(bufferedEvent);
            nextSeq = bufferedEvent.Sequence + 1;
        }
    }

    // Check for any pending deletion events (Customer deleted, Order cancelled/returned). These never go higher then 2, so we just check if any such event exists.
    const nextSeq = 2;
    if (store.pendingEvents[entityKey] && store.pendingEvents[entityKey][nextSeq]) {
        const bufferedEvent = store.pendingEvents[entityKey][nextSeq];
        delete store.pendingEvents[entityKey][nextSeq];
        handleEvent(bufferedEvent);
    }
}

export function processEvent(event: Event) {
    const eventOrder = getEventOrder(event);

    console.log(`Received Event: ${event.EventName} ${event.EventTime}; Given sequence: ${event.Sequence} Event order: ${eventOrder}`)

    if (eventOrder == EventOrder.IN_ORDER) {
        handleEvent(event);

        // Check if any buffered events can now be processed.
        handleBufferedEvents(event);
    } else if (eventOrder == EventOrder.OUT_OF_ORDER) {
        const entityKey = getEntityKey(event);
        if (!store.pendingEvents[entityKey]) {
            store.pendingEvents[entityKey] = {};
        }
        // Buffer event - indexing by Sequence ensures duplicate events don't mess anything up, but they should be skipped anyway
        store.pendingEvents[entityKey][event.Sequence] = event;
    } else if (eventOrder == EventOrder.DUPLICATE) {
        // Duplicate event
        console.log(`Duplicate Event: ${event.EventName} ${event.EventTime}`)
    } else {
        // Event dropped
        console.log(`Dropped Event: ${event.EventName} ${event.EventTime}`)
    }
}
