function getToken() {
  return localStorage.getItem("token");
}

function loadFriends() {

  fetch("/api/friends", {
    headers: {
      "Authorization": "Bearer " + getToken()
    }
  })
  .then(res => res.json())
  .then(friends => {

    const box = document.getElementById("friends");
    box.innerHTML = "";

    if (!friends.length) {
      box.innerHTML = "<p>You don't have any friends yet.</p>";
      return;
    }

    friends.forEach(friend => {

      const user =
        friend.sender._id === JSON.parse(atob(getToken().split(".")[1])).id
          ? friend.receiver
          : friend.sender;

      box.innerHTML += `
        <div class="friend">

          ${
            user.profilePicture
              ? `<img src="${user.profilePicture}" alt="Profile Picture">`
              : ""
          }

          <h3>${user.fullName || user.username}</h3>

          <p>@${user.username}</p>

        </div>
      `;

    });

  })
  .catch(err => {
    console.error(err);
    document.getElementById("friends").innerHTML =
      "<p>Unable to load friends.</p>";
  });
}

window.onload = loadFriends;
