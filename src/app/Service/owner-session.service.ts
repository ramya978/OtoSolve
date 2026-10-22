import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class OwnerSessionService {
  readonly currentOrganisationId = signal('ORG-000005');
  readonly currentOwnerName = signal('Ravi Menon');
}
