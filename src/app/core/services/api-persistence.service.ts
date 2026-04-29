import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminConfirmApiResponse,
  AdminLoginApiResponse,
  CreateOrderApiPayload,
  PersistentAdminState,
  PersistentCrmSnapshot,
  UpdateOrderStatusApiPayload
} from '../../models/persistent-state.model';

interface ApiResult {
  success: boolean;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiPersistenceService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly apiBaseUrl = environment.api.baseUrl.replace(/\/$/, '');
  private readonly sessionTokenKey = 'ebdt_admin_token_v1';

  adminLogin(username: string, password: string): Observable<AdminLoginApiResponse> {
    if (!this.isBrowser) {
      return of({
        success: false,
        message: 'El login solo esta disponible desde el navegador.'
      });
    }

    return this.http
      .post<AdminLoginApiResponse>(`${this.apiBaseUrl}/admin/login`, {
        username,
        password
      })
      .pipe(catchError((error: HttpErrorResponse) => of(this.failedLogin(this.loginErrorMessage(error)))));
  }

  adminConfirm(challengeId: string, code: string): Observable<AdminConfirmApiResponse> {
    if (!this.isBrowser) {
      return of({
        success: false,
        message: 'La confirmacion solo esta disponible desde el navegador.'
      });
    }

    return this.http
      .post<AdminConfirmApiResponse>(`${this.apiBaseUrl}/admin/confirm`, {
        challengeId,
        code
      })
      .pipe(
        catchError((error: HttpErrorResponse) =>
          of(this.failedConfirmation(this.confirmationErrorMessage(error)))
        )
      );
  }

  adminLogout(): Observable<ApiResult> {
    if (!this.isBrowser) {
      return of({ success: true });
    }

    return this.http
      .post<ApiResult>(`${this.apiBaseUrl}/admin/logout`, {}, {
        headers: this.authHeaders()
      })
      .pipe(catchError(() => of({ success: false })));
  }

  getAdminState(): Observable<PersistentAdminState | null> {
    if (!this.isBrowser) {
      return of(null);
    }

    return this.http
      .get<PersistentAdminState>(`${this.apiBaseUrl}/admin/state`, {
        headers: this.authHeaders()
      })
      .pipe(catchError(() => of(null)));
  }

  createOrder(payload: CreateOrderApiPayload): Observable<ApiResult> {
    return this.postPublic<ApiResult>('/orders', payload);
  }

  updateOrderStatus(payload: UpdateOrderStatusApiPayload): Observable<ApiResult> {
    if (!this.isBrowser) {
      return of({ success: false });
    }

    return this.http
      .patch<ApiResult>(`${this.apiBaseUrl}/admin/orders/${payload.order.id}/status`, payload, {
        headers: this.authHeaders()
      })
      .pipe(catchError(() => of({ success: false })));
  }

  markNotificationAsRead(notificationId: string): Observable<ApiResult> {
    if (!this.isBrowser) {
      return of({ success: false });
    }

    return this.http
      .patch<ApiResult>(
        `${this.apiBaseUrl}/admin/notifications/${notificationId}/read`,
        {},
        { headers: this.authHeaders() }
      )
      .pipe(catchError(() => of({ success: false })));
  }

  saveCrmSnapshot(snapshot: PersistentCrmSnapshot): Observable<ApiResult> {
    return this.postPublic<ApiResult>('/crm/snapshot', snapshot);
  }

  private postPublic<T>(path: string, payload: unknown): Observable<T> {
    if (!this.isBrowser) {
      return of({ success: false } as T);
    }

    return this.http
      .post<T>(`${this.apiBaseUrl}${path}`, payload)
      .pipe(catchError(() => of({ success: false } as T)));
  }

  private authHeaders(): HttpHeaders {
    const token = this.isBrowser
      ? sessionStorage.getItem(this.sessionTokenKey)
      : null;

    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

  private failedLogin(message: string): AdminLoginApiResponse {
    return {
      success: false,
      message
    };
  }

  private failedConfirmation(message: string): AdminConfirmApiResponse {
    return {
      success: false,
      message
    };
  }

  private loginErrorMessage(error: HttpErrorResponse): string {
    return error.status === 0
      ? 'No se pudo conectar con la API del servidor. Ejecuta la app con el servidor SSR.'
      : 'Usuario o clave incorrectos.';
  }

  private confirmationErrorMessage(error: HttpErrorResponse): string {
    return error.status === 0
      ? 'No se pudo conectar con la API del servidor. Ejecuta la app con el servidor SSR.'
      : 'Codigo incorrecto o expirado.';
  }
}
