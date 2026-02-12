/**
 * Phone Utilities
 * Shared utilities for phone number normalization and validation
 */

/**
 * Normalize phone number to +E.164 format
 * @param phone The phone number to normalize
 * @returns Normalized phone number in +E.164 format
 */
export function normalizePhoneToE164(phone: string): string {
    if (!phone) return phone;

    // Remove all non-digit characters except +
    let normalized = phone.replace(/[^\d+]/g, '');

    // If already has +, return as is
    if (normalized.startsWith('+')) {
        return normalized;
    }

    // Add + prefix
    return '+' + normalized;
}

/**
 * Normalize phone number for internal use (remove + prefix)
 * @param phone The phone number to normalize
 * @returns Normalized phone number without + prefix
 */
export function normalizePhoneForInternal(phone: string): string {
    if (!phone) return phone;

    // Remove all non-digit characters
    let normalized = phone.replace(/\D/g, '');

    return normalized;
}

/**
 * Format phone number for display
 * @param phone The phone number to format
 * @returns Formatted phone number
 */
export function formatPhoneNumber(phone: string): string {
    if (!phone) return phone;

    const normalized = normalizePhoneForInternal(phone);

    // Format as: +XX (XXX) XXX-XXXX for typical numbers
    if (normalized.length >= 10) {
        const countryCode = normalized.slice(0, -10);
        const areaCode = normalized.slice(-10, -7);
        const firstPart = normalized.slice(-7, -4);
        const secondPart = normalized.slice(-4);

        if (countryCode) {
            return `+${countryCode} (${areaCode}) ${firstPart}-${secondPart}`;
        } else {
            return `(${areaCode}) ${firstPart}-${secondPart}`;
        }
    }

    return phone;
}

/**
 * Validate if string is a valid phone number
 * @param phone The phone number to validate
 * @returns True if valid phone number
 */
export function isValidPhoneNumber(phone: string): boolean {
    if (!phone) return false;

    const normalized = normalizePhoneForInternal(phone);

    // Must be at least 10 digits (typical minimum for international numbers)
    return normalized.length >= 10 && normalized.length <= 15;
}
