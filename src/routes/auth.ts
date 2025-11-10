import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { body } from 'express-validator';
import { validateRequest } from '../middleware/validation';

const router = express.Router();

// Rate limiting for PIN validation - prevent brute force attacks
const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    success: false,
    message: 'Too many PIN attempts. Please try again in 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false // Count successful requests too
});

// PIN validation middleware
const pinValidation = [
  body('pin')
    .isString()
    .withMessage('PIN must be a string')
    .isLength({ min: 4, max: 4 })
    .withMessage('PIN must be exactly 4 digits')
    .matches(/^\d{4}$/)
    .withMessage('PIN must contain only digits')
];

/**
 * POST /api/auth/validate-pin
 * Validates the provided PIN against the backend environment variable
 */
router.post(
  '/validate-pin',
  pinLimiter,
  pinValidation,
  validateRequest,
  (req: Request, res: Response) => {
    try {
      const { pin } = req.body;
      const correctPin = process.env.ACCESS_PIN;

      // Check if PIN is configured
      if (!correctPin) {
        console.error('❌ ACCESS_PIN environment variable is not set');
        return res.status(500).json({
          success: false,
          message: 'PIN authentication is not configured on the server'
        });
      }

      // Validate PIN
      if (pin === correctPin) {
        return res.json({
          success: true,
          message: 'PIN validated successfully'
        });
      } else {
        return res.status(401).json({
          success: false,
          message: 'Invalid PIN. Please try again.'
        });
      }
    } catch (error: any) {
      console.error('❌ Error validating PIN:', error);
      return res.status(500).json({
        success: false,
        message: 'An error occurred while validating the PIN'
      });
    }
  }
);

export default router;

