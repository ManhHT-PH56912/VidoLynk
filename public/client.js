const socket = io();
let roomId = null;
let localStream;
const peers = {};
const configuration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};
let videoEnabled = true;
let audioEnabled = true;
let audioAnalysers = {};

async function startMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    const videoContainer = createVideoContainer(
      socket.id,
      document.getElementById("user-name").value.trim()
    );
    const video = videoContainer.querySelector("video");
    video.srcObject = localStream;
    video.muted = true;
    video.play();
    document.getElementById("video-grid").appendChild(videoContainer);
    setupAudioAnalyser(socket.id, localStream);
  } catch (err) {
    console.error("Error accessing media devices:", err);
    alert("Could not access camera/microphone. Please check permissions.");
  }
}

function createVideoContainer(userId, userName) {
  const videoContainer = document.createElement("div");
  videoContainer.className = "video-container";
  videoContainer.id = `video-${userId}`;

  const video = document.createElement("video");
  videoContainer.appendChild(video);

  const label = document.createElement("span");
  label.className = "video-label";
  label.textContent = userName;
  videoContainer.appendChild(label);

  const waveform = document.createElement("div");
  waveform.className = "waveform";
  for (let i = 0; i < 4; i++) {
    const bar = document.createElement("div");
    bar.className = "wave-bar";
    waveform.appendChild(bar);
  }
  videoContainer.appendChild(waveform);

  return videoContainer;
}

function setupAudioAnalyser(userId, stream) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);

  audioAnalysers[userId] = { analyser, audioContext };

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  function updateWaveform() {
    analyser.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    const waveform = document.querySelector(`#video-${userId} .waveform`);
    if (waveform) {
      if (average > 10) {
        waveform.classList.add("active");
      } else {
        waveform.classList.remove("active");
      }
    }
    requestAnimationFrame(updateWaveform);
  }
  updateWaveform();
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
  for (let userId in audioAnalysers) {
    audioAnalysers[userId].audioContext.close();
    delete audioAnalysers[userId];
  }
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

function toggleChat() {
  const chatPopup = document.getElementById("chat-popup");
  chatPopup.style.display =
    chatPopup.style.display === "none" ? "flex" : "none";
}

function sendMessage() {
  const input = document.getElementById("chat-input");
  const message = input.value.trim();
  if (message && roomId) {
    socket.emit("sendMessage", message);
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
    const existingContainer = document.getElementById(`video-${userId}`);
    if (!existingContainer) {
      const videoContainer = createVideoContainer(
        userId,
        peers[userId].userName
      );
      const video = videoContainer.querySelector("video");
      video.srcObject = event.streams[0];
      video.play();
      document.getElementById("video-grid").appendChild(videoContainer);
      setupAudioAnalyser(userId, event.streams[0]);
    }
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
      if (audioAnalysers[userId]) {
        audioAnalysers[userId].audioContext.close();
        delete audioAnalysers[userId];
      }
      delete peers[userId];
    }
  };

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

  for (let userId in peers) {
    peers[userId].userName = users[userId]?.name || "Unknown";
    const label = document.querySelector(`#video-${userId} .video-label`);
    if (label) label.textContent = peers[userId].userName;
  }
}
