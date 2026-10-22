import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiResponse, OutcomeResponse } from '../Shared/models/api-response.model';
import {
  AcceptInvitationRequest,
  AcceptInvitationResponse,
  AccountRecoveryGuidanceResponse,
  AuthenticatedUserResponse,
  BeginInvitationMfaEnrolmentRequest,
  ChangePasswordRequest,
  ContactSupportRequest,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  InvitationPreviewResponse,
  MfaChallengeResponse,
  MfaEnrolmentResponse,
  NavigationResponse,
  PasswordOperationResponse,
  PasswordPolicyResponse,
  ReauthenticateRequest,
  ReauthenticateResponse,
  ReauthenticationViewResponse,
  RedeemRecoveryCodeRequest,
  ResetPasswordRequest,
  ResetPasswordViewResponse,
  SaveProtectedDraftRequest,
  SaveProtectedDraftResponse,
  SelectTenantResponse,
  SessionStatusResponse,
  SignInRequest,
  SignInResponse,
  TenantOptionResponse,
  TenantResolutionResponse,
  VerifyInvitationMfaEnrolmentRequest,
  VerifyMfaRequest,
} from '../Shared/models/auth.model';
import { AuthTokenService } from '../Shared/services/auth-token.service';
import { DeviceIdentityService } from '../Shared/services/device-identity.service';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(AuthTokenService);
  private readonly device = inject(DeviceIdentityService);

  private readonly usersUrl = `${environment.apiBaseUrl}/users`;
  private readonly authUrl = `${environment.apiBaseUrl}/auth`;

  // =========================================================================================
  // IAM-AUTH-01 — sign in
  // =========================================================================================


  signIn(payload: SignInRequest): Observable<SignInResponse> {
    const request: SignInRequest = {
      ...payload,
      deviceIdentifier: payload.deviceIdentifier ?? this.device.getDeviceIdentifier(),
      deviceName: payload.deviceName ?? this.device.getDeviceName(),
    };

    return this.http
      .post<ApiResponse<SignInResponse>>(`${this.usersUrl}/sign-in`, request)
      .pipe(
        map((response) => response.data!),
        tap((result) => this.tokens.storeSignIn(result)),
      );
  }

  /** Ends this session, or every session. Clears the refresh cookie server-side. */
  signOut(allDevices = false): Observable<OutcomeResponse> {
    return this.http
      .post<ApiResponse<OutcomeResponse>>(`${this.usersUrl}/sign-out`, { allDevices })
      .pipe(
        map((response) => response.data!),
        tap(() => this.tokens.clear()),
      );
  }


  refreshToken(): Observable<SignInResponse> {
    return this.http
      .post<ApiResponse<SignInResponse>>(`${this.usersUrl}/tokens/refresh`, {})
      .pipe(
        map((response) => response.data!),
        tap((result) => this.tokens.storeSignIn(result)),
      );
  }

  /** The live session: idle countdown, absolute expiry, whether a step-up is due. */
  getSession(): Observable<SessionStatusResponse> {
    return this.http
      .get<ApiResponse<SessionStatusResponse>>(`${this.usersUrl}/session`)
      .pipe(map((response) => response.data!));
  }

  /** Who the caller is, plus the Organisation the session is operating in. */
  getCurrentUser(): Observable<SessionStatusResponse> {
    return this.http
      .get<ApiResponse<SessionStatusResponse>>(`${this.authUrl}/me`)
      .pipe(
        map((response) => response.data!),
        tap((state) => {
          if (state.user) {
            this.tokens.storeUser(state.user as AuthenticatedUserResponse);
          }
          if (state.tenant) {
            this.tokens.storeTenant(state.tenant);
          }
        }),
      );
  }

  /** The password rules to show beside a password box, straight from the server's policy. */
  getPasswordPolicy(): Observable<PasswordPolicyResponse> {
    return this.http
      .get<ApiResponse<PasswordPolicyResponse>>(`${this.usersUrl}/password-policy`)
      .pipe(map((response) => response.data!));
  }


  resolveTenant(hostName?: string): Observable<TenantResolutionResponse> {
    const params = hostName ? new HttpParams().set('hostName', hostName) : undefined;

    return this.http
      .get<ApiResponse<TenantResolutionResponse>>(`${this.authUrl}/resolve-tenant`, { params })
      .pipe(map((response) => response.data!));
  }

  // =========================================================================================
  // Organisation selection — the SuperAdmin switcher
  // =========================================================================================

  /** The Organisations a global caller may step into. */
  getSelectableOrganisations(): Observable<TenantOptionResponse[]> {
    return this.http
      .get<ApiResponse<TenantOptionResponse[]>>(`${this.authUrl}/selectable-tenants`)
      .pipe(map((response) => response.data ?? []));
  }


  selectOrganisation(tenantId: string): Observable<SelectTenantResponse> {
    return this.http
      .post<ApiResponse<SelectTenantResponse>>(`${this.authUrl}/select-tenant`, { tenantId })
      .pipe(
        map((response) => response.data!),
        tap((result) => this.tokens.storeTenantSelection(result)),
      );
  }


  exitOrganisation(): Observable<SelectTenantResponse> {
    return this.http
      .post<ApiResponse<SelectTenantResponse>>(`${this.authUrl}/exit-tenant`, {})
      .pipe(
        map((response) => response.data!),
        tap((result) => this.tokens.storeTenantSelection(result)),
      );
  }

  /** The navigation tree for the caller, already filtered by the server. */
  getNavigation(): Observable<NavigationResponse> {
    return this.http
      .get<ApiResponse<NavigationResponse>>(`${environment.apiBaseUrl}/navigation`)
      .pipe(map((response) => response.data!));
  }

  // =========================================================================================
  // IAM-AUTH-02 — invitation and activation
  // =========================================================================================


  previewInvitation(token: string): Observable<InvitationPreviewResponse> {
    return this.http
      .get<ApiResponse<InvitationPreviewResponse>>(
        `${this.usersUrl}/accept-invitation-and-activate-account`,
        { params: new HttpParams().set('token', token) })
      .pipe(map((response) => response.data!));
  }


  beginInvitationMfaEnrolment(payload: BeginInvitationMfaEnrolmentRequest):
    Observable<MfaEnrolmentResponse> {
    return this.http
      .post<ApiResponse<MfaEnrolmentResponse>>(
        `${this.usersUrl}/accept-invitation-and-activate-account/begin-mfa-enrolment`, payload)
      .pipe(map((response) => response.data!));
  }

  /** Confirms the factor enrolled during activation, before the account is activated. */
  verifyInvitationMfaMethod(payload: VerifyInvitationMfaEnrolmentRequest):
    Observable<OutcomeResponse> {
    return this.http
      .post<ApiResponse<OutcomeResponse>>(
        `${this.usersUrl}/accept-invitation-and-activate-account/verify-mfa-method`, payload)
      .pipe(map((response) => response.data!));
  }

  /** Asks for a replacement invitation. The current link stops working immediately. */
  requestNewInvitation(token: string): Observable<OutcomeResponse> {
    return this.http
      .post<ApiResponse<OutcomeResponse>>(
        `${this.usersUrl}/accept-invitation-and-activate-account/request-new-invitation`, { token })
      .pipe(map((response) => response.data!));
  }


  cancelActivation(token: string, reason?: string): Observable<OutcomeResponse> {
    return this.http
      .post<ApiResponse<OutcomeResponse>>(
        `${this.usersUrl}/accept-invitation-and-activate-account/cancel`, { token, reason })
      .pipe(map((response) => response.data!));
  }

  /** Activates the account and signs the person straight in. */
  acceptInvitation(payload: AcceptInvitationRequest): Observable<AcceptInvitationResponse> {
    const request: AcceptInvitationRequest = {
      ...payload,
      deviceIdentifier: payload.deviceIdentifier ?? this.device.getDeviceIdentifier(),
    };

    return this.http
      .post<ApiResponse<AcceptInvitationResponse>>(
        `${this.usersUrl}/accept-invitation-and-activate-account`, request)
      .pipe(
        map((response) => response.data!),
        tap((result) => {
          if (result.accessToken) {
            this.tokens.storeAccessToken(
              result.accessToken,
              result.accessTokenExpiresAtUtc ?? null,
              result.sessionId ?? null);
          }
          if (result.user) {
            this.tokens.storeUser(result.user as AuthenticatedUserResponse);
          }
          if (result.tenant) {
            this.tokens.storeTenant(result.tenant);
          }
        }),
      );
  }

  // =========================================================================================
  // IAM-AUTH-03 / 04 — password recovery
  // =========================================================================================


  forgotPassword(payload: ForgotPasswordRequest): Observable<ForgotPasswordResponse> {
    return this.http
      .post<ApiResponse<ForgotPasswordResponse>>(`${this.usersUrl}/forgot-password`, payload)
      .pipe(map((response) => response.data!));
  }


  getResetPasswordView(token: string): Observable<ResetPasswordViewResponse> {
    return this.http
      .get<ApiResponse<ResetPasswordViewResponse>>(`${this.usersUrl}/reset-password`, {
        params: new HttpParams().set('token', token),
      })
      .pipe(map((response) => response.data!));
  }

  /** Asks for a fresh recovery link when the current one has lapsed. */
  requestNewRecoveryLink(identifier: string): Observable<ForgotPasswordResponse> {
    return this.http
      .post<ApiResponse<ForgotPasswordResponse>>(
        `${this.usersUrl}/reset-password/request-new-link`, { identifier })
      .pipe(map((response) => response.data!));
  }

  /** Sets a new password from a recovery link. Every existing session is signed out. */
  resetPassword(payload: ResetPasswordRequest): Observable<PasswordOperationResponse> {
    return this.http
      .post<ApiResponse<PasswordOperationResponse>>(`${this.usersUrl}/reset-password`, payload)
      .pipe(map((response) => response.data!));
  }

  /** Changes the password of somebody already signed in. Requires the current one. */
  changePassword(payload: ChangePasswordRequest): Observable<PasswordOperationResponse> {
    return this.http
      .post<ApiResponse<PasswordOperationResponse>>(`${this.usersUrl}/change-password`, payload)
      .pipe(map((response) => response.data!));
  }

  /** Confirms an e-mail address from the link sent to it. */
  confirmEmail(token: string): Observable<PasswordOperationResponse> {
    return this.http
      .post<ApiResponse<PasswordOperationResponse>>(`${this.usersUrl}/confirm-email`, { token })
      .pipe(map((response) => response.data!));
  }

  // =========================================================================================
  // IAM-AUTH-05 — MFA challenge
  // =========================================================================================

  /** Verifies the second factor and finishes signing in. */
  verifyMfa(payload: VerifyMfaRequest): Observable<SignInResponse> {
    const request: VerifyMfaRequest = {
      ...payload,
      deviceIdentifier: payload.deviceIdentifier ?? this.device.getDeviceIdentifier(),
      deviceName: payload.deviceName ?? this.device.getDeviceName(),
    };

    return this.http
      .post<ApiResponse<SignInResponse>>(`${this.usersUrl}/mfa-challenge/verify`, request)
      .pipe(
        map((response) => response.data!),
        tap((result) => this.tokens.storeSignIn(result)),
      );
  }

  /**
   * Sends the code again.
   *
   * Only meaningful for e-mail and text methods — an authenticator application generates codes
   * on the device and there is nothing to resend. `methodSendsCode()` in the auth model is what
   * the screen uses to decide whether to offer the button at all.
   */
  resendMfaChallenge(challengeToken: string): Observable<MfaChallengeResponse> {
    return this.http
      .post<ApiResponse<MfaChallengeResponse>>(
        `${this.usersUrl}/mfa-challenge/resend`, { challengeToken })
      .pipe(map((response) => response.data!));
  }


  switchMfaMethod(challengeToken: string, mfaMethodId: string): Observable<MfaChallengeResponse> {
    return this.http
      .post<ApiResponse<MfaChallengeResponse>>(
        `${this.usersUrl}/mfa-challenge/resend`, { challengeToken, mfaMethodId })
      .pipe(map((response) => response.data!));
  }


  cancelMfaChallenge(challengeToken: string, reason?: string): Observable<OutcomeResponse> {
    return this.http
      .post<ApiResponse<OutcomeResponse>>(
        `${this.usersUrl}/mfa-challenge/cancel`, { challengeToken, reason })
      .pipe(map((response) => response.data!));
  }

  /** Signs in with a one-time recovery code instead of the second factor. */
  redeemRecoveryCode(payload: RedeemRecoveryCodeRequest): Observable<SignInResponse> {
    return this.http
      .post<ApiResponse<SignInResponse>>(`${this.usersUrl}/mfa-challenge/recovery-code`, payload)
      .pipe(
        map((response) => response.data!),
        tap((result) => this.tokens.storeSignIn(result)),
      );
  }

  // =========================================================================================
  // IAM-AUTH-06 — account unavailable
  // =========================================================================================


  getRecoveryGuidance(): Observable<AccountRecoveryGuidanceResponse> {
    return this.http
      .get<ApiResponse<AccountRecoveryGuidanceResponse>>(
        `${this.usersUrl}/account-unavailable-and-recovery-guidance`)
      .pipe(map((response) => response.data!));
  }


  startRecovery(identifier: string): Observable<ForgotPasswordResponse> {
    return this.http
      .post<ApiResponse<ForgotPasswordResponse>>(
        `${this.usersUrl}/account-unavailable-and-recovery-guidance/start-recovery`, { identifier })
      .pipe(map((response) => response.data!));
  }

  /** Sends a message to the service desk from somebody who cannot get in. */
  contactSupport(payload: ContactSupportRequest): Observable<OutcomeResponse> {
    return this.http
      .post<ApiResponse<OutcomeResponse>>(
        `${this.usersUrl}/account-unavailable-and-recovery-guidance/contact-support`, payload)
      .pipe(map((response) => response.data!));
  }

  // =========================================================================================
  // IAM-AUTH-07 — reauthentication
  // =========================================================================================

  /** What the step-up screen shows: why it is asking, and how long is left. */
  getReauthenticationView(protectedActionSummary?: string, draftToken?: string):
    Observable<ReauthenticationViewResponse> {
    let params = new HttpParams();

    if (protectedActionSummary) {
      params = params.set('protectedActionSummary', protectedActionSummary);
    }

    if (draftToken) {
      params = params.set('draftToken', draftToken);
    }

    return this.http
      .get<ApiResponse<ReauthenticationViewResponse>>(
        `${this.usersUrl}/session-timeout-and-reauthentication`, { params })
      .pipe(map((response) => response.data!));
  }


  saveProtectedDraft(payload: SaveProtectedDraftRequest): Observable<SaveProtectedDraftResponse> {
    return this.http
      .post<ApiResponse<SaveProtectedDraftResponse>>(
        `${this.usersUrl}/session-timeout-and-reauthentication/save-draft`, payload)
      .pipe(map((response) => response.data!));
  }

  /** Proves identity again after an idle timeout, or before a sensitive action. */
  reauthenticate(payload: ReauthenticateRequest): Observable<ReauthenticateResponse> {
    return this.http
      .post<ApiResponse<ReauthenticateResponse>>(
        `${this.usersUrl}/session-timeout-and-reauthentication`, payload)
      .pipe(map((response) => response.data!));
  }
}
