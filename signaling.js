const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

const agentDisconnectTimeouts = new Map();

io.on('connection', (socket) => {
  console.log("✅ Client connected:", socket.id);

  socket.on('agent_online', (data) => {
    const { agentId } = data;
    socket.agentId = agentId; // Attach agentId to the socket session
    console.log(`Agent ${agentId} is online with socket ${socket.id}`);

    // If there was a pending disconnect for this agent, cancel it
    if (agentDisconnectTimeouts.has(agentId)) {
      console.log(`Agent ${agentId} reconnected in time. Cancelling disconnect notice.`);
      clearTimeout(agentDisconnectTimeouts.get(agentId));
      agentDisconnectTimeouts.delete(agentId);
    }
  });

  socket.on('signal', (data) => {
    console.log(`📡 Signal received from ${socket.id}:`, data.offer ? 'Offer' : data.answer ? 'Answer' : 'Candidate');
    socket.broadcast.emit('signal', data);
  });

  socket.on('disconnect', () => {
    console.log("❌ Client disconnected:", socket.id);
    if (socket.agentId) {
      console.log(`Agent ${socket.agentId} disconnected. Starting 3-second timer for reconnection.`);
      const timeout = setTimeout(() => {
        console.log(`Agent ${socket.agentId} did not reconnect. Notifying peer.`);
        socket.broadcast.emit('peer_disconnected');
        agentDisconnectTimeouts.delete(socket.agentId);
      }, 3000);
      agentDisconnectTimeouts.set(socket.agentId, timeout);
    } else {
      // If it's a client without an agentId, notify immediately.
      socket.broadcast.emit('peer_disconnected');
    }
  });
});

server.listen(8081, () => {
  console.log("✅ Signaling server running at http://localhost:8081");
});
