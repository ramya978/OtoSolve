import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiResponse, OutcomeResponse, PagedResponse } from '../Shared/models/api-response.model';
import {
  ApplyBulkOperationRequest,
  BulkOperationDetailResponse,
  BulkOperationListItemResponse,
  CreateBulkOperationRequest,
} from '../Shared/models/iam-contract.model';


@Injectable({ providedIn: 'root' })
export class BulkUserAdminApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/users/bulk-actions`;
  private readonly operationsUrl = `${environment.apiBaseUrl}/governance/bulk-operations`;


  createOperation(request: CreateBulkOperationRequest): Observable<OutcomeResponse> {
    return this.http
      .post<ApiResponse<OutcomeResponse>>(this.baseUrl, request)
      .pipe(map((response) => response.data!));
  }


  apply(request: ApplyBulkOperationRequest): Observable<OutcomeResponse> {
    return this.http
      .post<ApiResponse<OutcomeResponse>>(`${this.baseUrl}/apply`, request)
      .pipe(map((response) => response.data!));
  }

  /** One operation with its per-row outcomes. Used for the preview and for the result. */
  getOperation(id: string): Observable<BulkOperationDetailResponse> {
    return this.http
      .get<ApiResponse<BulkOperationDetailResponse>>(`${this.baseUrl}/${id}`)
      .pipe(map((response) => response.data!));
  }

  /** The operations this Organisation has run, newest first. */
  getOperations(page = 1, pageSize = 20): Observable<PagedResponse<BulkOperationListItemResponse>> {
    return this.http
      .get<ApiResponse<PagedResponse<BulkOperationListItemResponse>>>(this.baseUrl, {
        params: new HttpParams().set('page', page).set('pageSize', pageSize),
      })
      .pipe(map((response) => response.data!));
  }


  getHistory(page = 1, pageSize = 20): Observable<PagedResponse<BulkOperationListItemResponse>> {
    return this.http
      .get<ApiResponse<PagedResponse<BulkOperationListItemResponse>>>(this.operationsUrl, {
        params: new HttpParams().set('page', page).set('pageSize', pageSize),
      })
      .pipe(map((response) => response.data!));
  }


  cancel(id: string, expectedVersion: number, reason?: string): Observable<OutcomeResponse> {
    return this.http
      .post<ApiResponse<OutcomeResponse>>(`${this.baseUrl}/${id}/cancel`, {
        expectedVersion,
        reason,
      })
      .pipe(map((response) => response.data!));
  }
}
