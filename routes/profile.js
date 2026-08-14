const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const User = require("../models/User");
const { imageUpload: upload } = require("../middleware/upload");

// =========================
// GET MY PROFILE
// =========================

router.get("/", auth, async (req, res) => {
  try {

    const user = await User.findById(req.user.id)
      .select("-password");

    if (!user) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    res.json(user);

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

  }
});


// =========================
// UPLOAD PROFILE PICTURE
// =========================

router.post(
  "/upload",
  auth,
  upload.single("profilePicture"),
  async (req, res) => {

    try {

      if (!req.file) {
        return res.status(400).json({
          error: "No profile picture selected"
        });
      }

      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({
          error: "User not found"
        });
      }

      user.profilePicture =
        "/uploads/" + req.file.filename;

      await user.save();

      res.json({
        message: "Profile picture updated successfully",
        profilePicture: user.profilePicture
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error: error.message
      });

    }

  }
);


// =========================
// UPLOAD COVER PHOTO
// =========================

router.post(
  "/cover-upload",
  auth,
  upload.single("coverPhoto"),
  async (req, res) => {

    try {

      if (!req.file) {
        return res.status(400).json({
          error: "No cover photo selected"
        });
      }

      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({
          error: "User not found"
        });
      }

      user.coverPhoto =
        "/uploads/" + req.file.filename;

      await user.save();

      res.json({
        message: "Cover photo updated successfully",
        coverPhoto: user.coverPhoto
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error: error.message
      });

    }

  }
);


// =========================
// UPDATE PROFILE INFORMATION
// =========================

router.put("/update", auth, async (req, res) => {

  try {

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    const fields = [
      "fullName",
      "bio",
      "location",
      "hometown",
      "school",
      "occupation",
      "relationshipStatus",
      "website",
      "birthday"
    ];

    fields.forEach(field => {

      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }

    });

    await user.save();

    res.json({
      message: "Profile updated successfully",
      user: {
        fullName: user.fullName,
        bio: user.bio,
        location: user.location,
        hometown: user.hometown,
        school: user.school,
        occupation: user.occupation,
        relationshipStatus: user.relationshipStatus,
        website: user.website,
        birthday: user.birthday,
        profilePicture: user.profilePicture,
        coverPhoto: user.coverPhoto
      }
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: error.message
    });

  }

});


module.exports = router;
