import { Component, input } from '@angular/core';

/**
 * Reusable loading spinner shown while data is being fetched.
 *
 * Usage:
 *   <app-loader [size]="'md'" [message]="'Loading...'" />
 *
 * Inputs:
 *   size      - 'sm' | 'md' | 'lg' (default 'md')
 *   message   - optional text shown under the spinner
 *   fullPage  - when true, covers the whole page with a backdrop
 */
@Component({
  selector: 'app-loader',
  standalone: true,
  imports: [],
  templateUrl: './loader.html',
  styleUrl: './loader.css',
  host: { class: 'ld-root' }
})
export class Loader {
  /** Spinner size: small / medium / large. */
  readonly size = input<'sm' | 'md' | 'lg'>('md');

  /** Optional message shown under the spinner. */
  readonly message = input<string>('');

  /** When true, shows a full-page backdrop overlay. */
  readonly fullPage = input<boolean>(false);
}
