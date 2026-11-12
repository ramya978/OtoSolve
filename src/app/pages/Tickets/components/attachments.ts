import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { TicketAttachment, attachmentProblem, ALLOWED_ATTACHMENT_EXTENSIONS } from '../models/attachment.model';
import { TicketService } from '../services/ticket.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { errorMessage } from '../data/ticket-api';
import { TkIcon } from './icon';
import { EmptyState } from './feedback';
import { fileSize, relativeTime } from '../utils/format';

/** Files on a ticket, with drag-and-drop upload (25 MB per file, common document and image types). */
@Component({
  selector: 'app-attachments',
  standalone: true,
  imports: [TkIcon, EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (canUpload()) {
      <label class="tk-drop" [class.is-over]="over()" (dragover)="$event.preventDefault(); over.set(true)" (dragleave)="over.set(false)" (drop)="onDrop($event)">
        <tk-icon name="upload" />
        <span><strong>Drop files here</strong> or <span style="color:var(--primary-color);font-weight:700">browse</span></span>
        <span class="tk-faint tk-small">Up to 25 MB each · {{ types }}</span>
        <input type="file" multiple hidden (change)="onPick($event)" />
      </label>
      @if (busy()) { <div class="tk-progress" style="margin-top:10px" data-tone="primary" [style.--pct]="'70%'"><i></i></div> }
      @if (error()) { <p class="tk-error" role="alert" style="margin-top:8px">{{ error() }}</p> }
    }
    @if (files().length) {
      <div class="tk-files-grid" style="margin-top:14px">
        @for (f of files(); track f.id) {
          <div class="tk-file" [attr.data-tone]="tone(f.name)">
            <span class="ext">{{ ext(f.name) }}</span>
            <div class="info"><strong [title]="f.name">{{ f.name }}</strong><small>{{ size(f.size) }} · {{ f.uploadedBy }} · {{ ago(f.uploadedAt) }}</small></div>
            @if (f.url) {
              <a class="tk-btn is-ghost is-icon is-sm" [href]="f.url" [attr.download]="f.name" [attr.aria-label]="'Download ' + f.name"><tk-icon name="download" /></a>
            } @else {
              <span class="tk-faint" title="Demo data: the file itself isn't stored"><tk-icon name="eye-off" /></span>
            }
          </div>
        }
      </div>
    } @else if (!canUpload()) {
      <app-empty-state icon="paperclip" tone="neutral" [compact]="true" heading="No attachments" />
    }`,
})
export class Attachments {
  private readonly tickets = inject(TicketService);
  private readonly toast = inject(ToastService);
  readonly ticketId = input.required<string>();
  readonly files = input.required<readonly TicketAttachment[]>();
  readonly canUpload = input(true);
  readonly uploaded = output<void>();

  protected readonly over = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly types = ALLOWED_ATTACHMENT_EXTENSIONS.slice(0, 8).join(', ') + '…';

  protected ext(name: string): string { return (name.split('.').pop() ?? '').slice(0, 4); }
  protected tone(name: string): string {
    const e = this.ext(name).toLowerCase();
    return ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(e) ? 'violet' : e === 'pdf' ? 'danger' : ['csv', 'xls', 'xlsx'].includes(e) ? 'success' : 'info';
  }
  protected size(b: number): string { return fileSize(b); }
  protected ago(iso: string): string { return relativeTime(iso); }

  protected onDrop(e: DragEvent): void {
    e.preventDefault();
    this.over.set(false);
    this.upload(Array.from(e.dataTransfer?.files ?? []));
  }

  protected onPick(e: Event): void {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.upload(files);
  }

  private upload(files: File[]): void {
    if (!files.length) return;
    const problems = files.map((f) => attachmentProblem(f)).filter(Boolean);
    if (problems.length) { this.error.set(problems.join(' ')); return; }
    this.error.set('');
    this.busy.set(true);
    this.tickets.upload(this.ticketId(), files).subscribe({
      next: (added) => {
        this.busy.set(false);
        this.toast.show('Files attached', `${added.length} file${added.length === 1 ? '' : 's'} added`, 'success', 2500);
        this.uploaded.emit();
      },
      error: (err) => { this.busy.set(false); this.error.set(errorMessage(err)); },
    });
  }
}
