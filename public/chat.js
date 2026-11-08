const socket = io({
  auth: {
    token: localStorage.getItem("token") || ""
  }
});

let recordedAudio = null;
let mediaRecorder = null;
let audioChunks = [];

async function toggleRecording() {

const btn = document.getElementById("recordBtn");

  // Stop recording
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    btn.innerText = "🎤";
    btn.classList.remove("recording");
    btn.setAttribute("aria-label", "Record voice");
    return;
  }

  try {

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });


    audioChunks = [];

    mediaRecorder = new MediaRecorder(stream);


    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      recordedAudio = new Blob(audioChunks, {
        type: "audio/webm"
      });

      stream.getTracks().forEach(track => track.stop());
      updateAttachChip();

    };

    mediaRecorder.start();

    btn.innerText = "⏹";
    btn.classList.add("recording");
    btn.setAttribute("aria-label", "Stop recording");

  } catch (err) {
    alert("Microphone error: " + err.message);
    console.error(err);
  }
}

document.getElementById("messageText").addEventListener("input", () => {
  socket.emit("typing", {
    userId: getCurrentUserId(),
    receiverId: getReceiverId()
  });
});

function getToken() {
  return localStorage.getItem("token");
}

function getReceiverId() {
  const params = new URLSearchParams(window.location.search);
  const receiver = params.get("user");

  // Accept only valid MongoDB ObjectIds.
  return receiver && /^[a-f0-9]{24}$/i.test(receiver)
    ? receiver
    : null;
}

function getCurrentUserId() {
  const token = getToken();

  if (!token) return null;

  const payload = JSON.parse(atob(token.split(".")[1]));

  return payload.id;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeMediaUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw, window.location.origin);

    // Chat attachments must be served by BENEDICT itself.
    // Reject external URLs and non-HTTP(S) schemes.
    if (
      url.origin !== window.location.origin ||
      (url.protocol !== "http:" && url.protocol !== "https:")
    ) {
      return "";
    }

    return escapeHtml(url.href);
  } catch {
    return "";
  }
}

function loadChatTitle() {

  const receiver = getReceiverId();

  if (!receiver) return;

  fetch("/api/users/" + encodeURIComponent(receiver), {
    headers: {
      "Authorization": "Bearer " + getToken()
    }
  })
  .then(res => res.json())
  .then(data => {

    if (data.user) {
      document.getElementById("chatTitle").textContent =
        "Chat with " + String(data.user.username || "");
    }

  });

}

socket.on("typing", () => {

  const status = document.getElementById("chatStatus");

  status.textContent = "⌨️ Typing...";

  setTimeout(() => {

    status.textContent = "🟢 Online";

  }, 1500);

});

socket.on("messageSeen", () => {

  loadMessages();

});

function loadProtectedMessageMedia(root) {
  const token = getToken();
  if (!token || !root) return;
  root.querySelectorAll("[data-protected-media-id]").forEach(async node => {
    const id = node.getAttribute("data-protected-media-id") || "";
    if (!/^[a-f0-9]{24}$/i.test(id)) return;
    try {
      const response = await fetch("/api/messages/media/" + encodeURIComponent(id), {
        headers: { "Authorization": "Bearer " + token }
      });
      if (!response.ok) return;
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      node.dataset.objectUrl = objectUrl;
      node.src = objectUrl;
      if (node.tagName === "AUDIO" || node.tagName === "VIDEO") node.load();
    } catch (error) {
      console.error("Private message media failed to load.");
    }
  });
}

function loadMessages() {

  const receiver = getReceiverId();

  if (!receiver) return;

  fetch("/api/messages/" + encodeURIComponent(receiver), {
    headers: {
      "Authorization": "Bearer " + getToken()
    }
  })
  .then(res => res.json())
  .then(messages => {

    const box = document.getElementById("messages");
    box.querySelectorAll("[data-object-url]").forEach(node => URL.revokeObjectURL(node.dataset.objectUrl));
    box.innerHTML = "";

    messages.forEach(msg => {

    const mine = msg.sender._id === getCurrentUserId();

const mediaUrl = safeMediaUrl(msg.media);
    let mediaPath = "";

    if (mediaUrl) {
      try {
        mediaPath = new URL(
          mediaUrl,
          window.location.origin
        ).pathname.toLowerCase();
      } catch {
        mediaPath = "";
      }
    }

    const sentAt = new Date(msg.createdAt);
    const timeLabel = isNaN(sentAt) ? "" : sentAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const fullTime = isNaN(sentAt) ? "" : sentAt.toLocaleString();
    const ticks = mine
      ? (msg.read
          ? `<span class="msg-ticks seen" title="Seen">✔✔</span>`
          : (msg.delivered
              ? `<span class="msg-ticks" title="Delivered">✔✔</span>`
              : `<span class="msg-ticks" title="Sent">✔</span>`))
      : "";

    box.innerHTML += `<div class="message ${mine ? "mine" : "theirs"}">${msg.text ? `<div class="message-text">${escapeHtml(msg.text || "")}</div>` : ""}${mediaUrl && mediaPath.startsWith("/uploads/messages/")
  ? (/\.(jpg|jpeg|png|gif|webp)$/i.test(mediaPath)
      ? `<img data-protected-media-id="${escapeHtml(msg._id)}" alt="Image message">`
      : /\.(weba|mp3|wav|ogg|m4a)$/i.test(mediaPath)
        ? `<audio controls data-protected-media-id="${escapeHtml(msg._id)}"></audio>`
        : /\.(mp4|webm|mov|m4v)$/i.test(mediaPath)
          ? `<video controls playsinline data-protected-media-id="${escapeHtml(msg._id)}"></video>`
          : "")
  : ""}<div class="msg-meta"><span title="${escapeHtml(fullTime)}">${escapeHtml(timeLabel)}</span>${ticks}${mine
  ? `<button type="button" class="benedict-three-dot" data-message-id="${escapeHtml(msg._id)}" aria-label="Message options">⋮</button>`
  : ""}</div></div>`;
     });

loadProtectedMessageMedia(box);

box.scrollTop = box.scrollHeight;

socket.emit("messageSeen", {
  userId: getCurrentUserId(),
  receiverId: getReceiverId()
});

  });
}

function sendMessage() {

  const receiver = getReceiverId();
  const text = document.getElementById("messageText").value.trim();
  const selectedFile = document.getElementById("messageMedia").files[0];
const media = recordedAudio
  ? new File([recordedAudio], "voice-message.webm", {
      type: "audio/webm"
    })
  : selectedFile;

  if (!receiver) {
    alert("No receiver selected.");
    return;
  }

  if (!text && !media) {
    alert("Please type a message or select a file.");
    return;
  }

  const formData = new FormData();

  formData.append("receiver", receiver);
  formData.append("text", text);

  if (media) {
    if (recordedAudio) {
      formData.append("media", media, "voice-message.webm");
    } else {
      formData.append("media", media);
    }
  }

  fetch("/api/messages", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + getToken()
    },
    body: formData
  })
  .then(async res => {
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Message could not be sent");
    }

    return data;
  })
  .then(() => {

    document.getElementById("messageText").value = "";
document.getElementById("messageMedia").value = "";

recordedAudio = null;
audioChunks = [];
document.getElementById("recordBtn").innerText = "🎤";
document.getElementById("recordBtn").classList.remove("recording");
updateAttachChip();

loadMessages();

  })
  .catch(err => {
    console.error(err);
  });

}

function deleteMessage(id) {

  id = String(id ?? "").trim();

  // Accept only valid MongoDB ObjectIds.
  if (!/^[a-f0-9]{24}$/i.test(id)) {
    console.warn("Invalid message ID; deletion cancelled.");
    return;
  }

  if (!confirm("Delete this message?")) return;

  fetch("/api/messages/" + encodeURIComponent(id), {
    method: "DELETE",
    headers: {
      "Authorization": "Bearer " + getToken()
    }
  })
  .then(res => res.json())
  .then(() => {
    loadMessages();
  })
  .catch(err => {
    console.error(err);
  });

}

function toggleEmojiPicker() {

  const picker = document.getElementById("emojiPicker");

  if (picker.style.display === "none") {
    picker.style.display = "block";
  } else {
    picker.style.display = "none";
  }

}

function addEmoji(emoji) {

  const input = document.getElementById("messageText");

  input.value += emoji;

  input.focus();

}

window.onload = function () {

  if (!getToken()) {
    alert("Please login first.");
    return;
  }

  const receiver = getReceiverId();

  document.getElementById("receiver").value = receiver || "";

  socket.emit("joinChat", {
    userId: getCurrentUserId(),
    receiverId: receiver
  });

  if (receiver) {
    loadChatTitle();
    loadMessages();
  } else {
    alert("No user selected.");
  }


};

socket.on("newMessage", function(message) {
  loadMessages();
});

socket.on("messageDeleted", function(messageId) {
  loadMessages();
});




/* ==========================================
   BENEDICT MESSAGE THREE-DOT MENU — FINAL
   ========================================== */

let activeMessageMenu = null;

function closeMessageMenu() {
  if (activeMessageMenu) {
    activeMessageMenu.remove();
    activeMessageMenu = null;
  }
}

function showMessageMenu(button, messageId) {

  closeMessageMenu();

  const menu = document.createElement("div");

  menu.className = "benedict-message-popup-menu";

  menu.innerHTML = `
    <button type="button" class="benedict-delete-action">
      🗑️ Delete
    </button>
  `;

  document.body.appendChild(menu);

  const rect = button.getBoundingClientRect();

  let left = rect.right - 150;
  let top = rect.bottom + 8;

  if (left < 8) left = 8;

  if (left + 150 > window.innerWidth - 8) {
    left = window.innerWidth - 158;
  }

  if (top + 60 > window.innerHeight - 8) {
    top = rect.top - 68;
  }

  menu.style.position = "fixed";
  menu.style.left = Math.round(left) + "px";
  menu.style.top = Math.round(top) + "px";
  menu.style.zIndex = "2147483647";

  const deleteButton =
    menu.querySelector(".benedict-delete-action");

  deleteButton.onclick = function(e) {
    e.preventDefault();
    e.stopPropagation();

    closeMessageMenu();

    deleteMessage(messageId);
  };

  activeMessageMenu = menu;
}

/* Handle dynamically-created three-dot buttons */
document.addEventListener("click", function(e) {

  const button = e.target.closest(".benedict-three-dot");

  if (button) {
    e.preventDefault();
    e.stopPropagation();

    const messageId = button.getAttribute("data-message-id");

    showMessageMenu(button, messageId);

    return;
  }

  if (
    activeMessageMenu &&
    !activeMessageMenu.contains(e.target)
  ) {
    closeMessageMenu();
  }

}, true);

/* Mobile touch support */
document.addEventListener("touchend", function(e) {

  const button = e.target.closest(".benedict-three-dot");

  if (button) {
    e.preventDefault();
    e.stopPropagation();

    const messageId = button.getAttribute("data-message-id");

    showMessageMenu(button, messageId);
  }

}, { passive: false });

window.addEventListener("resize", closeMessageMenu);


/* ==========================================
   BENEDICT MESSENGER V2 — COMPOSER HELPERS
   ========================================== */

function updateAttachChip() {
  const input = document.getElementById("messageMedia");
  const chip = document.getElementById("attachChip");
  const name = document.getElementById("attachName");
  if (!input || !chip || !name) return;
  const file = input.files && input.files[0];
  if (file) {
    name.textContent = "📎 " + file.name;
    chip.classList.add("show");
  } else if (recordedAudio) {
    name.textContent = "🎙️ Voice message ready — tap Send";
    chip.classList.add("show");
  } else {
    name.textContent = "";
    chip.classList.remove("show");
  }
}

function clearAttachment() {
  document.getElementById("messageMedia").value = "";
  recordedAudio = null;
  audioChunks = [];
  updateAttachChip();
}

document.getElementById("messageMedia").addEventListener("change", updateAttachChip);

document.getElementById("messageText").addEventListener("keydown", function(e) {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendMessage();
  }
});
