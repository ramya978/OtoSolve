import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NavigationService } from '../../Shared/services/navigation.service';

/**
 * Where `menuGuard` sends somebody who opened a page their menu does not offer (NEW-03).
 *
 * It replaces the empty shell such a page used to render, with its row of 403 and 409 errors,
 * by one plain sentence and a way back to the person's own starting page.
 */
@Component({
  selector: 'app-forbidden',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="card" role="alert">
      <div class="card-head">
        <div>
          <h2>You do not have access to this page</h2>
          @if (page) { <p>{{ page }}</p> }
        </div>
      </div>
      <div class="card-body">
        <p class="muted">Your role does not include this page. If you need it, ask for access on the Access requests page or speak to your organisation's administrator.</p>
        <p><a class="btn" [routerLink]="landing()">Go to my start page</a></p>
      </div>
    </section>
  `
})
export class Forbidden {
  protected readonly page = inject(ActivatedRoute).snapshot.queryParamMap.get('page');
  protected readonly landing = inject(NavigationService).landingRoute;
}
