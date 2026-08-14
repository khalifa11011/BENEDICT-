const express = require("express");
const router = express.Router();
const Friend = require("../models/Friend");
const Notification = require("../models/Notification");
const auth = require("../middleware/auth");
const { createNotification } = require("../utils/notify");

// Send a friend request
router.post("/request", auth, async (req, res) => {
  try {

    const { receiver } = req.body;

    if (!receiver) {
      return res.status(400).json({
        message: "Receiver is required"
      });
    }

    if (String(receiver) === String(req.user.id)) {
      return res.status(400).json({
        message: "You cannot send a friend request to yourself"
      });
    }

    const existing = await Friend.findOne({
      $or: [
        {
          sender: req.user.id,
          receiver: receiver
        },
        {
          sender: receiver,
          receiver: req.user.id
        }
      ]
    });

    if (existing) {

      if (existing.status === "accepted") {
        return res.status(400).json({
          message: "You are already friends with this user"
        });
      }

      if (existing.status === "pending") {
        return res.status(400).json({
          message: "A friend request already exists"
        });
      }

      if (existing.status === "rejected") {
        existing.sender = req.user.id;
        existing.receiver = receiver;
        existing.status = "pending";

        await existing.save();

        return res.json({
          message: "Friend request sent",
          request: existing
        });
      }
    }

    const request = new Friend({
      sender: req.user.id,
      receiver: receiver
    });

    await request.save();

    // Phase 4/6: push to the receiver's personal room (onlineUsers holds a Set
    // of socket ids, so the old single-socket lookup never matched).
    await createNotification(req, {
      user: receiver,
      fromUser: req.user.id,
      type: "friend_request",
      message: "Someone sent you a friend request"
    });

    const io = req.app.get("io");

    if (io) {
      io.to("user:" + String(receiver)).emit("browserNotification", {
        title: "BENEDICT",
        message: "You have a new friend request"
      });
    }

    res.json({
      message: "Friend request sent",
      request
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      message: "Server error"
    });

  }
});


// Get friendship status with another user
router.get("/status/:id", auth, async (req, res) => {
  try {

    const otherUserId = req.params.id;

    if (String(otherUserId) === String(req.user.id)) {
      return res.json({
        status: "self"
      });
    }

    const friendship = await Friend.findOne({
      $or: [
        {
          sender: req.user.id,
          receiver: otherUserId
        },
        {
          sender: otherUserId,
          receiver: req.user.id
        }
      ]
    });

    if (!friendship) {
      return res.json({
        status: "none"
      });
    }

    if (friendship.status === "accepted") {
      return res.json({
        status: "friends",
        requestId: friendship._id
      });
    }

    if (
      friendship.status === "pending" &&
      String(friendship.sender) === String(req.user.id)
    ) {
      return res.json({
        status: "sent",
        requestId: friendship._id
      });
    }

    if (
      friendship.status === "pending" &&
      String(friendship.receiver) === String(req.user.id)
    ) {
      return res.json({
        status: "received",
        requestId: friendship._id
      });
    }

    return res.json({
      status: friendship.status
    });

  } catch (err) {

    console.error("Friend status error:", err);

    res.status(500).json({
      message: "Unable to check friendship status"
    });

  }
});

// Get my pending friend requests
router.get("/requests", auth, async (req, res) => {
  try {
    const requests = await Friend.find({
      receiver: req.user.id,
      status: "pending"
    }).populate("sender", "username email");

    res.json(requests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Accept a friend request
router.put("/accept/:id", auth, async (req, res) => {
  try {
    const request = await Friend.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (request.receiver.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    request.status = "accepted";
    await request.save();

    await createNotification(req, {
      user: request.sender,
      fromUser: req.user.id,
      type: "friend_accept",
      message: "Your friend request was accepted"
    });

    res.json({
      message: "Friend request accepted",
      request
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Reject a friend request
router.put("/reject/:id", auth, async (req, res) => {
  try {
    const request = await Friend.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (request.receiver.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    request.status = "rejected";
    await request.save();

    res.json({
      message: "Friend request rejected",
      request
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get my friends
router.get("/", auth, async (req, res) => {
  try {
    const friends = await Friend.find({
      status: "accepted",
      $or: [
        { sender: req.user.id },
        { receiver: req.user.id }
      ]
    })
    .populate("sender", "username fullName profilePicture")
    .populate("receiver", "username fullName profilePicture");

    res.json(friends);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
