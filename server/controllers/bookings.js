import { listUpcomingForUser, cancelBooking } from "../models/booking.js";
import { listWaitingForUser } from "../models/waitlist.js";

export async function mine(req, res) {
  const [bookings, waitlist] = await Promise.all([
    listUpcomingForUser(req.user.id),
    listWaitingForUser(req.user.id),
  ]);
  res.json({ bookings, waitlist });
}

export async function cancel(req, res) {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId) || bookingId < 1) {
    return res.status(400).json({ error: "invalid booking id" });
  }

  const result = await cancelBooking(bookingId, req.user.id);
  if (!result) {
    return res.status(404).json({ error: "active booking not found" });
  }
  res.json({ booking: result.booking, promotedUserId: result.promotedUserId });
}
