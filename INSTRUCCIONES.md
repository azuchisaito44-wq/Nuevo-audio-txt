# Cómo desplegar este backend (desde el celular, sin computadora)

## 1. Crea el repositorio en GitHub
1. Abre la app o web de GitHub (github.com) desde tu navegador o app móvil.
2. Toca "+" → "New repository".
3. Nómbralo, por ejemplo, `transcriptor-backend`. Puede ser privado.
4. Crea el repositorio (puedes marcar "Add a README" para que no quede vacío).

## 2. Sube los 3 archivos
Dentro del repositorio recién creado:
1. Toca "Add file" → "Create new file".
2. Nombra el archivo `server.js` y pega el contenido del archivo `server.js` que te compartí.
3. Guarda (commit).
4. Repite el mismo proceso para `package.json` y para `nixpacks.toml`, pegando cada contenido correspondiente.

## 3. Conecta el repositorio a Railway
1. En Railway, ve a "New Project" → "GitHub Repository".
2. Si no aparece tu repo, toca "Configure GitHub App" y dale acceso a Railway sobre ese repositorio (o todos).
3. Selecciona `transcriptor-backend`.
4. Railway detectará Node.js y usará `nixpacks.toml` para instalar ffmpeg automáticamente.
5. Espera a que termine el "Deploy". Te dará una URL pública tipo:
   `https://transcriptor-backend-production.up.railway.app`

## 4. Prueba que funciona
Abre esa URL en el navegador: debería decir "Servidor de transcripción activo."

## 5. Conecta tu app frontend con este servidor
En tu app HTML (`transcriptor_predicas`), en vez de enviar el audio directamente a Groq/OpenAI,
debes enviarlo a:

```
https://TU-URL-DE-RAILWAY.up.railway.app/transcribir
```

con estos campos en el FormData:
- `file`: el archivo de audio
- `engine`: `"groq"` o `"openai"` (según lo que elija el usuario)
- `apiKey`: la clave que el usuario ingresó
- `language`: el idioma (opcional)

Cuando quieras, te ayudo a modificar el HTML original para que apunte a este nuevo servidor
en lugar de llamar directo a las APIs.
