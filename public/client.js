const socket = io();
let roomId = null;
let localStream;
const peers = {};
const configuration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};
let videoEnabled = true;
let audioEnabled = true;

async function startMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    const videoContainer = document.createElement("div");
    videoContainer.className = "video-container";
    videoContainer.id = `video-${socket.id}`;

    const video = document.createElement("video");
    video.srcObject = localStream;
    video.muted = true; // Tắt tiếng local để tránh echo
    video.play();

    const label = document.createElement("span");
    label.className = "video-label";
    label.textContent = document.getElementById("user-name").value.trim();

    videoContainer.appendChild(video);
    videoContainer.appendChild(label);
    document.getElementById("video-grid").appendChild(videoContainer);
  } catch (err) {
    console.error("Error accessing media devices:", err);
    alert("Could not access camera/microphone. Please check permissions.");
  }
}

function createRoom() {
  const userName = document.getElementById("user-name").value.trim();
  roomId = document.getElementById("room-id").value.trim();
  if (userName && roomId) {
    socket.emit("createRoom", roomId, userName);
  } else {
    alert("Please enter both a username and a room ID");
  }
}

function joinRoom() {
  const userName = document.getElementById("user-name").value.trim();
  roomId = document.getElementById("room-id").value.trim();
  if (userName && roomId) {
    socket.emit("joinRoom", roomId, userName);
  } else {
    alert("Please enter both a username and a room ID");
  }
}

function leaveRoom() {
  socket.emit("leaveRoom");
  document.getElementById("room-screen").style.display = "none";
  document.getElementById("start-screen").style.display = "block";
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }
  document.getElementById("video-grid").innerHTML = "";
  document.getElementById("chat-messages").innerHTML = "";
  for (let peerId in peers) {
    peers[peerId].close();
    delete peers[peerId];
  }
}

function toggleVideo() {
  videoEnabled = !videoEnabled;
  localStream
    .getVideoTracks()
    .forEach((track) => (track.enabled = videoEnabled));
  document.getElementById("toggle-video").textContent = videoEnabled
    ? "Turn Off Video"
    : "Turn On Video";
}

function toggleAudio() {
  audioEnabled = !audioEnabled;
  localStream
    .getAudioTracks()
    .forEach((track) => (track.enabled = audioEnabled));
  document.getElementById("toggle-audio").textContent = audioEnabled
    ? "Mute Audio"
    : "Unmute Audio";
}

function sendMessage() {
  const input = document.getElementById("chat-input");
  const сообщение = input.value.trim();
  if (сообщение && roomId) {
    socket.emit("sendMessage", сообщение);
    input.value = "";
  }
}

document.getElementById("chat-input").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  }
});

socket.on("roomList", (roomList) => {
  const roomListEl = document.getElementById("room-list");
  roomListEl.innerHTML = "";
  roomList.forEach((room) => {
    const li = document.createElement("li");
    li.textContent = room;
    li.onclick = () => {
      document.getElementById("room-id").value = room;
    };
    roomListEl.appendChild(li);
  });
});

socket.on("joinedRoom", async (joinedRoomId, users) => {
  roomId = joinedRoomId;
  document.getElementById("start-screen").style.display = "none";
  document.getElementById("room-screen").style.display = "block";
  document.getElementById("current-room").textContent = roomId;
  updateUserList(users);
  await startMedia();
});

socket.on("userJoined", (users) => {
  updateUserList(users);
  for (let userId in users) {
    if (userId !== socket.id && !peers[userId]) {
      createPeerConnection(userId, true);
    }
  }
});

socket.on("error", (message) => {
  alert(message);
});

socket.on("receiveMessage", ({ userName, message }) => {
  const chatMessages = document.getElementById("chat-messages");
  const p = document.createElement("p");
  p.textContent = `${userName}: ${message}`;
  chatMessages.appendChild(p);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

function createPeerConnection(userId, isOfferer) {
  const peer = new RTCPeerConnection(configuration);
  peers[userId] = peer;

  localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));

  peer.ontrack = (event) => {
    const videoContainer = document.createElement("div");
    videoContainer.className = "video-container";
    videoContainer.id = `video-${userId}`;

    const video = document.createElement("video");
    video.srcObject = event.streams[0];
    video.play();

    const label = document.createElement("span");
    label.className = "video-label";
    label.textContent = peers[userId].userName || "Unknown"; // Lấy tên từ server

    videoContainer.appendChild(video);
    videoContainer.appendChild(label);
    document.getElementById("video-grid").appendChild(videoContainer);
  };

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", event.candidate, userId);
    }
  };

  if (isOfferer) {
    peer
      .createOffer()
      .then((offer) => peer.setLocalDescription(offer))
      .then(() => socket.emit("offer", peer.localDescription, userId));
  }

  peer.onconnectionstatechange = () => {
    if (peer.connectionState === "disconnected") {
      const videoContainer = document.getElementById(`video-${userId}`);
      if (videoContainer) videoContainer.remove();
      delete peers[userId];
    }
  };

  // Lưu tên người dùng vào peer để hiển thị
  peer.userName =
    Object.values(peers[userId]?.users || {}).find((u) => u.socketId === userId)
      ?.name || "Unknown";
}

socket.on("offer", (offer, fromId) => {
  createPeerConnection(fromId, false);
  peers[fromId]
    .setRemoteDescription(offer)
    .then(() => peers[fromId].createAnswer())
    .then((answer) => peers[fromId].setLocalDescription(answer))
    .then(() => socket.emit("answer", peers[fromId].localDescription, fromId));
});

socket.on("answer", (answer, fromId) => {
  peers[fromId].setRemoteDescription(answer);
});

socket.on("ice-candidate", (candidate, fromId) => {
  peers[fromId].addIceCandidate(candidate);
});

function updateUserList(users) {
  const userList = Object.values(users)
    .map((u) => u.name)
    .join(", ");
  document.getElementById("user-list").textContent = userList;

  // Cập nhật tên cho các peer hiện có
  for (let userId in peers) {
    peers[userId].userName = users[userId]?.name || "Unknown";
    const label = document.querySelector(`#video-${userId} .video-label`);
    if (label) label.textContent = peers[userId].userName;
  }
}
