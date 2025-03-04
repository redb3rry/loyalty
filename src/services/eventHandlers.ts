import { store, POINT_THRESHOLD, OrderStatus, PointRecord, Order } from "../models/store";

export function handleCustomerCreated(sequence: number, customerId: string) {
    let customer = store.customers.get(customerId);
    if (customer) {
        return; // duplicate or older event, ignore
    } else {
      customer = {
        id: customerId,
        pointRecords: [],
        processedSequence: 0,
        deletedAt: null
      };
      store.customers.set(customerId, customer);
    }
    return;
}

export function handleCustomerDeleted(sequence: number, customerId: string, deletedAt: string) {
    const customer = store.customers.get(customerId);
    if (!customer) {
      return;
    }
    customer.deletedAt = new Date(deletedAt);
    store.customers.set(customerId, customer);
    store.pendingEvents[`Customer:${customerId}`] = {}; // Purge any pending events, as they are irrelevant after deleting the customer
    store.pendingEvents[`OrderPlaced:${customerId}`] = {}; 
    return;
}

export function handleOrderPlaced(customerId: string, orderId: string, totalOrderAmount: number, sequence: number, eventTime: string) {
    const customer = store.customers.get(customerId);
    if (!customer) {
        throw Error("Unknown customer entered processing!")
    }
    const pointsAwarded = Math.floor(totalOrderAmount / POINT_THRESHOLD);

    const order = {
        id: orderId,
        customerId: customerId!,
        pointsAwarded,
        processedSequence: 1,
        status: OrderStatus.PLACED
    };
    store.orders.set(orderId, order);
    if (pointsAwarded > 0) {
        const record: PointRecord = {
            points: pointsAwarded,
            earnedAt: new Date(eventTime),
            orderId
        };
        customer.pointRecords.push(record);
    }
    customer.processedSequence = sequence;
    store.customers.set(customerId, customer);
}

export function handleOrderReturnedOrCanceled(sequence: number, eventName: string, orderId: string) {
    const order = store.orders.get(orderId);
    if (order && order.status === 'placed') {
        order.status = eventName === 'OrderReturned' ? OrderStatus.RETURNED : OrderStatus.CANCELED;
        order.processedSequence = sequence;
        // Reverse points: remove records with this orderId.
        const customer = store.customers.get(order.customerId);
        if (customer) {
            customer.pointRecords = customer.pointRecords.filter(record => record.orderId !== order.id);
            store.customers.set(customer.id, customer)
        } else {
            // It's unspecified whether orders of a deleted client may be canceled, so we don't error out here.
        }
    } else if (order) {
        throw Error(`Returning order with status: ${order.status}`)
    }
}