// Andmebaasi skeem (JS-moodulina, et Netlify funktsioonide bundler selle kindlasti kaasa paneks).
// Vt kommentaare SQL-i sees. Muuda skeemi AINULT lisavate, idempotentsete lausetega
// (CREATE … IF NOT EXISTS, ALTER TABLE … ADD COLUMN IF NOT EXISTS), sest see käivitatakse igal külmkäivitusel.
export const SCHEMA_SQL = `
-- ÄGE veebipoe andmebaas (PostgreSQL: tootmises Netlify DB / Neon, kohalikult PGlite).
-- Skeem on idempotentne: seda võib käivitada iga külmkäivituse ajal (vt db.mjs → migrate()).
-- Rahasummad on alati SENTIDES (integer). Ajad on timestamptz (UTC); kuupäevaarvutused
-- tehakse Europe/Tallinn ajavööndis rakenduse koodis (vt _lib/time.mjs).

CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1001;

CREATE TABLE IF NOT EXISTS orders (
  id                 text PRIMARY KEY,                       -- juhuslik UUID
  number             text NOT NULL UNIQUE,                   -- nt "AGE-1001" (kliendile ja haldusele)
  public_token       text NOT NULL UNIQUE,                   -- 32+ märgiline juhuslik tunnus kinnituslehe jaoks
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  -- klient
  customer_name      text NOT NULL,
  customer_email     text NOT NULL,
  customer_phone     text NOT NULL,
  newsletter         boolean NOT NULL DEFAULT false,
  age_confirmed      boolean NOT NULL DEFAULT false,

  -- tooted: hetktõmmis tellimuse loomise hetkel (hinnad serverist, mitte brauserist)
  -- [{ id, name, qty, unitCents, totalCents, includes: [{ id, name, qty }] }]
  items              jsonb NOT NULL,
  subtotal_cents     integer NOT NULL,
  discount_code      text,
  discount_cents     integer NOT NULL DEFAULT 0,
  shipping_cents     integer NOT NULL,
  total_cents        integer NOT NULL,
  currency           text NOT NULL DEFAULT 'eur',

  -- tarne: salvestatakse tellimisel ja seda EI muudeta hiljem (ka haldusest mitte)
  carrier            text NOT NULL,                          -- 'omniva' | 'smartpost' | 'dpd'
  carrier_name       text NOT NULL,
  locker_id          text,                                   -- operaatori püsiv automaadi ID
  locker_name        text NOT NULL,
  locker_address     text,
  locker_city        text,

  -- makse (Stripe)
  payment_status     text NOT NULL DEFAULT 'pending'
                     CHECK (payment_status IN ('pending','processing','paid','failed','expired','refunded','partially_refunded')),
  stripe_session_id  text UNIQUE,
  stripe_session_url text,
  stripe_session_expires_at timestamptz,
  stripe_payment_intent_id text,
  paid_at            timestamptz,
  amount_paid_cents  integer,
  refunded_cents     integer NOT NULL DEFAULT 0,

  -- täitmine (eraldi makse staatusest)
  fulfillment_status text NOT NULL DEFAULT 'new'
                     CHECK (fulfillment_status IN ('new','packed','shipped','delivered','cancelled')),
  packed_at          timestamptz,
  shipped_at         timestamptz,
  tracking_code      text,
  notes              text NOT NULL DEFAULT '',

  -- kõrvalmõjud, mis tohivad juhtuda ainult üks kord
  inventory_applied_at   timestamptz,
  confirmation_sent_at   timestamptz,
  admin_notified_at      timestamptz
);

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON orders (payment_status);
CREATE INDEX IF NOT EXISTS orders_fulfillment_status_idx ON orders (fulfillment_status);
CREATE INDEX IF NOT EXISTS orders_payment_intent_idx ON orders (stripe_payment_intent_id);

-- Stripe'i sündmused: iga sündmus töödeldakse täpselt üks kord (id on Stripe'i evt_…).
CREATE TABLE IF NOT EXISTS stripe_events (
  id           text PRIMARY KEY,
  type         text NOT NULL,
  order_id     text,
  received_at  timestamptz NOT NULL DEFAULT now()
);

-- Laoseis mängude kaupa (komplektid ei ole laoartiklid — need koosnevad mängudest).
CREATE TABLE IF NOT EXISTS inventory (
  game_id     text PRIMARY KEY,                              -- 'mida-viiu' | 'oled-semu' | 'vigur'
  stock       integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Iga laomuutus. Tellimusest tulenev muutus on unikaalne (order_id, game_id, reason),
-- mistõttu korduv töötlemine ei saa laoseisu teist korda vähendada.
CREATE TABLE IF NOT EXISTS inventory_movements (
  id          bigserial PRIMARY KEY,
  game_id     text NOT NULL,
  delta       integer NOT NULL,
  reason      text NOT NULL,                                 -- 'sale' | 'adjust' | 'restock' | 'return'
  order_id    text,
  note        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_movements_order_uniq
  ON inventory_movements (order_id, game_id, reason) WHERE order_id IS NOT NULL;

-- Taganemisavaldused (veebivormist).
CREATE TABLE IF NOT EXISTS withdrawals (
  id             text PRIMARY KEY,
  reference      text NOT NULL UNIQUE,                       -- nt "TAG-7K3M9Q" (kliendile kinnituseks)
  created_at     timestamptz NOT NULL DEFAULT now(),
  customer_name  text NOT NULL,
  customer_email text NOT NULL,
  order_number   text NOT NULL,
  received_date  date,
  items          text NOT NULL DEFAULT '',
  message        text NOT NULL DEFAULT '',
  status         text NOT NULL DEFAULT 'received'
                 CHECK (status IN ('received','in_progress','refunded','rejected')),
  ack_sent_at    timestamptz,
  admin_notes    text NOT NULL DEFAULT ''
);

-- Pakiautomaatide viimane toimiv nimekiri vedaja kaupa (allika vea korral kasutatakse seda).
CREATE TABLE IF NOT EXISTS locker_cache (
  carrier     text PRIMARY KEY,
  lockers     jsonb NOT NULL,
  fetched_at  timestamptz NOT NULL DEFAULT now()
);
`;
