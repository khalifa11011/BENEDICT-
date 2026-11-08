const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();
const auth = require("../middleware/auth");
const User = require("../models/User");
const { imageUpload: upload, removeUploadedFile } = require("../middleware/upload");

// =========================
// GET MY PROFILE
// =========================

router.get("/", auth, async (req, res) => {
  try {

    const user = await User.findById(req.user.id)
      .select("-password -resetCode -resetCodeHash -resetCodeExpires -resetCodeAttempts");

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

    let keepUploadedFile = false;

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
      keepUploadedFile = true;

      res.json({
        message: "Profile picture updated successfully",
        profilePicture: user.profilePicture
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error: error.message
      });

    } finally {
      if (req.file && !keepUploadedFile) {
        await removeUploadedFile(req.file);
      }
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

    let keepUploadedFile = false;

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
      keepUploadedFile = true;

      res.json({
        message: "Cover photo updated successfully",
        coverPhoto: user.coverPhoto
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error: error.message
      });

    } finally {
      if (req.file && !keepUploadedFile) {
        await removeUploadedFile(req.file);
      }
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




// =========================
// CHANGE ACCOUNT PASSWORD
// =========================
router.put("/change-password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (typeof currentPassword !== "string" ||
        typeof newPassword !== "string") {
      return res.status(400).json({
        message: "Current password and new password are required"
      });
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({
        message: "New password must be between 8 and 128 characters"
      });
    }

    const user = req.user;

    const validCurrentPassword = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!validCurrentPassword) {
      return res.status(400).json({
        message: "Current password is incorrect"
      });
    }

    const samePassword = await bcrypt.compare(
      newPassword,
      user.password
    );

    if (samePassword) {
      return res.status(400).json({
        message: "Choose a different password"
      });
    }

    user.password = await bcrypt.hash(newPassword, 12);

    user.resetCode = undefined;
    user.resetCodeHash = undefined;
    user.resetCodeExpires = undefined;
    user.resetCodeAttempts = 0;

    await user.save();

    return res.json({
      message: "Password changed successfully"
    });

  } catch (error) {
    console.error("Change password error:", error);

    return res.status(500).json({
      message: "Unable to change password"
    });
  }
});



// =========================
// PROFILE PRIVACY SETTINGS
// =========================

router.get("/privacy", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("profileVisibility");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      profileVisibility: user.profileVisibility || "public"
    });
  } catch (error) {
    console.error("Privacy settings load error:", error);
    res.status(500).json({ message: "Unable to load privacy settings" });
  }
});

router.put("/privacy", auth, async (req, res) => {
  try {
    const allowed = ["public", "followers", "private"];
    const visibility = req.body.profileVisibility;

    if (!allowed.includes(visibility)) {
      return res.status(400).json({
        message: "Choose Everyone, Followers, or Only me"
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.profileVisibility = visibility;
    await user.save();

    res.json({
      message: "Privacy settings updated successfully",
      profileVisibility: user.profileVisibility
    });
  } catch (error) {
    console.error("Privacy settings update error:", error);
    res.status(500).json({ message: "Unable to update privacy settings" });
  }
});


module.exports = router;
