import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthApiService } from '../../../Service/auth-api.service';

@Component({
  selector: 'app-signin',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './signin.html',
  styleUrl: './signin.css'
})
export class Signin {
  private readonly authApi = inject(AuthApiService);
  private readonly router = inject(Router);

  identifier = '';
  password = '';
  showPassword = false;
    rememberDevice = false;
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  onSignIn(): void {
    this.errorMessage.set('');

    if (!this.identifier.trim() || !this.password) {
      this.errorMessage.set('Enter your username/email and password.');
      return;
    }

    this.loading.set(true);

    this.authApi.signIn({
      identifier: this.identifier.trim(),
      password: this.password,
      clientType: 'web',
      rememberMe: this.rememberDevice,
    }).subscribe({
      next: (response) => {
        this.loading.set(false);
        this.password = '';

        if (response.status === 'succeeded') {
          void this.router.navigateByUrl('/dashboard');
        } else if (response.status === 'mfaRequired') {
          this.errorMessage.set('Additional verification is required.');
        } else if (response.status === 'tenantSelectionRequired') {
          this.errorMessage.set('Organisation selection is required.');
        } else if (response.status === 'passwordChangeRequired') {
          this.errorMessage.set('You must change your password before continuing.');
        } else {
          this.errorMessage.set(response.message || 'Unable to sign in.');
        }
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.password = '';

        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? error.error?.message || 'Sign-in failed. Check your credentials.'
            : 'An unexpected error occurred.'
        );
      }
    });
  }
}