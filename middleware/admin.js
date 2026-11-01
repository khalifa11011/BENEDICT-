const auth = require("./auth");

function requireAdmin(req, res, next) {
  auth(req, res, () => {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        message: "Administrator access required"
      });
    }

    next();
  });
}

module.exports = requireAdmin;
