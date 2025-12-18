/**
 * Sensor Manager Service
 * Central service for USB sensor detection and management
 */

import { EventEmitter } from "events";
import { GenericHIDScanner } from "./sensors/GenericHIDScanner";
import { MantraScanner } from "./sensors/MantraScanner";
import {
  BaseScanner,
  SensorInfo,
  FingerprintTemplate,
  MatchResult,
  CaptureOptions,
} from "./sensors/BaseScanner";

export interface SensorManagerConfig {
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export class SensorManager extends EventEmitter {
  private static instance: SensorManager | null = null;
  private scanners: Map<string, BaseScanner> = new Map();
  private activeSensors: Map<string, SensorInfo> = new Map();
  private config: SensorManagerConfig;
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  private isInitialized: boolean = false;

  private constructor(config: SensorManagerConfig = {}) {
    super();
    this.config = {
      autoReconnect: true,
      reconnectInterval: 5000, // 5 seconds
      maxReconnectAttempts: 10,
      ...config,
    };
    this.setupScanners();
  }

  static getInstance(config?: SensorManagerConfig): SensorManager {
    if (!SensorManager.instance) {
      SensorManager.instance = new SensorManager(config);
    }
    return SensorManager.instance;
  }

  private setupScanners(): void {
    // Initialize HID scanner
    const hidScanner = GenericHIDScanner.getInstance();
    this.scanners.set("hid", hidScanner);

    // Set up event forwarding
    hidScanner.on("connected", (event) => {
      this.emit("sensor_connected", event);
    });

    hidScanner.on("disconnected", (event) => {
      this.emit("sensor_disconnected", event);
      if (this.config.autoReconnect) {
        this.scheduleReconnect(event.deviceId);
      }
    });

    hidScanner.on("capture_progress", (event) => {
      this.emit("capture_progress", event);
    });

    hidScanner.on("capture_complete", (event) => {
      this.emit("capture_complete", event);
    });

    hidScanner.on("error", (event) => {
      this.emit("sensor_error", event);
    });

    // Initialize Mantra scanner (for direct USB communication)
    const mantraScanner = MantraScanner.getInstance();
    this.scanners.set("mantra", mantraScanner);

    // Set up event forwarding for Mantra scanner
    mantraScanner.on("sensor_connected", (event) => {
      this.emit("sensor_connected", event);
    });

    mantraScanner.on("sensor_disconnected", (event) => {
      this.emit("sensor_disconnected", event);
      if (this.config.autoReconnect) {
        this.scheduleReconnect(event.deviceId);
      }
    });

    mantraScanner.on("capture_progress", (event) => {
      this.emit("capture_progress", event);
    });

    mantraScanner.on("capture_complete", (event) => {
      this.emit("capture_complete", event);
    });

    mantraScanner.on("sensor_error", (event) => {
      this.emit("sensor_error", event);
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize without calling enumerateSensors to avoid recursion
      this.isInitialized = true;
      console.log("SensorManager initialized successfully");

      // Now enumerate sensors after initialization is complete
      await this.refreshSensorList();
    } catch (error) {
      console.error("Failed to initialize SensorManager:", error);
      this.isInitialized = false;
      throw error;
    }
  }

  async enumerateSensors(): Promise<SensorInfo[]> {
    // Remove the initialization check that caused recursion
    const allSensors: SensorInfo[] = [];

    for (const [type, scanner] of this.scanners) {
      try {
        const sensors = await scanner.enumerate();
        allSensors.push(...sensors);
      } catch (error) {
        console.error(`Error enumerating ${type} sensors:`, error);
      }
    }

    // Update active sensors cache
    this.activeSensors.clear();
    allSensors.forEach((sensor) => {
      this.activeSensors.set(sensor.id, sensor);
    });

    return allSensors;
  }

  async refreshSensorList(): Promise<SensorInfo[]> {
    // Direct enumeration without recursion
    return this.enumerateSensors();
  }

  async getSensorInfo(sensorId: string): Promise<SensorInfo | null> {
    // First try from cache
    const cached = this.activeSensors.get(sensorId);
    if (cached) {
      return cached;
    }

    // Refresh and try again
    await this.refreshSensorList();
    return this.activeSensors.get(sensorId) || null;
  }

  async connectToSensor(sensorId: string): Promise<boolean> {
    const sensorInfo = await this.getSensorInfo(sensorId);
    if (!sensorInfo) {
      throw new Error(`Sensor not found: ${sensorId}`);
    }

    const scanner = this.getScannerForSensor(sensorId);
    if (!scanner) {
      throw new Error(`No scanner available for sensor: ${sensorId}`);
    }

    return scanner.connect(sensorId);
  }

  async captureFromSensor(
    sensorId: string,
    options?: CaptureOptions
  ): Promise<FingerprintTemplate> {
    const scanner = this.getScannerForSensor(sensorId);
    if (!scanner) {
      throw new Error(`No scanner available for sensor: ${sensorId}`);
    }

    // Ensure sensor is connected
    const isReady = await scanner.isReady(sensorId);
    if (!isReady) {
      const connected = await this.connectToSensor(sensorId);
      if (!connected) {
        throw new Error(`Failed to connect to sensor: ${sensorId}`);
      }
    }

    return scanner.capture(sensorId, options);
  }

  async verifyTemplates(
    template1: string,
    template2: string,
    sensorType?: string
  ): Promise<MatchResult> {
    // If sensor type is specified, use that scanner for verification
    if (sensorType) {
      const scanner = this.getScannerByType(sensorType);
      if (scanner) {
        return scanner.verify(template1, template2);
      }
    }

    // Fallback to HID scanner for generic verification
    const hidScanner = this.scanners.get("hid");
    if (hidScanner) {
      return hidScanner.verify(template1, template2);
    }

    throw new Error("No scanner available for template verification");
  }

  async isSensorReady(sensorId: string): Promise<boolean> {
    const scanner = this.getScannerForSensor(sensorId);
    if (!scanner) {
      return false;
    }

    return scanner.isReady(sensorId);
  }

  async disconnectSensor(sensorId: string): Promise<void> {
    const scanner = this.getScannerForSensor(sensorId);
    if (scanner) {
      await scanner.disconnect();
    }

    // Clear reconnect timer if exists
    const timer = this.reconnectTimers.get(sensorId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(sensorId);
    }
  }

  async disconnectAllSensors(): Promise<void> {
    for (const scanner of this.scanners.values()) {
      await scanner.disconnect();
    }

    // Clear all reconnect timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
  }

  getActiveSensors(): SensorInfo[] {
    return Array.from(this.activeSensors.values());
  }

  getSensorCount(): number {
    return this.activeSensors.size;
  }

  private getScannerForSensor(sensorId: string): BaseScanner | null {
    // Determine scanner type based on sensor ID prefix or characteristics
    if (sensorId.startsWith("mantra_")) {
      return this.scanners.get("mantra") || null;
    }

    if (sensorId.startsWith("hid_")) {
      return this.scanners.get("hid") || null;
    }

    // Try to find by checking active sensors
    const sensorInfo = this.activeSensors.get(sensorId);
    if (sensorInfo) {
      // Check manufacturer or type
      if (sensorInfo.manufacturer?.toLowerCase().includes("mantra")) {
        return this.scanners.get("mantra") || null;
      }
    }

    // Default to HID scanner for now
    return this.scanners.get("hid") || null;
  }

  private getScannerByType(type: string): BaseScanner | null {
    for (const scanner of this.scanners.values()) {
      if (scanner.getType() === type) {
        return scanner;
      }
    }
    return null;
  }

  private scheduleReconnect(sensorId: string): void {
    // Clear existing timer
    const existingTimer = this.reconnectTimers.get(sensorId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule reconnection attempt
    const timer = setTimeout(async () => {
      try {
        console.log(`Attempting to reconnect to sensor: ${sensorId}`);
        await this.connectToSensor(sensorId);
        this.reconnectTimers.delete(sensorId);
      } catch (error) {
        console.error(`Failed to reconnect to sensor ${sensorId}:`, error);
        // Schedule another attempt if within limits
        // This could be enhanced with exponential backoff
      }
    }, this.config.reconnectInterval);

    this.reconnectTimers.set(sensorId, timer);
  }

  // Utility methods for monitoring
  getConnectionStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const sensor of this.activeSensors.values()) {
      status[sensor.id] = sensor.status === "ready";
    }
    return status;
  }

  async getHealthStatus(): Promise<{
    isHealthy: boolean;
    sensorCount: number;
    connectedCount: number;
    errors: string[];
  }> {
    const sensors = await this.enumerateSensors();
    const connectedSensors = sensors.filter((s) => s.status === "ready");
    const errors: string[] = [];

    // Check for common issues
    if (sensors.length === 0) {
      errors.push("No fingerprint sensors detected");
    }

    const errorSensors = sensors.filter((s) => s.status === "error");
    if (errorSensors.length > 0) {
      errors.push(`${errorSensors.length} sensors have errors`);
    }

    return {
      isHealthy: errors.length === 0 && sensors.length > 0,
      sensorCount: sensors.length,
      connectedCount: connectedSensors.length,
      errors,
    };
  }

  // Cleanup method
  async shutdown(): Promise<void> {
    console.log("Shutting down SensorManager...");

    // Disconnect all sensors
    await this.disconnectAllSensors();

    // Clear all event listeners
    this.removeAllListeners();

    // Reset singleton instance
    SensorManager.instance = null;
    this.isInitialized = false;

    console.log("SensorManager shutdown complete");
  }
}

// Export singleton accessor
export const sensorManager = SensorManager.getInstance();
