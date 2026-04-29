import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { PRODUCTS } from '../../models/product.data';
import { OrderNotification } from '../../models/order-notification.model';
import { Order } from '../../models/order.model';
import { Product } from '../../models/product.model';
import { OrderStoreService } from '../../core/services/order-store.service';
import { ChatbotComponent } from '../../chatbot/chatbot.component';
import { CartComponent } from '../cart/cart.component';
import { ProductCardComponent } from '../products/product-card/product-card.component';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, ProductCardComponent, CartComponent, ChatbotComponent],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss']
})
export class LandingComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly destroyRef = inject(DestroyRef);

  products = PRODUCTS;
  categories: string[] = [];
  groupedProducts: Record<string, Product[]> = {};
  activeCategory = '';
  recentOrders: Order[] = [];
  customerNotifications: OrderNotification[] = [];

  constructor(private readonly orderStore: OrderStoreService) {}

  ngOnInit() {
    this.categories = [...new Set(this.products.map((product) => product.category))];
    this.groupedProducts = this.categories.reduce<Record<string, Product[]>>(
      (groups, category) => {
        groups[category] = this.products.filter(
          (product) => product.category === category
        );
        return groups;
      },
      {}
    );
    this.activeCategory = this.categories[0] ?? '';

    this.orderStore.orders$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((orders) => {
        this.recentOrders = orders.slice(0, 3);
      });

    this.orderStore.notifications$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((notifications) => {
        this.customerNotifications = notifications
          .filter((notification) => notification.audience === 'customer')
          .slice(0, 3);
      });
  }

  goToMenu() {
    this.scrollToElement('menu-section');
  }

  focusCategory(category: string) {
    this.activeCategory = category;
    this.scrollToElement(category);
  }

  getStatusLabel(order: Order): string {
    return this.orderStore.getStatusLabel(order.status);
  }

  getProgress(order: Order): number {
    switch (order.status) {
      case 'new':
        return 20;
      case 'confirmed':
        return 40;
      case 'preparing':
        return 65;
      case 'dispatched':
        return 85;
      case 'delivered':
        return 100;
      case 'cancelled':
        return 0;
      default:
        return 0;
    }
  }

  formatDate(date: string): string {
    return new Intl.DateTimeFormat('es-EC', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(date));
  }

  private scrollToElement(elementId: string) {
    if (!this.isBrowser) {
      return;
    }

    document.getElementById(elementId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }
}
