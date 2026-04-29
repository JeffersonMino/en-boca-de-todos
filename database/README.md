# Base de Datos CRM

Este proyecto queda funcionando con una base local persistente en:

```txt
server-data/en-boca-de-todos.db.json
```

Ese archivo permite vender una primera version demo/MVP sin depender del navegador. Para produccion multiusuario, usa `database/schema.sql` en PostgreSQL o Supabase y reemplaza el repositorio JSON del servidor por consultas SQL.

## Entidades principales

- `admin_users`, `admin_challenges`, `admin_sessions`: acceso seguro al admin con doble paso.
- `crm_contacts`: clientes, leads, VIP e historial comercial.
- `orders`, `order_items`, `order_notifications`: pedidos, detalle y notificaciones.
- `crm_conversations`, `crm_messages`: chatbot y conversaciones escalables por canal.
- `crm_opportunities`, `crm_activities`: pipeline, seguimiento, WhatsApp y actividad comercial.
- `integrations`: WhatsApp Business API, mapas, pagos, correo y futuras integraciones.
- `audit_logs`: trazabilidad de acciones criticas.

## Credenciales seed local

El seed inicial mantiene las credenciales conocidas, pero ahora se guardan hasheadas en la base local:

```txt
Usuario: admin
Clave: Boca2026!
Codigo: 250426
```

Para produccion, define variables de entorno antes de crear la base:

```txt
EBT_ADMIN_USERNAME
EBT_ADMIN_PASSWORD
EBT_ADMIN_CONFIRMATION_CODE
EBT_ADMIN_OWNER_NAME
EBT_DATABASE_FILE
```
