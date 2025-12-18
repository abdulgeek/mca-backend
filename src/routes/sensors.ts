/**
 * Sensor Routes
 * API endpoints for fingerprint sensor management
 */

import express, { Request, Response } from "express";
import { sensorManager } from "../services/sensorManager";
import { sseService, sensorEvents } from "../services/sseService";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

/**
 * GET /api/sensors/enumerate
 * List all connected fingerprint sensors
 */
router.get("/enumerate", async (req: Request, res: Response) => {
  try {
    const sensors = await sensorManager.enumerateSensors();

    res.json({
      success: true,
      sensors,
      count: sensors.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error enumerating sensors:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to enumerate sensors",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

/**
 * GET /api/sensors/refresh
 * Refresh sensor list and return updated list
 */
router.get("/refresh", async (req: Request, res: Response) => {
  try {
    const sensors = await sensorManager.refreshSensorList();

    // Broadcast sensor list update
    sensorEvents.sensorConnected({
      action: "list_updated",
      sensors,
      count: sensors.length,
    });

    res.json({
      success: true,
      sensors,
      count: sensors.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error refreshing sensors:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to refresh sensors",
    });
  }
});

/**
 * GET /api/sensors/status/:id
 * Get specific sensor status and information
 */
router.get(
  "/status/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const sensorInfo = await sensorManager.getSensorInfo(id);

      if (!sensorInfo) {
        res.status(404).json({
          success: false,
          message: "Sensor not found",
        });
        return;
      }

      const isReady = await sensorManager.isSensorReady(id);

      res.json({
        success: true,
        sensor: {
          ...sensorInfo,
          isReady,
          lastChecked: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      console.error("Error getting sensor status:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to get sensor status",
      });
    }
  }
);

/**
 * POST /api/sensors/capture
 * Capture fingerprint from specified sensor
 */
router.post("/capture", async (req: Request, res: Response): Promise<void> => {
  try {
    const { sensorId, options } = req.body;

    if (!sensorId) {
      res.status(400).json({
        success: false,
        message: "sensorId is required",
      });
      return;
    }

    // Check if sensor exists
    const sensorInfo = await sensorManager.getSensorInfo(sensorId);
    if (!sensorInfo) {
      res.status(404).json({
        success: false,
        message: "Sensor not found",
      });
      return;
    }

    // Start capture process
    const captureId = uuidv4();

    // Send initial progress event
    sensorEvents.captureProgress({
      captureId,
      sensorId,
      status: "Starting capture...",
      progress: 0,
    });

    try {
      const template = await sensorManager.captureFromSensor(sensorId, {
        timeout: options?.timeout || 30000,
        quality: options?.quality || 70,
        maxRetries: options?.maxRetries || 3,
        captureMode: options?.captureMode || "verification",
      });

      // Send completion event
      sensorEvents.captureComplete({
        captureId,
        sensorId,
        template: template.template,
        quality: template.quality,
        metadata: template.metadata,
      });

      console.log("📤 Sending capture response:", {
        quality: template.quality,
        qualityType: typeof template.quality,
        sensorId: template.sensorId,
        sensorType: template.sensorType,
        hasTemplate: !!template.template,
      });

      res.json({
        success: true,
        data: {
          template: template.template,
          quality: template.quality || 100, // Ensure quality is always defined
          sensorId: template.sensorId,
          sensorType: template.sensorType,
          capturedAt: template.capturedAt,
          metadata: template.metadata,
          captureId,
        },
      });
    } catch (captureError: any) {
      // Send error event
      sensorEvents.captureError({
        captureId,
        sensorId,
        message: captureError.message,
        error: captureError.name,
      });

      throw captureError;
    }
  } catch (error: any) {
    console.error("Error capturing fingerprint:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to capture fingerprint",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

/**
 * POST /api/sensors/verify
 * Verify two fingerprint templates
 */
router.post("/verify", async (req: Request, res: Response): Promise<void> => {
  try {
    const { template1, template2, sensorType } = req.body;

    if (!template1 || !template2) {
      res.status(400).json({
        success: false,
        message: "Both template1 and template2 are required",
      });
      return;
    }

    const result = await sensorManager.verifyTemplates(
      template1,
      template2,
      sensorType
    );

    res.json({
      success: true,
      result: {
        match: result.match,
        confidence: result.confidence,
        threshold: 0.75, // Current threshold
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error verifying templates:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to verify templates",
    });
  }
});

/**
 * POST /api/sensors/connect/:id
 * Connect to a specific sensor
 */
router.post(
  "/connect/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const connected = await sensorManager.connectToSensor(id);

      if (connected) {
        const sensorInfo = await sensorManager.getSensorInfo(id);
        sensorEvents.sensorConnected({
          action: "manual_connect",
          sensor: sensorInfo,
        });
      }

      res.json({
        success: connected,
        message: connected
          ? "Sensor connected successfully"
          : "Failed to connect to sensor",
        sensorId: id,
      });
    } catch (error: any) {
      console.error("Error connecting to sensor:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to connect to sensor",
      });
    }
  }
);

/**
 * POST /api/sensors/disconnect/:id
 * Disconnect from a specific sensor
 */
router.post(
  "/disconnect/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      await sensorManager.disconnectSensor(id);

      sensorEvents.sensorDisconnected({
        action: "manual_disconnect",
        sensorId: id,
      });

      res.json({
        success: true,
        message: "Sensor disconnected successfully",
        sensorId: id,
      });
    } catch (error: any) {
      console.error("Error disconnecting sensor:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to disconnect sensor",
      });
    }
  }
);

/**
 * GET /api/sensors/health
 * Get overall sensor system health
 */
router.get("/health", async (req: Request, res: Response): Promise<void> => {
  try {
    const health = await sensorManager.getHealthStatus();
    const connectionStatus = sensorManager.getConnectionStatus();

    res.json({
      success: true,
      health: {
        ...health,
        connectionStatus,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error getting health status:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get health status",
    });
  }
});

/**
 * GET /api/sensors/events
 * Server-Sent Events endpoint for real-time sensor updates
 */
router.get("/events", (req: Request, res: Response): void => {
  try {
    const subscriptions = req.query.topics
      ? (req.query.topics as string).split(",")
      : ["*"]; // Subscribe to all events by default

    const clientId = sseService.addClient(res, subscriptions);

    // Send initial sensor list
    sensorManager
      .enumerateSensors()
      .then((sensors) => {
        sseService.sendToClient(clientId, {
          event: "initial_sensors",
          data: {
            sensors,
            count: sensors.length,
            timestamp: new Date().toISOString(),
          },
        });
      })
      .catch((error) => {
        sseService.sendToClient(clientId, {
          event: "error",
          data: {
            message: "Failed to load initial sensor list",
            error: error.message,
          },
        });
      });
  } catch (error: any) {
    console.error("Error setting up SSE connection:", error);
    res.status(500).json({
      success: false,
      message: "Failed to establish SSE connection",
    });
  }
});

/**
 * GET /api/sensors/stats
 * Get sensor manager statistics
 */
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const sensorCount = sensorManager.getSensorCount();
    const activeSensors = sensorManager.getActiveSensors();
    const sseStats = sseService.getStats();

    res.json({
      success: true,
      stats: {
        sensors: {
          total: sensorCount,
          active: activeSensors.filter((s) => s.status === "ready").length,
          error: activeSensors.filter((s) => s.status === "error").length,
        },
        sse: sseStats,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error getting stats:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get statistics",
    });
  }
});

// Initialize sensor manager when routes are loaded
sensorManager.initialize().catch((error) => {
  console.error("Failed to initialize sensor manager:", error);
});

// Set up event forwarding from sensor manager to SSE clients
sensorManager.on("sensor_connected", (event) => {
  sensorEvents.sensorConnected(event);
});

sensorManager.on("sensor_disconnected", (event) => {
  sensorEvents.sensorDisconnected(event);
});

sensorManager.on("capture_progress", (event) => {
  sensorEvents.captureProgress(event);
});

sensorManager.on("capture_complete", (event) => {
  sensorEvents.captureComplete(event);
});

sensorManager.on("sensor_error", (event) => {
  sensorEvents.deviceError(event);
});

/**
 * GET /api/sensors/debug/all-devices
 * Debug endpoint to list ALL HID devices (for troubleshooting)
 */
router.get(
  "/debug/all-devices",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const HID = require("node-hid");
      const allDevices = HID.devices();

      res.json({
        success: true,
        totalDevices: allDevices.length,
        devices: allDevices.map((device: any) => ({
          vendorId: device.vendorId
            ? `0x${device.vendorId.toString(16)}`
            : null,
          productId: device.productId
            ? `0x${device.productId.toString(16)}`
            : null,
          manufacturer: device.manufacturer,
          product: device.product,
          serialNumber: device.serialNumber,
          path: device.path,
          usage: device.usage,
          usagePage: device.usagePage,
          interface: device.interface,
        })),
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Error listing all HID devices:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to list HID devices",
      });
    }
  }
);

export default router;
