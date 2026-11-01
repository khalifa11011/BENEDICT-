const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const Message = require("../models/Message");
const User = require("../models/User");
const mongoose = require("mongoose");

const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// file-type is ESM; load it lazily from this CommonJS route.
const detectFileType = async filePath => {
  const { fileTypeFromFile } = await import("file-type");
  return fileTypeFromFile(filePath);
};

const allowedExtensions = new Set([
  "jpg", "png", "gif", "webp",
  "mp4", "mov", "webm",
  "mp3", "wav", "ogg", "m4a"
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "..", "uploads", "messages"));
  },
  filename: (req, file, cb) => {
    // Temporary extension prevents an unverified upload being served
    // under a trusted media extension.
    cb(null, crypto.randomBytes(20).toString("hex") + ".upload");
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 1
  }
});

async function removeUploadedFile(file) {
  if (!file || !file.path) return;
  try {
    await fs.promises.unlink(file.path);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Unable to remove rejected message upload:", error.message);
    }
  }
}

// Send a message
router.post(
  "/",
  auth,
  (req, res, next) => {
    upload.single("media")(req, res, error => {
      if (error) {
        const tooLarge = error instanceof multer.MulterError &&
          error.code === "LIMIT_FILE_SIZE";

        return res.status(tooLarge ? 413 : 400).json({
          message: tooLarge
            ? "Attachments must not exceed 15 MB."
            : "Unable to accept this attachment."
        });
      }

      next();
    });
  },
  async (req, res) => {
    let keepUploadedFile = false;

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

      // Verify actual file signatures, not just the client-supplied MIME type.
      if (req.file) {
        const detected = await detectFileType(req.file.path);

        if (!detected || !allowedExtensions.has(detected.ext)) {
          return res.status(400).json({
            message: "Unsupported or invalid attachment file."
          });
        }

        const detectedCategory = detected.mime.split("/")[0];
        const declaredMime = String(req.file.mimetype || "").toLowerCase();
        const declaredCategory = declaredMime.split("/")[0];

        // WebM is commonly detected as video/webm even for audio recordings.
        const isWebmAudio =
          detected.ext === "webm" &&
          declaredMime === "audio/webm";

        if (
          !["image", "video", "audio"].includes(detectedCategory) ||
          (
            detectedCategory !== declaredCategory &&
            !isWebmAudio
          )
        ) {
          return res.status(400).json({
            message: "Attachment contents do not match the declared media type."
          });
        }

        // Give audio WebM its own extension so the chat player can distinguish
        // it from WebM video. The container signature was checked above.
        const safeExtension = isWebmAudio ? "weba" : detected.ext;
        const safeFilename =
          path.basename(req.file.filename, ".upload") + "." + safeExtension;
        const safePath = path.join(req.file.destination, safeFilename);

        await fs.promises.rename(req.file.path, safePath);

        req.file.filename = safeFilename;
        req.file.path = safePath;
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

      const message = new Message({
        sender: req.user.id,
        receiver,
        text,
        media,
        delivered: true
      });

      await message.save();

      // Keep the upload only after the message is saved successfully.
      keepUploadedFile = true;

      const io = req.app.get("io");

      if (io) {
        const room = [req.user.id, receiver].sort().join("_");
        io.to(room).emit("newMessage", message);
      }

      return res.json({
        message: "Message sent successfully",
        data: message
      });
    } catch (error) {
      console.error("Send message error:", error);

      return res.status(500).json({
        message: "Unable to send message"
      });
    } finally {
      if (req.file && !keepUploadedFile) {
        await removeUploadedFile(req.file);
      }
    }
  }
);


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
router.get("/media/:id", auth, async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.sendStatus(404);
    const m = await Message.findById(id).select("sender receiver media").lean();
    if (!m || !m.media) return res.sendStatus(404);
    const me = String(req.user.id);
    if (me !== String(m.sender) && me !== String(m.receiver)) return res.sendStatus(404);
    const prefix = "/uploads/messages/";
    if (!m.media.startsWith(prefix)) return res.sendStatus(404);
    const name = path.basename(m.media);
    if (name !== m.media.slice(prefix.length)) return res.sendStatus(404);
    const dir = path.resolve(__dirname, "..", "uploads", "messages");
    const file = path.resolve(dir, name);
    if (path.dirname(file) !== dir || !fs.existsSync(file)) return res.sendStatus(404);
    const types = {jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",gif:"image/gif",webp:"image/webp",mp4:"video/mp4",mov:"video/quicktime",webm:"video/webm",weba:"audio/webm",mp3:"audio/mpeg",wav:"audio/wav",ogg:"audio/ogg",m4a:"audio/mp4"};
    const ext = path.extname(name).slice(1).toLowerCase();
    if (!types[ext]) return res.sendStatus(404);
    res.set("Content-Type", types[ext]);
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "private, no-store");
    res.sendFile(file);
  } catch (e) {
    console.error("Private media error:", e);
    if (!res.headersSent) res.sendStatus(500);
  }
});

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

    const readResult = await Message.updateMany(
      {
        sender: userId,
        receiver: req.user.id,
        read: false
      },
      {
        $set: { read: true }
      }
    );

    // Tell the other user's Messenger inbox that
    // messages in this conversation have been seen.
    if (readResult.modifiedCount > 0) {
      const io = req.app.get("io");

      if (io) {
        const room = [req.user.id, userId]
          .sort()
          .join("_");

        io.to(room).emit("messageSeen");
      }
    }

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
    const messageId = req.params.id;

    if (!mongoose.isValidObjectId(messageId)) {
      return res.status(400).json({
        message: "Invalid message ID"
      });
    }

    const message = await Message.findById(messageId);

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

    await Message.findByIdAndDelete(messageId);

    const io = req.app.get("io");

    if (io) {
      const room = [message.sender.toString(), message.receiver.toString()]
        .sort()
        .join("_");

      io.to(room).emit("messageDeleted", messageId);
    }

    res.json({
      message: "Message deleted"
    });

  } catch (err) {
    console.error("Delete message error:", err);

    res.status(500).json({
      message: "Unable to delete message"
    });
  }
});

module.exports = router;
