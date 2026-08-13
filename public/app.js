function normalizePostsResponse(data) {
  return Array.isArray(data) ? data : (data.posts || []);
}

const socket = io();

socket.on("newPost", () => {

  loadPosts();

});

let onlineUsers = [];

socket.on("onlineUsers", (users) => {

  onlineUsers = users;

});

function loadMyProfile() {

  const token = getToken();

  if (!token) return;

  const payload = JSON.parse(atob(token.split(".")[1]));

  fetch("/api/users/" + payload.id)
    .then(res => res.json())
    .then(data => {

      const user = data.user;

      document.getElementById("profile").innerHTML = `
        <h3>${user.fullName || user.username}</h3>
<p>@${user.username}</p>
<p>${user.bio || ""}</p>

<p>
<button onclick="showFollowers('${user._id}')">
👥 Followers (${followers})
</button>

<button onclick="showFollowing('${user._id}')">
➡ Following (${following})
</button>
</p>

<div id="followList"></div>

<button onclick="followUser('${user._id}')">
➕ Follow
</button>
      `;

    })
    .catch(err => {
      console.error(err);
    });

}

function getToken() {
  return localStorage.getItem("token");
}

function openUserProfile(userId) {
  if (!userId || userId === "undefined" || userId === "null") {
    console.error("Invalid profile user ID:", userId);
    return;
  }

  const profileUrl =
    "/profile.html?id=" + encodeURIComponent(String(userId));

  console.log("Opening profile:", profileUrl);

  window.location.assign(profileUrl);
}

function followUser(userId) {

  fetch("/api/users/" + userId + "/follow", {
    method: "PUT",
    headers: {
      "Authorization": "Bearer " + getToken()
    }
  })
  .then(res => res.json())
  .then(data => {

    if (data.error) {
      alert(data.error);
      return;
    }

    alert(data.message);

    loadProfile(userId);

  })
  .catch(err => {
    console.error(err);
    alert("Follow failed");
  });

}

function showFollowers(userId) {

  fetch("/api/users/" + userId)
    .then(res => res.json())
    .then(data => {

      const box = document.getElementById("followList");

      box.innerHTML =
        "<h4>Followers</h4>" +
        (data.user.followers.length
          ? data.user.followers.map(user => `
              <div>
                👤 ${user.fullName || user.username}
                (@${user.username})
              </div>
            `).join("")
          : "<p>No followers yet.</p>");

    })
    .catch(err => {
      console.error(err);
    });

}

function showFollowing(userId) {

  fetch("/api/users/" + userId)
    .then(res => res.json())
    .then(data => {

      const box = document.getElementById("followList");

      box.innerHTML =
        "<h4>Following</h4>" +
        (data.user.following.length
          ? data.user.following.map(user => `
              <div>
                👤 ${user.fullName || user.username}
                (@${user.username})
              </div>
            `).join("")
          : "<p>Not following anyone yet.</p>");

    })
    .catch(err => {
      console.error(err);
    });

}

function setLoginPageUI(isLogin) {
  document.body.classList.toggle("login-screen", isLogin);

  const mainNav = document.getElementById("mainNav");
  const mobileNav = document.querySelector(".mobile-bottom-nav");

  if (isLogin) {
    if (mainNav) mainNav.style.display = "none";
    if (mobileNav) mobileNav.style.display = "none";
  } else {
    if (mainNav) mainNav.style.display = "flex";
    if (mobileNav) mobileNav.style.display = "grid";
  }
}

function login() {

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    alert("Please enter your email and password.");
    return;
  }

  const loginLoading = document.getElementById("loginLoading");
  const loadingText = loginLoading
    ? loginLoading.querySelector(".login-loading-text")
    : null;

  if (loadingText) {
    loadingText.textContent = "Login...";
  }

  if (loginLoading) {
    loginLoading.classList.add("show");
  }

  fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      password
    })
  })
  .then(res => res.json())
  .then(data => {

    if (!data.token) {
      if (loginLoading) {
        loginLoading.classList.remove("show");
      }

      alert("Wrong email or password");
      return;
    }

    localStorage.setItem("token", data.token);

    const payload = JSON.parse(atob(data.token.split(".")[1]));

    socket.emit("userOnline", payload.id);

    const loginPanel = document.getElementById("loginPanel");
    const appSection = document.getElementById("appSection");
    const homePanel = document.getElementById("homePanel");
    const sidePanel = document.getElementById("sidePanel");
    const mainNav = document.getElementById("mainNav");

    setTimeout(function () {

      if (loginLoading) {
        loginLoading.classList.remove("show");
      }

      if (loginPanel) loginPanel.style.display = "none";
      if (appSection) appSection.style.display = "block";
      if (homePanel) homePanel.style.display = "block";
      if (sidePanel) sidePanel.style.display = "none";
      setLoginPageUI(false);

      loadPosts();
      loadMyProfile();
      loadNotifications();

    }, 4000);

  })
  .catch(err => {

    console.error(err);

    if (loginLoading) {
      loginLoading.classList.remove("show");
    }

    alert("Wrong email or password");

  });

}
function logout() {

  localStorage.removeItem("token");

  document.getElementById("posts").innerHTML = "";
  document.getElementById("profile").innerHTML = "";
  document.getElementById("notifications").innerHTML = "";
  document.getElementById("searchResults").innerHTML = "";

  alert("Logged out");

}

function loadMyProfile() {

  const token = getToken();

  if (!token) return;

  const payload = JSON.parse(atob(token.split(".")[1]));

  fetch("/api/users/" + payload.id)
    .then(res => res.json())
    .then(data => {

      const user = data.user;

      document.getElementById("profile").innerHTML = `
        ${user.profilePicture ? `<img src="${user.profilePicture}?t=${Date.now()}" width="120">` : ""}
        <h3>${user.fullName || user.username}</h3>
        <p>@${user.username}</p>
        <p>${user.bio || ""}</p>
      `;

      document.getElementById("editFullName").value = user.fullName || "";
      document.getElementById("editBio").value = user.bio || "";

    })
    .catch(err => {
      console.error(err);
    });
}

function loadProfile(id) {

  const token = getToken();

  if (!token) {
    alert("Please login first.");
    return;
  }

  let currentUserId = null;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    currentUserId = payload.id;
  } catch (err) {
    console.error("Invalid token:", err);
  }

  fetch("/api/users/" + id)
    .then(res => {
      if (!res.ok) {
        throw new Error("Profile not found");
      }
      return res.json();
    })
    .then(data => {

      const user = data.user;

      if (!user) {
        throw new Error("Profile not found");
      }

      const followers =
        user.followers ? user.followers.length : 0;

      const following =
        user.following ? user.following.length : 0;

      const isMe =
        String(currentUserId) === String(user._id);

      const isFollowing =
        user.followers &&
        user.followers.some(follower =>
          String(follower._id || follower) === String(currentUserId)
        );

      let followButton = "";

      if (!isMe) {

        followButton = isFollowing

          ? `
            <button
              class="profile-follow-btn following"
              onclick="followUser('${user._id}')">
              ✓ Following
            </button>
          `

          : `
            <button
              class="profile-follow-btn"
              onclick="followUser('${user._id}')">
              ➕ Follow
            </button>
          `;
      }

      document.getElementById("profile").innerHTML = `

        <div class="profile-view-card">

          ${
            user.profilePicture
            ? `
              <img
                class="profile-view-avatar"
                src="${user.profilePicture}?t=${Date.now()}">
            `
            : `
              <div class="profile-view-avatar profile-view-placeholder">
                👤
              </div>
            `
          }

          <h2 class="profile-view-name">
            ${user.fullName || user.username}
          </h2>

          <p class="profile-view-username">
            @${user.username}
          </p>

          ${
            user.bio
            ? `<p class="profile-view-bio">${user.bio}</p>`
            : ""
          }

          <div class="profile-view-stats">

            <div>
              <strong>${followers}</strong>
              <span>Followers</span>
            </div>

            <div>
              <strong>${following}</strong>
              <span>Following</span>
            </div>

          </div>

          <div class="profile-view-actions">

            ${followButton}

            <button
              class="profile-friends-btn"
              onclick="window.location.href='/friends.html'">
              👥 Friends
            </button>

          </div>

          <div class="profile-view-posts">

            <h3>Posts</h3>

            ${
              data.posts && data.posts.length

              ? data.posts.map(post => `

                <article class="profile-view-post">

                  ${
                    post.content
                    ? `<p>${post.content}</p>`
                    : ""
                  }

                  ${
                    post.image
                    ? `<img src="${post.image}">`
                    : ""
                  }

                </article>

              `).join("")

              : "<p>No posts yet.</p>"
            }

          </div>

        </div>

      `;

    })

    .catch(err => {

      console.error(err);

      const box = document.getElementById("profile");

      if (box) {
        box.innerHTML =
          "<p>Failed to load profile.</p>";
      }

    });

}

function createPost() {

  const token = getToken();

  if (!token) {
    alert("Please login first.");
    return;
  }

  const content = document.getElementById("content").value.trim();
  const image = document.getElementById("image").files[0];

  if (!content && !image) {
    alert("Please write something or choose an image.");
    return;
  }

  const formData = new FormData();

  formData.append("content", content);

  if (image) {
    formData.append("image", image);
  }

  fetch("/api/posts", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token
    },
    body: formData
  })
  .then(res => res.json())
  .then(() => {

    document.getElementById("content").value = "";
    document.getElementById("image").value = "";

    loadPosts();

  })
  .catch(err => {
    console.error(err);
    alert("Post failed.");
  });

}

function togglePostMenu(postId) {

  const menu = document.getElementById("post-menu-" + postId);

  if (!menu) return;

  document.querySelectorAll(".benedict-post-popup").forEach(item => {
    if (item !== menu) {
      item.style.display = "none";
    }
  });

  menu.style.display =
    menu.style.display === "none" ? "block" : "none";
}


document.addEventListener("click", function(event) {

  if (
    !event.target.closest(".benedict-post-menu") &&
    !event.target.closest(".benedict-post-popup")
  ) {
    document.querySelectorAll(".benedict-post-popup").forEach(menu => {
      menu.style.display = "none";
    });
  }

});


function loadPosts() {

  const token = getToken();

  if (!token) return;

  fetch("/api/posts", {
    headers: {
      "Authorization": "Bearer " + token
    }
  })
  .then(res => res.json())
  .then(posts => {

    discoveryPosts = posts;

    const box = document.getElementById("posts");
    box.innerHTML = "";

    posts.forEach(post => {

      box.innerHTML += `
      <div class="post">

        <div class="benedict-post-header">

          <div
            class="benedict-post-avatar"
            onclick="openUserProfile('${post.user?._id || post.user}')"
            style="cursor:pointer;">
            ${
              post.user && post.user.profilePicture
                ? `<img src="${escapeHtml(post.user.profilePicture)}" alt="">`
                : `<span>${escapeHtml(
                    ((post.user && (post.user.fullName || post.user.username)) || "B")
                      .charAt(0)
                      .toUpperCase()
                  )}</span>`
            }
          </div>

          <div
            class="benedict-post-identity"
            onclick="openUserProfile('${post.user?._id || post.user}')"
            style="cursor:pointer;">
            <strong>
              ${escapeHtml(
                (post.user && (post.user.fullName || post.user.username)) || "BENEDICT User"
              )}
              <span class="benedict-identity-mark">✦</span>
            </strong>

            <div class="benedict-post-meta">
              @${escapeHtml((post.user && post.user.username) || "user")}
              <span>·</span>
              ${post.createdAt
                ? new Date(post.createdAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit"
                  })
                : "Just now"}
            </div>
          </div>

          <button
            class="benedict-post-menu"
            type="button"
            aria-label="Post options"
            onclick="togglePostMenu('${post._id}')">
            ⋯
          </button>

          <div
            id="post-menu-${post._id}"
            class="benedict-post-popup"
            style="display:none;">
            ${
              String(post.user?._id || post.user) === String(currentUserId)
                ? `
                  <button onclick="editPost('${post._id}', \`${post.content || ""}\`)">
                    ✏️ Edit Post
                  </button>
                  <button onclick="deletePost('${post._id}')">
                    🗑️ Delete Post
                  </button>
                `
                : `
                  <button onclick="openUserProfile('${post.user?._id || post.user}')">
                    👤 View Profile
                  </button>
                  <button onclick="followUser('${post.user?._id || post.user}')">
                    ➕ Follow
                  </button>
                  <button onclick="alert('Report feature coming soon.')">
                    🚩 Report Post
                  </button>
                `
            }
          </div>

        </div>

        <p>${escapeHtml(post.content || "")}</p>

        ${post.image ? `<img src="${post.image}" alt="Post Image">` : ""}

        <p>
❤️ ${post.reactions ? post.reactions.filter(r => r.type === "like").length : 0}
😍 ${post.reactions ? post.reactions.filter(r => r.type === "love").length : 0}
😂 ${post.reactions ? post.reactions.filter(r => r.type === "haha").length : 0}
😮 ${post.reactions ? post.reactions.filter(r => r.type === "wow").length : 0}
😢 ${post.reactions ? post.reactions.filter(r => r.type === "sad").length : 0}
😡 ${post.reactions ? post.reactions.filter(r => r.type === "angry").length : 0}
</p>

<button onclick="showLikes('${post._id}')">
👥 View Likes
</button>

<div id="likes-${post._id}"></div>

<div class="reactions">

<button onclick="reactPost('${post._id}','like')">
❤️ Like
</button>

<button onclick="reactPost('${post._id}','love')">
😍 Love
</button>

<button onclick="reactPost('${post._id}','haha')">
😂 Haha
</button>

<button onclick="reactPost('${post._id}','wow')">
😮 Wow
</button>

<button onclick="reactPost('${post._id}','sad')">
😢 Sad
</button>

<button onclick="reactPost('${post._id}','angry')">
😡 Angry
</button>

</div>


        <div id="comments-${post._id}">
          <p>Loading comments...</p>
        </div>

        <input
          id="comment-${post._id}"
          placeholder="Write a comment...">


        <button onclick="addComment('${post._id}')">
  💬 Comment
</button>

<button onclick="sharePost('${post._id}')">
  ↗ Share
</button>

${
  String(post.user?._id || post.user) === String(currentUserId)
    ? `
      <button onclick="editPost('${post._id}', \`${post.content || ""}\`)">
        ✏️ Edit
      </button>

      <button onclick="deletePost('${post._id}')">
        🗑 Delete
      </button>
    `
    : `
      <button onclick="openUserProfile('${post.user?._id || post.user}')">
        👤 View Profile
      </button>

      <button onclick="followUser('${post.user?._id || post.user}')">
        ➕ Follow
      </button>
    `
}

      </div>
      `;

      loadComments(post._id);

    });

    if (currentDiscoveryTab === "news") {
      loadRealNews("news");
    } else if (currentDiscoveryTab === "entertainment") {
      loadRealNews("entertainment");
    } else {
      renderDiscoveryPosts();
    }

  })
  .catch(err => {
    console.error(err);
    document.getElementById("posts").innerHTML =
      "<p>Unable to load posts.</p>";
  });

}


let discoveryPosts = [];
let currentDiscoveryTab = "news";

function switchDiscovery(tab, button) {
  currentDiscoveryTab = tab;

  document.querySelectorAll(".discovery-tab").forEach(btn => {
    btn.classList.remove("active");
  });

  if (button) {
    button.classList.add("active");
  }

  renderDiscoveryPosts();
}


async function loadRealNews(type) {

  const box = document.getElementById("posts");

  if (!box) return;

  const title = type === "news" ? "News" : "Entertainment";

  box.innerHTML = `
    <div class="card discovery-empty">
      <h3>Loading ${title}...</h3>
      <p>Getting the latest stories...</p>
    </div>
  `;

  try {
    const response = await fetch("/api/news/" + type);
    const articles = await response.json();

    if (!response.ok) {
      throw new Error(articles.error || "Unable to load stories");
    }

    if (!articles.length) {
      box.innerHTML = `
        <div class="card discovery-empty">
          <h3>No ${title} stories available</h3>
          <p>Please try again later.</p>
        </div>
      `;
      return;
    }

    box.innerHTML = articles.map(article => `
      <article class="post news-article">

        ${article.image ? `
          <img
            src="${escapeHtml(article.image)}"
            alt=""
            class="news-article-image"
            loading="lazy"
          >
        ` : ""}

        <div class="news-article-content">

          <div class="news-source">
            ${escapeHtml(article.source || "News")}
          </div>

          <h2>${escapeHtml(article.title || "")}</h2>

          <p>${escapeHtml(article.description || "")}</p>

          <small>
            ${article.publishedAt
              ? new Date(article.publishedAt).toLocaleString()
              : ""}
          </small>

          <a
            href="${escapeHtml(article.url || "#")}"
            target="_blank"
            rel="noopener noreferrer"
            class="news-read-button"
          >
            Read article →
          </a>

        </div>

      </article>
    `).join("");

  } catch (error) {

    console.error("Real news error:", error);

    box.innerHTML = `
      <div class="card discovery-empty">
        <h3>Unable to load ${title}</h3>
        <p>Please try again in a moment.</p>
      </div>
    `;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderDiscoveryPosts() {

  const box = document.getElementById("posts");

  if (!box) return;

  let posts = [...discoveryPosts];

  if (currentDiscoveryTab === "news") {

    posts = posts.filter(post => {

      const text = (post.content || "").toLowerCase();

      return /news|politics|government|president|election|breaking|update|report/.test(text);

    });

  }

  if (currentDiscoveryTab === "entertainment") {

    posts = posts.filter(post => {

      const text = (post.content || "").toLowerCase();

      return /music|movie|film|actor|actress|celebrity|entertainment|artist|concert|fashion|tv|show/.test(text);

    });

  }

  if (currentDiscoveryTab === "trending") {

    posts.sort((a, b) => {

      const aCount = a.reactions ? a.reactions.length : 0;
      const bCount = b.reactions ? b.reactions.length : 0;

      return bCount - aCount;

    });

  }

  box.innerHTML = "";

  if (!posts.length) {

    box.innerHTML = `
      <div class="benedict-empty-state">
        <div class="empty-icon">✦</div>
        <h3>Nothing here yet</h3>
        <p>
          There are no ${currentDiscoveryTab === "for-you"
            ? ""
            : currentDiscoveryTab + " "}posts to show right now.
        </p>
      </div>
    `;

    return;

  }

  posts.forEach(post => {

    const user = post.user || {};

    const username = escapeHtml(
      user.username || "BENEDICT User"
    );

    const fullName = escapeHtml(
      user.fullName || user.username || "BENEDICT User"
    );

    const avatar = user.profilePicture
      ? `<img
          src="${escapeHtml(user.profilePicture)}"
          alt=""
          class="benedict-post-avatar"
          loading="lazy"
        >`
      : `<div class="benedict-post-avatar avatar-placeholder">✦</div>`;

    const content = escapeHtml(post.content || "");

    const image = post.image
      ? `
        <div class="benedict-post-media">
          <img
            src="${escapeHtml(post.image)}"
            alt="Post Image"
            loading="lazy"
          >
        </div>
      `
      : "";

    const reactions = post.reactions || [];

    const likeCount = reactions.filter(
      r => r.type === "like"
    ).length;

    const loveCount = reactions.filter(
      r => r.type === "love"
    ).length;

    const hahaCount = reactions.filter(
      r => r.type === "haha"
    ).length;

    const wowCount = reactions.filter(
      r => r.type === "wow"
    ).length;

    const sadCount = reactions.filter(
      r => r.type === "sad"
    ).length;

    const angryCount = reactions.filter(
      r => r.type === "angry"
    ).length;

    const totalReactions = reactions.length;

    const reactionSummary = totalReactions
      ? `
        <div class="benedict-reaction-summary">

          <span class="reaction-icons">
            ${likeCount ? "❤️" : ""}
            ${loveCount ? "😍" : ""}
            ${hahaCount ? "😂" : ""}
            ${wowCount ? "😮" : ""}
            ${sadCount ? "😢" : ""}
            ${angryCount ? "😡" : ""}
          </span>

          <span>${totalReactions}</span>

        </div>
      `
      : `
        <div class="benedict-reaction-summary empty">
          Be the first to react
        </div>
      `;

    box.innerHTML += `

      <article class="post benedict-post">

        <div class="benedict-post-header">

          <div
            class="benedict-author"
            onclick="openUserProfile('${post.user?._id || post.user}')"
            style="cursor:pointer;">

            ${avatar}

            <div class="benedict-author-info">

              <strong>${fullName}</strong>

              <span>
                @${username}
              </span>

            </div>

          </div>

          <button
            class="post-more-button"
            aria-label="Post options">
            ⋯
          </button>

        </div>


        ${content ? `
          <div class="benedict-post-text">
            ${content}
          </div>
        ` : ""}


        ${image}


        <div class="benedict-post-stats">

          ${reactionSummary}

          <div class="benedict-stat-links">

            <span onclick="document.getElementById('comments-${post._id}')?.scrollIntoView({behavior:'smooth'})">
              Comments
            </span>

            <span>
              Share
            </span>

          </div>

        </div>


        <div class="benedict-post-actions">

          <button onclick="reactPost('${post._id}','like')">
            ❤️
            <span>Like</span>
          </button>

          <button onclick="document.getElementById('comment-${post._id}')?.focus()">
            💬
            <span>Comment</span>
          </button>

          <button onclick="sharePost('${post._id}')">
            ↗
            <span>Share</span>
          </button>

        </div>


        <div class="benedict-reaction-picker">

          <button onclick="reactPost('${post._id}','like')">
            ❤️
          </button>

          <button onclick="reactPost('${post._id}','love')">
            😍
          </button>

          <button onclick="reactPost('${post._id}','haha')">
            😂
          </button>

          <button onclick="reactPost('${post._id}','wow')">
            😮
          </button>

          <button onclick="reactPost('${post._id}','sad')">
            😢
          </button>

          <button onclick="reactPost('${post._id}','angry')">
            😡
          </button>

        </div>


        <div class="benedict-post-details">

          <button
            class="view-likes-button"
            onclick="showLikes('${post._id}')">
            👥 View ${totalReactions} reactions
          </button>

          <div id="likes-${post._id}"></div>

        </div>


        <div
          id="comments-${post._id}"
          class="benedict-comments">
          <p>Loading comments...</p>
        </div>


        <div class="benedict-comment-box">

          <input
            id="comment-${post._id}"
            placeholder="Write a comment..."
          >

          <button
            onclick="addComment('${post._id}')">
            ➤
          </button>

        </div>


        <div class="benedict-post-owner-tools">

          <button
            onclick="editPost('${post._id}', \`${content}\`)">
            ✏️ Edit
          </button>

          <button
            onclick="deletePost('${post._id}')">
            🗑 Delete
          </button>

        </div>

      </article>

    `;

    loadComments(post._id);

  });

}

function likePost(postId) {

  fetch("/api/posts/" + postId + "/react", {
    method: "PUT",
    headers: {
      "Authorization": "Bearer " + getToken(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      type: "like"
    })
  })
  .then(res => res.json())
  .then(data => {

    if (data.error) {
      alert(data.error);
      return;
    }

    loadPosts();

  })
  .catch(err => {
    console.error(err);
    alert("Failed to like post.");
  });

}

function unlikePost(postId) {

  fetch("/api/posts/" + postId + "/remove-reaction", {
    method: "PUT",
    headers: {
      "Authorization": "Bearer " + getToken()
    }
  })
  .then(res => res.json())
  .then(data => {

    if (data.error) {
      alert(data.error);
      return;
    }

    loadPosts();

  })
  .catch(err => {
    console.error(err);
    alert("Failed to unlike post.");
  });

}

function sharePost(postId) {

  fetch("/api/posts/" + postId + "/share", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + getToken()
    }
  })
  .then(res => res.json())
  .then(data => {

    if (data.error) {
      alert(data.error);
      return;
    }

    alert("Post shared successfully!");

    loadPosts();

  })
  .catch(err => {
    console.error(err);
    alert("Failed to share post.");
  });

}

function loadNotifications() {

  const token = getToken();

  if (!token) return;

  fetch("/api/notifications", {
    headers: {
      "Authorization": "Bearer " + token
    }
  })

  .then(res => res.json())
  .then(data => {

    const box = document.getElementById("notifications");
    box.innerHTML = "";

    if (!Array.isArray(data) || data.length === 0) {
      box.innerHTML = "<p>No notifications.</p>";
      return;
    }

    data.forEach(note => {

      box.innerHTML += "<div class='post'>" +
                 "<p>" + note.message + "</p>" +
                 "</div>";

    });

  })
  .catch(() => {

    document.getElementById("notifications").innerHTML =
      "<p>Unable to load notifications.</p>";

  });

}

function searchUsers() {

  const token = getToken();

  if (!token) {
    alert("Please login first.");
    return;
  }

  const username =
    document.getElementById("searchUser").value.trim();

  fetch("/api/users/search?username=" + encodeURIComponent(username), {
  headers: {
    "Authorization": "Bearer " + token
  }
})

  .then(res => res.json())
  .then(users => {

    const results = document.getElementById("searchResults");
    results.innerHTML = "";

    if (!users.length) {
      results.innerHTML = "<p>No users found.</p>";
      return;
    }

    users.forEach(user => {

      results.innerHTML += `
      <div class="result">

        <strong>
${onlineUsers.includes(user._id) ? "🟢" : "⚪"}
${user.username}
</strong><br>
        ${user.email}<br><br>

        <button onclick="loadProfile('${user._id}')">
          👤 View Profile
        </button>

        <button onclick="window.location.href='/chat.html?user=${user._id}'">
          💬 Message
        </button>

      </div>
      <br>
      `;

    });

  })
  .catch(() => {
    alert("Search failed.");
  });

 }

  window.onload = function() {


  if (getToken()) {
    loadPosts();
    loadMyProfile();
  } else {
  }

};

function loadComments(postId) {

  fetch("/api/comments/" + postId)
    .then(res => res.json())
    .then(comments => {

      const box = document.getElementById("comments-" + postId);

      if (!box) return;

      box.innerHTML = "";

      comments.forEach(comment => {

        box.innerHTML += `
          <p><strong>${comment.user.username}</strong>: ${comment.text}</p>
        `;

      });

    })
    .catch(console.error);

}


function addComment(postId) {

  const input = document.getElementById("comment-" + postId);
  const text = input.value.trim();

  if (!text) {
    alert("Please enter a comment.");
    return;
  }

  fetch("/api/comments/" + postId, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + getToken()
    },
    body: JSON.stringify({ text })
  })
  .then(res => res.json())
  .then(() => {

    input.value = "";
    loadComments(postId);

  })
  .catch(console.error);

}

function sendFriendRequest(userId) {
  const token = getToken();

  fetch("/api/friends/request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    body: JSON.stringify({
      receiver: userId
    })
  })
  .then(res => res.json())
  .then(data => {
    alert(data.message);
  })
  .catch(err => console.error(err));
}

async function uploadStory() {

  const token = getToken();

  if (!token) {
    alert("Please login first.");
    return;
  }

  const file = document.getElementById("storyMedia").files[0];

  if (!file) {
    alert("Please select an image or video.");
    return;
  }

  const formData = new FormData();
  formData.append("media", file);

  try {

    const res = await fetch("/api/stories", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token
      },
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message);
      return;
    }

    alert("Story uploaded successfully!");

    document.getElementById("storyMedia").value = "";

    loadStories();

  } catch (err) {
    console.error(err);
    alert("Unable to upload story.");
  }

}

async function loadStories() {

  try {

    const res = await fetch("/api/stories");
    const stories = await res.json();

    const box = document.getElementById("stories");

    if (!stories.length) {
      box.innerHTML = "<p>No stories yet.</p>";
      return;
    }

    box.innerHTML = "";

    stories.forEach(story => {

      box.innerHTML += `
        <div class="story" onclick="viewStory('${story.media}', '${story.mediaType}')">

          <strong>${story.user.username}</strong><br>

          ${
            story.mediaType === "video"
            ? `<video src="${story.media}" controls width="180"></video>`
            : `<img src="${story.media}" width="180">`
          }

        </div>
      `;

    });

  } catch (err) {
    console.error(err);
  }

}

loadStories();

function viewStory(media, mediaType) {

  const viewer = document.getElementById("storyViewer");
  const content = document.getElementById("storyContent");

  if (mediaType === "video") {
    content.innerHTML =
      `<video src="${media}" controls autoplay></video>`;
  } else {
    content.innerHTML =
      `<img src="${media}">`;
  }

  viewer.style.display = "flex";
}

function closeStory() {
  document.getElementById("storyViewer").style.display = "none";
  document.getElementById("storyContent").innerHTML = "";
}

function showLikes(postId) {

  fetch("/api/posts/" + postId + "/likes")
    .then(res => res.json())
    .then(data => {

      const box = document.getElementById("likes-" + postId);

      if (!data.likes || data.likes.length === 0) {
        box.innerHTML = "<p>No likes yet.</p>";
        return;
      }

      box.innerHTML = "<p>Liked by:</p>";

      data.likes.forEach(user => {
        box.innerHTML += `
          <p>👤 ${user.fullName || user.username}</p>
        `;
      });

    })
    .catch(err => {
      console.error(err);
    });

}

function updateProfile() {

  const fullName = document.getElementById("editFullName").value;
  const bio = document.getElementById("editBio").value;

  fetch("/api/profile/update", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + getToken()
    },
    body: JSON.stringify({
      fullName,
      bio
    })
  })
  .then(res => res.json())
  .then(data => {

    alert(data.message);

    loadMyProfile();

  })
  .catch(err => {
    console.error(err);
    alert("Profile update failed");
  });

}

function uploadProfilePicture() {

  const file = document.getElementById("profilePicture").files[0];

  if (!file) {
    alert("Please choose a picture first.");
    return;
  }

  const formData = new FormData();
  formData.append("profilePicture", file);

  fetch("/api/profile/upload", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + getToken()
    },
    body: formData
  })
  .then(res => res.json())
  .then(data => {

    if (data.error) {
      alert(data.error);
      return;
    }

    alert(data.message);
    loadMyProfile();

  })
  .catch(err => {
    console.error(err);
    alert("Profile picture upload failed.");
  });

}

function editPost(postId, currentContent) {

  const newContent = prompt("Edit your post:", currentContent);

  if (newContent === null) return;

  fetch("/api/posts/" + postId, {
    method: "PUT",
    headers: {
      "Authorization": "Bearer " + getToken(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content: newContent
    })
  })
  .then(res => res.json())
  .then(data => {

    if (data.error) {
      alert(data.error);
      return;
    }

    alert("Post updated successfully");
    loadPosts();

  })
  .catch(err => {
    console.error(err);
    alert("Failed to update post.");
  });

}

function deletePost(postId) {

  if (!confirm("Delete this post?")) return;

  fetch("/api/posts/" + postId, {
    method: "DELETE",
    headers: {
      "Authorization": "Bearer " + getToken()
    }
  })
  .then(res => res.json())
  .then(data => {

    if (data.error) {
      alert(data.error);
      return;
    }

    alert("Post deleted successfully");
    loadPosts();

  })
  .catch(err => {
    console.error(err);
    alert("Failed to delete post.");
  });

}

function reactPost(postId, type) {

  fetch("/api/posts/" + postId + "/react", {
    method: "PUT",
    headers: {
      "Authorization": "Bearer " + getToken(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      type: type
    })
  })
  .then(res => res.json())
  .then(data => {

    if (data.error) {
      alert(data.error);
      return;
    }

    loadPosts();

  })
  .catch(err => {
    console.error(err);
    alert("Failed to add reaction.");
  });

}


/* =========================
   RESTORE LOGIN ON REFRESH
========================= */

function restoreSession() {

  const token = getToken();

  const loginPanel = document.getElementById("loginPanel");
  const appSection = document.getElementById("appSection");
  const homePanel = document.getElementById("homePanel");
  const sidePanel = document.getElementById("sidePanel");
  const mainNav = document.getElementById("mainNav");
  const mobileNav = document.querySelector(".mobile-bottom-nav");

  /* No saved login */
  if (!token) {

    if (loginPanel) loginPanel.style.display = "block";
    if (appSection) appSection.style.display = "none";
    setLoginPageUI(true);

    return;
  }

  try {

    const payload = JSON.parse(atob(token.split(".")[1]));

    /* Check token expiration */
    if (payload.exp && payload.exp * 1000 < Date.now()) {

      localStorage.removeItem("token");

      if (loginPanel) loginPanel.style.display = "block";
      if (appSection) appSection.style.display = "none";
      setLoginPageUI(true);

      return;
    }

    /* Restore the application immediately */
    if (loginPanel) loginPanel.style.display = "none";
    if (appSection) appSection.style.display = "block";
    if (homePanel) homePanel.style.display = "block";
    if (sidePanel) sidePanel.style.display = "none";
    setLoginPageUI(false);

    socket.emit("userOnline", payload.id);

    /* Load fresh content */
    loadPosts();
    loadMyProfile();
    loadNotifications();

  } catch (error) {

    console.error("Invalid saved session:", error);

    localStorage.removeItem("token");

    if (loginPanel) loginPanel.style.display = "block";
    if (appSection) appSection.style.display = "none";
    setLoginPageUI(true);

  }

}


/* Run when the page finishes loading */
window.addEventListener("load", function () {

  restoreSession();

});
