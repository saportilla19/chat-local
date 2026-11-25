# Chat del equipo

Chat en tiempo real tipo WhatsApp: mensajes, imágenes y stickers. Hecho con Node.js + Socket.io.

## Probar en tu PC
```
npm install
npm start
```
Abre http://localhost:3000

## Publicarlo gratis en Render
1. Sube esta carpeta a un repositorio de GitHub.
2. En render.com: **New → Blueprint** (o **Web Service**) y elige el repositorio.
3. Si usas Web Service: Build `npm install`, Start `npm start`, plan Free.
4. En **Environment** crea `CHAT_CODE` con un código secreto (opcional, pero recomendado para que solo entren tus compañeros).
5. Comparte el enlace `https://...onrender.com` y el código.

## Stickers propios
Pon imágenes .png, .webp, .gif o .svg en `public/stickers/`. Aparecen solas en el panel.

## Límites de esta versión
- Guarda los últimos 100 mensajes. En el plan gratuito de Render el disco se borra al reiniciar, así que el historial puede perderse.
- El servicio se duerme tras 15 min sin uso y tarda unos segundos en despertar.

## Guardado permanente con Supabase
1. Crea un proyecto en supabase.com y ejecuta `supabase.sql` en **SQL Editor**.
2. En Render → **Environment** agrega `SUPABASE_URL` (Project URL) y `SUPABASE_SERVICE_KEY` (clave secreta). Nunca subas esa clave a GitHub.
3. Sin esas variables el chat funciona igual, pero guarda todo solo en memoria.
