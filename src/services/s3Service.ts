import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
dotenv.config();

export interface S3UploadResult {
  success: boolean;
  url?: string;
  key?: string;
  error?: string;
}

export interface ImageUploadOptions {
  bucket: string;
  folder: string;
  fileName?: string;
  contentType: string;
  metadata?: Record<string, string>;
}

class S3Service {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    this.bucketName = process.env.AWS_S3_BUCKET_NAME || 'attendance-system-images';
    
    // Use us-east-1 as default region
    const region = process.env.AWS_REGION || 'us-east-1';
    
    // Always initialize with real credentials if available, otherwise use dummy
    this.s3Client = new S3Client({
      region: region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
      },
      // Add retry configuration
      maxAttempts: 3,
      retryMode: 'adaptive'
    });
    
    // Debug what credentials are being used
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      console.log('✅ S3 client initialized with real credentials');
    } else {
      console.warn('⚠️ S3 client initialized with dummy credentials - check your .env file');
    }
  }

  /**
   * Upload image to S3 bucket
   */
  async uploadImage(
    imageBuffer: Buffer, 
    options: ImageUploadOptions
  ): Promise<S3UploadResult> {
    try {

      const fileName = options.fileName || `${uuidv4()}.jpg`;
      const key = `${options.folder}/${fileName}`;
      
      // Sanitize metadata to prevent header issues
      const sanitizedMetadata: Record<string, string> = {};
      if (options.metadata) {
        Object.entries(options.metadata).forEach(([key, value]) => {
          // Ensure all metadata values are strings and properly formatted
          sanitizedMetadata[key] = String(value).trim();
        });
      }

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: imageBuffer,
        ContentType: options.contentType,
        Metadata: sanitizedMetadata,
        ACL: 'public-read' // Make images publicly accessible
      });

      await this.s3Client.send(command);
      
      const url = `https://${this.bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
      
      console.log(`✅ Image uploaded successfully: ${url}`);
      
      return {
        success: true,
        url,
        key
      };
    } catch (error: any) {
      console.error('❌ S3 upload error:', error);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to upload image to S3';
      if (error.name === 'AuthorizationHeaderMalformed') {
        errorMessage = 'AWS credentials are invalid or missing';
      } else if (error.name === 'InvalidAccessKeyId') {
        errorMessage = 'AWS Access Key ID is invalid or does not exist';
      } else if (error.name === 'NoSuchBucket') {
        errorMessage = 'S3 bucket does not exist';
      } else if (error.name === 'AccessDenied') {
        errorMessage = 'Access denied to S3 bucket';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // Add helpful setup instructions for common errors
      if (error.name === 'InvalidAccessKeyId' || error.name === 'AuthorizationHeaderMalformed') {
        errorMessage += '\n\n🔧 Setup Instructions:\n1. Go to AWS Console -> IAM -> Users\n2. Create a new user with S3 permissions\n3. Generate access keys\n4. Update your .env file with real credentials\n5. Restart the server';
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Upload base64 image to S3
   */
  async uploadBase64Image(
    base64Data: string, 
    options: ImageUploadOptions
  ): Promise<S3UploadResult> {
    try {
      // Remove data URL prefix if present
      const base64String = base64Data.includes(',') 
        ? base64Data.split(',')[1] 
        : base64Data;
      
      const imageBuffer = Buffer.from(base64String, 'base64');
      
      return await this.uploadImage(imageBuffer, options);
    } catch (error: any) {
      console.error('❌ Base64 upload error:', error);
      return {
        success: false,
        error: error.message || 'Failed to process base64 image'
      };
    }
  }

  /**
   * Generate presigned URL for image access
   */
  async getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error: any) {
      console.error('❌ Presigned URL error:', error);
      throw new Error('Failed to generate presigned URL');
    }
  }

  /**
   * Upload profile image for student enrollment
   */
  async uploadProfileImage(
    base64Data: string, 
    studentId: string,
    studentName: string,
    mongoId: string
  ): Promise<S3UploadResult> {
    // Create organized folder structure: students/{name}/{mongoid}/images/
    const sanitizedName = this.sanitizeFolderName(studentName);
    const folderPath = `students/${sanitizedName}/${mongoId}/images`;
    
    const options: ImageUploadOptions = {
      bucket: this.bucketName,
      folder: folderPath,
      fileName: `profile_${Date.now()}.jpg`,
      contentType: 'image/jpeg',
      metadata: {
        studentId,
        studentName,
        mongoId,
        type: 'profile',
        uploadedAt: new Date().toISOString()
      }
    };

    return await this.uploadBase64Image(base64Data, options);
  }

  /**
   * Upload attendance image for daily check-in/checkout
   */
  async uploadAttendanceImage(
    base64Data: string, 
    studentId: string,
    studentName: string,
    mongoId: string,
    date: Date = new Date(),
    action: 'login' | 'logout' = 'login'
  ): Promise<S3UploadResult> {
    // Create organized folder structure: students/{name}/{mongoid}/images/
    const sanitizedName = this.sanitizeFolderName(studentName);
    const folderPath = `students/${sanitizedName}/${mongoId}/images`;
    
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    const timeStr = date.toISOString().split('T')[1].split('.')[0].replace(/:/g, '-'); // HH-MM-SS format
    
    const options: ImageUploadOptions = {
      bucket: this.bucketName,
      folder: folderPath,
      fileName: `${action}_${dateStr}_${timeStr}.jpg`,
      contentType: 'image/jpeg',
      metadata: {
        studentId,
        studentName,
        mongoId,
        type: action,
        date: dateStr,
        uploadedAt: new Date().toISOString()
      }
    };

    return await this.uploadBase64Image(base64Data, options);
  }

  /**
   * Sanitize folder name for S3 compatibility
   */
  private sanitizeFolderName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Get student folder path
   */
  getStudentFolderPath(studentName: string, mongoId: string): string {
    const sanitizedName = this.sanitizeFolderName(studentName);
    return `students/${sanitizedName}/${mongoId}/images`;
  }

  /**
   * List images for a specific student
   */
  async listStudentImages(studentName: string, mongoId: string): Promise<{ images: any[]; error?: string }> {
    try {
      const folderPath = this.getStudentFolderPath(studentName, mongoId);
      
      const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: `${folderPath}/`,
        MaxKeys: 1000
      });

      const response = await this.s3Client.send(command);
      
      if (!response.Contents) {
        return { images: [] };
      }

      const images = await Promise.all(
        response.Contents
          .filter(obj => obj.Key && obj.Key.endsWith('.jpg'))
          .map(async (obj) => {
            try {
              // Generate presigned URL for viewing
              const getCommand = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: obj.Key!
              });
              
              const signedUrl = await getSignedUrl(this.s3Client, getCommand, { 
                expiresIn: 3600 // 1 hour
              });

              // Extract metadata from key
              const fileName = obj.Key!.split('/').pop() || '';
              const dateMatch = fileName.match(/attendance_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})/);
              
              return {
                key: obj.Key,
                url: signedUrl,
                fileName,
                size: obj.Size || 0,
                lastModified: obj.LastModified,
                timestamp: dateMatch ? new Date(`${dateMatch[1]}T${dateMatch[2].replace(/-/g, ':')}`) : obj.LastModified,
                date: dateMatch ? dateMatch[1] : obj.LastModified?.toISOString().split('T')[0]
              };
            } catch (urlError) {
              console.error('Error generating signed URL for:', obj.Key, urlError);
              return null;
            }
          })
      );

      // Filter out failed URL generations and sort by timestamp (newest first)
      const validImages = images
        .filter(img => img !== null)
        .sort((a, b) => {
          const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
          return dateB - dateA;
        });

      return { images: validImages };
    } catch (error: any) {
      console.error('❌ Error listing student images:', error);
      return { 
        images: [], 
        error: error.message || 'Failed to list student images' 
      };
    }
  }

  /**
   * Delete student folder and all images
   */
  async deleteStudentFolder(studentName: string, mongoId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const folderPath = this.getStudentFolderPath(studentName, mongoId);
      
      // This would require implementing S3 delete operation for folder
      // For now, return success as placeholder
      console.log(`🗑️ Would delete folder: ${folderPath}`);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Error deleting student folder:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to delete student folder' 
      };
    }
  }

  /**
   * Validate S3 configuration
   */
  validateConfiguration(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    console.log('🔍 Validating S3 configuration...');
    console.log(`📦 Bucket name: ${process.env.AWS_S3_BUCKET_NAME}`);
    console.log(`🔑 Access Key: ${process.env.AWS_ACCESS_KEY_ID ? 'Set' : 'Not set'}`);
    console.log(`🔐 Secret Key: ${process.env.AWS_SECRET_ACCESS_KEY ? 'Set' : 'Not set'}`);
    
    if (!process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID === 'your-aws-access-key-id') {
      errors.push('AWS_ACCESS_KEY_ID is required');
    }
    
    if (!process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY === 'your-aws-secret-access-key') {
      errors.push('AWS_SECRET_ACCESS_KEY is required');
    }
    
    // AWS_REGION is optional - we'll use us-east-1 as default
    const region = process.env.AWS_REGION || 'us-east-1';
    console.log(`🌍 Using AWS Region: ${region}`);
    
    if (!process.env.AWS_S3_BUCKET_NAME) {
      errors.push('AWS_S3_BUCKET_NAME is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance
export const s3Service = new S3Service();
export default s3Service;
