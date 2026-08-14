const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Post = require("../models/Post");
const Comment = require("../models/Comment");
const User = require("../models/User");
const Notification = require("../models/Notification");
const Friend = require("../models/Friend");
const { createNotification } = require("../utils/notify");
const auth = require("../middleware/auth");
const upload = require("../middleware/upload");

// Create post
router.post("/", auth, upload.single("image"), async (req, res) => {

   try {

    const { content } = req.body;

const post = new Post({
  user: req.user.id,
  content,
  image: req.file ? "/uploads/" + req.file.filename : null
});

    await post.save();

const io = req.app.get("io");

if (io) {
  io.emit("newPost", post);
}

    res.json({
      message: "Post created successfully",
      post
    });

    } catch(error){

    res.status(500).json({
      error:error.message
    });

  }

});

// BENEDICT Memory - current user's posts
router.get("/memory", auth, async (req, res) => {
  try {
    const posts = await Post.find({ user: req.user.id })
      .populate("user", "_id username fullName profilePicture")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ posts });
  } catch (error) {
    console.error("Memory error:", error);
    res.status(500).json({
      message: "Unable to load memories"
    });
  }
});

// Feed
router.get("/", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("following");

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    // Phase 5: the feed covers people you follow, your accepted friends and yourself.
    const friendships = await Friend.find({
      status: "accepted",
      $or: [
        { sender: user._id },
        { receiver: user._id }
      ]
    }).select("sender receiver").lean();

    const friendIds = friendships.map(friendship =>
      String(friendship.sender) === String(user._id)
        ? friendship.receiver
        : friendship.sender
    );

    const authorIds = [...user.following, ...friendIds, user._id];

    const following = [
      ...new Map(authorIds.map(id => [String(id), id])).values()
    ];

    let page = Number.parseInt(req.query.page, 10);
    let limit = Number.parseInt(req.query.limit, 10);

    if (!Number.isInteger(page) || page < 1) {
      page = 1;
    }

    if (!Number.isInteger(limit) || limit < 1) {
      limit = 20;
    }

    limit = Math.min(limit, 50);

    const skip = (page - 1) * limit;

    const filter = {
      user: {
        $in: following
      }
    };

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .populate("user", "_id username fullName profilePicture")
        .populate("reactions.user", "_id username fullName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Post.countDocuments(filter)
    ]);

    res.json({
      posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNextPage: skip + posts.length < total
      }
    });

  } catch (error) {
    console.error("Feed error:", error);

    res.status(500).json({
      message: "Unable to load feed"
    });
  }
});

// Like post
router.put("/:id/react", auth, async (req, res) => {

  try {

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        error: "Invalid post ID"
      });
    }

    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        error: "Post not found"
      });
    }

    const allowedReactionTypes = [
      "like",
      "love",
      "haha",
      "wow",
      "sad",
      "angry"
    ];

    const reactionType =
      typeof req.body.type === "string"
        ? req.body.type.trim().toLowerCase()
        : "like";

    if (!allowedReactionTypes.includes(reactionType)) {
      return res.status(400).json({
        error: "Invalid reaction type"
      });
    }

    const existingReaction = post.reactions.find(
      reaction => reaction.user.toString() === req.user.id
    );

    if (existingReaction) {
      existingReaction.type = reactionType;
    } else {
      post.reactions.push({
        user: req.user.id,
        type: reactionType
      });
    }

    await post.save();

    if (post.user.toString() !== req.user.id) {

      await createNotification(req, {
        user: post.user,
        fromUser: req.user.id,
        type: "reaction",
        post: post._id,
        message: "Someone reacted to your post"
      });

    }

    res.json({
      message: "Reaction updated successfully",
      reactions: post.reactions
    });

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

  }

});

// Comment
router.post("/:id/comment", auth, async(req,res)=>{

try{

const text = typeof req.body.text === "string" ? req.body.text.trim() : "";

if(!text){
return res.status(400).json({
error:"Comment cannot be empty"
});
}


const post=await Post.findById(req.params.id);


if(!post){

return res.status(404).json({
error:"Post not found"
});

}


const comment = new Comment({
  post: post._id,
  user: req.user.id,
  text
});

await comment.save();

if(post.user.toString() !== req.user.id){

await createNotification(req, {

user:post.user,

fromUser:req.user.id,

type:"comment",

post:post._id,

message:"Someone commented on your post"

});

}



const populatedComment = await Comment.findById(comment._id)
  .populate("user", "username profilePicture");

const commentCount = await Comment.countDocuments({ post: post._id });

res.json({

message:"Comment added successfully",

comment: populatedComment,

commentCount

});


}catch(error){

res.status(500).json({
error:error.message
});

}

});

// Share a post
router.post("/:id/share", auth, async (req, res) => {

  try {

    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        error: "Post not found"
      });
    }

    const sharedPost = new Post({
      user: req.user.id,
      content: post.content,
      image: post.image,
      sharedFrom: post._id
    });

    await sharedPost.save();

    res.json({
      message: "Post shared successfully",
      post: sharedPost
    });

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

  }

});

// Remove reaction
router.put("/:id/remove-reaction", auth, async (req, res) => {

  try {

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        error: "Invalid post ID"
      });
    }

    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        error: "Post not found"
      });
    }

    post.reactions = post.reactions.filter(
      reaction => reaction.user.toString() !== req.user.id
    );

    await post.save();

    res.json({
      message: "Reaction removed successfully",
      reactions: post.reactions
    });

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

  }

});

// Get users who reacted to a post
router.get("/:id/likes", async (req, res) => {

  try {

    const post = await Post.findById(req.params.id)
      .populate("reactions.user", "username fullName");

    if (!post) {
      return res.status(404).json({
        error: "Post not found"
      });
    }

    res.json({
      likes: post.reactions
        .filter(reaction => reaction.type === "like")
        .map(reaction => reaction.user)
    });

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

  }

});

// Edit post
router.put("/:id", auth, async (req, res) => {
  try {

    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        error: "Post not found"
      });
    }

    if (post.user.toString() !== req.user.id) {
      return res.status(403).json({
        error: "You can only edit your own posts"
      });
    }

    post.content = req.body.content || post.content;

    await post.save();

    res.json({
      message: "Post updated successfully",
      post
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// Delete post
router.delete("/:id", auth, async (req, res) => {
  try {

    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        error: "Post not found"
      });
    }

    if (post.user.toString() !== req.user.id) {
      return res.status(403).json({
        error: "You can only delete your own posts"
      });
    }

    await Post.findByIdAndDelete(req.params.id);

    res.json({
      message: "Post deleted successfully"
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

module.exports = router;
