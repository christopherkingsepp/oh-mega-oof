// Andmebaasi skeem (JS-moodulina, et Netlify funktsioonide bundler selle kindlasti kaasa paneks).
// Vt kommentaare SQL-i sees. Muuda skeemi AINULT lisavate, idempotentsete lausetega
// (CREATE … IF NOT EXISTS, ALTER TABLE … ADD COLUMN IF NOT EXISTS), sest see käivitatakse igal külmkäivitusel.
export const SCHEMA_SQL = `
-- ÄGE veebipoe andmebaas (PostgreSQL: tootmises Netlify DB / Neon, kohalikult PGlite).
-- Skeem on idempotentne: seda võib käivitada iga külmkäivituse ajal (vt db.mjs → migrate()).
-- Rahasummad on alati SENTIDES (integer). Ajad on timestamptz (UTC); kuupäevaarvutused
-- tehakse Europe/Tallinn ajavööndis rakenduse koodis (vt _lib/time.mjs).

-- Vana tellimuse numbri jada (AGE-1001 …). Enam ei kasutata — number tuleb tabelist order_counters
-- (vt allpool). Jääb alles, sest skeemi muudetakse ainult lisavate lausetega.
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1001;

CREATE TABLE IF NOT EXISTS orders (
  id                 text PRIMARY KEY,                       -- juhuslik UUID
  number             text NOT NULL UNIQUE,                   -- nt "ÄGE-2026-0001" (kliendile ja haldusele), vt order_counters
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

-- Tellimuste ja maksete taustasüsteemi lisad (ainult lisavad, idempotentsed laused).
-- Sündmus loetakse töödelduks alles siis, kui processed_at on seatud: kui töötlemine katkeb,
-- kordab Stripe sündmust ja see töödeldakse uuesti (olekuvalvurid hoiavad ära topelttegevused).
ALTER TABLE stripe_events ADD COLUMN IF NOT EXISTS processed_at timestamptz;
-- Taganemisavalduse teavitus omanikule (ühekordne).
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS admin_notified_at timestamptz;
CREATE INDEX IF NOT EXISTS withdrawals_created_at_idx ON withdrawals (created_at DESC);

-- ---------------------------------------------------------------------------
-- Tellimuse number ÄGE-AAAA-NNNN (testmaksetel TEST-ÄGE-AAAA-NNNN).
--   AAAA = loomise aasta Tallinna aja järgi, NNNN = järjekorranumber selle aasta sees.
--   Loendur on eraldi päris- ja testtellimustele (scope 'live' | 'test') ja aasta kaupa.
--   Number antakse tellimuse esimesel salvestamisel SAMAS lauses, mis loendurit suurendab
--   (INSERT … ON CONFLICT DO UPDATE … RETURNING → üks lause = üks atomaarne tehing, töötab ka
--   Neoni HTTP-draiveriga). Number on püsiv: makse kordus, webhooki kordus, kirja uuesti
--   saatmine jne numbrit ei muuda. Tühistatud/aegunud tellimuste numbreid ei kasutata uuesti.
CREATE TABLE IF NOT EXISTS order_counters (
  scope       text NOT NULL CHECK (scope IN ('live','test')),
  year        integer NOT NULL,
  last_value  integer NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, year)
);
-- Testtellimus = loodud Stripe'i testvõtmega (sk_test_ / rk_test_) või kohalikus näidisrežiimis.
-- Testtellimused ei muuda laoseisu ega lähe statistikasse.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS number_year integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS number_seq integer;
-- Vana number (nt AGE-1001) enne üleminekut uuele vormingule — jääb otsitavaks.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS legacy_number text;
-- Omanik pani tellimuse mängud halduses lattu tagasi (ühekordne; vt admin-inventory.mjs).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS restocked_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS orders_number_year_seq_uniq ON orders (is_test, number_year, number_seq);
CREATE INDEX IF NOT EXISTS orders_test_created_idx ON orders (is_test, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_legacy_number_idx ON orders (legacy_number) WHERE legacy_number IS NOT NULL;
-- Numbrita read (ainult enne üleminekut) — et alloleva ülemineku kontroll igal külmkäivitusel oleks odav.
CREATE INDEX IF NOT EXISTS orders_unnumbered_idx ON orders (created_at) WHERE number_seq IS NULL;

-- Üleminek: vana numbriga read (number_seq puudub) saavad uue numbri loomise aja järjekorras,
-- eraldi päris/test ja Tallinna aasta kaupa. Vana number jääb veergu legacy_number. Seosed
-- (stripe_events, inventory_movements) on tellimuse id järgi; tekstina salvestatud number
-- (withdrawals.order_number, müügi laoliikumise selgitus) uuendatakse samas lauses.
-- Vanadel ridadel on is_test = tõene, v.a kui makse käis päris Stripe'is (cs_live_ sessioon).
-- Idempotentne: teisel käivitusel pole ühtegi rida, mille number_seq puudub.
WITH legacy AS (
  SELECT o.id, o.number AS old_number, o.created_at,
         NOT COALESCE(left(o.stripe_session_id, 8) = 'cs_live_', false) AS t,
         EXTRACT(YEAR FROM (o.created_at AT TIME ZONE 'Europe/Tallinn'))::int AS y
  FROM orders o
  WHERE o.number_seq IS NULL
),
numbered AS (
  SELECT l.*,
         COALESCE((SELECT max(x.number_seq) FROM orders x WHERE x.is_test = l.t AND x.number_year = l.y), 0)
           + row_number() OVER (PARTITION BY l.t, l.y ORDER BY l.created_at, l.id) AS seq
  FROM legacy l
),
upd AS (
  UPDATE orders o SET
    is_test = n.t,
    number_year = n.y,
    number_seq = n.seq,
    legacy_number = COALESCE(o.legacy_number, n.old_number),
    number = CASE WHEN n.t THEN 'TEST-' ELSE '' END || 'ÄGE-' || n.y::text || '-' || lpad(n.seq::text, GREATEST(4, length(n.seq::text)), '0')
  FROM numbered n
  WHERE o.id = n.id AND o.number_seq IS NULL
  RETURNING o.id, o.number, o.legacy_number, o.is_test, o.number_year, o.number_seq
),
wd AS (
  UPDATE withdrawals w SET order_number = u.number
  FROM upd u WHERE w.order_number = u.legacy_number
  RETURNING w.id
),
mv AS (
  UPDATE inventory_movements m SET note = 'Tellimus ' || u.number
  FROM upd u WHERE m.order_id = u.id AND m.note = 'Tellimus ' || u.legacy_number
  RETURNING m.id
),
cnt AS (
  INSERT INTO order_counters (scope, year, last_value)
  SELECT CASE WHEN u.is_test THEN 'test' ELSE 'live' END, u.number_year, max(u.number_seq)
  FROM upd u GROUP BY 1, 2
  ON CONFLICT (scope, year) DO UPDATE SET last_value = GREATEST(order_counters.last_value, EXCLUDED.last_value), updated_at = now()
  RETURNING scope
)
SELECT (SELECT count(*) FROM upd) AS migrated;
`;
