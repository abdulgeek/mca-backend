import * as faceapi from 'face-api.js';
import { Canvas, Image, ImageData } from 'canvas';
import path from 'path';
import sharp from 'sharp';
import { FaceDetectionResult } from '../types';

// Configure face-api.js to use Node.js canvas
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

let modelsLoaded = false;
const modelsPath = path.join(__dirname, '../../models');

export const initializeFaceAPI = async (): Promise<void> => {
  try {
    console.log('🚀 Initializing face-api.js...');

    // Load all required models
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromDisk(modelsPath),
      faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath),
      faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath),
      faceapi.nets.faceExpressionNet.loadFromDisk(modelsPath),
      faceapi.nets.ageGenderNet.loadFromDisk(modelsPath)
    ]);

    modelsLoaded = true;
    console.log('✅ Face-api.js models loaded successfully');

  } catch (error) {
    console.error('❌ Error loading face-api.js models:', error);
    throw new Error('Failed to load face recognition models');
  }
};

export const detectFaces = async (imageBuffer: Buffer): Promise<FaceDetectionResult[]> => {
  if (!modelsLoaded) {
    throw new Error('Face recognition models not loaded');
  }

  try {
    console.log(`🔍 Starting face detection with buffer size: ${imageBuffer.length} bytes`);
    
    // Use sharp to process the image and create a proper format
    const processedBuffer = await sharp(imageBuffer)
      .resize(640, 480, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    
    // Create a simple HTMLImageElement and load it properly
    const img = new Image();
    
    const base64 = processedBuffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64}`;
    
    // Load image with proper error handling
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Image loading timeout'));
      }, 5000);
      
      img.onload = () => {
        clearTimeout(timeout);
        console.log(`📸 Image loaded: ${img.width}x${img.height}`);
        resolve();
      };
      
      img.onerror = (err) => {
        clearTimeout(timeout);
        console.error('❌ Image load error:', err);
        reject(new Error('Failed to load image'));
      };
      
      img.src = dataUrl;
    });

    // Wait a bit more to ensure image is fully loaded
    await new Promise(resolve => setTimeout(resolve, 100));

    // Detect faces with all features
    const detections = await faceapi
      .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptors()
      .withFaceExpressions()
      .withAgeAndGender();

    console.log(`🔍 Detected ${detections.length} faces`);

    // Convert to our format
    const results: FaceDetectionResult[] = detections.map(detection => ({
      detection: {
        box: {
          x: detection.detection.box.x,
          y: detection.detection.box.y,
          width: detection.detection.box.width,
          height: detection.detection.box.height
        },
        score: detection.detection.score
      },
      descriptor: detection.descriptor,
      landmarks: detection.landmarks ? {
        positions: detection.landmarks.positions.map((pos: any) => ({ x: pos.x, y: pos.y }))
      } : null,
      expressions: detection.expressions ? {
        neutral: detection.expressions.neutral,
        happy: detection.expressions.happy,
        sad: detection.expressions.sad,
        angry: detection.expressions.angry,
        fearful: detection.expressions.fearful,
        disgusted: detection.expressions.disgusted,
        surprised: detection.expressions.surprised
      } : null
    }));

    return results;

  } catch (error: any) {
    console.error('❌ Face detection error:', error);
    throw new Error(`Face detection failed: ${error.message || 'Unknown error'}`);
  }
};

export const extractFaceDescriptor = async (imageBuffer: Buffer): Promise<Float32Array> => {
  try {
    const detections = await detectFaces(imageBuffer);

    if (detections.length === 0) {
      throw new Error('No face detected in image');
    }

    if (detections.length > 1) {
      throw new Error('Multiple faces detected. Please ensure only one face is visible');
    }

    return detections[0].descriptor;
  } catch (error) {
    console.error('❌ Face descriptor extraction error:', error);
    throw error;
  }
};

export const compareFaces = (
  descriptor1: Float32Array,
  descriptor2: Float32Array,
  threshold: number = 0.6
): { match: boolean; confidence: number; distance: number } => {
  try {
    // Calculate Euclidean distance between descriptors
    const distance = faceapi.euclideanDistance(descriptor1, descriptor2);
    
    // Convert distance to confidence (lower distance = higher confidence)
    // face-api.js uses 0.6 as the default threshold for face recognition
    const confidence = Math.max(0, 1 - (distance / 1.0)); // Normalize to 0-1 range
    
    console.log(`🔍 Face comparison: distance=${distance.toFixed(3)}, confidence=${confidence.toFixed(3)}, threshold=${threshold}`);

    return {
      match: distance < threshold,
      confidence: confidence,
      distance: distance
    };
  } catch (error) {
    console.error('❌ Face comparison error:', error);
    throw new Error('Face comparison failed');
  }
};

export const findBestMatch = async (
  probeDescriptor: Float32Array,
  studentDescriptors: Array<{ _id: string; studentId: string; name: string; faceDescriptor: number[] }>,
  threshold: number = 0.6
): Promise<{
  studentId: string;
  studentIdString: string;
  name: string;
  confidence: number;
  distance: number;
} | null> => {
  let bestMatch: {
    studentId: string;
    studentIdString: string;
    name: string;
    confidence: number;
    distance: number;
  } | null = null;
  let bestDistance = Infinity;

  for (const student of studentDescriptors) {
    const studentDescriptor = new Float32Array(student.faceDescriptor);
    const distance = faceapi.euclideanDistance(probeDescriptor, studentDescriptor);
    
    console.log(`🔍 Comparing with ${student.name}: distance=${distance.toFixed(3)}`);

    if (distance < threshold && distance < bestDistance) {
      bestMatch = {
        studentId: student._id,
        studentIdString: student.studentId,
        name: student.name,
        confidence: Math.max(0, 1 - (distance / 1.0)),
        distance: distance
      };
      bestDistance = distance;
    }
  }

  if (bestMatch) {
    console.log(`✅ Best match: ${bestMatch.name} with distance ${bestMatch.distance.toFixed(3)}`);
  } else {
    console.log(`❌ No match found below threshold ${threshold}`);
  }

  return bestMatch;
};

export const validateFaceQuality = (detections: FaceDetectionResult[]): {
  valid: boolean;
  reason: string;
  quality: number;
} => {
  if (!detections || detections.length === 0) {
    return { valid: false, reason: 'No face detected', quality: 0 };
  }

  if (detections.length > 1) {
    return { valid: false, reason: 'Multiple faces detected', quality: 0 };
  }

  const detection = detections[0];
  const box = detection.detection.box;

  // Check face size (minimum 100x100 pixels)
  if (box.width < 100 || box.height < 100) {
    return { valid: false, reason: 'Face too small', quality: 0.3 };
  }

  // Check detection confidence
  if (detection.detection.score < 0.5) {
    return { valid: false, reason: 'Face detection confidence too low', quality: 0.2 };
  }

  // Calculate quality score based on size and confidence
  const sizeScore = Math.min(1, (box.width * box.height) / (200 * 200));
  const confidenceScore = detection.detection.score;
  const quality = (sizeScore + confidenceScore) / 2;

  return {
    valid: quality > 0.6,
    reason: quality > 0.6 ? 'Face quality acceptable' : 'Face quality too low',
    quality: quality
  };
};

export const preprocessImage = async (imageBuffer: Buffer): Promise<Buffer> => {
  try {
    // For face-api.js, we can return the buffer as-is since it handles image processing internally
    return imageBuffer;
  } catch (error) {
    console.error('❌ Image preprocessing error:', error);
    throw new Error('Image preprocessing failed');
  }
};

export const isModelsLoaded = (): boolean => {
  return modelsLoaded;
};