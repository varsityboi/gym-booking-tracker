import { findClassPeople, listClassesForAdmin } from "../models/class.js";
import { classIdFrom } from "./classes.js";

// GET /admin/classes?from=&to=: every class in the range, cancelled ones too.
export async function listClasses(req, res) {
  const { from, to } = req.validatedQuery;
  res.json(await listClassesForAdmin(from, to));
}

// GET /admin/classes/:id/people: who is booked and who is waiting.
export async function classPeople(req, res) {
  const classId = classIdFrom(req, res);
  if (classId === null) return;

  const people = await findClassPeople(classId);
  if (!people) {
    return res.status(404).json({ error: "class not found" });
  }
  res.json(people);
}
