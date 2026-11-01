const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },

  targetType: {
    type: String,
    enum: ["post", "user"],
    required: true
  },

  targetPost: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Post",
    default: null
  },

  targetUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },

  reason: {
    type: String,
    enum: [
      "spam",
      "harassment",
      "hate_speech",
      "violence",
      "nudity",
      "impersonation",
      "scam",
      "other"
    ],
    required: true
  },

  details: {
    type: String,
    maxlength: 1000,
    default: ""
  },

  status: {
    type: String,
    enum: ["open", "reviewed", "resolved", "dismissed"],
    default: "open",
    index: true
  },

  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },

  reviewedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reporter: 1, targetType: 1, targetPost: 1, status: 1 });
reportSchema.index({ reporter: 1, targetType: 1, targetUser: 1, status: 1 });

module.exports = mongoose.model("Report", reportSchema);
