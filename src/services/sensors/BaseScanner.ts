/**
 * Base Scanner Interface
 * Abstract class for all fingerprint scanner implementations
 */

export interface SensorInfo {
  id: string;
  name: string;
  manufacturer: string;
  type: string;
  vendorId: number;
  productId: number;
  status: "ready" | "busy" | "error";
  capabilities?: string[];
}

export interface FingerprintTemplate {
  template: string; // Base64 encoded template
  quality: number; // 0-100 quality score
  sensorId: string;
  sensorType: string;
  capturedAt: Date;
  metadata?: {
    width?: number;
    height?: number;
    dpi?: number;
    templateVersion?: string;
    minutiaeCount?: number;
    captureMode?: string;
    retryCount?: number;
  };
}

export interface MatchResult {
  match: boolean;
  confidence: number; // 0-1 confidence score
  error?: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
  firmwareVersion?: string;
  serialNumber?: string;
  capabilities: string[];
  status: "ready" | "busy" | "error" | "disconnected";
}

export abstract class BaseScanner {
  protected deviceId: string;
  protected isConnected: boolean = false;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
  }

  /**
   * Enumerate all available sensors of this scanner type
   */
  abstract enumerate(): Promise<SensorInfo[]>;

  /**
   * Connect to a specific device
   */
  abstract connect(deviceId: string): Promise<boolean>;

  /**
   * Disconnect from the device
   */
  abstract disconnect(): Promise<void>;

  /**
   * Capture fingerprint template from device
   */
  abstract capture(
    deviceId: string,
    options?: CaptureOptions
  ): Promise<FingerprintTemplate>;

  /**
   * Verify two fingerprint templates
   */
  abstract verify(template1: string, template2: string): Promise<MatchResult>;

  /**
   * Get detailed device information
   */
  abstract getDeviceInfo(deviceId: string): Promise<DeviceInfo>;

  /**
   * Check if device is connected and ready
   */
  abstract isReady(deviceId: string): Promise<boolean>;

  /**
   * Get scanner type identifier
   */
  abstract getType(): string;
}

export interface CaptureOptions {
  timeout?: number; // Capture timeout in ms
  quality?: number; // Minimum quality threshold (0-100)
  maxRetries?: number; // Maximum capture attempts
  captureMode?: "enrollment" | "verification";
}

/**
 * Events that scanners can emit
 */
export interface ScannerEvent {
  type:
    | "connected"
    | "disconnected"
    | "capture_progress"
    | "capture_complete"
    | "error";
  deviceId: string;
  data?: any;
  timestamp: Date;
}
