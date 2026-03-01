require('dotenv').config();
const express = require('express');
const cors = require('cors');
const {
  initDB,
  getEvents, getEventsByDate, getAllEvents, insertEvent,
  getProjects, getProjectByName, createProject, updateProject, deleteProject,
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function hoyAR() {
  return new Date().toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

function ayerAR() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

// Wrapper para manejar errores en handlers async (Express 4)
function asyncHandler(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

// ─────────────────────────────────────────────
// Webhook — recibe eventos del Alexa skill
// ─────────────────────────────────────────────

app.post('/webhook', asyncHandler(async (req, res) => {
  const payload = req.body;
  if (!payload || !payload.categoria) {
    return res.status(400).json({ error: 'Payload inválido' });
  }

  const event = await insertEvent({ ...payload, receivedAt: new Date().toISOString() });
  console.log(`[webhook] ${event.categoria}/${event.accion} — ${event.fecha} ${event.hora}`);

  // Procesar eventos de proyecto automáticamente
  if (payload.categoria === 'proyecto' && payload.descripcion) {
    const project = await getProjectByName(payload.descripcion);
    if (project) {
      const fields = {};
      if (payload.accion === 'progreso' && payload.monto != null) {
        fields.progreso = Math.min(100, Math.max(0, Math.round(Number(payload.monto))));
        if (fields.progreso === 100) fields.estado = 'completado';
      } else if (payload.accion === 'completado') {
        fields.estado = 'completado';
        fields.progreso = 100;
      } else if (payload.accion === 'pausado') {
        fields.estado = 'pausado';
      } else if (payload.accion === 'reanudar') {
        fields.estado = 'activo';
      }
      if (Object.keys(fields).length) {
        await updateProject(project.id, fields);
        console.log(`[proyecto] ${project.nombre} → ${JSON.stringify(fields)}`);
      }
    }
  }

  res.json({ ok: true, event });
}));

// ─────────────────────────────────────────────
// API — resumen del día
// ─────────────────────────────────────────────

app.get('/api/today', asyncHandler(async (req, res) => {
  const hoy = hoyAR();
  const ayer = ayerAR();

  const [todayEvents, yesterdayEvents] = await Promise.all([
    getEventsByDate(hoy),
    getEventsByDate(ayer),
  ]);

  // allEvents para cálculo de sueño cross-day (dormir ayer, despertar hoy)
  const allEvents = [...yesterdayEvents, ...todayEvents].sort(
    (a, b) => new Date(a.iso) - new Date(b.iso)
  );

  // ── Trabajo (antes de habitos para usar activo) ──────────────────────────────
  const trabajoData = procesarTrabajoDia(todayEvents, true, allEvents);

  // ── Hábitos ──────────────────────────────────
  const habitos = {
    lectura: {
      completado: todayEvents.some(
        (e) => e.categoria === 'lectura' && e.accion === 'fin'
      ),
      sesiones: todayEvents.filter((e) => e.categoria === 'lectura' && e.accion === 'fin')
        .length,
    },
    trabajo: {
      // Usa trabajoData para detectar sesiones que empezaron ayer noche
      completado: trabajoData.sesiones.length > 0 || trabajoData.activo,
      activo: trabajoData.activo,
    },
    entrenamiento: {
      completado: todayEvents.some(
        (e) => e.categoria === 'entrenamiento' && e.accion === 'fin'
      ),
      inicio: todayEvents.find(
        (e) => e.categoria === 'entrenamiento' && e.accion === 'inicio'
      ),
      fin: todayEvents.find(
        (e) => e.categoria === 'entrenamiento' && e.accion === 'fin'
      ),
    },
  };

  // ── Sueño ────────────────────────────────────
  const despertarEvent = todayEvents.find(
    (e) => e.categoria === 'sueno' && e.accion === 'despertar'
  );
  let dormirEvent = null;
  if (despertarEvent) {
    dormirEvent = allEvents
      .filter(
        (e) =>
          e.categoria === 'sueno' &&
          e.accion === 'dormir' &&
          new Date(e.iso) < new Date(despertarEvent.iso)
      )
      .pop();
  }

  let sueno = null;
  if (dormirEvent && despertarEvent) {
    const diffMs = new Date(despertarEvent.iso) - new Date(dormirEvent.iso);
    const minutos = Math.round(diffMs / 60000);
    sueno = {
      horas: Math.floor(minutos / 60),
      minutos: minutos % 60,
      dormirse: dormirEvent.hora,
      despertarse: despertarEvent.hora,
      eficiencia: Math.min(100, Math.round((minutos / 480) * 100)),
    };
  }

  // ── Finanzas ─────────────────────────────────
  const gastos = todayEvents
    .filter((e) => e.categoria === 'finanzas' && e.accion === 'gasto')
    .map((e) => ({
      monto: e.monto,
      moneda: e.moneda || 'pesos',
      descripcion: e.descripcion || '',
      hora: e.hora,
    }));

  const ingresos = todayEvents
    .filter((e) => e.categoria === 'finanzas' && e.accion === 'ingreso')
    .map((e) => ({
      monto: e.monto,
      moneda: e.moneda || 'dólares',
      descripcion: e.descripcion || '',
      hora: e.hora,
    }));

  const totalIngresosUSD = ingresos
    .filter((e) => e.moneda.toLowerCase().includes('dólar') || e.moneda.toLowerCase() === 'usd')
    .reduce((sum, e) => sum + (e.monto || 0), 0);

  const totalGastosARS = gastos
    .filter((e) => e.moneda.toLowerCase().includes('peso') || e.moneda.toLowerCase() === 'ars')
    .reduce((sum, e) => sum + (e.monto || 0), 0);

  res.json({
    fecha: hoy,
    habitos,
    sueno,
    trabajo: trabajoData,
    finanzas: {
      gastos,
      ingresos,
      totalIngresosUSD,
      totalGastosARS,
    },
    eventos: todayEvents.slice(-30),
  });
}));

// ─────────────────────────────────────────────
// API — últimos eventos (feed de actividad)
// ─────────────────────────────────────────────

app.get('/api/events', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const events = await getEvents(limit);
  res.json(events);
}));

// ─────────────────────────────────────────────
// Helpers — procesamiento por día (reutilizable)
// ─────────────────────────────────────────────

// contextEvents: array opcional con eventos de días vecinos para detectar sesiones cross-midnight
function procesarTrabajoDia(dayEvents, esHoy = false, contextEvents = null) {
  const targetFechas = new Set(dayEvents.map((e) => e.fecha));
  const context = contextEvents || dayEvents;

  const eventos = context
    .filter((e) => e.categoria === 'trabajo')
    .sort((a, b) => new Date(a.iso) - new Date(b.iso));

  let totalMinutes = 0;
  let workStart = null;
  const sesiones = [];

  for (const ev of eventos) {
    if (ev.accion === 'inicio' || ev.accion === 'reanudar') {
      workStart = { hora: ev.hora, iso: ev.iso, fecha: ev.fecha };
    } else if ((ev.accion === 'pausa' || ev.accion === 'fin') && workStart) {
      const mins = Math.round((new Date(ev.iso) - new Date(workStart.iso)) / 60000);
      // La sesión pertenece a este día si alguno de sus extremos cae en él
      if (targetFechas.has(ev.fecha) || targetFechas.has(workStart.fecha)) {
        sesiones.push({ inicio: workStart.hora, fin: ev.hora, minutos: mins, activa: false });
        totalMinutes += mins;
      }
      workStart = null;
    }
  }

  if (workStart) {
    const mins = Math.round((new Date() - new Date(workStart.iso)) / 60000);
    sesiones.push({ inicio: workStart.hora, fin: null, minutos: mins, activa: true });
    if (esHoy) totalMinutes += mins;
  }

  return {
    minutos: Math.round(totalMinutes),
    horas: Math.floor(totalMinutes / 60),
    minutosRestantes: Math.round(totalMinutes % 60),
    activo: workStart !== null,
    sesiones,
  };
}

function procesarSuenoDia(dayEvents, allEvents) {
  const despertarEvent = dayEvents.find(
    (e) => e.categoria === 'sueno' && e.accion === 'despertar'
  );
  if (!despertarEvent) return null;

  const dormirEvent = [...allEvents]
    .sort((a, b) => new Date(a.iso) - new Date(b.iso))
    .filter(
      (e) =>
        e.categoria === 'sueno' &&
        e.accion === 'dormir' &&
        new Date(e.iso) < new Date(despertarEvent.iso)
    )
    .pop();

  if (!dormirEvent) return null;

  const diffMs = new Date(despertarEvent.iso) - new Date(dormirEvent.iso);
  const minutos = Math.round(diffMs / 60000);
  return {
    minutos,
    horas: Math.floor(minutos / 60),
    minutosRestantes: minutos % 60,
    dormirse: dormirEvent.hora,
    despertarse: despertarEvent.hora,
    eficiencia: Math.min(100, Math.round((minutos / 480) * 100)),
  };
}

// ─────────────────────────────────────────────
// API — historial (últimos N días)
// ─────────────────────────────────────────────

app.get('/api/history', asyncHandler(async (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 7, 90);
  const result = [];

  const allEvents = await getAllEvents();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const fechaStr = date.toLocaleDateString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
    });
    const diaNombre = date
      .toLocaleDateString('es-AR', { weekday: 'short', timeZone: 'America/Argentina/Buenos_Aires' })
      .replace('.', '');

    const dayEvents = allEvents.filter((e) => e.fecha === fechaStr);
    const trabajo = procesarTrabajoDia(dayEvents, i === 0, allEvents);
    const sueno = procesarSuenoDia(dayEvents, allEvents);
    const habitos = {
      lectura: dayEvents.some((e) => e.categoria === 'lectura' && e.accion === 'fin'),
      trabajo: dayEvents.some((e) => e.categoria === 'trabajo'),
      entrenamiento: dayEvents.some(
        (e) => e.categoria === 'entrenamiento' && e.accion === 'fin'
      ),
    };
    const habitosCompletados = Object.values(habitos).filter(Boolean).length;

    const gastos = dayEvents.filter(
      (e) => e.categoria === 'finanzas' && e.accion === 'gasto'
    );
    const ingresos = dayEvents.filter(
      (e) => e.categoria === 'finanzas' && e.accion === 'ingreso'
    );

    result.push({
      fecha: fechaStr,
      diaNombre,
      trabajo,
      sueno,
      habitos,
      habitosCompletados,
      finanzas: {
        gastos: gastos.map((e) => ({
          monto: e.monto,
          moneda: e.moneda,
          descripcion: e.descripcion,
          hora: e.hora,
        })),
        ingresos: ingresos.map((e) => ({
          monto: e.monto,
          moneda: e.moneda,
          descripcion: e.descripcion,
          hora: e.hora,
        })),
        totalGastosARS: gastos
          .filter((e) => e.moneda?.toLowerCase().includes('peso'))
          .reduce((s, e) => s + (e.monto || 0), 0),
        totalIngresosUSD: ingresos
          .filter(
            (e) =>
              e.moneda?.toLowerCase().includes('dólar') ||
              e.moneda?.toLowerCase() === 'usd'
          )
          .reduce((s, e) => s + (e.monto || 0), 0),
      },
    });
  }

  res.json(result);
}));

// ─────────────────────────────────────────────
// API — rachas (streaks) por hábito
// ─────────────────────────────────────────────

app.get('/api/streaks', asyncHandler(async (req, res) => {
  const MAX_DAYS = 90;
  const allEvents = await getAllEvents();

  const days = [];
  for (let i = 0; i < MAX_DAYS; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const fechaStr = date.toLocaleDateString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
    });
    const evs = allEvents.filter((e) => e.fecha === fechaStr);

    days.push({
      fecha: fechaStr,
      lectura:       evs.some((e) => e.categoria === 'lectura'       && e.accion === 'fin'),
      trabajo:       evs.some((e) => e.categoria === 'trabajo'),
      entrenamiento: evs.some((e) => e.categoria === 'entrenamiento' && e.accion === 'fin'),
    });
  }

  function calcStreak(habit) {
    let streak = 0;
    const start = days[0][habit] ? 0 : 1;
    for (let i = start; i < days.length; i++) {
      if (days[i][habit]) streak++;
      else break;
    }
    return streak;
  }

  res.json({
    lectura:       calcStreak('lectura'),
    trabajo:       calcStreak('trabajo'),
    entrenamiento: calcStreak('entrenamiento'),
  });
}));

// ─────────────────────────────────────────────
// API — agregar evento manual (para testing)
// ─────────────────────────────────────────────

app.post('/api/test-event', asyncHandler(async (req, res) => {
  const { categoria, accion, ...extra } = req.body;
  if (!categoria || !accion) {
    return res.status(400).json({ error: 'categoria y accion son requeridos' });
  }

  const now = new Date();
  const fechaAR = now.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  const horaAR = now.toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
  });

  const payload = {
    categoria,
    accion,
    fecha: fechaAR,
    hora: horaAR,
    iso: now.toISOString(),
    ...extra,
    receivedAt: now.toISOString(),
  };

  const event = await insertEvent(payload);
  console.log(`[test] ${categoria}/${accion}`);
  res.json({ ok: true, event });
}));

// ─────────────────────────────────────────────
// API — proyectos
// ─────────────────────────────────────────────

app.get('/api/projects', asyncHandler(async (req, res) => {
  const { estado } = req.query;
  const projects = await getProjects(estado ? { estado } : {});
  res.json(projects);
}));

app.post('/api/projects', asyncHandler(async (req, res) => {
  const { nombre, descripcion, color } = req.body;
  if (!nombre?.trim()) {
    return res.status(400).json({ error: 'nombre es requerido' });
  }
  const project = await createProject({ nombre: nombre.trim(), descripcion, color });
  console.log(`[proyecto] Creado: ${project.nombre}`);
  res.json({ ok: true, project });
}));

app.patch('/api/projects/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'id inválido' });
  }
  const { progreso, estado, descripcion, nombre, color } = req.body;
  const project = await updateProject(id, { progreso, estado, descripcion, nombre, color });
  if (!project) {
    return res.status(404).json({ error: 'Proyecto no encontrado' });
  }
  console.log(`[proyecto] Actualizado #${id}: ${JSON.stringify({ progreso, estado })}`);
  res.json({ ok: true, project });
}));

app.delete('/api/projects/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'id inválido' });
  }
  const deleted = await deleteProject(id);
  if (!deleted) return res.status(404).json({ error: 'Proyecto no encontrado' });
  console.log(`[proyecto] Eliminado #${id}`);
  res.json({ ok: true });
}));

// ─────────────────────────────────────────────
// Error handler global
// ─────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────

async function main() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`\n🟢 Dashboard corriendo en http://localhost:${PORT}`);
    console.log(`📡 Webhook endpoint: POST http://localhost:${PORT}/webhook\n`);
  });
}

main().catch((err) => {
  console.error('[fatal] No se pudo iniciar el servidor:', err);
  process.exit(1);
});
