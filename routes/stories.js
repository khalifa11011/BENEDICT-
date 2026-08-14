const express = require("express");
const router = express.Router();

const Story = require("../models/Story");
const auth = require("../middleware/auth");
const { mediaUpload } = require("../middleware/upload");

router.post(
  "/",
  auth,
  mediaUpload.single("media"),
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
    // Phase 6: only stories from the last 24 hours (matches the TTL index).
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const stories = await Story.find({
      createdAt: { $gte: cutoff }
    })
      .populate("user", "username profilePicture")
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
