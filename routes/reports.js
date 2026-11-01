const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const auth = require("../middleware/auth");
const Report = require("../models/Report");
const Post = require("../models/Post");
const User = require("../models/User");

const allowedReasons = new Set([
  "spam", "harassment", "hate_speech", "violence",
  "nudity", "impersonation", "scam", "other"
]);

router.post("/", auth, async (req, res) => {
  try {
    const { targetType, targetId, reason } = req.body;
    const details = typeof req.body.details === "string"
      ? req.body.details.trim()
      : "";

    if (!["post", "user"].includes(targetType)) {
      return res.status(400).json({ message: "Invalid report target type" });
    }

    if (typeof targetId !== "string" ||
        !mongoose.isValidObjectId(targetId)) {
      return res.status(400).json({ message: "A valid target ID is required" });
    }

    if (!allowedReasons.has(reason)) {
      return res.status(400).json({ message: "Please select a valid report reason" });
    }

    if (details.length > 1000) {
      return res.status(400).json({ message: "Report details must be 1000 characters or fewer" });
    }

    let targetPost = null;
    let targetUser = null;

    if (targetType === "post") {
      targetPost = await Post.findById(targetId).select("_id user");
      if (!targetPost) {
        return res.status(404).json({ message: "Post not found" });
      }
    } else {
      targetUser = await User.findById(targetId).select("_id username");
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      if (targetUser._id.equals(req.user._id)) {
        return res.status(400).json({ message: "You cannot report your own account" });
      }
    }

    const duplicateFilter = {
      reporter: req.user._id,
      targetType,
      status: { $in: ["open", "reviewed"] }
    };

    if (targetType === "post") {
      duplicateFilter.targetPost = targetPost._id;
    } else {
      duplicateFilter.targetUser = targetUser._id;
    }

    const duplicate = await Report.findOne(duplicateFilter).select("_id");
    if (duplicate) {
      return res.status(409).json({
        message: "You have already submitted an active report for this target"
      });
    }

    const report = await Report.create({
      reporter: req.user._id,
      targetType,
      targetPost: targetPost ? targetPost._id : null,
      targetUser: targetUser ? targetUser._id : null,
      reason,
      details
    });

    return res.status(201).json({
      message: "Report submitted for administrator review",
      reportId: report._id
    });
  } catch (error) {
    console.error("Submit report error:", error);
    return res.status(500).json({ message: "Unable to submit report" });
  }
});

module.exports = router;
