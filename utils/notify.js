const Notification = require("../models/Notification");

// Phase 6: create a notification and push it to the recipient's personal room.
async function createNotification(req, data) {
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
