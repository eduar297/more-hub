import * as Crypto from "expo-crypto";

/**
 * Calculates the EAN-13 check digit from the first 12 digits.
 * Uses alternating weights 1 and 3.
 */
function calcCheckDigit(digits: number[]): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Generates a unique valid EAN-13 barcode using cryptographically
 * random bytes from expo-crypto, so each call yields a different code.
 */
export function generateEAN13(): string {
  // Get 12 random bytes (one per digit) and map each to 0-9.
  const randomBytes = Crypto.getRandomBytes(12);
  const digits = Array.from(randomBytes).map((b) => b % 10);
  const check = calcCheckDigit(digits);
  return [...digits, check].join("");
}

/**
 * Validates whether a 13-character string is a valid EAN-13 barcode.
 */
export function validateEAN13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  return calcCheckDigit(digits.slice(0, 12)) === digits[12];
}
