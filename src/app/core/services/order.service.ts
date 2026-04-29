import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Product } from '../../models/product.model';

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface InvoiceData {
  ruc: string;
  razonSocial: string;
  direccionFiscal: string;
  correo: string;
  telefono: string;
}

@Injectable({
  providedIn: 'root'
})
export class OrderService {
  private comprobante: 'factura' | 'nota' | null = null;
  private items: CartItem[] = [];
  private datosFactura: InvoiceData = {
    ruc: '',
    razonSocial: '',
    direccionFiscal: '',
    correo: '',
    telefono: ''
  };
  private itemsSubject = new BehaviorSubject(this.items);
  items$ = this.itemsSubject.asObservable();

  addProduct(product: Product) {
    const existing = this.items.find(i => i.product.id === product.id);

    if (existing) {
      existing.quantity++;
    } else {
      this.items.push({ product, quantity: 1 });
    }

    this.emitItems();
  }

  decreaseProduct(productId: string) {
    const existing = this.items.find((item) => item.product.id === productId);

    if (!existing) {
      return;
    }

    if (existing.quantity === 1) {
      this.removeProduct(productId);
      return;
    }

    existing.quantity--;
    this.emitItems();
  }

  removeProduct(productId: string) {
    this.items = this.items.filter((i) => i.product.id !== productId);
    this.emitItems();
  }

  getSubtotal(): number {
    return this.items.reduce(
      (sum, item) => sum + (item.product.price * item.quantity),
      0
    );
  }

  clearCart() {
    this.items = [];
    this.emitItems();
  }

  setComprobante(tipo: 'factura' | 'nota' | null) {
    this.comprobante = tipo;
  }

  getComprobante() {
    return this.comprobante;
  }

  setDatosFactura(datos: Partial<InvoiceData>) {
    this.datosFactura = { ...this.datosFactura, ...datos };
  }

  getDatosFactura(): InvoiceData {
    return this.datosFactura ?? {
      ruc: '',
      razonSocial: '',
      direccionFiscal: '',
      correo: '',
      telefono: ''
    };
  }

  clearDatosFactura() {
    this.datosFactura = {
      ruc: '',
      razonSocial: '',
      direccionFiscal: '',
      correo: '',
      telefono: ''
    };
  }

  private emitItems() {
    this.itemsSubject.next([...this.items]);
  }
}
