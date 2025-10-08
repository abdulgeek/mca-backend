import crypto from 'crypto';
import { FingerprintVerificationRequest } from '../types';

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
}

export default FingerprintService;

