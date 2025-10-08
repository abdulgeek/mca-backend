import express from 'express';
import { 
  generateChallenge, 
  markAttendanceWithFingerprint, 
  checkLoginStatusWithFingerprint 
} from '../controllers/fingerprintController';
import { body } from 'express-validator';
import { validateRequest } from '../middleware/validation';

const router = express.Router();

// Validation middleware for fingerprint data
const fingerprintDataValidation = [
  body('fingerprintData')
    .notEmpty()
    .withMessage('Fingerprint data is required'),
  body('fingerprintData.credentialId')
    .notEmpty()
    .withMessage('Credential ID is required')
    .isString()
    .withMessage('Credential ID must be a string'),
  body('fingerprintData.authenticatorData')
    .optional()
    .isString()
    .withMessage('Authenticator data must be a string'),
  body('fingerprintData.clientDataJSON')
    .optional()
    .isString()
    .withMessage('Client data JSON must be a string'),
  body('fingerprintData.signature')
    .optional()
    .isString()
    .withMessage('Signature must be a string'),
  body('location')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Location must be between 2 and 100 characters'),
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters'),
  body('action')
    .optional()
    .isIn(['auto', 'login', 'logout'])
    .withMessage('Action must be one of: auto, login, logout')
];

// Routes
router.get('/challenge', generateChallenge);
router.post('/mark-attendance', fingerprintDataValidation, validateRequest, markAttendanceWithFingerprint);
router.post('/check-status', fingerprintDataValidation, validateRequest, checkLoginStatusWithFingerprint);

export default router;

