const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id          SERIAL PRIMARY KEY,
      categoria   VARCHAR(50)  NOT NULL,
      accion      VARCHAR(50)  NOT NULL,
      fecha       VARCHAR(20)  NOT NULL,
      hora        VARCHAR(10)  NOT NULL,
      iso         TIMESTAMPTZ  NOT NULL,
      recognized_text TEXT,
      source      VARCHAR(50),
      monto       NUMERIC,
      moneda      VARCHAR(50),
      descripcion TEXT,
      received_at TIMESTAMPTZ  DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_events_fecha     ON events(fecha);
    CREATE INDEX IF NOT EXISTS idx_events_iso       ON events(iso);
    CREATE INDEX IF NOT EXISTS idx_events_categoria ON events(categoria);

    CREATE TABLE IF NOT EXISTS projects (
      id          SERIAL PRIMARY KEY,
      nombre      VARCHAR(200) NOT NULL,
      descripcion TEXT,
      progreso    SMALLINT     NOT NULL DEFAULT 0
                                CHECK (progreso >= 0 AND progreso <= 100),
      estado      VARCHAR(20)  NOT NULL DEFAULT 'activo'
                                CHECK (estado IN ('activo','pausado','completado')),
      color       VARCHAR(20)  NOT NULL DEFAULT 'yellow',
      created_at  TIMESTAMPTZ  DEFAULT NOW(),
      updated_at  TIMESTAMPTZ  DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_projects_estado ON projects(estado);
  `);
  console.log('[db] Schema inicializado');
}

// Últimos N eventos ordenados por fecha DESC
async function getEvents(limit = 20) {
  const { rows } = await pool.query(
    'SELECT * FROM events ORDER BY iso DESC LIMIT $1',
    [limit]
  );
  return rows.map(rowToEvent);
}

// Todos los eventos de una fecha específica, ordenados ASC
async function getEventsByDate(fecha) {
  const { rows } = await pool.query(
    'SELECT * FROM events WHERE fecha = $1 ORDER BY iso ASC',
    [fecha]
  );
  return rows.map(rowToEvent);
}

// Todos los eventos ordenados ASC (para cálculos de sueño cross-day)
async function getAllEvents() {
  const { rows } = await pool.query('SELECT * FROM events ORDER BY iso ASC');
  return rows.map(rowToEvent);
}

// Insertar un evento nuevo
async function insertEvent(event) {
  const { rows } = await pool.query(
    `INSERT INTO events
       (categoria, accion, fecha, hora, iso, recognized_text, source, monto, moneda, descripcion, received_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      event.categoria,
      event.accion,
      event.fecha,
      event.hora,
      event.iso,
      event.recognized_text || null,
      event.source || null,
      event.monto != null ? event.monto : null,
      event.moneda || null,
      event.descripcion || null,
      event.receivedAt || new Date().toISOString(),
    ]
  );
  return rowToEvent(rows[0]);
}

// Mapear fila DB → objeto con misma forma que antes
function rowToEvent(row) {
  return {
    categoria:       row.categoria,
    accion:          row.accion,
    fecha:           row.fecha,
    hora:            row.hora,
    iso:             row.iso instanceof Date ? row.iso.toISOString() : row.iso,
    recognized_text: row.recognized_text || undefined,
    source:          row.source || undefined,
    monto:           row.monto != null ? Number(row.monto) : undefined,
    moneda:          row.moneda || undefined,
    descripcion:     row.descripcion || undefined,
    receivedAt:      row.received_at instanceof Date
                       ? row.received_at.toISOString()
                       : row.received_at,
  };
}

// ── Projects ─────────────────────────────────

async function getProjects({ estado } = {}) {
  const { rows } = estado
    ? await pool.query('SELECT * FROM projects WHERE estado = $1 ORDER BY created_at DESC', [estado])
    : await pool.query('SELECT * FROM projects ORDER BY created_at DESC');
  return rows;
}

async function getProjectByName(nombre) {
  const { rows } = await pool.query(
    'SELECT * FROM projects WHERE LOWER(nombre) LIKE $1 ORDER BY updated_at DESC LIMIT 1',
    [`%${nombre.toLowerCase()}%`]
  );
  return rows[0] || null;
}

async function createProject({ nombre, descripcion, color }) {
  const { rows } = await pool.query(
    'INSERT INTO projects (nombre, descripcion, color) VALUES ($1, $2, $3) RETURNING *',
    [nombre, descripcion || null, color || 'yellow']
  );
  return rows[0];
}

async function deleteProject(id) {
  const { rowCount } = await pool.query('DELETE FROM projects WHERE id = $1', [id]);
  return rowCount > 0;
}

async function updateProject(id, fields) {
  const allowed = ['progreso', 'estado', 'descripcion', 'nombre', 'color'];
  const sets = [];
  const vals = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = $${sets.length + 1}`);
      vals.push(fields[key]);
    }
  }
  if (!sets.length) return null;
  sets.push('updated_at = NOW()');
  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE projects SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
    vals
  );
  return rows[0] || null;
}

module.exports = {
  pool,
  initDB,
  getEvents,
  getEventsByDate,
  getAllEvents,
  insertEvent,
  getProjects,
  getProjectByName,
  createProject,
  updateProject,
  deleteProject,
};
