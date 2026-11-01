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

const crypto = require("crypto");
const { AccessToken } = require("livekit-server-sdk");
const requireAuth = require("./middleware/auth");
const User = require("./models/User");

// BENEDICT Live: temporary room coordination.
const liveRooms = new Map();

function publicLiveRooms() {
  return [...liveRooms.values()].map(r => ({
    id: r.id, title: r.title, hostId: r.hostId,
    createdAt: r.createdAt, viewerCount: r.viewers.size
  }));
}

function broadcastLiveRooms() {
  io.emit("liveRoomsUpdated", publicLiveRooms());
}

function closeLiveRoom(room, reason) {
  if (!room || !liveRooms.has(room.id)) return;
  io.to("live:" + room.id).emit("liveEnded", {
    roomId: room.id, reason: reason || "ended"
  });
  for (const sid of room.viewers) {
    const member = io.sockets.sockets.get(sid);
    if (member) {
      member.leave("live:" + room.id);
      if (member.data.liveRoomId === room.id) member.data.liveRoomId = null;
    }
  }
  liveRooms.delete(room.id);
  broadcastLiveRooms();
}

function leaveLiveRoom(socket) {
  const id = socket.data.liveRoomId;
  if (!id) return;
  const room = liveRooms.get(id);
  socket.data.liveRoomId = null;
  if (!room) {
    socket.leave("live:" + id);
    return;
  }
  if (room.hostSocketId === socket.id) {
    closeLiveRoom(room, "host_disconnected");
    return;
  }
  room.viewers.delete(socket.id);
  socket.leave("live:" + id);
  io.to("live:" + id).emit("liveViewerCount", {
    roomId: id, viewerCount: room.viewers.size
  });
  broadcastLiveRooms();
}



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
app.use("/uploads/messages", (req, res) => res.sendStatus(404));
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
app.use("/api/reports", require("./routes/reports"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/news", newsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/stories", storyRoutes);
app.use("/api/ai", aiRoutes);


// BENEDICT Live: issue short-lived, room-scoped media tokens.
// Keep LIVEKIT_API_SECRET on the server; never return it to the browser.
app.post("/api/live/token", requireAuth, async (req, res) => {
  try {
    const { roomId } = req.body || {};

    if (typeof roomId !== "string" || !/^[a-f0-9]{16}$/i.test(roomId)) {
      return res.status(400).json({ message: "Invalid live room ID" });
    }

    const room = liveRooms.get(roomId);
    if (!room) {
      return res.status(404).json({ message: "Live room not found or has ended" });
    }

    const livekitUrl = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!livekitUrl || !apiKey || !apiSecret) {
      return res.status(503).json({
        message: "Live video service is not configured yet"
      });
    }

    const isHost = String(room.hostId) === String(req.userId);

    // Only the host or a currently connected room participant may get a token.
    const isRoomMember = [...room.viewers].some((socketId) => {
      const member = io.sockets.sockets.get(socketId);
      return member &&
        String(member.data.userId) === String(req.userId);
    });

    if (!isHost && !isRoomMember) {
      return res.status(403).json({
        message: "Join this live room before requesting a media token"
      });
    }

    const token = new AccessToken(apiKey, apiSecret, {
      identity: String(req.userId),
      ttl: "15m"
    });

    token.addGrant({
      roomJoin: true,
      room: room.id,
      canPublish: isHost,
      canSubscribe: true,
      canPublishData: false
    });

    const jwtToken = await token.toJwt();

    return res.json({
      serverUrl: livekitUrl,
      token: jwtToken,
      role: isHost ? "host" : "viewer"
    });
  } catch (error) {
    console.error("BENEDICT Live token error:", error);
    return res.status(500).json({
      message: "Unable to create a live media token"
    });
  }
});

app.get("/hello", (req, res) => {
  res.json({
    message: "Hello works!"
  });
});

// Phase 4: authenticate every socket with the same JWT used by the REST API.
io.use(async (socket, next) => {
  const token =
    (socket.handshake.auth && socket.handshake.auth.token) ||
    (socket.handshake.query && socket.handshake.query.token) ||
    "";

  if (!token) {
    return next(new Error("Authentication required"));
  }

  try {
    if (!process.env.JWT_SECRET) {
      return next(new Error("Authentication service unavailable"));
    }

    const decoded = jwt.verify(String(token), process.env.JWT_SECRET);

    if (!decoded || !decoded.id) {
      return next(new Error("Invalid authentication token"));
    }

    const user = await User.findById(decoded.id).select("_id accountStatus");

    if (!user) {
      return next(new Error("User account no longer exists"));
    }

    if (user.accountStatus && user.accountStatus !== "active") {
      return next(new Error("This account is suspended or banned"));
    }

    socket.data.userId = user._id.toString();
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" ||
        error.name === "TokenExpiredError" ||
        error.name === "CastError") {
      return next(new Error("Invalid authentication token"));
    }

    console.error("Socket authentication error:", error);
    next(new Error("Authentication service unavailable"));
  }
});


io.on("connection", (socket) => {
  console.log("User connected:", socket.id);


  socket.on("getLiveRooms", () => {
    socket.emit("liveRoomsUpdated", publicLiveRooms());
  });

  socket.on("createLiveRoom", (data, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const title = data && typeof data.title === "string"
      ? data.title.trim().slice(0, 80) : "";
    if (socket.data.liveRoomId)
      return reply({ ok: false, message: "Leave your current live room first." });
    if (!title)
      return reply({ ok: false, message: "Please enter a live title." });

    const id = crypto.randomBytes(8).toString("hex");
    const room = {
      id, title, hostId: socket.data.userId, hostSocketId: socket.id,
      createdAt: new Date().toISOString(), viewers: new Set([socket.id])
    };
    liveRooms.set(id, room);
    socket.data.liveRoomId = id;
    socket.join("live:" + id);
    broadcastLiveRooms();
    socket.emit("liveRoomState", {
      id, title, hostId: room.hostId,
      createdAt: room.createdAt, viewerCount: room.viewers.size
    });
    reply({ ok: true, room: {
      id, title, hostId: room.hostId,
      createdAt: room.createdAt, viewerCount: room.viewers.size
    }});
  });

  socket.on("joinLiveRoom", (data, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const id = data && typeof data.roomId === "string" ? data.roomId.trim() : "";
    const room = liveRooms.get(id);
    if (!room)
      return reply({ ok: false, message: "This live room is no longer available." });
    if (socket.data.liveRoomId === id)
      return reply({ ok: true, roomId: id, viewerCount: room.viewers.size });

    leaveLiveRoom(socket);
    room.viewers.add(socket.id);
    socket.data.liveRoomId = id;
    socket.join("live:" + id);
    io.to("live:" + id).emit("liveViewerCount", {
      roomId: id, viewerCount: room.viewers.size
    });
    broadcastLiveRooms();
    reply({ ok: true, room: {
      id, title: room.title, hostId: room.hostId,
      createdAt: room.createdAt, viewerCount: room.viewers.size
    }});
  });

  socket.on("leaveLiveRoom", ack => {
    leaveLiveRoom(socket);
    if (typeof ack === "function") ack({ ok: true });
  });

  socket.on("liveChatMessage", (data, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const id = socket.data.liveRoomId;
    const room = id && liveRooms.get(id);
    const message = data && typeof data.message === "string"
      ? data.message.trim().slice(0, 300) : "";
    const now = Date.now();
    if (!room || !room.viewers.has(socket.id))
      return reply({ ok: false, message: "Join a live room before commenting." });
    if (!message)
      return reply({ ok: false, message: "Comment cannot be empty." });
    if (now - (socket.data.lastLiveCommentAt || 0) < 700)
      return reply({ ok: false, message: "Please slow down before commenting again." });

    socket.data.lastLiveCommentAt = now;
    io.to("live:" + id).emit("liveChatMessage", {
      roomId: id, userId: socket.data.userId,
      message, sentAt: new Date().toISOString()
    });
    reply({ ok: true });
  });

  socket.on("liveLike", ack => {
    const reply = typeof ack === "function" ? ack : () => {};
    const id = socket.data.liveRoomId;
    const room = id && liveRooms.get(id);
    const now = Date.now();
    if (!room || !room.viewers.has(socket.id))
      return reply({ ok: false, message: "Join a live room first." });
    if (now - (socket.data.lastLiveLikeAt || 0) < 300)
      return reply({ ok: false, message: "Please wait before reacting again." });

    socket.data.lastLiveLikeAt = now;
    io.to("live:" + id).emit("liveLike", {
      roomId: id, userId: socket.data.userId
    });
    reply({ ok: true });
  });

  socket.on("endLiveRoom", (data, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const id = socket.data.liveRoomId;
    const room = id && liveRooms.get(id);
    if (!room)
      return reply({ ok: false, message: "No active live room found." });
    if (room.hostSocketId !== socket.id)
      return reply({ ok: false, message: "Only the host can end this live." });
    closeLiveRoom(room, "ended");
    reply({ ok: true });
  });


  // Personal room so the server can push notifications to one user.
  socket.join("user:" + socket.data.userId);

  // Presence is registered from the verified token, not from client input.
  addOnlineSocket(socket.data.userId, socket.id);
  io.emit("onlineUsers", getOnlineUserIds());

  socket.on("userOnline", () => {
    addOnlineSocket(socket.data.userId, socket.id);
    io.emit("onlineUsers", getOnlineUserIds());
  });

  socket.on("joinChat", async (data) => {
    try {
      const receiverId = String(data?.receiverId || "").trim();
      const currentUserId = socket.data.userId;

      if (
        !/^[a-f0-9]{24}$/i.test(receiverId) ||
        receiverId === currentUserId
      ) {
        return;
      }

      const receiver = await User.findById(receiverId)
        .select("_id accountStatus");

      if (
        !receiver ||
        (receiver.accountStatus && receiver.accountStatus !== "active")
      ) {
        return;
      }

      const room = [currentUserId, receiver._id.toString()]
        .sort()
        .join("_");

      if (socket.data.chatRoom && socket.data.chatRoom !== room) {
        socket.leave(socket.data.chatRoom);
      }

      socket.join(room);
      socket.data.chatRoom = room;
      socket.data.chatUserId = receiver._id.toString();
      socket.data.lastTypingAt = 0;

      console.log("Joined chat room:", room);
    } catch (error) {
      console.error("Chat room join error:", error.message);
    }
  });

  socket.on("typing", (data) => {
    const receiverId = String(data?.receiverId || "").trim();
    const room = socket.data.chatRoom;

    if (
      !room ||
      receiverId !== socket.data.chatUserId ||
      !room.split("_").includes(socket.data.userId)
    ) {
      return;
    }

    const now = Date.now();

    if (now - (socket.data.lastTypingAt || 0) < 700) {
      return;
    }

    socket.data.lastTypingAt = now;

    socket.to(room).emit("typing", {
      userId: socket.data.userId
    });
  });

  socket.on("messageSeen", (data) => {
    const receiverId = String(data?.receiverId || "").trim();
    const room = socket.data.chatRoom;

    if (
      !room ||
      receiverId !== socket.data.chatUserId ||
      !room.split("_").includes(socket.data.userId)
    ) {
      return;
    }

    socket.to(room).emit("messageSeen");
  });

  socket.on("disconnect", () => {
    leaveLiveRoom(socket);
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
