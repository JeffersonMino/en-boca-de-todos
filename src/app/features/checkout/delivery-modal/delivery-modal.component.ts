import {
  AfterViewInit,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  PLATFORM_ID,
  inject
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../../environments/environment';
import {
  InvoiceData,
  OrderService
} from '../../../core/services/order.service';
import { OrderStoreService } from '../../../core/services/order-store.service';
import { Order } from '../../../models/order.model';
import { Product } from '../../../models/product.model';

declare const google: any;

@Component({
  selector: 'app-delivery-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './delivery-modal.component.html',
  styleUrls: ['./delivery-modal.component.scss']
})
export class DeliveryModalComponent implements AfterViewInit, OnInit {
  @Input() items: { product: Product; quantity: number }[] = [];
  @Input() subtotal = 0;
  @Input() tax = 0;
  @Input() total = 0;
  @Input() customerDraft = {
    name: '',
    phone: '',
    email: '',
    notes: ''
  };

  @Output() closeModal = new EventEmitter<void>();
  @Output() orderPlaced = new EventEmitter<Order>();

  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  comprobanteSeleccionado: 'factura' | 'nota' | null = null;
  validationMessage = '';
  mapReady = false;

  map: any;
  marker: any;
  customerName = '';
  direccionSeleccionada = '';
  correo = '';
  telefono = '';
  referencias = '';
  datosFactura: InvoiceData = {
    ruc: '',
    razonSocial: '',
    direccionFiscal: '',
    correo: '',
    telefono: ''
  };

  constructor(
    private readonly orderService: OrderService,
    private readonly orderStore: OrderStoreService
  ) {
    const datos = this.orderService.getDatosFactura();

    if (datos) {
      this.datosFactura = datos;
    }
  }

  ngOnInit() {
    this.comprobanteSeleccionado = this.orderService.getComprobante();
    this.customerName = this.customerDraft.name;
    this.correo = this.customerDraft.email;
    this.telefono = this.customerDraft.phone;
    this.referencias = this.customerDraft.notes;
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) {
      return;
    }

    window.setTimeout(() => {
      if (typeof google !== 'undefined' && google.maps) {
        this.initMap();
      }
    }, 200);
  }

  confirmarPedido() {
    if (!this.customerName.trim() || !this.direccionSeleccionada.trim() || !this.telefono.trim()) {
      this.validationMessage =
        'Completa nombre, telefono y direccion para confirmar el domicilio.';
      return;
    }

    if (this.comprobanteSeleccionado === 'factura') {
      const { ruc, razonSocial, direccionFiscal, correo, telefono } =
        this.datosFactura;

      if (![ruc, razonSocial, direccionFiscal, correo, telefono].every(Boolean)) {
        this.validationMessage =
          'Completa los datos de facturacion para emitir la factura.';
        return;
      }
    }

    const order = this.orderStore.createOrder({
      items: this.items,
      subtotal: this.subtotal,
      tax: this.tax,
      total: this.total,
      type: 'delivery',
      source: 'delivery',
      customer: {
        name: this.customerName.trim(),
        phone: this.telefono.trim(),
        email: this.correo.trim() || undefined
      },
      delivery: {
        address: this.direccionSeleccionada.trim(),
        notes: this.referencias.trim() || undefined
      },
      billing: {
        type: this.comprobanteSeleccionado,
        ruc: this.datosFactura.ruc,
        businessName: this.datosFactura.razonSocial,
        fiscalAddress: this.datosFactura.direccionFiscal,
        email: this.datosFactura.correo,
        phone: this.datosFactura.telefono
      }
    });

    if (environment.whatsapp.phone.trim()) {
      this.orderStore.openWhatsApp(this.orderStore.buildBusinessWhatsAppUrl(order));
    }

    this.orderPlaced.emit(order);
    this.resetForm();
  }

  cerrar() {
    this.resetForm();
    this.closeModal.emit();
  }

  updateDatosFactura() {
    this.orderService.setDatosFactura(this.datosFactura);
  }

  private initMap() {
    const defaultLocation = { lat: -0.1807, lng: -78.4678 };
    const mapElement = document.getElementById('map');

    if (!mapElement) {
      return;
    }

    this.map = new google.maps.Map(mapElement, {
      center: defaultLocation,
      zoom: 15
    });

    this.marker = new google.maps.Marker({
      position: defaultLocation,
      map: this.map,
      draggable: true
    });

    this.mapReady = true;
    this.obtenerDireccion(defaultLocation);

    this.marker.addListener('dragend', () => {
      const position = this.marker.getPosition();
      const coords = {
        lat: position.lat(),
        lng: position.lng()
      };

      this.obtenerDireccion(coords);
    });
  }

  private obtenerDireccion(coords: { lat: number; lng: number }) {
    const geocoder = new google.maps.Geocoder();

    geocoder.geocode({ location: coords }, (results: any, status: any) => {
      if (status === 'OK' && results[0]) {
        this.direccionSeleccionada = results[0].formatted_address;
      }
    });
  }

  private resetForm() {
    this.validationMessage = '';
  }
}
