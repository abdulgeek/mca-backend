import { Document } from 'mongoose';

export interface IStudent extends Document {
  _id: string;
  studentId: string;
  name: string;
  email: string;
  phone: string;
  course: string;
  faceDescriptor: number[];
  faceImage: string;
  profileImageUrl?: string; // S3 URL for profile image
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
  confidence: number;
  location: string;
  loginPhotoUrl?: string; // S3 URL for login photo
  logoutPhotoUrl?: string; // S3 URL for logout photo
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
  faceImage: string;
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
  faceImage: string;
  location?: string;
  notes?: string;
  action?: 'auto' | 'login' | 'logout';
}
