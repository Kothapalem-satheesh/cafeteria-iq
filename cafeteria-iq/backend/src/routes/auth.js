const express = require("express");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const { auth } = require("../middleware/auth");

const router = express.Router();

const sign = (user) => {
  const secret = process.env.JWT_SECRET || "dev";
  return jwt.sign({ id: user._id.toString() }, secret, { expiresIn: "7d" });
};

router.post(
  "/register",
  [
    body("email").isEmail(),
    body("password").isLength({ min: 6 }),
    body("name").trim().notEmpty(),
  ],
  async (req, res) => {
    const e = validationResult(req);
    if (!e.isEmpty()) return res.status(400).json({ errors: e.array() });
    const { name, email, password, role } = req.body;
    const u = new User({ name, email, password, role: role || "analyst" });
    await u.save();
    res.status(201).json({
      token: sign(u),
      user: { id: u._id, name: u.name, email: u.email, role: u.role },
    });
  }
);

router.post(
  "/login",
  [body("email").isEmail(), body("password").notEmpty()],
  async (req, res) => {
    const e = validationResult(req);
    if (!e.isEmpty()) return res.status(400).json({ errors: e.array() });
    const { email, password } = req.body;
    const u = await User.findOne({ email: email.toLowerCase() });
    if (!u || !(await u.comparePassword(password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    res.json({
      token: sign(u),
      user: { id: u._id, name: u.name, email: u.email, role: u.role },
    });
  }
);

router.get("/me", auth(), (req, res) => {
  res.json({ user: req.user });
});

router.post("/logout", auth(), (req, res) => {
  res.json({ ok: true });
});

module.exports = router;
