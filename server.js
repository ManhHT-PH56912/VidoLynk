const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.emit("roomList", Object.keys(rooms));

  socket.on("createRoom", (roomId, userName) => {
    if (!roomId || !userName) {
      socket.emit("error", "Room ID and username are required");
      return;
    }
    if (rooms[roomId]) {
      socket.emit("error", `Room "${roomId}" already exists`);
      return;
    }
    rooms[roomId] = { users: {}, creator: socket.id };
    rooms[roomId].users[socket.id] = { name: userName, socketId: socket.id };
    socket.join(roomId);
    socket.roomId = roomId;
    io.emit("roomList", Object.keys(rooms));
    socket.emit("joinedRoom", roomId, rooms[roomId].users);
    console.log(`Room "${roomId}" created by ${userName}`);
  });

  socket.on("joinRoom", (roomId, userName) => {
    if (!roomId || !userName) {
      socket.emit("error", "Room ID and username are required");
      return;
    }
    if (!rooms[roomId]) {
      socket.emit("error", `Room "${roomId}" does not exist`);
      return;
    }
    rooms[roomId].users[socket.id] = { name: userName, socketId: socket.id };
    socket.join(roomId);
    socket.roomId = roomId;
    io.to(roomId).emit("userJoined", rooms[roomId].users);
    socket.emit("joinedRoom", roomId, rooms[roomId].users);
  });

  socket.on("leaveRoom", () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      delete rooms[roomId].users[socket.id];
      socket.leave(roomId);
      if (Object.keys(rooms[roomId].users).length === 0) {
        delete rooms[roomId];
      } else {
        io.to(roomId).emit("userJoined", rooms[roomId].users);
      }
      io.emit("roomList", Object.keys(rooms));
      socket.roomId = null;
    }
  });

  socket.on("sendMessage", (message) => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId] && rooms[roomId].users[socket.id]) {
      const userName = rooms[roomId].users[socket.id].name;
      io.to(roomId).emit("receiveMessage", { userName, message });
    }
  });

  socket.on("offer", (offer, targetId) => {
    io.to(targetId).emit("offer", offer, socket.id);
  });

  socket.on("answer", (answer, targetId) => {
    io.to(targetId).emit("answer", answer, socket.id);
  });

  socket.on("ice-candidate", (candidate, targetId) => {
    io.to(targetId).emit("ice-candidate", candidate, socket.id);
  });

  socket.on("disconnect", () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      delete rooms[roomId].users[socket.id];
      if (Object.keys(rooms[roomId].users).length === 0) {
        delete rooms[roomId];
      } else {
        io.to(roomId).emit("userJoined", rooms[roomId].users);
      }
      io.emit("roomList", Object.keys(rooms));
    }
    console.log("User disconnected:", socket.id);
  });
});

server.listen(3000, "0.0.0.0", () => {
  console.log("Server running on port 3000");
});
