const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Notification = require("../models/Notification");
const auth = require("../middleware/auth");

// Get my notifications
router.get("/", auth, async (req, res) => {
  try {
    let page = Number.parseInt(req.query.page, 10);
    let limit = Number.parseInt(req.query.limit, 10);

    if (!Number.isInteger(page) || page < 1) page = 1;
    if (!Number.isInteger(limit) || limit < 1) limit = 20;

    limit = Math.min(limit, 50);

    const skip = (page - 1) * limit;

    const filter = {
      user: req.user.id
    };

    const [notifications, total, unread] = await Promise.all([
      Notification.find(filter)
        .populate("fromUser", "username profilePicture")
        .populate("post", "_id content")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Notification.countDocuments(filter),

      Notification.countDocuments({
        user: req.user.id,
        read: false
      })
    ]);

    res.json({
      notifications,
      unread,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNextPage: skip + notifications.length < total
      }
    });
  } catch (error) {
    console.error("Notification load error:", error);

    res.status(500).json({
      message: "Unable to load notifications"
    });
  }
});

// Mark all notifications as read
router.put("/read-all", auth, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      {
        user: req.user.id,
        read: false
      },
      {
        $set: {
          read: true
        }
      }
    );

    res.json({
      message: "All notifications marked as read",
      updated: result.modifiedCount
    });
  } catch (error) {
    console.error("Mark all notifications read error:", error);

    res.status(500).json({
      message: "Unable to update notifications"
    });
  }
});

// Mark one notification as read
router.put("/:id/read", auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: "Invalid notification ID"
      });
    }

    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user.id
      },
      {
        $set: {
          read: true
        }
      },
      {
        new: true
      }
    );

    if (!notification) {
      return res.status(404).json({
        message: "Notification not found"
      });
    }

    res.json({
      message: "Notification marked as read",
      notification
    });
  } catch (error) {
    console.error("Mark notification read error:", error);

    res.status(500).json({
      message: "Unable to update notification"
    });
  }
});

module.exports = router;
