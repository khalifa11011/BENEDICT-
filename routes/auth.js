const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");

const router = express.Router();

const MIN_PASSWORD_LENGTH = 8;

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function normalizeUsername(username) {
  return typeof username === "string" ? username.trim().toLowerCase() : "";
}

function validUsername(username) {
  return /^[a-z0-9_]{3,30}$/.test(username);
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizePhone(phone) {
  return typeof phone === "string" ? phone.replace(/[\s()-]/g, "").trim() : "";
}

function validPhone(phone) {
  return /^\+?[0-9]{7,15}$/.test(phone);
}

function validPassword(password) {
  return typeof password === "string" &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password.length <= 128;
}

function signToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    {
      id: user._id.toString()
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d"
    }
  );
}

// Register
router.post("/register", async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const email = normalizeEmail(req.body.email);
    const phone = normalizePhone(req.body.phone);
    const fullName = typeof req.body.fullName === "string"
      ? req.body.fullName.trim()
      : "";
    const password = req.body.password;

    // Phase 3: registration accepts an email or a phone number.
    if (!username || (!email && !phone) || !password) {
      return res.status(400).json({
        message: "Username, email or phone number, and password are required"
      });
    }

    if (!validUsername(username)) {
      return res.status(400).json({
        message: "Username must be 3-30 characters and use only letters, numbers or underscores"
      });
    }

    if (email && !validEmail(email)) {
      return res.status(400).json({
        message: "Please enter a valid email address"
      });
    }

    if (phone && !validPhone(phone)) {
      return res.status(400).json({
        message: "Please enter a valid phone number"
      });
    }

    if (!validPassword(password)) {
      return res.status(400).json({
        message: "Password must be between 8 and 128 characters"
      });
    }

    const identityFilters = [{ username }];

    if (email) identityFilters.push({ email });
    if (phone) identityFilters.push({ phone });

    const existingUser = await User.findOne({ $or: identityFilters });

    if (existingUser) {
      let message = "Username is already taken";

      if (email && existingUser.email === email) {
        message = "Email is already registered";
      } else if (phone && existingUser.phone === phone) {
        message = "Phone number is already registered";
      }

      return res.status(409).json({ message });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = new User({
      username,
      password: hashedPassword,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      ...(fullName ? { fullName } : {})
    });

    await user.save();

    res.status(201).json({
      message: "Registration successful",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone
      }
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "Username or email is already registered"
      });
    }

    console.error("Registration error:", error);

    res.status(500).json({
      message: "Unable to complete registration"
    });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const phone = normalizePhone(req.body.phone);
    const password = req.body.password;

    if ((!email && !phone) || !password) {
      return res.status(400).json({
        message: "Email or phone number and password are required"
      });
    }

    const query = email ? { email } : { phone };

    const user = await User.findOne(query);

    if (!user) {
      return res.status(401).json({
        message: "Wrong email or password"
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Wrong email or password"
      });
    }

    const token = signToken(user);

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });

  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Unable to complete login"
    });
  }
});

// Request password reset
router.post("/forgot-password", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const phone = normalizePhone(req.body.phone);

    if (!email && !phone) {
      return res.status(400).json({
        message: "Enter your email or phone number"
      });
    }

    const user = await User.findOne(
      email ? { email } : { phone }
    );

    // Do not reveal whether an account exists.
    if (!user) {
      return res.json({
        message: "If an account matches those details, reset instructions will be provided"
      });
    }

    const code = crypto
      .randomInt(100000, 1000000)
      .toString();

    user.resetCode = code;
    user.resetCodeExpires = new Date(
      Date.now() + 15 * 60 * 1000
    );

    await user.save();

    /*
     * Development note:
     * The reset code is intentionally NOT returned in the API response.
     *
     * A production email/SMS provider should deliver this code to the
     * account owner. We can integrate that delivery system separately.
     */

    res.json({
      message: "If an account matches those details, reset instructions will be provided"
    });

  } catch (error) {
    console.error("Forgot-password error:", error);

    res.status(500).json({
      message: "Unable to process password reset request"
    });
  }
});

// Reset password
router.post("/reset-password", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const phone = normalizePhone(req.body.phone);
    const code = typeof req.body.code === "string"
      ? req.body.code.trim()
      : "";
    const newPassword = req.body.newPassword;

    if ((!email && !phone) || !code || !newPassword) {
      return res.status(400).json({
        message: "Email or phone, code, and new password are required"
      });
    }

    if (!validPassword(newPassword)) {
      return res.status(400).json({
        message: "New password must be between 8 and 128 characters"
      });
    }

    const user = await User.findOne(
      email ? { email } : { phone }
    );

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired reset request"
      });
    }

    if (
      !user.resetCode ||
      user.resetCode !== code ||
      !user.resetCodeExpires ||
      user.resetCodeExpires.getTime() < Date.now()
    ) {
      return res.status(400).json({
        message: "Invalid or expired reset code"
      });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.resetCode = undefined;
    user.resetCodeExpires = undefined;

    await user.save();

    res.json({
      message: "Password reset successful"
    });

  } catch (error) {
    console.error("Reset-password error:", error);

    res.status(500).json({
      message: "Unable to reset password"
    });
  }
});

router.get("/test", (req, res) => {
  res.json({
    message: "Auth routes are working!"
  });
});

module.exports = router;
