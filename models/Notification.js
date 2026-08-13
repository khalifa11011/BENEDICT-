const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  fromUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  type: {
    type: String,
    required: true
  },

  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Post"
  },

  message: {
    type: String
  },

  read: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true
});


notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
