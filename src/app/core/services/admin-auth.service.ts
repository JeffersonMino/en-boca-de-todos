import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { ApiPersistenceService } from './api-persistence.service';

interface PendingAdminChallenge {
  challengeId: string;
  ownerName: string;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class AdminAuthService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly apiPersistence = inject(ApiPersistenceService);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly sessionTokenKey = 'ebdt_admin_token_v1';
  private readonly sessionExpiresKey = 'ebdt_admin_expires_v1';
  private readonly sessionOwnerKey = 'ebdt_admin_owner_v1';
  private readonly challengeKey = 'ebdt_admin_challenge_v1';
  private readonly challengeTtlMs = 5 * 60 * 1000;

  private readonly authStateSubject = new BehaviorSubject<boolean>(
    this.readSessionFlag()
  );
  readonly isAuthenticated$ = this.authStateSubject.asObservable();

  get isAuthenticated(): boolean {
    return this.authStateSubject.value;
  }

  get ownerName(): string {
    if (!this.isBrowser) {
      return environment.admin.ownerName;
    }

    return sessionStorage.getItem(this.sessionOwnerKey) ?? environment.admin.ownerName;
  }

  startLogin(username: string, password: string) {
    return this.apiPersistence.adminLogin(username.trim(), password).pipe(
      tap((result) => {
        if (!result.success || !result.challengeId) {
          return;
        }

        this.writePendingChallenge({
          challengeId: result.challengeId,
          ownerName: result.ownerName ?? environment.admin.ownerName,
          createdAt: new Date().toISOString()
        });
      }),
      map((result) => ({
        success: result.success,
        message: result.message
      }))
    );
  }

  confirmCode(code: string) {
    const pendingChallenge = this.getPendingChallenge();

    if (!pendingChallenge) {
      return of({
        success: false,
        message: 'Tu sesion de acceso expiro. Vuelve a ingresar tu clave.'
      });
    }

    return this.apiPersistence.adminConfirm(pendingChallenge.challengeId, code.trim()).pipe(
      tap((result) => {
        if (!result.success || !result.token) {
          return;
        }

        if (this.isBrowser) {
          sessionStorage.setItem(this.sessionTokenKey, result.token);
          sessionStorage.setItem(
            this.sessionExpiresKey,
            result.expiresAt ?? new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
          );
          sessionStorage.setItem(
            this.sessionOwnerKey,
            result.ownerName ?? pendingChallenge.ownerName
          );
          sessionStorage.removeItem(this.challengeKey);
        }

        this.authStateSubject.next(true);
      }),
      map((result) => ({
        success: result.success,
        message: result.message
      }))
    );
  }

  logout() {
    if (this.isBrowser) {
      this.apiPersistence.adminLogout().subscribe();
      sessionStorage.removeItem(this.sessionTokenKey);
      sessionStorage.removeItem(this.sessionExpiresKey);
      sessionStorage.removeItem(this.sessionOwnerKey);
      sessionStorage.removeItem(this.challengeKey);
    }

    this.authStateSubject.next(false);
  }

  hasPendingChallenge(): boolean {
    return !!this.getPendingChallenge();
  }

  resetPendingChallenge() {
    if (this.isBrowser) {
      sessionStorage.removeItem(this.challengeKey);
    }
  }

  private getPendingChallenge(): PendingAdminChallenge | null {
    if (!this.isBrowser) {
      return null;
    }

    try {
      const raw = sessionStorage.getItem(this.challengeKey);
      const challenge = raw ? (JSON.parse(raw) as PendingAdminChallenge) : null;

      if (!challenge) {
        return null;
      }

      const isExpired =
        Date.now() - new Date(challenge.createdAt).getTime() > this.challengeTtlMs;

      if (isExpired) {
        sessionStorage.removeItem(this.challengeKey);
        return null;
      }

      return challenge;
    } catch {
      return null;
    }
  }

  private writePendingChallenge(challenge: PendingAdminChallenge) {
    if (!this.isBrowser) {
      return;
    }

    sessionStorage.setItem(this.challengeKey, JSON.stringify(challenge));
  }

  private readSessionFlag(): boolean {
    if (!this.isBrowser) {
      return false;
    }

    const token = sessionStorage.getItem(this.sessionTokenKey);
    const expiresAt = sessionStorage.getItem(this.sessionExpiresKey);

    if (!token || !expiresAt) {
      return false;
    }

    const isExpired = new Date(expiresAt).getTime() <= Date.now();

    if (isExpired) {
      sessionStorage.removeItem(this.sessionTokenKey);
      sessionStorage.removeItem(this.sessionExpiresKey);
      sessionStorage.removeItem(this.sessionOwnerKey);
      return false;
    }

    return true;
  }
}
