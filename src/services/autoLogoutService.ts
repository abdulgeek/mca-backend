/**
 * Auto Logout Service
 * 
 * This service handles automatic logout of students who didn't manually log out.
 * - Runs at midnight (12:00 AM) daily
 * - Logs out all students who are still logged in (timeOut is null)
 * - Sets logout time to 1.5 hours (90 minutes) after login time
 */

import cron from 'node-cron';
import Attendance from '../models/Attendance';
import Student from '../models/Student';
import mongoose from 'mongoose';

interface AutoLogoutStats {
  totalRecords: number;
  loggedOut: number;
  errors: string[];
}

interface MarkAbsentStats {
  totalStudents: number;
  markedAbsent: number;
  errors: string[];
}

/**
 * Auto-logout students who didn't manually log out
 * Sets logout time to 1.5 hours (90 minutes) after login time
 */
export const autoLogoutStudents = async (): Promise<AutoLogoutStats> => {
  const stats: AutoLogoutStats = {
    totalRecords: 0,
    loggedOut: 0,
    errors: []
  };

  try {
    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Find all attendance records where:
    // - status is 'present'
    // - timeOut is null/undefined
    // - date is today
    const openAttendanceRecords = await Attendance.find({
      status: 'present',
      timeOut: { $exists: false },
      date: {
        $gte: today,
        $lt: tomorrow
      }
    });

    stats.totalRecords = openAttendanceRecords.length;

    console.log(`\n🔄 Auto-logout process started at ${new Date().toISOString()}`);
    console.log(`📊 Found ${stats.totalRecords} student(s) who didn't log out today\n`);

    // Process each record
    for (const attendance of openAttendanceRecords) {
      try {
        // Calculate logout time: 1.5 hours (90 minutes) after login
        const loginTime = new Date(attendance.timeIn);
        const logoutTime = new Date(loginTime.getTime() + (90 * 60 * 1000)); // 90 minutes in milliseconds

        // If calculated logout time is in the future, set it to now (midnight)
        const now = new Date();
        const finalLogoutTime = logoutTime > now ? now : logoutTime;

        // Update attendance record
        attendance.timeOut = finalLogoutTime;
        attendance.notes = attendance.notes 
          ? `${attendance.notes} | Auto-logged out at midnight (default: 1.5h after login)`
          : 'Auto-logged out at midnight (default: 1.5h after login)';
        
        await attendance.save();

        stats.loggedOut++;

        console.log(`   ✅ Logged out: ${attendance.studentId} - Login: ${loginTime.toLocaleTimeString()}, Logout: ${finalLogoutTime.toLocaleTimeString()}`);
      } catch (error: any) {
        const errorMsg = `Failed to auto-logout ${attendance.studentId}: ${error.message}`;
        stats.errors.push(errorMsg);
        console.error(`   ❌ ${errorMsg}`);
      }
    }

    console.log(`\n📊 Auto-logout summary:`);
    console.log(`   Total records found: ${stats.totalRecords}`);
    console.log(`   Successfully logged out: ${stats.loggedOut}`);
    if (stats.errors.length > 0) {
      console.log(`   Errors: ${stats.errors.length}`);
    }
    console.log('');

  } catch (error: any) {
    const errorMsg = `Auto-logout process failed: ${error.message}`;
    stats.errors.push(errorMsg);
    console.error(`❌ ${errorMsg}`);
  }

  return stats;
};

/**
 * Mark students as absent for today if they don't have login time
 * This runs before the auto-logout process
 */
export const markAbsentNoLogin = async (): Promise<MarkAbsentStats> => {
  const stats: MarkAbsentStats = {
    totalStudents: 0,
    markedAbsent: 0,
    errors: []
  };

  try {
    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Skip if today is Sunday (holiday)
    if (today.getDay() === 0) {
      console.log('\n📅 Today is Sunday (Holiday) - No absent marking needed\n');
      return stats;
    }

    console.log(`\n🔍 Checking for students without login time for ${today.toLocaleDateString()}...\n`);

    // Get all active students enrolled on or before today
    const allStudents = await Student.find({
      isActive: true,
      enrolledAt: { $lte: tomorrow }
    }).select('_id studentId name');

    stats.totalStudents = allStudents.length;

    // Get students who have logged in today (have timeIn)
    const presentStudentIds = await Attendance.find({
      date: {
        $gte: today,
        $lt: tomorrow
      },
      timeIn: { $exists: true }
    }).distinct('student');

    // Find students without login time
    const studentsWithoutLogin = allStudents.filter(
      student => !presentStudentIds.some(id => id.toString() === student._id.toString())
    );

    console.log(`📊 Found ${studentsWithoutLogin.length} student(s) without login time\n`);

    // Mark them as absent
    for (const student of studentsWithoutLogin) {
      try {
        // Check if attendance record already exists
        const existingAttendance = await Attendance.findOne({
          studentId: student.studentId,
          date: {
            $gte: today,
            $lt: tomorrow
          }
        });

        if (existingAttendance) {
          // Update existing record to mark as absent
          if (!existingAttendance.timeIn) {
            existingAttendance.status = 'absent';
            existingAttendance.notes = existingAttendance.notes 
              ? `${existingAttendance.notes} | Marked absent at midnight - no login time`
              : 'Marked absent at midnight - no login time';
            await existingAttendance.save();
            stats.markedAbsent++;
            console.log(`   ✅ Updated: ${student.studentId} - ${student.name}`);
          }
        } else {
          // Create new absent record (without timeIn)
          const attendance = new Attendance({
            student: student._id,
            studentId: student.studentId,
            date: today,
            status: 'absent',
            biometricMethod: 'face',
            location: 'Main Campus',
            notes: 'Marked absent at midnight - no login time'
          });
          // Don't set timeIn for absent records - it's optional when status is 'absent'
          await attendance.save();
          stats.markedAbsent++;
          console.log(`   ✅ Created: ${student.studentId} - ${student.name}`);
        }
      } catch (error: any) {
        const errorMsg = `Failed to mark absent for ${student.name} (${student.studentId}): ${error.message}`;
        stats.errors.push(errorMsg);
        console.error(`   ❌ ${errorMsg}`);
      }
    }

    console.log(`\n📊 Mark absent summary:`);
    console.log(`   Total students checked: ${stats.totalStudents}`);
    console.log(`   Marked as absent: ${stats.markedAbsent}`);
    if (stats.errors.length > 0) {
      console.log(`   Errors: ${stats.errors.length}`);
    }
    console.log('');

  } catch (error: any) {
    const errorMsg = `Mark absent process failed: ${error.message}`;
    stats.errors.push(errorMsg);
    console.error(`❌ ${errorMsg}`);
  }

  return stats;
};

/**
 * Initialize the auto-logout cron job
 * Runs daily at midnight (00:00)
 */
export const initializeAutoLogoutCron = (): void => {
  // Cron expression: '0 0 * * *' means "at 00:00 (midnight) every day"
  // Format: minute hour day month day-of-week
  const cronExpression = '0 0 * * *'; // Midnight every day

  console.log('⏰ Initializing auto-logout cron job...');
  console.log('   Schedule: Daily at 12:00 AM (midnight)');
  console.log('   Actions:');
  console.log('     1. Mark students as absent if they don\'t have login time');
  console.log('     2. Auto-logout students who didn\'t manually log out');
  console.log('   Default logout time: 1.5 hours after login\n');

  cron.schedule(cronExpression, async () => {
    console.log('\n' + '='.repeat(60));
    console.log('🕛 MIDNIGHT AUTO-LOGOUT & MARK ABSENT JOB TRIGGERED');
    console.log('='.repeat(60));
    
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ MongoDB not connected. Skipping cron jobs.');
      return;
    }

    // Step 1: Mark students as absent if they don't have login time
    await markAbsentNoLogin();
    
    // Step 2: Auto-logout students who didn't log out
    await autoLogoutStudents();
    
    console.log('='.repeat(60) + '\n');
  }, {
    timezone: 'Asia/Kolkata' // Adjust timezone as needed
  });

  console.log('✅ Auto-logout cron job initialized successfully\n');
};

/**
 * Manually trigger auto-logout (for testing purposes)
 */
export const triggerAutoLogout = async (): Promise<AutoLogoutStats> => {
  console.log('🔧 Manual auto-logout triggered');
  return await autoLogoutStudents();
};

