const express = require("express");
const router = express.Router();

const Comment = require("../models/Comment");
const Post = require("../models/Post");
const auth = require("../middleware/auth");

// Add a comment
router.post("/:postId", auth, async (req, res) => {
  try {
    const text = typeof req.body.text === "string"
      ? req.body.text.trim()
      : "";

    if (!text) {
      return res.status(400).json({
        message: "Comment cannot be empty"
      });
    }

    const post = await Post.findById(req.params.postId);

    if (!post) {
      return res.status(404).json({
        message: "Post not found"
      });
    }

    const comment = new Comment({
      post: post._id,
      user: req.user.id,
      text
    });

    await comment.save();

    res.json({
      message: "Comment added",
      comment
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error"
    });
  }
});

// Get comments for a post
router.get("/:postId", async (req, res) => {
  try {

    const comments = await Comment.find({
      post: req.params.postId
    })
    .populate("user", "username profilePicture")
    .sort({ createdAt: 1 });

    res.json(comments);

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error"
    });
  }
});

module.exports = router;
