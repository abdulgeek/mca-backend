import mongoose, { Schema } from "mongoose";
import { IStudent } from "../types";

const studentSchema = new Schema<IStudent>(
  {
    studentId: {
      type: String,
      required: [true, "Student ID is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
      match: [/^[\+]?[1-9][\d]{0,15}$/, "Please enter a valid phone number"],
    },
    course: {
      type: String,
      required: [true, "Course is required"],
      trim: true,
      enum: {
        values: [
          "1st Standard",
          "2nd Standard",
          "3rd Standard",
          "4th Standard",
          "5th Standard",
          "6th Standard",
          "7th Standard",
          "8th Standard",
          "9th Standard",
          "10th Standard",
          "1st PUC - Science",
          "1st PUC - Commerce",
          "2nd PUC - Science",
          "2nd PUC - Commerce",
          "Degree - MCA",
          "Degree - BCA",
          "Degree - B.Com",
          "Degree - B.Sc",
          "Degree - BA",
          "Degree - Other",
          "DCA",
          "Programming",
          "DCAD",
        ],
        message: "Invalid course selection",
      },
    },
    fatherName: {
      type: String,
      trim: true,
      maxlength: [100, "Father name cannot exceed 100 characters"],
    },
    motherName: {
      type: String,
      trim: true,
      maxlength: [100, "Mother name cannot exceed 100 characters"],
    },
    bloodGroup: {
      type: String,
      trim: true,
      required: false,
      validate: {
        validator: function (value: string | null | undefined) {
          // Allow empty string, null, or undefined (optional field)
          if (!value || value === "" || value === null || value === undefined) {
            return true;
          }
          // If value is provided, it must be one of the valid blood groups
          return ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].includes(
            value
          );
        },
        message:
          "Invalid blood group. Must be one of: A+, A-, B+, B-, AB+, AB-, O+, O-",
      },
    },
    faceDescriptor: {
      type: [Number],
      required: false,
      default: undefined, // Explicitly set default to undefined instead of []
      validate: {
        validator: function (arr: number[] | undefined) {
          // Allow undefined, null, or arrays with exactly 128 elements
          return (
            arr === undefined ||
            arr === null ||
            (Array.isArray(arr) && (arr.length === 0 || arr.length === 128))
          );
        },
        message:
          "Face descriptor must be undefined or contain exactly 128 numbers",
      },
    },
    faceImage: {
      type: String,
      required: false,
    },
    profileImageUrl: {
      type: String,
      trim: true,
    },
    fingerprintCredentialId: {
      type: String,
      trim: true,
      sparse: true,
    },
    fingerprintPublicKey: {
      type: String,
      trim: true,
    },
    fingerprintCounter: {
      type: Number,
      default: 0,
    },
    // External fingerprint sensor fields
    externalFingerprintTemplate: {
      type: String,
      required: false,
      select: false, // Don't include in default queries for security
    },
    externalFingerprintSensorType: {
      type: String,
      enum: ["digital_persona", "zkteco", "mantra", "generic_hid"],
      required: false,
    },
    fingerprintMode: {
      type: String,
      enum: ["external", "webauthn", "both"],
      default: "webauthn",
    },
    externalFingerprintMetadata: {
      type: {
        quality: Number,
        capturedAt: Date,
        sensorId: String,
        templateVersion: String,
        deviceInfo: {
          manufacturer: String,
          model: String,
          vendorId: Number,
          productId: Number,
        },
      },
      required: false,
    },
    biometricMethods: {
      type: [String],
      enum: ["face", "fingerprint", "external_fingerprint"],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    enrolledAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
studentSchema.index({ studentId: 1 });
studentSchema.index({ email: 1 });
studentSchema.index({ phone: 1 });
studentSchema.index({ faceDescriptor: 1 });
studentSchema.index({ isActive: 1 });
studentSchema.index({ course: 1 });
studentSchema.index({ externalFingerprintTemplate: 1 });
studentSchema.index({ fingerprintMode: 1 });
studentSchema.index({ biometricMethods: 1 });

// Virtual for full name
studentSchema.virtual("fullName").get(function () {
  return `${this.name} (${this.studentId})`;
});

// Pre-save middleware
studentSchema.pre("save", function (next) {
  if (this.isModified("studentId")) {
    this.studentId = this.studentId.toUpperCase();
  }

  // Validate at least one biometric method is provided
  if (
    this.isNew &&
    (!this.faceDescriptor || this.faceDescriptor.length === 0) &&
    !this.fingerprintCredentialId &&
    !this.externalFingerprintTemplate
  ) {
    return next(
      new Error(
        "At least one biometric method (face, fingerprint, or external fingerprint) must be provided"
      )
    );
  }

  // Update biometric methods array based on enrolled methods
  if (
    this.isModified("faceDescriptor") ||
    this.isModified("fingerprintCredentialId") ||
    this.isModified("externalFingerprintTemplate")
  ) {
    this.biometricMethods = [];

    if (
      this.faceDescriptor &&
      Array.isArray(this.faceDescriptor) &&
      this.faceDescriptor.length === 128
    ) {
      this.biometricMethods.push("face");
    }

    if (this.fingerprintCredentialId) {
      this.biometricMethods.push("fingerprint");
    }

    if (this.externalFingerprintTemplate) {
      this.biometricMethods.push("external_fingerprint");
    }
  }

  next();
});

// Static methods
studentSchema.statics.findByStudentId = function (studentId: string) {
  return this.findOne({ studentId: studentId.toUpperCase() });
};

studentSchema.statics.findActiveStudents = function () {
  return this.find({ isActive: true }).select("-faceDescriptor -faceImage");
};

export default mongoose.model<IStudent>("Student", studentSchema);
