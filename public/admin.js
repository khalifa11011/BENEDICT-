"use strict";

(() => {
  const $ = (selector) => document.querySelector(selector);
  const notice = $("#notice");
  const dashboard = $("#dashboard");
  const reportsList = $("#reportsList");
  const usersList = $("#usersList");

  let activeTab = "reports";

  function token() {
    return localStorage.getItem("token") || "";
  }

  function showNotice(message, type = "") {
    notice.textContent = message;
    notice.className = "notice" + (type ? " " + type : "");
    notice.hidden = false;
  }

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined && value !== null) {
      node.textContent = String(value);
    }
    return node;
  }

  function button(label, action, className = "secondary") {
    const node = element("button", className, label);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  }

  async function api(path, options = {}) {
    const headers = {
      Authorization: "Bearer " + token(),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    };

    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(data.message || "Administrator access denied. Please sign in with an authorized account.");
      }
      throw new Error(data.message || "Request failed (" + response.status + ").");
    }
    return data;
  }

  function friendlyReason(reason) {
    const labels = {
      spam: "Spam",
      harassment: "Harassment or bullying",
      hate_speech: "Hate speech",
      violence: "Violence",
      nudity: "Nudity or sexual content",
      impersonation: "Impersonation",
      scam: "Scam or fraud",
      other: "Other"
    };
    return labels[reason] || reason || "Unspecified";
  }

  function dateLabel(value) {
    if (!value) return "Date unavailable";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
  }

  function displayName(user) {
    if (!user) return "Unavailable account";
    return (user.fullName || user.username || "Unknown user") +
      (user.username ? " (@" + user.username + ")" : "");
  }

  function emptyMessage(container, message) {
    container.replaceChildren(element("div", "empty", message));
  }

  async function loadReports() {
    reportsList.replaceChildren(element("div", "empty", "Loading reports…"));
    try {
      const status = encodeURIComponent($("#reportFilter").value);
      const data = await api("/api/admin/reports?status=" + status + "&page=1&limit=50");
      reportsList.replaceChildren();

      if (!data.reports || !data.reports.length) {
        emptyMessage(reportsList, "No reports found for this filter.");
        return;
      }

      for (const report of data.reports) {
        reportsList.appendChild(renderReport(report));
      }
      showNotice("Loaded " + data.reports.length + " of " + data.total + " report(s).", "success");
    } catch (error) {
      emptyMessage(reportsList, error.message);
      showNotice(error.message, "error");
    }
  }

  function renderReport(report) {
    const card = element("article", "item");
    const heading = element("h3", "", friendlyReason(report.reason));
    const badge = element("span", "badge", report.status || "open");
    heading.append(" ", badge);
    card.appendChild(heading);

    card.appendChild(element("div", "meta",
      "Reported by: " + displayName(report.reporter)));
    card.appendChild(element("div", "meta",
      "Submitted: " + dateLabel(report.createdAt)));

    if (report.targetType === "post") {
      card.appendChild(element("h4", "", "Reported post"));
      const post = report.targetPost;
      if (post) {
        card.appendChild(element("div", "details",
          post.content || (post.image ? "[Post contains an image]" : "[Post has no text]")));
        card.appendChild(element("div", "meta",
          "Post author: " + displayName(post.user)));
      } else {
        card.appendChild(element("div", "details", "The reported post is no longer available."));
      }
    } else {
      card.appendChild(element("h4", "", "Reported account"));
      card.appendChild(element("div", "details", displayName(report.targetUser)));
      if (report.targetUser && report.targetUser.accountStatus) {
        card.appendChild(element("div", "meta",
          "Account status: " + report.targetUser.accountStatus));
      }
    }

    if (report.details) {
      card.appendChild(element("div", "details", "Report details:\n" + report.details));
    }

    if (report.reviewedBy) {
      card.appendChild(element("div", "meta",
        "Last reviewed by: " + displayName(report.reviewedBy) +
        (report.reviewedAt ? " · " + dateLabel(report.reviewedAt) : "")));
    }

    const actions = element("div", "actions");
    for (const status of ["reviewed", "resolved", "dismissed"]) {
      if (report.status === status) continue;
      actions.appendChild(button(
        status === "reviewed" ? "Mark Reviewed" :
          status === "resolved" ? "Resolve Report" : "Dismiss Report",
        () => updateReport(report._id, status),
        status === "dismissed" ? "danger" : "secondary"
      ));
    }

    if (report.targetType === "post" && report.targetPost && report.targetPost._id) {
      actions.appendChild(button("Remove Post", () => removePost(report), "danger"));
    }

    card.appendChild(actions);
    return card;
  }

  async function updateReport(id, status) {
    try {
      await api("/api/admin/reports/" + encodeURIComponent(id), {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      showNotice("Report updated.", "success");
      await loadReports();
    } catch (error) {
      showNotice(error.message, "error");
    }
  }

  async function removePost(report) {
    const post = report.targetPost;
    if (!post || !post._id) return;

    if (!confirm("Remove this post from BENEDICT? This action cannot be undone here.")) return;

    try {
      await api("/api/admin/posts/" + encodeURIComponent(post._id), { method: "DELETE" });
      showNotice("Post removed. Related open reports were resolved.", "success");
      await loadReports();
    } catch (error) {
      showNotice(error.message, "error");
    }
  }

  async function loadUsers() {
    usersList.replaceChildren(element("div", "empty", "Loading users…"));
    const query = $("#searchInput").value.trim();
    const params = new URLSearchParams({ page: "1", limit: "50" });
    if (query) params.set("search", query);

    try {
      const data = await api("/api/admin/users?" + params.toString());
      usersList.replaceChildren();

      if (!data.users || !data.users.length) {
        emptyMessage(usersList, "No users found.");
        return;
      }

      for (const user of data.users) {
        usersList.appendChild(renderUser(user));
      }
      showNotice("Loaded " + data.users.length + " of " + data.total + " account(s).", "success");
    } catch (error) {
      emptyMessage(usersList, error.message);
      showNotice(error.message, "error");
    }
  }

  function renderUser(user) {
    const card = element("article", "item");
    card.appendChild(element("h3", "", displayName(user)));
    card.appendChild(element("div", "meta", "Email: " + (user.email || "Not provided")));
    card.appendChild(element("div", "meta", "Role: " + (user.role || "user")));
    card.appendChild(element("div", "meta", "Joined: " + dateLabel(user.createdAt)));

    const status = element("span", "badge", user.accountStatus || "active");
    const statusLine = element("p");
    statusLine.append("Account status: ", status);
    card.appendChild(statusLine);

    const actions = element("div", "actions");
    const select = element("select");
    select.setAttribute("aria-label", "New account status for " + (user.username || "user"));

    for (const optionData of [
      ["active", "Active"],
      ["suspended", "Suspended"],
      ["banned", "Banned"]
    ]) {
      const option = element("option", "", optionData[1]);
      option.value = optionData[0];
      if ((user.accountStatus || "active") === option.value) option.selected = true;
      select.appendChild(option);
    }

    const save = button("Update Status", async () => {
      if (user.role === "admin") return;
      if (select.value === user.accountStatus) {
        showNotice("Choose a different status first.", "error");
        return;
      }
      if (!confirm("Change @" + (user.username || "user") +
          " account status to " + select.value + "?")) return;

      save.disabled = true;
      try {
        await api("/api/admin/users/" + encodeURIComponent(user._id) + "/status", {
          method: "PATCH",
          body: JSON.stringify({ status: select.value })
        });
        showNotice("Account status updated.", "success");
        await loadUsers();
      } catch (error) {
        showNotice(error.message, "error");
      } finally {
        save.disabled = false;
      }
    });

    if (user.role === "admin") {
      select.disabled = true;
      save.disabled = true;
      card.appendChild(element("div", "meta",
        "Administrator accounts cannot be changed through this screen."));
    }

    actions.append(select, save);
    card.appendChild(actions);
    return card;
  }

  function switchTab(tab) {
    activeTab = tab;
    $("#reportsSection").hidden = tab !== "reports";
    $("#usersSection").hidden = tab !== "users";

    document.querySelectorAll("[data-tab]").forEach((item) => {
      item.setAttribute("aria-selected", String(item.dataset.tab === tab));
    });

    if (tab === "reports") loadReports();
    else loadUsers();
  }

  document.querySelectorAll("[data-tab]").forEach((item) => {
    item.addEventListener("click", () => switchTab(item.dataset.tab));
  });

  $("#reportFilter").addEventListener("change", loadReports);
  $("#refreshReports").addEventListener("click", loadReports);
  $("#refreshUsers").addEventListener("click", loadUsers);
  $("#userSearch").addEventListener("submit", (event) => {
    event.preventDefault();
    loadUsers();
  });
  $("#backButton").addEventListener("click", () => {
    window.location.href = "/";
  });

  async function start() {
    if (!token()) {
      showNotice("You are not logged in. Sign in with your administrator account, then open this page again.", "error");
      return;
    }

    try {
      // The server decides whether the current account is an administrator.
      await api("/api/admin/users?page=1&limit=1");
      dashboard.hidden = false;
      showNotice("Administrator access verified.", "success");
      await loadReports();
    } catch (error) {
      showNotice(error.message, "error");
    }
  }

  start();
})();
