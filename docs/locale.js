const messages = new Map(Object.entries({
    "Enable audio": "Activar audio",
    "Change radio station": "Cambiar de emisora",
    "Driving time": "Tiempo de conducción",
    "♥ Health": "♥ Salud",
    "Health": "Salud",
    "Compass": "Brújula",
    "Minimap, north up": "Minimapa, norte arriba",
    "Touch controls": "Controles táctiles",
    "Steer left": "Girar a la izquierda",
    "Steer right": "Girar a la derecha",
    "Horn": "Claxon",
    "Game menu": "Menú del juego",
    "Brake": "Frenar",
    "Drive": "Acelerar",
    "Paused": "Pausa",
    "Resume": "Seguir",
    "Press Start to resume": "Pulsa Start para seguir",
    "Settings": "Configuración",
    "Use physical controller": "Usar mando",
    "Use touch controls": "Usar controles táctiles",
    "Restart": "Reiniciar",
    "Return to catalog": "Volver al catálogo",
    "Car disabled": "Coche averiado",
    "Press × to restart": "Pulsa × para reiniciar",
    "Could not start the 3D game": "No se han podido iniciar los gráficos 3D",
    "WebGL graphics are not available on this device.": "Este dispositivo no admite gráficos WebGL.",
    "Speed limit": "Límite de velocidad",
    "Vehicle damage": "Daños del vehículo",
    "Sound effects": "Efectos de sonido",
    "Minimap": "Minimapa",
    "On": "Sí",
    "Off": "No",
    "△ Radio off": "△ Radio apagada",
    "← → Choose · × Confirm · Select Back": "← → Elegir · × Confirmar · Select Volver",
    "← → Choose · Enter Confirm · Esc Back": "← → Elegir · Intro Confirmar · Esc Volver",
    "Into the water!": "¡Al agua!",
    "Back on the road": "De vuelta a la carretera",
    "Car repaired!": "¡Coche reparado!",
    "Stop in the driveway for repairs": "Para en la entrada del taller para reparar el coche",
    "Nicely parked!": "¡Bien aparcado!",
    "W": "O",
    "NW": "NO",
    "SW": "SO"
}));
const preference = 'little-drive.language';
let language = 'en';
try {
    const saved = localStorage.getItem(preference);
    if (saved === 'en' || saved === 'es') language = saved;
} catch {}

export const t = text => language === 'en' ? text : messages.get(text) ?? text;
export const languageOption = () => language === 'es' ? 'Idioma: Español' : 'Language: English';

function capture(root) {
    const bindings = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const source = node.data.trim();
        if (messages.has(source) && !node.parentElement?.closest('script, style')) {
            bindings.push(() => { node.data = node.data.replace(node.data.trim(), t(source)); });
        }
    }
    for (const node of root.querySelectorAll('[aria-label], [title]')) {
        for (const attr of ['aria-label', 'title']) {
            const source = node.getAttribute(attr);
            if (messages.has(source)) bindings.push(() => node.setAttribute(attr, t(source)));
        }
    }
    return bindings;
}

const page = capture(document.body);
function applyLanguage() {
    document.documentElement.lang = language;
    page.forEach(update => update());
}
applyLanguage();

export function toggleLanguage() {
    language = language === 'es' ? 'en' : 'es';
    try { localStorage.setItem(preference, language); } catch {}
    applyLanguage();
}
