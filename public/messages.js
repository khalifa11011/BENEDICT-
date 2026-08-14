const socket = io({
  auth: {
    token: localStorage.getItem("token") || ""
  }
});

let allConversations = [];
let searchUsersTimer = null;

function getToken() {
  return localStorage.getItem("token");
}

function getCurrentUserId() {
  const token = getToken();

  if (!token) return null;

  try {
    return JSON.parse(atob(token.split(".")[1])).id;
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTime(dateString) {
  if (!dateString) return "";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric"
  });
}

function getPreview(conversation) {
  const message = conversation.lastMessage || {};

  if (message.text) {
    return message.text;
  }

  if (message.media) {
    const media = message.media.toLowerCase();

    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(media)) {
      return "📷 Photo";
    }

    if (/\.(mp4|webm|mov|m4v)$/i.test(media)) {
      return "🎥 Video";
    }

    if (/\.(webm|mp3|wav|ogg|m4a)$/i.test(media)) {
      return "🎤 Voice message";
    }

    return "📎 Media";
  }

  return "Message";
}

function renderConversations(list) {
  const box = document.getElementById("conversationList");

  if (!list.length) {
    box.innerHTML = `
      <div class="empty">
        <div style="font-size:34px;">💬</div>
        <div style="margin-top:8px;">No conversations yet.</div>
        <div style="margin-top:5px;font-size:13px;">
          Start a conversation from someone's profile.
        </div>
      </div>
    `;
    return;
  }

  box.innerHTML = list.map(conversation => {
    const user = conversation.user || {};
    const avatar = user.profilePicture || "";
    const name = user.fullName || user.username || "User";
    const unread = Number(conversation.unreadCount || 0);

    return `
      <button
        class="conversation"
        data-user-id="${escapeHtml(user._id)}">

        <div class="avatar-wrap">
          ${
            avatar
              ? `<img class="avatar"
                    src="${escapeHtml(avatar)}"
                    alt="${escapeHtml(name)}">`
              : `<div class="avatar"
                    style="display:flex;align-items:center;justify-content:center;font-size:22px;">
                    👤
                 </div>`
          }

          ${
            conversation.online
              ? `<span class="online-dot" aria-label="Online"></span>`
              : ""
          }
        </div>

        <div class="conversation-main">

          <div class="row-top">
            <span class="username">
              ${escapeHtml(name)}
            </span>

            <span class="time">
              ${escapeHtml(
                formatTime(conversation.lastMessage?.createdAt)
              )}
            </span>
          </div>

          <div class="preview-row">

            <span class="preview">
              ${escapeHtml(getPreview(conversation))}
            </span>

            ${
              unread > 0
                ? `<span class="unread">
                    ${unread > 99 ? "99+" : unread}
                   </span>`
                : ""
            }

          </div>

        </div>

      </button>
    `;
  }).join("");

  box.querySelectorAll(".conversation").forEach(button => {
    button.addEventListener("click", () => {
      openConversation(button.dataset.userId);
    });
  });
}

function openConversation(userId) {
  if (!userId) return;

  window.location.href =
    "/chat.html?user=" + encodeURIComponent(userId);
}

async function loadConversations() {
  if (!getToken()) {
    window.location.href = "/";
    return;
  }

  try {
    const response = await fetch(
      "/api/messages/conversations",
      {
        headers: {
          "Authorization": "Bearer " + getToken()
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || "Unable to load conversations"
      );
    }

    allConversations = Array.isArray(data)
      ? data
      : [];

    applySearch();

  } catch (error) {
    console.error(
      "Messenger inbox error:",
      error
    );

    const box =
      document.getElementById("conversationList");

    if (!allConversations.length) {
      box.innerHTML = `
        <div class="error">
          Unable to load conversations.
          <br>
          <button
            class="retry"
            onclick="loadConversations()">
            Try Again
          </button>
        </div>
      `;
    }
  }
}

async function searchPeople(keyword) {
  const results = document.getElementById("peopleSearchResults");

  if (!keyword) {
    results.innerHTML = "";
    results.style.display = "none";
    return;
  }

  try {
    const response = await fetch(
      "/api/users/search?username=" +
      encodeURIComponent(keyword),
      {
        headers: {
          "Authorization": "Bearer " + getToken()
        }
      }
    );

    const users = await response.json();

    if (!response.ok || !Array.isArray(users)) {
      throw new Error("User search failed");
    }

    const me = getCurrentUserId();

    const filteredUsers =
      users.filter(user =>
        String(user._id) !== String(me)
      );

    results.style.display = "block";

    if (!filteredUsers.length) {
      results.innerHTML = `
        <div class="search-empty">
          No BENEDICT users found.
        </div>
      `;
      return;
    }

    results.innerHTML = filteredUsers.map(user => {

      const name =
        user.fullName ||
        user.username ||
        "User";

      const avatar =
        user.profilePicture || "";

      return `
        <button
          class="people-result"
          data-user-id="${escapeHtml(user._id)}">

          ${
            avatar
              ? `<img
                   class="people-avatar"
                   src="${escapeHtml(avatar)}"
                   alt="${escapeHtml(name)}">`
              : `<div class="people-avatar people-placeholder">
                   👤
                 </div>`
          }

          <div class="people-info">
            <strong>
              ${escapeHtml(name)}
            </strong>

            <span>
              @${escapeHtml(user.username || "")}
            </span>
          </div>

          <span class="message-person">
            💬
          </span>

        </button>
      `;
    }).join("");

    results
      .querySelectorAll(".people-result")
      .forEach(button => {
        button.addEventListener("click", () => {
          openConversation(
            button.dataset.userId
          );
        });
      });

  } catch (error) {
    console.error(
      "People search error:",
      error
    );

    results.style.display = "block";
    results.innerHTML = `
      <div class="search-empty">
        Unable to search users.
      </div>
    `;
  }
}

function applySearch() {
  const input =
    document.getElementById("conversationSearch");

  const query =
    input.value.trim().toLowerCase();

  if (!query) {
    document.getElementById(
      "peopleSearchResults"
    ).style.display = "none";

    renderConversations(allConversations);
    return;
  }

  /*
   * Search BENEDICT users.
   * This allows messaging someone
   * even when no conversation exists.
   */
  clearTimeout(searchUsersTimer);

  searchUsersTimer = setTimeout(() => {
    searchPeople(query);
  }, 250);

  /*
   * Also filter existing conversations
   * immediately.
   */
  const filtered =
    allConversations.filter(conversation => {

      const user =
        conversation.user || {};

      const name =
        (user.fullName || "").toLowerCase();

      const username =
        (user.username || "").toLowerCase();

      const preview =
        getPreview(conversation).toLowerCase();

      return (
        name.includes(query) ||
        username.includes(query) ||
        preview.includes(query)
      );
    });

  renderConversations(filtered);
}

function refreshInboxForMessage(message) {
  if (!message) return;

  const me = getCurrentUserId();

  if (!me) return;

  const sender =
    typeof message.sender === "object"
      ? message.sender._id
      : message.sender;

  const receiver =
    typeof message.receiver === "object"
      ? message.receiver._id
      : message.receiver;

  if (
    String(sender) !== String(me) &&
    String(receiver) !== String(me)
  ) {
    return;
  }

  loadConversations();
}

function markOnlineUsers(users) {
  if (!Array.isArray(users)) return;

  const onlineSet =
    new Set(users.map(String));

  let changed = false;

  allConversations =
    allConversations.map(conversation => {

      const id =
        conversation.user?._id;

      const online =
        onlineSet.has(String(id));

      if (conversation.online !== online) {
        changed = true;
      }

      return {
        ...conversation,
        online
      };
    });

  if (changed) {
    applySearch();
  }
}

document
  .getElementById("conversationSearch")
  .addEventListener(
    "input",
    applySearch
  );

/*
 * Tell the server that this user is online.
 */
const currentUserId =
  getCurrentUserId();

if (currentUserId) {
  socket.emit(
    "userOnline",
    currentUserId
  );
}

/*
 * New message:
 * immediately refresh the inbox.
 */
socket.on(
  "newMessage",
  refreshInboxForMessage
);

/*
 * Online users changed:
 * update green online indicators.
 */
socket.on(
  "onlineUsers",
  markOnlineUsers
);

/*
 * Message seen:
 * refresh read/unread state.
 */
socket.on(
  "messageSeen",
  () => {
    loadConversations();
  }
);

/*
 * Deleted message:
 * refresh the conversation preview.
 */
socket.on(
  "messageDeleted",
  () => {
    loadConversations();
  }
);

window.addEventListener(
  "load",
  () => {
    loadConversations();

    /*
     * Safety fallback.
     * Socket.IO handles normal updates,
     * but this keeps the inbox synchronized
     * if a socket event is missed.
     */
    setInterval(
      loadConversations,
      30000
    );
  }
);
