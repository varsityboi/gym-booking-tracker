import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createUser, findByEmailWithPassword, findById } from "../models/user.js";

export async function signup(req, res) {
  const { name, email, password } = req.body;

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    res.status(201).json(await createUser(name, email, passwordHash));
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "email already registered" });
    }
    throw err;
  }
}

export async function login(req, res) {
  const { email, password } = req.body;

  const user = await findByEmailWithPassword(email);

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "wrong email or password" });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}

export async function me(req, res) {
  res.json(await findById(req.user.id));
}
