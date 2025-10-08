import { Request, Response } from 'express';
import Student from '../models/Student';
import Attendance from '../models/Attendance';
import { FingerprintService } from '../services/fingerprintService';
import { eventService } from '../services/eventService';
import { ApiResponse, FingerprintVerificationRequest } from '../types';

/**
 * Generate challenge for fingerprint enrollment/authentication
 */
export const generateChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    const challenge = FingerprintService.generateChallenge();
    
    const response: ApiResponse = {
      success: true,
      message: 'Challenge generated successfully',
      data: { challenge }
    };
    
    res.json(response);
  } catch (error: any) {
    console.error('❌ Challenge generation error:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'Failed to generate challenge',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
    
    res.status(500).json(response);
  }
};

/**
 * Verify fingerprint and mark attendance
 */
export const markAttendanceWithFingerprint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      fingerprintData, 
      location = 'Main Campus', 
      notes, 
      action = 'auto' 
    }: {
      fingerprintData: FingerprintVerificationRequest;
      location?: string;
      notes?: string;
      action?: 'auto' | 'login' | 'logout';
    } = req.body;
    
    if (!fingerprintData || !fingerprintData.credentialId) {
      const response: ApiResponse = {
        success: false,
        message: 'Fingerprint data is required'
      };
      res.status(400).json(response);
      return;
    }

    // Validate credential ID format
    if (!FingerprintService.isValidCredentialId(fingerprintData.credentialId)) {
      const response: ApiResponse = {
        success: false,
        message: 'Invalid credential ID format'
      };
      res.status(400).json(response);
      return;
    }

    // Find student with this credential ID
    const student = await Student.findOne({ 
      fingerprintCredentialId: fingerprintData.credentialId,
      isActive: true 
    });
    
    if (!student) {
      const response: ApiResponse = {
        success: false,
        message: 'No matching student found. Please ensure you are enrolled with fingerprint.'
      };
      res.status(404).json(response);
      return;
    }

    // Verify the fingerprint assertion
    const isValid = await FingerprintService.verifyAssertion(
      fingerprintData,
      student.fingerprintPublicKey!
    );

    if (!isValid) {
      const response: ApiResponse = {
        success: false,
        message: 'Fingerprint verification failed. Please try again.'
      };
      res.status(401).json(response);
      return;
    }

    // Update counter to prevent replay attacks
    if (student.fingerprintCounter !== undefined) {
      student.fingerprintCounter += 1;
      await student.save();
    }

    // Check current login status for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const existingAttendance = await Attendance.findOne({
      student: student._id,
      date: { $gte: today }
    });
    
    // Intelligent login/logout detection
    let actionType: 'login' | 'logout' = 'login';
    
    if (action === 'auto') {
      if (existingAttendance && existingAttendance.timeIn && !existingAttendance.timeOut) {
        actionType = 'logout';
      } else if (existingAttendance && existingAttendance.timeOut) {
        const response: ApiResponse = {
          success: false,
          message: 'You have already completed your attendance for today',
          data: {
            studentId: student.studentId,
            name: student.name,
            timeIn: existingAttendance.timeIn,
            timeOut: existingAttendance.timeOut,
            isLoggedIn: false
          }
        };
        res.status(400).json(response);
        return;
      }
    } else {
      actionType = action as 'login' | 'logout';
    }
    
    // Handle logout
    if (actionType === 'logout') {
      if (!existingAttendance || !existingAttendance.timeIn) {
        const response: ApiResponse = {
          success: false,
          message: 'You must login first before logging out',
          data: { isLoggedIn: false }
        };
        res.status(400).json(response);
        return;
      }
      
      if (existingAttendance.timeOut) {
        const response: ApiResponse = {
          success: false,
          message: 'You have already logged out for today',
          data: {
            studentId: student.studentId,
            name: student.name,
            timeIn: existingAttendance.timeIn,
            timeOut: existingAttendance.timeOut,
            isLoggedIn: false
          }
        };
        res.status(400).json(response);
        return;
      }
      
      const now = new Date();
      existingAttendance.timeOut = now;
      await existingAttendance.save();
      
      const duration = now.getTime() - existingAttendance.timeIn.getTime();
      const hours = Math.floor(duration / (1000 * 60 * 60));
      const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
      
      eventService.emitAttendanceMarked({
        studentId: student.studentId,
        name: student.name,
        timeIn: existingAttendance.timeIn,
        confidence: 1.0,
        status: existingAttendance.status,
        action: 'logout'
      });
      
      const response: ApiResponse = {
        success: true,
        message: `Logout successful! Total time: ${hours}h ${minutes}m`,
        data: {
          studentId: student.studentId,
          name: student.name,
          timeIn: existingAttendance.timeIn,
          timeOut: now,
          duration,
          status: existingAttendance.status,
          location: existingAttendance.location,
          action: 'logout',
          isLoggedIn: false,
          biometricMethod: 'fingerprint'
        }
      };
      
      res.json(response);
      return;
    }
    
    // Handle login
    const now = new Date();
    const status = 'present';
    
    const clientIP = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const cleanIP = clientIP.replace(/^::ffff:/, '');
    
    const attendance = new Attendance({
      student: student._id,
      studentId: student.studentId,
      timeIn: now,
      status,
      biometricMethod: 'fingerprint',
      location,
      notes,
      deviceInfo: {
        userAgent: req.get('User-Agent') || 'Unknown',
        ip: cleanIP
      }
    });
    
    await attendance.save();
    
    eventService.emitAttendanceMarked({
      studentId: student.studentId,
      name: student.name,
      timeIn: attendance.timeIn,
      confidence: 1.0,
      status: attendance.status,
      action: 'login'
    });
    
    const response: ApiResponse = {
      success: true,
      message: 'Login successful! Have a great day!',
      data: {
        studentId: student.studentId,
        name: student.name,
        timeIn: attendance.timeIn,
        status: attendance.status,
        location: attendance.location,
        action: 'login',
        isLoggedIn: true,
        biometricMethod: 'fingerprint'
      }
    };
    
    res.json(response);
    
  } catch (error: any) {
    console.error('❌ Fingerprint attendance error:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'Fingerprint attendance marking failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
    
    res.status(500).json(response);
  }
};

/**
 * Check login status using fingerprint
 */
export const checkLoginStatusWithFingerprint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fingerprintData }: { fingerprintData: FingerprintVerificationRequest } = req.body;
    
    if (!fingerprintData || !fingerprintData.credentialId) {
      const response: ApiResponse = {
        success: false,
        message: 'Fingerprint data is required'
      };
      res.status(400).json(response);
      return;
    }

    // Find student with this credential ID
    const student = await Student.findOne({ 
      fingerprintCredentialId: fingerprintData.credentialId,
      isActive: true 
    });
    
    if (!student) {
      const response: ApiResponse = {
        success: true,
        message: 'Student not recognized',
        data: { isLoggedIn: false }
      };
      res.json(response);
      return;
    }

    // Check today's attendance
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const existingAttendance = await Attendance.findOne({
      student: student._id,
      date: { $gte: today }
    });
    
    if (!existingAttendance || !existingAttendance.timeIn) {
      const response: ApiResponse = {
        success: true,
        message: 'Not logged in',
        data: {
          isLoggedIn: false,
          studentId: student.studentId,
          name: student.name
        }
      };
      res.json(response);
      return;
    }
    
    const isLoggedIn = !existingAttendance.timeOut;
    const duration = isLoggedIn 
      ? Date.now() - existingAttendance.timeIn.getTime() 
      : existingAttendance.timeOut!.getTime() - existingAttendance.timeIn.getTime();
    
    const response: ApiResponse = {
      success: true,
      message: isLoggedIn ? 'Currently logged in' : 'Already logged out',
      data: {
        isLoggedIn,
        studentId: student.studentId,
        name: student.name,
        timeIn: existingAttendance.timeIn,
        duration,
        location: existingAttendance.location
      }
    };
    
    res.json(response);
    
  } catch (error: any) {
    console.error('❌ Fingerprint login status check error:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'Failed to check login status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
    
    res.status(500).json(response);
  }
};

