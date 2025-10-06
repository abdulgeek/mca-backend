import { EventEmitter } from 'events';

class EventService extends EventEmitter {
  private static instance: EventService;

  private constructor() {
    super();
    this.setMaxListeners(100); // Increase max listeners for production
  }

  public static getInstance(): EventService {
    if (!EventService.instance) {
      EventService.instance = new EventService();
    }
    return EventService.instance;
  }

  // Attendance events
  public emitAttendanceMarked(data: {
    studentId: string;
    name: string;
    timeIn: Date;
    confidence: number;
    status: string;
    action?: 'login' | 'logout';
  }): void {
    this.emit('attendance:marked', data);
    console.log('📊 Attendance marked event emitted:', data);
  }

  public emitStudentEnrolled(data: {
    studentId: string;
    name: string;
    email: string;
    course: string;
  }): void {
    this.emit('student:enrolled', data);
    console.log('👤 Student enrolled event emitted:', data);
  }

  public emitSystemStatus(data: {
    status: 'online' | 'offline' | 'maintenance';
    message: string;
    timestamp: Date;
  }): void {
    this.emit('system:status', data);
    console.log('🔧 System status event emitted:', data);
  }

  public emitError(data: {
    error: string;
    context: string;
    timestamp: Date;
  }): void {
    this.emit('system:error', data);
    console.error('❌ System error event emitted:', data);
  }

  // Event listeners for logging
  public setupLogging(): void {
    this.on('attendance:marked', (data) => {
      console.log(`✅ Attendance marked for ${data.name} (${data.studentId})`);
    });

    this.on('student:enrolled', (data) => {
      console.log(`👤 New student enrolled: ${data.name} (${data.studentId})`);
    });

    this.on('system:status', (data) => {
      console.log(`🔧 System status: ${data.status} - ${data.message}`);
    });

    this.on('system:error', (data) => {
      console.error(`❌ System error in ${data.context}: ${data.error}`);
    });
  }

  // Get attendance statistics
  public getAttendanceStats(): Promise<{
    totalStudents: number;
    presentToday: number;
    attendanceRate: number;
  }> {
    return new Promise((resolve) => {
      this.emit('stats:request');
      
      // Listen for stats response
      const handleStats = (stats: any) => {
        this.removeListener('stats:response', handleStats);
        resolve(stats);
      };
      
      this.on('stats:response', handleStats);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        this.removeListener('stats:response', handleStats);
        resolve({
          totalStudents: 0,
          presentToday: 0,
          attendanceRate: 0
        });
      }, 5000);
    });
  }
}

export const eventService = EventService.getInstance();
export default eventService;
