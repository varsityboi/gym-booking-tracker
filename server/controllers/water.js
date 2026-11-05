import { addWater } from "../models/water.js";

export async function add(req, res) {
  res.status(201).json(await addWater(req.user.id, req.body.ml));
}
