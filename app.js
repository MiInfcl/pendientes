/* Pendientes · lista de tareas que vive en el navegador */
(() => {
  "use strict";

  const CLAVE = "pendientes.v1";
  const $ = (s, r = document) => r.querySelector(s);
  const lista = $("#lista");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- estado y guardado ---------- */
  let estado = { tareas: [], filtro: "todas", uid: null };
  let puedeGuardar = true;

  function cargar() {
    try {
      const crudo = localStorage.getItem(CLAVE);
      if (!crudo) return;
      const d = JSON.parse(crudo);
      if (d && Array.isArray(d.tareas)) {
        estado.tareas = normalizar(d.tareas);
      }
      estado.uid = d && typeof d.uid === "string" ? d.uid : null;
      if (["todas", "pendientes", "hechas"].includes(d && d.filtro)) estado.filtro = d.filtro;
    } catch (e) { /* datos dañados o sin acceso: se parte de cero */ }
  }
  function normalizar(lista) {
    return lista
      .filter(t => t && typeof t.texto === "string")
      .map(t => ({ id: String(t.id || nuevoId()), texto: t.texto.slice(0, 200), hecha: !!t.hecha, fecha: esFecha(t.fecha) ? t.fecha : "" }));
  }
  // guarda en el navegador y, si hay cuenta, sube a la nube
  function guardar() {
    guardarLocal();
    if (sesion && nube) programarSubida();
  }
  function guardarLocal() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(estado));
      if (!puedeGuardar) { puedeGuardar = true; $("#aviso-guardado").hidden = true; }
    } catch (e) {
      puedeGuardar = false;
      $("#aviso-guardado").hidden = false;
    }
  }
  function nuevoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esFecha(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }

  /* ---------- fechas ---------- */
  const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
  function hoyISO() { const d = new Date(); return iso(d); }
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function deISO(s) { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); }
  function diasHasta(s) { return Math.round((deISO(s) - deISO(hoyISO())) / 86400000); }
  function corta(s) {
    const d = deISO(s), hoy = new Date();
    let t = DIAS[d.getDay()] + " " + d.getDate() + " " + MESES[d.getMonth()];
    if (d.getFullYear() !== hoy.getFullYear()) t += " " + d.getFullYear();
    return t;
  }
  function textoFecha(s) {
    const n = diasHasta(s);
    if (n === 0) return { t: "Hoy", c: "hoy" };
    if (n === 1) return { t: "Mañana", c: "" };
    if (n === -1) return { t: "Venció ayer", c: "vencida" };
    if (n < -1) return { t: "Venció el " + corta(s), c: "vencida" };
    return { t: corta(s), c: "" };
  }

  /* ---------- pintar ---------- */
  const tFila = $("#t-fila");
  let recienHecha = null, recienAgregada = null;

  function visibles() {
    const f = estado.filtro;
    return estado.tareas.filter(t => f === "todas" || (f === "hechas" ? t.hecha : !t.hecha));
  }

  function posiciones() {
    const m = new Map();
    for (const li of lista.children) m.set(li.dataset.id, li.getBoundingClientRect().top);
    return m;
  }

  function pintar({ animar = true } = {}) {
    const antes = animar && !reduce.matches ? posiciones() : null;
    const foco = document.activeElement;
    const focoId = foco && foco.closest && foco.closest(".fila") ? foco.closest(".fila").dataset.id : null;
    const focoClase = foco && foco.classList ? [...foco.classList].find(c => ["ranura", "texto", "asa"].includes(c)) : null;

    const vs = visibles();
    const frag = document.createDocumentFragment();
    for (const t of vs) frag.appendChild(fila(t));
    lista.replaceChildren(frag);

    if (antes) {
      for (const li of lista.children) {
        const a = antes.get(li.dataset.id);
        if (a === undefined) continue;
        const dy = a - li.getBoundingClientRect().top;
        if (Math.abs(dy) < 1) continue;
        li.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 300, easing: "cubic-bezier(.22,1,.36,1)" });
      }
    }
    if (focoId && focoClase) {
      const el = lista.querySelector(`[data-id="${focoId}"] .${focoClase}`);
      if (el) el.focus({ preventScroll: true });
    }
    recienHecha = recienAgregada = null;
    cabecera();
    vacio(vs.length);
  }

  function fila(t) {
    const li = tFila.content.firstElementChild.cloneNode(true);
    li.dataset.id = t.id;
    li.classList.toggle("hecha", t.hecha);
    if (t.id === recienHecha) li.classList.add("recien");
    if (t.id === recienAgregada && !reduce.matches) li.classList.add("entra");
    const r = $(".ranura", li);
    r.setAttribute("aria-checked", String(t.hecha));
    r.setAttribute("aria-label", (t.hecha ? "Marcar como pendiente: " : "Marcar como hecha: ") + t.texto);
    const tx = $(".texto", li);
    tx.textContent = t.texto;
    tx.setAttribute("aria-label", "Editar: " + t.texto);
    const v = $(".vence", li);
    if (t.fecha) { const f = textoFecha(t.fecha); v.textContent = f.t; if (f.c && !t.hecha) v.classList.add(f.c); }
    $(".asa", li).setAttribute("aria-label", "Mover «" + t.texto + "». Arrastra o usa las flechas.");
    return li;
  }

  function cabecera() {
    const total = estado.tareas.length;
    const hechas = estado.tareas.filter(t => t.hecha).length;
    const pend = total - hechas;
    const c = $("#cuenta");
    if (!total) c.textContent = "Nada anotado";
    else if (!pend) c.innerHTML = "<b>Todo en su lugar</b> · " + total + (total === 1 ? " tarea hecha" : " tareas hechas");
    else c.innerHTML = "<b>" + hechas + "</b> de " + total + " en su lugar";
    document.querySelectorAll(".filtro").forEach(b => b.setAttribute("aria-selected", String(b.dataset.f === estado.filtro)));
    $('[data-n="todas"]').textContent = total;
    $('[data-n="pendientes"]').textContent = pend;
    $('[data-n="hechas"]').textContent = hechas;
    $("#limpiar").hidden = !hechas || estado.filtro === "pendientes";
    document.title = pend ? "Pendientes (" + pend + ")" : "Pendientes";
  }

  function vacio(n) {
    const v = $("#vacio");
    v.hidden = n > 0;
    if (n) return;
    const total = estado.tareas.length;
    const [t, s] =
      !total ? ["Tablero vacío", "Anota arriba lo primero que tengas pendiente. Se guarda en este navegador."]
      : estado.filtro === "pendientes" ? ["Todo en su lugar", "No te queda nada pendiente."]
      : ["Todavía nada hecho", "Toca la ranura de una tarea para marcarla."];
    $("#vacio-t").textContent = t;
    $("#vacio-s").textContent = s;
  }

  /* ---------- agregar ---------- */
  const form = $("#agregar"), entrada = $("#nueva"), nFecha = $("#nueva-fecha");

  function mostrarFechaNueva() {
    const p = $("#fecha-elegida");
    if (nFecha.value) {
      $("#fecha-elegida-txt").textContent = "Fecha límite: " + textoFecha(nFecha.value).t.replace("Venció", "venció");
      p.hidden = false;
      $("#btn-fecha").classList.add("activo");
    } else {
      p.hidden = true;
      $("#btn-fecha").classList.remove("activo");
    }
  }
  $("#btn-fecha").addEventListener("click", () => {
    try { if (nFecha.showPicker) { nFecha.showPicker(); return; } } catch (e) { /* sigue abajo */ }
    nFecha.style.pointerEvents = "auto"; nFecha.focus(); nFecha.click();
  });
  nFecha.addEventListener("change", mostrarFechaNueva);
  $("#quitar-fecha").addEventListener("click", () => { nFecha.value = ""; mostrarFechaNueva(); entrada.focus(); });

  form.addEventListener("submit", e => {
    e.preventDefault();
    const texto = entrada.value.trim().replace(/\s+/g, " ");
    if (!texto) { entrada.focus(); return; }
    const t = { id: nuevoId(), texto, hecha: false, fecha: esFecha(nFecha.value) ? nFecha.value : "" };
    estado.tareas.unshift(t);
    if (estado.filtro === "hechas") estado.filtro = "todas";
    recienAgregada = t.id;
    entrada.value = ""; nFecha.value = ""; mostrarFechaNueva();
    guardar(); pintar();
    entrada.focus();
  });

  /* ---------- filtros ---------- */
  document.querySelectorAll(".filtro").forEach(b => b.addEventListener("click", () => {
    if (estado.filtro === b.dataset.f) return;
    estado.filtro = b.dataset.f; guardar(); pintar({ animar: false });
  }));
  $(".filtros").addEventListener("keydown", e => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const bs = [...document.querySelectorAll(".filtro")];
    const i = bs.indexOf(document.activeElement);
    if (i < 0) return;
    const j = (i + (e.key === "ArrowRight" ? 1 : -1) + bs.length) % bs.length;
    bs[j].focus(); bs[j].click();
  });

  /* ---------- acciones en la lista ---------- */
  const buscar = id => estado.tareas.find(t => t.id === id);

  lista.addEventListener("click", e => {
    const li = e.target.closest(".fila");
    if (!li || li.classList.contains("editando")) return;
    const t = buscar(li.dataset.id);
    if (!t) return;
    if (e.target.closest(".ranura")) {
      t.hecha = !t.hecha;
      if (t.hecha) recienHecha = t.id;
      guardar();
      if (estado.filtro !== "todas") {
        // se va de esta vista: primero se ve el cambio, después sale
        li.classList.toggle("hecha", t.hecha);
        li.classList.add("recien");
        $(".ranura", li).setAttribute("aria-checked", String(t.hecha));
        cabecera();
        setTimeout(() => quitarFila(li, () => pintar()), reduce.matches ? 0 : 420);
      } else pintar();
    } else if (e.target.closest(".texto")) {
      abrirEditor(li, t);
    }
  });

  function quitarFila(li, luego) {
    if (reduce.matches || !li.isConnected) { luego(); return; }
    li.classList.add("sale");
    let hecho = false;
    const fin = () => { if (!hecho) { hecho = true; luego(); } };
    li.addEventListener("animationend", e => { if (e.target === li) fin(); });
    setTimeout(fin, 320); // por si la animación no corre (pestaña oculta)
  }

  /* ---------- editar ---------- */
  const tEditor = $("#t-editor");
  let editando = null;

  function abrirEditor(li, t) {
    if (editando) cerrarEditor(true);
    const ed = tEditor.content.firstElementChild.cloneNode(true);
    const inTx = $(".ed-texto", ed), inF = $(".ed-fecha-in", ed);
    inTx.value = t.texto;
    inF.value = t.fecha || "";
    $(".ed-sin-fecha", ed).hidden = !t.fecha;
    li.classList.add("editando");
    li.replaceChildren(ed);
    editando = { li, id: t.id, ed };
    inTx.focus();
    inTx.setSelectionRange(inTx.value.length, inTx.value.length);

    inF.addEventListener("change", () => { $(".ed-sin-fecha", ed).hidden = !inF.value; });
    $(".ed-sin-fecha", ed).addEventListener("click", () => { inF.value = ""; $(".ed-sin-fecha", ed).hidden = true; inTx.focus(); });
    $(".ed-borrar", ed).addEventListener("click", () => { editando = null; borrar([t.id], li); });
    ed.addEventListener("submit", e => { e.preventDefault(); cerrarEditor(true); });
    ed.addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); cerrarEditor(false); } });
  }

  function cerrarEditor(guardarCambios) {
    if (!editando) return;
    const { id, ed } = editando;
    editando = null;
    const t = buscar(id);
    if (t && guardarCambios) {
      const texto = $(".ed-texto", ed).value.trim().replace(/\s+/g, " ");
      const f = $(".ed-fecha-in", ed).value;
      if (texto) t.texto = texto.slice(0, 200);
      t.fecha = esFecha(f) ? f : "";
      guardar();
    }
    pintar({ animar: false });
    aplicarEntrante();
    const el = lista.querySelector(`[data-id="${id}"] .texto`);
    if (el) el.focus({ preventScroll: true });
  }

  // tocar fuera del editor lo guarda
  document.addEventListener("pointerdown", e => {
    if (editando && !editando.li.contains(e.target) && !e.target.closest(".toast")) cerrarEditor(true);
  });

  /* ---------- borrar con deshacer ---------- */
  let deshacer = null, timerToast = 0;

  function borrar(ids, li) {
    const quitadas = [];
    estado.tareas.forEach((t, i) => { if (ids.includes(t.id)) quitadas.push({ t, i }); });
    if (!quitadas.length) return;
    estado.tareas = estado.tareas.filter(t => !ids.includes(t.id));
    guardar();
    deshacer = quitadas;
    const msg = quitadas.length === 1 ? "Borraste «" + quitadas[0].t.texto + "»" : "Quitaste " + quitadas.length + " tareas hechas";
    if (li) quitarFila(li, () => pintar()); else pintar();
    toast(msg);
  }

  function toast(msg, { conDeshacer = true } = {}) {
    const el = $("#toast");
    $("#toast-t").textContent = msg;
    $("#toast-deshacer").hidden = !conDeshacer;
    if (!conDeshacer) deshacer = null;
    el.hidden = false;
    el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
    clearTimeout(timerToast);
    timerToast = setTimeout(cerrarToast, 7000);
  }
  function cerrarToast() { $("#toast").hidden = true; deshacer = null; clearTimeout(timerToast); }

  $("#toast-deshacer").addEventListener("click", () => {
    if (!deshacer) return;
    deshacer.sort((a, b) => a.i - b.i).forEach(({ t, i }) => estado.tareas.splice(Math.min(i, estado.tareas.length), 0, t));
    if (deshacer.length === 1) recienAgregada = deshacer[0].t.id;
    deshacer = null;
    guardar(); pintar();
    cerrarToast();
  });
  $("#toast-cerrar").addEventListener("click", cerrarToast);
  $("#toast").addEventListener("pointerenter", () => clearTimeout(timerToast));
  $("#toast").addEventListener("pointerleave", () => { timerToast = setTimeout(cerrarToast, 3000); });

  $("#limpiar").addEventListener("click", () => {
    borrar(estado.tareas.filter(t => t.hecha).map(t => t.id));
  });

  /* ---------- reordenar ---------- */
  // mueve las tareas visibles dentro de sus mismos lugares del arreglo completo
  function reordenarVisibles(ordenIds) {
    const set = new Set(ordenIds);
    const huecos = [];
    estado.tareas.forEach((t, i) => { if (set.has(t.id)) huecos.push(i); });
    const porId = new Map(estado.tareas.map(t => [t.id, t]));
    const nuevo = estado.tareas.slice();
    huecos.forEach((pos, k) => { nuevo[pos] = porId.get(ordenIds[k]); });
    estado.tareas = nuevo;
    guardar();
  }

  // teclado: flechas sobre el asa
  lista.addEventListener("keydown", e => {
    const asa = e.target.closest(".asa");
    if (!asa || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const ids = [...lista.children].map(li => li.dataset.id);
    const id = asa.closest(".fila").dataset.id;
    const i = ids.indexOf(id), j = i + (e.key === "ArrowUp" ? -1 : 1);
    if (j < 0 || j >= ids.length) return;
    ids.splice(i, 1); ids.splice(j, 0, id);
    reordenarVisibles(ids);
    pintar();
  });

  // arrastre con dedo o mouse
  let arr = null;
  lista.addEventListener("pointerdown", e => {
    const asa = e.target.closest(".asa");
    if (!asa || e.button > 0 || editando) return;
    e.preventDefault();
    const li = asa.closest(".fila");
    const filas = [...lista.children];
    const rects = filas.map(f => f.getBoundingClientRect());
    arr = {
      li, pid: e.pointerId, y0: e.clientY, scroll0: scrollY,
      filas, rects, desde: filas.indexOf(li), hasta: filas.indexOf(li),
      paso: rects.length > 1 ? rects[1].top - rects[0].top : rects[0].height + 8,
      alto: rects[filas.indexOf(li)].height + 8
    };
    asa.setPointerCapture(e.pointerId);
    li.classList.add("arrastrando");
    lista.classList.add("ordenando");
    document.body.classList.add("agarrando");
    if (navigator.vibrate) try { navigator.vibrate(8); } catch (_) {}
    requestAnimationFrame(autoScroll);
  });

  function moverArrastre(clientY) {
    if (!arr) return;
    arr.yUlt = clientY;
    const dy = clientY - arr.y0 + (scrollY - arr.scroll0);
    arr.li.style.transform = `translateY(${dy}px) scale(1.015)`;
    const r0 = arr.rects[arr.desde];
    const centro = r0.top + r0.height / 2 + dy;
    let hasta = arr.desde;
    arr.rects.forEach((r, i) => {
      const c = r.top + r.height / 2;
      if (i < arr.desde && centro < c) hasta = Math.min(hasta, i);
      if (i > arr.desde && centro > c) hasta = Math.max(hasta, i);
    });
    arr.hasta = hasta;
    arr.filas.forEach((f, i) => {
      if (f === arr.li) return;
      let t = 0;
      if (arr.desde < hasta && i > arr.desde && i <= hasta) t = -arr.alto;
      if (arr.desde > hasta && i < arr.desde && i >= hasta) t = arr.alto;
      f.style.transform = t ? `translateY(${t}px)` : "";
    });
  }
  lista.addEventListener("pointermove", e => { if (arr && e.pointerId === arr.pid) moverArrastre(e.clientY); });

  function autoScroll() {
    if (!arr) return;
    const y = arr.yUlt, m = 70, h = innerHeight;
    if (y !== undefined) {
      let v = 0;
      if (y < m) v = -Math.ceil((m - y) / 6);
      else if (y > h - m) v = Math.ceil((y - (h - m)) / 6);
      if (v) { scrollBy(0, v); moverArrastre(y); }
    }
    requestAnimationFrame(autoScroll);
  }

  function soltar(e) {
    if (!arr || (e && e.pointerId !== arr.pid)) return;
    const { filas, desde, hasta, li } = arr;
    arr = null;
    document.body.classList.remove("agarrando");
    lista.classList.remove("ordenando");
    li.classList.remove("arrastrando");
    if (desde !== hasta) {
      const ids = filas.map(f => f.dataset.id);
      const [id] = ids.splice(desde, 1);
      ids.splice(hasta, 0, id);
      reordenarVisibles(ids);
    }
    pintar(); // las filas se deslizan desde donde quedaron
    aplicarEntrante();
    const asa = lista.querySelector(`[data-id="${li.dataset.id}"] .asa`);
    if (asa) asa.focus({ preventScroll: true });
  }
  lista.addEventListener("pointerup", soltar);
  lista.addEventListener("pointercancel", soltar);

  /* ---------- cuenta de Google (opcional) ---------- */
  let nube = null, sesion = null, timerSubida = 0, sucio = false, entrante = null;

  function textoSync(t, esperando) {
    const p = $("#sync");
    p.hidden = !t;
    $("#sync-t").textContent = t || "";
    p.classList.toggle("esperando", !!esperando);
  }

  function programarSubida() {
    sucio = true;
    textoSync(navigator.onLine ? "Guardando…" : "Sin conexión: se sube al volver", true);
    clearTimeout(timerSubida);
    timerSubida = setTimeout(subir, 400);
  }
  async function subir() {
    clearTimeout(timerSubida);
    if (!sesion || !nube) return;
    const p = nube.guardar(estado.tareas);
    sucio = false; // setDoc ya dejó la lista en la caché local; lo que llegue después la incluye
    try { await p; textoSync("Guardado en tu cuenta"); }
    catch (e) { textoSync("No se pudo guardar en tu cuenta"); console.warn(e); }
  }

  function aplicarEntrante() {
    if (!entrante || editando || arr || sucio) return;
    const nuevas = normalizar(entrante);
    entrante = null;
    if (JSON.stringify(nuevas) === JSON.stringify(estado.tareas)) return;
    estado.tareas = nuevas;
    guardarLocal();
    pintar();
  }

  function mostrarAcceso() {
    $("#acceso").hidden = false;
    $("#entrar").hidden = !!sesion;
    $("#avatar").hidden = !sesion;
    if (!sesion) { cerrarMenu(); textoSync(""); return; }
    const av = $("#avatar");
    let img = av.querySelector("img");
    if (sesion.foto) {
      if (!img) { img = document.createElement("img"); img.alt = ""; img.referrerPolicy = "no-referrer"; av.prepend(img); }
      img.src = sesion.foto;
    } else if (img) img.remove();
    $("#avatar-ini").textContent = sesion.foto ? "" : (sesion.nombre || sesion.email || "?").trim().charAt(0).toUpperCase();
    $("#avatar").setAttribute("aria-label", "Tu cuenta: " + (sesion.email || sesion.nombre || ""));
    $("#mc-nombre").textContent = sesion.nombre || "Tu cuenta";
    $("#mc-correo").textContent = sesion.email || "";
  }

  async function alUsuario(u) {
    if (!u) {
      if (estado.uid) {
        // al salir, la lista de la cuenta no se queda en este navegador
        estado.uid = null; estado.tareas = []; entrante = null;
        guardarLocal(); pintar();
      }
      sesion = null; mostrarAcceso();
      return;
    }
    sesion = u; mostrarAcceso();
    if (estado.uid === u.uid) { textoSync("Guardado en tu cuenta"); return; }
    textoSync("Sincronizando…", true);
    let remotas;
    try { remotas = normalizar(await nube.leer() || []); }
    catch (e) { console.warn(e); alError(e); return; }
    const locales = estado.uid ? [] : estado.tareas; // si era de otra cuenta, no se mezcla
    const ids = new Set(remotas.map(t => t.id));
    const nuevas = locales.filter(t => !ids.has(t.id));
    estado.tareas = [...nuevas, ...remotas];
    estado.uid = u.uid;
    guardarLocal(); pintar();
    if (nuevas.length) {
      await subir();
      toast(nuevas.length === 1 ? "Subiste 1 tarea a tu cuenta" : "Subiste " + nuevas.length + " tareas a tu cuenta", { conDeshacer: false });
    } else textoSync("Guardado en tu cuenta");
  }

  function alLista({ tareas, pendiente }) {
    if (estado.uid !== (sesion && sesion.uid)) return; // todavía mezclando
    if (tareas) { entrante = tareas; aplicarEntrante(); }
    if (pendiente) textoSync(navigator.onLine ? "Guardando…" : "Sin conexión: se sube al volver", true);
    else if (!sucio) textoSync("Guardado en tu cuenta");
  }

  function alError(e) {
    console.warn(e);
    textoSync(e && e.code === "permission-denied" ? "La cuenta todavía no acepta Pendientes" : "No se pudo sincronizar");
  }

  $("#entrar").addEventListener("click", async () => {
    if (!nube) return;
    const b = $("#entrar");
    b.disabled = true;
    try { await nube.entrar(); }
    catch (e) {
      const c = e && e.code;
      if (c !== "auth/popup-closed-by-user" && c !== "auth/cancelled-popup-request") {
        toast(c === "auth/unauthorized-domain" ? "Este sitio aún no está autorizado en la cuenta de Taller" : "No se pudo entrar con Google", { conDeshacer: false });
        console.warn(e);
      }
    } finally { b.disabled = false; }
  });

  function abrirMenu() { $("#menu-cuenta").hidden = false; $("#avatar").setAttribute("aria-expanded", "true"); $("#cerrar-menu").focus(); }
  function cerrarMenu() { $("#menu-cuenta").hidden = true; $("#avatar").setAttribute("aria-expanded", "false"); }
  $("#avatar").addEventListener("click", () => { if ($("#menu-cuenta").hidden) abrirMenu(); else cerrarMenu(); });
  $("#cerrar-menu").addEventListener("click", () => { cerrarMenu(); $("#avatar").focus(); });
  $("#menu-cuenta").addEventListener("keydown", e => { if (e.key === "Escape") { cerrarMenu(); $("#avatar").focus(); } });
  document.addEventListener("pointerdown", e => { if (!$("#menu-cuenta").hidden && !e.target.closest(".acceso")) cerrarMenu(); });
  $("#salir").addEventListener("click", async () => {
    cerrarMenu();
    if (sucio) await subir();
    try { await nube.salir(); } catch (e) { console.warn(e); }
  });
  addEventListener("online", () => { if (sesion && $("#sync-t").textContent.startsWith("Sin conexión")) textoSync("Guardando…", true); });

  function iniciarNube() {
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg) return;
    import("./nube.js?v=7").then(m => {
      nube = m;
      mostrarAcceso();
      nube.iniciar(cfg, { alUsuario, alLista, alError });
    }).catch(e => console.warn("Sin cuenta: no cargó Firebase", e));
  }

  /* ---------- inicio ---------- */
  cargar();
  try { localStorage.setItem(CLAVE + ".prueba", "1"); localStorage.removeItem(CLAVE + ".prueba"); }
  catch (e) { puedeGuardar = false; $("#aviso-guardado").hidden = false; }
  pintar({ animar: false });
  iniciarNube();

  // al volver otro día, las fechas («Hoy», «Venció») se recalculan
  let diaVisto = hoyISO();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && hoyISO() !== diaVisto && !editando) { diaVisto = hoyISO(); pintar({ animar: false }); }
  });
  // otra pestaña cambió la lista
  addEventListener("storage", e => { if (e.key === CLAVE && !editando) { cargar(); pintar({ animar: false }); } });
})();
