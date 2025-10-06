/**
 * WhatsApp Messaging Utility
 * Uses direct WhatsApp links for sending messages
 */

/**
 * Generate WhatsApp message link
 * @param phone - Phone number with country code (e.g., +919876543210)
 * @param message - Message to send
 * @returns WhatsApp link
 */
export function generateWhatsAppLink(phone: string, message: string): string {
  // Remove any non-digit characters except the leading +
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  
  // Encode the message for URL
  const encodedMessage = encodeURIComponent(message);
  
  // Generate WhatsApp link (works on both mobile and web)
  return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
}

/**
 * Generate absence notification message
 * @param studentName - Name of the student
 * @param date - Date of absence
 * @returns Formatted message
 */
export function generateAbsenceMessage(studentName: string, date: Date = new Date()): string {
  const dateStr = date.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  return `Dear ${studentName},

We noticed that you were absent on ${dateStr}.

Please ensure regular attendance for better academic performance.

Thank you,
Madani Computer Academy`;
}

/**
 * Generate bulk WhatsApp links for multiple students
 * @param students - Array of students with phone and name
 * @param date - Date of absence
 * @returns Array of WhatsApp links with student details
 */
export function generateBulkWhatsAppLinks(
  students: Array<{ name: string; phone: string }>,
  date: Date = new Date()
): Array<{ name: string; phone: string; link: string; message: string }> {
  return students.map(student => {
    const message = generateAbsenceMessage(student.name, date);
    const link = generateWhatsAppLink(student.phone, message);
    
    return {
      name: student.name,
      phone: student.phone,
      link,
      message
    };
  });
}

/**
 * Validate phone number format
 * @param phone - Phone number to validate
 * @returns true if valid, false otherwise
 */
export function validatePhoneNumber(phone: string): boolean {
  // Check if phone number is in international format
  const pattern = /^[\+]?[1-9]\d{1,14}$/;
  return pattern.test(phone.replace(/[\s-()]/g, ''));
}

/**
 * Format phone number for WhatsApp
 * Ensures it has country code
 * @param phone - Phone number
 * @param defaultCountryCode - Default country code (default: +91 for India)
 * @returns Formatted phone number
 */
export function formatPhoneNumber(phone: string, defaultCountryCode: string = '+91'): string {
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // If doesn't start with +, add default country code
  if (!cleaned.startsWith('+')) {
    // Remove leading 0 if present
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    }
    cleaned = defaultCountryCode + cleaned;
  }
  
  return cleaned;
}
