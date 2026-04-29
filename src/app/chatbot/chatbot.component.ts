import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CrmService } from '../core/services/crm.service';
import { OrderService } from '../core/services/order.service';
import { CrmContact } from '../models/crm.model';
import { ChatbotService } from '../services/chatbot.service';

interface ChatMessageView {
  sender: 'Cliente' | 'Bot';
  text: string;
}

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './chatbot.component.html',
  styleUrl: './chatbot.component.scss'
})
export class ChatbotComponent {
  isOpen = false;
  leadName = '';
  leadPhone = '';
  userInput = '';
  activeContact: CrmContact | null = null;
  messages: ChatMessageView[] = [
    {
      sender: 'Bot',
      text: 'Hola, soy el asistente de En Boca de Todos. Puedo tomar tu interes, sugerir productos y dejar seguimiento en CRM.'
    }
  ];
  quickPrompts = ['Ver menu', 'Quiero delivery', 'Retiro en local', 'Seguimiento'];

  constructor(
    private readonly chatbotService: ChatbotService,
    private readonly crmService: CrmService,
    private readonly orderService: OrderService
  ) {}

  toggleChat() {
    this.isOpen = !this.isOpen;
  }

  usePrompt(prompt: string) {
    this.userInput = prompt;
    this.sendMessage();
  }

  sendMessage() {
    const message = this.userInput.trim();

    if (!message) {
      return;
    }

    const contact = this.ensureContact(['chatbot']);
    this.messages.push({ sender: 'Cliente', text: message });
    this.crmService.recordChatMessage(contact, 'customer', message);

    const reply = this.chatbotService.generateReply(message);
    const updatedContact = this.crmService.upsertContact({
      name: this.leadName,
      phone: this.leadPhone,
      source: 'chatbot',
      tags: reply.tags,
      score: reply.leadScore
    });
    this.activeContact = updatedContact;

    if (reply.matchedProduct) {
      this.orderService.addProduct(reply.matchedProduct);
    }

    this.messages.push({ sender: 'Bot', text: reply.text });
    this.crmService.recordChatMessage(updatedContact, 'bot', reply.text, reply.intent);
    this.userInput = '';
  }

  updateLead() {
    this.activeContact = this.ensureContact(['chatbot', 'lead-web']);
  }

  private ensureContact(tags: string[]): CrmContact {
    this.activeContact = this.crmService.upsertContact({
      name: this.leadName || 'Visitante web',
      phone: this.leadPhone,
      source: 'chatbot',
      tags,
      score: this.leadPhone ? 12 : 4
    });

    return this.activeContact;
  }
}
