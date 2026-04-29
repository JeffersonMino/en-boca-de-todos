import { CrmActivity, CrmContact, CrmConversation, CrmMessage, CrmOpportunity } from './crm.model';
import { OrderNotification } from './order-notification.model';
import { Order } from './order.model';

export interface PersistentCrmSnapshot {
  contacts: CrmContact[];
  conversations: CrmConversation[];
  messages: CrmMessage[];
  opportunities: CrmOpportunity[];
  activities: CrmActivity[];
}

export interface PersistentOrderSnapshot {
  orders: Order[];
  notifications: OrderNotification[];
}

export interface PersistentAdminState extends PersistentOrderSnapshot, PersistentCrmSnapshot {
  databaseVersion: number;
  updatedAt: string;
}

export interface CreateOrderApiPayload {
  order: Order;
  notification?: OrderNotification;
  notifications?: OrderNotification[];
}

export interface UpdateOrderStatusApiPayload extends CreateOrderApiPayload {}

export interface AdminLoginApiResponse {
  success: boolean;
  challengeId?: string;
  ownerName?: string;
  message: string;
}

export interface AdminConfirmApiResponse {
  success: boolean;
  token?: string;
  ownerName?: string;
  expiresAt?: string;
  message: string;
}
