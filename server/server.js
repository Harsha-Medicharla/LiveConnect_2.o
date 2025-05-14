const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Create HTTP server
const server = http.createServer();

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Server state
const rooms = new Map();
const clients = new Map();

// Helper function to send a message to a specific client
function sendToClient(clientId, message) {
  const client = clients.get(clientId);
  if (client && client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
  } else {
    console.log(`Client ${clientId} not found or not connected`);
  }
}

// Helper function to broadcast to all clients in a room except the sender
function broadcastToRoom(roomId, message, excludeClientId) {
  const room = rooms.get(roomId);
  if (room) {
    room.clients.forEach(clientId => {
      if (clientId !== excludeClientId) {
        sendToClient(clientId, message);
      }
    });
  }
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Client connected');
  
  let clientId = null;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received:', data);
      
      switch (data.type) {
        case 'register':
          // Register client
          clientId = data.clientId;
          clients.set(clientId, { ws, rooms: [] });
          console.log(`Client registered: ${clientId}`);
          break;
          
        case 'create-room':
          // Create a new room
          const roomId = data.roomId;
          rooms.set(roomId, {
            id: roomId,
            creator: clientId,
            offer: data.offer,
            clients: [clientId]
          });
          
          // Add room to client's rooms
          const clientRooms = clients.get(clientId).rooms;
          clientRooms.push(roomId);
          
          // Confirm room creation
          sendToClient(clientId, {
            type: 'room-created',
            roomId
          });
          
          console.log(`Room created: ${roomId} by ${clientId}`);
          break;
          
        case 'get-room-offer':
          // Send room offer to client
          const room = rooms.get(data.roomId);
          if (room) {
            sendToClient(clientId, {
              type: 'room-offer',
              roomId: data.roomId,
              offer: room.offer
            });
          } else {
            sendToClient(clientId, {
              type: 'error',
              message: 'Room not found'
            });
          }
          break;
          
        case 'join-room':
          // Join existing room
          const joinRoom = rooms.get(data.roomId);
          if (joinRoom) {
            // Add client to room
            joinRoom.clients.push(clientId);
            joinRoom.answer = data.answer;
            
            // Add room to client's rooms
            const clientRooms = clients.get(clientId).rooms;
            clientRooms.push(data.roomId);
            
            // Notify room creator
            sendToClient(joinRoom.creator, {
              type: 'room-answer',
              roomId: data.roomId,
              answer: data.answer
            });
            
            // Confirm room joined
            sendToClient(clientId, {
              type: 'room-joined',
              roomId: data.roomId
            });
            
            console.log(`Client ${clientId} joined room ${data.roomId}`);
          } else {
            sendToClient(clientId, {
              type: 'error',
              message: 'Room not found'
            });
          }
          break;
          
        case 'ice-candidate':
          // Forward ICE candidate to other peers in the room
          broadcastToRoom(data.roomId, {
            type: 'ice-candidate',
            roomId: data.roomId,
            candidate: data.candidate,
            isCreator: data.isCreator
          }, clientId);
          break;
          
        case 'leave-room':
          // Leave room
          const leaveRoom = rooms.get(data.roomId);
          if (leaveRoom) {
            // Remove client from room
            const index = leaveRoom.clients.indexOf(clientId);
            if (index !== -1) {
              leaveRoom.clients.splice(index, 1);
            }
            
            // Remove room from client's rooms
            const clientRooms = clients.get(clientId).rooms;
            const roomIndex = clientRooms.indexOf(data.roomId);
            if (roomIndex !== -1) {
              clientRooms.splice(roomIndex, 1);
            }
            
            // If room is empty, delete it
            if (leaveRoom.clients.length === 0) {
              rooms.delete(data.roomId);
              console.log(`Room ${data.roomId} deleted (empty)`);
            } else {
              // Notify remaining clients
              broadcastToRoom(data.roomId, {
                type: 'peer-left',
                roomId: data.roomId,
                clientId
              }, clientId);
            }
            
            console.log(`Client ${clientId} left room ${data.roomId}`);
          }
          break;
          
        default:
          console.log(`Unhandled message type: ${data.type}`);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log(`Client disconnected: ${clientId}`);
    
    if (clientId) {
      // Get client's rooms
      const client = clients.get(clientId);
      if (client) {
        // Leave all rooms
        [...client.rooms].forEach(roomId => {
          const room = rooms.get(roomId);
          if (room) {
            // Remove client from room
            const index = room.clients.indexOf(clientId);
            if (index !== -1) {
              room.clients.splice(index, 1);
            }
            
            // If room is empty, delete it
            if (room.clients.length === 0) {
              rooms.delete(roomId);
              console.log(`Room ${roomId} deleted (empty)`);
            } else {
              // Notify remaining clients
              broadcastToRoom(roomId, {
                type: 'peer-left',
                roomId,
                clientId
              }, clientId);
            }
          }
        });
        
        // Remove client
        clients.delete(clientId);
      }
    }
  });
});

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`WebSocket server is running on port ${PORT}`);
});