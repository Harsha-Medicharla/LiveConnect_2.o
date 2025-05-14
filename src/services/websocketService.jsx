import { v4 as uuidv4 } from 'uuid';

// WebRTC configuration
export const servers = {
  iceServers: [
    {
      urls: [
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

class WebSocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.roomListeners = new Map();
    this.candidateListeners = new Map();
    this.messageQueue = [];
    this.clientId = uuidv4(); // Generate a unique client ID
  }

  connect() {
    return new Promise((resolve, reject) => {
      // Use secure WebSocket if on HTTPS
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = process.env.REACT_APP_WS_SERVER || `${window.location.hostname}:8080`;
      const url = `${protocol}//${host}`;
      
      this.socket = new WebSocket(url);
      
      this.socket.onopen = () => {
        console.log('WebSocket connected');
        this.isConnected = true;
        
        // Send any queued messages
        while (this.messageQueue.length > 0) {
          const msg = this.messageQueue.shift();
          this.socket.send(JSON.stringify(msg));
        }
        
        // Send client ID to server
        this.socket.send(JSON.stringify({
          type: 'register',
          clientId: this.clientId
        }));
        
        resolve();
      };
      
      this.socket.onclose = () => {
        console.log('WebSocket disconnected');
        this.isConnected = false;
      };
      
      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
      
      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
    });
  }

  handleMessage(message) {
    console.log('Received message:', message);
    
    switch (message.type) {
      case 'room-created':
      case 'room-joined':
      case 'room-offer':
      case 'room-answer':
        // Handle room-related messages
        const roomCallback = this.roomListeners.get(message.roomId);
        if (roomCallback) {
          roomCallback(message);
        }
        break;
        
      case 'ice-candidate':
        // Handle ICE candidate messages
        const candidateCallback = this.candidateListeners.get(message.roomId);
        if (candidateCallback) {
          candidateCallback(message);
        }
        break;
        
      default:
        console.log('Unhandled message type:', message.type);
    }
  }

  send(message) {
    if (this.isConnected) {
      this.socket.send(JSON.stringify(message));
    } else {
      this.messageQueue.push(message);
    }
  }

  // Create a new room
  async createRoom(offer) {
    const roomId = uuidv4();
    
    return new Promise((resolve) => {
      // Set up a listener for this room
      this.roomListeners.set(roomId, (message) => {
        if (message.type === 'room-created') {
          resolve(roomId);
        }
      });
      
      // Send create room request
      this.send({
        type: 'create-room',
        roomId,
        clientId: this.clientId,
        offer
      });
    });
  }

  // Join an existing room
  async joinRoom(roomId, answer) {
    return new Promise((resolve, reject) => {
      // Set up a listener for this room
      this.roomListeners.set(roomId, (message) => {
        if (message.type === 'room-joined') {
          resolve();
        }
      });
      
      // Send join room request
      this.send({
        type: 'join-room',
        roomId,
        clientId: this.clientId,
        answer
      });
    });
  }

  // Get room offer (when joining)
  async getRoomOffer(roomId) {
    return new Promise((resolve, reject) => {
      // Update or create a listener for this room
      this.roomListeners.set(roomId, (message) => {
        if (message.type === 'room-offer') {
          resolve(message.offer);
        }
      });
      
      // Send get offer request
      this.send({
        type: 'get-room-offer',
        roomId,
        clientId: this.clientId
      });
    });
  }

  // Listen for answer (when creating)
  onRoomAnswer(roomId, callback) {
    // Set up a listener for answers to this room
    this.roomListeners.set(roomId, (message) => {
      if (message.type === 'room-answer') {
        callback(message.answer);
      }
    });
  }

  // Send ICE candidate
  sendIceCandidate(roomId, candidate, isCreator) {
    this.send({
      type: 'ice-candidate',
      roomId,
      clientId: this.clientId,
      candidate,
      isCreator
    });
  }

  // Listen for ICE candidates
  onIceCandidate(roomId, callback) {
    this.candidateListeners.set(roomId, (message) => {
      if (message.type === 'ice-candidate') {
        callback(message.candidate, message.isCreator);
      }
    });
  }

  // Clean up room resources
  async leaveRoom(roomId) {
    // Remove listeners
    this.roomListeners.delete(roomId);
    this.candidateListeners.delete(roomId);
    
    // Notify server
    this.send({
      type: 'leave-room',
      roomId,
      clientId: this.clientId
    });
  }

  // Close connection
  disconnect() {
    if (this.socket && this.isConnected) {
      this.socket.close();
      this.isConnected = false;
    }
  }
}

// Create singleton instance
const websocketService = new WebSocketService();
export default websocketService;
  