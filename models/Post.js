const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  content: {
    type: String,
    required: true
  },

  image: {
    type: String,
    default: null
  },

  reactions: [
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    type: {
      type: String,
      enum: ["like", "love", "haha", "wow", "sad", "angry"],
      default: "like",
      required: true
    }
  }
],

  comments: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },

      text: {
        type: String,
        required: true
      },

      createdAt: {
        type: Date,
        default: Date.now
      }
    }
  ],

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, { timestamps: true });

postSchema.index({ user: 1, createdAt: -1 });
postSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Post", postSchema);
