function getToken() {
  return localStorage.getItem("token");
}

function loadRequests() {
  fetch("/api/friends/requests", {
    headers: {
      "Authorization": "Bearer " + getToken()
    }
  })
  .then(res => res.json())
  .then(requests => {
    const box = document.getElementById("requests");

    if (!Array.isArray(requests) || requests.length === 0) {
      box.innerHTML = `
        <div class="empty">
          No pending friend requests.
        </div>
      `;
      return;
    }

    box.innerHTML = "";

    requests.forEach(request => {
      const sender = request.sender || {};

      const avatar = sender.profilePicture
        ? sender.profilePicture
        : "https://via.placeholder.com/100";

      box.innerHTML += `
        <div class="request">

          <img
            class="avatar"
            src="${avatar}"
            alt="Profile"
            onerror="this.src='https://via.placeholder.com/100'"
          >

          <div class="info">
            <h3>${sender.username || "Unknown user"}</h3>
            <p>${sender.email || ""}</p>
          </div>

          <div class="actions">

            <button
              class="accept"
              onclick="acceptRequest('${request._id}')">
              ✓ Accept
            </button>

            <button
              class="reject"
              onclick="rejectRequest('${request._id}')">
              ✕ Reject
            </button>

          </div>

        </div>
      `;
    });
  })
  .catch(err => {
    console.error("Requests error:", err);

    document.getElementById("requests").innerHTML = `
      <div class="empty">
        Unable to load friend requests.
      </div>
    `;
  });
}


function loadFriends() {
  fetch("/api/friends", {
    headers: {
      "Authorization": "Bearer " + getToken()
    }
  })
  .then(res => res.json())
  .then(friendships => {

    const box = document.getElementById("friends");

    if (!Array.isArray(friendships) || friendships.length === 0) {
      box.innerHTML = `
        <div class="empty">
          You don't have any friends yet.
        </div>
      `;
      return;
    }

    box.innerHTML = "";

    const currentUserId = getCurrentUserId();

    friendships.forEach(friendship => {

      const sender = friendship.sender || {};
      const receiver = friendship.receiver || {};

      let friend;

      if (sender._id === currentUserId) {
        friend = receiver;
      } else {
        friend = sender;
      }

      const avatar = friend.profilePicture
        ? friend.profilePicture
        : "https://via.placeholder.com/100";

      box.innerHTML += `
        <div class="friend">

          <img
            class="avatar"
            src="${avatar}"
            alt="Profile"
            onerror="this.src='https://via.placeholder.com/100'"
          >

          <div class="info">
            <h3>${friend.username || "Unknown user"}</h3>
            <p>${friend.fullName || "BENEDICT friend"}</p>
          </div>

          <div class="actions">

            <button
              class="message"
              onclick="openChat('${friend._id}')">
              💬 Message
            </button>

          </div>

        </div>
      `;
    });

  })
  .catch(err => {
    console.error("Friends error:", err);

    document.getElementById("friends").innerHTML = `
      <div class="empty">
        Unable to load friends.
      </div>
    `;
  });
}


function getCurrentUserId() {
  try {
    const token = getToken();

    if (!token) return null;

    const payload = JSON.parse(
      atob(token.split(".")[1])
    );

    return payload.id || payload._id || payload.userId;

  } catch (err) {
    console.error("Unable to read user ID:", err);
    return null;
  }
}


function openChat(userId) {
  if (!userId) return;

  window.location.href =
    "/chat.html?user=" + encodeURIComponent(userId);
}


function acceptRequest(id) {

  fetch("/api/friends/accept/" + id, {
    method: "PUT",
    headers: {
      "Authorization": "Bearer " + getToken()
    }
  })
  .then(res => res.json())
  .then(data => {

    alert(data.message);

    loadRequests();
    loadFriends();

  })
  .catch(err => {
    console.error("Accept error:", err);
    alert("Unable to accept friend request.");
  });

}


function rejectRequest(id) {

  fetch("/api/friends/reject/" + id, {
    method: "PUT",
    headers: {
      "Authorization": "Bearer " + getToken()
    }
  })
  .then(res => res.json())
  .then(data => {

    alert(data.message);

    loadRequests();

  })
  .catch(err => {
    console.error("Reject error:", err);
    alert("Unable to reject friend request.");
  });

}


function loadFriendsPage() {
  if (!getToken()) {
    alert("Please login first.");
    window.location.href = "/";
    return;
  }

  loadRequests();
  loadFriends();
}


window.onload = loadFriendsPage;
