const mongoose = require("mongoose");

const storySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  media: {
    type: String,
    required: true
  },

  mediaType: {
    type: String,
    enum: ["image", "video"],
    required: true
  },

  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // Delete after 24 hours
  }
});

module.exports = mongoose.model("Story", storySchema);
