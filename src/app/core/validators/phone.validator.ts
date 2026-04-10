import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Validates phone after stripping spaces, dashes, and parentheses.
 * Allows 9–15 digits (Israeli mobiles, landlines, and common international lengths).
 */
export function contactPhoneValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = String(control.value ?? '').trim();
    if (!raw) {
      return null;
    }
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      return { phone: true };
    }
    if (!/[1-9]/.test(digits)) {
      return { phone: true };
    }
    return null;
  };
}
