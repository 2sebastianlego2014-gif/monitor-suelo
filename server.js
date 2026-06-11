const express = require('express');
const app = express();

app.use(express.json());

// ── Último dato recibido del Arduino ──────────────────────────────────────
let ultimoDato = null;

// ── Recibir datos desde el Arduino (POST /datos) ──────────────────────────
app.post('/datos', (req, res) => {
  const { temperatura, vwc, adc, estado } = req.body;

  if (temperatura === undefined || vwc === undefined) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  ultimoDato = {
    temperatura: parseFloat(temperatura),
    vwc:         parseFloat(vwc),
    adc:         parseInt(adc) || 0,
    estado:      estado || '',
    timestamp:   new Date().toISOString()
  };

  console.log(`[${new Date().toLocaleTimeString()}] Dato recibido:`, ultimoDato);
  res.json({ ok: true });
});

// ── Entregar datos a la página web (GET /api/datos) ───────────────────────
app.get('/api/datos', (req, res) => {
  if (!ultimoDato) {
    return res.status(503).json({ error: 'Aún no hay datos del Arduino' });
  }
  res.json(ultimoDato);
});

// ── Servir la página web (GET /) ──────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');  // ← cambiado: sin /public/
});

app.use(express.static(__dirname));  // ← cambiado: sirve desde la raíz

// ── Iniciar servidor ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
