const socket = io();
let roomId = null;
let localStream;
const peers = {};
const configuration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

async function startMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    const video = document.createElement("video");
    video.srcObject = localStream;
    video.muted = true;
    video.play();
    document.getElementById("video-grid").appendChild(video);
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
  for (let peerId in peers) {
    peers[peerId].close();
    delete peers[peerId];
  }
}

// Cập nhật danh sách phòng
socket.on("roomList", (roomList) => {
  const roomListEl = document.getElementById("room-list");
  roomListEl.innerHTML = "";
  roomList.forEach((room) => {
    const li = document.createElement("li");
    li.textContent = room;
    li.onclick = () => {
      document.getElementById("room-id").value = room; // Tự động điền room ID khi nhấp
    };
    roomListEl.appendChild(li);
  });
});

// Khi tham gia phòng thành công
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

function createPeerConnection(userId, isOfferer) {
  const peer = new RTCPeerConnection(configuration);
  peers[userId] = peer;

  localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));

  peer.ontrack = (event) => {
    const video = document.createElement("video");
    video.srcObject = event.streams[0];
    video.play();
    document.getElementById("video-grid").appendChild(video);
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
      delete peers[userId];
    }
  };
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
}
