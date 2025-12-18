import express from "express";
import {
  generateChallenge,
  markAttendanceWithFingerprint,
  checkLoginStatusWithFingerprint,
  enumerateSensors,
  captureFingerprintFromSensor,
  enrollExternalFingerprint,
  getSensorHealthStatus,
} from "../controllers/fingerprintController";
import { body } from "express-validator";
import { validateRequest } from "../middleware/validation";

const router = express.Router();

// Validation middleware for fingerprint data (supports both WebAuthn and external sensors)
const fingerprintDataValidation = [
  body("fingerprintData")
    .notEmpty()
    .withMessage("Fingerprint data is required"),
  body("fingerprintMode")
    .optional()
    .isIn(["webauthn", "external"])
    .withMessage("Invalid fingerprint mode"),
  // WebAuthn fields (required only when fingerprintMode is not 'external')
  body("fingerprintData.credentialId")
    .if((value, { req }) => req.body.fingerprintMode !== "external")
    .notEmpty()
    .withMessage("Credential ID is required for WebAuthn")
    .isString()
    .withMessage("Credential ID must be a string"),
  // External sensor fields (required only when fingerprintMode is 'external')
  body("fingerprintData.template")
    .if((value, { req }) => req.body.fingerprintMode === "external")
    .notEmpty()
    .withMessage("Template is required for external sensors")
    .isString()
    .withMessage("Template must be a string"),
  body("fingerprintData.sensorType")
    .if((value, { req }) => req.body.fingerprintMode === "external")
    .notEmpty()
    .withMessage("Sensor type is required for external sensors"),
  body("fingerprintData.quality")
    .if((value, { req }) => req.body.fingerprintMode === "external")
    .optional()
    .isInt({ min: 30, max: 100 })
    .withMessage("Quality must be between 30 and 100"),
  body("location")
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage("Location must be between 2 and 100 characters"),
  body("notes")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Notes cannot exceed 500 characters"),
  body("action")
    .optional()
    .isIn(["auto", "login", "logout"])
    .withMessage("Action must be one of: auto, login, logout"),
];

// External sensor validation
const externalFingerprintValidation = [
  body("sensorId")
    .notEmpty()
    .withMessage("Sensor ID is required")
    .isString()
    .withMessage("Sensor ID must be a string"),
  body("options.timeout")
    .optional()
    .isInt({ min: 5000, max: 60000 })
    .withMessage("Timeout must be between 5000 and 60000 ms"),
  body("options.quality")
    .optional()
    .isInt({ min: 30, max: 100 })
    .withMessage("Quality must be between 30 and 100"),
  body("options.maxRetries")
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage("Max retries must be between 1 and 10"),
];

const enrollExternalValidation = [
  body("studentId")
    .notEmpty()
    .withMessage("Student ID is required")
    .isString()
    .withMessage("Student ID must be a string"),
  body("externalFingerprintData.template")
    .notEmpty()
    .withMessage("Fingerprint template is required"),
  body("externalFingerprintData.sensorType")
    .isIn(["digital_persona", "zkteco", "mantra", "generic"])
    .withMessage("Invalid sensor type"),
  body("externalFingerprintData.quality")
    .isInt({ min: 30, max: 100 })
    .withMessage("Quality must be between 30 and 100"),
];

// Routes
router.get("/challenge", generateChallenge);
router.post(
  "/mark-attendance",
  fingerprintDataValidation,
  validateRequest,
  markAttendanceWithFingerprint
);
router.post(
  "/check-status",
  fingerprintDataValidation,
  validateRequest,
  checkLoginStatusWithFingerprint
);

// External sensor routes
router.get("/sensors/enumerate", enumerateSensors);
router.post(
  "/sensors/capture",
  externalFingerprintValidation,
  validateRequest,
  captureFingerprintFromSensor
);
router.post(
  "/sensors/enroll",
  enrollExternalValidation,
  validateRequest,
  enrollExternalFingerprint
);
router.get("/sensors/health", getSensorHealthStatus);

export default router;
