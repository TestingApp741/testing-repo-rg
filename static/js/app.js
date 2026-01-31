const state = {
  user: null,
  rides: [],
  myDriver: [],
  myPassenger: [],
};

const el = (id) => document.getElementById(id);

const toast = el("toast");

const showToast = (message, isError = false) => {
  toast.textContent = message;
  toast.style.borderColor = isError ? "#f87171" : "rgba(255,255,255,0.1)";
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
};

const api = async (path, options = {}) => {
  const opts = {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options,
  };
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) {
    const error = data?.error || "request_failed";
    throw new Error(error);
  }
  return data;
};

const updateProfile = () => {
  const pill = el("profilePill");
  const name = el("profileName");
  if (state.user) {
    pill.classList.add("active");
    name.textContent = state.user.name || state.user.email;
    el("authBox").classList.add("hidden");
  } else {
    pill.classList.remove("active");
    name.textContent = "Guest";
    el("authBox").classList.remove("hidden");
  }
};

const setTab = (tab) => {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  el("loginForm").classList.toggle("hidden", tab !== "login");
  el("signupForm").classList.toggle("hidden", tab !== "signup");
  el("authHint").textContent =
    tab === "login" ? "Welcome back. Ready to ride?" : "Create a profile in seconds.";
};

const renderRides = () => {
  const list = el("ridesList");
  list.innerHTML = "";
  const joinedIds = new Set(state.myPassenger.map((r) => r.id));

  state.rides.forEach((ride) => {
    const card = document.createElement("div");
    card.className = "ride-card";
    const price = ride.price ? `$${ride.price.toFixed(2)}` : "Free";
    const seats = `${ride.seats_available}/${ride.seats_total} seats`;
    const isDriver = state.user && ride.driver_id === state.user.id;
    const isJoined = joinedIds.has(ride.id);

    card.innerHTML = `
      <div class="title">
        <strong>${ride.origin} ➜ ${ride.destination}</strong>
        <span class="chip">${price}</span>
      </div>
      <div class="meta">${ride.date} · ${ride.time} · ${seats}</div>
      <div class="meta">${ride.notes || "No extra notes"}</div>
      <div class="actions"></div>
    `;

    const actions = card.querySelector(".actions");
    if (state.user && !isDriver && ride.seats_available > 0 && !isJoined) {
      const joinBtn = document.createElement("button");
      joinBtn.textContent = "Join ride";
      joinBtn.onclick = () => handleJoin(ride.id);
      actions.appendChild(joinBtn);
    }
    if (state.user && isJoined) {
      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "Cancel seat";
      cancelBtn.onclick = () => handleCancel(ride.id);
      actions.appendChild(cancelBtn);
    }
    if (state.user && isDriver) {
      const driverBtn = document.createElement("button");
      driverBtn.textContent = "Your ride";
      driverBtn.disabled = true;
      actions.appendChild(driverBtn);
    }
    list.appendChild(card);
  });
};

const renderMyRides = () => {
  const list = el("myRides");
  list.innerHTML = "";

  const makeCard = (ride, role) => {
    const card = document.createElement("div");
    card.className = "ride-card";
    const price = ride.price ? `$${ride.price.toFixed(2)}` : "Free";
    card.innerHTML = `
      <div class="title">
        <strong>${ride.origin} ➜ ${ride.destination}</strong>
        <span class="chip">${role}</span>
      </div>
      <div class="meta">${ride.date} · ${ride.time} · ${price}</div>
      <div class="actions"></div>
    `;
    const actions = card.querySelector(".actions");
    if (role === "Driver") {
      const del = document.createElement("button");
      del.textContent = "Delete ride";
      del.onclick = () => handleDelete(ride.id);
      actions.appendChild(del);
    } else {
      const cancel = document.createElement("button");
      cancel.textContent = "Cancel seat";
      cancel.onclick = () => handleCancel(ride.id);
      actions.appendChild(cancel);
    }
    return card;
  };

  if (!state.user) {
    list.innerHTML = "<p class=\"meta\">Sign in to see your rides.</p>";
    return;
  }

  [...state.myDriver].forEach((ride) => list.appendChild(makeCard(ride, "Driver")));
  [...state.myPassenger].forEach((ride) => list.appendChild(makeCard(ride, "Passenger")));

  if (!state.myDriver.length && !state.myPassenger.length) {
    list.innerHTML = "<p class=\"meta\">No rides yet. Create or join one!</p>";
  }
};

const updateStats = () => {
  el("statRides").textContent = state.rides.length;
  const seats = state.rides.reduce((sum, r) => sum + (r.seats_available || 0), 0);
  el("statSeats").textContent = seats;
  const drivers = new Set(state.rides.map((r) => r.driver_id)).size;
  el("statDrivers").textContent = drivers;
};

const loadRides = async () => {
  const params = new URLSearchParams();
  const search = el("searchInput").value.trim();
  const origin = el("originInput").value.trim();
  const destination = el("destinationInput").value.trim();
  const date = el("dateInput").value;
  if (search) params.set("search", search);
  if (origin) params.set("origin", origin);
  if (destination) params.set("destination", destination);
  if (date) params.set("date", date);

  const res = await api(`/api/rides?${params.toString()}`);
  state.rides = res.rides;
  updateStats();
  renderRides();
};

const loadMyRides = async () => {
  if (!state.user) {
    state.myDriver = [];
    state.myPassenger = [];
    renderMyRides();
    return;
  }
  const res = await api("/api/my/rides");
  state.myDriver = res.driver;
  state.myPassenger = res.passenger;
  renderMyRides();
  renderRides();
};

const refreshAll = async () => {
  await loadRides();
  await loadMyRides();
};

const handleJoin = async (rideId) => {
  try {
    await api(`/api/rides/${rideId}/join`, { method: "POST" });
    showToast("Seat reserved!");
    await refreshAll();
  } catch (err) {
    showToast(err.message.replace(/_/g, " "), true);
  }
};

const handleCancel = async (rideId) => {
  try {
    await api(`/api/rides/${rideId}/cancel`, { method: "POST" });
    showToast("Booking cancelled.");
    await refreshAll();
  } catch (err) {
    showToast(err.message.replace(/_/g, " "), true);
  }
};

const handleDelete = async (rideId) => {
  try {
    await api(`/api/rides/${rideId}`, { method: "DELETE" });
    showToast("Ride deleted.");
    await refreshAll();
  } catch (err) {
    showToast(err.message.replace(/_/g, " "), true);
  }
};

const bindEvents = () => {
  el("openAuth").onclick = () => document.getElementById("app").scrollIntoView({ behavior: "smooth" });
  el("openApp").onclick = () => document.getElementById("app").scrollIntoView({ behavior: "smooth" });
  el("heroLaunch").onclick = () => document.getElementById("app").scrollIntoView({ behavior: "smooth" });
  el("heroDemo").onclick = () => document.getElementById("features").scrollIntoView({ behavior: "smooth" });

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });

  el("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      const res = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      state.user = res.user;
      updateProfile();
      showToast("Welcome back!");
      await refreshAll();
    } catch (err) {
      showToast("Login failed: " + err.message.replace(/_/g, " "), true);
    }
  });

  el("signupForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      const res = await api("/api/signup", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      state.user = res.user;
      updateProfile();
      showToast("Account created!", false);
      await refreshAll();
    } catch (err) {
      showToast("Signup failed: " + err.message.replace(/_/g, " "), true);
    }
  });

  el("logoutBtn").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    state.user = null;
    updateProfile();
    await refreshAll();
  });

  el("filterBtn").addEventListener("click", refreshAll);

  el("createRideBtn").addEventListener("click", () => {
    if (!state.user) {
      showToast("Please sign in to create a ride.", true);
      return;
    }
    el("rideModal").classList.remove("hidden");
  });

  el("closeModal").addEventListener("click", () => {
    el("rideModal").classList.add("hidden");
  });

  el("rideForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      await api("/api/rides", {
        method: "POST",
        body: JSON.stringify({
          origin: form.get("origin"),
          destination: form.get("destination"),
          date: form.get("date"),
          time: form.get("time"),
          seats: form.get("seats"),
          price: form.get("price"),
          notes: form.get("notes"),
        }),
      });
      showToast("Ride published!");
      el("rideModal").classList.add("hidden");
      event.target.reset();
      await refreshAll();
    } catch (err) {
      showToast("Could not create ride: " + err.message.replace(/_/g, " "), true);
    }
  });
};

const init = async () => {
  bindEvents();
  try {
    const res = await api("/api/me");
    state.user = res.user;
  } catch (_) {
    state.user = null;
  }
  updateProfile();
  await refreshAll();
};

init();
