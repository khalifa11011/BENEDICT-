(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const statusEl = $("liveStatus");
const startBtn = $("startBtn");
const roomList = $("roomList");
let socket = null;
let currentRoom = null;
let isHost = false;
let rooms = [];
let liveRoom = null;
let localTracks = [];
let remoteMedia = new Map();
let cameraEnabled = true;
let micEnabled = true;

function status(message) { statusEl.textContent = message; }
function escapeText(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
}
function showRoom(room) {
  currentRoom = room;
  $("activeSection").hidden = false;
  $("chatPanel").style.display = "block";
  $("activeTitle").textContent = room.title || "Live room";
  $("stageTitle").textContent = room.title || "BENEDICT Live";
  $("stageState").textContent = isHost
    ? "Your live room is active"
    : "You joined this room · Host video is not being broadcast yet";
  $("mediaControls").hidden = !isHost;
  $("viewerCount").textContent = (room.viewerCount || 1) + " in room";
  $("endBtn").hidden = !isHost;
  $("roomsSection").hidden = true;
  $("startBtn").disabled = true;
}
function stopLocalMedia() {
  if (liveRoom) {
    const room = liveRoom;
    liveRoom = null;
    room.disconnect();
  }

  localTracks.forEach(track => {
    try {
      track.detach();
      track.stop();
    } catch (_) {}
  });
  localTracks = [];

  remoteMedia.forEach(item => {
    try { item.track.detach(item.element); } catch (_) {}
    item.element.remove();
  });
  remoteMedia.clear();

  const container = $("remoteMediaContainer");
  if (container) container.remove();

  $("localVideo").srcObject = null;
  $("localVideo").style.display = "none";
  $("liveOrb").style.display = "block";
  $("cameraBtn").textContent = "Turn camera on";
  $("micBtn").textContent = "Unmute microphone";
  cameraEnabled = true;
  micEnabled = true;
}

async function startLocalMedia() {
  if (!currentRoom || liveRoom) return;

  const sdk = window.LiveKit;
  if (!sdk || !sdk.Room || !sdk.createLocalTracks) {
    status("LiveKit client failed to load. Please reload the page.");
    return;
  }

  try {
    status("Connecting to live video service…");
    const response = await fetch("/api/live/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + (localStorage.getItem("token") || "")
      },
      body: JSON.stringify({ roomId: currentRoom.id })
    });

    const credentials = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(credentials.message || "Could not get live video access.");
    }

    const room = new sdk.Room({
      adaptiveStream: true,
      dynacast: true
    });
    liveRoom = room;

    room.on(sdk.RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (!currentRoom || liveRoom !== room) return;

      const stage = $("localVideo").parentElement;
      let container = $("remoteMediaContainer");
      if (!container) {
        container = document.createElement("div");
        container.id = "remoteMediaContainer";
        Object.assign(container.style, {
          position: "absolute",
          inset: "0",
          zIndex: "1",
          overflow: "hidden"
        });
        stage.style.position = "relative";
        stage.appendChild(container);
      }

      const element = document.createElement(
        track.kind === "video" ? "video" : "audio"
      );
      element.autoplay = true;
      element.playsInline = true;

      if (track.kind === "video") {
        Object.assign(element.style, {
          width: "100%",
          height: "100%",
          objectFit: "cover"
        });
        $("localVideo").style.display = "none";
        $("liveOrb").style.display = "none";
        $("stageState").textContent = "Receiving host video";
        status("Connected to the host's live video.");
      }

      container.appendChild(element);
      track.attach(element);
      remoteMedia.set(track.sid, { track, element });
      element.play().catch(() => {});
    });

    room.on(sdk.RoomEvent.TrackUnsubscribed, track => {
      const item = remoteMedia.get(track.sid);
      if (item) {
        try { track.detach(item.element); } catch (_) {}
        item.element.remove();
        remoteMedia.delete(track.sid);
      }
    });

    await room.connect(credentials.serverUrl, credentials.token);

    if (isHost) {
      status("Requesting camera and microphone permission…");
      localTracks = await sdk.createLocalTracks({
        audio: true,
        video: { facingMode: "user" }
      });

      for (const track of localTracks) {
        await room.localParticipant.publishTrack(track);
        if (track.kind === "video") {
          track.attach($("localVideo"));
          $("localVideo").style.display = "block";
          $("liveOrb").style.display = "none";
        }
      }

      cameraEnabled = true;
      micEnabled = true;
      $("cameraBtn").textContent = "Turn camera off";
      $("micBtn").textContent = "Mute microphone";
      $("stageState").textContent = "You are broadcasting live";
      status("You're live! Your camera and microphone are being broadcast.");
    } else {
      $("stageState").textContent = "Connected · Waiting for host video";
      status("Connected to the live room. Waiting for the host's stream…");
    }
  } catch (error) {
    stopLocalMedia();
    status(error.message || "Could not connect to live video. Check permissions and configuration.");
    $("stageState").textContent = "Live video connection failed";
  }
}

function hideRoom() {
  stopLocalMedia();
  currentRoom = null;
  isHost = false;
  $("activeSection").hidden = true;
  $("roomsSection").hidden = false;
  $("startBtn").disabled = !socket || !socket.connected;
  $("chatLog").replaceChildren();
}
function renderRooms() {
  $("roomTotal").textContent = rooms.length + (rooms.length === 1 ? " room" : " rooms");
  roomList.replaceChildren();
  if (!rooms.length) {
    const empty = document.createElement("div");
    empty.className = "live-room";
    empty.textContent = "No one is live right now. Start the first room!";
    roomList.appendChild(empty);
    return;
  }
  rooms.forEach(room => {
    const card = document.createElement("article");
    card.className = "live-room";
    const tag = document.createElement("div");
    tag.className = "live-live";
    tag.textContent = "● LIVE";
    const title = document.createElement("h3");
    title.textContent = room.title || "Live room";
    const meta = document.createElement("div");
    meta.className = "live-meta";
    meta.textContent = (room.viewerCount || 0) + " in room";
    const join = document.createElement("button");
    join.className = "live-btn primary";
    join.type = "button";
    join.textContent = "Join live";
    join.addEventListener("click", () => {
      if (!socket || !socket.connected) return status("Not connected. Please sign in and try again.");
      socket.emit("joinLiveRoom", {roomId: room.id}, result => {
        if (!result || !result.ok) return status(result && result.message || "Could not join this room.");
        isHost = false;
        showRoom(result.room || room);
        status("You're connected to the room.");
        startLocalMedia();
      });
    });
    card.append(tag, title, meta, join);
    roomList.appendChild(card);
  });
}
function connect() {
  const token = localStorage.getItem("token") || "";
  if (!token) {
    status("Please sign in to BENEDICT before using Live.");
    startBtn.disabled = true;
    return;
  }
  if (typeof window.io !== "function") {
    status("Live connection script did not load. Check your server and reload.");
    return;
  }
  socket = window.io({auth:{token}});
  socket.on("connect", () => {
    status("Connected to BENEDICT Live.");
    startBtn.disabled = false;
    socket.emit("getLiveRooms");
  });
  socket.on("connect_error", error => {
    startBtn.disabled = true;
    status("Live connection failed: " + (error && error.message || "Please sign in again."));
  });
  socket.on("disconnect", () => {
    startBtn.disabled = true;
    status("Connection lost. Reconnect or reload the page.");
  });
  socket.on("liveRoomsUpdated", list => {
    rooms = Array.isArray(list) ? list : [];
    renderRooms();
  });
  socket.on("liveRoomState", room => {
    if (!currentRoom && room && room.id) showRoom(room);
  });
  socket.on("liveViewerCount", data => {
    if (currentRoom && data && data.roomId === currentRoom.id) {
      currentRoom.viewerCount = data.viewerCount;
      $("viewerCount").textContent = data.viewerCount + " in room";
    }
  });
  socket.on("liveChatMessage", data => {
    if (!currentRoom || !data || data.roomId !== currentRoom.id) return;
    const line = document.createElement("div");
    line.className = "live-message";
    const name = document.createElement("strong");
    name.textContent = "User " + String(data.userId || "").slice(-6) + ": ";
    const message = document.createElement("span");
    message.textContent = data.message || "";
    line.append(name, message);
    $("chatLog").appendChild(line);
    $("chatLog").scrollTop = $("chatLog").scrollHeight;
  });
  socket.on("liveLike", data => {
    if (currentRoom && data && data.roomId === currentRoom.id) {
      const line = document.createElement("div");
      line.className = "live-message";
      line.textContent = "♥ A viewer sent a like";
      $("chatLog").appendChild(line);
      $("chatLog").scrollTop = $("chatLog").scrollHeight;
    }
  });
  socket.on("liveEnded", data => {
    if (currentRoom && data && data.roomId === currentRoom.id) {
      status("This live has ended.");
      hideRoom();
      socket.emit("getLiveRooms");
    }
  });
}
startBtn.addEventListener("click", () => {
  const title = $("liveTitle").value.trim();
  if (!title) return status("Enter a title for your live first.");
  if (!socket || !socket.connected) return status("Connect to BENEDICT Live first.");
  startBtn.disabled = true;
  socket.emit("createLiveRoom", {title}, result => {
    if (!result || !result.ok) {
      startBtn.disabled = false;
      return status(result && result.message || "Could not start the live room.");
    }
    isHost = true;
    showRoom(result.room);
    startLocalMedia();
  });
});

$("cameraBtn").addEventListener("click", async () => {
  if (!isHost || !liveRoom) {
    return status("Start your live before turning on the camera.");
  }
  try {
    cameraEnabled = !cameraEnabled;
    await liveRoom.localParticipant.setCameraEnabled(cameraEnabled);
    const publication = liveRoom.localParticipant.getTrackPublication(
      window.LiveKit.Track.Source.Camera
    );
    if (cameraEnabled && publication && publication.track) {
      publication.track.attach($("localVideo"));
      $("localVideo").style.display = "block";
      $("liveOrb").style.display = "none";
    } else {
      $("localVideo").style.display = "none";
      $("liveOrb").style.display = "block";
    }
    $("cameraBtn").textContent = cameraEnabled ? "Turn camera off" : "Turn camera on";
    $("stageState").textContent = cameraEnabled
      ? "You are broadcasting live"
      : "Camera is off";
  } catch (error) {
    status("Could not change camera state. Please try again.");
  }
});

$("micBtn").addEventListener("click", async () => {
  if (!isHost || !liveRoom) {
    return status("Start your live before changing the microphone.");
  }
  try {
    micEnabled = !micEnabled;
    await liveRoom.localParticipant.setMicrophoneEnabled(micEnabled);
    $("micBtn").textContent = micEnabled ? "Mute microphone" : "Unmute microphone";
    status(micEnabled ? "Microphone is on." : "Microphone is muted.");
  } catch (error) {
    status("Could not change microphone state. Please try again.");
  }
});

window.addEventListener("pagehide", stopLocalMedia);window.addEventListener("pagehide", stopLocalMedia);

$("refreshBtn").addEventListener("click", () => {
  if (socket && socket.connected) socket.emit("getLiveRooms");
  else status("Connect to BENEDICT Live first.");
});
$("likeBtn").addEventListener("click", () => {
  if (socket && currentRoom) socket.emit("liveLike", result => {
    if (result && !result.ok) status(result.message || "Could not send like.");
  });
});
$("leaveBtn").addEventListener("click", () => {
  if (!socket || !currentRoom) return;
  if (isHost) {
    status("You host this room. Use End Live to close it for everyone.");
    return;
  }
  socket.emit("leaveLiveRoom", () => {
    hideRoom();
    status("You left the live room.");
    socket.emit("getLiveRooms");
  });
});
$("endBtn").addEventListener("click", () => {
  if (!socket || !currentRoom || !isHost) return;
  if (!window.confirm("End this live room for everyone?")) return;
  socket.emit("endLiveRoom", {roomId:currentRoom.id}, result => {
    if (!result || !result.ok) return status(result && result.message || "Could not end the live.");
    hideRoom();
    status("Live ended. Camera and microphone stopped.");
    socket.emit("getLiveRooms");
  });
});
$("chatForm").addEventListener("submit", event => {
  event.preventDefault();
  const input = $("chatInput");
  const message = input.value.trim();
  if (!message || !socket || !currentRoom) return;
  socket.emit("liveChatMessage", {message}, result => {
    if (!result || !result.ok) status(result && result.message || "Could not send comment.");
    else input.value = "";
  });
});
$("backBtn").addEventListener("click", () => {
  if (currentRoom && isHost) {
    status("End your live before leaving this page.");
    return;
  }
  if (currentRoom && socket) socket.emit("leaveLiveRoom");
  window.location.href = "/";
});
window.addEventListener("beforeunload", () => {
  if (socket && currentRoom && !isHost) socket.emit("leaveLiveRoom");
});
connect();
})();