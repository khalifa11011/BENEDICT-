const socket = io();

let recordedAudio = null;
let mediaRecorder = null;
let audioChunks = [];

async function toggleRecording() {

const btn = document.getElementById("recordBtn");

  // Stop recording
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    btn.innerText = "🎤 Record";
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

    };

    mediaRecorder.start();

    btn.innerText = "⏹ Stop";

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
  return params.get("user");
}

function getCurrentUserId() {
  const token = getToken();

  if (!token) return null;

  const payload = JSON.parse(atob(token.split(".")[1]));

  return payload.id;
}

function loadChatTitle() {

  const receiver = getReceiverId();

  if (!receiver) return;

  fetch("/api/users/" + receiver, {
    headers: {
      "Authorization": "Bearer " + getToken()
    }
  })
  .then(res => res.json())
  .then(data => {

    if (data.user) {
      document.getElementById("chatTitle").innerHTML =
      "Chat with " + data.user.username;
    }

  });

}

socket.on("typing", () => {

  const status = document.getElementById("chatStatus");

  status.innerHTML = "⌨️ Typing...";

  setTimeout(() => {

    status.innerHTML = "🟢 Online";

  }, 1500);

});

socket.on("messageSeen", () => {

  loadMessages();

});

function loadMessages() {

  const receiver = getReceiverId();

  if (!receiver) return;

  fetch("/api/messages/" + receiver, {
    headers: {
      "Authorization": "Bearer " + getToken()
    }
  })
  .then(res => res.json())
  .then(messages => {

    const box = document.getElementById("messages");
    box.innerHTML = "";

    messages.forEach(msg => {

    const mine = msg.sender._id === getCurrentUserId();

console.log("MEDIA:", msg.media);

    box.innerHTML += `
        <div class="message ${mine ? "mine" : "theirs"}">
            <strong>${msg.sender.username}</strong><br>
${msg.text ? `<div class="message-text">${msg.text}</div>` : ""}
${msg.media
  ? (msg.media.match(/\.(jpg|jpeg|png|gif)$/i)
      ? `<img src="${msg.media}" style="max-width:250px;border-radius:10px;">`
      : msg.media.match(/\.(webm|mp3|wav|ogg|m4a)$/i)
        ? `<audio controls style="width:250px;">
             <source src="${msg.media}">
           </audio>`
        : `<video controls style="max-width:250px;border-radius:10px;">
             <source src="${msg.media}">
           </video>`)
  : ""}

<small>
${new Date(msg.createdAt).toLocaleString()}
${mine
  ? (msg.read
      ? " ✔✔ Seen"
      : (msg.delivered
          ? " ✔✔ Delivered"
          : " ✔ Sent"))
  : ""}
</small>

${mine
  ? `<br><button type="button" class="benedict-three-dot" data-message-id="${msg._id}">⋮</button>`
  : ""}
        </div>
        `;
     });

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

console.log("SEND URL:", window.location.href);
console.log("SEND RECEIVER:", receiver);
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
document.getElementById("recordBtn").innerText = "🎤 Record";

loadMessages();

  })
  .catch(err => {
    console.error(err);
  });

}

function deleteMessage(id) {

  if (!confirm("Delete this message?")) return;

  fetch("/api/messages/" + id, {
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
