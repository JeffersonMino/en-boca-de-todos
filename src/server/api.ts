import { Router, type NextFunction, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import type {
  CrmActivity,
  CrmContact,
  CrmConversation,
  CrmMessage,
  CrmOpportunity
} from '../app/models/crm.model';
import type { OrderNotification } from '../app/models/order-notification.model';
import type { Order } from '../app/models/order.model';
import {
  appendAudit,
  createId,
  hashSecret,
  mergeEntityList,
  mutateDatabase,
  nowIso,
  readDatabase,
  upsertEntity
} from './app-database';

interface Entity {
  id: string;
}

interface ApiBody {
  [key: string]: unknown;
}

interface ApiResponseBody {
  [key: string]: unknown;
}

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  const database = readDatabase();

  res.json({
    ok: true,
    databaseVersion: database.version,
    updatedAt: database.meta.updatedAt
  });
});

apiRouter.post('/admin/login', (req, res) => {
  const body = requestBody(req);
  const username = textValue(body['username']).trim();
  const password = textValue(body['password']);
  const database = readDatabase();
  const admin = database.admins.find(
    (account) => account.active && account.username === username
  );

  if (!admin || !secretsMatch(hashSecret(password, admin.passwordSalt), admin.passwordHash)) {
    res.status(401).json({
      success: false,
      message: 'Usuario o clave incorrectos.'
    });
    return;
  }

  const challenge = {
    id: createId('adm-challenge'),
    adminId: admin.id,
    username: admin.username,
    attempts: 0,
    createdAt: nowIso(),
    expiresAt: addMinutes(5)
  };

  mutateDatabase((currentDatabase) => {
    currentDatabase.adminChallenges = [
      challenge,
      ...currentDatabase.adminChallenges.filter((item) => isFuture(item.expiresAt))
    ];
    appendAudit(currentDatabase, {
      actorType: 'admin',
      actorId: admin.id,
      action: 'admin.login.challenge_created',
      entity: 'admin',
      entityId: admin.id,
      detail: 'Credenciales validadas, codigo de confirmacion requerido.'
    });
  });

  res.json({
    success: true,
    challengeId: challenge.id,
    ownerName: admin.ownerName,
    message: 'Clave correcta. Ingresa el codigo de confirmacion.'
  });
});

apiRouter.post('/admin/confirm', (req, res) => {
  const body = requestBody(req);
  const challengeId = textValue(body['challengeId']);
  const code = textValue(body['code']);
  let response: { status: number; body: ApiResponseBody } = {
    status: 401,
    body: {
      success: false,
      message: 'Codigo incorrecto o expirado.'
    }
  };

  mutateDatabase((database) => {
    const challenge = database.adminChallenges.find((item) => item.id === challengeId);
    const admin = challenge
      ? database.admins.find((account) => account.id === challenge.adminId && account.active)
      : undefined;

    if (!challenge || !admin || !isFuture(challenge.expiresAt)) {
      database.adminChallenges = database.adminChallenges.filter(
        (item) => item.id !== challengeId && isFuture(item.expiresAt)
      );
      return;
    }

    if (challenge.attempts >= 4) {
      database.adminChallenges = database.adminChallenges.filter(
        (item) => item.id !== challengeId
      );
      return;
    }

    if (
      !secretsMatch(
        hashSecret(code, admin.confirmationCodeSalt),
        admin.confirmationCodeHash
      )
    ) {
      challenge.attempts += 1;
      return;
    }

    const session = {
      id: createId('adm-session'),
      adminId: admin.id,
      token: createId('adm-token'),
      createdAt: nowIso(),
      expiresAt: addHours(8)
    };

    database.adminChallenges = database.adminChallenges.filter(
      (item) => item.id !== challengeId
    );
    database.adminSessions = [
      session,
      ...database.adminSessions.filter((item) => isFuture(item.expiresAt))
    ];
    appendAudit(database, {
      actorType: 'admin',
      actorId: admin.id,
      action: 'admin.login.confirmed',
      entity: 'admin_session',
      entityId: session.id,
      detail: 'Sesion administrativa iniciada.'
    });
    response = {
      status: 200,
      body: {
        success: true,
        token: session.token,
        ownerName: admin.ownerName,
        expiresAt: session.expiresAt,
        message: `Bienvenido, ${admin.ownerName}.`
      }
    };
  });

  res.status(response.status).json(response.body);
});

apiRouter.post('/admin/logout', requireAdmin, (req, res) => {
  const token = bearerToken(req);

  mutateDatabase((database) => {
    database.adminSessions = database.adminSessions.filter(
      (session) => session.token !== token
    );
  });

  res.json({ success: true });
});

apiRouter.get('/admin/state', requireAdmin, (_req, res) => {
  const database = readDatabase();

  res.json({
    databaseVersion: database.version,
    updatedAt: database.meta.updatedAt,
    orders: database.orders,
    notifications: database.notifications,
    contacts: database.contacts,
    conversations: database.conversations,
    messages: database.messages,
    opportunities: database.opportunities,
    activities: database.activities
  });
});

apiRouter.post('/orders', (req, res) => {
  const body = requestBody(req);
  const order = entityValue<Order>(body['order']);
  const notification = entityValue<OrderNotification>(body['notification']);
  const notifications = arrayValue<OrderNotification>(body['notifications']);

  if (!order) {
    res.status(400).json({
      success: false,
      message: 'Pedido invalido.'
    });
    return;
  }

  mutateDatabase((database) => {
    database.orders = upsertEntity(database.orders, order, 'updatedAt');

    database.notifications = mergeEntityList(
      database.notifications,
      notification ? [notification, ...notifications] : notifications,
      'createdAt'
    );

    appendAudit(database, {
      actorType: 'customer',
      action: 'order.created',
      entity: 'order',
      entityId: order.id,
      detail: `Pedido ${order.sequential} registrado desde el canal ${order.source}.`
    });
  });

  res.json({ success: true });
});

apiRouter.patch('/admin/orders/:id/status', requireAdmin, (req, res) => {
  const body = requestBody(req);
  const order = entityValue<Order>(body['order']);
  const notification = entityValue<OrderNotification>(body['notification']);
  const notifications = arrayValue<OrderNotification>(body['notifications']);

  if (!order || order.id !== req.params['id']) {
    res.status(400).json({
      success: false,
      message: 'Actualizacion de pedido invalida.'
    });
    return;
  }

  mutateDatabase((database) => {
    database.orders = upsertEntity(database.orders, order, 'updatedAt');

    database.notifications = mergeEntityList(
      database.notifications,
      notification ? [notification, ...notifications] : notifications,
      'createdAt'
    );

    appendAudit(database, {
      actorType: 'admin',
      actorId: adminId(res),
      action: 'order.status_updated',
      entity: 'order',
      entityId: order.id,
      detail: `Estado actualizado a ${order.status}.`
    });
  });

  res.json({ success: true });
});

apiRouter.patch('/admin/notifications/:id/read', requireAdmin, (req, res) => {
  const notificationId = req.params['id'];

  mutateDatabase((database) => {
    database.notifications = database.notifications.map((notification) =>
      notification.id === notificationId
        ? { ...notification, read: true }
        : notification
    );
  });

  res.json({ success: true });
});

apiRouter.post('/crm/snapshot', (req, res) => {
  const body = requestBody(req);

  mutateDatabase((database) => {
    database.contacts = mergeEntityList(
      database.contacts,
      arrayValue<CrmContact>(body['contacts']),
      'updatedAt'
    );
    database.conversations = mergeEntityList(
      database.conversations,
      arrayValue<CrmConversation>(body['conversations']),
      'updatedAt'
    );
    database.messages = mergeEntityList(
      database.messages,
      arrayValue<CrmMessage>(body['messages']),
      'createdAt'
    );
    database.opportunities = mergeEntityList(
      database.opportunities,
      arrayValue<CrmOpportunity>(body['opportunities']),
      'updatedAt'
    );
    database.activities = mergeEntityList(
      database.activities,
      arrayValue<CrmActivity>(body['activities']),
      'createdAt'
    ).slice(0, 500);
  });

  res.json({ success: true });
});

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = bearerToken(req);

  if (!token) {
    res.status(401).json({ success: false, message: 'Token requerido.' });
    return;
  }

  const database = readDatabase();
  const session = database.adminSessions.find(
    (item) => item.token === token && isFuture(item.expiresAt)
  );

  if (!session) {
    res.status(401).json({ success: false, message: 'Sesion expirada.' });
    return;
  }

  res.locals['adminId'] = session.adminId;
  next();
}

function adminId(res: Response): string {
  const value = res.locals['adminId'];
  return typeof value === 'string' ? value : 'admin';
}

function bearerToken(req: Request): string {
  const header = req.header('authorization') ?? '';
  const prefix = 'bearer ';

  if (!header.toLowerCase().startsWith(prefix)) {
    return '';
  }

  return header.slice(prefix.length).trim();
}

function requestBody(req: Request): ApiBody {
  return req.body && typeof req.body === 'object'
    ? (req.body as ApiBody)
    : {};
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function entityValue<T extends Entity>(value: unknown): T | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const entity = value as Entity;
  return typeof entity.id === 'string' ? (value as T) : null;
}

function arrayValue<T extends Entity>(value: unknown): T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is T => !!entityValue<T>(item));
}

function addMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function addHours(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function isFuture(date: string): boolean {
  return new Date(date).getTime() > Date.now();
}

function secretsMatch(incomingHash: string, expectedHash: string): boolean {
  const incoming = Buffer.from(incomingHash, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');

  return incoming.length === expected.length && timingSafeEqual(incoming, expected);
}
