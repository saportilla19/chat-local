const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 4e6 });
const CODE = process.env.CHAT_CODE || '';
const MAX = 100;
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const sb = SB_URL && process.env.SUPABASE_SERVICE_KEY
  ? createClient(SB_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } }) : null;
const BUCKET = 'media';
const PUBLIC = `${SB_URL}/storage/v1/object/public/${BUCKET}/`;
const log = (what, e) => { if (e) console.error(what + ':', e.message || e); };
const sha1 = s => crypto.createHash('sha1').update(s).digest('hex');

let history = [];
let shared = [];

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3' };
async function store(dataUrl, folder) {
  if (!sb) return dataUrl;
  const mt = /^data:([^;,]+)/.exec(dataUrl)[1];
  const file = `${folder}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${EXT[mt] || 'bin'}`;
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  const { error } = await sb.storage.from(BUCKET).upload(file, buf, { contentType: mt, cacheControl: '31536000' });
  if (error) throw error;
  return PUBLIC + file;
}

async function init() {
  if (!sb) return console.log('Sin Supabase: los datos viven solo en memoria.');
  const m = await sb.from('messages').select('*').order('ts', { ascending: false }).limit(MAX);
  log('cargar mensajes', m.error);
  history = (m.data || []).reverse().map(r => ({
    id: r.id, name: r.name, ts: Number(r.ts), type: r.type,
    text: r.text ?? undefined, data: r.data ?? undefined, sticker: r.sticker ?? undefined, dur: r.dur ?? undefined
  }));
  const s = await sb.from('stickers').select('id,url').order('created_at', { ascending: false }).limit(60);
  log('cargar stickers', s.error);
  shared = (s.data || []).map(r => ({ id: r.id, data: r.url }));
  console.log(`Supabase conectado: ${history.length} mensajes, ${shared.length} stickers.`);
}

app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (_, res) => res.send('ok'));
app.get('/api/shared', (_, res) => res.json(shared));
app.get('/api/config', (_, res) => res.json({ needsCode: !!CODE }));
app.get('/api/stickers', (_, res) => {
  const dir = path.join(__dirname, 'public', 'stickers');
  res.json(require('fs').readdirSync(dir).filter(f => /\.(svg|png|webp|gif)$/i.test(f)).sort());
});

const users = new Map();
const online = () => [...new Set(users.values())];

io.on('connection', socket => {
  socket.on('join', (d, ack) => {
    if (typeof ack !== 'function') return;
    const name = String((d && d.name) || '').trim().slice(0, 20);
    if (!name) return ack({ ok: false, error: 'Escribe tu nombre.' });
    if (CODE && (d && d.code) !== CODE) return ack({ ok: false, error: 'El código no es correcto.' });
    users.set(socket.id, name);
    ack({ ok: true, history });
    io.emit('online', online());
  });

  socket.on('message', async m => {
    const name = users.get(socket.id);
    if (!name || !m) return;
    const msg = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), name, ts: Date.now(), type: m.type };
    try {
      if (m.type === 'text') {
        msg.text = String(m.text || '').trim().slice(0, 2000);
        if (!msg.text) return;
      } else if (m.type === 'image') {
        if (typeof m.data !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(m.data) || m.data.length > 3e6) return;
        msg.data = await store(m.data, 'images');
      } else if (m.type === 'audio') {
        if (typeof m.data !== 'string' || !/^data:audio\/(webm|mp4|ogg|mpeg)[^,]{0,60};base64,/.test(m.data) || m.data.length > 2.5e6) return;
        msg.data = await store(m.data, 'audio');
        msg.dur = Math.min(300, Math.max(0, +m.dur || 0));
      } else if (m.type === 'sticker') {
        if (typeof m.data === 'string') {
          if (sb && m.data.startsWith(PUBLIC + 'stickers/')) msg.data = m.data;
          else {
            if (!/^data:image\/(png|webp);base64,/.test(m.data) || m.data.length > 1.5e6) return;
            const id = sha1(m.data).slice(0, 12);
            const found = shared.find(x => x.id === id);
            msg.data = found ? found.data : await store(m.data, 'stickers');
            if (!found) {
              shared.unshift({ id, data: msg.data });
              shared = shared.slice(0, 60);
              if (sb) log('guardar sticker', (await sb.from('stickers').insert({ id, url: msg.data })).error);
            }
          }
        } else msg.sticker = path.basename(String(m.sticker || ''));
      } else return;
    } catch (e) { return log('procesar mensaje', e); }
    history.push(msg);
    history = history.slice(-MAX);
    io.emit('message', msg);
    if (sb) {
      const row = { id: msg.id, name, ts: msg.ts, type: msg.type, text: msg.text ?? null, data: msg.data ?? null, sticker: msg.sticker ?? null, dur: msg.dur ?? null };
      log('guardar mensaje', (await sb.from('messages').insert(row)).error);
    }
  });

  socket.on('sticker:del', async id => {
    if (!users.has(socket.id)) return;
    id = String(id);
    shared = shared.filter(x => x.id !== id);
    if (sb) log('borrar sticker', (await sb.from('stickers').delete().eq('id', id)).error);
  });

  socket.on('disconnect', () => {
    users.delete(socket.id);
    io.emit('online', online());
  });
});

const PORT = process.env.PORT || 3000;
init().catch(e => log('iniciar', e)).finally(() => server.listen(PORT, () => console.log('Chat listo en el puerto ' + PORT)));
