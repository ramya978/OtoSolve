import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiResponse, OutcomeResponse } from '../Shared/models/api-response.model';
import { LoginIdentifierChangeResponse } from '../Shared/models/iam-contract.model';


@Injectable({ providedIn: 'root' })
export class LoginIdentifierChangeApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/users`;

  /** Every request raised against one person, newest first. */
  getForUser(userId: string): Observable<LoginIdentifierChangeResponse[]> {
    return this.http
      .get<ApiResponse<LoginIdentifierChangeResponse[]>>(
        `${this.baseUrl}/${userId}/login-identifier-change`)
      .pipe(map((response) => response.data ?? []));
  }

  /**
   * Raises the request.
   *
   * `isEmailChange` picks which identifier is being changed — the API takes one at a time,
   * because an e-mail change and a username change are verified differently and approved
   * separately, and bundling them would make a single approval cover two decisions.
   */
  request(
    userId: string,
    isEmailChange: boolean,
    requestedValue: string,
    reason: string,
  ): Observable<OutcomeResponse> {
    return this.http
      .post<ApiResponse<OutcomeResponse>>(
        `${this.baseUrl}/${userId}/login-identifier-change`,
        { isEmailChange, requestedValue, reason })
      .pipe(map((response) => response.data!));
  }

  /**
   * Proves the current owner asked for it.
   *
   * The code goes to the identifier ALREADY ON FILE, never the new one. Sending it to the new
   * address would only prove that whoever typed it can read it, which is exactly what an
   * attacker changing an address to their own can also do.
   */
  verify(requestId: string, code: string): Observable<OutcomeResponse> {
    return this.http
      .post<ApiResponse<OutcomeResponse>>(
        `${this.baseUrl}/login-identifier-change/verify`, { requestId, code })
      .pipe(map((response) => response.data!));
  }

  /** A second person approving or turning it down. */
  decide(requestId: string, approved: boolean, reason: string): Observable<OutcomeResponse> {
    return this.http
      .post<ApiResponse<OutcomeResponse>>(
        `${this.baseUrl}/login-identifier-change/decide`, { requestId, approved, reason })
      .pipe(map((response) => response.data!));
  }

  /**
   * The moment the account actually changes.
   *
   * Every session ends here. The old identifier stops working, and a live session still holding
   * it would be an authenticated connection nobody could account for afterwards.
   */
  apply(requestId: string): Observable<OutcomeResponse> {
    return this.http
      .post<ApiResponse<OutcomeResponse>>(
        `${this.baseUrl}/login-identifier-change/${requestId}/apply`, {})
      .pipe(map((response) => response.data!));
  }

  cancel(requestId: string, reason: string): Observable<OutcomeResponse> {
    return this.http
      .post<ApiResponse<OutcomeResponse>>(
        `${this.baseUrl}/login-identifier-change/${requestId}/cancel`, { reason })
      .pipe(map((response) => response.data!));
  }
}
