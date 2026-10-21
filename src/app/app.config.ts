import { ApplicationConfig, Injectable, provideBrowserGlobalErrorListeners, inject } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy, provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './Shared/interceptors/auth.interceptor';
import {  withInterceptors } from '@angular/common/http';

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
    provideRouter(routes),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
};
