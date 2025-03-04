import { Customer, POINT_EXPIRY_MONTHS } from "../models/store";

// This service is very simplified, mostly because of my decision to use an in-memory-store and not bother with persistence.
// Normally these functionalities would be realized via database calls. 
// As this is not how I would implement this at all I chose to take a shortcut here and as such
// the code below is very unoptimal and will work very slowly for large datasets.

// Calculate available points (only include non‑expired points)
export function getAvailablePoints(customer: Customer, asOf: Date = new Date()): number {
  return customer.pointRecords.reduce((total, record) => {
    const recordExpiry = new Date(record.earnedAt);
    recordExpiry.setMonth(recordExpiry.getMonth() + POINT_EXPIRY_MONTHS);
    if (recordExpiry > asOf) {
      return total + record.points;
    }
    return total;
  }, 0);
}
  
// Consume points using a FIFO approach on the point records
export function consumePoints(customer: Customer, pointsToConsume: number, asOf: Date = new Date()): boolean {
    let available = getAvailablePoints(customer, asOf);
    if (pointsToConsume > available) {
        return false; // not enough points
    }
    // Sort point records by earnedAt (oldest first)
    customer.pointRecords.sort((a, b) => a.earnedAt.getTime() - b.earnedAt.getTime());
    let remaining = pointsToConsume;
    for (let i = 0; i < customer.pointRecords.length && remaining > 0; i++) {
        const record = customer.pointRecords[i];
        const recordExpiry = new Date(record.earnedAt);
        recordExpiry.setMonth(recordExpiry.getMonth() + POINT_EXPIRY_MONTHS);
        if (recordExpiry <= asOf) {
        continue; // record expired, skip
        }
        if (record.points <= remaining) {
        remaining -= record.points;
        record.points = 0;
        } else {
        record.points -= remaining;
        remaining = 0;
        }
    }
    // Remove any records that have been fully consumed
    customer.pointRecords = customer.pointRecords.filter(record => record.points > 0);
    return true;
}