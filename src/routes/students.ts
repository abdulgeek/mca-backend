import express from 'express';
import {
  getAllStudents,
  getStudentById,
  updateStudent,
  updateStudentBiometrics,
  toggleStudentStatus,
  getStudentAttendanceCalendar,
  updateAttendanceRecord,
  deleteAttendanceRecord
} from '../controllers/studentController';
import { body, param, query } from 'express-validator';
import { validateRequest } from '../middleware/validation';

const router = express.Router();

// Validation middleware
const updateStudentValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid student ID'),
  body('name')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s\-'!.,]+$/)
    .withMessage('Name must contain only letters, spaces, and common punctuation'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Please provide a valid phone number'),
  body('course')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Course must be between 2 and 100 characters')
];

const updateBiometricsValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid student ID'),
  body('faceImage')
    .optional()
    .matches(/^data:image\/(jpeg|jpg|png);base64,/)
    .withMessage('Face image must be a valid base64 encoded image'),
  body('fingerprintData')
    .optional()
    .isObject()
    .withMessage('Fingerprint data must be an object')
];

const studentIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid student ID')
];

const calendarValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid student ID'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
];

const updateAttendanceValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid attendance ID'),
  body('status')
    .optional()
    .isIn(['present', 'absent'])
    .withMessage('Status must be either present or absent'),
  body('timeIn')
    .optional()
    .isISO8601()
    .withMessage('Time in must be a valid ISO 8601 date'),
  body('timeOut')
    .optional()
    .isISO8601()
    .withMessage('Time out must be a valid ISO 8601 date'),
  body('location')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Location must be between 2 and 100 characters'),
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

const attendanceIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid attendance ID')
];

// Student Routes
router.get('/', getAllStudents);
router.get('/:id', studentIdValidation, validateRequest, getStudentById);
router.put('/:id', updateStudentValidation, validateRequest, updateStudent);
router.put('/:id/biometrics', updateBiometricsValidation, validateRequest, updateStudentBiometrics);
router.patch('/:id/status', studentIdValidation, validateRequest, toggleStudentStatus);
router.get('/:id/calendar', calendarValidation, validateRequest, getStudentAttendanceCalendar);

// Attendance Record Routes
router.put('/attendance/:id', updateAttendanceValidation, validateRequest, updateAttendanceRecord);
router.delete('/attendance/:id', attendanceIdValidation, validateRequest, deleteAttendanceRecord);

export default router;

