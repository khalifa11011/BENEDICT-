const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();

const User = require("../models/User");
const Post = require("../models/Post");
const Comment = require("../models/Comment");
const Friend = require("../models/Friend");
const auth = require("../middleware/auth");
const { createNotification } = require("../utils/notify");


// Search users
router.get("/search", auth, async (req, res) => {
  try {

    const keyword = typeof req.query.username === "string"
      ? req.query.username.trim()
      : "";

    if (!keyword) {
      return res.json([]);
    }

    // Phase 7: escape user input before it reaches the regex engine.
    const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const users = await User.find({
      username: {
        $regex: safeKeyword,
        $options: "i"
      }
    })
      .select("_id username fullName bio profilePicture")
      .limit(20);

    res.json(users);

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

  }
});


// View user profile with privacy enforcement.
router.get("/:id", async (req, res) => {
  try {
    let viewerId = null;
    const authorization = req.headers.authorization || "";

    // Optional authentication: public profiles remain accessible without login.
    if (authorization.startsWith("Bearer ")) {
      try {
        const secret = process.env.JWT_SECRET;
        if (secret) {
          const decoded = jwt.verify(authorization.slice(7), secret);

          if (decoded && decoded.id) {
            const viewer = await User.findById(decoded.id)
              .select("accountStatus")
              .lean();

            if (viewer && viewer.accountStatus === "active") {
              viewerId = String(decoded.id);
            }
          }
        }
      } catch (tokenError) {
        // Invalid or expired optional tokens are treated as anonymous visitors.
        viewerId = null;
      }
    }

    const user = await User.findById(req.params.id)
      .select("_id username fullName bio profilePicture coverPhoto location hometown school occupation relationshipStatus website birthday followers following createdAt profileVisibility");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const owner = viewerId && viewerId === String(user._id);
    const visibility = user.profileVisibility || "public";
    const isFollower = viewerId && user.followers.some(
      follower => String(follower) === viewerId
    );

    const canView = visibility === "public" || owner ||
      (visibility === "followers" && isFollower);

    if (!canView) {
      return res.json({
        user: {
          _id: user._id,
          username: user.username,
          fullName: user.fullName,
          profilePicture: user.profilePicture
        },
        posts: [],
        isPrivate: true
      });
    }

    await user.populate([
      { path: "followers", select: "username fullName profilePicture" },
      { path: "following", select: "username fullName profilePicture" }
    ]);

    const rawPosts = await Post.find({
      user: user._id
    })
      .populate("reactions.user", "_id username fullName")
      .sort({ createdAt: -1 })
      .lean();

    const postIds = rawPosts.map(p => p._id);
    const commentCounts = postIds.length > 0
      ? await Comment.aggregate([
          { $match: { post: { $in: postIds } } },
          { $group: { _id: "$post", count: { $sum: 1 } } }
        ])
      : [];

    const commentCountMap = new Map();
    commentCounts.forEach(item => {
      commentCountMap.set(String(item._id), item.count);
    });

    const posts = rawPosts.map(p => ({
      ...p,
      commentCount: commentCountMap.get(String(p._id)) || 0
    }));

    const profileData = user.toObject();

    // Birthday is visible only to the profile owner.
    if (!owner) {
      delete profileData.birthday;
    }

    res.json({
      user: profileData,
      posts,
      isPrivate: false
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Follow user
router.put("/:id/follow", auth, async (req, res) => {
  try {

    const me = await User.findById(req.user.id);
    const other = await User.findById(req.params.id);

    if (!other) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    if (me._id.equals(other._id)) {
  return res.status(400).json({
    error: "You cannot follow yourself"
  });
}

if (me.following.includes(other._id)) {
  return res.status(400).json({
    error: "Already following this user"
  });
}

me.following.push(other._id);
other.followers.push(me._id);

await me.save();
await other.save();

    try {
      await createNotification(req, {
        user: other._id,
        fromUser: me._id,
        type: "follow",
        message: "started following you"
      });
    } catch (notificationError) {
      console.error("Follow notification error:", notificationError);
    }

    res.json({
      message: "User follow successful"
    });

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

  }
});


// Unfollow user
router.put("/:id/unfollow", auth, async (req, res) => {
  try {
    const me = await User.findById(req.user.id);
    const other = await User.findById(req.params.id);

    if (!other) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    if (me._id.equals(other._id)) {
      return res.status(400).json({
        error: "You cannot unfollow yourself"
      });
    }

    me.following = me.following.filter(
      id => id.toString() !== other._id.toString()
    );

    other.followers = other.followers.filter(
      id => id.toString() !== me._id.toString()
    );

    await me.save();
    await other.save();

    res.json({
      message: "User unfollowed successfully"
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// Send friend request
// Phase 5: rewritten on top of the Friend collection (the old version used
// User fields that do not exist on the schema).
router.put("/:id/friend-request", auth, async (req, res) => {
  try {
    const other = await User.findById(req.params.id);

    if (!other) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    if (String(other._id) === String(req.user.id)) {
      return res.status(400).json({
        error: "You cannot send a friend request to yourself"
      });
    }

    const existing = await Friend.findOne({
      $or: [
        { sender: req.user.id, receiver: other._id },
        { sender: other._id, receiver: req.user.id }
      ]
    });

    if (existing && existing.status === "accepted") {
      return res.status(400).json({
        error: "You are already friends"
      });
    }

    if (existing && existing.status === "pending") {
      return res.status(400).json({
        error: "Friend request already sent"
      });
    }

    let request;

    if (existing) {
      existing.sender = req.user.id;
      existing.receiver = other._id;
      existing.status = "pending";
      await existing.save();
      request = existing;
    } else {
      request = await Friend.create({
        sender: req.user.id,
        receiver: other._id
      });
    }

    await createNotification(req, {
      user: other._id,
      fromUser: req.user.id,
      type: "friend_request",
      message: "Someone sent you a friend request"
    });

    res.json({
      message: "Friend request sent successfully",
      request
    });

  } catch (error) {
    console.error("Friend request error:", error);

    res.status(500).json({
      error: "Unable to send friend request"
    });
  }
});

module.exports = router;
