import { Injectable } from '@angular/core';
import { PRODUCTS } from '../models/product.data';
import { Product } from '../models/product.model';

export interface ChatbotReply {
  intent: string;
  text: string;
  leadScore: number;
  tags: string[];
  matchedProduct?: Product;
}

@Injectable({
  providedIn: 'root'
})
export class ChatbotService {
  generateReply(message: string): ChatbotReply {
    const text = this.normalize(message);
    const matchedProduct = this.findProduct(text);

    if (matchedProduct) {
      return {
        intent: 'product-interest',
        leadScore: 20,
        tags: ['producto', matchedProduct.category],
        matchedProduct,
        text: `Agregue ${matchedProduct.name} a tu pedido. Tambien puedo ayudarte con delivery, retiro o seguimiento.`
      };
    }

    if (this.hasAny(text, ['menu', 'carta', 'productos', 'comida'])) {
      return {
        intent: 'menu',
        leadScore: 12,
        tags: ['menu'],
        text: 'Tenemos hamburguesas, alitas, sanduches, especiales y bebidas. Si me escribes el producto, lo puedo agregar al pedido.'
      };
    }

    if (this.hasAny(text, ['delivery', 'domicilio', 'entrega', 'direccion'])) {
      return {
        intent: 'delivery',
        leadScore: 15,
        tags: ['delivery'],
        text: 'Para delivery necesito nombre, WhatsApp y direccion. Luego el admin te envia seguimiento por WhatsApp en cada etapa.'
      };
    }

    if (this.hasAny(text, ['retiro', 'local', 'recoger', 'paso'])) {
      return {
        intent: 'pickup',
        leadScore: 12,
        tags: ['retiro-local'],
        text: 'Para retiro en local registramos tu pedido y te avisamos por WhatsApp cuando este confirmado y listo.'
      };
    }

    if (this.hasAny(text, ['pedido', 'estado', 'seguimiento', 'ticket'])) {
      return {
        intent: 'tracking',
        leadScore: 10,
        tags: ['seguimiento'],
        text: 'Desde el panel admin se envia el seguimiento por WhatsApp. Ten a mano tu codigo de pedido para ubicarlo mas rapido.'
      };
    }

    if (this.hasAny(text, ['factura', 'ruc', 'comprobante'])) {
      return {
        intent: 'billing',
        leadScore: 8,
        tags: ['facturacion'],
        text: 'Podemos emitir factura. En el checkout selecciona factura y completa RUC, razon social, correo y direccion fiscal.'
      };
    }

    if (this.hasAny(text, ['humano', 'asesor', 'whatsapp', 'ayuda'])) {
      return {
        intent: 'human-handoff',
        leadScore: 18,
        tags: ['asesor'],
        text: 'Te dejo listo para que el equipo te atienda por WhatsApp. Completa tu numero para que el CRM guarde el contacto.'
      };
    }

    return {
      intent: 'unknown',
      leadScore: 4,
      tags: ['consulta-general'],
      text: 'Puedo ayudarte con menu, delivery, retiro, factura o seguimiento. Escribe el producto o el tipo de ayuda que necesitas.'
    };
  }

  private findProduct(text: string): Product | undefined {
    return PRODUCTS.find((product) => {
      const name = this.normalize(product.name);
      const category = this.normalize(product.category);
      return text.includes(name) || name.split(' ').some((part) => part.length > 4 && text.includes(part)) || text.includes(category);
    });
  }

  private hasAny(text: string, terms: string[]): boolean {
    return terms.some((term) => text.includes(term));
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }
}
