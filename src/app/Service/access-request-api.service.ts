import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiResponse, OutcomeResponse, PagedResponse } from '../Shared/models/api-response.model';
import {
  AccessRequestDetailResponse,
  AccessRequestListItemResponse,
  AccessRequestSummaryResponse,
  CreateAccessRequestRequest,
  DecideAccessRequestRequest,
  ReturnAccessRequestRequest,
  RoleLookupResponse,
  SubmitAccessRequestRequest,
  UpdateAccessRequestRequest,
  WithdrawAccessRequestRequest,
} from '../Shared/models/iam-contract.model';

/** What the access-request queue can be narrowed by. Mirrors the API's query parameters. */
export interface AccessRequestSearchFilter {
  search?: string;
  status?: string;
  requestType?: string;
  requestedForUserId?: string;
  awaitingMyDecision?: boolean;
  raisedByMe?: boolean;
  page?: number;
  pageSize?: number;
}

@Injectable({ providedIn: 'root' })
export class AccessRequestApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/governance/access-requests`;

  search(filter: AccessRequestSearchFilter):
    Observable<PagedResponse<AccessRequestListItemResponse>> {
    return this.http
      .get<ApiResponse<PagedResponse<AccessRequestListItemResponse>>>(this.baseUrl, {
        params: this.toParams(filter),
      })
      .pipe(map((response) => response.data!));
  }

  summary(filter: AccessRequestSearchFilter): Observable<AccessRequestSummaryResponse> {
    const { page: _page, pageSize: _pageSize, ...criteria } = filter;

    return this.http
      .get<ApiResponse<AccessRequestSummaryResponse>>(`${this.baseUrl}/summary`, {
        params: this.toParams(criteria),
      })
      .pipe(map((response) => response.data!));
  }

  /**
   * The queue as a CSV file, for the same filter. The server builds and names the file, and
   * records the export in the audit trail under the reference it returns in a header.
   */
  export(filter: AccessRequestSearchFilter): Observable<{ blob: Blob; fileName: string; reference: string }> {
    const { page: _page, pageSize: _pageSize, ...criteria } = filter;

    return this.http
      .get(`${this.baseUrl}/export`, { params: this.toParams(criteria), responseType: 'blob', observe: 'response' })
      .pipe(map((response) => {
        const disposition = response.headers.get('Content-Disposition') ?? '';
        const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);

        return {
          blob: response.body ?? new Blob(),
          fileName: match ? decodeURIComponent(match[1]) : 'access-requests.csv',
          reference: response.headers.get('X-Export-Reference') ?? '',
        };
      }));
  }

  /**
   * The roles a request may ask for. Its own endpoint under the permission to raise a request,
   * because the role catalogue's lookup needs `iam.roles.view` and the people who ask for access
   * - every working staff role - do not hold it.
   */
  requestableRoles(): Observable<RoleLookupResponse[]> {
    return this.http
      .get<ApiResponse<RoleLookupResponse[]>>(`${this.baseUrl}/requestable-roles`)
      .pipe(map((response) => response.data ?? []));
  }

  get(id: string): Observable<AccessRequestDetailResponse> {
    return this.http
      .get<ApiResponse<AccessRequestDetailResponse>>(`${this.baseUrl}/${id}`)
      .pipe(map((response) => response.data!));
  }

  create(request: CreateAccessRequestRequest): Observable<OutcomeResponse> {
    return this.http
      .post<ApiResponse<OutcomeResponse>>(this.baseUrl, request)
      .pipe(map((response) => response.data!));
  }

  /** Edits a draft. Once submitted a request is immutable — reject it and raise another. */
  update(id: string, request: UpdateAccessRequestRequest): Observable<OutcomeResponse> {
    return this.http
      .put<ApiResponse<OutcomeResponse>>(`${this.baseUrl}/${id}`, request)
      .pipe(map((response) => response.data!));
  }

  submit(id: string, request: SubmitAccessRequestRequest): Observable<OutcomeResponse> {
    return this.http
      .post<ApiResponse<OutcomeResponse>>(`${this.baseUrl}/${id}/submit`, request)
      .pipe(map((response) => response.data!));
  }

  decide(id: string, request: DecideAccessRequestRequest): Observable<OutcomeResponse> {
    return this.http
      .post<ApiResponse<OutcomeResponse>>(`${this.baseUrl}/${id}/decide`, request)
      .pipe(map((response) => response.data!));
  }

  approve(id: string, expectedVersion: number, notes?: string): Observable<OutcomeResponse> {
    return this.decide(id, { approved: true, expectedVersion, notes });
  }

  reject(id: string, expectedVersion: number, reason: string): Observable<OutcomeResponse> {
    return this.decide(id, { approved: false, expectedVersion, notes: reason });
  }

  returnForInformation(id: string, request: ReturnAccessRequestRequest): Observable<OutcomeResponse> {
    return this.http
      .post<ApiResponse<OutcomeResponse>>(`${this.baseUrl}/${id}/return`, request)
      .pipe(map((response) => response.data!));
  }

  /** The requester withdrawing their own request before anybody has decided on it. */
  withdraw(id: string, request: WithdrawAccessRequestRequest): Observable<OutcomeResponse> {
    return this.http
      .post<ApiResponse<OutcomeResponse>>(`${this.baseUrl}/${id}/withdraw`, request)
      .pipe(map((response) => response.data!));
  }

  // ---- Aliases for the vocabulary the screens use -----------------------------------------
  //
  // The screen speaks of requests; this service speaks of the resource. Both are reasonable, and
  // a handful of one-line aliases is cheaper than renaming every call site — and far cheaper
  // than two services that do the same thing.

  getRequests = (filter: AccessRequestSearchFilter) => this.search(filter);
  createRequest = (request: CreateAccessRequestRequest) => this.create(request);
  submitRequest = (id: string, request: SubmitAccessRequestRequest) => this.submit(id, request);
  approveRequest = (id: string, expectedVersion: number, notes?: string) =>
    this.approve(id, expectedVersion, notes);
  rejectRequest = (id: string, expectedVersion: number, reason: string) =>
    this.reject(id, expectedVersion, reason);
  returnRequest = (id: string, request: ReturnAccessRequestRequest) =>
    this.returnForInformation(id, request);
  cancelRequest = (id: string, request: WithdrawAccessRequestRequest) => this.withdraw(id, request);


  deleteDraft = (id: string, request: WithdrawAccessRequestRequest) => this.withdraw(id, request);

  private toParams(filter: AccessRequestSearchFilter): HttpParams {
    let params = new HttpParams();

    Object.entries(filter as Record<string, unknown>).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return params;
  }
}
