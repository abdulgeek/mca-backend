/**
 * Generic HID Scanner Implementation
 * Works with most USB fingerprint devices using HID protocol
 */

import HID from "node-hid";
import {
  BaseScanner,
  SensorInfo,
  FingerprintTemplate,
  MatchResult,
  DeviceInfo,
  CaptureOptions,
} from "./BaseScanner";
import { EventEmitter } from "events";

// Known fingerprint reader vendor IDs
const FINGERPRINT_VENDORS = {
  DIGITAL_PERSONA: 0x05ba,
  ZKTECO: 0x1b55,
  EIKON: 0x04f3,
  FUTRONIC: 0x1491,
  SECUGEN: 0x1162,
  SUPREMA: 0x16d1,
  ANVIZ: 0x2808,
  MANTRA: 0x2c0f, // Actual vendor ID detected on macOS
  MANTRA_ALT: 0x1c3d, // Alternative vendor ID (if different models exist)
} as const;

// Product ID mappings for known devices
const DEVICE_MAPPINGS: Record<number, Record<number, string>> = {
  [FINGERPRINT_VENDORS.DIGITAL_PERSONA]: {
    0x000a: "Digital Persona U.are.U 4500",
    0x0007: "Digital Persona U.are.U 4000B",
    0x0006: "Digital Persona U.are.U 2000",
  },
  [FINGERPRINT_VENDORS.ZKTECO]: {
    0x0001: "ZKTeco LiveFinger",
    0x0002: "ZKTeco SLK20R",
  },
  [FINGERPRINT_VENDORS.SECUGEN]: {
    0x0001: "SecuGen Hamster Plus",
    0x0003: "SecuGen Hamster Pro 20",
  },
  [FINGERPRINT_VENDORS.MANTRA]: {
    0x1204: "Mantra MFS110", // Actual product ID detected on macOS
    0x0001: "Mantra MFS100",
    0x0002: "Mantra MFS110 (alternative)",
    0x0003: "Mantra MFS500",
  },
};

export class GenericHIDScanner extends BaseScanner {
  private static instance: GenericHIDScanner | null = null;
  private eventEmitter: EventEmitter;
  private connectedDevices: Map<string, HID.HID> = new Map();
  private captureInProgress: Set<string> = new Set();

  constructor() {
    super("generic-hid");
    this.eventEmitter = new EventEmitter();
  }

  static getInstance(): GenericHIDScanner {
    if (!GenericHIDScanner.instance) {
      GenericHIDScanner.instance = new GenericHIDScanner();
    }
    return GenericHIDScanner.instance;
  }

  getType(): string {
    return "generic_hid";
  }

  async enumerate(): Promise<SensorInfo[]> {
    try {
      let devices: HID.Device[];
      try {
        devices = HID.devices();
      } catch (error: any) {
        if (
          (error.message && error.message.includes("permission")) ||
          error.message.includes("access")
        ) {
          console.error(
            "USB device access denied. On macOS, you may need to grant Terminal/Node.js USB access in System Preferences > Security & Privacy > Privacy > USB."
          );
          throw new Error(
            "USB device access denied. Please check system permissions."
          );
        }
        throw error;
      }

      // Filter by vendor ID first
      let fingerprintDevices = devices.filter(
        (device) =>
          device.vendorId &&
          Object.values(FINGERPRINT_VENDORS).includes(device.vendorId as any)
      );

      // Also check device names/descriptions for fingerprint-related keywords
      // This helps catch devices that might not be in our vendor list
      const fingerprintKeywords = [
        "fingerprint",
        "biometric",
        "mantra",
        "mfs",
        "scanner",
        "reader",
        "sensor",
        "digital persona",
        "zkteco",
        "secugen",
        "optical",
        "finger",
        "print",
        "bio",
        "auth",
        "identify",
      ];

      const additionalDevices = devices.filter((device) => {
        // Skip if already included
        if (
          fingerprintDevices.some(
            (d) =>
              d.vendorId === device.vendorId && d.productId === device.productId
          )
        ) {
          return false;
        }

        // Must have vendor ID and product ID
        if (!device.vendorId || !device.productId) {
          return false;
        }

        // Check both product name and manufacturer
        const deviceName = (device.product || "").toLowerCase();
        const manufacturer = (device.manufacturer || "").toLowerCase();
        const combined = `${deviceName} ${manufacturer}`;

        return fingerprintKeywords.some((keyword) =>
          combined.includes(keyword)
        );
      });

      fingerprintDevices = [...fingerprintDevices, ...additionalDevices];

      // Log found devices for debugging
      if (fingerprintDevices.length > 0) {
        console.log(
          `Found ${fingerprintDevices.length} fingerprint device(s):`
        );
        fingerprintDevices.forEach((device) => {
          console.log(
            `  - ${
              device.product || "Unknown"
            } (Vendor: 0x${device.vendorId?.toString(
              16
            )}, Product: 0x${device.productId?.toString(16)})`
          );
        });
      } else {
        console.log("No fingerprint devices found. Available HID devices:");
        devices.slice(0, 10).forEach((device) => {
          console.log(
            `  - ${
              device.product || device.manufacturer || "Unknown"
            } (Vendor: 0x${device.vendorId?.toString(
              16
            )}, Product: 0x${device.productId?.toString(16)})`
          );
        });
      }

      return fingerprintDevices.map((device) => ({
        id: this.getDeviceId(device),
        name: this.getDeviceName(device),
        manufacturer: this.getManufacturerName(device.vendorId || 0),
        type: "fingerprint_scanner",
        vendorId: device.vendorId || 0,
        productId: device.productId || 0,
        status: "ready" as const,
        capabilities: ["capture", "enrollment", "verification"],
      }));
    } catch (error) {
      console.error("Error enumerating HID devices:", error);
      return [];
    }
  }

  async connect(deviceId: string): Promise<boolean> {
    try {
      if (this.connectedDevices.has(deviceId)) {
        return true; // Already connected
      }

      const deviceInfo = await this.getHIDDeviceInfo(deviceId);
      if (!deviceInfo || !deviceInfo.path) {
        return false;
      }

      // Use path-based constructor to avoid TypeScript strict type issues
      const hidDevice = new HID.HID(deviceInfo.path);
      this.connectedDevices.set(deviceId, hidDevice);

      // Set up event listeners
      hidDevice.on("data", (data) => {
        this.handleDeviceData(deviceId, data);
      });

      hidDevice.on("error", (error) => {
        console.error(`HID device error for ${deviceId}:`, error);
        this.disconnect(deviceId);
      });

      this.eventEmitter.emit("connected", { deviceId, timestamp: new Date() });
      return true;
    } catch (error) {
      console.error(`Error connecting to device ${deviceId}:`, error);
      return false;
    }
  }

  async disconnect(deviceId?: string): Promise<void> {
    if (deviceId) {
      const device = this.connectedDevices.get(deviceId);
      if (device) {
        device.close();
        this.connectedDevices.delete(deviceId);
        this.captureInProgress.delete(deviceId);
        this.eventEmitter.emit("disconnected", {
          deviceId,
          timestamp: new Date(),
        });
      }
    } else {
      // Disconnect all devices
      for (const [id, device] of this.connectedDevices) {
        device.close();
        this.eventEmitter.emit("disconnected", {
          deviceId: id,
          timestamp: new Date(),
        });
      }
      this.connectedDevices.clear();
      this.captureInProgress.clear();
    }
  }

  async capture(
    deviceId: string,
    options?: CaptureOptions
  ): Promise<FingerprintTemplate> {
    if (this.captureInProgress.has(deviceId)) {
      throw new Error("Capture already in progress for this device");
    }

    if (!this.connectedDevices.has(deviceId)) {
      const connected = await this.connect(deviceId);
      if (!connected) {
        throw new Error("Failed to connect to device");
      }
    }

    this.captureInProgress.add(deviceId);

    try {
      const result = await this.performCapture(deviceId, options);
      return result;
    } finally {
      this.captureInProgress.delete(deviceId);
    }
  }

  private async performCapture(
    deviceId: string,
    options?: CaptureOptions
  ): Promise<FingerprintTemplate> {
    const timeout = options?.timeout || 30000; // 30 second default timeout
    const maxRetries = options?.maxRetries || 3;

    return new Promise((resolve, reject) => {
      let retryCount = 0;
      let captureTimeout: NodeJS.Timeout;

      const attemptCapture = () => {
        if (retryCount >= maxRetries) {
          reject(new Error("Maximum capture attempts exceeded"));
          return;
        }

        retryCount++;
        this.eventEmitter.emit("capture_progress", {
          deviceId,
          data: {
            attempt: retryCount,
            maxRetries,
            status: "Place finger on sensor...",
          },
          timestamp: new Date(),
        });

        // Send capture command to device
        this.sendCaptureCommand(deviceId);

        captureTimeout = setTimeout(() => {
          if (retryCount < maxRetries) {
            this.eventEmitter.emit("capture_progress", {
              deviceId,
              data: {
                attempt: retryCount,
                maxRetries,
                status: "Timeout, retrying...",
              },
              timestamp: new Date(),
            });
            attemptCapture();
          } else {
            reject(new Error("Capture timeout"));
          }
        }, timeout / maxRetries);
      };

      // Listen for capture completion
      const onCaptureComplete = (data: any) => {
        if (data.deviceId === deviceId) {
          clearTimeout(captureTimeout);
          this.eventEmitter.off("capture_complete", onCaptureComplete);

          const template: FingerprintTemplate = {
            template: data.template,
            quality: data.quality || 85,
            sensorId: deviceId,
            sensorType: this.getType(),
            capturedAt: new Date(),
            metadata: {
              templateVersion: "1.0",
              ...data.metadata,
            },
          };

          resolve(template);
        }
      };

      this.eventEmitter.on("capture_complete", onCaptureComplete);
      attemptCapture();
    });
  }

  private sendCaptureCommand(deviceId: string): void {
    const device = this.connectedDevices.get(deviceId);
    if (!device) {
      return;
    }

    try {
      // Generic HID capture command (varies by manufacturer)
      // This is a simplified implementation - real implementation would be device-specific
      const captureCommand = Buffer.from([0x01, 0x00, 0x00, 0x00]); // Generic start capture
      device.write(captureCommand);
    } catch (error) {
      console.error(`Error sending capture command to ${deviceId}:`, error);
    }
  }

  private handleDeviceData(deviceId: string, data: Buffer): void {
    try {
      // This is a simplified implementation
      // Real implementation would parse device-specific data formats

      if (data.length > 4 && data[0] === 0x02) {
        // Assuming 0x02 indicates template data
        // Simulate template extraction and quality calculation
        const templateData = data.slice(4); // Skip header
        const quality = this.calculateQuality(templateData);

        if (quality >= 60) {
          // Minimum quality threshold
          const template = templateData.toString("base64");

          this.eventEmitter.emit("capture_complete", {
            deviceId,
            template,
            quality,
            timestamp: new Date(),
          });
        } else {
          this.eventEmitter.emit("capture_progress", {
            deviceId,
            data: { quality, status: "Poor quality, please try again..." },
            timestamp: new Date(),
          });
        }
      }
    } catch (error) {
      console.error(`Error handling device data for ${deviceId}:`, error);
    }
  }

  private calculateQuality(templateData: Buffer): number {
    // Simplified quality calculation
    // Real implementation would analyze minutiae points, ridge quality, etc.
    if (templateData.length < 100) return 30;
    if (templateData.length < 200) return 60;
    if (templateData.length < 500) return 80;
    return 95;
  }

  async verify(template1: string, template2: string): Promise<MatchResult> {
    try {
      // Simplified template matching using Hamming distance
      const buf1 = Buffer.from(template1, "base64");
      const buf2 = Buffer.from(template2, "base64");

      if (buf1.length !== buf2.length) {
        return { match: false, confidence: 0 };
      }

      let differences = 0;
      for (let i = 0; i < buf1.length; i++) {
        if (buf1[i] !== buf2[i]) {
          differences++;
        }
      }

      const similarity = 1 - differences / buf1.length;
      const match = similarity >= 0.75; // 75% similarity threshold

      return {
        match,
        confidence: similarity,
      };
    } catch (error) {
      return {
        match: false,
        confidence: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async getDeviceInfo(deviceId: string): Promise<DeviceInfo> {
    const hidInfo = await this.getHIDDeviceInfo(deviceId);

    return {
      id: deviceId,
      name: hidInfo ? this.getDeviceName(hidInfo) : "Unknown Device",
      manufacturer: hidInfo
        ? this.getManufacturerName(hidInfo.vendorId)
        : "Unknown",
      capabilities: ["capture", "enrollment", "verification"],
      status: this.connectedDevices.has(deviceId) ? "ready" : "disconnected",
    };
  }

  async isReady(deviceId: string): Promise<boolean> {
    return (
      this.connectedDevices.has(deviceId) &&
      !this.captureInProgress.has(deviceId)
    );
  }

  private getDeviceId(device: HID.Device): string {
    return `hid_${device.vendorId?.toString(16)}_${device.productId?.toString(
      16
    )}_${device.path}`;
  }

  private getDeviceName(device: HID.Device): string {
    const vendorId = device.vendorId || 0;
    const productId = device.productId || 0;

    const deviceMap = DEVICE_MAPPINGS[vendorId];
    if (deviceMap && deviceMap[productId]) {
      return deviceMap[productId];
    }

    return `USB Fingerprint Scanner (${vendorId.toString(
      16
    )}:${productId.toString(16)})`;
  }

  private getManufacturerName(vendorId: number): string {
    const vendorName = Object.entries(FINGERPRINT_VENDORS).find(
      ([_, id]) => id === vendorId
    )?.[0];

    return vendorName
      ? vendorName
          .replace("_", " ")
          .toLowerCase()
          .replace(/\b\w/g, (l) => l.toUpperCase())
      : "Unknown";
  }

  private async getHIDDeviceInfo(deviceId: string): Promise<HID.Device | null> {
    const devices = HID.devices();
    return (
      devices.find((device) => this.getDeviceId(device) === deviceId) || null
    );
  }

  // Event emitter methods for external listeners
  on(event: string, listener: (...args: any[]) => void): void {
    this.eventEmitter.on(event, listener);
  }

  off(event: string, listener: (...args: any[]) => void): void {
    this.eventEmitter.off(event, listener);
  }
}
