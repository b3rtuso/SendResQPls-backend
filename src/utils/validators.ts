import validator from 'validator';

export interface MobileValidationResult {
  valid: boolean;
  error?: string;
  cleaned?: string;
}

/**
 * Validates Philippine Mobile Number.
 * Strict rules:
 * - Mandatory (cannot be empty)
 * - Exactly 11 digits starting with '09' (e.g., 09292695926)
 * - Explicit error for incomplete (< 11, kulang)
 * - Explicit error for exceeding (> 11, sobra)
 * - Explicit error if not starting with 09 or containing +63
 */
export const validatePhilippineMobile = (phone: string | undefined | null): MobileValidationResult => {
  if (!phone || !phone.trim()) {
    return { valid: false, error: 'Mobile number is required and cannot be empty.' };
  }

  const raw = phone.trim();

  // Explicitly reject +63 prefix
  if (raw.startsWith('+63') || raw.startsWith('+')) {
    return {
      valid: false,
      error: 'Please remove +63. Enter an 11-digit mobile number starting with 09 (e.g. 09292695926).'
    };
  }

  // Reject non-numeric characters
  if (!/^\d+$/.test(raw)) {
    return {
      valid: false,
      error: 'Mobile number must contain digits only (no spaces, dashes, or special characters).'
    };
  }

  if (raw.length < 11) {
    return {
      valid: false,
      error: `Mobile number is incomplete (kulang) with ${raw.length} digits. It must be exactly 11 digits starting with 09 (e.g. 09292695926).`
    };
  }

  if (raw.length > 11) {
    return {
      valid: false,
      error: `Mobile number exceeds 11 digits (${raw.length} digits entered). It must be exactly 11 digits starting with 09 (e.g. 09292695926).`
    };
  }

  if (!raw.startsWith('09')) {
    return {
      valid: false,
      error: 'Mobile number must start with 09 (e.g. 09292695926).'
    };
  }

  return { valid: true, cleaned: raw };
};

export const validateUserContact = (email: string, phone: string) => {
  const isEmailValid = validator.isEmail(email);
  const phoneValidation = validatePhilippineMobile(phone);

  return { isEmailValid, isPhoneValid: phoneValidation.valid, phoneError: phoneValidation.error };
};