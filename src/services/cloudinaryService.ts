import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
dotenv.config();

export interface CloudinaryUploadResult {
  success: boolean;
  url?: string;
  publicId?: string;
  error?: string;
}

export interface CloudinaryUploadOptions {
  folder?: string;
  fileName?: string;
  resourceType?: 'image' | 'video' | 'raw' | 'auto';
  overwrite?: boolean;
  useFilename?: boolean;
  uniqueFilename?: boolean;
}

export interface CloudinaryImageInfo {
  key: string;
  url: string;
  fileName: string;
  size: number;
  lastModified?: Date;
  timestamp?: Date;
  date?: string;
  publicId: string;
}

class CloudinaryService {
  private isConfigured: boolean = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize Cloudinary configuration
   */
  private initialize(): void {
    const cloudName = process.env.CLOUDINARY_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_SECRET_KEY;

    if (!cloudName || !apiKey || !apiSecret) {
      console.warn('⚠️ Cloudinary credentials not found in environment variables');
      this.isConfigured = false;
      return;
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true
    });

    this.isConfigured = true;
    console.log('✅ Cloudinary service initialized successfully');
  }

  /**
   * Upload buffer to Cloudinary
   */
  async uploadBuffer(
    buffer: Buffer,
    options: CloudinaryUploadOptions = {}
  ): Promise<CloudinaryUploadResult> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Cloudinary is not configured. Please check your environment variables.'
      };
    }

    try {
      const {
        folder = '',
        fileName,
        resourceType = 'image',
        overwrite = false,
        useFilename = true,
        uniqueFilename = true
      } = options;

      // Convert buffer to base64 data URI
      const base64Data = buffer.toString('base64');
      const dataUri = `data:${this.getMimeType(resourceType)};base64,${base64Data}`;

      // Build public_id from folder and filename
      let publicId = '';
      if (folder) {
        publicId = folder.endsWith('/') ? folder : `${folder}/`;
      }
      if (fileName) {
        // Remove extension from filename as Cloudinary handles it
        const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
        publicId += nameWithoutExt;
      }

      const uploadOptions: any = {
        resource_type: resourceType,
        overwrite,
        use_filename: useFilename,
        unique_filename: uniqueFilename
      };

      if (publicId) {
        uploadOptions.public_id = publicId;
      }

      const result = await cloudinary.uploader.upload(dataUri, uploadOptions);

      return {
        success: true,
        url: result.secure_url,
        publicId: result.public_id
      };
    } catch (error: any) {
      console.error('❌ Cloudinary upload error:', error);
      return {
        success: false,
        error: error.message || 'Failed to upload to Cloudinary'
      };
    }
  }

  /**
   * Upload file from URL to Cloudinary
   */
  async uploadFromUrl(
    url: string,
    options: CloudinaryUploadOptions = {}
  ): Promise<CloudinaryUploadResult> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Cloudinary is not configured. Please check your environment variables.'
      };
    }

    try {
      const {
        folder = '',
        fileName,
        resourceType = 'image',
        overwrite = false
      } = options;

      let publicId = '';
      if (folder) {
        publicId = folder.endsWith('/') ? folder : `${folder}/`;
      }
      if (fileName) {
        const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
        publicId += nameWithoutExt;
      }

      const uploadOptions: any = {
        resource_type: resourceType,
        overwrite
      };

      if (publicId) {
        uploadOptions.public_id = publicId;
      }

      const result = await cloudinary.uploader.upload(url, uploadOptions);

      return {
        success: true,
        url: result.secure_url,
        publicId: result.public_id
      };
    } catch (error: any) {
      console.error('❌ Cloudinary upload from URL error:', error);
      return {
        success: false,
        error: error.message || 'Failed to upload from URL to Cloudinary'
      };
    }
  }

  /**
   * Delete file from Cloudinary
   */
  async deleteFile(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'image'): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Cloudinary is not configured. Please check your environment variables.'
      };
    }

    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType
      });

      if (result.result === 'ok') {
        return { success: true };
      } else {
        return {
          success: false,
          error: result.result || 'Failed to delete file'
        };
      }
    } catch (error: any) {
      console.error('❌ Cloudinary delete error:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete from Cloudinary'
      };
    }
  }

  /**
   * Get MIME type based on resource type
   */
  private getMimeType(resourceType: string): string {
    switch (resourceType) {
      case 'image':
        return 'image/jpeg';
      case 'video':
        return 'video/mp4';
      case 'raw':
        return 'application/octet-stream';
      default:
        return 'image/jpeg';
    }
  }

  /**
   * Validate Cloudinary configuration
   */
  validateConfiguration(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!process.env.CLOUDINARY_NAME) {
      errors.push('CLOUDINARY_NAME is required');
    }

    if (!process.env.CLOUDINARY_API_KEY) {
      errors.push('CLOUDINARY_API_KEY is required');
    }

    if (!process.env.CLOUDINARY_SECRET_KEY) {
      errors.push('CLOUDINARY_SECRET_KEY is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if Cloudinary is configured
   */
  isServiceConfigured(): boolean {
    return this.isConfigured;
  }

  /**
   * Upload base64 image to Cloudinary
   */
  async uploadBase64Image(
    base64Data: string,
    options: CloudinaryUploadOptions = {}
  ): Promise<CloudinaryUploadResult> {
    try {
      // Remove data URL prefix if present
      const base64String = base64Data.includes(',') 
        ? base64Data.split(',')[1] 
        : base64Data;
      
      const imageBuffer = Buffer.from(base64String, 'base64');
      
      return await this.uploadBuffer(imageBuffer, options);
    } catch (error: any) {
      console.error('❌ Base64 upload error:', error);
      return {
        success: false,
        error: error.message || 'Failed to process base64 image'
      };
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
  ): Promise<CloudinaryUploadResult> {
    // Create organized folder structure: students/{name}/{mongoid}/images/
    const sanitizedName = this.sanitizeFolderName(studentName);
    const folderPath = `students/${sanitizedName}/${mongoId}/images`;
    
    const fileName = `profile_${Date.now()}.jpg`;

    return await this.uploadBase64Image(base64Data, {
      folder: folderPath,
      fileName,
      resourceType: 'image',
      overwrite: false,
      useFilename: true,
      uniqueFilename: false
    });
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
  ): Promise<CloudinaryUploadResult> {
    // Create organized folder structure: students/{name}/{mongoid}/images/
    const sanitizedName = this.sanitizeFolderName(studentName);
    const folderPath = `students/${sanitizedName}/${mongoId}/images`;
    
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    const timeStr = date.toISOString().split('T')[1].split('.')[0].replace(/:/g, '-'); // HH-MM-SS format
    
    const fileName = `${action}_${dateStr}_${timeStr}.jpg`;

    return await this.uploadBase64Image(base64Data, {
      folder: folderPath,
      fileName,
      resourceType: 'image',
      overwrite: false,
      useFilename: true,
      uniqueFilename: false
    });
  }

  /**
   * Sanitize folder name for Cloudinary compatibility
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
   * Generate optimized image URL with Cloudinary transformations
   * @param publicId - The public ID of the image
   * @param options - Transformation options
   * @returns Optimized image URL
   */
  getOptimizedImageUrl(
    publicId: string,
    options: {
      width?: number;
      height?: number;
      quality?: number | 'auto';
      format?: 'jpg' | 'png' | 'webp' | 'auto';
      crop?: 'fill' | 'fit' | 'scale' | 'thumb';
      gravity?: 'face' | 'center' | 'auto';
    } = {}
  ): string {
    if (!this.isConfigured) {
      return '';
    }

    const {
      width,
      height,
      quality = 'auto',
      format = 'auto',
      crop = 'fill',
      gravity = 'auto'
    } = options;

    const transformations: any = {};

    if (width) transformations.width = width;
    if (height) transformations.height = height;
    if (quality) transformations.quality = quality;
    if (format) transformations.format = format;
    if (crop) transformations.crop = crop;
    if (gravity) transformations.gravity = gravity;

    return cloudinary.url(publicId, {
      secure: true,
      transformation: [transformations]
    });
  }

  /**
   * Generate thumbnail URL for profile images
   */
  getThumbnailUrl(publicId: string, size: number = 200): string {
    return this.getOptimizedImageUrl(publicId, {
      width: size,
      height: size,
      crop: 'fill',
      gravity: 'face',
      quality: 'auto',
      format: 'auto'
    });
  }

  /**
   * List images for a specific student using Cloudinary Admin API
   */
  async listStudentImages(studentName: string, mongoId: string): Promise<{ images: CloudinaryImageInfo[]; error?: string }> {
    if (!this.isConfigured) {
      return {
        images: [],
        error: 'Cloudinary is not configured. Please check your environment variables.'
      };
    }

    try {
      const folderPath = this.getStudentFolderPath(studentName, mongoId);
      
      // Use Cloudinary Admin API to list resources by prefix
      const result = await cloudinary.api.resources({
        type: 'upload',
        resource_type: 'image',
        prefix: folderPath,
        max_results: 1000
      });

      if (!result.resources || result.resources.length === 0) {
        return { images: [] };
      }

      // Transform Cloudinary resources to match expected format
      const images: CloudinaryImageInfo[] = result.resources
        .filter((resource: any) => {
          // Filter only image files (jpg, png, etc.)
          const publicId = resource.public_id || '';
          return publicId.match(/\.(jpg|jpeg|png|gif|webp)$/i) || resource.format;
        })
        .map((resource: any) => {
          const publicId = resource.public_id || '';
          const fileName = publicId.split('/').pop() || publicId;
          
          // Extract date from filename if it matches pattern (login_YYYY-MM-DD_HH-MM-SS.jpg)
          const dateMatch = fileName.match(/(login|logout|profile)_(\d{4}-\d{2}-\d{2})_?(\d{2}-\d{2}-\d{2})?/);
          let timestamp: Date | undefined;
          let date: string | undefined;

          if (dateMatch) {
            const dateStr = dateMatch[2];
            const timeStr = dateMatch[3];
            if (timeStr) {
              timestamp = new Date(`${dateStr}T${timeStr.replace(/-/g, ':')}`);
            } else {
              timestamp = new Date(dateStr);
            }
            date = dateStr;
          } else {
            timestamp = resource.created_at ? new Date(resource.created_at) : undefined;
            date = timestamp ? timestamp.toISOString().split('T')[0] : undefined;
          }

          return {
            key: publicId,
            url: resource.secure_url || resource.url,
            fileName: fileName,
            size: resource.bytes || 0,
            lastModified: resource.created_at ? new Date(resource.created_at) : undefined,
            timestamp: timestamp,
            date: date,
            publicId: publicId
          };
        })
        .sort((a: CloudinaryImageInfo, b: CloudinaryImageInfo) => {
          // Sort by timestamp (newest first)
          const dateA = a.timestamp ? a.timestamp.getTime() : 0;
          const dateB = b.timestamp ? b.timestamp.getTime() : 0;
          return dateB - dateA;
        });

      return { images };
    } catch (error: any) {
      console.error('❌ Error listing student images:', error);
      return {
        images: [],
        error: error.message || 'Failed to list student images'
      };
    }
  }

  /**
   * Delete student folder and all images using Cloudinary Admin API
   */
  async deleteStudentFolder(studentName: string, mongoId: string): Promise<{ success: boolean; error?: string; deletedCount?: number }> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Cloudinary is not configured. Please check your environment variables.'
      };
    }

    try {
      const folderPath = this.getStudentFolderPath(studentName, mongoId);
      
      console.log(`🗑️ Deleting folder: ${folderPath}`);

      // First, list all resources in the folder
      const listResult = await cloudinary.api.resources({
        type: 'upload',
        resource_type: 'image',
        prefix: folderPath,
        max_results: 500 // Cloudinary allows up to 500 per request
      });

      if (!listResult.resources || listResult.resources.length === 0) {
        console.log(`✅ No resources found in folder: ${folderPath}`);
        return { success: true, deletedCount: 0 };
      }

      // Extract public IDs from resources
      const publicIds = listResult.resources.map((resource: any) => resource.public_id);

      console.log(`📋 Found ${publicIds.length} resources to delete`);

      // Delete resources in batches (Cloudinary allows up to 100 per delete request)
      const batchSize = 100;
      let deletedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < publicIds.length; i += batchSize) {
        const batch = publicIds.slice(i, i + batchSize);
        
        try {
          const deleteResult = await cloudinary.api.delete_resources(batch, {
            resource_type: 'image',
            type: 'upload'
          });

          // Count successful deletions
          if (deleteResult.deleted) {
            const batchDeleted = Object.values(deleteResult.deleted).filter(
              (status: any) => status === 'deleted'
            ).length;
            deletedCount += batchDeleted;
          }

          // Count failed deletions
          if (deleteResult.not_found) {
            failedCount += deleteResult.not_found.length;
          }
        } catch (batchError: any) {
          console.error(`❌ Error deleting batch ${Math.floor(i / batchSize) + 1}:`, batchError);
          failedCount += batch.length;
        }
      }

      if (failedCount > 0) {
        console.warn(`⚠️ Failed to delete ${failedCount} resources`);
      }

      console.log(`✅ Successfully deleted ${deletedCount} resources from folder: ${folderPath}`);

      return {
        success: deletedCount > 0,
        deletedCount,
        error: failedCount > 0 ? `Failed to delete ${failedCount} resources` : undefined
      };
    } catch (error: any) {
      console.error('❌ Error deleting student folder:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete student folder'
      };
    }
  }
}

// Export singleton instance
export const cloudinaryService = new CloudinaryService();
export default cloudinaryService;

