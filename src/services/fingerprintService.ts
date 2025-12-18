import crypto from 'crypto';
import { FingerprintVerificationRequest, ExternalFingerprintData, TemplateMatchResult } from '../types';

/**
 * Fingerprint Service
 * Handles WebAuthn fingerprint authentication verification
 */

export class FingerprintService {
  /**
   * Verify fingerprint authentication assertion
   * @param credentialId - The credential ID from WebAuthn
   * @param authenticatorData - Base64 encoded authenticator data
   * @param clientDataJSON - Base64 encoded client data JSON
   * @param signature - Base64 encoded signature
   * @param publicKey - Stored public key for this credential
   * @param challenge - Expected challenge (optional, can be validated separately)
   * @returns boolean indicating if verification succeeded
   */
  static async verifyAssertion(
    request: FingerprintVerificationRequest,
    publicKey: string,
    challenge?: string
  ): Promise<boolean> {
    try {
      // Decode the client data JSON
      const clientDataBuffer = Buffer.from(request.clientDataJSON, 'base64');
      const clientData = JSON.parse(clientDataBuffer.toString('utf8'));

      // Verify the challenge if provided
      if (challenge && clientData.challenge !== challenge) {
        console.error('Challenge mismatch');
        return false;
      }

      // Verify the origin (in production, validate against your domain)
      if (clientData.type !== 'webauthn.get') {
        console.error('Invalid client data type');
        return false;
      }

      // Create the data that was signed
      const authDataBuffer = Buffer.from(request.authenticatorData, 'base64');
      const clientDataHash = crypto.createHash('sha256').update(clientDataBuffer).digest();
      const signedData = Buffer.concat([authDataBuffer, clientDataHash]);

      // Decode the signature
      const signatureBuffer = Buffer.from(request.signature, 'base64');

      // Import the public key
      const publicKeyBuffer = Buffer.from(publicKey, 'base64');

      // Verify the signature using the public key
      // Note: This is a simplified verification. In production, use a proper WebAuthn library
      const verify = crypto.createVerify('SHA256');
      verify.update(signedData);
      verify.end();

      // For ECDSA P-256 keys (most common for WebAuthn)
      const isValid = verify.verify(
        {
          key: publicKeyBuffer,
          format: 'der',
          type: 'spki'
        },
        signatureBuffer
      );

      return isValid;
    } catch (error) {
      console.error('Fingerprint verification error:', error);
      return false;
    }
  }

  /**
   * Generate a random challenge for WebAuthn
   * @returns Base64 encoded challenge
   */
  static generateChallenge(): string {
    const challenge = crypto.randomBytes(32);
    return challenge.toString('base64');
  }

  /**
   * Validate credential ID format
   * @param credentialId - The credential ID to validate
   * @returns boolean
   */
  static isValidCredentialId(credentialId: string): boolean {
    try {
      const buffer = Buffer.from(credentialId, 'base64');
      return buffer.length >= 16 && buffer.length <= 1024;
    } catch {
      return false;
    }
  }

  /**
   * Hash credential ID for secure storage and comparison
   * @param credentialId - The credential ID
   * @returns Hashed credential ID
   */
  static hashCredentialId(credentialId: string): string {
    return crypto
      .createHash('sha256')
      .update(credentialId)
      .digest('hex');
  }

  /**
   * Simple fingerprint matching by credential ID
   * This is used for attendance marking - we just verify they have the credential
   * @param providedCredentialId - Credential ID from authentication
   * @param storedCredentialId - Stored credential ID
   * @returns boolean
   */
  static matchCredential(providedCredentialId: string, storedCredentialId: string): boolean {
    return providedCredentialId === storedCredentialId;
  }

  /**
   * Verify external fingerprint template against stored template
   * Uses sensor-specific matching or generic comparison
   * @param capturedTemplate - Base64 encoded captured template
   * @param storedTemplate - Base64 encoded stored template
   * @param sensorType - Type of sensor used for capture
   * @returns Promise with match result and confidence
   */
  static async verifyExternalTemplate(
    capturedTemplate: string,
    storedTemplate: string,
    sensorType: string
  ): Promise<{ match: boolean; confidence: number }> {
    try {
      // For Digital Persona - use SDK matching if available
      if (sensorType === 'digital_persona' && this.hasDPSDK()) {
        return this.matchWithDPSDK(capturedTemplate, storedTemplate);
      }

      // For ZKTeco - use SDK matching if available
      if (sensorType === 'zkteco' && this.hasZKTecoSDK()) {
        return this.matchWithZKTecoSDK(capturedTemplate, storedTemplate);
      }

      // Fallback: Generic template comparison
      return this.compareTemplatesGeneric(capturedTemplate, storedTemplate);
    } catch (error) {
      console.error('Error verifying external template:', error);
      return { match: false, confidence: 0 };
    }
  }

  /**
   * Generic template comparison using Hamming distance
   * Works with most fingerprint template formats
   * @param template1 - First template (base64)
   * @param template2 - Second template (base64)
   * @returns Match result with confidence
   */
  static compareTemplatesGeneric(template1: string, template2: string): { match: boolean; confidence: number } {
    try {
      // Decode base64 templates
      const buf1 = Buffer.from(template1, 'base64');
      const buf2 = Buffer.from(template2, 'base64');

      // Templates must be the same length for comparison
      if (buf1.length !== buf2.length) {
        return { match: false, confidence: 0 };
      }

      // Calculate Hamming distance (number of differing bits)
      let differences = 0;
      let totalBits = buf1.length * 8;

      for (let i = 0; i < buf1.length; i++) {
        const xor = buf1[i] ^ buf2[i];
        // Count set bits in XOR result
        let setBits = xor;
        while (setBits) {
          differences += setBits & 1;
          setBits >>= 1;
        }
      }

      // Calculate similarity score (0-1)
      const similarity = 1 - (differences / totalBits);
      
      // Apply threshold for match decision
      const threshold = 0.75; // 75% similarity required
      const match = similarity >= threshold;

      return {
        match,
        confidence: similarity
      };
    } catch (error) {
      console.error('Error in generic template comparison:', error);
      return { match: false, confidence: 0 };
    }
  }

  /**
   * Advanced template comparison using minutiae matching
   * More sophisticated algorithm for better accuracy
   * @param template1 - First template (base64)
   * @param template2 - Second template (base64)
   * @returns Match result with confidence
   */
  static compareTemplatesAdvanced(template1: string, template2: string): { match: boolean; confidence: number } {
    try {
      const buf1 = Buffer.from(template1, 'base64');
      const buf2 = Buffer.from(template2, 'base64');

      // Extract minutiae points (simplified simulation)
      const minutiae1 = this.extractMinutiae(buf1);
      const minutiae2 = this.extractMinutiae(buf2);

      // Match minutiae points
      const matchedPoints = this.matchMinutiae(minutiae1, minutiae2);
      
      // Calculate confidence based on matched minutiae
      const totalPoints = Math.max(minutiae1.length, minutiae2.length);
      const confidence = totalPoints > 0 ? matchedPoints / totalPoints : 0;

      // Require at least 12 matched minutiae for positive match (industry standard)
      const match = matchedPoints >= 12 && confidence >= 0.6;

      return { match, confidence };
    } catch (error) {
      console.error('Error in advanced template comparison:', error);
      return { match: false, confidence: 0 };
    }
  }

  /**
   * Calculate similarity between two templates using multiple algorithms
   * Combines different matching techniques for better accuracy
   */
  static async calculateTemplateSimilarity(
    template1: string, 
    template2: string,
    sensorType?: string
  ): Promise<number> {
    try {
      // Use sensor-specific algorithms if available
      if (sensorType) {
        const result = await this.verifyExternalTemplate(template1, template2, sensorType);
        return result.confidence;
      }

      // Combine multiple algorithms for better accuracy
      const genericResult = this.compareTemplatesGeneric(template1, template2);
      const advancedResult = this.compareTemplatesAdvanced(template1, template2);

      // Weighted average of different algorithms
      return (genericResult.confidence * 0.4) + (advancedResult.confidence * 0.6);
    } catch (error) {
      console.error('Error calculating template similarity:', error);
      return 0;
    }
  }

  // Helper methods for SDK integration

  /**
   * Check if Digital Persona SDK is available
   */
  private static hasDPSDK(): boolean {
    try {
      // In production, this would check for actual SDK availability
      return process.env.DIGITAL_PERSONA_SDK_ENABLED === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Check if ZKTeco SDK is available
   */
  private static hasZKTecoSDK(): boolean {
    try {
      return process.env.ZKTECO_SDK_ENABLED === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Digital Persona SDK matching (placeholder)
   */
  private static async matchWithDPSDK(
    template1: string, 
    template2: string
  ): Promise<{ match: boolean; confidence: number }> {
    // This would use the actual Digital Persona SDK
    // For now, return enhanced generic matching
    console.log('Using Digital Persona SDK matching (simulated)');
    return this.compareTemplatesAdvanced(template1, template2);
  }

  /**
   * ZKTeco SDK matching (placeholder)
   */
  private static async matchWithZKTecoSDK(
    template1: string, 
    template2: string
  ): Promise<{ match: boolean; confidence: number }> {
    // This would use the actual ZKTeco SDK
    console.log('Using ZKTeco SDK matching (simulated)');
    return this.compareTemplatesAdvanced(template1, template2);
  }

  /**
   * Extract minutiae points from template (simplified simulation)
   */
  private static extractMinutiae(templateBuffer: Buffer): Array<{x: number, y: number, angle: number, type: string}> {
    const minutiae = [];
    
    // Simplified minutiae extraction - in reality this would be much more complex
    for (let i = 0; i < Math.min(templateBuffer.length / 8, 50); i++) {
      const offset = i * 8;
      if (offset + 7 < templateBuffer.length) {
        minutiae.push({
          x: (templateBuffer[offset] << 8) | templateBuffer[offset + 1],
          y: (templateBuffer[offset + 2] << 8) | templateBuffer[offset + 3],
          angle: templateBuffer[offset + 4] * (360 / 255),
          type: templateBuffer[offset + 5] % 2 === 0 ? 'ridge_ending' : 'bifurcation'
        });
      }
    }
    
    return minutiae;
  }

  /**
   * Match minutiae points between two sets
   */
  private static matchMinutiae(
    minutiae1: Array<{x: number, y: number, angle: number, type: string}>,
    minutiae2: Array<{x: number, y: number, angle: number, type: string}>
  ): number {
    let matchedCount = 0;
    const tolerance = 10; // pixels
    const angleTolerance = 15; // degrees

    for (const m1 of minutiae1) {
      for (const m2 of minutiae2) {
        const distance = Math.sqrt((m1.x - m2.x) ** 2 + (m1.y - m2.y) ** 2);
        const angleDiff = Math.abs(m1.angle - m2.angle);
        const normalizedAngleDiff = Math.min(angleDiff, 360 - angleDiff);

        if (distance <= tolerance && 
            normalizedAngleDiff <= angleTolerance && 
            m1.type === m2.type) {
          matchedCount++;
          break; // Don't match the same minutia multiple times
        }
      }
    }

    return matchedCount;
  }

  /**
   * Encrypt fingerprint template for secure storage
   */
  static encryptTemplate(template: string, key?: string): string {
    try {
      const encryptionKey = key || process.env.FINGERPRINT_ENCRYPTION_KEY || 'default-key-change-in-production';
      const cipher = crypto.createCipher('aes-256-cbc', encryptionKey);
      let encrypted = cipher.update(template, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      return encrypted;
    } catch (error) {
      console.error('Error encrypting template:', error);
      return template; // Return original if encryption fails
    }
  }

  /**
   * Decrypt fingerprint template
   */
  static decryptTemplate(encryptedTemplate: string, key?: string): string {
    try {
      const encryptionKey = key || process.env.FINGERPRINT_ENCRYPTION_KEY || 'default-key-change-in-production';
      const decipher = crypto.createDecipher('aes-256-cbc', encryptionKey);
      let decrypted = decipher.update(encryptedTemplate, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('Error decrypting template:', error);
      return encryptedTemplate; // Return original if decryption fails
    }
  }
}

export default FingerprintService;

