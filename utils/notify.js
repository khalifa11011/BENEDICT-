const Notification = require("../models/Notification");
const User = require("../models/User");

// Respect each recipient's notification preferences.
async function createNotification(req, data) {
  const preferenceByType = {
    reaction: "likes",
    comment: "comments",
    friend_request: "friendRequests",
    friend_accept: "friendRequests",
    follow: "followers",
    message: "messages"
  };

  const preference = preferenceByType[data.type];

  if (preference) {
    const recipient = await User.findById(data.user)
      .select("notificationPreferences")
      .lean();

    if (!recipient) return null;

    // Missing preferences on older accounts default to enabled.
    if (recipient.notificationPreferences &&
        recipient.notificationPreferences[preference] === false) {
      return null;
    }
  }

  const notification = await Notification.create(data);

  try {
    const io = req.app.get("io");

    if (io) {
      const populated = await Notification.findById(notification._id)
        .populate("fromUser", "username profilePicture")
        .lean();

      io.to("user:" + String(data.user)).emit("newNotification", populated);
    }
  } catch (error) {
    console.error("Notification push error:", error);
  }

  return notification;
}

module.exports = { createNotification };
