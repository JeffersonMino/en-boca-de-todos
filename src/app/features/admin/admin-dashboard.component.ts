import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { CrmService } from '../../core/services/crm.service';
import { OrderStoreService } from '../../core/services/order-store.service';
import {
  CrmActivity,
  CrmContact,
  CrmConversation,
  CrmOpportunity
} from '../../models/crm.model';
import { OrderNotification } from '../../models/order-notification.model';
import { Order, OrderStatus } from '../../models/order.model';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.scss']
})
export class AdminDashboardComponent {
  private readonly destroyRef = inject(DestroyRef);
  orders: Order[] = [];
  notifications: OrderNotification[] = [];
  contacts: CrmContact[] = [];
  conversations: CrmConversation[] = [];
  opportunities: CrmOpportunity[] = [];
  activities: CrmActivity[] = [];
  ownerName = '';

  constructor(
    private readonly orderStore: OrderStoreService,
    private readonly crmService: CrmService,
    private readonly authService: AdminAuthService,
    private readonly router: Router
  ) {
    this.ownerName = this.authService.ownerName;

    this.orderStore.orders$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((orders) => {
        this.orders = orders;
      });

    this.orderStore.notifications$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((notifications) => {
        this.notifications = notifications;
      });

    this.crmService.contacts$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((contacts) => {
        this.contacts = contacts;
      });

    this.crmService.conversations$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((conversations) => {
        this.conversations = conversations;
      });

    this.crmService.opportunities$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((opportunities) => {
        this.opportunities = opportunities;
      });

    this.crmService.activities$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((activities) => {
        this.activities = activities;
      });

    this.orderStore.refreshFromDatabase();
    this.crmService.refreshFromDatabase();
  }

  get incomingOrders(): Order[] {
    return this.orders.filter((order) =>
      ['new', 'confirmed', 'preparing'].includes(order.status)
    );
  }

  get outgoingOrders(): Order[] {
    return this.orders.filter((order) =>
      ['dispatched', 'delivered'].includes(order.status)
    );
  }

  get cancelledOrders(): Order[] {
    return this.orders.filter((order) => order.status === 'cancelled');
  }

  get totalRevenue(): number {
    return this.orders
      .filter((order) => order.status !== 'cancelled')
      .reduce((sum, order) => sum + order.total, 0);
  }

  get hotLeads(): CrmContact[] {
    return this.contacts.filter((contact) => contact.score >= 35);
  }

  get activeConversations(): CrmConversation[] {
    return this.conversations.filter((conversation) => conversation.status !== 'closed');
  }

  get openPipelineValue(): number {
    return this.opportunities
      .filter((opportunity) => !['won', 'lost'].includes(opportunity.stage))
      .reduce((sum, opportunity) => sum + opportunity.value, 0);
  }

  setStatus(order: Order, status: OrderStatus) {
    const updatedOrder = this.orderStore.updateOrderStatus(order.id, status);

    if (!updatedOrder) {
      return;
    }

    this.sendOrderTracking(updatedOrder);
  }

  canDispatch(order: Order): boolean {
    return order.status === 'preparing' && order.type === 'delivery';
  }

  canCompletePickup(order: Order): boolean {
    return order.status === 'preparing' && order.type === 'pickup';
  }

  sendOrderTracking(order: Order) {
    this.orderStore.openWhatsApp(
      this.orderStore.buildCustomerTrackingWhatsAppUrl(order)
    );
    this.crmService.recordOrderWhatsApp(
      order,
      `Seguimiento enviado al cliente con estado ${this.getStatusLabel(order.status)}.`
    );
  }

  openContactWhatsApp(contact: CrmContact) {
    const message = [
      `Hola ${contact.name},`,
      'te contactamos de En Boca de Todos para dar seguimiento a tu pedido o consulta.',
      'Estamos atentos para ayudarte.'
    ].join('\n');

    this.orderStore.openWhatsApp(
      this.crmService.buildContactWhatsAppUrl(contact, message)
    );
    this.crmService.recordContactWhatsApp(contact, 'Contacto manual desde panel CRM.');
  }

  getContactName(contactId: string): string {
    return this.contacts.find((contact) => contact.id === contactId)?.name ?? 'Contacto';
  }

  getStatusLabel(status: OrderStatus): string {
    return this.orderStore.getStatusLabel(status);
  }

  formatDate(date: string): string {
    return new Intl.DateTimeFormat('es-EC', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(date));
  }

  markAsRead(notificationId: string) {
    this.orderStore.markNotificationAsRead(notificationId);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/admin/login']);
  }
}
