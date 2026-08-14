require("dotenv").config();

const fs = require("fs");
const path = require("path");

const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const http = require("http");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");

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

// Phase 1: make sure upload folders exist before multer writes to them.
const uploadDirs = [
  path.join(__dirname, "uploads"),
  path.join(__dirname, "uploads", "messages")
];

for (const dir of uploadDirs) {
  fs.mkdirSync(dir, { recursive: true });
}

const { Server } = require("socket.io");
const io = new Server(server);
// BENEDICT realtime presence
// Each user can have multiple active Socket.IO connections.
const onlineUsers = new Map();

function addOnlineSocket(userId, socketId) {
  const id = String(userId);

  if (!onlineUsers.has(id)) {
    onlineUsers.set(id, new Set());
  }

  onlineUsers.get(id).add(socketId);
}

function removeOnlineSocket(userId, socketId) {
  const id = String(userId);
  const sockets = onlineUsers.get(id);

  if (!sockets) return;

  sockets.delete(socketId);

  if (sockets.size === 0) {
    onlineUsers.delete(id);
  }
}

function getOnlineUserIds() {
  return [...onlineUsers.keys()];
}

app.set("io", io);
app.set("onlineUsers", onlineUsers);

// Phase 8: baseline security headers and CORS.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true
}));

app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

// Phase 8: rate limiting (auth endpoints are stricter than the rest of the API).
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." }
});

app.use("/api/", apiLimiter);
app.use("/api/auth", authLimiter);

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

// Phase 4: authenticate every socket with the same JWT used by the REST API.
io.use((socket, next) => {
  const token =
    (socket.handshake.auth && socket.handshake.auth.token) ||
    (socket.handshake.query && socket.handshake.query.token) ||
    "";

  if (!token) {
    return next(new Error("Authentication required"));
  }

  try {
    const decoded = jwt.verify(String(token), process.env.JWT_SECRET);

    if (!decoded || !decoded.id) {
      return next(new Error("Invalid authentication token"));
    }

    socket.data.userId = String(decoded.id);
    next();
  } catch (error) {
    next(new Error("Invalid authentication token"));
  }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Personal room so the server can push notifications to one user.
  socket.join("user:" + socket.data.userId);

  // Presence is registered from the verified token, not from client input.
  addOnlineSocket(socket.data.userId, socket.id);
  io.emit("onlineUsers", getOnlineUserIds());

  socket.on("userOnline", () => {
    addOnlineSocket(socket.data.userId, socket.id);
    io.emit("onlineUsers", getOnlineUserIds());
  });

  socket.on("joinChat", (data) => {
    const room = [socket.data.userId, data.receiverId].sort().join("_");

    socket.join(room);

    console.log("Joined chat room:", room);
  });

  socket.on("typing", (data) => {
    const room = [socket.data.userId, data.receiverId].sort().join("_");

    socket.to(room).emit("typing", {
      userId: socket.data.userId
    });
  });

  socket.on("messageSeen", (data) => {
    const room = [socket.data.userId, data.receiverId].sort().join("_");

    socket.to(room).emit("messageSeen");
  });

  socket.on("disconnect", () => {
    if (socket.data.userId) {
      removeOnlineSocket(socket.data.userId, socket.id);
    }

    io.emit("onlineUsers", getOnlineUserIds());

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

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});
