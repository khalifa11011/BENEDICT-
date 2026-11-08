const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Comment = require("../models/Comment");
const Post = require("../models/Post");
const User = require("../models/User");
const auth = require("../middleware/auth");
const { createNotification } = require("../utils/notify");

// Add a comment
router.post("/:postId", auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.postId)) {
      return res.status(400).json({
        message: "Invalid post ID"
      });
    }

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

    // Preserve profile privacy restrictions
    const author = await User.findById(post.user).select("profileVisibility followers");
    if (author) {
      const visibility = author.profileVisibility || "public";
      const isAuthor = String(author._id) === String(req.user.id);
      const isFollower = (author.followers || []).some(
        follower => String(follower) === String(req.user.id)
      );

      if (!isAuthor && (visibility === "private" || (visibility === "followers" && !isFollower))) {
        return res.status(403).json({
          message: "This user profile is private"
        });
      }
    }

    const comment = new Comment({
      post: post._id,
      user: req.user.id,
      text
    });

    await comment.save();

    // Notify the post owner, but never notify someone about their own comment.
    if (String(post.user) !== String(req.user.id)) {
      try {
        await createNotification(req, {
          user: post.user,
          fromUser: req.user.id,
          type: "comment",
          post: post._id,
          message: "commented on your post"
        });
      } catch (notificationError) {
        console.error("Comment notification error:", notificationError);
      }
    }

    // Phase 2: return the author details and the up-to-date comment count.
    const populated = await Comment.findById(comment._id)
      .populate("user", "username profilePicture");

    const commentCount = await Comment.countDocuments({ post: post._id });

    res.json({
      message: "Comment added",
      comment: populated,
      commentCount
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
    if (!mongoose.Types.ObjectId.isValid(req.params.postId)) {
      return res.status(400).json({
        message: "Invalid post ID"
      });
    }

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
