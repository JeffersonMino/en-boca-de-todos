import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../services/admin-auth.service';

export const adminAuthGuard: CanActivateFn = () => {
  const router = inject(Router);
  const authService = inject(AdminAuthService);

  return authService.isAuthenticated
    ? true
    : router.createUrlTree(['/admin/login']);
};
