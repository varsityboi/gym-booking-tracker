import { createClass, listNextSevenDays, updateCapacity, findBooked } from "../models/class.js";
import { bookClass } from "../models/booking.js";

export async function create(req, res) {
  const { title, startsAt, capacity } = req.body;
  res.status(201).json(await createClass(title, startsAt, capacity));
}

export async function list(req, res) {
  res.json(await listNextSevenDays());
}

export async function book(req, res) {
  const classId = Number(req.params.id);
  if (!Number.isInteger(classId) || classId < 1) {
    return res.status(400).json({ error: "invalid class id" });
  }

  try {
    const booked = await bookClass(classId, req.user.id);
    if (!booked) {
      return res.status(409).json({ error: "class is full, already started, or does not exist" });
    }
    res.status(201).json(booked);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "you already booked this class" });
    }
    throw err;
  }
}

export async function setCapacity(req, res) {
  const classId = Number(req.params.id);
  if (!Number.isInteger(classId) || classId < 1) {
    return res.status(400).json({ error: "invalid class id" });
  }

  const { capacity } = req.body;

  const updated = await updateCapacity(classId, capacity);

  if (!updated) {
    const existing = await findBooked(classId);
    if (!existing) {
      return res.status(404).json({ error: "class not found" });
    }
    return res.status(409).json({
      error: `capacity can't be lower than the number already booked (${existing.booked})`,
    });
  }

  res.json(updated);
}
