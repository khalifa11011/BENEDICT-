const express = require("express");
const router = express.Router();

const User = require("../models/User");
const Post = require("../models/Post");
const auth = require("../middleware/auth");


// Search users
router.get("/search", auth, async (req, res) => {
  try {

    const keyword = req.query.username || "";

    const users = await User.find({
      username: {
        $regex: keyword,
        $options: "i"
      }
    }).select("-password");

    res.json(users);

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

  }
});


// View user profile
router.get("/:id", async (req, res) => {
  try {

    const user = await User.findById(req.params.id)
  .select("-password")
  .populate("followers", "username fullName profilePicture")
  .populate("following", "username fullName profilePicture");

    if (!user) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    const posts = await Post.find({
      user: req.params.id
    }).sort({
      createdAt: -1
    });

    res.json({
      user,
      posts
    });

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

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
router.put("/:id/friend-request", auth, async (req, res) => {
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
        error: "You cannot send a friend request to yourself"
      });
    }

    if (me.friends.includes(other._id)) {
      return res.status(400).json({
        error: "You are already friends"
      });
    }

    if (me.sentRequests.includes(other._id)) {
      return res.status(400).json({
        error: "Friend request already sent"
      });
    }

    me.sentRequests.push(other._id);
    other.friendRequests.push(me._id);

    await me.save();
    await other.save();

    res.json({
      message: "Friend request sent successfully"
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

module.exports = router;
