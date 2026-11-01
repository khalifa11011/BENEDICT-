const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const requireAdmin = require("../middleware/admin");
const Report = require("../models/Report");
const Post = require("../models/Post");
const User = require("../models/User");

router.use(requireAdmin);

// List reports. Defaults to open reports; status=all includes every status.
router.get("/reports", async (req, res) => {
  try {
    const requestedStatus = req.query.status || "open";
    const filter = {};

    if (requestedStatus !== "all") {
      if (!["open", "reviewed", "resolved", "dismissed"].includes(requestedStatus)) {
        return res.status(400).json({ message: "Invalid report status filter" });
      }
      filter.status = requestedStatus;
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

    const [reports, total] = await Promise.all([
      Report.find(filter)
        .populate("reporter", "username fullName profilePicture")
        .populate("targetUser", "username fullName profilePicture accountStatus")
        .populate({
          path: "targetPost",
          select: "content image user createdAt",
          populate: { path: "user", select: "username fullName profilePicture" }
        })
        .populate("reviewedBy", "username fullName")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Report.countDocuments(filter)
    ]);

    res.json({ reports, total, page, limit });
  } catch (error) {
    console.error("Admin list reports error:", error);
    res.status(500).json({ message: "Unable to load reports" });
  }
});

// Review or close a report.
router.patch("/reports/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid report ID" });
    }

    const { status } = req.body;
    if (!["reviewed", "resolved", "dismissed"].includes(status)) {
      return res.status(400).json({ message: "Invalid report status" });
    }

    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    report.status = status;
    report.reviewedBy = req.user._id;
    report.reviewedAt = new Date();
    await report.save();

    res.json({ message: "Report status updated", report });
  } catch (error) {
    console.error("Admin update report error:", error);
    res.status(500).json({ message: "Unable to update report" });
  }
});

// Paginated user list with optional username/name search.
router.get("/users", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const search = typeof req.query.search === "string"
      ? req.query.search.trim().slice(0, 80)
      : "";

    const filter = {};
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { username: { $regex: escaped, $options: "i" } },
        { fullName: { $regex: escaped, $options: "i" } }
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("_id username fullName email profilePicture role accountStatus createdAt")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter)
    ]);

    res.json({ users, total, page, limit });
  } catch (error) {
    console.error("Admin list users error:", error);
    res.status(500).json({ message: "Unable to load users" });
  }
});

// Change account status. This endpoint does not change roles.
router.patch("/users/:id/status", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const { status } = req.body;
    if (!["active", "suspended", "banned"].includes(status)) {
      return res.status(400).json({ message: "Invalid account status" });
    }

    if (String(req.user._id) === req.params.id) {
      return res.status(400).json({ message: "You cannot change your own account status here" });
    }

    const target = await User.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    if (target.role === "admin") {
      return res.status(403).json({
        message: "This endpoint cannot change another administrator's account status"
      });
    }

    target.accountStatus = status;
    await target.save();

    res.json({
      message: "Account status updated",
      user: {
        id: target._id,
        username: target.username,
        role: target.role,
        accountStatus: target.accountStatus
      }
    });
  } catch (error) {
    console.error("Admin update user status error:", error);
    res.status(500).json({ message: "Unable to update account status" });
  }
});

// Administrator-only post removal, separate from owner-only post deletion.
router.delete("/posts/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid post ID" });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    await Post.findByIdAndDelete(post._id);

    await Report.updateMany(
      { targetType: "post", targetPost: post._id, status: { $in: ["open", "reviewed"] } },
      {
        $set: {
          status: "resolved",
          reviewedBy: req.user._id,
          reviewedAt: new Date()
        }
      }
    );

    res.json({ message: "Post removed by administrator" });
  } catch (error) {
    console.error("Admin remove post error:", error);
    res.status(500).json({ message: "Unable to remove post" });
  }
});

module.exports = router;
