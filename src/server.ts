import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { eventService } from './services/eventService';
import dotenv from 'dotenv';

// Import routes
import faceRecognitionRoutes from './routes/faceRecognition';

// Import middleware
import { initializeFaceAPI } from './middleware/faceRecognition';
import path from 'path';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);

// Set server timeout to 60 seconds for face processing
server.timeout = 60000;

// Trust proxy for proper IP detection (only trust first proxy)
app.set('trust proxy', 1);

// Security middleware - Relaxed for development/open access
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP to allow all connections
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);

// CORS configuration - Allow all origins
app.use(cors({
  origin: '*', // Allow all origins
  credentials: false, // Must be false when origin is '*'
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
  allowedHeaders: '*', // Allow all headers
  exposedHeaders: '*', // Expose all headers
  maxAge: 86400, // Cache preflight requests for 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Body parsing middleware
app.use(express.json({ 
  limit: process.env.UPLOAD_MAX_SIZE || '50mb',
  verify: (req, res, buf) => {
    // Store raw body for signature verification if needed
    (req as any).rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: process.env.UPLOAD_MAX_SIZE || '50mb' 
}));

// MongoDB connection
const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance-system';
    
    await mongoose.connect(mongoURI, {
      // Remove deprecated options
    });
    
    console.log('✅ MongoDB connected successfully');
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
    });
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('📴 MongoDB connection closed through app termination');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

// Initialize Face API and Event Service
const initializeApp = async (): Promise<void> => {
  try {
    await initializeFaceAPI();
    console.log('✅ Face API initialized successfully');
    
    // Setup event service logging
    eventService.setupLogging();
    console.log('✅ Event service initialized successfully');
  } catch (error) {
    console.error('❌ Face API initialization failed:', error);
    // Don't exit the process, just log the error
    console.log('⚠️ Continuing without face recognition (models will be loaded on first request)');
  }
};

// Routes
app.use('/api/face-recognition', faceRecognitionRoutes);

// Serve Face API models
app.use('/models', express.static(path.join(__dirname, '../models')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Event service for real-time updates
eventService.on('attendance:marked', (data) => {
  console.log('📊 Real-time attendance update:', data);
  // Here you can add additional real-time features like SSE or polling endpoints
});

eventService.on('student:enrolled', (data) => {
  console.log('👤 Real-time student enrollment:', data);
});

eventService.on('system:status', (data) => {
  console.log('🔧 Real-time system status:', data);
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Error:', err.stack);
  
  const response = {
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    timestamp: new Date().toISOString()
  };
  
  res.status(err.status || 500).json(response);
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = process.env.PORT || 5001;

const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDB();
    
    // Initialize face recognition
    await initializeApp();
    
    // Start HTTP server
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
      console.log(`📱 Health check: http://localhost:${PORT}/api/health`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
  process.exit(1);
});

// Start the server
startServer();

export { app, eventService };
