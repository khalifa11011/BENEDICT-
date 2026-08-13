const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authentication required"
      });
    }

    const token = header.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        message: "Authentication required"
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured");
      return res.status(500).json({
        message: "Authentication service is not configured"
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        message: "Invalid authentication token"
      });
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        message: "User account no longer exists"
      });
    }

    req.user = user;
    req.userId = user._id.toString();

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Authentication token expired"
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        message: "Invalid authentication token"
      });
    }

    console.error("Authentication error:", error);

    return res.status(500).json({
      message: "Authentication service error"
    });
  }
}

module.exports = requireAuth;
