import { Request, Response } from "express";
import Student from "../models/Student";
import Attendance from "../models/Attendance";
import { FingerprintService } from "../services/fingerprintService";
import { eventService } from "../services/eventService";
import { sensorManager } from "../services/sensorManager";
import {
  ApiResponse,
  FingerprintVerificationRequest,
  ExternalFingerprintData,
  MarkAttendanceRequest,
} from "../types";

/**
 * Generate challenge for fingerprint enrollment/authentication
 */
export const generateChallenge = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const challenge = FingerprintService.generateChallenge();

    const response: ApiResponse = {
      success: true,
      message: "Challenge generated successfully",
      data: { challenge },
    };

    res.json(response);
  } catch (error: any) {
    console.error("❌ Challenge generation error:", error);

    const response: ApiResponse = {
      success: false,
      message: "Failed to generate challenge",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    };

    res.status(500).json(response);
  }
};

/**
 * Verify fingerprint and mark attendance (supports both WebAuthn and external sensors)
 */
export const markAttendanceWithFingerprint = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      fingerprintData,
      location = "Main Campus",
      notes,
      action = "auto",
      fingerprintMode = "webauthn",
    }: MarkAttendanceRequest & { fingerprintMode?: string } = req.body;

    if (!fingerprintData) {
      const response: ApiResponse = {
        success: false,
        message: "Fingerprint data is required",
      };
      res.status(400).json(response);
      return;
    }

    let student: any = null;
    let biometricMethod: "fingerprint" | "external_fingerprint" = "fingerprint";
    let sensorInfo: any = null;

    // Handle external sensor authentication
    if (fingerprintMode === "external") {
      const externalData = fingerprintData as ExternalFingerprintData;

      if (!externalData.template || !externalData.sensorType) {
        const response: ApiResponse = {
          success: false,
          message:
            "Invalid external fingerprint data. Template and sensor type are required.",
        };
        res.status(400).json(response);
        return;
      }

      // Find all students with external fingerprint enrolled
      const students = await Student.find({
        externalFingerprintTemplate: { $exists: true },
        isActive: true,
      }).select("+externalFingerprintTemplate");

      // Match against all enrolled templates
      let bestMatch = { student: null as any, confidence: 0 };

      for (const s of students) {
        try {
          const result = await FingerprintService.verifyExternalTemplate(
            externalData.template,
            s.externalFingerprintTemplate!,
            externalData.sensorType
          );

          if (result.match && result.confidence > bestMatch.confidence) {
            bestMatch = { student: s, confidence: result.confidence };
          }
        } catch (error) {
          console.error(
            `Error matching template for student ${s.studentId}:`,
            error
          );
        }
      }

      if (!bestMatch.student || bestMatch.confidence < 0.75) {
        const response: ApiResponse = {
          success: false,
          message:
            "No matching fingerprint found. Please ensure your fingerprint is enrolled.",
        };
        res.status(404).json(response);
        return;
      }

      student = bestMatch.student;
      biometricMethod = "external_fingerprint";
      sensorInfo = {
        sensorId: externalData.sensorId,
        sensorType: externalData.sensorType,
        quality: externalData.quality,
      };
    } else {
      // Handle WebAuthn authentication
      const webAuthnData = fingerprintData as FingerprintVerificationRequest;

      if (!webAuthnData.credentialId) {
        const response: ApiResponse = {
          success: false,
          message: "WebAuthn credential ID is required",
        };
        res.status(400).json(response);
        return;
      }

      // Validate credential ID format
      if (!FingerprintService.isValidCredentialId(webAuthnData.credentialId)) {
        const response: ApiResponse = {
          success: false,
          message: "Invalid credential ID format",
        };
        res.status(400).json(response);
        return;
      }

      // Find student with this credential ID
      student = await Student.findOne({
        fingerprintCredentialId: webAuthnData.credentialId,
        isActive: true,
      });

      if (!student) {
        const response: ApiResponse = {
          success: false,
          message:
            "No matching student found. Please ensure you are enrolled with fingerprint.",
        };
        res.status(404).json(response);
        return;
      }

      // Verify the fingerprint assertion
      const isValid = await FingerprintService.verifyAssertion(
        webAuthnData,
        student.fingerprintPublicKey!
      );

      if (!isValid) {
        const response: ApiResponse = {
          success: false,
          message: "Fingerprint verification failed. Please try again.",
        };
        res.status(401).json(response);
        return;
      }

      // Update counter to prevent replay attacks
      if (student.fingerprintCounter !== undefined) {
        student.fingerprintCounter += 1;
        await student.save();
      }

      biometricMethod = "fingerprint";
    }

    // Check current login status for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingAttendance = await Attendance.findOne({
      student: student._id,
      date: { $gte: today },
    });

    // Intelligent login/logout detection
    let actionType: "login" | "logout" = "login";

    if (action === "auto") {
      if (
        existingAttendance &&
        existingAttendance.timeIn &&
        !existingAttendance.timeOut
      ) {
        actionType = "logout";
      } else if (existingAttendance && existingAttendance.timeOut) {
        const response: ApiResponse = {
          success: false,
          message: "You have already completed your attendance for today",
          data: {
            studentId: student.studentId,
            name: student.name,
            timeIn: existingAttendance.timeIn,
            timeOut: existingAttendance.timeOut,
            isLoggedIn: false,
          },
        };
        res.status(400).json(response);
        return;
      }
    } else {
      actionType = action as "login" | "logout";
    }

    // Handle logout
    if (actionType === "logout") {
      if (!existingAttendance || !existingAttendance.timeIn) {
        const response: ApiResponse = {
          success: false,
          message: "You must login first before logging out",
          data: { isLoggedIn: false },
        };
        res.status(400).json(response);
        return;
      }

      if (existingAttendance.timeOut) {
        const response: ApiResponse = {
          success: false,
          message: "You have already logged out for today",
          data: {
            studentId: student.studentId,
            name: student.name,
            timeIn: existingAttendance.timeIn,
            timeOut: existingAttendance.timeOut,
            isLoggedIn: false,
          },
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
        action: "logout",
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
          action: "logout",
          isLoggedIn: false,
          biometricMethod,
          sensorInfo,
        },
      };

      res.json(response);
      return;
    }

    // Handle login
    const now = new Date();
    const status = "present";

    const clientIP = req.ip || req.connection.remoteAddress || "127.0.0.1";
    const cleanIP = clientIP.replace(/^::ffff:/, "");

    const attendanceData: any = {
      student: student._id,
      studentId: student.studentId,
      timeIn: now,
      status,
      biometricMethod,
      location,
      notes,
      deviceInfo: {
        userAgent: req.get("User-Agent") || "Unknown",
        ip: cleanIP,
      },
    };

    // Add sensor information for external fingerprint
    if (biometricMethod === "external_fingerprint" && sensorInfo) {
      attendanceData.fingerprintMode = "external";
      attendanceData.sensorInfo = sensorInfo;
    } else if (biometricMethod === "fingerprint") {
      attendanceData.fingerprintMode = "webauthn";
    }

    const attendance = new Attendance(attendanceData);

    await attendance.save();

    eventService.emitAttendanceMarked({
      studentId: student.studentId,
      name: student.name,
      timeIn: attendance.timeIn,
      confidence: 1.0,
      status: attendance.status,
      action: "login",
    });

    const response: ApiResponse = {
      success: true,
      message: "Login successful! Have a great day!",
      data: {
        studentId: student.studentId,
        name: student.name,
        timeIn: attendance.timeIn,
        status: attendance.status,
        location: attendance.location,
        action: "login",
        isLoggedIn: true,
        biometricMethod,
        sensorInfo,
      },
    };

    res.json(response);
  } catch (error: any) {
    console.error("❌ Fingerprint attendance error:", error);

    const response: ApiResponse = {
      success: false,
      message: "Fingerprint attendance marking failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    };

    res.status(500).json(response);
  }
};

/**
 * Check login status using fingerprint
 */
export const checkLoginStatusWithFingerprint = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      fingerprintData,
    }: { fingerprintData: FingerprintVerificationRequest } = req.body;

    if (!fingerprintData || !fingerprintData.credentialId) {
      const response: ApiResponse = {
        success: false,
        message: "Fingerprint data is required",
      };
      res.status(400).json(response);
      return;
    }

    // Find student with this credential ID
    const student = await Student.findOne({
      fingerprintCredentialId: fingerprintData.credentialId,
      isActive: true,
    });

    if (!student) {
      const response: ApiResponse = {
        success: true,
        message: "Student not recognized",
        data: { isLoggedIn: false },
      };
      res.json(response);
      return;
    }

    // Check today's attendance
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingAttendance = await Attendance.findOne({
      student: student._id,
      date: { $gte: today },
    });

    if (!existingAttendance || !existingAttendance.timeIn) {
      const response: ApiResponse = {
        success: true,
        message: "Not logged in",
        data: {
          isLoggedIn: false,
          studentId: student.studentId,
          name: student.name,
        },
      };
      res.json(response);
      return;
    }

    const isLoggedIn = !existingAttendance.timeOut;
    const duration = isLoggedIn
      ? Date.now() - existingAttendance.timeIn.getTime()
      : existingAttendance.timeOut!.getTime() -
        existingAttendance.timeIn.getTime();

    const response: ApiResponse = {
      success: true,
      message: isLoggedIn ? "Currently logged in" : "Already logged out",
      data: {
        isLoggedIn,
        studentId: student.studentId,
        name: student.name,
        timeIn: existingAttendance.timeIn,
        duration,
        location: existingAttendance.location,
      },
    };

    res.json(response);
  } catch (error: any) {
    console.error("❌ Fingerprint login status check error:", error);

    const response: ApiResponse = {
      success: false,
      message: "Failed to check login status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    };

    res.status(500).json(response);
  }
};

/**
 * Enumerate available sensors
 */
export const enumerateSensors = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const sensors = await sensorManager.enumerateSensors();

    const response: ApiResponse = {
      success: true,
      message: "Sensors enumerated successfully",
      data: {
        sensors,
        count: sensors.length,
        timestamp: new Date().toISOString(),
      },
    };

    res.json(response);
  } catch (error: any) {
    console.error("❌ Sensor enumeration error:", error);

    const response: ApiResponse = {
      success: false,
      message: "Failed to enumerate sensors",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    };

    res.status(500).json(response);
  }
};

/**
 * Capture fingerprint from external sensor
 */
export const captureFingerprintFromSensor = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { sensorId, options } = req.body;

    if (!sensorId) {
      const response: ApiResponse = {
        success: false,
        message: "sensorId is required",
      };
      res.status(400).json(response);
      return;
    }

    // Check if sensor exists and is available
    const sensorInfo = await sensorManager.getSensorInfo(sensorId);
    if (!sensorInfo) {
      const response: ApiResponse = {
        success: false,
        message: "Sensor not found or not available",
      };
      res.status(404).json(response);
      return;
    }

    // Capture fingerprint template
    const template = await sensorManager.captureFromSensor(sensorId, {
      timeout: options?.timeout || 30000,
      quality: options?.quality || 70,
      maxRetries: options?.maxRetries || 3,
      captureMode: options?.captureMode || "verification",
    });

    const response: ApiResponse = {
      success: true,
      message: "Fingerprint captured successfully",
      data: {
        template: template.template,
        quality: template.quality,
        sensorId: template.sensorId,
        sensorType: template.sensorType,
        capturedAt: template.capturedAt,
        metadata: template.metadata,
      },
    };

    res.json(response);
  } catch (error: any) {
    console.error("❌ Fingerprint capture error:", error);

    const response: ApiResponse = {
      success: false,
      message: "Failed to capture fingerprint",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    };

    res.status(500).json(response);
  }
};

/**
 * Enroll external fingerprint template for a student
 */
export const enrollExternalFingerprint = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { studentId, externalFingerprintData } = req.body;

    if (!studentId || !externalFingerprintData) {
      const response: ApiResponse = {
        success: false,
        message: "Student ID and external fingerprint data are required",
      };
      res.status(400).json(response);
      return;
    }

    // Find the student
    const student = await Student.findOne({
      studentId: studentId.toUpperCase(),
      isActive: true,
    });
    if (!student) {
      const response: ApiResponse = {
        success: false,
        message: "Student not found",
      };
      res.status(404).json(response);
      return;
    }

    // Encrypt the template for secure storage
    const encryptedTemplate = FingerprintService.encryptTemplate(
      externalFingerprintData.template
    );

    // Update student with external fingerprint data
    student.externalFingerprintTemplate = encryptedTemplate;
    student.externalFingerprintSensorType = externalFingerprintData.sensorType;
    student.fingerprintMode = student.fingerprintCredentialId
      ? "both"
      : "external";
    student.externalFingerprintMetadata = {
      quality: externalFingerprintData.quality,
      capturedAt: new Date(),
      sensorId: externalFingerprintData.sensorId,
      templateVersion: "1.0",
      deviceInfo: externalFingerprintData.metadata,
    };

    await student.save();

    const response: ApiResponse = {
      success: true,
      message: "External fingerprint enrolled successfully",
      data: {
        studentId: student.studentId,
        name: student.name,
        fingerprintMode: student.fingerprintMode,
        biometricMethods: student.biometricMethods,
      },
    };

    res.json(response);
  } catch (error: any) {
    console.error("❌ External fingerprint enrollment error:", error);

    const response: ApiResponse = {
      success: false,
      message: "Failed to enroll external fingerprint",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    };

    res.status(500).json(response);
  }
};

/**
 * Get sensor health status
 */
export const getSensorHealthStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const health = await sensorManager.getHealthStatus();
    const connectionStatus = sensorManager.getConnectionStatus();

    const response: ApiResponse = {
      success: true,
      message: "Sensor health status retrieved",
      data: {
        ...health,
        connectionStatus,
        timestamp: new Date().toISOString(),
      },
    };

    res.json(response);
  } catch (error: any) {
    console.error("❌ Sensor health check error:", error);

    const response: ApiResponse = {
      success: false,
      message: "Failed to get sensor health status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    };

    res.status(500).json(response);
  }
};
