import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../Shared/Auth/auth.service';

interface FieldErrors {
  identifier?: string;
  password?: string;
}

type ToastTone = 'ok' | 'danger';

interface Toast {
  text: string;
  tone: ToastTone;
}

@Component({
  selector: 'app-login',
  templateUrl:'./login.html',
  styleUrl: './login.css'
})
export class Login implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly identifier = signal('');
  protected readonly password = signal('');
  protected readonly showPassword = signal(false);
  protected readonly remember = signal(false);
  protected readonly busy = signal(false);
  protected readonly fieldErrors = signal<FieldErrors>({});

  /** Transient message shown as a toast (errors + the sign-in confirmation). */
  protected readonly toast = signal<Toast | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;


  constructor() {}

  protected readonly canSubmit = computed(
    () => this.identifier().trim().length > 0 && this.password().length > 0 && !this.busy()
  );

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;

    const identifier = this.identifier().trim();
    const errors: FieldErrors = {};
    if (identifier.length < 2) errors.identifier = 'Enter your user name or e-mail.';
    if (!this.password()) errors.password = 'Enter your password.';
    this.fieldErrors.set(errors);
    if (errors.identifier || errors.password) {
      this.showToast(errors.identifier ?? errors.password!, 'danger');
      return;
    }

    this.busy.set(true);
    try {
      const user = await this.auth.signIn(identifier, this.password(), this.remember());
      this.showToast(`Welcome back, ${user.name}.`, 'ok');
      void this.router.navigateByUrl('/app/dashboard', { replaceUrl: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
      this.showToast(message, 'danger');
      this.password.set('');
    } finally {
      this.busy.set(false);
    }
  }

  /** Shows a toast for a few seconds, replacing any message already on screen. */
  private showToast(text: string, tone: ToastTone): void {
    this.toast.set({ text, tone });
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), tone === 'danger' ? 6000 : 3200);
  }

  /** Closes the toast on demand with slide-out animation. */
  protected dismissToast(): void {
    clearTimeout(this.toastTimer);
    this.toast.set(null);
  }

  /** Clears the toast timer when the page goes away. */
  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

}