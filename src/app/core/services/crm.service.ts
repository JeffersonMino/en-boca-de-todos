import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  CrmActivity,
  CrmChannel,
  CrmContact,
  CrmConversation,
  CrmMessage,
  CrmMessageSender,
  CrmOpportunity,
  CrmOpportunityStage,
  CrmUpsertContactInput
} from '../../models/crm.model';
import { Order, OrderStatus } from '../../models/order.model';
import { PersistentCrmSnapshot } from '../../models/persistent-state.model';
import { ApiPersistenceService } from './api-persistence.service';

@Injectable({
  providedIn: 'root'
})
export class CrmService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly apiPersistence = inject(ApiPersistenceService);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly contactsKey = 'ebdt_crm_contacts_v1';
  private readonly conversationsKey = 'ebdt_crm_conversations_v1';
  private readonly messagesKey = 'ebdt_crm_messages_v1';
  private readonly opportunitiesKey = 'ebdt_crm_opportunities_v1';
  private readonly activitiesKey = 'ebdt_crm_activities_v1';

  private readonly contactsSubject = new BehaviorSubject<CrmContact[]>([]);
  readonly contacts$ = this.contactsSubject.asObservable();

  private readonly conversationsSubject = new BehaviorSubject<CrmConversation[]>([]);
  readonly conversations$ = this.conversationsSubject.asObservable();

  private readonly messagesSubject = new BehaviorSubject<CrmMessage[]>([]);
  readonly messages$ = this.messagesSubject.asObservable();

  private readonly opportunitiesSubject = new BehaviorSubject<CrmOpportunity[]>([]);
  readonly opportunities$ = this.opportunitiesSubject.asObservable();

  private readonly activitiesSubject = new BehaviorSubject<CrmActivity[]>([]);
  readonly activities$ = this.activitiesSubject.asObservable();

  constructor() {
    this.hydrate();
  }

  get contacts(): CrmContact[] {
    return this.contactsSubject.value;
  }

  get conversations(): CrmConversation[] {
    return this.conversationsSubject.value;
  }

  get messages(): CrmMessage[] {
    return this.messagesSubject.value;
  }

  get opportunities(): CrmOpportunity[] {
    return this.opportunitiesSubject.value;
  }

  get activities(): CrmActivity[] {
    return this.activitiesSubject.value;
  }

  refreshFromDatabase() {
    this.apiPersistence.getAdminState().subscribe((state) => {
      if (!state) {
        return;
      }

      this.applySnapshot({
        contacts: state.contacts,
        conversations: state.conversations,
        messages: state.messages,
        opportunities: state.opportunities,
        activities: state.activities
      });
    });
  }

  upsertContact(input: CrmUpsertContactInput): CrmContact {
    const now = new Date().toISOString();
    const phone = this.normalizePhone(input.phone ?? '');
    const existing = this.findContact(phone, input.email);
    const nextTags = [...new Set([...(existing?.tags ?? []), ...(input.tags ?? [])])];
    const baseScore = input.score ?? 0;

    if (existing) {
      const updated: CrmContact = {
        ...existing,
        name: input.name?.trim() || existing.name,
        phone: phone || existing.phone,
        email: input.email?.trim() || existing.email,
        source: existing.source,
        tags: nextTags,
        score: Math.min(100, existing.score + baseScore),
        stage: this.resolveStage(existing.totalOrders, existing.totalSpent, existing.score + baseScore),
        lastInteractionAt: now,
        updatedAt: now
      };

      this.setContacts(
        this.contacts.map((contact) => (contact.id === updated.id ? updated : contact))
      );
      return updated;
    }

    const contact: CrmContact = {
      id: this.generateId('crm-contact'),
      name: input.name?.trim() || 'Visitante web',
      phone: phone || undefined,
      email: input.email?.trim() || undefined,
      source: input.source,
      stage: 'lead',
      tags: nextTags,
      score: Math.min(100, 10 + baseScore),
      totalOrders: 0,
      totalSpent: 0,
      lastInteractionAt: now,
      createdAt: now,
      updatedAt: now
    };

    this.setContacts([contact, ...this.contacts]);
    return contact;
  }

  recordChatMessage(
    contact: CrmContact,
    sender: CrmMessageSender,
    text: string,
    intent?: string
  ): CrmMessage {
    const conversation = this.ensureConversation(contact, 'chatbot', 'Asistente comercial');
    const message = this.createMessage(conversation.id, contact.id, sender, text, intent);

    this.setMessages([message, ...this.messages]);
    this.touchConversation(conversation.id, text, sender === 'customer' ? 'waiting' : 'open');

    if (sender === 'customer') {
      this.addActivity({
        contactId: contact.id,
        type: 'message',
        channel: 'chatbot',
        title: `Mensaje de ${contact.name}`,
        detail: text
      });
    }

    return message;
  }

  registerOrder(order: Order): CrmContact {
    const alreadyRegistered = this.opportunities.some(
      (opportunity) => opportunity.orderId === order.id
    );
    const contact = this.upsertContact({
      name: order.customer.name,
      phone: order.customer.phone,
      email: order.customer.email,
      source: 'order',
      tags: [order.type, 'pedido'],
      score: 25
    });

    if (alreadyRegistered) {
      this.upsertOpportunityFromOrder(contact, order, this.stageForStatus(order.status));
      return contact;
    }

    const updatedContact: CrmContact = {
      ...contact,
      totalOrders: contact.totalOrders + 1,
      totalSpent: contact.totalSpent + order.total,
      lastOrderId: order.id,
      stage: this.resolveStage(contact.totalOrders + 1, contact.totalSpent + order.total, contact.score),
      updatedAt: new Date().toISOString()
    };

    this.setContacts(
      this.contacts.map((item) => (item.id === updatedContact.id ? updatedContact : item))
    );
    this.upsertOpportunityFromOrder(updatedContact, order, 'ordered');
    this.addActivity({
      contactId: updatedContact.id,
      orderId: order.id,
      type: 'order',
      channel: 'order',
      title: `Pedido ${order.sequential}`,
      detail: `${order.type === 'delivery' ? 'Domicilio' : 'Retiro/local'} por $${order.total.toFixed(2)}`
    });

    return updatedContact;
  }

  registerOrderStatus(order: Order, statusLabel: string) {
    const contact = this.upsertContact({
      name: order.customer.name,
      phone: order.customer.phone,
      email: order.customer.email,
      source: 'order',
      tags: [order.type, statusLabel],
      score: this.scoreForStatus(order.status)
    });

    this.upsertOpportunityFromOrder(contact, order, this.stageForStatus(order.status));
    this.addActivity({
      contactId: contact.id,
      orderId: order.id,
      type: 'status',
      channel: 'admin',
      title: `Estado ${order.sequential}`,
      detail: `El pedido paso a ${statusLabel}.`
    });
  }

  buildContactWhatsAppUrl(contact: CrmContact, message: string): string | null {
    if (!contact.phone) {
      return null;
    }

    return `https://wa.me/${contact.phone}?text=${encodeURIComponent(message)}`;
  }

  recordOrderWhatsApp(order: Order, detail: string) {
    const contact = this.upsertContact({
      name: order.customer.name,
      phone: order.customer.phone,
      email: order.customer.email,
      source: 'whatsapp',
      tags: ['whatsapp', order.type],
      score: 6
    });

    this.addActivity({
      contactId: contact.id,
      orderId: order.id,
      type: 'whatsapp',
      channel: 'whatsapp',
      title: `WhatsApp ${order.sequential}`,
      detail
    });
  }

  recordContactWhatsApp(contact: CrmContact, detail: string) {
    this.addActivity({
      contactId: contact.id,
      type: 'whatsapp',
      channel: 'whatsapp',
      title: `WhatsApp ${contact.name}`,
      detail
    });
  }

  getContactMessages(contactId: string): CrmMessage[] {
    return this.messages
      .filter((message) => message.contactId === contactId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  private ensureConversation(
    contact: CrmContact,
    channel: CrmChannel,
    subject: string
  ): CrmConversation {
    const existing = this.conversations.find(
      (conversation) =>
        conversation.contactId === contact.id &&
        conversation.channel === channel &&
        conversation.status !== 'closed'
    );

    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const conversation: CrmConversation = {
      id: this.generateId('crm-conv'),
      contactId: contact.id,
      channel,
      status: 'open',
      subject,
      lastMessage: '',
      createdAt: now,
      updatedAt: now
    };

    this.setConversations([conversation, ...this.conversations]);
    return conversation;
  }

  private touchConversation(
    conversationId: string,
    lastMessage: string,
    status: CrmConversation['status']
  ) {
    const now = new Date().toISOString();
    this.setConversations(
      this.conversations.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, lastMessage, status, updatedAt: now }
          : conversation
      )
    );
  }

  private createMessage(
    conversationId: string,
    contactId: string,
    sender: CrmMessageSender,
    text: string,
    intent?: string
  ): CrmMessage {
    return {
      id: this.generateId('crm-msg'),
      conversationId,
      contactId,
      sender,
      text,
      intent,
      createdAt: new Date().toISOString()
    };
  }

  private upsertOpportunityFromOrder(
    contact: CrmContact,
    order: Order,
    stage: CrmOpportunityStage
  ) {
    const now = new Date().toISOString();
    const existing = this.opportunities.find((item) => item.orderId === order.id);
    const opportunity: CrmOpportunity = {
      id: existing?.id ?? this.generateId('crm-opp'),
      contactId: contact.id,
      orderId: order.id,
      title: `Pedido ${order.sequential}`,
      stage,
      value: order.total,
      probability: this.probabilityForStage(stage),
      orderType: order.type,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    this.setOpportunities(
      existing
        ? this.opportunities.map((item) => (item.id === opportunity.id ? opportunity : item))
        : [opportunity, ...this.opportunities]
    );
  }

  private addActivity(
    input: Omit<CrmActivity, 'id' | 'createdAt'>
  ): CrmActivity {
    const activity: CrmActivity = {
      ...input,
      id: this.generateId('crm-act'),
      createdAt: new Date().toISOString()
    };

    this.setActivities([activity, ...this.activities].slice(0, 150));
    return activity;
  }

  private findContact(phone?: string, email?: string): CrmContact | undefined {
    return this.contacts.find((contact) => {
      const samePhone = phone && contact.phone === phone;
      const sameEmail =
        email && contact.email?.toLowerCase() === email.trim().toLowerCase();
      return !!samePhone || !!sameEmail;
    });
  }

  private stageForStatus(status: OrderStatus): CrmOpportunityStage {
    if (status === 'delivered') {
      return 'won';
    }

    if (status === 'cancelled') {
      return 'lost';
    }

    return 'ordered';
  }

  private scoreForStatus(status: OrderStatus): number {
    switch (status) {
      case 'confirmed':
        return 5;
      case 'preparing':
        return 8;
      case 'dispatched':
        return 10;
      case 'delivered':
        return 18;
      case 'cancelled':
        return -15;
      default:
        return 2;
    }
  }

  private probabilityForStage(stage: CrmOpportunityStage): number {
    switch (stage) {
      case 'new':
        return 20;
      case 'qualified':
        return 45;
      case 'ordered':
        return 80;
      case 'won':
        return 100;
      case 'lost':
        return 0;
      default:
        return 0;
    }
  }

  private resolveStage(totalOrders: number, totalSpent: number, score: number): CrmContact['stage'] {
    if (totalOrders >= 4 || totalSpent >= 80 || score >= 80) {
      return 'vip';
    }

    if (totalOrders >= 1 || score >= 35) {
      return 'active';
    }

    return 'lead';
  }

  private hydrate() {
    if (!this.isBrowser) {
      return;
    }

    this.setContacts(this.readStorage<CrmContact[]>(this.contactsKey), false);
    this.setConversations(
      this.readStorage<CrmConversation[]>(this.conversationsKey),
      false
    );
    this.setMessages(this.readStorage<CrmMessage[]>(this.messagesKey), false);
    this.setOpportunities(
      this.readStorage<CrmOpportunity[]>(this.opportunitiesKey),
      false
    );
    this.setActivities(this.readStorage<CrmActivity[]>(this.activitiesKey), false);
  }

  private readStorage<T>(key: string): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : ([] as T);
    } catch {
      return [] as T;
    }
  }

  private applySnapshot(snapshot: PersistentCrmSnapshot) {
    this.setContacts(snapshot.contacts, false);
    this.setConversations(snapshot.conversations, false);
    this.setMessages(snapshot.messages, false);
    this.setOpportunities(snapshot.opportunities, false);
    this.setActivities(snapshot.activities, false);
  }

  private setContacts(contacts: CrmContact[], syncRemote = true) {
    const sorted = [...contacts].sort(
      (a, b) =>
        new Date(b.lastInteractionAt).getTime() -
        new Date(a.lastInteractionAt).getTime()
    );
    this.contactsSubject.next(sorted);
    this.persist(this.contactsKey, sorted);
    this.syncRemote(syncRemote);
  }

  private setConversations(conversations: CrmConversation[], syncRemote = true) {
    const sorted = [...conversations].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    this.conversationsSubject.next(sorted);
    this.persist(this.conversationsKey, sorted);
    this.syncRemote(syncRemote);
  }

  private setMessages(messages: CrmMessage[], syncRemote = true) {
    this.messagesSubject.next(messages);
    this.persist(this.messagesKey, messages);
    this.syncRemote(syncRemote);
  }

  private setOpportunities(opportunities: CrmOpportunity[], syncRemote = true) {
    const sorted = [...opportunities].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    this.opportunitiesSubject.next(sorted);
    this.persist(this.opportunitiesKey, sorted);
    this.syncRemote(syncRemote);
  }

  private setActivities(activities: CrmActivity[], syncRemote = true) {
    const sorted = [...activities].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    this.activitiesSubject.next(sorted);
    this.persist(this.activitiesKey, sorted);
    this.syncRemote(syncRemote);
  }

  private persist<T>(key: string, value: T) {
    if (this.isBrowser) {
      localStorage.setItem(key, JSON.stringify(value));
    }
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

  private generateId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private syncRemote(shouldSync: boolean) {
    if (!shouldSync) {
      return;
    }

    this.apiPersistence.saveCrmSnapshot({
      contacts: this.contacts,
      conversations: this.conversations,
      messages: this.messages,
      opportunities: this.opportunities,
      activities: this.activities
    }).subscribe();
  }
}
