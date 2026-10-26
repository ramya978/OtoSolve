import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Reusable page header used on every workspace page.
 *
 * Renders the standard top heading block:
 *   • breadcrumb (eyebrow) — plain text or a clickable router link
 *   • main heading (h1)
 *   • description (p)
 *   • optional action buttons projected via <ng-container actions>
 *
 * Usage:
 *   <app-page-header [breadcrumb]="'Users &amp; Access / People'" [breadcrumbRoute]="'/app/users'" heading="Everyone who can sign in"
 *                     description="People in this organisation with their role, unit and access — as cards or a compact list.">
 *     <ng-container actions>
 *       <button ...>Invite person</button>
 *     </ng-container>
 *   </app-page-header>
 */
@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './page-header.html',
  styleUrl: './page-header.css',
  host: { class: 'ph-root' }
})
export class PageHeader {
  /** Breadcrumb label shown as the eyebrow (plain text). */
  readonly breadcrumb = input<string>('');
  /** Optional router link for the breadcrumb. When set, the breadcrumb becomes a clickable link. */
  readonly breadcrumbRoute = input<string>('');
  /** Main page heading (h1). */
  readonly heading = input<string>('');
  /** Description shown under the heading. */
  readonly description = input<string>('');

  /** True when a breadcrumb route is provided. */
  readonly hasBreadcrumbRoute = computed(() => !!this.breadcrumbRoute());
}
