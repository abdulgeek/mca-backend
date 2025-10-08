import mongoose, { Schema, Document } from 'mongoose';
import { IStudent } from '../types';

const studentSchema = new Schema<IStudent>({
  studentId: {
    type: String,
    required: [true, 'Student ID is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid phone number']
  },
  course: {
    type: String,
    required: [true, 'Course is required'],
    trim: true,
    enum: {
      values: [
        '1st Standard', '2nd Standard', '3rd Standard', '4th Standard', '5th Standard',
        '6th Standard', '7th Standard', '8th Standard', '9th Standard', '10th Standard',
        '1st PUC - Science', '1st PUC - Commerce',
        '2nd PUC - Science', '2nd PUC - Commerce',
        'Degree - MCA', 'Degree - BCA', 'Degree - B.Com', 'Degree - B.Sc', 'Degree - BA', 'Degree - Other'
      ],
      message: 'Invalid course selection'
    }
  },
  faceDescriptor: {
    type: [Number],
    required: false,
    validate: {
      validator: function(arr: number[]) {
        return !arr || arr.length === 128;
      },
      message: 'Face descriptor must contain exactly 128 numbers'
    }
  },
  faceImage: {
    type: String,
    required: false
  },
  profileImageUrl: {
    type: String,
    trim: true
  },
  fingerprintCredentialId: {
    type: String,
    trim: true,
    sparse: true
  },
  fingerprintPublicKey: {
    type: String,
    trim: true
  },
  fingerprintCounter: {
    type: Number,
    default: 0
  },
  biometricMethods: {
    type: [String],
    enum: ['face', 'fingerprint'],
    default: []
  },
  isActive: {
    type: Boolean,
    default: true
  },
  enrolledAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
studentSchema.index({ studentId: 1 });
studentSchema.index({ email: 1 });
studentSchema.index({ phone: 1 });
studentSchema.index({ faceDescriptor: 1 });
studentSchema.index({ isActive: 1 });
studentSchema.index({ course: 1 });

// Virtual for full name
studentSchema.virtual('fullName').get(function() {
  return `${this.name} (${this.studentId})`;
});

// Pre-save middleware
studentSchema.pre('save', function(next) {
  if (this.isModified('studentId')) {
    this.studentId = this.studentId.toUpperCase();
  }
  
  // Validate at least one biometric method is provided
  if (this.isNew && (!this.faceDescriptor || this.faceDescriptor.length === 0) && !this.fingerprintCredentialId) {
    return next(new Error('At least one biometric method (face or fingerprint) must be provided'));
  }
  
  next();
});

// Static methods
studentSchema.statics.findByStudentId = function(studentId: string) {
  return this.findOne({ studentId: studentId.toUpperCase() });
};

studentSchema.statics.findActiveStudents = function() {
  return this.find({ isActive: true }).select('-faceDescriptor -faceImage');
};

export default mongoose.model<IStudent>('Student', studentSchema);
