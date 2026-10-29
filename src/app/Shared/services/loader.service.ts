import { Injectable, signal, computed, effect } from '@angular/core';

/**
 * Global loader service with minimum display time and API data completion tracking.
 *
 * Loader shows when:
 *   - loadCount > 0 (data is being fetched)
 *
 * Loader hides only when BOTH:
 *   - 1 minute has elapsed, AND
 *   - API data has been received
 *
 * Usage in components:
 *   this.loaderService.startLoading();          // when data fetch begins
 *   this.loaderService.dataReceived();          // when API data arrives (success or error)
 *
 * Template:
 *   <app-loader [fullPage]="true" *ngIf="loaderService.shouldShow()"></app-loader>
 */
@Injectable({ providedIn: 'root' })
export class LoaderService {
  private readonly loadCount = signal(0);
  private readonly apiDataReceived = signal(false);
  private readonly minTimeElapsed = signal(false);
  private timerId: ReturnType<typeof setTimeout> | null = null;

  /** True when the full-page loader should be visible. */
  readonly shouldShow = computed(() =>
    this.loadCount() > 0 && (!this.minTimeElapsed() || !this.apiDataReceived())
  );

  constructor() {
    // Auto-stop loader when both 1 sec elapsed AND data received
    effect(() => {
      if (this.loadCount() > 0 && this.minTimeElapsed() && this.apiDataReceived()) {
        this.stopLoading();
      }
    });
  }

  /** Call when data fetching starts. */
  startLoading(): void {
    if (this.loadCount() === 0) {
      this.apiDataReceived.set(false);
      this.minTimeElapsed.set(false);
      if (this.timerId) clearTimeout(this.timerId);
      this.timerId = setTimeout(() => this.minTimeElapsed.set(true), 1_000);
    }
    this.loadCount.update((v) => v + 1);
  }

  /** Call when API data has arrived (success or error). */
  dataReceived(): void {
    this.apiDataReceived.set(true);
  }

  /** Call when loading is complete (success or error). */
  stopLoading(): void {
    this.loadCount.update((v) => Math.max(0, v - 1));
    if (this.loadCount() === 0) {
      this.apiDataReceived.set(false);
      this.minTimeElapsed.set(false);
      if (this.timerId) {
        clearTimeout(this.timerId);
        this.timerId = null;
      }
    }
  }
}
