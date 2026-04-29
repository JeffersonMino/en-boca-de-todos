export type OrderNotificationAudience = 'admin' | 'customer';
export type OrderNotificationKind = 'new-order' | 'status-change' | 'dispatch';

export interface OrderNotification {
  id: string;
  orderId: string;
  title: string;
  message: string;
  createdAt: string;
  kind: OrderNotificationKind;
  audience: OrderNotificationAudience;
  read: boolean;
}
