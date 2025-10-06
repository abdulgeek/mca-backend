/**
 * Generate a unique student ID based on course
 * Format: MCA-{COURSE_CODE}-{8_RANDOM_CHARS}
 */

const COURSE_CODE_MAP: Record<string, string> = {
  '1st Standard': '1ST',
  '2nd Standard': '2ND',
  '3rd Standard': '3RD',
  '4th Standard': '4TH',
  '5th Standard': '5TH',
  '6th Standard': '6TH',
  '7th Standard': '7TH',
  '8th Standard': '8TH',
  '9th Standard': '9TH',
  '10th Standard': '10TH',
  '1st PUC - Science': 'PUC1SCI',
  '1st PUC - Commerce': 'PUC1COM',
  '2nd PUC - Science': 'PUC2SCI',
  '2nd PUC - Commerce': 'PUC2COM',
  'Degree - MCA': 'DEGMCA',
  'Degree - BCA': 'DEGBCA',
  'Degree - B.Com': 'DEGCOM',
  'Degree - B.Sc': 'DEGBSC',
  'Degree - BA': 'DEGBA',
  'Degree - Other': 'DEGOTH'
};

/**
 * Generate random alphanumeric string
 */
function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }
  
  return result;
}

/**
 * Generate unique student ID
 * @param course - The course name
 * @returns Generated student ID in format MCA-{COURSE_CODE}-{8CHARS}
 */
export function generateStudentId(course: string): string {
  const courseCode = COURSE_CODE_MAP[course];
  
  if (!courseCode) {
    throw new Error(`Invalid course: ${course}`);
  }
  
  const randomPart = generateRandomString(8);
  return `MCA-${courseCode}-${randomPart}`;
}

/**
 * Validate student ID format
 */
export function validateStudentId(studentId: string): boolean {
  const pattern = /^MCA-[A-Z0-9]+-[A-Z0-9]{8}$/;
  return pattern.test(studentId);
}

/**
 * Extract course code from student ID
 */
export function extractCourseCode(studentId: string): string | null {
  const parts = studentId.split('-');
  if (parts.length !== 3) return null;
  return parts[1];
}

/**
 * Get all available courses
 */
export function getAvailableCourses(): string[] {
  return Object.keys(COURSE_CODE_MAP);
}
