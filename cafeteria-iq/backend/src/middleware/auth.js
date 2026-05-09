const jwt = require("jsonwebtoken");
const User = require("../models/User");

function auth(roles = []) {
  return async (req, res, next) => {
    try {
      const h = req.headers.authorization;
      if (!h || !h.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = h.slice(7);
      const secret = process.env.JWT_SECRET || "dev";
      const payload = jwt.verify(token, secret);
      const user = await User.findById(payload.id).lean();
      if (!user) return res.status(401).json({ error: "Invalid token" });
      if (roles.length && !roles.includes(user.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      req.user = { id: user._id.toString(), email: user.email, name: user.name, role: user.role };
      next();
    } catch (e) {
      return res.status(401).json({ error: "Invalid token" });
    }
  };
}

module.exports = { auth };
