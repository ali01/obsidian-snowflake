/**
 * Nano ID generation module
 * Provides cryptographically secure random ID generation
 */

import { ID_CONFIG } from './constants';

/**
 * Generate a cryptographically secure random ID
 *
 * @param size - Length of ID (default: 10 characters)
 * @returns Generated ID like "x8K2n5pQ7A"
 */
export function generateNanoID(size: number = ID_CONFIG.length): string {
  let id = '';

  // crypto.getRandomValues provides cryptographically strong random values
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);

  // Convert each random byte to a character
  for (let i = 0; i < size; i++) {
    // Modulo operation maps byte value (0-255) to alphabet index (0-61)
    id += ID_CONFIG.alphabet[bytes[i] % ID_CONFIG.alphabet.length];
  }

  return id;
}
