require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const http = require("http");

const authRoutes = require("./routes/auth");
const profileRoutes = require("./routes/profile");
const postRoutes = require("./routes/posts");
const newsRoutes = require("./routes/news");
const usersRoutes = require("./routes/users");
const notificationRoutes = require("./routes/notifications");
const messageRoutes = require("./routes/messages");
const friendRoutes = require("./routes/friends");
const commentRoutes = require("./routes/comments");
const storyRoutes = require("./routes/stories");
const aiRoutes = require("./routes/ai");

const app = express();
const server = http.createServer(app);

const { Server } = require("socket.io");
const io = new Server(server);
const onlineUsers = new Map();

app.set("io", io);
app.set("onlineUsers", onlineUsers);

app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is missing from .env");
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is missing from .env");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB Error:", err));


app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/stories", storyRoutes);
app.use("/api/ai", aiRoutes);

app.get("/hello", (req, res) => {
  res.json({
    message: "Hello works!"
  });
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

socket.on("userOnline", (userId) => {

  onlineUsers.set(userId, socket.id);

  console.log("User online:", userId, "Socket:", socket.id);
  console.log("Online users:", [...onlineUsers.entries()]);

  io.emit("onlineUsers", [...onlineUsers.keys()]);

});

  socket.on("joinChat", (data) => {
    const room = [data.userId, data.receiverId].sort().join("_");

    socket.join(room);

    console.log("Joined chat room:", room);
  });

socket.on("typing", (data) => {

  const room = [data.userId, data.receiverId].sort().join("_");

  socket.to(room).emit("typing", {
    userId: data.userId
  });

});

socket.on("messageSeen", (data) => {

  const room = [data.userId, data.receiverId].sort().join("_");

  socket.to(room).emit("messageSeen");

});

   socket.on("disconnect", () => {

  for (const [userId, id] of onlineUsers.entries()) {

    if (id === socket.id) {
      onlineUsers.delete(userId);
      break;
    }

  }

  io.emit("onlineUsers", [...onlineUsers.keys()]);

  console.log("User disconnected:", socket.id);

});

});


// ========================================
// BENEDICT CENTRAL ERROR HANDLER
// ========================================

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      message: "API endpoint not found"
    });
  }

  res.status(404).send("Page not found");
});

app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    message: err.status
      ? err.message
      : "Internal server error"
  });
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
