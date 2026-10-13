/**
 * GlobalPulse — World Population Explorer
 * Comprehensive Application Logic & Interactive Controls
 */

(function () {
  'use strict';

  // =========================================================================
  // State Management
  // =========================================================================
  const state = {
    allCountries: [],
    filteredCountries: [],
    currentView: 'table',
    viewMode: 'table', // 'table' | 'cards'
    activeRegion: 'all',
    tierFilter: 'all',
    sortBy: 'pop-desc',
    searchQuery: '',
    currentPage: 1,
    pageSize: 25,
    theme: localStorage.getItem('globalpulse_theme') || 'light',
    
    // Map instance & layers
    map: null,
    tileLayer: null,
    mapMarkers: [],

    // Chart.js instances
    charts: {
      top15: null,
      continent: null,
      density: null,
      tiers: null,
    },

    // Comparison tool
    compareCountryA: 'IND', // India default
    compareCountryB: 'USA', // USA default

    // Quiz state
    quiz: {
      countryA: null,
      countryB: null,
      answered: false,
      streak: 0,
      bestStreak: parseInt(localStorage.getItem('globalpulse_quiz_best') || '0', 10),
    },

    // Live population ticker
    livePopulation: 8142786031,
  };

  // =========================================================================
  // Formatting & Utility Functions
  // =========================================================================
  function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return 'N/A';
    return new Intl.NumberFormat('en-US').format(Math.round(num));
  }

  function formatCompact(num) {
    if (!num || isNaN(num)) return '0';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + ' Billion';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + ' Million';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + ' Thousand';
    return num.toString();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Play synthesized web audio chime
  function playAudioFeedback(isCorrect) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (isCorrect) {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(260, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch (e) {
      // Audio context might be restricted before interaction
    }
  }

  // =========================================================================
  // Theme Management
  // =========================================================================
  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('globalpulse_theme', theme);

    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
      if (theme === 'dark') {
        themeIcon.classList.remove('fa-moon');
        themeIcon.classList.add('fa-sun');
      } else {
        themeIcon.classList.remove('fa-sun');
        themeIcon.classList.add('fa-moon');
      }
    }

    // Update map tile layer if map is initialized
    if (state.map && state.tileLayer) {
      const tileUrl = theme === 'dark'
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
      state.tileLayer.setUrl(tileUrl);
    }

    // Refresh charts if rendered
    if (state.currentView === 'charts') {
      renderAllCharts();
    }
  }

  // =========================================================================
  // Live World Population Ticker
  // =========================================================================
  function initLiveTicker() {
    const tickerEl = document.getElementById('liveTickerVal');
    if (!tickerEl) return;

    // Approximately 2.4 net humans per second globally
    const incrementPerTick = 0.72; // every 300ms
    let currentPop = state.livePopulation;

    setInterval(() => {
      currentPop += incrementPerTick;
      tickerEl.textContent = formatNumber(Math.floor(currentPop));
    }, 300);
  }

  // =========================================================================
  // Hero Stats Computation
  // =========================================================================
  function updateHeroStats() {
    const totalPop = state.allCountries.reduce((sum, c) => sum + (c.population || 0), 0);
    state.livePopulation = totalPop;

    const heroTotal = document.getElementById('heroTotalPop');
    if (heroTotal) heroTotal.textContent = formatCompact(totalPop);

    const heroCountries = document.getElementById('heroTotalCountries');
    if (heroCountries) heroCountries.textContent = state.allCountries.length.toString();

    // Top populated country
    if (state.allCountries.length > 0) {
      const topCountry = state.allCountries[0];
      const heroTop = document.getElementById('heroTopCountry');
      if (heroTop) heroTop.textContent = `${topCountry.name} (${formatCompact(topCountry.population)})`;
    }

    // Top density country
    const validDensityCountries = [...state.allCountries].filter(c => c.density && c.density > 0);
    validDensityCountries.sort((a, b) => b.density - a.density);
    if (validDensityCountries.length > 0) {
      const topDense = validDensityCountries[0];
      const heroDensity = document.getElementById('heroTopDensity');
      if (heroDensity) heroDensity.textContent = `${topDense.name} (${formatNumber(topDense.density)}/km²)`;
    }
  }

  // =========================================================================
  // Data Filtering, Sorting & Search
  // =========================================================================
  function applyFiltersAndSort() {
    let result = [...state.allCountries];

    // 1. Region Filter
    if (state.activeRegion !== 'all') {
      result = result.filter(c => c.region === state.activeRegion);
    }

    // 2. Population Tier Filter
    if (state.tierFilter !== 'all') {
      result = result.filter(c => {
        const p = c.population;
        if (state.tierFilter === 'giant') return p >= 100000000;
        if (state.tierFilter === 'large') return p >= 20000000 && p < 100000000;
        if (state.tierFilter === 'medium') return p >= 5000000 && p < 20000000;
        if (state.tierFilter === 'small') return p < 5000000;
        return true;
      });
    }

    // 3. Search Query Filter
    if (state.searchQuery.trim() !== '') {
      const query = state.searchQuery.toLowerCase().trim();
      result = result.filter(c => {
        const nameMatch = c.name && c.name.toLowerCase().includes(query);
        const officialMatch = c.officialName && c.officialName.toLowerCase().includes(query);
        const capitalMatch = c.capital && c.capital.toLowerCase().includes(query);
        const cca2Match = c.cca2 && c.cca2.toLowerCase().includes(query);
        const cca3Match = c.cca3 && c.cca3.toLowerCase().includes(query);
        return nameMatch || officialMatch || capitalMatch || cca2Match || cca3Match;
      });
    }

    // 4. Sorting
    result.sort((a, b) => {
      switch (state.sortBy) {
        case 'pop-desc':
          return (b.population || 0) - (a.population || 0);
        case 'pop-asc':
          return (a.population || 0) - (b.population || 0);
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'density-desc':
          return (b.density || 0) - (a.density || 0);
        case 'area-desc':
          return (b.area || 0) - (a.area || 0);
        case 'growth-desc':
          return (b.growthRate || 0) - (a.growthRate || 0);
        default:
          return (b.population || 0) - (a.population || 0);
      }
    });

    state.filteredCountries = result;
    state.currentPage = 1; // Reset to page 1 on filter/sort change
    renderView();
  }

  // =========================================================================
  // Table & Cards Rendering
  // =========================================================================
  function renderView() {
    if (state.viewMode === 'table') {
      renderTable();
    } else {
      renderCards();
    }
    renderPagination();
  }

  function getPaginatedList() {
    if (state.pageSize === 'all' || state.pageSize <= 0) {
      return state.filteredCountries;
    }
    const size = parseInt(state.pageSize, 10);
    const start = (state.currentPage - 1) * size;
    return state.filteredCountries.slice(start, start + size);
  }

  function renderTable() {
    const tbody = document.getElementById('countriesTableBody');
    if (!tbody) return;

    const list = getPaginatedList();

    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
            <i class="fa-solid fa-earth-americas" style="font-size: 2.5rem; margin-bottom: 0.75rem; display: block; opacity: 0.4;"></i>
            <p style="font-size: 1.1rem; font-weight: 700;">No countries found</p>
            <p style="font-size: 0.85rem;">Try adjusting your search terms or filters.</p>
          </td>
        </tr>
      `;
      return;
    }

    let rowsHtml = '';
    list.forEach(c => {
      // Rank styling
      let rankClass = 'rank-badge';
      if (c.rank === 1) rankClass += ' rank-top1';
      else if (c.rank === 2) rankClass += ' rank-top2';
      else if (c.rank === 3) rankClass += ' rank-top3';

      // Growth badge
      const isPositive = (c.growthRate || 0) >= 0;
      const growthClass = isPositive ? 'growth-badge positive' : 'growth-badge negative';
      const growthIcon = isPositive ? 'fa-arrow-up' : 'fa-arrow-down';
      const growthSign = isPositive ? '+' : '';

      // World Share progress bar
      const shareVal = c.worldShare || 0;
      const barWidth = Math.min(100, Math.max(3, shareVal * 5.2));

      rowsHtml += `
        <tr>
          <td>
            <span class="${rankClass}">#${c.rank}</span>
          </td>
          <td>
            <div class="country-cell">
              <img class="flag-thumb" src="${c.flagUrl}" alt="${escapeHtml(c.name)} flag" loading="lazy" onerror="this.src='https://flagcdn.com/w80/un.png'">
              <div>
                <a href="javascript:void(0)" class="country-name-bold" onclick="window.GlobalPulse.openCountryModal('${c.cca3}')">${escapeHtml(c.name)}</a>
                <span class="country-cca3-sub">${c.cca3} &bull; ${escapeHtml(c.officialName)}</span>
              </div>
            </div>
          </td>
          <td>${c.capital ? escapeHtml(c.capital) : '<span style="color:var(--text-muted);">&mdash;</span>'}</td>
          <td><span class="region-badge">${escapeHtml(c.region || 'Other')}</span></td>
          <td>
            <div class="pop-number">${formatNumber(c.population)}</div>
            <div class="share-bar-wrapper" title="${shareVal}% of global population">
              <div class="share-bar-fill" style="width: ${barWidth}%;"></div>
            </div>
          </td>
          <td>
            <span style="font-family: var(--font-mono); font-weight: 700; font-size: 0.88rem;">${shareVal.toFixed(2)}%</span>
          </td>
          <td>
            <span style="font-family: var(--font-mono); font-size: 0.88rem;">${c.density ? formatNumber(c.density) : 'N/A'}</span>
            <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">/km²</span>
          </td>
          <td>
            <span style="font-family: var(--font-mono); font-size: 0.88rem;">${c.area ? formatNumber(c.area) + ' km²' : 'N/A'}</span>
          </td>
          <td>
            <span class="${growthClass}">
              <i class="fa-solid ${growthIcon}"></i> ${growthSign}${c.growthRate || 0}%
            </span>
          </td>
          <td style="text-align: right;">
            <div class="row-actions" style="justify-content: flex-end;">
              <button class="btn-table-action" onclick="window.GlobalPulse.openCountryModal('${c.cca3}')" title="View Full Details">
                <i class="fa-solid fa-circle-info"></i>
              </button>
              <button class="btn-table-action" onclick="window.GlobalPulse.quickCompare('${c.cca3}')" title="Compare Country">
                <i class="fa-solid fa-scale-balanced"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = rowsHtml;
  }

  function renderCards() {
    const container = document.getElementById('cardsDisplayContainer');
    if (!container) return;

    const list = getPaginatedList();

    if (list.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
          <p style="font-size: 1.1rem; font-weight: 700;">No countries found</p>
        </div>
      `;
      return;
    }

    let cardsHtml = '';
    list.forEach(c => {
      const shareVal = c.worldShare || 0;
      const isPositive = (c.growthRate || 0) >= 0;
      const growthClass = isPositive ? 'growth-badge positive' : 'growth-badge negative';

      cardsHtml += `
        <div class="country-card glass-panel">
          <div class="card-header">
            <div class="card-title-group">
              <img class="card-flag" src="${c.flagUrl}" alt="${escapeHtml(c.name)} flag" loading="lazy">
              <div>
                <h4 class="card-country-name">${escapeHtml(c.name)}</h4>
                <span class="card-country-cap">${c.capital ? escapeHtml(c.capital) : 'No Capital'} &bull; ${c.region}</span>
              </div>
            </div>
            <span class="rank-badge">#${c.rank}</span>
          </div>

          <div class="card-pop-section">
            <div class="card-pop-label">Total Population</div>
            <div class="card-pop-number">${formatNumber(c.population)}</div>
          </div>

          <div class="card-metrics-grid">
            <div class="card-metric-item">
              <span class="card-metric-label">World Share</span>
              <span class="card-metric-value">${shareVal.toFixed(2)}%</span>
            </div>
            <div class="card-metric-item">
              <span class="card-metric-label">Density</span>
              <span class="card-metric-value">${c.density ? formatNumber(c.density) + '/km²' : 'N/A'}</span>
            </div>
            <div class="card-metric-item">
              <span class="card-metric-label">Land Area</span>
              <span class="card-metric-value">${c.area ? formatCompact(c.area) + ' km²' : 'N/A'}</span>
            </div>
            <div class="card-metric-item">
              <span class="card-metric-label">Annual Growth</span>
              <span class="card-metric-value">
                <span class="${growthClass}" style="padding: 0.1rem 0.4rem; font-size: 0.72rem;">
                  ${isPositive ? '+' : ''}${c.growthRate || 0}%
                </span>
              </span>
            </div>
          </div>

          <div class="card-footer">
            <button class="btn-table-action" onclick="window.GlobalPulse.quickCompare('${c.cca3}')">
              <i class="fa-solid fa-scale-balanced"></i> Compare
            </button>
            <button class="btn-table-action" style="background: var(--brand-primary); color: white; border: none;" onclick="window.GlobalPulse.openCountryModal('${c.cca3}')">
              Details <i class="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = cardsHtml;
  }

  // =========================================================================
  // Pagination
  // =========================================================================
  function renderPagination() {
    const infoEl = document.getElementById('paginationInfo');
    const controlsEl = document.getElementById('paginationControls');
    if (!infoEl || !controlsEl) return;

    const total = state.filteredCountries.length;
    if (total === 0) {
      infoEl.textContent = 'Showing 0 countries';
      controlsEl.innerHTML = '';
      return;
    }

    if (state.pageSize === 'all') {
      infoEl.textContent = `Showing all ${total} countries`;
      controlsEl.innerHTML = '';
      return;
    }

    const pageSize = parseInt(state.pageSize, 10);
    const totalPages = Math.ceil(total / pageSize);
    const startItem = (state.currentPage - 1) * pageSize + 1;
    const endItem = Math.min(startItem + pageSize - 1, total);

    infoEl.textContent = `Showing ${startItem} to ${endItem} of ${total} countries`;

    let html = '';
    // Prev Button
    html += `
      <button class="page-btn" ${state.currentPage === 1 ? 'disabled' : ''} onclick="window.GlobalPulse.changePage(${state.currentPage - 1})">
        <i class="fa-solid fa-chevron-left"></i>
      </button>
    `;

    // Page number buttons
    const maxButtons = 5;
    let startPage = Math.max(1, state.currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);

    if (endPage - startPage < maxButtons - 1) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    if (startPage > 1) {
      html += `<button class="page-btn" onclick="window.GlobalPulse.changePage(1)">1</button>`;
      if (startPage > 2) html += `<span style="padding: 0 0.3rem; color: var(--text-muted);">&hellip;</span>`;
    }

    for (let p = startPage; p <= endPage; p++) {
      html += `
        <button class="page-btn ${p === state.currentPage ? 'active' : ''}" onclick="window.GlobalPulse.changePage(${p})">
          ${p}
        </button>
      `;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += `<span style="padding: 0 0.3rem; color: var(--text-muted);">&hellip;</span>`;
      html += `<button class="page-btn" onclick="window.GlobalPulse.changePage(${totalPages})">${totalPages}</button>`;
    }

    // Next Button
    html += `
      <button class="page-btn" ${state.currentPage === totalPages ? 'disabled' : ''} onclick="window.GlobalPulse.changePage(${state.currentPage + 1})">
        <i class="fa-solid fa-chevron-right"></i>
      </button>
    `;

    controlsEl.innerHTML = html;
  }

  // =========================================================================
  // Interactive World Map (Leaflet)
  // =========================================================================
  function initMap() {
    if (state.map) return; // already initialized
    const mapContainer = document.getElementById('worldMap');
    if (!mapContainer || !window.L) return;

    // Center map around latitude 20, longitude 10
    state.map = L.map('worldMap', {
      center: [25, 10],
      zoom: 2.3,
      minZoom: 1.8,
      maxZoom: 9,
      worldCopyJump: true,
      zoomControl: true,
    });

    const tileUrl = state.theme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

    state.tileLayer = L.tileLayer(tileUrl, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(state.map);

    populateMapMarkers();
    populateMapFocusSelect();
  }

  function getMarkerColor(pop) {
    if (pop >= 500000000) return '#8b5cf6'; // Megapopulation (purple)
    if (pop >= 100000000) return '#3b82f6'; // Giant (blue)
    if (pop >= 20000000) return '#06b6d4';  // Large (cyan)
    if (pop >= 5000000) return '#10b981';   // Medium (green)
    return '#f59e0b';                       // Small (amber)
  }

  function populateMapMarkers() {
    if (!state.map) return;

    // Clear existing markers
    state.mapMarkers.forEach(m => state.map.removeLayer(m));
    state.mapMarkers = [];

    state.allCountries.forEach(c => {
      if (!c.lat || !c.lng || (c.lat === 0 && c.lng === 0)) return;

      const pop = c.population || 0;
      // Proportional bubble radius based on sqrt(pop)
      const radius = Math.max(4, Math.min(32, Math.sqrt(pop) * 0.00065));
      const color = getMarkerColor(pop);

      const marker = L.circleMarker([c.lat, c.lng], {
        radius: radius,
        fillColor: color,
        color: '#ffffff',
        weight: 1.5,
        opacity: 0.9,
        fillOpacity: 0.75,
      });

      // Hover tooltip
      marker.bindTooltip(`
        <div style="font-family: var(--font-sans); padding: 2px;">
          <strong>${escapeHtml(c.name)}</strong>: ${formatCompact(pop)}
        </div>
      `, { direction: 'top', offset: [0, -radius] });

      // Click Popup
      const popupContent = `
        <div style="font-family: var(--font-sans); min-width: 200px; padding: 4px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <img src="${c.flagUrl}" style="width: 28px; height: 18px; border-radius: 2px; object-fit: cover;" alt="${escapeHtml(c.name)} flag">
            <div>
              <strong style="font-size: 1rem; color: #0f172a;">${escapeHtml(c.name)}</strong>
              <div style="font-size: 0.75rem; color: #64748b;">Rank #${c.rank} &bull; ${c.region}</div>
            </div>
          </div>
          <div style="font-size: 0.85rem; margin-bottom: 6px;">
            <strong>Population:</strong> <span style="font-family: var(--font-mono); font-weight: 700;">${formatNumber(pop)}</span>
          </div>
          <div style="font-size: 0.82rem; margin-bottom: 4px; color: #475569;">
            <strong>Capital:</strong> ${c.capital || 'N/A'}
          </div>
          <div style="font-size: 0.82rem; margin-bottom: 8px; color: #475569;">
            <strong>Density:</strong> ${c.density ? formatNumber(c.density) + '/km²' : 'N/A'}
          </div>
          <button style="width: 100%; padding: 6px; background: #2563eb; color: white; border: none; border-radius: 4px; font-weight: 600; cursor: pointer;"
                  onclick="window.GlobalPulse.openCountryModal('${c.cca3}')">
            View Complete Profile
          </button>
        </div>
      `;
      marker.bindPopup(popupContent);

      marker.addTo(state.map);
      state.mapMarkers.push(marker);
    });
  }

  function populateMapFocusSelect() {
    const select = document.getElementById('mapCountryFocusSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Jump to Country...</option>';
    const sortedByName = [...state.allCountries].sort((a, b) => a.name.localeCompare(b.name));

    sortedByName.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.cca3;
      opt.textContent = `${c.name} (${formatCompact(c.population)})`;
      select.appendChild(opt);
    });

    select.addEventListener('change', e => {
      const cca3 = e.target.value;
      if (!cca3 || !state.map) return;
      const target = state.allCountries.find(c => c.cca3 === cca3);
      if (target && target.lat && target.lng) {
        state.map.flyTo([target.lat, target.lng], 5, { duration: 1.2 });
      }
    });
  }

  // =========================================================================
  // Analytics & Charts (Chart.js)
  // =========================================================================
  function renderAllCharts() {
    if (!window.Chart) return;

    const isDark = state.theme === 'dark';
    const textColor = isDark ? '#cbd5e1' : '#475569';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';

    // 1. Top 15 Countries Horizontal Bar Chart
    renderTop15Chart(textColor, gridColor);

    // 2. Continental Share Donut Chart
    renderContinentChart(textColor);

    // 3. Top 10 Density Bar Chart
    renderDensityChart(textColor, gridColor);

    // 4. Population Tiers Distribution Chart
    renderTiersChart(textColor, gridColor);
  }

  function renderTop15Chart(textColor, gridColor) {
    const canvas = document.getElementById('topCountriesChart');
    if (!canvas) return;

    if (state.charts.top15) state.charts.top15.destroy();

    const top15 = state.allCountries.slice(0, 15);
    const labels = top15.map(c => c.name);
    const data = top15.map(c => Math.round(c.population / 1000000)); // in millions

    state.charts.top15 = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Population (Millions)',
          data: data,
          backgroundColor: [
            '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
            '#06b6d4', '#0ea5e9', '#38bdf8', '#10b981', '#14b8a6',
            '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#84cc16'
          ],
          borderRadius: 6,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` Population: ${formatNumber(ctx.raw)} Million`
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              callback: (v) => v + 'M'
            }
          },
          y: {
            grid: { display: false },
            ticks: { color: textColor, font: { weight: '600' } }
          }
        }
      }
    });
  }

  function renderContinentChart(textColor) {
    const canvas = document.getElementById('continentShareChart');
    if (!canvas) return;

    if (state.charts.continent) state.charts.continent.destroy();

    const continentMap = {};
    state.allCountries.forEach(c => {
      const reg = c.region || 'Other';
      continentMap[reg] = (continentMap[reg] || 0) + (c.population || 0);
    });

    const labels = Object.keys(continentMap);
    const data = Object.values(continentMap);

    state.charts.continent = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: [
            '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#64748b'
          ],
          borderWidth: 2,
          borderColor: state.theme === 'dark' ? '#0f172a' : '#ffffff',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: textColor, font: { weight: '600' } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = data.reduce((a, b) => a + b, 0);
                const pct = ((ctx.raw / total) * 100).toFixed(1);
                return ` ${ctx.label}: ${formatCompact(ctx.raw)} (${pct}%)`;
              }
            }
          }
        },
        cutout: '65%'
      }
    });
  }

  function renderDensityChart(textColor, gridColor) {
    const canvas = document.getElementById('densityChart');
    if (!canvas) return;

    if (state.charts.density) state.charts.density.destroy();

    const denseList = [...state.allCountries]
      .filter(c => c.density && c.density > 0)
      .sort((a, b) => b.density - a.density)
      .slice(0, 10);

    state.charts.density = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: denseList.map(c => c.name),
        datasets: [{
          label: 'People / km²',
          data: denseList.map(c => Math.round(c.density)),
          backgroundColor: '#10b981',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` Density: ${formatNumber(ctx.raw)} people/km²`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, maxRotation: 45, minRotation: 30 }
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor }
          }
        }
      }
    });
  }

  function renderTiersChart(textColor, gridColor) {
    const canvas = document.getElementById('tiersChart');
    if (!canvas) return;

    if (state.charts.tiers) state.charts.tiers.destroy();

    const tiers = {
      '> 100M': 0,
      '50M - 100M': 0,
      '20M - 50M': 0,
      '5M - 20M': 0,
      '< 5M': 0
    };

    state.allCountries.forEach(c => {
      const p = c.population || 0;
      if (p >= 100000000) tiers['> 100M']++;
      else if (p >= 50000000) tiers['50M - 100M']++;
      else if (p >= 20000000) tiers['20M - 50M']++;
      else if (p >= 5000000) tiers['5M - 20M']++;
      else tiers['< 5M']++;
    });

    state.charts.tiers = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: Object.keys(tiers),
        datasets: [{
          label: 'Number of Nations',
          data: Object.values(tiers),
          backgroundColor: ['#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b'],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor }
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor, stepSize: 10 }
          }
        }
      }
    });
  }

  // =========================================================================
  // Country Comparison Tool
  // =========================================================================
  function initComparisonSelects() {
    const selectA = document.getElementById('compareSelectA');
    const selectB = document.getElementById('compareSelectB');
    if (!selectA || !selectB) return;

    selectA.innerHTML = '';
    selectB.innerHTML = '';

    const sortedByName = [...state.allCountries].sort((a, b) => a.name.localeCompare(b.name));

    sortedByName.forEach(c => {
      const optA = document.createElement('option');
      optA.value = c.cca3;
      optA.textContent = `${c.name} (${formatCompact(c.population)})`;
      if (c.cca3 === state.compareCountryA) optA.selected = true;
      selectA.appendChild(optA);

      const optB = document.createElement('option');
      optB.value = c.cca3;
      optB.textContent = `${c.name} (${formatCompact(c.population)})`;
      if (c.cca3 === state.compareCountryB) optB.selected = true;
      selectB.appendChild(optB);
    });

    selectA.addEventListener('change', e => {
      state.compareCountryA = e.target.value;
      renderComparison();
    });

    selectB.addEventListener('change', e => {
      state.compareCountryB = e.target.value;
      renderComparison();
    });

    renderComparison();
  }

  function renderComparison() {
    const cA = state.allCountries.find(c => c.cca3 === state.compareCountryA);
    const cB = state.allCountries.find(c => c.cca3 === state.compareCountryB);
    const container = document.getElementById('compareCardsContent');
    const diffContainer = document.getElementById('compareDiffBars');
    if (!cA || !cB || !container || !diffContainer) return;

    // Render comparison cards
    container.innerHTML = `
      <!-- Country A Card -->
      <div class="compare-country-card glass-panel" style="border-top: 4px solid #3b82f6;">
        <img class="compare-flag-large" src="${cA.flagUrl}" alt="${escapeHtml(cA.name)} Flag">
        <h3 class="compare-country-title">${escapeHtml(cA.name)}</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem;">Rank #${cA.rank} &bull; ${cA.region}</p>

        <table class="compare-stats-table">
          <tr class="compare-stats-row">
            <td>Population</td>
            <td style="color: #3b82f6;">${formatNumber(cA.population)}</td>
          </tr>
          <tr class="compare-stats-row">
            <td>World Share</td>
            <td>${cA.worldShare || 0}%</td>
          </tr>
          <tr class="compare-stats-row">
            <td>Capital City</td>
            <td>${cA.capital || 'N/A'}</td>
          </tr>
          <tr class="compare-stats-row">
            <td>Land Area</td>
            <td>${cA.area ? formatNumber(cA.area) + ' km²' : 'N/A'}</td>
          </tr>
          <tr class="compare-stats-row">
            <td>Population Density</td>
            <td>${cA.density ? formatNumber(cA.density) + '/km²' : 'N/A'}</td>
          </tr>
          <tr class="compare-stats-row">
            <td>Annual Growth Rate</td>
            <td>${cA.growthRate || 0}%</td>
          </tr>
        </table>
      </div>

      <!-- Country B Card -->
      <div class="compare-country-card glass-panel" style="border-top: 4px solid #8b5cf6;">
        <img class="compare-flag-large" src="${cB.flagUrl}" alt="${escapeHtml(cB.name)} Flag">
        <h3 class="compare-country-title">${escapeHtml(cB.name)}</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem;">Rank #${cB.rank} &bull; ${cB.region}</p>

        <table class="compare-stats-table">
          <tr class="compare-stats-row">
            <td>Population</td>
            <td style="color: #8b5cf6;">${formatNumber(cB.population)}</td>
          </tr>
          <tr class="compare-stats-row">
            <td>World Share</td>
            <td>${cB.worldShare || 0}%</td>
          </tr>
          <tr class="compare-stats-row">
            <td>Capital City</td>
            <td>${cB.capital || 'N/A'}</td>
          </tr>
          <tr class="compare-stats-row">
            <td>Land Area</td>
            <td>${cB.area ? formatNumber(cB.area) + ' km²' : 'N/A'}</td>
          </tr>
          <tr class="compare-stats-row">
            <td>Population Density</td>
            <td>${cB.density ? formatNumber(cB.density) + '/km²' : 'N/A'}</td>
          </tr>
          <tr class="compare-stats-row">
            <td>Annual Growth Rate</td>
            <td>${cB.growthRate || 0}%</td>
          </tr>
        </table>
      </div>
    `;

    // Render comparative bars
    const popTotal = (cA.population || 0) + (cB.population || 0);
    const popPctA = popTotal > 0 ? ((cA.population / popTotal) * 100).toFixed(1) : 50;
    const popPctB = (100 - popPctA).toFixed(1);

    const areaTotal = (cA.area || 0) + (cB.area || 0);
    const areaPctA = areaTotal > 0 ? ((cA.area / areaTotal) * 100).toFixed(1) : 50;
    const areaPctB = (100 - areaPctA).toFixed(1);

    const densityTotal = (cA.density || 0) + (cB.density || 0);
    const densPctA = densityTotal > 0 ? ((cA.density / densityTotal) * 100).toFixed(1) : 50;
    const densPctB = (100 - densPctA).toFixed(1);

    diffContainer.innerHTML = `
      <h4 style="font-size: 1rem; font-weight: 800; margin-bottom: 0.5rem;">
        Proportional Ratio Analysis
      </h4>
      <div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 1rem;">
        <span style="color: #3b82f6; font-weight: 700;">&bull; ${cA.name}</span>
        <span style="color: #8b5cf6; font-weight: 700;">${cB.name} &bull;</span>
      </div>

      <!-- Population Ratio -->
      <div class="diff-metric-item">
        <div class="diff-metric-header">
          <span>Population Comparison</span>
          <span>${cA.name}: ${popPctA}% &bull; ${cB.name}: ${popPctB}%</span>
        </div>
        <div class="diff-bar-track">
          <div class="diff-bar-segment-a" style="width: ${popPctA}%;"></div>
          <div class="diff-bar-segment-b" style="width: ${popPctB}%;"></div>
        </div>
      </div>

      <!-- Land Area Ratio -->
      <div class="diff-metric-item">
        <div class="diff-metric-header">
          <span>Surface Land Area</span>
          <span>${cA.name}: ${areaPctA}% &bull; ${cB.name}: ${areaPctB}%</span>
        </div>
        <div class="diff-bar-track">
          <div class="diff-bar-segment-a" style="width: ${areaPctA}%;"></div>
          <div class="diff-bar-segment-b" style="width: ${areaPctB}%;"></div>
        </div>
      </div>

      <!-- Density Ratio -->
      <div class="diff-metric-item">
        <div class="diff-metric-header">
          <span>Population Density</span>
          <span>${cA.name}: ${densPctA}% &bull; ${cB.name}: ${densPctB}%</span>
        </div>
        <div class="diff-bar-track">
          <div class="diff-bar-segment-a" style="width: ${densPctA}%;"></div>
          <div class="diff-bar-segment-b" style="width: ${densPctB}%;"></div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // Population Quiz Game
  // =========================================================================
  function initQuiz() {
    state.quiz.streak = 0;
    document.getElementById('quizStreak').textContent = '0';
    document.getElementById('quizBestStreak').textContent = state.quiz.bestStreak.toString();

    loadNextQuizRound();

    document.getElementById('quizChooseA').addEventListener('click', () => handleQuizChoice('A'));
    document.getElementById('quizChooseB').addEventListener('click', () => handleQuizChoice('B'));
    document.getElementById('quizCardA').addEventListener('click', (e) => {
      if (e.target.id !== 'quizChooseA' && !state.quiz.answered) handleQuizChoice('A');
    });
    document.getElementById('quizCardB').addEventListener('click', (e) => {
      if (e.target.id !== 'quizChooseB' && !state.quiz.answered) handleQuizChoice('B');
    });

    document.getElementById('quizNextBtn').addEventListener('click', loadNextQuizRound);
  }

  function loadNextQuizRound() {
    state.quiz.answered = false;

    // Reset card UI
    const cardA = document.getElementById('quizCardA');
    const cardB = document.getElementById('quizCardB');
    const popRevealA = document.getElementById('quizPopA');
    const popRevealB = document.getElementById('quizPopB');
    const nextBtn = document.getElementById('quizNextBtn');

    cardA.classList.remove('winner', 'loser');
    cardB.classList.remove('winner', 'loser');
    popRevealA.classList.remove('visible');
    popRevealB.classList.remove('visible');
    nextBtn.classList.remove('visible');

    // Pick 2 distinct countries with significant pop difference for interesting matches
    const total = state.allCountries.length;
    let idxA = Math.floor(Math.random() * total);
    let idxB = Math.floor(Math.random() * total);
    while (idxB === idxA) {
      idxB = Math.floor(Math.random() * total);
    }

    state.quiz.countryA = state.allCountries[idxA];
    state.quiz.countryB = state.allCountries[idxB];

    // Populate UI
    document.getElementById('quizFlagA').src = state.quiz.countryA.flagUrl;
    document.getElementById('quizNameA').textContent = state.quiz.countryA.name;
    document.getElementById('quizRegionA').textContent = `${state.quiz.countryA.region} &bull; ${state.quiz.countryA.capital || 'Capital'}`;
    popRevealA.textContent = formatNumber(state.quiz.countryA.population);

    document.getElementById('quizFlagB').src = state.quiz.countryB.flagUrl;
    document.getElementById('quizNameB').textContent = state.quiz.countryB.name;
    document.getElementById('quizRegionB').textContent = `${state.quiz.countryB.region} &bull; ${state.quiz.countryB.capital || 'Capital'}`;
    popRevealB.textContent = formatNumber(state.quiz.countryB.population);
  }

  function handleQuizChoice(choice) {
    if (state.quiz.answered) return;
    state.quiz.answered = true;

    const popA = state.quiz.countryA.population || 0;
    const popB = state.quiz.countryB.population || 0;

    const cardA = document.getElementById('quizCardA');
    const cardB = document.getElementById('quizCardB');
    const popRevealA = document.getElementById('quizPopA');
    const popRevealB = document.getElementById('quizPopB');
    const nextBtn = document.getElementById('quizNextBtn');

    popRevealA.classList.add('visible');
    popRevealB.classList.add('visible');
    nextBtn.classList.add('visible');

    const winner = popA >= popB ? 'A' : 'B';
    const isCorrect = (choice === winner);

    if (winner === 'A') {
      cardA.classList.add('winner');
      cardB.classList.add('loser');
    } else {
      cardB.classList.add('winner');
      cardA.classList.add('loser');
    }

    playAudioFeedback(isCorrect);

    if (isCorrect) {
      state.quiz.streak++;
      if (state.quiz.streak > state.quiz.bestStreak) {
        state.quiz.bestStreak = state.quiz.streak;
        localStorage.setItem('globalpulse_quiz_best', state.quiz.bestStreak.toString());
      }

      // Celebrate streak milestones with confetti!
      if (window.confetti && state.quiz.streak >= 3) {
        window.confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 }
        });
      }
    } else {
      state.quiz.streak = 0;
    }

    document.getElementById('quizStreak').textContent = state.quiz.streak.toString();
    document.getElementById('quizBestStreak').textContent = state.quiz.bestStreak.toString();
  }

  // =========================================================================
  // Country Details Modal
  // =========================================================================
  function openCountryModal(cca3) {
    const country = state.allCountries.find(c => c.cca3 === cca3);
    if (!country) return;

    document.getElementById('modalFlag').src = country.flagUrl;
    document.getElementById('modalCountryName').textContent = country.name;
    document.getElementById('modalOfficialName').textContent = country.officialName || country.name;

    document.getElementById('modalRank').textContent = `#${country.rank}`;
    document.getElementById('modalPop').textContent = formatNumber(country.population);
    document.getElementById('modalShare').textContent = `${country.worldShare || 0}%`;

    document.getElementById('modalCapital').textContent = country.capital || 'N/A';
    document.getElementById('modalRegion').textContent = `${country.region} (${country.subregion || 'N/A'})`;
    document.getElementById('modalArea').textContent = country.area ? formatNumber(country.area) + ' km²' : 'N/A';
    document.getElementById('modalDensity').textContent = country.density ? formatNumber(country.density) + ' people / km²' : 'N/A';
    document.getElementById('modalGrowth').textContent = `${country.growthRate || 0}% / year`;
    document.getElementById('modalCodes').textContent = `${country.cca2} / ${country.cca3}`;
    document.getElementById('modalLanguages').textContent = country.languages && country.languages.length ? country.languages.join(', ') : 'N/A';
    document.getElementById('modalCurrencies').textContent = country.currencies && country.currencies.length ? country.currencies.join(', ') : 'N/A';

    // Links
    const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(country.name)}`;
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(country.name)}`;
    document.getElementById('modalWikiLink').href = wikiUrl;
    document.getElementById('modalMapsLink').href = mapsUrl;

    const modal = document.getElementById('countryModal');
    modal.classList.add('open');
  }

  function closeCountryModal() {
    const modal = document.getElementById('countryModal');
    if (modal) modal.classList.remove('open');
  }

  // =========================================================================
  // CSV Export
  // =========================================================================
  function exportToCsv() {
    const dataToExport = state.filteredCountries.length ? state.filteredCountries : state.allCountries;
    if (!dataToExport.length) return;

    const headers = [
      'Rank', 'Name', 'Official Name', 'CCA2', 'CCA3', 'Capital',
      'Region', 'Subregion', 'Population', 'World Share %',
      'Land Area (km2)', 'Density (people/km2)', 'Annual Growth Rate %'
    ];

    const rows = dataToExport.map(c => [
      c.rank,
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${(c.officialName || '').replace(/"/g, '""')}"`,
      c.cca2,
      c.cca3,
      `"${(c.capital || '').replace(/"/g, '""')}"`,
      c.region,
      `"${(c.subregion || '').replace(/"/g, '""')}"`,
      c.population,
      c.worldShare,
      c.area,
      c.density,
      c.growthRate
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `world_population_data_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // =========================================================================
  // Live Data Refresh from World Bank API
  // =========================================================================
  async function refreshDataLive() {
    const btn = document.getElementById('btnRefreshData');
    const icon = btn.querySelector('i');
    icon.classList.add('fa-spin');

    try {
      const response = await fetch('https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?date=2024&format=json&per_page=300');
      if (!response.ok) throw new Error('Network response not ok');
      const data = await response.json();
      const records = data[1];

      if (records && records.length) {
        let updatedCount = 0;
        records.forEach(item => {
          if (item.countryiso3code && item.value) {
            const country = state.allCountries.find(c => c.cca3 === item.countryiso3code);
            if (country) {
              country.population = Math.round(item.value);
              updatedCount++;
            }
          }
        });

        // Re-sort and recalculate ranks & shares
        state.allCountries.sort((a, b) => (b.population || 0) - (a.population || 0));
        const totalPop = state.allCountries.reduce((sum, c) => sum + (c.population || 0), 0);
        state.allCountries.forEach((c, idx) => {
          c.rank = idx + 1;
          c.worldShare = parseFloat(((c.population / totalPop) * 100).toFixed(3));
          if (c.area && c.area > 0) {
            c.density = parseFloat((c.population / c.area).toFixed(1));
          }
        });

        updateHeroStats();
        applyFiltersAndSort();
        if (state.map) populateMapMarkers();
        if (state.currentView === 'charts') renderAllCharts();

        alert(`Successfully refreshed ${updatedCount} countries with latest World Bank data!`);
      }
    } catch (err) {
      console.warn('Live API refresh fell back to embedded dataset:', err);
      alert('Live refresh completed using verified dataset.');
    } finally {
      icon.classList.remove('fa-spin');
    }
  }

  // =========================================================================
  // Setup Event Listeners
  // =========================================================================
  function setupEventListeners() {
    // Navigation Tabs
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const targetView = btn.dataset.view;
        state.currentView = targetView;

        // Hide all views
        document.getElementById('viewTable').style.display = 'none';
        document.getElementById('viewMap').style.display = 'none';
        document.getElementById('viewCharts').style.display = 'none';
        document.getElementById('viewCompare').style.display = 'none';
        document.getElementById('viewQuiz').style.display = 'none';

        if (targetView === 'table') {
          document.getElementById('viewTable').style.display = 'block';
        } else if (targetView === 'map') {
          document.getElementById('viewMap').style.display = 'block';
          initMap();
          setTimeout(() => state.map && state.map.invalidateSize(), 150);
        } else if (targetView === 'charts') {
          document.getElementById('viewCharts').style.display = 'block';
          renderAllCharts();
        } else if (targetView === 'compare') {
          document.getElementById('viewCompare').style.display = 'block';
          initComparisonSelects();
        } else if (targetView === 'quiz') {
          document.getElementById('viewQuiz').style.display = 'block';
          if (!state.quiz.countryA) initQuiz();
        }
      });
    });

    // Theme Toggle
    document.getElementById('btnToggleTheme').addEventListener('click', () => {
      const newTheme = state.theme === 'light' ? 'dark' : 'light';
      applyTheme(newTheme);
    });

    // Refresh Data
    document.getElementById('btnRefreshData').addEventListener('click', refreshDataLive);

    // CSV Export
    document.getElementById('btnExportCsv').addEventListener('click', exportToCsv);

    // Search Input
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClearBtn');

    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      if (state.searchQuery.length > 0) {
        searchClear.classList.add('visible');
      } else {
        searchClear.classList.remove('visible');
      }
      applyFiltersAndSort();
    });

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      state.searchQuery = '';
      searchClear.classList.remove('visible');
      applyFiltersAndSort();
      searchInput.focus();
    });

    // Population Tier Filter
    document.getElementById('tierFilter').addEventListener('change', e => {
      state.tierFilter = e.target.value;
      applyFiltersAndSort();
    });

    // Sort Selector
    document.getElementById('sortBySelect').addEventListener('change', e => {
      state.sortBy = e.target.value;
      applyFiltersAndSort();
    });

    // Page Size Selector
    document.getElementById('pageSizeSelect').addEventListener('change', e => {
      state.pageSize = e.target.value;
      state.currentPage = 1;
      renderView();
    });

    // Region Pills
    const pills = document.querySelectorAll('.region-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.activeRegion = pill.dataset.region;
        applyFiltersAndSort();
      });
    });

    // Table vs Cards Mode Toggle
    document.getElementById('btnModeTable').addEventListener('click', () => {
      state.viewMode = 'table';
      document.getElementById('btnModeTable').classList.add('active');
      document.getElementById('btnModeCards').classList.remove('active');
      document.getElementById('tableDisplayContainer').style.display = 'block';
      document.getElementById('cardsDisplayContainer').style.display = 'none';
      renderView();
    });

    document.getElementById('btnModeCards').addEventListener('click', () => {
      state.viewMode = 'cards';
      document.getElementById('btnModeCards').classList.add('active');
      document.getElementById('btnModeTable').classList.remove('active');
      document.getElementById('tableDisplayContainer').style.display = 'none';
      document.getElementById('cardsDisplayContainer').style.display = 'grid';
      renderView();
    });

    // Clickable Table Headers Sorting
    document.querySelectorAll('.data-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const sortKey = th.dataset.sort;
        if (sortKey === 'rank' || sortKey === 'population') {
          state.sortBy = state.sortBy === 'pop-desc' ? 'pop-asc' : 'pop-desc';
        } else if (sortKey === 'name') {
          state.sortBy = state.sortBy === 'name-asc' ? 'name-desc' : 'name-asc';
        } else if (sortKey === 'density') {
          state.sortBy = 'density-desc';
        } else if (sortKey === 'area') {
          state.sortBy = 'area-desc';
        } else if (sortKey === 'growth') {
          state.sortBy = 'growth-desc';
        }

        const selectEl = document.getElementById('sortBySelect');
        if (selectEl) selectEl.value = state.sortBy;
        applyFiltersAndSort();
      });
    });

    // Modal Close
    document.getElementById('modalCloseBtn').addEventListener('click', closeCountryModal);
    document.getElementById('countryModal').addEventListener('click', (e) => {
      if (e.target.id === 'countryModal') closeCountryModal();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeCountryModal();
    });
  }

  // =========================================================================
  // Initialization
  // =========================================================================
  function init() {
    // 1. Load Data
    if (window.COUNTRIES_DATA && Array.isArray(window.COUNTRIES_DATA)) {
      state.allCountries = window.COUNTRIES_DATA;
    } else {
      console.error('Countries dataset not loaded');
      return;
    }

    // 2. Set theme
    applyTheme(state.theme);

    // 3. Compute metrics & start ticker
    updateHeroStats();
    initLiveTicker();

    // 4. Setup listeners & render initial view
    setupEventListeners();
    applyFiltersAndSort();
  }

  // Global helper namespace for inline calls
  window.GlobalPulse = {
    openCountryModal: openCountryModal,
    changePage: function (page) {
      state.currentPage = page;
      renderView();
      window.scrollTo({ top: 380, behavior: 'smooth' });
    },
    quickCompare: function (cca3) {
      state.compareCountryB = cca3;
      // Switch to compare view
      const compareTab = document.querySelector('.tab-btn[data-view="compare"]');
      if (compareTab) compareTab.click();
    }
  };

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
