const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({

  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
  },

  email: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    lowercase: true,
  },

  phone: {
    type: String,
    trim: true,
    unique: true,
    sparse: true,
  },

  password: {
    type: String,
    required: true,
    minlength: 6,
  },

  fullName: {
    type: String
  },

  bio: {
    type: String
  },

  profilePicture: {
    type: String
  },

  coverPhoto: {
    type: String
  },

  location: {
    type: String
  },

  hometown: {
    type: String
  },

  school: {
    type: String
  },

  occupation: {
    type: String
  },

  relationshipStatus: {
    type: String
  },

  website: {
    type: String
  },

  birthday: {
    type: Date
  },

  followers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  ],

  following: [
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
],

  savedPosts: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post"
    }
  ],

// Legacy plain-text field, kept only so old documents can be cleared.
resetCode: {
  type: String
},

// Reset codes are stored hashed.
resetCodeHash: {
  type: String
},

resetCodeExpires: {
  type: Date
},

resetCodeAttempts: {
  type: Number,
  default: 0
}

}, { timestamps: true });



module.exports = mongoose.model("User", userSchema);
