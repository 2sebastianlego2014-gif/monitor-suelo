const express = require('express');
const Database = require('better-sqlite3');
const path     = require('path');

const app = express();
app.use(express.json());

// ── Base de datos SQLite ──────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'sensores.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS lecturas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    temperatura REAL    NOT NULL,
    humedad     REAL    NOT NULL,
    fecha       TEXT    NOT NULL,   -- 'YYYY-MM-DD'
    hora        TEXT    NOT NULL,   -- 'HH:MM:SS'
    timestamp   TEXT    NOT NULL    -- ISO completo
  )
`);

// Sentencias preparadas (más rápidas y seguras)
const insertLectura = db.prepare(`
  INSERT INTO lecturas (temperatura, humedad, fecha, hora, timestamp)
  VALUES (@temperatura, @humedad, @fecha, @hora, @timestamp)
`);

const getLecturas = db.prepare(`
  SELECT * FROM lecturas
  WHERE fecha BETWEEN @desde AND @hasta
    AND hora  BETWEEN @horaDesde AND @horaHasta
  ORDER BY timestamp ASC
`);

// ── Último dato recibido del Arduino ──────────────────────────────────────
let ultimoDato = null;

// ── Recibir datos desde el Arduino (POST /datos) ──────────────────────────
app.post('/datos', (req, res) => {
  const { temperatura, vwc, adc, estado } = req.body;

  if (temperatura === undefined || vwc === undefined) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  const now = new Date();

  // Fecha y hora en zona horaria de Chile (America/Santiago)
  const fechaHora = now.toLocaleString('es-CL', { timeZone: 'America/Santiago' });
  // fechaHora: "DD-MM-YYYY, HH:MM:SS"  (formato es-CL)
  // Necesitamos YYYY-MM-DD y HH:MM:SS por separado para filtrar fácil
  const fecha = now.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }); // 'YYYY-MM-DD'
  const hora  = now.toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour12: false }); // 'HH:MM:SS'

  ultimoDato = {
    temperatura: parseFloat(temperatura),
    vwc:         parseFloat(vwc),
    adc:         parseInt(adc) || 0,
    estado:      estado || '',
    timestamp:   now.toISOString()
  };

  // Guardar en la base de datos
  try {
    insertLectura.run({
      temperatura: ultimoDato.temperatura,
      humedad:     ultimoDato.vwc,
      fecha,
      hora,
      timestamp:   ultimoDato.timestamp
    });
  } catch (err) {
    console.error('[DB] Error al guardar lectura:', err.message);
  }

  console.log(`[${hora}] Dato guardado → Temp: ${ultimoDato.temperatura}°C | Humedad: ${ultimoDato.vwc}%`);
  res.json({ ok: true });
});

// ── Último dato para la página principal (GET /api/datos) ────────────────
app.get('/api/datos', (req, res) => {
  if (!ultimoDato) {
    return res.status(503).json({ error: 'Aún no hay datos del Arduino' });
  }
  res.json(ultimoDato);
});

// ── Historial filtrado (GET /api/historial) ───────────────────────────────
// Query params: desde, hasta (YYYY-MM-DD), horaDesde, horaHasta (HH:MM)
app.get('/api/historial', (req, res) => {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

  const desde     = req.query.desde     || hoy;
  const hasta     = req.query.hasta     || hoy;
  const horaDesde = req.query.horaDesde ? req.query.horaDesde + ':00' : '00:00:00';
  const horaHasta = req.query.horaHasta ? req.query.horaHasta + ':59' : '23:59:59';

  try {
    const rows = getLecturas.all({ desde, hasta, horaDesde, horaHasta });
    res.json({ total: rows.length, datos: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Rango de fechas disponibles (GET /api/historial/rango) ───────────────
app.get('/api/historial/rango', (req, res) => {
  try {
    const row = db.prepare(`
      SELECT MIN(fecha) AS primera, MAX(fecha) AS ultima, COUNT(*) AS total
      FROM lecturas
    `).get();
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Servir la página web ───────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});
app.use(express.static(__dirname));

// ── Iniciar servidor ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Base de datos: ${path.join(__dirname, 'sensores.db')}`);
});
