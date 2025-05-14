LiveConnect WebSocket Signaling Update
This update replaces Firebase Firestore signaling with a custom WebSocket server for better performance and more control.

Key Changes
WebSocket Signaling: Replaced Firebase Firestore with a dedicated WebSocket server
Reduced Latency: Direct communication reduces signaling delay
Enhanced Control: Full control over the signaling protocol
Simplified Architecture: No more Firebase dependencies for signaling
Setup Instructions
1. Set up the WebSocket Server
Install Dependencies
bash
cd server
npm install
Configure Environment Variables
Create a .env file in the server directory based on the .env.example template:

bash
cp .env.example .env
Edit the .env file with your preferred settings.

Start the Server
bash
npm start
For development with auto-restart:

bash
npm run dev
2. Configure the Client
Update Environment Variables
Create a .env file in the root directory based on the .env.example template:

bash
cp .env.example .env
Edit the .env file:

You can leave REACT_APP_WS_SERVER blank to connect to the same host as the frontend
If hosting the WebSocket server separately, set REACT_APP_WS_SERVER to your server URL
Build and Run
bash
npm install
npm start
Deployment Options
Option 1: Single Server (Frontend + WebSocket)
Deploy the React application to your hosting service
Run the WebSocket server on the same machine (handle via process manager like PM2)
Option 2: Separate Servers
Deploy the React application to Firebase Hosting (or any other static hosting)
Deploy the WebSocket server to a separate VPS or cloud service
Set REACT_APP_WS_SERVER to point to your WebSocket server URL
Production Considerations
SSL/TLS: For production, ensure both the website and WebSocket server use HTTPS/WSS
Load Balancing: For high-traffic scenarios, consider load balancing across multiple WebSocket servers
Authentication: Add user authentication for secure room access
Scaling: Consider adding Redis for state management across multiple server instances
