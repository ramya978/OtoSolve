import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LC_ICONS, LC_PATHS } from './lc-shared';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';

/** Lead capture shell: page heading + Single / Bulk switch (child routes) + router outlet. */
@Component({
  selector: 'app-lead-capture',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, PageHeader],
  templateUrl: './lead-capture.html',
  styleUrls: ['./lead-capture.css', '../../../Shared/layout/page-header/page-header.css'],
})
export class LeadCapture {
  protected readonly paths = LC_PATHS;
  protected readonly modes = [
    { path: LC_PATHS.single, label: 'Single lead', hint: 'Type in one person', icon: 'user' },
    { path: LC_PATHS.bulk, label: 'Bulk upload', hint: 'CSV or XLSX, many rows', icon: 'file' },
  ];

  icon(n: string): string { return LC_ICONS[n] ?? ''; }
}