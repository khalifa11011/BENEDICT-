const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const Message = require("../models/Message");
const User = require("../models/User");
const mongoose = require("mongoose");

const multer = require("multer");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/messages");
  },
  filename: (req, file, cb) => {
    const ext = require("path").extname(file.originalname).toLowerCase();
    const safeName = Date.now() + "-" + Math.random().toString(36).slice(2) + ext;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024
  }
});

// Send a message
router.post("/", auth, upload.single("media"), async (req, res) => {
  try {
    const receiver = typeof req.body.receiver === "string"
      ? req.body.receiver.trim()
      : "";

    const text = typeof req.body.text === "string"
      ? req.body.text.trim()
      : "";

    if (!receiver || !mongoose.Types.ObjectId.isValid(receiver)) {
      return res.status(400).json({
        message: "Valid receiver is required"
      });
    }

    if (receiver === req.user.id) {
      return res.status(400).json({
        message: "You cannot message yourself"
      });
    }

    if (!text && !req.file) {
      return res.status(400).json({
        message: "Message text or media is required"
      });
    }

    const recipient = await User.findById(receiver).select("_id");

    if (!recipient) {
      return res.status(404).json({
        message: "Receiver not found"
      });
    }

    const media = req.file
      ? "/uploads/messages/" + req.file.filename
      : "";

    const message = await Message.create({
      sender: req.user.id,
      receiver,
      text,
      media,
      delivered: false
    });

    message.delivered = true;
    await message.save();

    const io = req.app.get("io");

    if (io) {
      const room = [req.user.id, receiver].sort().join("_");
      io.to(room).emit("newMessage", message);
    }

    res.json({
      message: "Message sent successfully",
      data: message
    });

  } catch (error) {
    console.error("Send message error:", error);

    res.status(500).json({
      message: "Unable to send message"
    });
  }
});


// Get all Messenger conversations for the current user
router.get("/conversations", auth, async (req, res) => {
  try {
    const me = new mongoose.Types.ObjectId(req.user.id);

    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: me },
            { receiver: me }
          ]
        }
      },
      {
        $sort: {
          createdAt: -1
        }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$sender", me] },
              "$receiver",
              "$sender"
            ]
          },
          lastMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$receiver", me] },
                    { $eq: ["$read", false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $sort: {
          "lastMessage.createdAt": -1
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user"
        }
      },
      {
        $unwind: "$user"
      },
      {
        $project: {
          _id: 0,
          user: {
            _id: "$user._id",
            username: "$user.username",
            fullName: "$user.fullName",
            profilePicture: "$user.profilePicture"
          },
          lastMessage: {
            _id: "$lastMessage._id",
            text: "$lastMessage.text",
            media: "$lastMessage.media",
            sender: "$lastMessage.sender",
            receiver: "$lastMessage.receiver",
            createdAt: "$lastMessage.createdAt",
            read: "$lastMessage.read",
            delivered: "$lastMessage.delivered"
          },
          unreadCount: 1
        }
      }
    ]);

    const onlineUsers = req.app.get("onlineUsers");

    const result = conversations.map(conversation => {
      const id = conversation.user._id.toString();

      return {
        ...conversation,
        online: !!(onlineUsers && onlineUsers.has(id))
      };
    });

    res.json(result);

  } catch (error) {
    console.error("Load conversations error:", error);

    res.status(500).json({
      message: "Unable to load conversations"
    });
  }
});

// Get conversation with another user
router.get("/:userId", auth, async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        message: "Invalid user ID"
      });
    }

    const otherUser = await User.findById(userId).select("_id");

    if (!otherUser) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    const messages = await Message.find({
      $or: [
        {
          sender: req.user.id,
          receiver: userId
        },
        {
          sender: userId,
          receiver: req.user.id
        }
      ]
    })
      .sort({ createdAt: 1 })
      .limit(200)
      .populate("sender", "username profilePicture")
      .populate("receiver", "username profilePicture");

    await Message.updateMany(
      {
        sender: userId,
        receiver: req.user.id,
        read: false
      },
      {
        $set: { read: true }
      }
    );

    res.json(messages);

  } catch (error) {
    console.error("Load messages error:", error);

    res.status(500).json({
      message: "Unable to load messages"
    });
  }
});

// Delete a message
router.delete("/:id", auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({
        message: "Message not found"
      });
    }

    if (message.sender.toString() !== req.user.id) {
      return res.status(403).json({
        message: "Not allowed"
      });
    }

    await Message.findByIdAndDelete(req.params.id);

    const io = req.app.get("io");

    if (io) {
      const room = [message.sender.toString(), message.receiver.toString()]
        .sort()
        .join("_");

      io.to(room).emit("messageDeleted", req.params.id);
    }

    res.json({
      message: "Message deleted"
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

module.exports = router;
