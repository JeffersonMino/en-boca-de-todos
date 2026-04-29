import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { OrderItem } from '../../models/order-item.model';
import { OrderNotification } from '../../models/order-notification.model';
import {
  BillingInfo,
  CustomerInfo,
  DeliveryInfo,
  Order,
  OrderStatus,
  OrderType
} from '../../models/order.model';
import { Product } from '../../models/product.model';
import { ApiPersistenceService } from './api-persistence.service';
import { CrmService } from './crm.service';

interface CartLine {
  product: Product;
  quantity: number;
}

export interface CreateOrderPayload {
  items: CartLine[];
  subtotal: number;
  tax: number;
  total: number;
  type: OrderType;
  source: 'whatsapp' | 'delivery';
  customer: CustomerInfo;
  delivery?: DeliveryInfo;
  billing: BillingInfo;
}

@Injectable({
  providedIn: 'root'
})
export class OrderStoreService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly apiPersistence = inject(ApiPersistenceService);
  private readonly crmService = inject(CrmService);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly ordersStorageKey = 'ebdt_orders_v1';
  private readonly notificationsStorageKey = 'ebdt_notifications_v1';

  private readonly ordersSubject = new BehaviorSubject<Order[]>([]);
  readonly orders$ = this.ordersSubject.asObservable();

  private readonly notificationsSubject = new BehaviorSubject<OrderNotification[]>([]);
  readonly notifications$ = this.notificationsSubject.asObservable();

  constructor() {
    this.hydrate();
  }

  getOrdersSnapshot(): Order[] {
    return this.ordersSubject.value;
  }

  getNotificationsSnapshot(): OrderNotification[] {
    return this.notificationsSubject.value;
  }

  createOrder(payload: CreateOrderPayload): Order {
    const now = new Date().toISOString();
    const currentOrders = this.getOrdersSnapshot();
    const order: Order = {
      id: this.generateId('ord'),
      sequential: this.generateSequential(currentOrders),
      items: payload.items.map((item) => this.mapOrderItem(item)),
      subtotal: payload.subtotal,
      tax: payload.tax,
      total: payload.total,
      createdAt: now,
      updatedAt: now,
      status: 'new',
      type: payload.type,
      source: payload.source,
      customer: payload.customer,
      delivery: payload.delivery,
      billing: payload.billing,
      estimatedMinutes: payload.type === 'delivery' ? 45 : 20
    };

    this.setOrders([order, ...currentOrders]);
    const notification = this.pushNotification({
      orderId: order.id,
      title: `Nuevo pedido ${order.sequential}`,
      message: `${order.customer.name} registro un pedido ${order.type === 'delivery' ? 'a domicilio' : 'para retiro'}.`,
      kind: 'new-order',
      audience: 'admin'
    });

    this.apiPersistence.createOrder({ order, notification }).subscribe();
    this.crmService.registerOrder(order);

    return order;
  }

  updateOrderStatus(orderId: string, status: OrderStatus): Order | null {
    const orders = this.getOrdersSnapshot();
    const order = orders.find((item) => item.id === orderId);

    if (!order || order.status === status) {
      return order ?? null;
    }

    const now = new Date().toISOString();
    const updatedOrder: Order = {
      ...order,
      status,
      updatedAt: now,
      dispatchedAt: status === 'dispatched' ? now : order.dispatchedAt,
      deliveredAt: status === 'delivered' ? now : order.deliveredAt
    };

    this.setOrders(
      orders.map((item) => (item.id === orderId ? updatedOrder : item))
    );

    const notifications = [
      this.pushNotification({
        orderId: updatedOrder.id,
        title: `Estado actualizado: ${updatedOrder.sequential}`,
        message: `El pedido paso a ${this.getStatusLabel(status)}.`,
        kind: status === 'dispatched' ? 'dispatch' : 'status-change',
        audience: 'admin'
      })
    ];

    this.crmService.registerOrderStatus(updatedOrder, this.getStatusLabel(status));

    if (status === 'dispatched') {
      notifications.push(
        this.pushNotification({
          orderId: updatedOrder.id,
          title: `Tu pedido ${updatedOrder.sequential} va en camino`,
          message: `Salida confirmada. Tiempo estimado restante: ${updatedOrder.estimatedMinutes} min.`,
          kind: 'dispatch',
          audience: 'customer'
        })
      );
      this.sendBrowserNotification(
        `Pedido ${updatedOrder.sequential} despachado`,
        `${updatedOrder.customer.name}, tu pedido ya va en camino.`
      );
    }

    this.apiPersistence.updateOrderStatus({
      order: updatedOrder,
      notifications
    }).subscribe();

    return updatedOrder;
  }

  refreshFromDatabase() {
    this.apiPersistence.getAdminState().subscribe((state) => {
      if (!state) {
        return;
      }

      this.setOrders(state.orders);
      this.setNotifications(state.notifications);
    });
  }

  markNotificationAsRead(notificationId: string) {
    const notifications = this.getNotificationsSnapshot().map((notification) =>
      notification.id === notificationId
        ? { ...notification, read: true }
        : notification
    );

    this.setNotifications(notifications);
    this.apiPersistence.markNotificationAsRead(notificationId).subscribe();
  }

  buildBusinessWhatsAppUrl(order: Order): string {
    const businessPhone = this.normalizePhone(environment.whatsapp.phone);

    if (!businessPhone) {
      return '';
    }

    const text = encodeURIComponent(this.buildBusinessMessage(order));
    return `https://wa.me/${businessPhone}?text=${text}`;
  }

  buildDispatchWhatsAppUrl(order: Order): string | null {
    return this.buildCustomerTrackingWhatsAppUrl(order);
  }

  buildCustomerTrackingWhatsAppUrl(order: Order): string | null {
    const customerPhone = this.normalizePhone(order.customer.phone);

    if (!customerPhone) {
      return null;
    }

    const text = encodeURIComponent(this.buildCustomerTrackingMessage(order));
    return `https://wa.me/${customerPhone}?text=${text}`;
  }

  openWhatsApp(url: string | null) {
    if (!url || !this.isBrowser) {
      return;
    }

    window.open(url, '_blank', 'noopener');
  }

  getStatusLabel(status: OrderStatus): string {
    switch (status) {
      case 'new':
        return 'nuevo';
      case 'confirmed':
        return 'confirmado';
      case 'preparing':
        return 'en preparacion';
      case 'dispatched':
        return 'despachado';
      case 'delivered':
        return 'entregado';
      case 'cancelled':
        return 'cancelado';
      default:
        return status;
    }
  }

  private hydrate() {
    if (!this.isBrowser) {
      return;
    }

    this.setOrders(this.readStorage<Order[]>(this.ordersStorageKey));
    this.setNotifications(
      this.readStorage<OrderNotification[]>(this.notificationsStorageKey)
    );
  }

  private readStorage<T>(key: string): T {
    if (!this.isBrowser) {
      return [] as T;
    }

    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : ([] as T);
    } catch {
      return [] as T;
    }
  }

  private setOrders(orders: Order[]) {
    const sorted = [...orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    this.ordersSubject.next(sorted);

    if (this.isBrowser) {
      localStorage.setItem(this.ordersStorageKey, JSON.stringify(sorted));
    }
  }

  private setNotifications(notifications: OrderNotification[]) {
    const sorted = [...notifications].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    this.notificationsSubject.next(sorted);

    if (this.isBrowser) {
      localStorage.setItem(
        this.notificationsStorageKey,
        JSON.stringify(sorted)
      );
    }
  }

  private pushNotification(
    notification: Omit<OrderNotification, 'id' | 'createdAt' | 'read'>
  ): OrderNotification {
    const nextNotification: OrderNotification = {
      ...notification,
      id: this.generateId('ntf'),
      createdAt: new Date().toISOString(),
      read: false
    };

    this.setNotifications([nextNotification, ...this.getNotificationsSnapshot()]);
    return nextNotification;
  }

  private mapOrderItem(item: CartLine): OrderItem {
    return {
      product: item.product,
      quantity: item.quantity,
      total: item.product.price * item.quantity
    };
  }

  private buildBusinessMessage(order: Order): string {
    const lines = [
      `${environment.restaurant.name} - nuevo pedido ${order.sequential}`,
      `Fecha: ${this.formatDate(order.createdAt)}`,
      '',
      `Cliente: ${order.customer.name}`,
      `Telefono: ${order.customer.phone}`,
      order.customer.email ? `Correo: ${order.customer.email}` : '',
      `Modalidad: ${order.type === 'delivery' ? 'Domicilio' : 'Retiro'}`,
      '',
      'Detalle'
    ].filter(Boolean);

    order.items.forEach((item) => {
      lines.push(
        `- ${item.product.name} x${item.quantity} | $${item.total.toFixed(2)}`
      );
    });

    lines.push('');
    lines.push(`Subtotal: $${order.subtotal.toFixed(2)}`);
    lines.push(`IVA: $${order.tax.toFixed(2)}`);
    lines.push(`Total: $${order.total.toFixed(2)}`);

    if (order.billing.type) {
      lines.push('');
      lines.push(`Comprobante: ${order.billing.type}`);

      if (order.billing.type === 'factura') {
        lines.push(`RUC: ${order.billing.ruc ?? ''}`);
        lines.push(`Razon social: ${order.billing.businessName ?? ''}`);
        lines.push(`Direccion fiscal: ${order.billing.fiscalAddress ?? ''}`);
      }
    }

    if (order.delivery?.address) {
      lines.push('');
      lines.push(`Direccion: ${order.delivery.address}`);
      if (order.delivery.notes) {
        lines.push(`Referencia: ${order.delivery.notes}`);
      }
    }

    return lines.join('\n');
  }

  private buildCustomerTrackingMessage(order: Order): string {
    const modality = order.type === 'delivery' ? 'domicilio' : 'retiro/local';
    const status = this.getStatusLabel(order.status);
    const nextStep = this.getCustomerNextStep(order);

    return [
      `Hola ${order.customer.name},`,
      `seguimiento en vivo del pedido ${order.sequential}.`,
      `Modalidad: ${modality}.`,
      `Estado actual: ${status}.`,
      `Total: $${order.total.toFixed(2)}.`,
      nextStep,
      'Gracias por comprar en En Boca de Todos.'
    ].join('\n');
  }

  private getCustomerNextStep(order: Order): string {
    if (order.status === 'new') {
      return 'Recibimos tu solicitud y pronto sera confirmada.';
    }

    if (order.status === 'confirmed') {
      return 'Tu pedido fue confirmado y entra a cocina.';
    }

    if (order.status === 'preparing') {
      return order.type === 'delivery'
        ? `Estamos preparando tu pedido. Estimado: ${order.estimatedMinutes} min.`
        : 'Estamos preparando tu pedido para retiro en local.';
    }

    if (order.status === 'dispatched') {
      return order.type === 'delivery'
        ? 'Tu pedido ya salio a entrega.'
        : 'Tu pedido esta listo para entrega en local.';
    }

    if (order.status === 'delivered') {
      return order.type === 'delivery'
        ? 'Tu pedido fue entregado. Buen provecho.'
        : 'Tu pedido fue retirado/entregado en local. Buen provecho.';
    }

    return 'Tu pedido fue cancelado. Contactanos si necesitas ayuda.';
  }

  private sendBrowserNotification(title: string, body: string) {
    if (!this.isBrowser || !('Notification' in window)) {
      return;
    }

    const showNotification = () => new Notification(title, { body });

    if (Notification.permission === 'granted') {
      showNotification();
      return;
    }

    if (Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          showNotification();
        }
      });
    }
  }

  private generateSequential(orders: Order[]): string {
    const highest = orders.reduce((max, order) => {
      const current = Number(order.sequential.replace(/\D/g, ''));
      return current > max ? current : max;
    }, environment.billing.sequentialStart - 1);

    return `PED-${String(highest + 1).padStart(4, '0')}`;
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private formatDate(date: string): string {
    return new Intl.DateTimeFormat('es-EC', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(date));
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');

    if (!digits) {
      return '';
    }

    if (digits.startsWith('593')) {
      return digits;
    }

    if (digits.length === 10 && digits.startsWith('0')) {
      return `593${digits.slice(1)}`;
    }

    return digits;
  }
}
