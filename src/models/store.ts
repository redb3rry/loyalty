// Very simple in-memory data storage. In a real solution this would be persistent storage, but I'm taking a shortcut for demo purposes here.

export const POINT_THRESHOLD = 50; // For every 50 DKK spent, earn 1 point
export const POINT_EXPIRY_MONTHS = 6;

export interface PointRecord {
    points: number;
    earnedAt: Date;
    orderId: string;
}

export interface Customer {
    id: string;
    pointRecords: PointRecord[];
    processedSequence: number; // highest sequence processed for this order’s events
    deletedAt: Date | null;
}

export enum OrderStatus {
    PLACED = 'placed',
    RETURNED = 'returned',
    CANCELED = 'canceled'
}

export interface Order {
    id: string;
    customerId: string;
    pointsAwarded: number;
    processedSequence: number;
    status: OrderStatus;
}

class Store {
    public customers: Map<string, Customer> = new Map();
    public orders: Map<string, Order> = new Map();

    // Buffer for out-of-order events, keyed by entity key and then sequence number.
    public pendingEvents: Record<string, Record<number, any>> = {}; // pending client deletions and order returns/cancellations
}

export const store = new Store();
  