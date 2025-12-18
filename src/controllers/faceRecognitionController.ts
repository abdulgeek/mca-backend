import { Request, Response } from "express";
import Student from "../models/Student";
import Attendance from "../models/Attendance";
import {
  extractFaceDescriptor,
  findBestMatch,
  preprocessImage,
  isModelsLoaded,
} from "../middleware/faceRecognition";
import { eventService } from "../services/eventService";
import { cloudinaryService } from "../services/cloudinaryService";
import {
  ApiResponse,
  EnrollStudentRequest,
  MarkAttendanceRequest,
  LoginStatusResponse,
  AbsentStudent,
} from "../types";
import { generateStudentId } from "../utils/idGenerator";
import {
  generateWhatsAppLink,
  generateAbsenceMessage,
} from "../utils/whatsapp";
import { FingerprintService } from "../services/fingerprintService";

export const enrollStudent = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      name,
      email,
      phone,
      course,
      fatherName,
      bloodGroup,
      faceImage,
      fingerprintData,
      externalFingerprintData,
      fingerprintMode,
    }: EnrollStudentRequest = req.body;

    // Validate required fields
    if (!name || !email || !phone || !course) {
      const response: ApiResponse = {
        success: false,
        message:
          "Missing required fields: name, email, phone, and course are required",
      };
      res.status(400).json(response);
      return;
    }

    // Validate at least one biometric method is provided
    if (!faceImage && !fingerprintData && !externalFingerprintData) {
      const response: ApiResponse = {
        success: false,
        message:
          "At least one biometric method (face image, fingerprint data, or external fingerprint data) must be provided",
      };
      res.status(400).json(response);
      return;
    }

    // Generate unique student ID
    const studentId = generateStudentId(course);

    // Check if face recognition is needed but models aren't loaded
    if (faceImage && !isModelsLoaded()) {
      const response: ApiResponse = {
        success: false,
        message: "Face recognition models not loaded. Please try again later.",
      };
      res.status(503).json(response);
      return;
    }

    // Check if student already exists with email or phone
    const existingStudent = await Student.findOne({
      $or: [{ email: email.toLowerCase() }, { phone: phone }],
    });

    if (existingStudent) {
      const response: ApiResponse = {
        success: false,
        message: "Student already exists with this email or phone number",
      };
      res.status(400).json(response);
      return;
    }

    // Process face image if provided
    let faceDescriptor: Float32Array | undefined;
    if (faceImage) {
      console.log(`📷 Processing face image for ${name} (${studentId})`);
      console.log(`📷 Image data length: ${faceImage.length} characters`);

      try {
        const imageBuffer = Buffer.from(faceImage.split(",")[1], "base64");
        console.log(`📷 Buffer size: ${imageBuffer.length} bytes`);

        const processedImage = await preprocessImage(imageBuffer);
        console.log(`📷 Processed image size: ${processedImage.length} bytes`);

        faceDescriptor = await extractFaceDescriptor(processedImage);
        console.log(
          `📷 Face descriptor extracted: ${faceDescriptor.length} dimensions`
        );
      } catch (faceError: any) {
        console.error("❌ Face processing error:", faceError);
        const response: ApiResponse = {
          success: false,
          message:
            "Face processing failed. Please ensure your face is clearly visible and try again.",
          error: faceError.message || "Unknown error",
        };
        res.status(400).json(response);
        return;
      }
    }

    // Process external fingerprint data if provided
    let encryptedTemplate: string | undefined;
    let externalFingerprintMetadata: any;
    if (externalFingerprintData) {
      console.log(
        `🖐️ Processing external fingerprint data for ${name} (${studentId})`
      );
      console.log(
        `🖐️ Sensor type: ${externalFingerprintData.sensorType}, Quality: ${externalFingerprintData.quality}`
      );

      try {
        encryptedTemplate = FingerprintService.encryptTemplate(
          externalFingerprintData.template
        );
        externalFingerprintMetadata = {
          quality: externalFingerprintData.quality,
          capturedAt: new Date(externalFingerprintData.capturedAt),
          sensorId: externalFingerprintData.sensorId,
          templateVersion:
            externalFingerprintData.metadata?.templateVersion || "2.0",
          deviceInfo: externalFingerprintData.metadata,
        };
        console.log(`🖐️ External fingerprint processed successfully`);
      } catch (fingerprintError: any) {
        console.error(
          "❌ External fingerprint processing error:",
          fingerprintError
        );
        const response: ApiResponse = {
          success: false,
          message: "External fingerprint processing failed. Please try again.",
          error: fingerprintError.message || "Unknown error",
        };
        res.status(400).json(response);
        return;
      }
    }

    // Determine biometric methods
    const biometricMethods: (
      | "face"
      | "fingerprint"
      | "external_fingerprint"
    )[] = [];
    if (faceImage && faceDescriptor) biometricMethods.push("face");
    if (fingerprintData) biometricMethods.push("fingerprint");
    if (externalFingerprintData && encryptedTemplate)
      biometricMethods.push("external_fingerprint");

    // Create new student first to get MongoDB ID
    const studentData: any = {
      studentId: studentId.toUpperCase(),
      name,
      email: email.toLowerCase(),
      phone,
      course,
      fatherName,
      bloodGroup: bloodGroup && bloodGroup !== "" ? bloodGroup : undefined,
      // biometricMethods will be set automatically by pre-save middleware
    };

    // Only add face-related fields if we have valid face data
    if (faceDescriptor && faceDescriptor.length === 128) {
      studentData.faceDescriptor = Array.from(faceDescriptor);
      console.log(
        `✅ Setting faceDescriptor with ${faceDescriptor.length} elements`
      );
    } else {
      console.log(
        `ℹ️ No faceDescriptor to set (faceDescriptor: ${
          faceDescriptor ? faceDescriptor.length + " elements" : "undefined"
        })`
      );
      // Explicitly set to undefined to prevent Mongoose from defaulting to empty array
      studentData.faceDescriptor = undefined;
    }
    if (faceImage) {
      studentData.faceImage = faceImage;
      console.log(`✅ Setting faceImage`);
    }

    // Add WebAuthn fingerprint fields if provided
    if (fingerprintData) {
      studentData.fingerprintCredentialId = fingerprintData.credentialId;
      studentData.fingerprintPublicKey = fingerprintData.publicKey;
      studentData.fingerprintCounter = fingerprintData.counter || 0;
    }

    // Add external fingerprint fields if provided
    if (externalFingerprintData && encryptedTemplate) {
      studentData.externalFingerprintTemplate = encryptedTemplate;
      studentData.externalFingerprintSensorType =
        externalFingerprintData.sensorType;
      studentData.externalFingerprintMetadata = externalFingerprintMetadata;
    }

    // Set fingerprint mode
    studentData.fingerprintMode =
      fingerprintMode ||
      (externalFingerprintData
        ? "external"
        : fingerprintData
        ? "webauthn"
        : "webauthn"); // default to webauthn

    console.log(`📊 Final studentData:`, {
      ...studentData,
      faceDescriptor: studentData.faceDescriptor
        ? `Array(${studentData.faceDescriptor.length})`
        : "undefined",
      externalFingerprintTemplate: studentData.externalFingerprintTemplate
        ? "encrypted_data"
        : "undefined",
    });

    const student = new Student(studentData);

    await student.save();

    // Upload profile image to Cloudinary if face image is provided
    if (faceImage) {
      console.log(
        `📤 Uploading profile image to Cloudinary for ${name} (${studentId})`
      );
      console.log(
        `📁 Folder structure: students/${name
          .toLowerCase()
          .replace(/\s+/g, "-")}/${student._id}/images/`
      );

      const profileUploadResult = await cloudinaryService.uploadProfileImage(
        faceImage,
        studentId.toUpperCase(),
        name,
        student._id.toString()
      );

      if (!profileUploadResult.success) {
        console.error(
          "❌ Profile image upload failed:",
          profileUploadResult.error
        );
        // Continue with enrollment even if Cloudinary upload fails
        console.log(
          "⚠️ Continuing with enrollment despite Cloudinary upload failure"
        );
      } else {
        console.log(
          `✅ Profile image uploaded successfully: ${profileUploadResult.url}`
        );
        // Update student with Cloudinary URL
        student.profileImageUrl = profileUploadResult.url;
        await student.save();
      }
    }

    // Emit student enrolled event
    eventService.emitStudentEnrolled({
      studentId: student.studentId,
      name: student.name,
      email: student.email,
      course: student.course,
    });

    const response: ApiResponse = {
      success: true,
      message: "Student enrolled successfully",
      data: {
        id: student._id,
        studentId: student.studentId,
        name: student.name,
        email: student.email,
        phone: student.phone,
        course: student.course,
        profileImageUrl: student.profileImageUrl,
        biometricMethods: student.biometricMethods,
      },
    };

    res.status(201).json(response);
  } catch (error: any) {
    console.error("❌ Enrollment error:", error);

    let message = "Enrollment failed";
    if (error.message.includes("No face detected")) {
      message =
        "No face detected in the image. Please ensure your face is clearly visible.";
    } else if (error.message.includes("Multiple faces detected")) {
      message =
        "Multiple faces detected. Please ensure only one face is visible.";
    } else if (error.message.includes("Face quality")) {
      message = "Face quality is too low. Please take a clearer photo.";
    }

    const response: ApiResponse = {
      success: false,
      message: message,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    };

    res.status(500).json(response);
  }
};

export const markAttendance = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      faceImage,
      biometricMethod = "face",
      location = "Main Campus",
      notes,
      action = "auto",
    }: MarkAttendanceRequest = req.body;

    // If fingerprint is selected, redirect to fingerprint controller
    if (biometricMethod === "fingerprint") {
      const response: ApiResponse = {
        success: false,
        message:
          "Please use the fingerprint-specific endpoint for fingerprint attendance",
      };
      res.status(400).json(response);
      return;
    }

    if (!faceImage) {
      const response: ApiResponse = {
        success: false,
        message: "Face image is required",
      };
      res.status(400).json(response);
      return;
    }

    if (!isModelsLoaded()) {
      const response: ApiResponse = {
        success: false,
        message: "Face recognition models not loaded. Please try again later.",
      };
      res.status(503).json(response);
      return;
    }

    // Process and extract face descriptor
    const imageBuffer = Buffer.from(faceImage.split(",")[1], "base64");
    const processedImage = await preprocessImage(imageBuffer);
    const probeDescriptor = await extractFaceDescriptor(processedImage);

    // Get all active students with their face descriptors (only those with face enrolled)
    const students = await Student.find({
      isActive: true,
      faceDescriptor: { $exists: true, $ne: [] },
    }).select("_id studentId name faceDescriptor");

    console.log(
      `🔍 Found ${students.length} students enrolled with face recognition`
    );

    if (students.length === 0) {
      const response: ApiResponse = {
        success: false,
        message: "No students enrolled with face recognition",
      };
      res.status(404).json(response);
      return;
    }

    // Find best match - filter students to ensure they have faceDescriptor
    const studentsWithFace = students.filter(
      (s) => s.faceDescriptor && s.faceDescriptor.length === 128
    );
    console.log(
      `🔍 Searching for face match among ${studentsWithFace.length} students with threshold 0.6...`
    );
    const match = await findBestMatch(
      probeDescriptor,
      studentsWithFace as any,
      0.6
    );

    if (match) {
      console.log(
        `✅ Found match: ${match.name} (${
          match.studentIdString
        }) with confidence ${match.confidence.toFixed(3)}`
      );
    } else {
      console.log(`❌ No match found above threshold 0.6`);
    }

    if (!match) {
      const response: ApiResponse = {
        success: false,
        message:
          "No matching student found. Please ensure you are enrolled in the system.",
        data: { confidence: 0 },
      };
      res.status(404).json(response);
      return;
    }

    // Check current login status for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingAttendance = await Attendance.findOne({
      student: match.studentId,
      date: { $gte: today },
    });

    // Intelligent login/logout detection
    let actionType: "login" | "logout" = "login";

    if (action === "auto") {
      // Auto-detect: if already logged in (has timeIn but no timeOut), then logout
      if (
        existingAttendance &&
        existingAttendance.timeIn &&
        !existingAttendance.timeOut
      ) {
        actionType = "logout";
      } else if (existingAttendance && existingAttendance.timeOut) {
        // Already completed login/logout cycle for today
        const response: ApiResponse = {
          success: false,
          message: "You have already completed your attendance for today",
          data: {
            studentId: match.studentIdString,
            name: match.name,
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
            studentId: match.studentIdString,
            name: match.name,
            timeIn: existingAttendance.timeIn,
            timeOut: existingAttendance.timeOut,
            isLoggedIn: false,
          },
        };
        res.status(400).json(response);
        return;
      }

      // Process logout
      const now = new Date();
      existingAttendance.timeOut = now;

      // Upload logout image to Cloudinary
      console.log(
        `📤 Uploading logout image to Cloudinary for ${match.name} (${match.studentIdString})`
      );
      const logoutUploadResult = await cloudinaryService.uploadAttendanceImage(
        faceImage,
        match.studentIdString,
        match.name,
        match.studentId,
        now,
        "logout"
      );

      if (logoutUploadResult.success) {
        console.log(
          `✅ Logout image uploaded successfully: ${logoutUploadResult.url}`
        );
        existingAttendance.logoutPhotoUrl = logoutUploadResult.url;
      }

      await existingAttendance.save();

      // Calculate duration
      const duration = now.getTime() - existingAttendance.timeIn.getTime();
      const hours = Math.floor(duration / (1000 * 60 * 60));
      const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));

      // Emit logout event
      eventService.emitAttendanceMarked({
        studentId: match.studentIdString,
        name: match.name,
        timeIn: existingAttendance.timeIn,
        confidence: match.confidence,
        status: existingAttendance.status,
        action: "logout",
      });

      const response: ApiResponse = {
        success: true,
        message: `Logout successful! Total time: ${hours}h ${minutes}m`,
        data: {
          studentId: match.studentIdString,
          name: match.name,
          timeIn: existingAttendance.timeIn,
          timeOut: now,
          duration: duration,
          status: existingAttendance.status,
          confidence: match.confidence,
          location: existingAttendance.location,
          action: "logout",
          isLoggedIn: false,
        },
      };

      res.json(response);
      return;
    }

    const now = new Date();
    const status = "present";

    // Get client IP address with fallback
    const clientIP = req.ip || req.connection.remoteAddress || "127.0.0.1"; // fallback to localhost

    // Clean up IP address (remove IPv6 prefix if present)
    const cleanIP = clientIP.replace(/^::ffff:/, "");

    // Upload login image to Cloudinary with organized folder structure
    console.log(
      `📤 Uploading login image to Cloudinary for ${match.name} (${match.studentIdString})`
    );
    console.log(
      `📁 Folder structure: students/${match.name
        .toLowerCase()
        .replace(/\s+/g, "-")}/${match.studentId}/images/`
    );

    const loginUploadResult = await cloudinaryService.uploadAttendanceImage(
      faceImage,
      match.studentIdString,
      match.name,
      match.studentId,
      now,
      "login"
    );

    if (!loginUploadResult.success) {
      console.error("❌ Login image upload failed:", loginUploadResult.error);
      // Continue with attendance marking even if image upload fails
      console.log(
        "⚠️ Continuing with attendance marking despite image upload failure"
      );
    } else {
      console.log(
        `✅ Login image uploaded successfully: ${loginUploadResult.url}`
      );
    }

    // Mark attendance
    const attendance = new Attendance({
      student: match.studentId,
      studentId: match.studentIdString,
      timeIn: now,
      status,
      confidence: match.confidence,
      biometricMethod: "face",
      location,
      notes,
      loginPhotoUrl: loginUploadResult.success
        ? loginUploadResult.url
        : undefined,
      deviceInfo: {
        userAgent: req.get("User-Agent") || "Unknown",
        ip: cleanIP,
      },
    });

    await attendance.save();

    // Emit attendance marked event
    eventService.emitAttendanceMarked({
      studentId: match.studentIdString,
      name: match.name,
      timeIn: attendance.timeIn,
      confidence: match.confidence,
      status: attendance.status,
      action: "login",
    });

    const response: ApiResponse = {
      success: true,
      message: "Login successful! Have a great day!",
      data: {
        studentId: match.studentIdString,
        name: match.name,
        timeIn: attendance.timeIn,
        status: attendance.status,
        confidence: match.confidence,
        location: attendance.location,
        action: "login",
        isLoggedIn: true,
      },
    };

    res.json(response);
  } catch (error: any) {
    console.error("❌ Attendance marking error:", error);

    let message = "Attendance marking failed";
    if (error.message.includes("No face detected")) {
      message =
        "No face detected in the image. Please ensure your face is clearly visible.";
    } else if (error.message.includes("Multiple faces detected")) {
      message =
        "Multiple faces detected. Please ensure only one face is visible.";
    }

    const response: ApiResponse = {
      success: false,
      message: message,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    };

    res.status(500).json(response);
  }
};

export const getAttendanceStats = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalStudents = await Student.countDocuments({ isActive: true });
    const presentToday = await Attendance.countDocuments({
      date: { $gte: today },
      status: { $in: ["present", "late"] },
    });

    const attendanceRate =
      totalStudents > 0 ? (presentToday / totalStudents) * 100 : 0;

    // Get recent attendance (all records for today)
    const recentAttendance = await Attendance.find({
      date: { $gte: today },
    })
      .populate("student", "name studentId")
      .sort({ timeIn: -1 });

    // Get weekly trend data (last 7 days)
    const weeklyTrend = await getWeeklyTrendData(totalStudents);

    const response: ApiResponse = {
      success: true,
      message: "Attendance statistics retrieved successfully",
      data: {
        totalStudents,
        presentToday,
        attendanceRate: Math.round(attendanceRate * 100) / 100,
        recentAttendance: recentAttendance.map((att) => ({
          _id: att._id.toString(),
          studentId: att.studentId,
          studentName: (att.student as any)?.name || "Unknown",
          timeIn: att.timeIn,
          status: att.status,
          confidence: att.confidence,
        })),
        weeklyTrend,
      },
    };

    res.json(response);
  } catch (error: any) {
    console.error("❌ Stats error:", error);

    const response: ApiResponse = {
      success: false,
      message: "Failed to fetch attendance statistics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    };

    res.status(500).json(response);
  }
};

// Helper function to get weekly trend data
const getWeeklyTrendData = async (totalStudents: number) => {
  const weeklyTrend = [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Get data for the last 7 days
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    // Count present students for this day
    const presentCount = await Attendance.countDocuments({
      date: {
        $gte: date,
        $lt: nextDay,
      },
      status: { $in: ["present", "late"] },
    });

    // Check if this day is Sunday (day 0 = Sunday) - it's a holiday
    const dayOfWeek = date.getDay();
    const isSunday = dayOfWeek === 0;

    // On Sundays, no students are marked as absent (holiday)
    const absentCount = isSunday
      ? 0
      : Math.max(0, totalStudents - presentCount);

    weeklyTrend.push({
      name: dayNames[date.getDay()],
      present: presentCount,
      absent: absentCount,
      date: date.toISOString().split("T")[0],
      isHoliday: isSunday,
    });
  }

  return weeklyTrend;
};

export const checkLoginStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { faceImage } = req.body;

    if (!faceImage) {
      const response: ApiResponse = {
        success: false,
        message: "Face image is required",
      };
      res.status(400).json(response);
      return;
    }

    if (!isModelsLoaded()) {
      const response: ApiResponse = {
        success: false,
        message: "Face recognition models not loaded. Please try again later.",
      };
      res.status(503).json(response);
      return;
    }

    // Process and extract face descriptor
    const imageBuffer = Buffer.from(faceImage.split(",")[1], "base64");
    const processedImage = await preprocessImage(imageBuffer);
    const probeDescriptor = await extractFaceDescriptor(processedImage);

    // Get all active students with face recognition
    const students = await Student.find({
      isActive: true,
      faceDescriptor: { $exists: true, $ne: [] },
    }).select("_id studentId name faceDescriptor");

    if (students.length === 0) {
      const response: ApiResponse = {
        success: false,
        message: "No students enrolled with face recognition",
      };
      res.status(404).json(response);
      return;
    }

    // Find best match - filter students to ensure they have faceDescriptor
    const studentsWithFace = students.filter(
      (s) => s.faceDescriptor && s.faceDescriptor.length === 128
    );
    const match = await findBestMatch(
      probeDescriptor,
      studentsWithFace as any,
      0.6
    );

    if (!match) {
      const response: ApiResponse<LoginStatusResponse> = {
        success: true,
        message: "Student not recognized",
        data: {
          isLoggedIn: false,
        },
      };
      res.json(response);
      return;
    }

    // Check today's attendance
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingAttendance = await Attendance.findOne({
      student: match.studentId,
      date: { $gte: today },
    });

    if (!existingAttendance || !existingAttendance.timeIn) {
      const response: ApiResponse<LoginStatusResponse> = {
        success: true,
        message: "Not logged in",
        data: {
          isLoggedIn: false,
          studentId: match.studentIdString,
          name: match.name,
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

    const response: ApiResponse<LoginStatusResponse> = {
      success: true,
      message: isLoggedIn ? "Currently logged in" : "Already logged out",
      data: {
        isLoggedIn,
        studentId: match.studentIdString,
        name: match.name,
        timeIn: existingAttendance.timeIn,
        duration,
        location: existingAttendance.location,
      },
    };

    res.json(response);
  } catch (error: any) {
    console.error("❌ Login status check error:", error);

    const response: ApiResponse = {
      success: false,
      message: "Failed to check login status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    };

    res.status(500).json(response);
  }
};

export const getStudentAttendance = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate } = req.query;

    let query: any = { studentId: studentId.toUpperCase() };

    if (startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    }

    const attendance = await Attendance.find(query)
      .populate("student", "name studentId email")
      .sort({ date: -1, timeIn: -1 });

    const response: ApiResponse = {
      success: true,
      message: "Student attendance retrieved successfully",
      data: attendance,
    };

    res.json(response);
  } catch (error: any) {
    console.error("❌ Student attendance error:", error);

    const response: ApiResponse = {
      success: false,
      message: "Failed to fetch student attendance",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    };

    res.status(500).json(response);
  }
};

export const getAbsentStudents = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { date } = req.query;

    // Use provided date or default to yesterday (24 hours ago)
    let targetDate: Date;
    if (date) {
      targetDate = new Date(date as string);
    } else {
      targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - 1); // Yesterday
    }
    targetDate.setHours(0, 0, 0, 0);

    // Check if target date is Sunday (day 0 = Sunday)
    const dayOfWeek = targetDate.getDay();
    if (dayOfWeek === 0) {
      // Sunday is a holiday - no absent students
      const response: ApiResponse = {
        success: true,
        message: "Sunday is a holiday - no absent students",
        data: {
          date: targetDate.toISOString().split("T")[0],
          totalStudents: 0,
          presentCount: 0,
          absentCount: 0,
          absentStudents: [],
          isHoliday: true,
        },
      };
      res.json(response);
      return;
    }

    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get all active students who were enrolled on or before the target date
    // This ensures students enrolled AFTER the target date are not marked as absent
    const allStudents = await Student.find({
      isActive: true,
      enrolledAt: { $lte: nextDay }, // Only students enrolled before or on the target date
    }).select("_id studentId name phone course email enrolledAt");

    console.log(
      `📊 Found ${
        allStudents.length
      } students enrolled on or before ${targetDate.toDateString()}`
    );

    // Get students who marked attendance on target date
    const presentStudents = await Attendance.find({
      date: {
        $gte: targetDate,
        $lt: nextDay,
      },
    }).distinct("student");

    console.log(
      `✅ ${
        presentStudents.length
      } students marked attendance on ${targetDate.toDateString()}`
    );

    // Filter absent students (those not in presentStudents array)
    const absentStudents: AbsentStudent[] = allStudents
      .filter(
        (student) =>
          !presentStudents.some(
            (id) => id.toString() === student._id.toString()
          )
      )
      .map((student) => ({
        _id: student._id.toString(),
        studentId: student.studentId,
        name: student.name,
        phone: student.phone,
        course: student.course,
        email: student.email,
      }));

    // Generate WhatsApp links for absent students
    const whatsappLinks = absentStudents.map((student) => {
      const message = generateAbsenceMessage(student.name, targetDate);
      const link = generateWhatsAppLink(student.phone, message);

      return {
        ...student,
        whatsappLink: link,
        message: message,
      };
    });

    const response: ApiResponse = {
      success: true,
      message: `Found ${absentStudents.length} absent students`,
      data: {
        date: targetDate.toISOString().split("T")[0],
        totalStudents: allStudents.length,
        presentCount: presentStudents.length,
        absentCount: absentStudents.length,
        absentStudents: whatsappLinks,
      },
    };

    res.json(response);
  } catch (error: any) {
    console.error("❌ Absent students error:", error);

    const response: ApiResponse = {
      success: false,
      message: "Failed to fetch absent students",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    };

    res.status(500).json(response);
  }
};
