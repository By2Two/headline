import fs from 'node:fs';
import path from 'node:path';
import { SFX } from './sfx-list.js';

const API_URL = 'https://api.elevenlabs.io/v1/sound-generation';
const OUT_DIR = path.resolve('public/sounds/sfx');
const PARALLEL = 4;
const PROMPT_INFLUENCE = 0.6;
const MIN_DURATION_S = 0.5;

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error('Set ELEVENLABS_API_KEY first.');
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

const only = process.argv.slice(2);
const todo = SFX.filter((sound) =>
  only.length ? only.includes(sound.name) : !fs.existsSync(path.join(OUT_DIR, `${sound.name}.mp3`)),
);

async function generate(sound) {
  const body = {
    text: sound.text,
    duration_seconds: Math.max(MIN_DURATION_S, sound.dur),
    prompt_influence: PROMPT_INFLUENCE,
    ...(sound.loop ? { loop: true } : null),
  };
  let result = await fetch(API_URL, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!result.ok && sound.loop && result.status === 422) {
    delete body.loop;
    result = await fetch(API_URL, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  if (!result.ok) {
    throw new Error(`${result.status} ${(await result.text()).slice(0, 200)}`);
  }
  const audio = Buffer.from(await result.arrayBuffer());
  fs.writeFileSync(path.join(OUT_DIR, `${sound.name}.mp3`), audio);
  return audio.length;
}

let done = 0;
let failed = 0;
const queue = [...todo];
async function worker() {
  for (let sound = queue.shift(); sound; sound = queue.shift()) {
    try {
      const size = await generate(sound);
      done++;
      console.log(`ok   ${sound.name} (${Math.round(size / 1024)} KB)`);
    } catch (error) {
      failed++;
      console.log(`fail ${sound.name}: ${error.message}`);
    }
  }
}
console.log(`Generating ${todo.length} sounds...`);
await Promise.all(Array.from({ length: PARALLEL }, worker));
console.log(`Done: ${done} ok, ${failed} failed.`);
