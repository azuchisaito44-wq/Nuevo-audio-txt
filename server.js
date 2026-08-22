const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// Permitir peticiones desde tu app web (CORS abierto; puedes restringirlo a tu dominio)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.static('public'));

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 500 * 1024 * 1024 } }); // hasta 500MB de subida

const MOTORES = {
  groq: {
    url: 'https://api.groq.com/openai/v1/audio/transcriptions',
    modelo: 'whisper-large-v3'
  },
  openai: {
    url: 'https://api.openai.com/v1/audio/transcriptions',
    modelo: 'whisper-1'
  }
};

const LIMITE_BYTES = 24 * 1024 * 1024; // margen de seguridad bajo 25MB

function ejecutar(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let stderr = '';
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('ffmpeg falló: ' + stderr));
    });
  });
}

// Comprime el audio a mp3 mono 16kHz, buena calidad para voz, tamaño mucho menor
async function comprimirAudio(entrada, salida) {
  await ejecutar('ffmpeg', [
    '-y', '-i', entrada,
    '-ac', '1',
    '-ar', '16000',
    '-b:a', '32k',
    salida
  ]);
}

// Obtiene la duración del audio en segundos
function obtenerDuracion(archivo) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      archivo
    ]);
    let out = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.on('close', () => resolve(parseFloat(out) || 0));
    p.on('error', reject);
  });
}

// Trocea el audio en segmentos de N segundos
async function trocear(archivo, carpetaSalida, segundosPorTrozo) {
  await ejecutar('ffmpeg', [
    '-y', '-i', archivo,
    '-f', 'segment',
    '-segment_time', String(segundosPorTrozo),
    '-c', 'copy',
    path.join(carpetaSalida, 'trozo_%03d.mp3')
  ]);
  return fs.readdirSync(carpetaSalida)
    .filter((f) => f.startsWith('trozo_'))
    .sort()
    .map((f) => path.join(carpetaSalida, f));
}

async function transcribirTrozo(archivo, motorInfo, apiKey, idioma) {
  const buffer = fs.readFileSync(archivo);
  const form = new FormData();
  form.append('file', new Blob([buffer]), path.basename(archivo));
  form.append('model', motorInfo.modelo);
  form.append('response_format', 'json');
  if (idioma) form.append('language', idioma);

  const resp = await fetch(motorInfo.url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey },
    body: form
  });

  if (!resp.ok) {
    const texto = await resp.text();
    throw new Error(`Error ${resp.status} del motor: ${texto}`);
  }
  const data = await resp.json();
  return (data.text || '').trim();
}

app.post('/transcribir', upload.single('file'), async (req, res) => {
  const archivoSubido = req.file;
  const { engine, apiKey, language } = req.body;

  if (!archivoSubido) return res.status(400).json({ error: 'No se recibió ningún archivo.' });
  if (!engine || !MOTORES[engine]) return res.status(400).json({ error: 'Motor no válido. Usa "groq" u "openai".' });
  if (!apiKey) return res.status(400).json({ error: 'Falta la clave de API.' });

  const motorInfo = MOTORES[engine];
  const carpetaTrabajo = fs.mkdtempSync(path.join(os.tmpdir(), 'transc-'));
  const comprimido = path.join(carpetaTrabajo, 'comprimido.mp3');

  try {
    await comprimirAudio(archivoSubido.path, comprimido);

    const tamano = fs.statSync(comprimido).size;
    let trozos;

    if (tamano <= LIMITE_BYTES) {
      trozos = [comprimido];
    } else {
      const duracion = await obtenerDuracion(comprimido);
      // Estima segundos por trozo para quedar bajo el límite de bytes
      const bytesPorSegundo = tamano / duracion;
      const segundosPorTrozo = Math.max(30, Math.floor((LIMITE_BYTES * 0.9) / bytesPorSegundo));
      trozos = await trocear(comprimido, carpetaTrabajo, segundosPorTrozo);
    }

    let textoCompleto = '';
    for (const trozo of trozos) {
      const texto = await transcribirTrozo(trozo, motorInfo, apiKey, language);
      textoCompleto += (textoCompleto ? ' ' : '') + texto;
    }

    res.json({ text: textoCompleto.trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Error al procesar el audio.' });
  } finally {
    fs.rm(carpetaTrabajo, { recursive: true, force: true }, () => {});
    fs.unlink(archivoSubido.path, () => {});
  }
});

app.get('/', (req, res) => {
  res.send('Servidor de transcripción activo.');
});

app.listen(PORT, () => {
  console.log('Servidor escuchando en el puerto ' + PORT);
});
