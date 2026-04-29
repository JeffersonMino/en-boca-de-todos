import { OrderItem } from './order-item.model';

export type OrderStatus =
  | 'new'
  | 'confirmed'
  | 'preparing'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

export type OrderType = 'pickup' | 'delivery';

export interface CustomerInfo {
  name: string;
  phone: string;
  email?: string;
}

export interface DeliveryInfo {
  address: string;
  notes?: string;
}

export interface BillingInfo {
  type: 'factura' | 'nota' | null;
  ruc?: string;
  businessName?: string;
  fiscalAddress?: string;
  email?: string;
  phone?: string;
}

export interface Order {
  id: string;
  sequential: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  type: OrderType;
  source: 'whatsapp' | 'delivery';
  customer: CustomerInfo;
  delivery?: DeliveryInfo;
  billing: BillingInfo;
  estimatedMinutes: number;
  dispatchedAt?: string;
  deliveredAt?: string;
}
