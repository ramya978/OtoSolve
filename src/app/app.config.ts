import { ApplicationConfig, Injectable, provideAppInitializer, provideBrowserGlobalErrorListeners, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './Shared/interceptors/auth.interceptor';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { AuthSessionService } from './Shared/services/auth-session.service';

/**
 * Keeps the browser-tab title fixed to the app name. Every route in this app carries a `title`
 * (menu names / "Profile" ...), which the router would otherwise write into <title> and replace
 * "OtoSolve" with the page name. Ignore those and always show the app name.
 */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(_routerState: RouterStateSnapshot): void {
    this.title.setTitle('OtoSolve');
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),

    // Instantiated at start-up so a page reloaded while signed in picks its idle clock up again
    // at once (otherwise the clock stood still after every reload).
    provideAppInitializer(() => {
      inject(AuthSessionService);
    }),

    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })
    ),
    { provide: TitleStrategy, useClass: AppTitleStrategy },

    // authInterceptor attaches the bearer token, sends the HttpOnly refresh cookie
    // (withCredentials), renews an expired access token once and replays the request, and
    // unwraps the API's error envelope. withFetch handles credentialed calls predictably.
    provideHttpClient(withFetch(), withInterceptors([authInterceptor]))
  ]
};
