const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");

const Story = require("../models/Story");
const auth = require("../middleware/auth");

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

router.post(
  "/",
  auth,
  upload.single("media"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message: "Please upload a file."
        });
      }

      const mediaType = req.file.mimetype.startsWith("video")
        ? "video"
        : "image";

      const story = new Story({
        user: req.user.id,
        media: "/uploads/" + req.file.filename,
        mediaType
      });

      await story.save();

      res.json({
        message: "Story uploaded successfully.",
        story
      });

    } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error."
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const stories = await Story.find()
      .populate("user", "username")
      .sort({ createdAt: -1 });

    res.json(stories);

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error."
    });
  }
});

module.exports = router;
