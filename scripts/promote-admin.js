require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/User");

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOne({ username: "chijioke" });

  if (!user) {
    throw new Error(
      'Account "chijioke" does not exist. No administrator was promoted.'
    );
  }

  if (user.accountStatus && user.accountStatus !== "active") {
    throw new Error(
      'Account "chijioke" is not active. Resolve its status before promotion.'
    );
  }

  console.log("Verified existing account:");
  console.log("Username:", user.username);
  console.log("Full name:", user.fullName || "(not set)");
  console.log("Current role:", user.role || "user");
  console.log("Account status:", user.accountStatus || "active");

  if (user.role === "admin") {
    console.log("This account is already an administrator. No change needed.");
    return;
  }

  user.role = "admin";
  await user.save();

  console.log('SUCCESS: "chijioke" is now a BENEDICT administrator.');
}

main()
  .catch((error) => {
    console.error("Administrator promotion failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
