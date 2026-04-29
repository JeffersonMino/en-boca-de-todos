import { Product } from './product.model';

export interface OrderItem {
  product: Product;
  quantity: number;
  total: number;
}