import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AdminAuthService } from '../../core/services/admin-auth.service';

type LoginStep = 'credentials' | 'confirmation';
type MessageTone = 'success' | 'warning';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-login.component.html',
  styleUrls: ['./admin-login.component.scss']
})
export class AdminLoginComponent implements OnInit {
  step: LoginStep = 'credentials';
  username = '';
  password = '';
  confirmationCode = '';
  message = '';
  tone: MessageTone = 'success';
  loading = false;
  readonly ownerName = environment.admin.ownerName;

  constructor(
    private readonly authService: AdminAuthService,
    private readonly router: Router
  ) {}

  ngOnInit() {
    if (this.authService.isAuthenticated) {
      this.router.navigate(['/admin']);
      return;
    }

    this.step = this.authService.hasPendingChallenge()
      ? 'confirmation'
      : 'credentials';
  }

  submitCredentials() {
    if (this.loading) {
      return;
    }

    this.loading = true;
    this.authService.startLogin(this.username, this.password).subscribe((result) => {
      this.loading = false;
      this.showMessage(result.message, result.success ? 'success' : 'warning');

      if (result.success) {
        this.step = 'confirmation';
        this.password = '';
      }
    });
  }

  submitConfirmationCode() {
    if (this.loading) {
      return;
    }

    this.loading = true;
    this.authService.confirmCode(this.confirmationCode).subscribe((result) => {
      this.loading = false;
      this.showMessage(result.message, result.success ? 'success' : 'warning');

      if (result.success) {
        this.confirmationCode = '';
        this.router.navigate(['/admin']);
      }
    });
  }

  backToCredentials() {
    this.authService.resetPendingChallenge();
    this.step = 'credentials';
    this.confirmationCode = '';
    this.showMessage('', 'success');
  }

  private showMessage(message: string, tone: MessageTone) {
    this.message = message;
    this.tone = tone;
  }
}
