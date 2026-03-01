const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ─────────────────────────────────────────────
// Persistencia
// ─────────────────────────────────────────────

function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ events: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function hoyAR() {
  return new Date().toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

// ─────────────────────────────────────────────
// Webhook — recibe eventos del Alexa skill
// ─────────────────────────────────────────────

app.post('/webhook', (req, res) => {
  const payload = req.body;
  if (!payload || !payload.categoria) {
    return res.status(400).json({ error: 'Payload inválido' });
  }

  const data = readData();
  const event = { ...payload, receivedAt: new Date().toISOString() };
  data.events.push(event);
  writeData(data);

  console.log(`[webhook] ${event.categoria}/${event.accion} — ${event.fecha} ${event.hora}`);
  res.json({ ok: true, event });
});

// ─────────────────────────────────────────────
// API — resumen del día
// ─────────────────────────────────────────────

app.get('/api/today', (req, res) => {
  const data = readData();
  const hoy = hoyAR();

  const todayEvents = data.events.filter((e) => e.fecha === hoy);
  const allEvents = [...data.events].sort((a, b) => new Date(a.iso) - new Date(b.iso));

  // ── Hábitos ──────────────────────────────────
  const habitos = {
    sueno: {
      completado: todayEvents.some(
        (e) => e.categoria === 'sueno' && e.accion === 'despertar'
      ),
      dormirse: todayEvents.find((e) => e.categoria === 'sueno' && e.accion === 'dormir'),
      despertarse: todayEvents.find(
        (e) => e.categoria === 'sueno' && e.accion === 'despertar'
      ),
    },
    lectura: {
      completado: todayEvents.some(
        (e) => e.categoria === 'lectura' && e.accion === 'fin'
      ),
      sesiones: todayEvents.filter((e) => e.categoria === 'lectura' && e.accion === 'fin')
        .length,
    },
    trabajo: {
      completado: todayEvents.some((e) => e.categoria === 'trabajo'),
      activo:
        todayEvents.filter((e) => e.categoria === 'trabajo').length > 0 &&
        (() => {
          const evs = todayEvents
            .filter((e) => e.categoria === 'trabajo')
            .sort((a, b) => new Date(a.iso) - new Date(b.iso));
          const last = evs[evs.length - 1];
          return last && (last.accion === 'inicio' || last.accion === 'reanudar');
        })(),
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
      eficiencia: Math.min(100, Math.round((minutos / 480) * 100)), // 8h = 100%
    };
  }

  // ── Trabajo ──────────────────────────────────
  const trabajoData = procesarTrabajoDia(todayEvents, true);
  const totalWorkMinutes = trabajoData.minutos;

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

  // ── Respuesta ─────────────────────────────────
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
});

// ─────────────────────────────────────────────
// API — últimos eventos (feed de actividad)
// ─────────────────────────────────────────────

app.get('/api/events', (req, res) => {
  const data = readData();
  const limit = parseInt(req.query.limit) || 20;
  const events = [...data.events].reverse().slice(0, limit);
  res.json(events);
});

// ─────────────────────────────────────────────
// Helpers — procesamiento por día (reutilizable)
// ─────────────────────────────────────────────

function procesarTrabajoDia(dayEvents, esHoy = false) {
  let totalMinutes = 0;
  let workStart = null;
  const sesiones = [];

  const eventos = dayEvents
    .filter((e) => e.categoria === 'trabajo')
    .sort((a, b) => new Date(a.iso) - new Date(b.iso));

  for (const ev of eventos) {
    if (ev.accion === 'inicio' || ev.accion === 'reanudar') {
      workStart = { hora: ev.hora, iso: ev.iso };
    } else if ((ev.accion === 'pausa' || ev.accion === 'fin') && workStart) {
      const mins = Math.round((new Date(ev.iso) - new Date(workStart.iso)) / 60000);
      sesiones.push({ inicio: workStart.hora, fin: ev.hora, minutos: mins, activa: false });
      totalMinutes += mins;
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

app.get('/api/history', (req, res) => {
  const data = readData();
  const days = Math.min(parseInt(req.query.days) || 7, 30);
  const result = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const fechaStr = date.toLocaleDateString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
    });
    const diaNombre = date
      .toLocaleDateString('es-AR', { weekday: 'short', timeZone: 'America/Argentina/Buenos_Aires' })
      .replace('.', '');

    const dayEvents = data.events.filter((e) => e.fecha === fechaStr);
    const trabajo = procesarTrabajoDia(dayEvents, i === 0);
    const sueno = procesarSuenoDia(dayEvents, data.events);
    const habitos = {
      sueno: dayEvents.some((e) => e.categoria === 'sueno' && e.accion === 'despertar'),
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
});

// ─────────────────────────────────────────────
// API — rachas (streaks) por hábito
// ─────────────────────────────────────────────

app.get('/api/streaks', (req, res) => {
  const data = readData();
  const MAX_DAYS = 90;

  // Para cada día, determinar si cada hábito fue completado
  const days = [];
  for (let i = 0; i < MAX_DAYS; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const fechaStr = date.toLocaleDateString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
    });
    const evs = data.events.filter((e) => e.fecha === fechaStr);

    days.push({
      fecha: fechaStr,
      sueno:         evs.some((e) => e.categoria === 'sueno'         && e.accion === 'despertar'),
      lectura:       evs.some((e) => e.categoria === 'lectura'       && e.accion === 'fin'),
      trabajo:       evs.some((e) => e.categoria === 'trabajo'),
      entrenamiento: evs.some((e) => e.categoria === 'entrenamiento' && e.accion === 'fin'),
    });
  }

  // Calcular racha: días consecutivos hacia atrás desde hoy
  // Si hoy no está completado, la racha activa arranca desde ayer
  function calcStreak(habit) {
    let streak = 0;
    const start = days[0][habit] ? 0 : 1; // si hoy está, contar desde hoy
    for (let i = start; i < days.length; i++) {
      if (days[i][habit]) streak++;
      else break;
    }
    return streak;
  }

  res.json({
    sueno:         calcStreak('sueno'),
    lectura:       calcStreak('lectura'),
    trabajo:       calcStreak('trabajo'),
    entrenamiento: calcStreak('entrenamiento'),
  });
});

// ─────────────────────────────────────────────
// API — agregar evento manual (para testing)
// ─────────────────────────────────────────────

app.post('/api/test-event', (req, res) => {
  const { categoria, accion, ...extra } = req.body;
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

  const data = readData();
  data.events.push(payload);
  writeData(data);

  console.log(`[test] ${categoria}/${accion}`);
  res.json({ ok: true, event: payload });
});

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🟢 Dashboard corriendo en http://localhost:${PORT}`);
  console.log(`📡 Webhook endpoint: POST http://localhost:${PORT}/webhook\n`);
});
