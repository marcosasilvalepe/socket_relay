"use strict";

require('dotenv').config()

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const http = require('http');
const fs = require('node:fs/promises');
const path = require('path');


// Configuration
const PORT = process.env.PORT || 4250;
const JWT_SECRET = process.env.JWT_SECRET;

// Create HTTP server (required for Socket.IO but won't handle HTTP requests)
const server = http.createServer();

// Initialize Socket.IO server
const io = new Server(server, {
    cors: {
        origin: "*", // Configure this for production
        methods: ["GET", "POST"],
        credentials: true
    },
    //transports: ['websocket'], // Force WebSocket only (no polling)
    allowEIO3: true, // Enable compatibility
    //upgrade: true,
    //rememberUpgrade: true
});

// JWT Authentication middleware
io.use((socket, next) => {
    try {

        const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
        
        if (!token) return next(new Error('Authentication token required'));

        // Remove 'Bearer ' prefix if present
        const cleanToken = token.replace(/^Bearer\s+/, '');
        
        // Verify JWT token
        const decoded = jwt.verify(cleanToken, JWT_SECRET);
        
        // Attach user info to socket
        socket.userId = decoded.user.id;
        socket.username = decoded.user.name;

        console.log(`User ${decoded.user.name} (${decoded.user.id}) authenticated successfully`);
        next();
        
    }
    catch (error) {
        console.log('Authentication failed:', error.message);
        next(new Error('Invalid authentication token'));
    }
});

// Store pending relay requests
const pendingRelays = new Map();

// Helper function to find user by username
function findUserByUsername(username) {
    for (const [socketId, socket] of io.sockets.sockets) {
        if (socket.username === username) {
            return socket;
        }
    }
    return null;
}

// Clean up expired pending relays periodically
setInterval(() => {
    const now = Date.now();
    for (const [requestId, request] of pendingRelays) {
        if (now - request.timestamp > 60000) { // 1 minute expiry
            pendingRelays.delete(requestId);
            console.log(`Expired relay request ${requestId}`);
        }
    }
}, 30000); // Check every 30 seconds

// Handle client connections
io.on('connection', socket => {

    console.log(`Client connected: ${socket.username} (${socket.id})`);
    
    // Send welcome message
    socket.emit('authenticated', {
        message: 'Successfully authenticated',
        userId: socket.userId,
        username: socket.username
    });

    socket.on('stop server', () => {

        io.disconnectSockets();
        console.log('Stopping server...');
        server.close(async () => {
            
            try { await fs.appendFile(path.join(__dirname, 'log.txt'), `Server stopped - ${new Date().toLocaleString('es')}\n`) }
            catch(e) { console.log(`Error appending to file ${e}`) }

            console.log('Server stopped');
            process.exit(0);
        });
    });
    
    // Handle message relaying
    socket.on('relay message', (data, callback) => {
        try {

            console.log(`Relay message received from ${socket.username}:`, data);
            
            // Generate unique request ID
            const requestId = `relay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Store the callback and sender info for later use
            pendingRelays.set(requestId, {
                originalSender: socket.id,
                originalSenderUsername: socket.username,
                originalCallback: callback,
                timestamp: Date.now(),
                data: data
            });
            
            // Find ROMANA user (you might need to adjust this logic based on how you track users)
            const romanaSocket = findUserByUsername('Romana');
            
            if (!romanaSocket) {
                // ROMANA is not connected
                pendingRelays.delete(requestId);
                if (callback) {
                    callback({ 
                        success: false, 
                        error: 'ROMANA user is not connected' 
                    });
                }
                return;
            }
            
            const requestData = {
                requestId: requestId,
                from: {
                    userId: socket.userId,
                    username: socket.username
                },
                message: data
            };

            // Send message to ROMANA with request ID
            romanaSocket.emit('relay request', requestData, (romanaResponse) => {
                
                // This callback is executed when ROMANA responds
                //console.log(`ROMANA responded to request ${requestId}:`, romanaResponse);
                
                // Get the original request info
                const originalRequest = pendingRelays.get(requestId);
                
                if (originalRequest) {
                    // Send ROMANA's response back to the original sender
                    if (originalRequest.originalCallback) {
                        originalRequest.originalCallback({
                            success: true,
                            romanaResponse: romanaResponse
                        });
                    }
                    
                    // Clean up
                    pendingRelays.delete(requestId);
                    
                    console.log(`Relay completed for request ${requestId}`);
                }

                else console.error(`Original request ${requestId} not found in pending relays`);
            });
            
            // Set timeout for the relay request (optional)
            setTimeout(() => {
                if (pendingRelays.has(requestId)) {
                    const originalRequest = pendingRelays.get(requestId);
                    if (originalRequest && originalRequest.originalCallback) {
                        originalRequest.originalCallback({
                            success: false,
                            error: 'Relay request timed out',
                            requestId: requestId
                        });
                    }
                    pendingRelays.delete(requestId);
                    console.log(`Relay request ${requestId} timed out`);
                }
            }, 30000); // 30 second timeout
            
        } catch (error) {
            console.error('Error handling relay message:', error);
            if (callback) {
                callback({ 
                    success: false, 
                    error: 'Internal server error' 
                });
            }
        }
    });
    
    // Handle broadcast messages (to all connected users)
    socket.on('broadcast', (data, callback) => {
        try {
            const { message, type = 'broadcast' } = data;
            
            if (!message) {
                if (callback) callback({ error: 'Message is required' });
                return;
            }
            
            const broadcastObj = {
                from: {
                    userId: socket.userId,
                    username: socket.username
                },
                message,
                type,
                timestamp: new Date().toISOString()
            };
            
            // Broadcast to all connected clients except sender
            socket.broadcast.emit('broadcastReceived', broadcastObj);
            
            if (callback) {
                callback({ 
                    success: true, 
                    messageId: Date.now().toString(),
                    timestamp: broadcastObj.timestamp
                });
            }
            
            console.log(`Broadcast message from ${socket.username}`);
            
        }
        catch (error) {
            console.error('Error handling broadcast:', error);
            if (callback) callback({ error: 'Failed to broadcast message' });
        }
    });
    
    // Handle ping/pong for connection health
    socket.on('ping', (callback) => {
        if (callback) {
            callback({ 
                pong: true, 
                timestamp: new Date().toISOString(),
                userId: socket.userId
            });
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', (reason) => console.log(`Client disconnected: ${socket.username} (${socket.userId}) - Reason: ${reason}`) );
    
    // Handle connection errors
    socket.on('error', (error) => console.error(`Socket error for ${socket.username}:`, error) );
});

// Handle authentication errors
io.engine.on('connection_error', async (err) => {

    console.log('Connection error:', err.req);
    console.log('Error code:', err.code);
    console.log('Error message:', err.message);
    console.log('Error context:', err.context);

    try { await fs.appendFile(path.join(__dirname, 'log.txt'), `Connection error - ${new Date().toLocaleString('es')} - ${err.message}\n`) }
    catch(e) { console.log(`Error appending to file ${e}`) }

});

// Start the server
server.listen(PORT, async () => {
    
    console.log(`WebSocket server running on port ${PORT}`);
    console.log(`Server accepts WebSocket connections only`);
    console.log(`JWT authentication required for all connections`);

    try { await fs.appendFile(path.join(__dirname, 'log.txt'), `Server started - ${new Date().toLocaleString('es')}\n`) }
    catch(e) { console.log(`Error appending to file ${e}`) }

});

// Graceful shutdown
process.on('SIGINT', async () => {

    console.log('\nReceived SIGINT. Graceful shutdown...');
    io.disconnectSockets();

    try { await fs.appendFile(path.join(__dirname, 'log.txt'), `Server stopped - ${new Date().toLocaleString('es')}\n`) }
    catch(e) { console.log(`Error appending to file ${e}`) }

    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', async () => {

    console.log('\nReceived SIGTERM. Graceful shutdown...');
    io.disconnectSockets();

    try { await fs.appendFile(path.join(__dirname, 'log.txt'), `Server shutdown - ${new Date().toLocaleString('es')}\n`) }
    catch(e) { console.log(`Error appending to file ${e}`) }

    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});