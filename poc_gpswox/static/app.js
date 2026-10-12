let map = null;
let currentMarker = null;
let historyPolyline = null;
let liveTailPolyline = null;
let topSpeedMarker = null;
let clickPointMarker = null;
let autoRefreshTimer = null;
let currentDeviceId = 148550;

// Estado del Historial en memoria
let cachedHistoryPoints = [];
let activeHistoryRange = 'today';
let activeHistoryType = 'moving'; // 'moving' (defecto), 'top', 'all'

// Utilidad para extraer valores numéricos de strings como '25.47 Km' o '54 kph'
function parseNumeric(val, defaultVal = 0) {
  if (typeof val === 'number') return isNaN(val) ? defaultVal : val;
  if (typeof val === 'string') {
    const match = val.match(/([0-9.]+)/);
    if (match) {
      const parsed = parseFloat(match[1]);
      if (!isNaN(parsed)) return parsed;
    }
  }
  return defaultVal;
}

// Utilidad para obtener fecha local en formato YYYY-MM-DD sin desfase UTC
function getLocalDateString(d) {
  const date = d || new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  fetchDeviceStatus();
  fetchHistory('today');

  // Auto-refresh de telemetría en vivo cada 5 segundos
  autoRefreshTimer = setInterval(fetchDeviceStatus, 5000);

  // Botón manual de refresco
  document.getElementById('btn-refresh').addEventListener('click', () => {
    fetchDeviceStatus();
    fetchHistory(activeHistoryRange);
  });

  // Botón Raw JSON
  document.getElementById('btn-raw-json').addEventListener('click', openRawJsonModal);
  document.getElementById('btn-close-modal').addEventListener('click', closeRawJsonModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeRawJsonModal();
  });

  // Filtros de Rango de Fecha (Hoy, Ayer, 3 días)
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeHistoryRange = e.target.dataset.range;
      fetchHistory(activeHistoryRange);
    });
  });

  // Filtros de Tipo de Puntos (En Movimiento, Picos de Vel, Todos)
  document.querySelectorAll('.type-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.type-filter-btn').forEach(b => b.classList.remove('active'));
      const targetBtn = e.target.closest('.type-filter-btn');
      targetBtn.classList.add('active');
      activeHistoryType = targetBtn.dataset.type;
      renderHistoryListAndMarkers();
    });
  });

  // Click en Velocidad Máxima del resumen para hacer zoom en el mapa
  document.getElementById('hist-top-speed').addEventListener('click', () => {
    zoomToTopSpeed();
  });
});

// Inicializar Mapa Leaflet con OpenStreetMap en modo oscuro sin API key
function initMap() {
  const defaultPos = [-34.538149, -58.491524];

  map = L.map('map', {
    zoomControl: true,
    attributionControl: false
  }).setView(defaultPos, 16);

  // Capa OpenStreetMap nativa con clase leaflet-dark-tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    className: 'leaflet-dark-tiles'
  }).addTo(map);
}

// Obtener Estado en Vivo desde el Servidor de la PoC
async function fetchDeviceStatus() {
  const syncIndicator = document.getElementById('sync-indicator');
  syncIndicator.textContent = 'Sincronizando...';
  syncIndicator.style.color = '#38bdf8';

  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.success && data.device) {
      renderDevice(data.device);
      syncIndicator.textContent = `En vivo • ${new Date().toLocaleTimeString()}`;
      syncIndicator.style.color = '#34d399';
    }
  } catch (err) {
    console.error('Error al obtener estado:', err);
    syncIndicator.textContent = 'Error de conexión';
    syncIndicator.style.color = '#f43f5e';
  }
}

// Renderizar Datos en Pantalla y Marcador en Vivo
function renderDevice(dev) {
  // Textos del Banner
  document.getElementById('dev-name').textContent = dev.name || 'ACT001';
  document.getElementById('dev-imei').textContent = dev.imei || '-';
  document.getElementById('dev-model').textContent = dev.model || 'Teltonika ATC700';
  document.getElementById('dev-time').textContent = dev.last_update || '-';

  // Badge de Estado
  const badgeOnline = document.getElementById('dev-online-badge');
  if (dev.status === 'ONLINE') {
    badgeOnline.className = 'badge badge-online';
    badgeOnline.textContent = 'ONLINE (ACK)';
  } else {
    badgeOnline.className = 'badge';
    badgeOnline.style.background = 'rgba(244, 63, 94, 0.2)';
    badgeOnline.style.color = '#fb7185';
    badgeOnline.textContent = dev.status;
  }

  // KPIs con parseo numérico seguro
  const speedVal = parseNumeric(dev.speed, 0);
  document.getElementById('kpi-speed').textContent = `${speedVal.toFixed(1)} km/h`;
  document.getElementById('kpi-battery').textContent = `${dev.battery_volts || '3.5V'} (${dev.battery_pct || '30%'})`;
  document.getElementById('kpi-odometer').textContent = dev.total_distance || '0 km';
  document.getElementById('kpi-engine').textContent = dev.engine_hours || '0 hs';
  document.getElementById('kpi-driver').textContent = dev.driver || 'Fabian Bruno';

  // Actualizar Marcador en el Mapa
  if (dev.lat && dev.lng) {
    const lat = parseFloat(dev.lat);
    const lng = parseFloat(dev.lng);
    const latLng = [lat, lng];

    if (!currentMarker) {
      const iconHtml = `
        <div style="
          width: 38px; height: 38px; 
          background: #0284c7; 
          border: 3px solid #38bdf8; 
          border-radius: 50%; 
          display: flex; align-items: center; justify-content: center; 
          box-shadow: 0 0 16px rgba(56, 189, 248, 0.8);
          color: white; font-size: 16px;">
          📡
        </div>
      `;
      const customIcon = L.divIcon({
        className: 'custom-gps-marker',
        html: iconHtml,
        iconSize: [38, 38],
        iconAnchor: [19, 19]
      });

      currentMarker = L.marker(latLng, { icon: customIcon }).addTo(map);
      map.panTo(latLng);
    } else {
      currentMarker.setLatLng(latLng);
    }

    currentMarker.bindPopup(`
      <div style="font-family: sans-serif; font-size: 12px; line-height: 1.5;">
        <strong style="font-size: 14px; color: #38bdf8;">${dev.name} (${dev.model})</strong><br>
        <b>IMEI:</b> ${dev.imei}<br>
        <b>Velocidad actual:</b> ${speedVal.toFixed(1)} km/h<br>
        <b>Batería:</b> ${dev.battery_volts} (${dev.battery_pct})<br>
        <b>Conductor:</b> ${dev.driver}<br>
        <b>Último reporte:</b> ${dev.last_update}
      </div>
    `);

    // Dibujar estela / cola reciente (tail)
    if (dev.tail_coordinates && dev.tail_coordinates.length > 0) {
      if (liveTailPolyline) map.removeLayer(liveTailPolyline);
      liveTailPolyline = L.polyline(dev.tail_coordinates, {
        color: '#10b981',
        weight: 4,
        dashArray: '4, 6',
        opacity: 0.8
      }).addTo(map);
    }
  }
}

// Obtener Historial desde el Servidor de la PoC
async function fetchHistory(range) {
  const listEl = document.getElementById('history-events-list');
  listEl.innerHTML = '<div style="padding: 16px; text-align: center; color: #94a3b8; font-size: 12px;">Cargando historial de GPSWOX...</div>';

  const now = new Date();
  let fromDate = getLocalDateString(now);
  let toDate = getLocalDateString(now);

  if (range === 'yesterday') {
    const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    fromDate = getLocalDateString(yest);
    toDate = getLocalDateString(yest);
  } else if (range === '3days') {
    const past = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3);
    fromDate = getLocalDateString(past);
    toDate = getLocalDateString(now);
  }

  try {
    const res = await fetch(`/api/history?from_date=${fromDate}&to_date=${toDate}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const dist = parseNumeric(data.distance_sum, 0);
    const topSpeed = parseNumeric(data.top_speed, 0);
    cachedHistoryPoints = Array.isArray(data.points) ? data.points : [];

    document.getElementById('hist-distance').textContent = `${dist.toFixed(1)} km`;
    document.getElementById('hist-top-speed').textContent = `${topSpeed.toFixed(0)} km/h`;
    document.getElementById('hist-points-count').textContent = `${cachedHistoryPoints.length} puntos`;

    // Dibujar Polilínea de Recorrido Completo
    const latLngs = cachedHistoryPoints
      .map(p => [parseFloat(p.lat), parseFloat(p.lng)])
      .filter(pt => !isNaN(pt[0]) && !isNaN(pt[1]));

    if (historyPolyline) map.removeLayer(historyPolyline);
    if (latLngs.length > 0) {
      historyPolyline = L.polyline(latLngs, {
        color: '#38bdf8',
        weight: 5,
        opacity: 0.85
      }).addTo(map);

      map.fitBounds(historyPolyline.getBounds(), { padding: [40, 40] });
    }

    // Renderizar la lista filtrada y los marcadores destacados
    renderHistoryListAndMarkers();

  } catch (err) {
    console.error('Error al obtener historial:', err);
    listEl.innerHTML = `<div style="padding: 16px; text-align: center; color: #f43f5e; font-size: 12px;">Error al cargar historial: ${err.message}</div>`;
  }
}

// Renderizar la Lista de Eventos y Marcadores en Base al Tipo Seleccionado
function renderHistoryListAndMarkers() {
  const listEl = document.getElementById('history-events-list');
  if (!cachedHistoryPoints || cachedHistoryPoints.length === 0) {
    listEl.innerHTML = `
      <div style="padding: 24px; text-align: center; color: #64748b; font-size: 12px;">
        No se registraron movimientos en el período seleccionado.
      </div>
    `;
    return;
  }

  // Separar puntos en movimiento y totales
  const movingPoints = cachedHistoryPoints.filter(p => parseNumeric(p.speed, 0) > 0);
  const totalCount = cachedHistoryPoints.length;
  const movingCount = movingPoints.length;

  // Actualizar los contadores en los botones de filtro
  document.getElementById('badge-moving-count').textContent = `(${movingCount})`;
  document.getElementById('badge-all-count').textContent = `(${totalCount})`;

  // Encontrar el punto de Velocidad Máxima
  let topSpeedPoint = null;
  if (movingPoints.length > 0) {
    topSpeedPoint = movingPoints.reduce((max, p) => parseNumeric(p.speed, 0) > parseNumeric(max.speed, 0) ? p : max, movingPoints[0]);
  }

  // Marcador destacado de Velocidad Máxima en el mapa
  if (topSpeedPoint && parseNumeric(topSpeedPoint.speed, 0) > 0) {
    const topLat = parseFloat(topSpeedPoint.lat);
    const topLng = parseFloat(topSpeedPoint.lng);
    const topSpd = parseNumeric(topSpeedPoint.speed, 0);

    const iconHtml = `
      <div style="
        width: 32px; height: 32px; 
        background: #ef4444; 
        border: 2px solid #fee2e2; 
        border-radius: 50%; 
        display: flex; align-items: center; justify-content: center; 
        box-shadow: 0 0 14px rgba(239, 68, 68, 0.9);
        color: white; font-size: 14px; font-weight: 800; cursor: pointer;">
        ⚡
      </div>
    `;
    const topIcon = L.divIcon({
      className: 'top-speed-marker',
      html: iconHtml,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    if (topSpeedMarker) map.removeLayer(topSpeedMarker);
    topSpeedMarker = L.marker([topLat, topLng], { icon: topIcon }).addTo(map);
    topSpeedMarker.bindPopup(`
      <div style="font-family: sans-serif; font-size: 12px; line-height: 1.5;">
        <strong style="color: #ef4444; font-size: 13px;">⚡ Pico de Velocidad Máxima</strong><br>
        <b>Velocidad:</b> <span style="font-weight: 800; color: #f59e0b;">${topSpd} km/h</span><br>
        <b>Hora:</b> ${topSpeedPoint.time || '-'}<br>
        <b>Altitud:</b> ${parseNumeric(topSpeedPoint.altitude, 0)} m<br>
        <b>Coordenadas:</b> ${topLat.toFixed(5)}, ${topLng.toFixed(5)}
      </div>
    `);
  } else if (topSpeedMarker) {
    map.removeLayer(topSpeedMarker);
    topSpeedMarker = null;
  }

  // Filtrar lista según el tipo activo
  let displayList = [];
  if (activeHistoryType === 'moving') {
    displayList = movingPoints.slice().reverse();
  } else if (activeHistoryType === 'top') {
    displayList = movingPoints.slice().sort((a, b) => parseNumeric(b.speed, 0) - parseNumeric(a.speed, 0)).slice(0, 40);
  } else {
    // 'all' - Mostrar los más recientes
    displayList = cachedHistoryPoints.slice(-200).reverse();
  }

  // Si se eligió "En movimiento" pero no hubo movimiento
  if (displayList.length === 0) {
    listEl.innerHTML = `
      <div style="padding: 24px; text-align: center; color: #94a3b8; font-size: 12px;">
        ${activeHistoryType === 'moving' 
          ? '⚠️ El vehículo no registró movimientos (> 0 km/h) en este rango.<br><small style="color: #64748b;">(Hacé click en "Todos" para ver los registros estacionarios)</small>' 
          : 'No hay datos para mostrar.'}
      </div>
    `;
    return;
  }

  // Renderizar items con badges de velocidad destacados
  listEl.innerHTML = '';
  displayList.forEach(p => {
    const pLat = parseFloat(p.lat || 0);
    const pLng = parseFloat(p.lng || 0);
    const pSpeed = parseNumeric(p.speed, 0);
    const pAlt = parseNumeric(p.altitude, 0);

    let badgeClass = 'speed-badge-zero';
    let speedIcon = '🛑';
    if (pSpeed >= 40) {
      badgeClass = 'speed-badge-high';
      speedIcon = '⚡';
    } else if (pSpeed >= 15) {
      badgeClass = 'speed-badge-mid';
      speedIcon = '🚗';
    } else if (pSpeed > 0) {
      badgeClass = 'speed-badge-low';
      speedIcon = '🏃';
    }

    const item = document.createElement('div');
    item.className = 'event-item';
    item.innerHTML = `
      <div>
        <div class="event-time">${p.time || '-'}</div>
        <div class="event-coords">${pLat.toFixed(5)}, ${pLng.toFixed(5)}</div>
      </div>
      <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
        <span class="speed-badge ${badgeClass}">${speedIcon} ${pSpeed} km/h</span>
        <div style="font-size: 10px; color: #34d399;">Alt: ${pAlt}m</div>
      </div>
    `;

    item.addEventListener('click', () => {
      focusHistoryPoint(pLat, pLng, pSpeed, pAlt, p.time);
    });

    listEl.appendChild(item);
  });
}

// Hacer foco en un punto del mapa al hacer click en la lista
function focusHistoryPoint(lat, lng, speed, alt, time) {
  map.flyTo([lat, lng], 17, { duration: 1 });

  if (clickPointMarker) map.removeLayer(clickPointMarker);

  const iconHtml = `
    <div style="
      width: 24px; height: 24px; 
      background: #38bdf8; 
      border: 2px solid #ffffff; 
      border-radius: 50%; 
      box-shadow: 0 0 12px #38bdf8;
      display: flex; align-items: center; justify-content: center;
      color: #0f172a; font-size: 11px; font-weight: bold;">
      📍
    </div>
  `;
  const clickIcon = L.divIcon({
    className: 'click-point-marker',
    html: iconHtml,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  clickPointMarker = L.marker([lat, lng], { icon: clickIcon }).addTo(map);
  clickPointMarker.bindPopup(`
    <div style="font-family: sans-serif; font-size: 12px; line-height: 1.5;">
      <strong style="color: #38bdf8; font-size: 13px;">Punto del Recorrido</strong><br>
      <b>Velocidad:</b> <span style="font-weight: 800; color: #f59e0b;">${speed} km/h</span><br>
      <b>Hora:</b> ${time || '-'}<br>
      <b>Altitud:</b> ${alt} m<br>
      <b>Coordenadas:</b> ${lat.toFixed(5)}, ${lng.toFixed(5)}
    </div>
  `).openPopup();
}

// Zoom directo al punto de velocidad máxima
function zoomToTopSpeed() {
  if (topSpeedMarker) {
    map.flyTo(topSpeedMarker.getLatLng(), 17);
    topSpeedMarker.openPopup();
  }
}

// Modal Raw JSON
async function openRawJsonModal() {
  const modal = document.getElementById('modal-overlay');
  const codeEl = document.getElementById('raw-json-code');
  codeEl.textContent = 'Consultando payload completo en GPSWOX...';
  modal.style.display = 'flex';

  try {
    const res = await fetch('/api/raw');
    const data = await res.json();
    codeEl.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    codeEl.textContent = `Error obteniendo datos crudos: ${err.message}`;
  }
}

function closeRawJsonModal() {
  document.getElementById('modal-overlay').style.display = 'none';
}
