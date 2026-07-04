import { AbstractControl } from '@angular/forms';

export function syncPasswordMismatch(
  password: AbstractControl,
  confirmPassword: AbstractControl,
): void {
  const sync = () => {
    if (confirmPassword.value && confirmPassword.value !== password.value) {
      confirmPassword.setErrors({
        ...confirmPassword.errors,
        passwordMismatch: true,
      });
    } else if (confirmPassword.hasError('passwordMismatch')) {
      const { passwordMismatch, ...rest } = confirmPassword.errors ?? {};
      confirmPassword.setErrors(Object.keys(rest).length ? rest : null);
    }
  };
  password.valueChanges.subscribe(sync);
  confirmPassword.valueChanges.subscribe(sync);
}
