import { Request, Response } from 'express';
import Student from '../models/Student';
import Attendance from '../models/Attendance';
import { 
  ApiResponse, 
  StudentListResponse, 
  StudentDetailResponse, 
  UpdateStudentRequest,
  UpdateBiometricsRequest,
  CalendarAttendanceData,
  UpdateAttendanceRequest,
  AttendanceStats
} from '../types';
import { extractFaceDescriptor, preprocessImage, isModelsLoaded } from '../middleware/faceRecognition';
import { s3Service } from '../services/s3Service';

export const getAllStudents = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      search = '', 
      course = '', 
      status = 'all', 
      biometricMethod = '',
      page = '1', 
      limit = '20',
      sortBy = 'enrolledAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query: any = {};

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { studentId: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Course filter
    if (course) {
      query.course = course;
    }

    // Status filter
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    // Biometric method filter
    if (biometricMethod === 'face') {
      query.biometricMethods = 'face';
    } else if (biometricMethod === 'fingerprint') {
      query.biometricMethods = 'fingerprint';
    }

    // Sorting
    const sortOptions: any = {};
    sortOptions[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

    // Get total count
    const total = await Student.countDocuments(query);

    // Get students
    const students = await Student.find(query)
      .select('-faceDescriptor -faceImage -fingerprintPublicKey')
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);

    // Calculate attendance percentage for each student
    const studentsWithStats = await Promise.all(
      students.map(async (student) => {
        const attendanceStats = await calculateAttendanceStats(student._id.toString());
        
        return {
          _id: student._id.toString(),
          studentId: student.studentId,
          name: student.name,
          email: student.email,
          phone: student.phone,
          course: student.course,
          profileImageUrl: student.profileImageUrl,
          biometricMethods: student.biometricMethods,
          isActive: student.isActive,
          enrolledAt: student.enrolledAt,
          attendancePercentage: attendanceStats.attendancePercentage
        };
      })
    );

    const response: ApiResponse<StudentListResponse> = {
      success: true,
      message: 'Students retrieved successfully',
      data: {
        students: studentsWithStats,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      }
    };

    res.json(response);

  } catch (error: any) {
    console.error('❌ Get all students error:', error);

    const response: ApiResponse = {
      success: false,
      message: 'Failed to fetch students',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    };

    res.status(500).json(response);
  }
};

export const getStudentById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const student = await Student.findById(id).select('-faceDescriptor -faceImage -fingerprintPublicKey');

    if (!student) {
      const response: ApiResponse = {
        success: false,
        message: 'Student not found'
      };
      res.status(404).json(response);
      return;
    }

    const attendanceStats = await calculateAttendanceStats(id);

    const response: ApiResponse<StudentDetailResponse> = {
      success: true,
      message: 'Student details retrieved successfully',
      data: {
        student: student as any,
        attendanceStats
      }
    };

    res.json(response);

  } catch (error: any) {
    console.error('❌ Get student by ID error:', error);

    const response: ApiResponse = {
      success: false,
      message: 'Failed to fetch student details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    };

    res.status(500).json(response);
  }
};

export const updateStudent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData: UpdateStudentRequest = req.body;

    // Validate at least one field to update
    if (!updateData.name && !updateData.email && !updateData.phone && !updateData.course) {
      const response: ApiResponse = {
        success: false,
        message: 'At least one field must be provided for update'
      };
      res.status(400).json(response);
      return;
    }

    const student = await Student.findById(id);

    if (!student) {
      const response: ApiResponse = {
        success: false,
        message: 'Student not found'
      };
      res.status(404).json(response);
      return;
    }

    // Check for email uniqueness if email is being updated
    if (updateData.email && updateData.email !== student.email) {
      const existingStudent = await Student.findOne({ email: updateData.email.toLowerCase() });
      if (existingStudent) {
        const response: ApiResponse = {
          success: false,
          message: 'Email already in use by another student'
        };
        res.status(400).json(response);
        return;
      }
    }

    // Check for phone uniqueness if phone is being updated
    if (updateData.phone && updateData.phone !== student.phone) {
      const existingStudent = await Student.findOne({ phone: updateData.phone });
      if (existingStudent) {
        const response: ApiResponse = {
          success: false,
          message: 'Phone number already in use by another student'
        };
        res.status(400).json(response);
        return;
      }
    }

    // Update student
    if (updateData.name) student.name = updateData.name;
    if (updateData.email) student.email = updateData.email.toLowerCase();
    if (updateData.phone) student.phone = updateData.phone;
    if (updateData.course) student.course = updateData.course;

    await student.save();

    const response: ApiResponse = {
      success: true,
      message: 'Student updated successfully',
      data: {
        _id: student._id,
        studentId: student.studentId,
        name: student.name,
        email: student.email,
        phone: student.phone,
        course: student.course,
        profileImageUrl: student.profileImageUrl,
        biometricMethods: student.biometricMethods,
        isActive: student.isActive
      }
    };

    res.json(response);

  } catch (error: any) {
    console.error('❌ Update student error:', error);

    const response: ApiResponse = {
      success: false,
      message: 'Failed to update student',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    };

    res.status(500).json(response);
  }
};

export const updateStudentBiometrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { faceImage, fingerprintData }: UpdateBiometricsRequest = req.body;

    if (!faceImage && !fingerprintData) {
      const response: ApiResponse = {
        success: false,
        message: 'At least one biometric method (face or fingerprint) must be provided'
      };
      res.status(400).json(response);
      return;
    }

    const student = await Student.findById(id);

    if (!student) {
      const response: ApiResponse = {
        success: false,
        message: 'Student not found'
      };
      res.status(404).json(response);
      return;
    }

    // Process face image if provided
    if (faceImage) {
      if (!isModelsLoaded()) {
        const response: ApiResponse = {
          success: false,
          message: 'Face recognition models not loaded. Please try again later.'
        };
        res.status(503).json(response);
        return;
      }

      try {
        const imageBuffer = Buffer.from(faceImage.split(',')[1], 'base64');
        const processedImage = await preprocessImage(imageBuffer);
        const faceDescriptor = await extractFaceDescriptor(processedImage);
        
        student.faceDescriptor = Array.from(faceDescriptor);
        student.faceImage = faceImage;

        // Upload to S3
        const profileUploadResult = await s3Service.uploadProfileImage(
          faceImage, 
          student.studentId,
          student.name,
          student._id.toString()
        );

        if (profileUploadResult.success) {
          student.profileImageUrl = profileUploadResult.url;
        }

        if (!student.biometricMethods.includes('face')) {
          student.biometricMethods.push('face');
        }
      } catch (faceError: any) {
        console.error('❌ Face processing error:', faceError);
        const response: ApiResponse = {
          success: false,
          message: 'Face processing failed. Please ensure your face is clearly visible.',
          error: faceError.message
        };
        res.status(400).json(response);
        return;
      }
    }

    // Process fingerprint if provided
    if (fingerprintData) {
      student.fingerprintCredentialId = fingerprintData.credentialId;
      student.fingerprintPublicKey = fingerprintData.publicKey;
      student.fingerprintCounter = fingerprintData.counter || 0;

      if (!student.biometricMethods.includes('fingerprint')) {
        student.biometricMethods.push('fingerprint');
      }
    }

    await student.save();

    const response: ApiResponse = {
      success: true,
      message: 'Biometric data updated successfully',
      data: {
        _id: student._id,
        studentId: student.studentId,
        name: student.name,
        profileImageUrl: student.profileImageUrl,
        biometricMethods: student.biometricMethods
      }
    };

    res.json(response);

  } catch (error: any) {
    console.error('❌ Update biometrics error:', error);

    const response: ApiResponse = {
      success: false,
      message: 'Failed to update biometric data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    };

    res.status(500).json(response);
  }
};

export const toggleStudentStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const student = await Student.findById(id);

    if (!student) {
      const response: ApiResponse = {
        success: false,
        message: 'Student not found'
      };
      res.status(404).json(response);
      return;
    }

    // Toggle status
    student.isActive = !student.isActive;
    await student.save();

    const response: ApiResponse = {
      success: true,
      message: `Student ${student.isActive ? 'activated' : 'deactivated'} successfully`,
      data: {
        _id: student._id,
        studentId: student.studentId,
        name: student.name,
        isActive: student.isActive
      }
    };

    res.json(response);

  } catch (error: any) {
    console.error('❌ Toggle student status error:', error);

    const response: ApiResponse = {
      success: false,
      message: 'Failed to update student status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    };

    res.status(500).json(response);
  }
};

export const getStudentAttendanceCalendar = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const student = await Student.findById(id);

    if (!student) {
      const response: ApiResponse = {
        success: false,
        message: 'Student not found'
      };
      res.status(404).json(response);
      return;
    }

    // Default date range: from enrollment to today
    let start = startDate ? new Date(startDate as string) : new Date(student.enrolledAt);
    start.setHours(0, 0, 0, 0);

    let end = endDate ? new Date(endDate as string) : new Date();
    end.setHours(23, 59, 59, 999);

    // Get all attendance records for this student in the date range
    const attendanceRecords = await Attendance.find({
      student: student._id,
      date: {
        $gte: start,
        $lte: end
      }
    }).sort({ date: 1 });

    // Create a map of attendance by date
    const attendanceMap = new Map<string, any>();
    attendanceRecords.forEach(record => {
      const dateStr = record.date.toISOString().split('T')[0];
      attendanceMap.set(dateStr, record);
    });

    // Generate calendar data for all dates in range
    const calendarData: CalendarAttendanceData[] = [];
    const currentDate = new Date(start);

    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const attendance = attendanceMap.get(dateStr);

      if (attendance) {
        calendarData.push({
          date: dateStr,
          status: attendance.status,
          timeIn: attendance.timeIn,
          timeOut: attendance.timeOut,
          duration: attendance.timeOut 
            ? attendance.timeOut.getTime() - attendance.timeIn.getTime() 
            : undefined,
          location: attendance.location,
          biometricMethod: attendance.biometricMethod,
          confidence: attendance.confidence,
          attendanceId: attendance._id.toString()
        });
      } else {
        calendarData.push({
          date: dateStr,
          status: 'none'
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    const response: ApiResponse<CalendarAttendanceData[]> = {
      success: true,
      message: 'Calendar data retrieved successfully',
      data: calendarData
    };

    res.json(response);

  } catch (error: any) {
    console.error('❌ Get calendar data error:', error);

    const response: ApiResponse = {
      success: false,
      message: 'Failed to fetch calendar data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    };

    res.status(500).json(response);
  }
};

export const updateAttendanceRecord = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData: UpdateAttendanceRequest = req.body;

    const attendance = await Attendance.findById(id);

    if (!attendance) {
      const response: ApiResponse = {
        success: false,
        message: 'Attendance record not found'
      };
      res.status(404).json(response);
      return;
    }

    // Update fields if provided
    if (updateData.status) attendance.status = updateData.status;
    if (updateData.timeIn) attendance.timeIn = new Date(updateData.timeIn);
    if (updateData.timeOut) attendance.timeOut = new Date(updateData.timeOut);
    if (updateData.location) attendance.location = updateData.location;
    if (updateData.notes !== undefined) attendance.notes = updateData.notes;

    await attendance.save();

    const response: ApiResponse = {
      success: true,
      message: 'Attendance record updated successfully',
      data: attendance
    };

    res.json(response);

  } catch (error: any) {
    console.error('❌ Update attendance error:', error);

    const response: ApiResponse = {
      success: false,
      message: 'Failed to update attendance record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    };

    res.status(500).json(response);
  }
};

export const deleteAttendanceRecord = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const attendance = await Attendance.findById(id);

    if (!attendance) {
      const response: ApiResponse = {
        success: false,
        message: 'Attendance record not found'
      };
      res.status(404).json(response);
      return;
    }

    await Attendance.findByIdAndDelete(id);

    const response: ApiResponse = {
      success: true,
      message: 'Attendance record deleted successfully'
    };

    res.json(response);

  } catch (error: any) {
    console.error('❌ Delete attendance error:', error);

    const response: ApiResponse = {
      success: false,
      message: 'Failed to delete attendance record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    };

    res.status(500).json(response);
  }
};

// Helper function to calculate attendance statistics
const calculateAttendanceStats = async (studentId: string): Promise<AttendanceStats> => {
  const student = await Student.findById(studentId);
  
  if (!student) {
    return {
      totalDays: 0,
      presentDays: 0,
      absentDays: 0,
      attendancePercentage: 0
    };
  }

  const enrolledDate = new Date(student.enrolledAt);
  enrolledDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // Calculate total days since enrollment (excluding weekends if needed)
  const totalDays = Math.floor((today.getTime() - enrolledDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // Get present days count
  const presentDays = await Attendance.countDocuments({
    student: studentId,
    status: 'present'
  });

  const absentDays = totalDays - presentDays;
  const attendancePercentage = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

  return {
    totalDays,
    presentDays,
    absentDays: Math.max(0, absentDays),
    attendancePercentage: Math.round(attendancePercentage * 100) / 100
  };
};

