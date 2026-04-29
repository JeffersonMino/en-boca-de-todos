import { Order, OrderStatus, OrderType } from './order.model';

export type CrmContactStage = 'lead' | 'active' | 'vip' | 'inactive';
export type CrmChannel = 'chatbot' | 'whatsapp' | 'order' | 'admin';
export type CrmConversationStatus = 'open' | 'waiting' | 'closed';
export type CrmMessageSender = 'customer' | 'bot' | 'admin' | 'system';
export type CrmOpportunityStage = 'new' | 'qualified' | 'ordered' | 'won' | 'lost';
export type CrmActivityType = 'message' | 'order' | 'status' | 'note' | 'whatsapp';

export interface CrmContact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  source: CrmChannel;
  stage: CrmContactStage;
  tags: string[];
  score: number;
  totalOrders: number;
  totalSpent: number;
  lastOrderId?: string;
  lastInteractionAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmMessage {
  id: string;
  conversationId: string;
  contactId: string;
  sender: CrmMessageSender;
  text: string;
  createdAt: string;
  intent?: string;
}

export interface CrmConversation {
  id: string;
  contactId: string;
  channel: CrmChannel;
  status: CrmConversationStatus;
  subject: string;
  lastMessage: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmOpportunity {
  id: string;
  contactId: string;
  orderId?: string;
  title: string;
  stage: CrmOpportunityStage;
  value: number;
  probability: number;
  orderType?: OrderType;
  createdAt: string;
  updatedAt: string;
}

export interface CrmActivity {
  id: string;
  contactId: string;
  orderId?: string;
  type: CrmActivityType;
  channel: CrmChannel;
  title: string;
  detail: string;
  createdAt: string;
}

export interface CrmUpsertContactInput {
  name?: string;
  phone?: string;
  email?: string;
  source: CrmChannel;
  tags?: string[];
  score?: number;
}

export interface CrmOrderSnapshot {
  order: Order;
  statusLabel: string;
  status: OrderStatus;
}
