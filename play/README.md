# 🎮 xLFr4n // MICRODOOM

## 🇪🇸 Español

MICRODOOM es un playground FPS retro original dentro del laboratorio público xLFr4n.

El objetivo es reproducir el tipo de experiencia y sensaciones mecánicas del DOOM clásico sin copiar sus recursos originales ni depender de su código.

### 🎯 Motor actual

- movimiento con aceleración, fricción y colisión;
- giro por mouse mediante Pointer Lock y por flechas;
- strafe con A/D;
- carrera con Shift;
- Fist, Pistol, Shotgun, Chaingun, Rocket Launcher, Plasma Rifle, BFG9000 y Chainsaw;
- daño hitscan y dispersión de escopeta;
- cuatro comportamientos enemigos diferenciados;
- proyectiles enemigos;
- pickups de salud, armadura, munición, armas y keycard;
- puertas normales y puerta azul bloqueada;
- automapa explorado;
- estados de título, partida, muerte y victoria;
- contador de kills/items;
- save/load local con F2/F3;
- sonido procedural mediante Web Audio;
- HUD retro, bob y recoil;
- captura y liberación del mouse.

### ⌨️ Controles

| Tecla | Acción |
|---|---|
| WASD | movimiento y strafe |
| Mouse | girar |
| ← / → | girar |
| Shift | correr |
| 1–8 | cambiar arma |
| Q | siguiente arma disponible |
| Click izquierdo | disparar |
| Espacio | disparar |
| E | usar puerta |
| Tab / M | automapa |
| P | pausa |
| Esc | liberar mouse / pausa |
| F2 | guardar |
| F3 | cargar |
| R | reiniciar |

### 🧪 Verificación

node --check play/microdoom.js
node tests/microdoom-static.mjs

---

## 🇺🇸 English

MICRODOOM is an original retro FPS playground inside the public xLFr4n lab.

The goal is to reproduce the feel and class of mechanics associated with classic DOOM without copying its original assets or external game code.

### Current engine

Movement physics, mouse look, strafing, sprinting, eight weapons, hitscan damage, shotgun spread, differentiated enemy behavior, enemy projectiles, pickups, doors, a blue keycard, automap, death/victory states, counters, local save/load, procedural Web Audio, retro HUD and weapon bob/recoil are implemented.

### Verification

node --check play/microdoom.js
node tests/microdoom-static.mjs

> ⚡ xLFr4n · Build the experiment · Verify the mechanics