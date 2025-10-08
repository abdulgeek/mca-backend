import mongoose, { Schema } from 'mongoose';
import { IAttendance } from '../types';

const attendanceSchema = new Schema<IAttendance>({
  student: {
    type: String,
    ref: 'Student',
    required: [true, 'Student reference is required']
  },
  studentId: {
    type: String,
    required: [true, 'Student ID is required'],
    trim: true,
    uppercase: true
  },
  date: {
    type: Date,
    required: [true, 'Date is required'],
    default: Date.now
  },
  timeIn: {
    type: Date,
    required: [true, 'Time in is required'],
    default: Date.now
  },
  timeOut: {
    type: Date
  },
  status: {
    type: String,
    enum: {
      values: ['present', 'absent'],
      message: 'Status must be one of: present, absent'
    },
    default: 'present'
  },
  confidence: {
    type: Number,
    required: false,
    min: [0, 'Confidence must be between 0 and 1'],
    max: [1, 'Confidence must be between 0 and 1']
  },
  biometricMethod: {
    type: String,
    enum: {
      values: ['face', 'fingerprint'],
      message: 'Biometric method must be either face or fingerprint'
    },
    required: [true, 'Biometric method is required']
  },
  location: {
    type: String,
    default: 'Main Campus',
    trim: true,
    maxlength: [100, 'Location cannot exceed 100 characters']
  },
  loginPhotoUrl: {
    type: String,
    trim: true
  },
  logoutPhotoUrl: {
    type: String,
    trim: true
  },
  whatsappNotificationSent: {
    type: Boolean,
    default: false
  },
  deviceInfo: {
    userAgent: {
      type: String,
      trim: true,
      maxlength: [500, 'User agent cannot exceed 500 characters']
    },
    ip: {
      type: String,
      trim: true
    }
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for efficient queries
attendanceSchema.index({ student: 1, date: 1 });
attendanceSchema.index({ date: 1, status: 1 });
attendanceSchema.index({ studentId: 1, date: 1 });
attendanceSchema.index({ timeIn: 1 });
attendanceSchema.index({ location: 1 });

// Virtual for duration
attendanceSchema.virtual('duration').get(function() {
  if (this.timeOut) {
    return this.timeOut.getTime() - this.timeIn.getTime();
  }
  return null;
});

// Virtual for formatted time
attendanceSchema.virtual('formattedTimeIn').get(function() {
  return this.timeIn.toLocaleString();
});

// Pre-save middleware
attendanceSchema.pre('save', function(next) {
  if (this.isModified('studentId')) {
    this.studentId = this.studentId.toUpperCase();
  }
  
  // Set date to start of day
  if (this.isModified('date')) {
    this.date.setHours(0, 0, 0, 0);
  }
  
  next();
});

// Static methods
attendanceSchema.statics.findByDateRange = function(startDate: Date, endDate: Date) {
  return this.find({
    date: {
      $gte: startDate,
      $lte: endDate
    }
  }).populate('student', 'name studentId email');
};

attendanceSchema.statics.findTodayAttendance = function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return this.find({
    date: {
      $gte: today,
      $lt: tomorrow
    }
  }).populate('student', 'name studentId email');
};

attendanceSchema.statics.findStudentAttendance = function(studentId: string, startDate?: Date, endDate?: Date) {
  const query: any = { studentId: studentId.toUpperCase() };
  
  if (startDate && endDate) {
    query.date = {
      $gte: startDate,
      $lte: endDate
    };
  }
  
  return this.find(query).populate('student', 'name studentId email');
};

export default mongoose.model<IAttendance>('Attendance', attendanceSchema);
