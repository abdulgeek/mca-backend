import express from 'express';
import { enrollStudent, markAttendance, getAttendanceStats, getStudentAttendance, checkLoginStatus, getAbsentStudents } from '../controllers/faceRecognitionController';
import { body, param, query } from 'express-validator';
import { validateRequest } from '../middleware/validation';

const router = express.Router();

// Validation middleware
const enrollValidation = [
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s\-'!.,]+$/)
    .withMessage('Name must contain only letters, spaces, and common punctuation'),
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('phone')
    .notEmpty()
    .withMessage('Phone number is required')
    .isMobilePhone('any')
    .withMessage('Please provide a valid phone number'),
  body('course')
    .notEmpty()
    .withMessage('Course is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Course must be between 2 and 100 characters'),
  body('faceImage')
    .notEmpty()
    .withMessage('Face image is required')
    .matches(/^data:image\/(jpeg|jpg|png);base64,/)
    .withMessage('Face image must be a valid base64 encoded image')
];

const markAttendanceValidation = [
  body('faceImage')
    .notEmpty()
    .withMessage('Face image is required')
    .matches(/^data:image\/(jpeg|jpg|png);base64,/)
    .withMessage('Face image must be a valid base64 encoded image'),
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

const checkStatusValidation = [
  body('faceImage')
    .notEmpty()
    .withMessage('Face image is required')
    .matches(/^data:image\/(jpeg|jpg|png);base64,/)
    .withMessage('Face image must be a valid base64 encoded image')
];

const studentAttendanceValidation = [
  param('studentId')
    .notEmpty()
    .withMessage('Student ID is required')
    .matches(/^[A-Z0-9]+$/)
    .withMessage('Student ID must contain only uppercase letters and numbers'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
];

// Routes
router.post('/enroll', enrollValidation, validateRequest, enrollStudent);
router.post('/mark-attendance', markAttendanceValidation, validateRequest, markAttendance);
router.post('/check-status', checkStatusValidation, validateRequest, checkLoginStatus);
router.get('/stats', getAttendanceStats);
router.get('/absent-students', getAbsentStudents);
router.get('/student/:studentId', studentAttendanceValidation, validateRequest, getStudentAttendance);

export default router;
