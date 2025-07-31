// ============================================
// JWT TOKEN GENERATOR
// ============================================

const jwt = require('jsonwebtoken');

// Configuration (should match your server)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

/**
 * Generate JWT token for a user
 * @param {Object} userData - User information
 * @returns {string} JWT token
 */
function generateJWT(userData) {
    const payload = {
        userId: userData.userId,
        username: userData.username,
        role: userData.role || 'user',
        email: userData.email,
        // Add any other user data you need
    };
    
    const options = {
        expiresIn: '24h', // Token expires in 24 hours
        issuer: 'your-app-name',
        audience: 'websocket-server'
    };
    
    return jwt.sign(payload, JWT_SECRET, options);
}

/**
 * Verify JWT token (for testing purposes)
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 */
function verifyJWT(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        throw new Error('Invalid token: ' + error.message);
    }
}

// ============================================
// EXAMPLE: Generate tokens for test users
// ============================================

const testUsers = [
    {
        userId: '123',
        username: 'john_doe',
        email: 'john@example.com',
        role: 'user'
    },
    {
        userId: '456',
        username: 'jane_smith',
        email: 'jane@example.com',
        role: 'admin'
    },
    {
        userId: '789',
        username: 'bob_wilson',
        email: 'bob@example.com',
        role: 'user'
    }
];

console.log('Generated JWT tokens:');
console.log('====================');

const tokens = {};
testUsers.forEach(user => {
    const token = generateJWT(user);
    tokens[user.username] = token;
    console.log(`${user.username}: ${token}`);
    console.log('');
});

// ============================================
// SOCKET.IO CLIENT IMPLEMENTATION
// ============================================

const { io } = require('socket.io-client');

class WebSocketClient {
    
    constructor(serverUrl, token) {
        this.serverUrl = serverUrl;
        this.token = token;
        this.socket = null;
        this.isConnected = false;
        this.userId = null;
        this.username = null;
    }
    
    connect() {
        return new Promise((resolve, reject) => {
            console.log('Attempting to connect to server...');
            
            this.socket = io(this.serverUrl, {
                auth: {
                    token: this.token
                },
                transports: ['websocket'],
                timeout: 10000
            });
            
            // Connection successful
            this.socket.on('connect', () => {
                console.log('✅ Connected to server!');
                this.isConnected = true;
            });
            
            // Authentication successful
            this.socket.on('authenticated', (data) => {
                console.log('✅ Authentication successful:', data);
                this.userId = data.userId;
                this.username = data.username;
                resolve(data);
            });
            
            // Connection error
            this.socket.on('connect_error', (error) => {
                console.log('❌ Connection failed:', error.message);
                this.isConnected = false;
                reject(error);
            });
            
            // Disconnection
            this.socket.on('disconnect', (reason) => {
                console.log('🔌 Disconnected:', reason);
                this.isConnected = false;
            });
            
            // Message received
            this.socket.on('messageReceived', (data) => {
                console.log('📨 Message received:', data);
            });
            
            // Broadcast received
            this.socket.on('broadcastReceived', (data) => {
                console.log('📢 Broadcast received:', data);
            });
            
            // Room message received
            this.socket.on('roomMessageReceived', (data) => {
                console.log('🏠 Room message received:', data);
            });
            
            // User joined room
            this.socket.on('userJoined', (data) => {
                console.log('👋 User joined room:', data);
            });
            
            // User left room
            this.socket.on('userLeft', (data) => {
                console.log('👋 User left room:', data);
            });
        });
    }
    
    sendMessage(targetUserId, message, type = 'text') {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('Not connected to server'));
                return;
            }
            
            this.socket.emit('sendMessage', {
                targetUserId,
                message,
                type
            }, (response) => {
                if (response.error) {
                    reject(new Error(response.error));
                } else {
                    console.log('✅ Message sent successfully:', response);
                    resolve(response);
                }
            });
        });
    }
    
    broadcast(message, type = 'broadcast') {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('Not connected to server'));
                return;
            }
            
            this.socket.emit('broadcast', {
                message,
                type
            }, (response) => {
                if (response.error) {
                    reject(new Error(response.error));
                } else {
                    console.log('✅ Broadcast sent successfully:', response);
                    resolve(response);
                }
            });
        });
    }
    
    joinRoom(roomId) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('Not connected to server'));
                return;
            }
            
            this.socket.emit('joinRoom', { roomId }, (response) => {
                if (response.error) {
                    reject(new Error(response.error));
                } else {
                    console.log('✅ Joined room successfully:', response);
                    resolve(response);
                }
            });
        });
    }
    
    leaveRoom(roomId) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('Not connected to server'));
                return;
            }
            
            this.socket.emit('leaveRoom', { roomId }, (response) => {
                if (response.error) {
                    reject(new Error(response.error));
                } else {
                    console.log('✅ Left room successfully:', response);
                    resolve(response);
                }
            });
        });
    }
    
    sendRoomMessage(roomId, message, type = 'text') {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('Not connected to server'));
                return;
            }
            
            this.socket.emit('sendRoomMessage', {
                roomId,
                message,
                type
            }, (response) => {
                if (response.error) {
                    reject(new Error(response.error));
                } else {
                    console.log('✅ Room message sent successfully:', response);
                    resolve(response);
                }
            });
        });
    }
    
    ping() {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('Not connected to server'));
                return;
            }
            
            this.socket.emit('ping', (response) => {
                console.log('🏓 Ping response:', response);
                resolve(response);
            });
        });
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.isConnected = false;
            console.log('🔌 Disconnected from server');
        }
    }
}

// ============================================
// EXAMPLE USAGE
// ============================================

async function demonstrateClient() {
    try {
        // Use the first generated token
        const token = tokens['john_doe'];
        const client = new WebSocketClient('ws://localhost:3000', token);
        
        // Connect to server
        await client.connect();
        
        // Wait a bit then test various features
        setTimeout(async () => {
            try {
                // Test ping
                await client.ping();
                
                // Test broadcast
                await client.broadcast('Hello everyone!');
                
                // Test joining a room
                await client.joinRoom('general');
                
                // Test room message
                await client.sendRoomMessage('general', 'Hello room!');
                
                // Test direct message (this would need another connected user)
                // await client.sendMessage('456', 'Hello Jane!');
                
                // Test leaving room
                setTimeout(async () => {
                    await client.leaveRoom('general');
                }, 2000);
                
            } catch (error) {
                console.error('Error during testing:', error.message);
            }
        }, 1000);
        
        // Disconnect after 10 seconds
        setTimeout(() => {
            client.disconnect();
        }, 10000);
        
    } catch (error) {
        console.error('Failed to connect:', error.message);
    }
}

// ============================================
// EXPORT FUNCTIONS (for use in other files)
// ============================================

module.exports = {
    generateJWT,
    verifyJWT,
    WebSocketClient,
    tokens // Export generated tokens for testing
};

// ============================================
// RUN DEMO (uncomment to test)
// ============================================

// Uncomment the line below to run the demo
// demonstrateClient();