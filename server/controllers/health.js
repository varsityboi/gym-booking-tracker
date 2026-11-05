import { getDbTime } from "../models/health.js";

export function root(req, res) {
  res.send("Gym API is running");
}

export async function dbTest(req, res) {
  res.send(await getDbTime());
}
