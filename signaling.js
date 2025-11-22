const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});
/**
 * In-memory store for application state.
 * In a production environment, you would replace this with a database like Redis.
 */
const state = {
  // A list of inspection requests waiting for an agent.
  pendingRequests: [],
  // A map of online agents.
  onlineAgents: new Map(), // Key: agentId, Value: socket.id
};
io.on('connection', (socket) => {
  console.log("✅ Client connected:", socket.id);

  // === Agent-specific Events ===

  socket.on('agent_online', (data) => {
    socket.isAgent = true;
    state.onlineAgents.set(data.agentId, socket.id);
    console.log(`Agent ${data.agentId} is online. Total agents: ${state.onlineAgents.size}`);
  });

  socket.on('get_pending_requests', () => {
    // Send the list of pending requests to the agent who just came online.
    socket.emit('pending_requests', state.pendingRequests);
    console.log(`Sent ${state.pendingRequests.length} pending requests to ${socket.id}`);
  });

  socket.on('request_accepted', (data) => {
    const { roomId } = data;
    console.log(`Request for room ${roomId} was accepted by agent ${socket.id}`);

    // Remove the request from the pending list.
    state.pendingRequests = state.pendingRequests.filter(req => req.roomId !== roomId);

    // Notify all other agents to remove this request from their UI.
    socket.broadcast.emit('request_removed', { roomId });
  });


  // === Customer-specific Events ===

  socket.on('new_inspection_request', (request) => {
    console.log(`New inspection request for room: ${request.roomId}`);
    // Add to our list of pending requests.
    state.pendingRequests.push(request);
    // Broadcast the new request to all connected clients (agents will listen).
    io.emit('new_inspection_request', request);
  });


  // === Room-based and WebRTC Events ===

  socket.on('join_room', (data) => {
    const { roomId } = data;
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });

  // Relays the signal to the other peer in the same room.
  socket.on('signal', (data) => {
    const { roomId } = data;
    // Emit only to other clients in the same room.
    socket.to(roomId).emit('signal', data);
    const signalType = data.offer ? 'Offer' : data.answer ? 'Answer' : 'Candidate';
    console.log(`📡 Relaying ${signalType} to room ${roomId}`);
  });

  // Relays the message to start the customer's stream.
  socket.on('start_customer_stream', (data) => {
    const { roomId } = data;
    console.log(`Agent requested customer to start stream in room ${roomId}`);
    socket.to(roomId).emit('start_customer_stream');
  });

  // Relays a request from the agent to the customer to swap their camera.
  socket.on('swap_camera_request', (data) => {
    const { roomId } = data;
    console.log(`Agent requested camera swap in room ${roomId}`);
    socket.to(roomId).emit('swap_camera_request');
  });

  // Relays call status changes (e.g., complete, failed, exited).
  socket.on('call_status', (data) => {
    const { roomId, status } = data;
    console.log(`Call status in room ${roomId} changed to: ${status}`);
    socket.to(roomId).emit('call_status', { status });
  });

  // Relays mute status.
  socket.on('mute_status', (data) => {
    const { roomId, muted } = data;
    socket.to(roomId).emit('mute_status', { muted });
  });


  // === Disconnect Logic ===

  socket.on('disconnect', (reason) => {
    console.log(`❌ Client disconnected: ${socket.id}. Reason: ${reason}`);
    // If the disconnected client was an agent, remove them from the online list.
    for (const [agentId, socketId] of state.onlineAgents.entries()) {
      if (socketId === socket.id) {
        state.onlineAgents.delete(agentId);
        console.log(`Agent ${agentId} went offline. Total agents: ${state.onlineAgents.size}`);
        break;
      }
    }
  });
});

server.listen(3001, () => {
  console.log("✅ Signaling server running at http://localhost:3001");
});
