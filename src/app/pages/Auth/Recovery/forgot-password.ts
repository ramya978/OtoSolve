import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthApiService } from '../../../Service/auth-api.service';
import { AuthFrame } from './auth-frame';

/**
 * Forgot password. One call (POST /users/forgot-password); the server creates the token, stores
 * only its hash and sends the e-mail. The answer is identical whether or not the account exists,
 * and is shown unchanged, so the form cannot be used to discover who has an account.
 */
@Component({
  selector: 'app-forgot-password',
  imports: [AuthFrame],
  templateUrl: './forgot-password.html',
  styleUrl: '../Login/login.css'
})
export class ForgotPassword {
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApiService);

  protected readonly identifier = signal('');
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly confirmation = signal('');

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.busy()) return;
    this.errorMessage.set('');

    const value = this.identifier().trim();
    if (!value) {
      this.errorMessage.set('Enter the e-mail address or username on the account.');
      return;
    }
    if (value.length > 254) {
      this.errorMessage.set('That is longer than an e-mail address can be. Check it and try again.');
      return;
    }

    this.busy.set(true);
    this.authApi.forgotPassword({ identifier: value }).subscribe({
      next: (outcome) => {
        this.busy.set(false);
        this.submitted.set(true);
        this.confirmation.set(
          outcome.message ?? 'If that account exists, we have sent a password reset link to its e-mail address.'
        );
      },
      error: (error: Error) => {
        this.busy.set(false);
        this.errorMessage.set(error.message);
      }
    });
  }

  protected tryAgain(): void {
    this.submitted.set(false);
    this.confirmation.set('');
    this.errorMessage.set('');
  }

  protected backToSignIn(): void {
    void this.router.navigate(['/login']);
  }
}
