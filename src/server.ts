import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { eventService } from './services/eventService';
import { initializeAutoLogoutCron, triggerAutoLogout } from './services/autoLogoutService';
import dotenv from 'dotenv';
import costKatanaService from './costkatana.js';

// Import routes
import faceRecognitionRoutes from './routes/faceRecognition';
import fingerprintRoutes from './routes/fingerprint';
import studentRoutes from './routes/students';
import authRoutes from './routes/auth';

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

// Initialize CostKatana for AI cost tracking
costKatanaService.initialize();

// Optional: Add CostKatana middleware for automatic tracking
if (process.env.COSTKATANA_AUTO_TRACK === 'true') {
  app.use(costKatanaService.middleware());
}

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
      console.warn('⚠️ MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    // Don't exit process, let the app continue and retry
    setTimeout(connectDB, 5000); // Retry after 5 seconds
  }
};

// Initialize Face API
initializeFaceAPI().then(() => {
  console.log('✅ Face API initialized');
}).catch((error) => {
  console.error('❌ Failed to initialize Face API:', error);
});

// Health check endpoint
app.get('/health', (req, res) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    costKatana: costKatanaService.isReady() ? 'ready' : 'not ready',
    environment: process.env.NODE_ENV || 'development'
  };
  
  res.status(200).json(healthStatus);
});

// API Routes
app.use('/api/face-recognition', faceRecognitionRoutes);
app.use('/api/fingerprint', fingerprintRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/auth', authRoutes);

// CostKatana analytics endpoint (optional)
app.get('/api/cost-analytics', async (req, res) => {
  try {
    if (!costKatanaService.isReady()) {
      return res.status(503).json({
        success: false,
        message: 'CostKatana service is not available'
      });
    }

    const analytics = await costKatanaService.getAnalytics();
    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Failed to get cost analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve cost analytics'
    });
  }
});

// Static files (if any)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', err);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(isDevelopment && { 
      error: err.stack,
      details: err 
    })
  });
});

// Start server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Initialize EventService
    await eventService.initialize();
    console.log('✅ EventService initialized');
    
    // Initialize auto-logout cron job
    initializeAutoLogoutCron();
    console.log('✅ Auto-logout cron job initialized');
    
    // Start listening
    server.listen(PORT, HOST as any, () => {
      console.log(`\n🚀 Server running on http://${HOST}:${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`💰 CostKatana: ${costKatanaService.isReady() ? 'Active' : 'Inactive'}`);
      console.log('\n📡 Available endpoints:');
      console.log(`   Health: http://${HOST}:${PORT}/health`);
      console.log(`   API: http://${HOST}:${PORT}/api/*`);
      if (costKatanaService.isReady()) {
        console.log(`   Cost Analytics: http://${HOST}:${PORT}/api/cost-analytics`);
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Give the server time to respond to pending requests
  server.close(() => {
    process.exit(1);
  });
  // Force exit after 10 seconds
  setTimeout(() => {
    process.exit(1);
  }, 10000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit on unhandled rejections in development
  if (process.env.NODE_ENV === 'production') {
    server.close(() => {
      process.exit(1);
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n📴 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    mongoose.connection.close(false, () => {
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('\n📴 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    mongoose.connection.close(false, () => {
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    });
  });
});

// Start the server
startServer();

export default app;