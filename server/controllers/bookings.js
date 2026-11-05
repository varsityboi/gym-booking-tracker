import { listUpcomingForUser, cancelBooking } from "../models/booking.js";

export async function mine(req, res) {
  res.json(await listUpcomingForUser(req.user.id));
}

export async function cancel(req, res) {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId) || bookingId < 1) {
    return res.status(400).json({ error: "invalid booking id" });
  }

  const booking = await cancelBooking(bookingId, req.user.id);
  if (!booking) {
    return res.status(404).json({ error: "active booking not found" });
  }
  res.json({ booking });
}
