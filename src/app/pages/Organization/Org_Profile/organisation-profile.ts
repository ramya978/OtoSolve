import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IAM_ICONS } from '../../../Shared/IAM/iam-icons';
import { ORG, REGISTRATION, CONTACT, ADDRESS, ABOUT, DOCUMENTS, WEB_ADDRESSES, HISTORY } from '../../../Shared/Organization/organisation-profile.data';

type TabKey = 'profile' | 'documents' | 'review' | 'web' | 'history';

interface TabDef { key: TabKey; label: string; }

interface Check {
  no: string;
  title: string;
  detail: string;
  state: 'ok' | 'warn';
  /** tab where the user can fix it */
  tab?: TabKey;
  /** button label shown when the check is not ready */
  action?: string;
}

/** icons this page needs that may not exist in IAM_ICONS (24x24, drawn with currentColor); IAM_ICONS is the fallback */
const ICONS: Record<string, string> = {
  docAlert: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M12 11v4 M12 17.5h.01',
  send: 'M22 2 11 13 M22 2l-7 20-4-9-9-4z',
  edit: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  verified: 'M22 11.1V12a10 10 0 1 1-5.9-9.1 M22 4 12 14l-3-3',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z',
  check: 'M20 6 9 17l-5-5',
  plus: 'M12 5v14 M5 12h14',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  star: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z'
};

/** Organisation — Workspace Kit layout: heading, summary strip, and one card with tabs
 *  (Profile, Documents, Review & submit, Web addresses, History). */
@Component({
  selector: 'app-iam-organisation',
  templateUrl: './organisation-profile.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './organisation-profile.css']
})
export class OrganisationProfile {
  private readonly router = inject(Router);

  readonly org = ORG;
  readonly registration = REGISTRATION;
  readonly contact = CONTACT;
  readonly address = ADDRESS;
  readonly about = ABOUT;
  readonly documents = DOCUMENTS;
  readonly webAddresses = WEB_ADDRESSES;
  readonly history = HISTORY;

  readonly tabs: TabDef[] = [
    { key: 'profile', label: 'Profile' },
    { key: 'documents', label: 'Documents' },
    { key: 'review', label: 'Review & submit' },
    { key: 'web', label: 'Web addresses' },
    { key: 'history', label: 'History' }
  ];

  readonly tab = signal<TabKey>('profile');

  /** reviewer note (max 500) */
  readonly maxNote = 500;
  readonly note = signal('');
  readonly sent = signal(false);

  readonly status = signal(ORG.status);
  readonly statusLabel = computed(() => (this.sent() ? 'Submitted' : ORG.statusLabel));
  readonly statusTone = computed(() => {
    if (this.sent()) return 'warning';
    const s = this.status();
    return s === 'active' ? 'success' : s === 'submitted' ? 'warning' : s === 'rejected' ? 'danger' : 'muted';
  });

  /** only a draft or a rejected organisation can be sent for approval */
  readonly canSend = computed(() => !this.sent() && (this.status() === 'draft' || this.status() === 'rejected'));

  readonly verifiedAddresses = this.webAddresses.filter((w) => !!w.verifiedOn).length;

  readonly checks = computed<Check[]>(() => [
    { no: '01', title: 'Profile details', detail: 'All required fields are filled', state: 'ok' },
    this.documents.length
      ? { no: '02', title: 'Supporting documents', detail: this.documents.length + ' uploaded', state: 'ok' }
      : { no: '02', title: 'Supporting documents', detail: 'None uploaded yet', state: 'warn', tab: 'documents', action: 'View documents' },
    this.webAddresses.length
      ? { no: '03', title: 'Web address', detail: this.webAddresses[0].address, state: 'ok' }
      : { no: '03', title: 'Web address', detail: 'Not added yet', state: 'warn', tab: 'web', action: 'Add address' }
  ]);

  /** readiness: every check counts (current status is shown separately) */
  readonly readyTotal = computed(() => this.checks().length);
  readonly readyDone = computed(() => this.checks().filter((c) => c.state === 'ok').length);
  readonly readyPct = computed(() => Math.round((this.readyDone() / this.readyTotal()) * 100));

  icon(name: string): string {
    return ICONS[name] ?? IAM_ICONS[name] ?? '';
  }

  /** small number shown next to a tab */
  tabCount(key: TabKey): number | null {
    switch (key) {
      case 'documents': return this.documents.length;
      case 'web': return this.webAddresses.length;
      case 'history': return this.history.length;
      default: return null;
    }
  }

  select(key: TabKey): void {
    this.tab.set(key);
  }

  setNote(value: string): void {
    this.note.set(value.slice(0, this.maxNote));
  }

  send(): void {
    if (!this.canSend()) return;
    this.sent.set(true);
  }

  /** open the edit page */
  edit(): void {
    this.router.navigateByUrl('/app/administration/organisation/details/edit');
  }
}