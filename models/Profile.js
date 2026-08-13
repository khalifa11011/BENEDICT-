const mongoose = require("mongoose");

const profileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true
  },
  bio: {
    type: String,
    default: ""
  },
  profilePicture: {
    type: String,
    default: ""
  }
});

module.exports = mongoose.model("Profile", profileSchema);
