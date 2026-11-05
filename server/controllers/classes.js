import { createClass, listNextSevenDays, updateCapacity } from "../models/class.js";
import { bookClass } from "../models/booking.js";
import { joinWaitlist, leaveWaitlist } from "../models/waitlist.js";

// The class id from the URL, or null (after sending 400) when it's invalid.
function classIdFrom(req, res) {
  const classId = Number(req.params.id);
  if (!Number.isInteger(classId) || classId < 1) {
    res.status(400).json({ error: "invalid class id" });
    return null;
  }
  return classId;
}

export async function create(req, res) {
  const { title, startsAt, capacity } = req.body;
  res.status(201).json(await createClass(title, startsAt, capacity));
}

export async function list(req, res) {
  res.json(await listNextSevenDays());
}

export async function book(req, res) {
  const classId = classIdFrom(req, res);
  if (classId === null) return;

  try {
    const result = await bookClass(classId, req.user.id);
    if (result.error === "full") {
      return res.status(409).json({ error: "class is full, you can join the waitlist" });
    }
    if (result.error) {
      return res.status(409).json({ error: "class is full, already started, or does not exist" });
    }
    res.status(201).json(result);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "you already booked this class" });
    }
    throw err;
  }
}

export async function setCapacity(req, res) {
  const classId = classIdFrom(req, res);
  if (classId === null) return;

  const { capacity } = req.body;

  const result = await updateCapacity(classId, capacity);

  if (result.error === "not_found") {
    return res.status(404).json({ error: "class not found" });
  }
  if (result.error === "below_booked") {
    return res.status(409).json({
      error: `capacity can't be lower than the number already booked (${result.booked})`,
    });
  }

  res.json(result.class);
}

const JOIN_ERRORS = {
  not_found: [404, "class not found"],
  started: [409, "class already started"],
  has_places: [409, "class has free places, book it instead"],
  booked: [409, "you already booked this class"],
  waiting: [409, "you are already on the waitlist for this class"],
};

export async function joinWaitlistForClass(req, res) {
  const classId = classIdFrom(req, res);
  if (classId === null) return;

  try {
    const result = await joinWaitlist(classId, req.user.id);
    if (result.error) {
      const [status, error] = JOIN_ERRORS[result.error];
      return res.status(status).json({ error });
    }
    res.status(201).json(result);
  } catch (err) {
    // The class lock makes this unlikely, but the unique index has the last word.
    if (err.code === "23505") {
      return res.status(409).json({ error: JOIN_ERRORS.waiting[1] });
    }
    throw err;
  }
}

export async function leaveWaitlistForClass(req, res) {
  const classId = classIdFrom(req, res);
  if (classId === null) return;

  const entry = await leaveWaitlist(classId, req.user.id);
  if (!entry) {
    return res.status(404).json({ error: "you are not on the waitlist for this class" });
  }
  res.json({ entry });
}
