import { Document } from 'mongoose';

export interface IStudent extends Document {
  _id: string;
  studentId: string;
  name: string;
  email: string;
  phone: string;
  course: string;
  fatherName?: string;
  motherName?: string;
  bloodGroup?: string;
  faceDescriptor?: number[];
  faceImage?: string;
  profileImageUrl?: string; // Cloudinary URL for profile image
  fingerprintCredentialId?: string;
  fingerprintPublicKey?: string;
  fingerprintCounter?: number;
  // External fingerprint fields
  externalFingerprintTemplate?: string;
  externalFingerprintSensorType?: 'digital_persona' | 'zkteco' | 'mantra' | 'generic_hid';
  fingerprintMode: 'external' | 'webauthn' | 'both';
  externalFingerprintMetadata?: {
    quality: number;
    capturedAt: Date;
    sensorId: string;
    templateVersion: string;
    deviceInfo?: {
      manufacturer: string;
      model: string;
      vendorId: number;
      productId: number;
    };
  };
  biometricMethods: ('face' | 'fingerprint' | 'external_fingerprint')[];
  isActive: boolean;
  enrolledAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAttendance extends Document {
  _id: string;
  student: string;
  studentId: string;
  date: Date;
  timeIn: Date;
  timeOut?: Date;
  status: 'present' | 'absent';
  confidence?: number;
  biometricMethod: 'face' | 'fingerprint' | 'external_fingerprint';
  fingerprintMode?: 'webauthn' | 'external';
  sensorInfo?: {
    sensorId: string;
    sensorType: string;
    quality: number;
  };
  location: string;
  loginPhotoUrl?: string; // Cloudinary URL for login photo
  logoutPhotoUrl?: string; // Cloudinary URL for logout photo
  whatsappNotificationSent: boolean;
  deviceInfo: {
    userAgent?: string;
    ip?: string;
  };
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FaceDetectionResult {
  detection: any;
  descriptor: Float32Array;
  landmarks: any;
  expressions: any;
}

export interface AttendanceResult {
  success: boolean;
  studentId?: string;
  name?: string;
  timeIn?: Date;
  timeOut?: Date;
  confidence?: number;
  message?: string;
  action?: 'login' | 'logout';
  isLoggedIn?: boolean;
}

export interface LoginStatusResponse {
  isLoggedIn: boolean;
  studentId?: string;
  name?: string;
  timeIn?: Date;
  duration?: number; // in milliseconds
  location?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface WeeklyTrendData {
  name: string;
  present: number;
  absent: number;
  date: string;
}

export interface DashboardStats {
  totalStudents: number;
  presentToday: number;
  attendanceRate: number;
  recentAttendance: IAttendance[];
  weeklyTrend: WeeklyTrendData[];
}

export interface EnrollStudentRequest {
  name: string;
  email: string;
  phone: string;
  course: string;
  fatherName?: string;
  motherName?: string;
  bloodGroup?: string;
  faceImage?: string;
  fingerprintData?: {
    credentialId: string;
    publicKey: string;
    counter: number;
  };
  externalFingerprintData?: ExternalFingerprintData;
  fingerprintMode?: 'external' | 'webauthn' | 'both';
}

export interface FingerprintVerificationRequest {
  credentialId: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
  userHandle?: string;
}

export interface AbsentStudent {
  _id: string;
  studentId: string;
  name: string;
  phone: string;
  course: string;
  email: string;
}

export interface MarkAttendanceRequest {
  faceImage?: string;
  fingerprintData?: FingerprintVerificationRequest | ExternalFingerprintData;
  biometricMethod: 'face' | 'fingerprint' | 'external_fingerprint';
  fingerprintMode?: 'webauthn' | 'external';
  location?: string;
  notes?: string;
  action?: 'auto' | 'login' | 'logout';
}

// Student Management Types
export interface PaginationMetadata {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface StudentListItem {
  _id: string;
  studentId: string;
  name: string;
  email: string;
  phone: string;
  course: string;
  fatherName?: string;
  motherName?: string;
  bloodGroup?: string;
  profileImageUrl?: string;
  biometricMethods: ('face' | 'fingerprint' | 'external_fingerprint')[];
  isActive: boolean;
  enrolledAt: Date;
  attendancePercentage: number;
}

export interface StudentListResponse {
  students: StudentListItem[];
  pagination: PaginationMetadata;
}

export interface AttendanceStats {
  totalDays: number;
  presentDays: number;
  absentDays: number;
  attendancePercentage: number;
}

export interface StudentDetailResponse {
  student: IStudent;
  attendanceStats: AttendanceStats;
}

export interface UpdateStudentRequest {
  name?: string;
  email?: string;
  phone?: string;
  course?: string;
  fatherName?: string;
  motherName?: string;
  bloodGroup?: string;
}

export interface UpdateBiometricsRequest {
  faceImage?: string;
  fingerprintData?: {
    credentialId: string;
    publicKey: string;
    counter: number;
  };
}

export interface CalendarAttendanceData {
  date: string; // ISO date string
  status: 'present' | 'absent' | 'none';
  timeIn?: Date;
  timeOut?: Date;
  duration?: number; // in milliseconds
  location?: string;
  biometricMethod?: 'face' | 'fingerprint' | 'external_fingerprint';
  confidence?: number;
  attendanceId?: string;
}

export interface UpdateAttendanceRequest {
  status?: 'present' | 'absent';
  timeIn?: Date;
  timeOut?: Date;
  location?: string;
  notes?: string;
}

// External Fingerprint Sensor Types
export interface ExternalFingerprintData {
  template: string; // Base64 encoded fingerprint template
  quality: number; // 0-100 quality score
  sensorId: string; // Device identifier
  sensorType: 'digital_persona' | 'zkteco' | 'mantra' | 'generic';
  capturedAt: Date;
  metadata?: {
    width?: number;
    height?: number;
    dpi?: number;
    templateVersion?: string;
  };
}

export interface SensorInfo {
  id: string;
  name: string;
  manufacturer: string;
  type: string;
  vendorId: number;
  productId: number;
  status: 'ready' | 'busy' | 'error';
  capabilities?: string[];
}

export interface SensorEvent {
  type: 'connected' | 'disconnected' | 'capture_progress' | 'capture_complete' | 'error';
  deviceId: string;
  data?: any;
  timestamp: Date;
}

export interface CaptureOptions {
  timeout?: number; // Capture timeout in ms
  quality?: number; // Minimum quality threshold (0-100)
  maxRetries?: number; // Maximum capture attempts
  captureMode?: 'enrollment' | 'verification';
}

export interface TemplateMatchResult {
  match: boolean;
  confidence: number; // 0-1 confidence score
  error?: string;
}

// Updated attendance types to include external fingerprint
export interface IAttendanceExtended extends Document {
  _id: string;
  student: string;
  studentId: string;
  date: Date;
  timeIn: Date;
  timeOut?: Date;
  status: 'present' | 'absent';
  confidence?: number;
  biometricMethod: 'face' | 'fingerprint' | 'external_fingerprint';
  fingerprintMode?: 'webauthn' | 'external';
  sensorInfo?: {
    sensorId: string;
    sensorType: string;
    quality: number;
  };
  location: string;
  loginPhotoUrl?: string;
  logoutPhotoUrl?: string;
  whatsappNotificationSent: boolean;
  deviceInfo: {
    userAgent?: string;
    ip?: string;
  };
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
