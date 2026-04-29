import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type {
  CrmActivity,
  CrmContact,
  CrmConversation,
  CrmMessage,
  CrmOpportunity
} from '../app/models/crm.model';
import type { OrderNotification } from '../app/models/order-notification.model';
import type { Order } from '../app/models/order.model';

export interface AdminAccount {
  id: string;
  username: string;
  ownerName: string;
  role: 'owner' | 'manager';
  passwordHash: string;
  passwordSalt: string;
  confirmationCodeHash: string;
  confirmationCodeSalt: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminChallenge {
  id: string;
  adminId: string;
  username: string;
  attempts: number;
  createdAt: string;
  expiresAt: string;
}

export interface AdminSession {
  id: string;
  adminId: string;
  token: string;
  createdAt: string;
  expiresAt: string;
}

export interface IntegrationAccount {
  id: string;
  provider: 'whatsapp' | 'maps' | 'payment' | 'email' | 'crm-export';
  label: string;
  status: 'pending' | 'active' | 'disabled';
  config: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  actorType: 'system' | 'admin' | 'customer';
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string;
  detail: string;
  createdAt: string;
}

export interface AppDatabase {
  version: number;
  meta: {
    createdAt: string;
    updatedAt: string;
    restaurantName: string;
    country: string;
    currency: string;
  };
  admins: AdminAccount[];
  adminChallenges: AdminChallenge[];
  adminSessions: AdminSession[];
  orders: Order[];
  notifications: OrderNotification[];
  contacts: CrmContact[];
  conversations: CrmConversation[];
  messages: CrmMessage[];
  opportunities: CrmOpportunity[];
  activities: CrmActivity[];
  integrations: IntegrationAccount[];
  auditLogs: AuditLog[];
}

const databaseFilePath =
  process.env['EBT_DATABASE_FILE'] ??
  resolve(process.cwd(), 'server-data', 'en-boca-de-todos.db.json');

const databaseVersion = 1;

export function getDatabaseFilePath(): string {
  return databaseFilePath;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function hashSecret(value: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

export function createId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export function readDatabase(): AppDatabase {
  ensureDatabaseFile();

  try {
    const raw = readFileSync(databaseFilePath, 'utf-8');
    return normalizeDatabase(JSON.parse(raw) as Partial<AppDatabase>);
  } catch {
    const database = createDefaultDatabase();
    writeDatabase(database);
    return database;
  }
}

export function writeDatabase(database: AppDatabase): void {
  const prepared = normalizeDatabase(database);
  prepared.meta.updatedAt = nowIso();
  mkdirSync(dirname(databaseFilePath), { recursive: true });
  writeFileSync(databaseFilePath, JSON.stringify(prepared, null, 2), 'utf-8');
}

export function mutateDatabase<T>(mutator: (database: AppDatabase) => T): T {
  const database = readDatabase();
  const result = mutator(database);
  writeDatabase(database);
  return result;
}

export function appendAudit(
  database: AppDatabase,
  entry: Omit<AuditLog, 'id' | 'createdAt'>
): AuditLog {
  const auditLog: AuditLog = {
    ...entry,
    id: createId('audit'),
    createdAt: nowIso()
  };

  database.auditLogs = [auditLog, ...database.auditLogs].slice(0, 1000);
  return auditLog;
}

export function upsertEntity<T extends { id: string }>(
  current: T[],
  entity: T,
  dateField: keyof T = 'id'
): T[] {
  const existing = current.find((item) => item.id === entity.id);

  if (!existing) {
    return [entity, ...current];
  }

  if (dateField !== 'id') {
    const incomingTime = new Date(String(entity[dateField] ?? '')).getTime();
    const existingTime = new Date(String(existing[dateField] ?? '')).getTime();

    if (Number.isFinite(existingTime) && incomingTime < existingTime) {
      return current;
    }
  }

  return current.map((item) => (item.id === entity.id ? entity : item));
}

export function mergeEntityList<T extends { id: string }>(
  current: T[],
  incoming: T[],
  dateField: keyof T = 'id'
): T[] {
  return incoming.reduce(
    (next, entity) => upsertEntity(next, entity, dateField),
    current
  );
}

function ensureDatabaseFile(): void {
  if (existsSync(databaseFilePath)) {
    return;
  }

  writeDatabase(createDefaultDatabase());
}

function createDefaultDatabase(): AppDatabase {
  const createdAt = nowIso();
  const adminUsername = process.env['EBT_ADMIN_USERNAME'] ?? 'admin';
  const adminPassword = process.env['EBT_ADMIN_PASSWORD'];
  const confirmationCode = process.env['EBT_ADMIN_CONFIRMATION_CODE'];
  const ownerName = process.env['EBT_ADMIN_OWNER_NAME'] ?? 'Administrador principal';
  const passwordSalt = process.env['EBT_ADMIN_PASSWORD_SALT'] ?? 'ebdt-local-admin-password-salt';
  const confirmationCodeSalt =
    process.env['EBT_ADMIN_CONFIRMATION_SALT'] ?? 'ebdt-local-admin-code-salt';
  const passwordHash =
    adminPassword
      ? hashSecret(adminPassword, passwordSalt)
      : '9125d448ded92752af12dba55ce3057bf22fe7aa7226e7a7e983e92c89ee6c5c';
  const confirmationCodeHash =
    confirmationCode
      ? hashSecret(confirmationCode, confirmationCodeSalt)
      : 'a3d83d0194e432b526af2d682f39f6231e5417e023eddc3b95a0781e045ed85f';

  return {
    version: databaseVersion,
    meta: {
      createdAt,
      updatedAt: createdAt,
      restaurantName: 'EN BOCA DE TODOS',
      country: 'Ecuador',
      currency: 'USD'
    },
    admins: [
      {
        id: 'admin-primary',
        username: adminUsername,
        ownerName,
        role: 'owner',
        passwordHash,
        passwordSalt,
        confirmationCodeHash,
        confirmationCodeSalt,
        active: true,
        createdAt,
        updatedAt: createdAt
      }
    ],
    adminChallenges: [],
    adminSessions: [],
    orders: [],
    notifications: [],
    contacts: [],
    conversations: [],
    messages: [],
    opportunities: [],
    activities: [],
    integrations: [
      {
        id: 'integration-whatsapp-business',
        provider: 'whatsapp',
        label: 'WhatsApp Business API',
        status: 'pending',
        config: {
          mode: 'wa.me-link',
          phone: ''
        },
        createdAt,
        updatedAt: createdAt
      }
    ],
    auditLogs: [
      {
        id: createId('audit'),
        actorType: 'system',
        action: 'database.created',
        entity: 'database',
        detail: 'Base local CRM creada automaticamente.',
        createdAt
      }
    ]
  };
}

function normalizeDatabase(partial: Partial<AppDatabase>): AppDatabase {
  const fallback = createDefaultDatabase();
  const meta = {
    ...fallback.meta,
    ...partial.meta
  };

  return {
    version: partial.version ?? databaseVersion,
    meta,
    admins: arrayOrDefault(partial.admins, fallback.admins),
    adminChallenges: arrayOrDefault(partial.adminChallenges),
    adminSessions: arrayOrDefault(partial.adminSessions),
    orders: arrayOrDefault(partial.orders),
    notifications: arrayOrDefault(partial.notifications),
    contacts: arrayOrDefault(partial.contacts),
    conversations: arrayOrDefault(partial.conversations),
    messages: arrayOrDefault(partial.messages),
    opportunities: arrayOrDefault(partial.opportunities),
    activities: arrayOrDefault(partial.activities),
    integrations: arrayOrDefault(partial.integrations, fallback.integrations),
    auditLogs: arrayOrDefault(partial.auditLogs, fallback.auditLogs)
  };
}

function arrayOrDefault<T>(value?: T[], fallback: T[] = []): T[] {
  return Array.isArray(value) ? value : fallback;
}
