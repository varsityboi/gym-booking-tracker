import { findByUser, upsertTargets } from "../models/target.js";

export async function get(req, res) {
  res.json((await findByUser(req.user.id)) ?? null);
}

export async function put(req, res) {
  res.json(await upsertTargets(req.user.id, req.body));
}
