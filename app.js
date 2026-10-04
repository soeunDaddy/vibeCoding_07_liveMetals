/**
 * ===================================================================
 * MetalPrice Pulse - Core Application Logic
 * Integrates MetalpriceAPI OpenAPI & Interactive Chart.js Engine
 * ===================================================================
 */

// --- 1. Global State & Configurations ---
const APP_STATE = {
  selectedCurrency: 'KRW', // 기본 통화: 대한민국 원화 (KRW)
  selectedUnit: 'g', // 기본 중량 단위: 그램 (g) - 'g', 'toz', 'don'
  selectedTimeframe: '1M', // '7D', '1M', '3M', '6M', '1Y', 'YTD', '5Y'
  apiMode: 'auto', // 'auto' | 'mock'
  apiKey: localStorage.getItem('metalprice_api_key') || '',
  isLiveSimulationActive: true,
  lastUpdated: new Date(),
  lastFxUpdated: new Date(),
  exchangeRates: {
    USD: 1.0,
    KRW: 1348.60, // 실시간 환율 API로 즉시 갱신
    EUR: 0.924,
    JPY: 149.85,
    CNY: 7.185
  },
  currencySymbols: {
    USD: '$',
    KRW: '₩',
    EUR: '€',
    JPY: '¥',
    CNY: '¥'
  },
  activeMetals: ['XAU', 'XAG', 'XCU', 'XPT', 'XPD', 'ALU']
};

// --- 2. Metal Master Definitions (Base Prices in USD per Troy Ounce) ---
const METALS_CONFIG = {
  XAU: {
    symbol: 'XAU',
    nameKo: '금 (Gold)',
    nameEn: 'Gold',
    category: '귀금속',
    iconLetter: 'Au',
    basePriceTozUSD: 2684.50,
    dailyChangePct: 1.28,
    color: '#F59E0B',
    colorSecondary: '#FBBF24',
    glowColor: 'rgba(245, 158, 11, 0.25)',
    gradient: 'linear-gradient(135deg, #FFE066, #F59E0B, #B45309)',
    volatility: 0.012,
    trendSlope: 0.18 // Long term appreciation
  },
  XAG: {
    symbol: 'XAG',
    nameKo: '은 (Silver)',
    nameEn: 'Silver',
    category: '귀금속/산업재',
    iconLetter: 'Ag',
    basePriceTozUSD: 32.45,
    dailyChangePct: -0.42,
    color: '#CBD5E1',
    colorSecondary: '#94A3B8',
    glowColor: 'rgba(203, 213, 225, 0.25)',
    gradient: 'linear-gradient(135deg, #F8FAFC, #94A3B8, #475569)',
    volatility: 0.022,
    trendSlope: 0.22
  },
  XCU: {
    symbol: 'XCU',
    nameKo: '구리 (Copper)',
    nameEn: 'Copper',
    category: '핵심 산업재',
    iconLetter: 'Cu',
    basePriceTozUSD: 4.42, // converted to standard display unit
    dailyChangePct: 0.85,
    color: '#FB923C',
    colorSecondary: '#EA580C',
    glowColor: 'rgba(251, 146, 60, 0.25)',
    gradient: 'linear-gradient(135deg, #FED7AA, #FB923C, #C2410C)',
    volatility: 0.018,
    trendSlope: 0.14
  },
  XPT: {
    symbol: 'XPT',
    nameKo: '플래티넘 (Platinum)',
    nameEn: 'Platinum',
    category: '귀금속',
    iconLetter: 'Pt',
    basePriceTozUSD: 994.20,
    dailyChangePct: 0.15,
    color: '#38BDF8',
    colorSecondary: '#0284C7',
    glowColor: 'rgba(56, 189, 248, 0.25)',
    gradient: 'linear-gradient(135deg, #E0F2FE, #38BDF8, #0284C7)',
    volatility: 0.015,
    trendSlope: 0.08
  },
  XPD: {
    symbol: 'XPD',
    nameKo: '팔라듐 (Palladium)',
    nameEn: 'Palladium',
    category: '특수 귀금속',
    iconLetter: 'Pd',
    basePriceTozUSD: 1042.80,
    dailyChangePct: -1.15,
    color: '#C084FC',
    colorSecondary: '#9333EA',
    glowColor: 'rgba(192, 132, 252, 0.25)',
    gradient: 'linear-gradient(135deg, #F3E8FF, #C084FC, #7E22CE)',
    volatility: 0.025,
    trendSlope: -0.05
  },
  ALU: {
    symbol: 'ALU',
    nameKo: '알루미늄 (Aluminium)',
    nameEn: 'Aluminium',
    category: '경금속 산업재',
    iconLetter: 'Al',
    basePriceTozUSD: 2.65,
    dailyChangePct: 0.45,
    color: '#94A3B8',
    colorSecondary: '#64748B',
    glowColor: 'rgba(148, 163, 184, 0.25)',
    gradient: 'linear-gradient(135deg, #E2E8F0, #64748B, #334155)',
    volatility: 0.014,
    trendSlope: 0.10
  }
};

// Store current dynamic live prices and Chart.js instances
const livePrices = {};
const chartInstances = {};
let liveSimulationTimer = null;
let liveFxTimer = null;

// --- 3. 실시간 환율 API 연동 (Open Exchange Rates / ER-API) ---
async function fetchLiveExchangeRates() {
  try {
    // 1차 API: open.er-api.com (글로벌 실시간 환율 OpenAPI, Key 불필요)
    const response = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (data && data.rates && data.rates.KRW) {
      APP_STATE.exchangeRates.KRW = data.rates.KRW;
      if (data.rates.EUR) APP_STATE.exchangeRates.EUR = data.rates.EUR;
      if (data.rates.JPY) APP_STATE.exchangeRates.JPY = data.rates.JPY;
      if (data.rates.CNY) APP_STATE.exchangeRates.CNY = data.rates.CNY;
      APP_STATE.lastFxUpdated = new Date();
      updateFxRateDisplay(data.rates.KRW);
      return true;
    }
  } catch (err) {
    console.warn('[Live FX] 1차 환율 API 실패, 백업 API 시도:', err.message);
    try {
      // 2차 백업 API
      const backupRes = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const backupData = await backupRes.json();
      if (backupData && backupData.rates && backupData.rates.KRW) {
        APP_STATE.exchangeRates.KRW = backupData.rates.KRW;
        if (backupData.rates.EUR) APP_STATE.exchangeRates.EUR = backupData.rates.EUR;
        if (backupData.rates.JPY) APP_STATE.exchangeRates.JPY = backupData.rates.JPY;
        if (backupData.rates.CNY) APP_STATE.exchangeRates.CNY = backupData.rates.CNY;
        APP_STATE.lastFxUpdated = new Date();
        updateFxRateDisplay(backupData.rates.KRW);
        return true;
      }
    } catch (bErr) {
      console.warn('[Live FX] 백업 환율 API도 실패:', bErr.message);
    }
  }

  // 폴백 환율 UI 표시
  updateFxRateDisplay(APP_STATE.exchangeRates.KRW);
  return false;
}

function updateFxRateDisplay(krwRate) {
  const fxEl = document.getElementById('liveFxRate');
  if (fxEl) {
    fxEl.textContent = `1 USD = ₩${krwRate.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

// --- 4. 중량 단위 및 통화 환산 유틸리티 ---
// 1 Troy Ounce = 31.1034768 grams = 0.0311034768 kg = 8.29426 돈 (1돈 = 3.75g)
const OZ_TO_GRAM = 31.1034768;
const GRAM_PER_DON = 3.75; // 국내 표준 금 1돈 = 3.75g

function convertPrice(basePriceTozUSD, targetCurrency, targetUnit) {
  let price = basePriceTozUSD;

  // 중량 단위 환산
  if (targetUnit === 'g') {
    price = price / OZ_TO_GRAM; // 1g당 달러 가격
  } else if (targetUnit === 'don') {
    price = (price / OZ_TO_GRAM) * GRAM_PER_DON; // 1돈(3.75g)당 달러 가격
  } else if (targetUnit === 'kg') {
    price = (price / OZ_TO_GRAM) * 1000; // 1kg당 달러 가격
  }

  // 실시간 환율 적용
  const rate = APP_STATE.exchangeRates[targetCurrency] || 1.0;
  return price * rate;
}

function formatCurrency(amount, currency = APP_STATE.selectedCurrency) {
  const symbol = APP_STATE.currencySymbols[currency] || '₩';
  
  if (currency === 'KRW') {
    if (amount >= 100) {
      // 100원 이상은 정수형으로 깔끔하게 표기 (예: ₩3,620,350)
      return `${symbol}${Math.round(amount).toLocaleString('ko-KR')}`;
    } else if (amount >= 1) {
      return `${symbol}${amount.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else {
      return `${symbol}${amount.toLocaleString('ko-KR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
    }
  } else if (currency === 'JPY') {
    return `${symbol}${Math.round(amount).toLocaleString('ja-JP')}`;
  } else {
    let decimals = 2;
    if (amount < 1) decimals = 4;
    else if (amount < 10) decimals = 3;
    return `${symbol}${amount.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })}`;
  }
}

// --- 4. Historical Time Series Data Generator ---
function generateHistoricalData(symbol, timeframe) {
  const config = METALS_CONFIG[symbol];
  const currentPrice = livePrices[symbol] || config.basePriceTozUSD;
  
  let pointsCount = 30;
  let daysBack = 30;
  let intervalDays = 1;

  switch (timeframe) {
    case '7D':
      pointsCount = 7;
      daysBack = 7;
      intervalDays = 1;
      break;
    case '1M':
      pointsCount = 30;
      daysBack = 30;
      intervalDays = 1;
      break;
    case '3M':
      pointsCount = 45;
      daysBack = 90;
      intervalDays = 2;
      break;
    case '6M':
      pointsCount = 60;
      daysBack = 180;
      intervalDays = 3;
      break;
    case '1Y':
      pointsCount = 73;
      daysBack = 365;
      intervalDays = 5;
      break;
    case 'YTD': {
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      daysBack = Math.max(7, Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24)));
      pointsCount = Math.min(60, daysBack);
      intervalDays = Math.max(1, Math.floor(daysBack / pointsCount));
      break;
    }
    case '5Y':
      pointsCount = 60;
      daysBack = 365 * 5;
      intervalDays = 30;
      break;
    default:
      pointsCount = 30;
      daysBack = 30;
  }

  const data = [];
  const now = new Date();
  
  // Deterministic seed generation based on symbol and timeframe
  let seed = 0;
  for (let i = 0; i < symbol.length; i++) seed += symbol.charCodeAt(i);

  // Generate backwards from current price
  let runningPrice = currentPrice;
  const rawSeries = [];

  for (let i = 0; i < pointsCount; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - (pointsCount - 1 - i) * intervalDays);
    
    // Wave math for authentic financial cycles
    const t = (i / pointsCount) * Math.PI * 4;
    const cycle1 = Math.sin(t + seed);
    const cycle2 = Math.cos(t * 1.7 + seed * 1.5) * 0.5;
    const randomNoise = (Math.sin(i * 99.7 + seed) * 0.5);
    
    // Progressive drift based on metal's trend slope
    const trendDrift = (1 + ((i - pointsCount) / pointsCount) * config.trendSlope);
    const multiplier = trendDrift * (1 + (cycle1 + cycle2 + randomNoise) * config.volatility);
    
    const histPrice = config.basePriceTozUSD * multiplier;
    
    // Date Label formatting
    let dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
    if (timeframe === '1Y' || timeframe === '5Y' || timeframe === 'YTD') {
      dateLabel = `${d.getFullYear().toString().slice(-2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    }

    rawSeries.push({
      date: d,
      dateLabel: dateLabel,
      priceUSD: histPrice
    });
  }

  // Ensure last point perfectly matches the current live spot price
  if (rawSeries.length > 0) {
    rawSeries[rawSeries.length - 1].priceUSD = currentPrice;
  }

  // Convert points to currently selected Currency & Unit
  return rawSeries.map(item => ({
    date: item.date,
    dateLabel: item.dateLabel,
    price: convertPrice(item.priceUSD, APP_STATE.selectedCurrency, APP_STATE.selectedUnit)
  }));
}

// --- 5. OpenAPI Service (MetalpriceAPI) ---
async function fetchMetalPriceAPI() {
  if (APP_STATE.apiMode === 'mock' || !APP_STATE.apiKey) {
    return simulateApiData();
  }

  const endpoint = `https://api.metalpriceapi.com/v1/latest?api_key=${encodeURIComponent(APP_STATE.apiKey)}&base=USD&currencies=XAU,XAG,XPT,XPD,XCU,ALU,KRW,EUR,JPY,CNY`;

  try {
    const response = await fetch(endpoint, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`API HTTP Error ${response.status}`);
    }
    const json = await response.json();
    
    if (json && json.success && json.rates) {
      // MetalpriceAPI returns rates relative to base.
      // E.g. base=USD, USDXAU is 1/price or direct price depending on account type.
      updateStateFromApiRates(json.rates);
      updateDataSourceBadge(true, 'MetalpriceAPI (Live Connected)');
      showToast('성공', 'MetalpriceAPI 실시간 시세를 성공적으로 수신했습니다.', 'success');
      return true;
    } else {
      throw new Error(json.error?.info || '응답 데이터 형식 불일치');
    }
  } catch (err) {
    console.warn('[MetalpriceAPI] Live fetch fallback to Smart Simulator:', err.message);
    updateDataSourceBadge(false, 'Smart Simulator (Fallback)');
    simulateApiData();
    return false;
  }
}

function updateStateFromApiRates(rates) {
  // Exchange Rates
  ['KRW', 'EUR', 'JPY', 'CNY'].forEach(curr => {
    if (rates[curr]) {
      APP_STATE.exchangeRates[curr] = rates[curr];
    }
  });

  // Metals
  Object.keys(METALS_CONFIG).forEach(sym => {
    if (rates[sym]) {
      const rawVal = rates[sym];
      // If the rate is < 1 (e.g. 0.00037 for Gold), the real spot price is 1 / rawVal
      const calculatedPrice = rawVal < 1 ? (1 / rawVal) : rawVal;
      livePrices[sym] = calculatedPrice;
    }
  });

  APP_STATE.lastUpdated = new Date();
  renderAllViews();
}

function simulateApiData() {
  // Initialize live prices from Master Config with slight realistic micro variations
  Object.keys(METALS_CONFIG).forEach(sym => {
    if (!livePrices[sym]) {
      livePrices[sym] = METALS_CONFIG[sym].basePriceTozUSD;
    }
  });
  APP_STATE.lastUpdated = new Date();
  renderAllViews();
  return true;
}

// --- 6. Live Tick Simulator (Interactive micro-pulse) ---
function startLiveMarketSimulation() {
  if (liveSimulationTimer) clearInterval(liveSimulationTimer);

  liveSimulationTimer = setInterval(() => {
    if (!APP_STATE.isLiveSimulationActive) return;

    // Randomly select 1 to 3 metals to tick
    const metalKeys = Object.keys(METALS_CONFIG);
    const targetCount = 1 + Math.floor(Math.random() * 2);

    for (let i = 0; i < targetCount; i++) {
      const sym = metalKeys[Math.floor(Math.random() * metalKeys.length)];
      const conf = METALS_CONFIG[sym];
      const prevPrice = livePrices[sym] || conf.basePriceTozUSD;
      
      // Micro tick: -0.08% to +0.08%
      const deltaPct = (Math.random() - 0.49) * 0.0016;
      const newPrice = Math.max(0.1, prevPrice * (1 + deltaPct));
      livePrices[sym] = newPrice;

      // Visual flash on card
      const cardEl = document.getElementById(`metal-card-${sym}`);
      if (cardEl) {
        const flashClass = deltaPct >= 0 ? 'flash-up' : 'flash-down';
        cardEl.classList.remove('flash-up', 'flash-down');
        void cardEl.offsetWidth; // Trigger reflow
        cardEl.classList.add(flashClass);
      }
    }

    APP_STATE.lastUpdated = new Date();
    updateHeaderInsights();
    updateMetalCards();
  }, 3500);
}

// --- 7. UI Rendering Functions ---

// 7.1 Header & Insights Bar
function updateHeaderInsights() {
  const goldPrice = livePrices['XAU'] || METALS_CONFIG.XAU.basePriceTozUSD;
  const silverPrice = livePrices['XAG'] || METALS_CONFIG.XAG.basePriceTozUSD;
  const ratio = (goldPrice / silverPrice).toFixed(2);
  
  const ratioEl = document.getElementById('goldSilverRatio');
  if (ratioEl) ratioEl.textContent = ratio;

  const timeEl = document.getElementById('lastUpdatedTime');
  if (timeEl) {
    const d = APP_STATE.lastUpdated;
    timeEl.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  }
}

function updateDataSourceBadge(isLive, label) {
  const badge = document.getElementById('dataSourceBadge');
  if (badge) {
    badge.innerHTML = `<i data-lucide="${isLive ? 'zap' : 'cpu'}" class="icon-sm"></i> ${label}`;
    badge.style.color = isLive ? 'var(--color-up)' : 'var(--primary-accent)';
    lucide.createIcons();
  }
}

// 7.2 [요구사항 1] 상단 금속 가격 카드뷰 렌더링
function renderMetalCards() {
  const grid = document.getElementById('metalCardsGrid');
  if (!grid) return;

  grid.innerHTML = '';

  Object.keys(METALS_CONFIG).forEach(sym => {
    const metal = METALS_CONFIG[sym];
    const spotPriceUSD = livePrices[sym] || metal.basePriceTozUSD;
    const convertedPrice = convertPrice(spotPriceUSD, APP_STATE.selectedCurrency, APP_STATE.selectedUnit);
    const formattedPrice = formatCurrency(convertedPrice);
    
    // High / Low estimation for 24h
    const highUSD = spotPriceUSD * (1 + Math.abs(metal.dailyChangePct) * 0.008 + 0.005);
    const lowUSD = spotPriceUSD * (1 - Math.abs(metal.dailyChangePct) * 0.008 - 0.005);
    const formattedHigh = formatCurrency(convertPrice(highUSD, APP_STATE.selectedCurrency, APP_STATE.selectedUnit));
    const formattedLow = formatCurrency(convertPrice(lowUSD, APP_STATE.selectedCurrency, APP_STATE.selectedUnit));

    const isPositive = metal.dailyChangePct >= 0;
    const changeClass = isPositive ? 'positive' : 'negative';
    const changeSign = isPositive ? '+' : '';
    const arrowIcon = isPositive ? 'trending-up' : 'trending-down';

    const card = document.createElement('div');
    card.className = 'metal-card';
    card.id = `metal-card-${sym}`;
    card.style.setProperty('--card-accent', metal.color);
    card.style.setProperty('--card-glow', metal.glowColor);

    card.innerHTML = `
      <div class="card-top">
        <div class="card-metal-info">
          <div class="metal-icon-bubble" style="background:${metal.gradient}">${metal.iconLetter}</div>
          <div class="metal-name-box">
            <h3>${metal.nameKo}</h3>
            <span class="metal-symbol">${metal.symbol} · ${metal.nameEn}</span>
          </div>
        </div>
        <span class="card-badge-category">${metal.category}</span>
      </div>

      <div class="card-price-row">
        <div>
          <span class="card-price mono-num" id="card-price-val-${sym}">${formattedPrice}</span>
          <span class="card-unit-label">/${getUnitDisplayLabel(APP_STATE.selectedUnit)}</span>
        </div>
        <span class="change-pill ${changeClass}">
          <i data-lucide="${arrowIcon}" class="icon-sm"></i>
          <span>${changeSign}${metal.dailyChangePct.toFixed(2)}%</span>
        </span>
      </div>

      <div class="card-bottom-stats">
        <div class="stat-col">
          <span class="stat-label">24H 최고가</span>
          <span class="stat-val" id="card-high-${sym}">${formattedHigh}</span>
        </div>
        <div class="stat-col">
          <span class="stat-label">24H 최저가</span>
          <span class="stat-val" id="card-low-${sym}">${formattedLow}</span>
        </div>
      </div>
    `;

    // Click card to smooth scroll to that metal's vertical chart
    card.addEventListener('click', () => {
      const chartEl = document.getElementById(`chart-card-${sym}`);
      if (chartEl) {
        chartEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        chartEl.style.boxShadow = `0 0 35px ${metal.color}`;
        setTimeout(() => {
          chartEl.style.boxShadow = '';
        }, 1200);
      }
    });

    grid.appendChild(card);
  });

  lucide.createIcons();
}

// 7.2.1 Update existing metal cards without full DOM rebuild (high performance)
function updateMetalCards() {
  Object.keys(METALS_CONFIG).forEach(sym => {
    const metal = METALS_CONFIG[sym];
    const spotPriceUSD = livePrices[sym] || metal.basePriceTozUSD;
    const convertedPrice = convertPrice(spotPriceUSD, APP_STATE.selectedCurrency, APP_STATE.selectedUnit);
    const formattedPrice = formatCurrency(convertedPrice);

    const priceEl = document.getElementById(`card-price-val-${sym}`);
    if (priceEl) priceEl.textContent = formattedPrice;

    const highUSD = spotPriceUSD * (1 + Math.abs(metal.dailyChangePct) * 0.008 + 0.005);
    const lowUSD = spotPriceUSD * (1 - Math.abs(metal.dailyChangePct) * 0.008 - 0.005);
    const highEl = document.getElementById(`card-high-${sym}`);
    const lowEl = document.getElementById(`card-low-${sym}`);
    if (highEl) highEl.textContent = formatCurrency(convertPrice(highUSD, APP_STATE.selectedCurrency, APP_STATE.selectedUnit));
    if (lowEl) lowEl.textContent = formatCurrency(convertPrice(lowUSD, APP_STATE.selectedCurrency, APP_STATE.selectedUnit));
  });
}

function getUnitDisplayLabel(unit) {
  switch (unit) {
    case 'g': return 'g (그램)';
    case 'toz': return 'toz (온스)';
    case 'don': return '돈 (3.75g)';
    default: return unit;
  }
}

// 7.3 [요구사항 3] 하단 세로형 개별 금속 시세 변동 차트 스택 렌더링
function renderVerticalCharts() {
  const container = document.getElementById('chartsVerticalStack');
  if (!container) return;

  // Clear existing Chart.js instances to avoid memory leaks
  Object.keys(chartInstances).forEach(key => {
    if (chartInstances[key]) {
      chartInstances[key].destroy();
      delete chartInstances[key];
    }
  });

  container.innerHTML = '';

  // Render each metal as a standalone full-width vertical card
  APP_STATE.activeMetals.forEach((sym) => {
    const metal = METALS_CONFIG[sym];
    if (!metal) return;

    const histData = generateHistoricalData(sym, APP_STATE.selectedTimeframe);
    const prices = histData.map(d => d.price);
    const highPrice = Math.max(...prices);
    const lowPrice = Math.min(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    
    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    const periodChangePct = ((lastPrice - firstPrice) / firstPrice) * 100;
    const isPeriodUp = periodChangePct >= 0;

    const chartCard = document.createElement('div');
    chartCard.className = 'chart-card-vertical';
    chartCard.id = `chart-card-${sym}`;
    chartCard.style.setProperty('--metal-gradient', metal.gradient);
    chartCard.style.setProperty('--chart-border-glow', metal.glowColor);
    chartCard.style.setProperty('--chart-glow-bg', metal.glowColor);

    chartCard.innerHTML = `
      <div class="chart-header-row">
        <div class="chart-metal-title">
          <div class="chart-metal-icon">${metal.iconLetter}</div>
          <div class="chart-metal-text">
            <h3>${metal.nameKo} <span class="symbol-tag">(${metal.symbol} · ${metal.nameEn})</span></h3>
            <span class="card-unit-label">기준: 1 ${getUnitDisplayLabel(APP_STATE.selectedUnit)} · ${APP_STATE.selectedCurrency}</span>
          </div>
        </div>

        <div class="chart-stats-badges">
          <div class="metric-badge">
            <span class="metric-label">현재 시세</span>
            <span class="metric-val mono-num" id="chart-spot-${sym}">${formatCurrency(lastPrice)}</span>
          </div>
          <div class="metric-badge">
            <span class="metric-label">${APP_STATE.selectedTimeframe} 기간 변동</span>
            <span class="metric-val mono-num ${isPeriodUp ? 'high' : 'low'}">
              ${isPeriodUp ? '+' : ''}${periodChangePct.toFixed(2)}%
            </span>
          </div>
          <div class="metric-badge">
            <span class="metric-label">기간 최고가</span>
            <span class="metric-val high mono-num">${formatCurrency(highPrice)}</span>
          </div>
          <div class="metric-badge">
            <span class="metric-label">기간 최저가</span>
            <span class="metric-val low mono-num">${formatCurrency(lowPrice)}</span>
          </div>
          <div class="metric-badge">
            <span class="metric-label">기간 평균가</span>
            <span class="metric-val mono-num">${formatCurrency(avgPrice)}</span>
          </div>

          <div class="chart-actions">
            <button class="chart-btn-icon" data-action="export-csv" data-symbol="${sym}" title="CSV 데이터 다운로드">
              <i data-lucide="download" class="icon-sm"></i>
            </button>
            <button class="chart-btn-icon" data-action="export-png" data-symbol="${sym}" title="차트 이미지 저장">
              <i data-lucide="image" class="icon-sm"></i>
            </button>
          </div>
        </div>
      </div>

      <div class="chart-canvas-container">
        <canvas id="canvas-${sym}"></canvas>
      </div>
    `;

    container.appendChild(chartCard);

    // Initialize Chart.js for this metal
    createChartInstance(sym, histData, metal);
  });

  // Attach CSV / PNG download event handlers
  attachChartActionHandlers();
  lucide.createIcons();
}

function createChartInstance(sym, histData, metal) {
  const canvas = document.getElementById(`canvas-${sym}`);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  
  // Create beautiful gradient background fill
  const gradientFill = ctx.createLinearGradient(0, 0, 0, 280);
  gradientFill.addColorStop(0, metal.glowColor);
  gradientFill.addColorStop(1, 'rgba(18, 26, 44, 0.01)');

  const labels = histData.map(d => d.dateLabel);
  const dataValues = histData.map(d => d.price);

  chartInstances[sym] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: `${metal.nameKo} 시세 (${APP_STATE.selectedCurrency}/${getUnitDisplayLabel(APP_STATE.selectedUnit)})`,
        data: dataValues,
        borderColor: metal.color,
        borderWidth: 2.5,
        backgroundColor: gradientFill,
        fill: true,
        tension: 0.35, // Smooth Spline curve
        pointRadius: histData.length > 40 ? 0 : 3.5,
        pointHoverRadius: 6,
        pointBackgroundColor: metal.color,
        pointBorderColor: '#070A12',
        pointBorderWidth: 2,
        pointHoverBorderWidth: 3,
        pointHoverBackgroundColor: '#FFFFFF',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#F8FAFC',
          titleFont: { size: 12, weight: 'bold', family: 'Pretendard' },
          bodyColor: metal.color,
          bodyFont: { size: 14, weight: 'bold', family: 'JetBrains Mono' },
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          padding: 12,
          boxPadding: 6,
          displayColors: false,
          callbacks: {
            title: function(context) {
              const idx = context[0].dataIndex;
              const dateObj = histData[idx].date;
              return `${dateObj.getFullYear()}년 ${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일 기준`;
            },
            label: function(context) {
              return `${metal.nameKo}: ${formatCurrency(context.parsed.y)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.04)',
            drawTicks: false
          },
          ticks: {
            color: '#64748B',
            font: { size: 11, family: 'JetBrains Mono' },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8
          }
        },
        y: {
          position: 'right',
          grid: {
            color: 'rgba(255, 255, 255, 0.04)',
            drawTicks: false
          },
          ticks: {
            color: '#94A3B8',
            font: { size: 11, family: 'JetBrains Mono' },
            callback: function(val) {
              return formatCurrency(val);
            }
          }
        }
      }
    }
  });
}

// 7.4 Quick Metal Visibility Toggles
function renderMetalToggles() {
  const container = document.getElementById('metalToggles');
  if (!container) return;

  container.innerHTML = '';

  Object.keys(METALS_CONFIG).forEach(sym => {
    const metal = METALS_CONFIG[sym];
    const isActive = APP_STATE.activeMetals.includes(sym);
    
    const chip = document.createElement('div');
    chip.className = `metal-chip-toggle ${isActive ? 'active' : ''}`;
    chip.innerHTML = `<span>${metal.nameKo.split(' ')[0]}</span>`;

    chip.addEventListener('click', () => {
      if (APP_STATE.activeMetals.includes(sym)) {
        if (APP_STATE.activeMetals.length <= 1) {
          showToast('알림', '최소 1개 이상의 금속 차트가 표시되어야 합니다.', 'info');
          return;
        }
        APP_STATE.activeMetals = APP_STATE.activeMetals.filter(s => s !== sym);
      } else {
        APP_STATE.activeMetals.push(sym);
      }
      renderMetalToggles();
      renderVerticalCharts();
    });

    container.appendChild(chip);
  });
}

function renderAllViews() {
  updateHeaderInsights();
  renderMetalCards();
  renderVerticalCharts();
  renderMetalToggles();
}

// --- 8. Event Handlers & User Interactions ---
function initEventBindings() {
  // Currency Select Change
  const currencySelect = document.getElementById('currencySelect');
  if (currencySelect) {
    currencySelect.value = APP_STATE.selectedCurrency;
    currencySelect.addEventListener('change', (e) => {
      APP_STATE.selectedCurrency = e.target.value;
      renderAllViews();
      const currNames = { KRW: '원화 (₩)', USD: '달러 ($)', JPY: '엔화 (¥)', CNY: '위안화 (¥)' };
      showToast('통화 변경', `표시 통화가 ${currNames[APP_STATE.selectedCurrency] || APP_STATE.selectedCurrency}(으)로 변경되었습니다.`);
    });
  }

  // Weight Unit Select Change
  const unitSelect = document.getElementById('unitSelect');
  if (unitSelect) {
    unitSelect.value = APP_STATE.selectedUnit;
    unitSelect.addEventListener('change', (e) => {
      APP_STATE.selectedUnit = e.target.value;
      renderAllViews();
      showToast('단위 변경', `중량 단위가 ${getUnitDisplayLabel(APP_STATE.selectedUnit)}(으)로 변경되었습니다.`);
    });
  }

  // Timeframe Buttons Click
  const tfButtons = document.querySelectorAll('.tf-btn');
  tfButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tfButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      APP_STATE.selectedTimeframe = btn.getAttribute('data-period');
      renderVerticalCharts();
      showToast('기간 변경', `${btn.textContent} 차트 데이터가 반영되었습니다.`);
    });
  });

  // Refresh Button
  const refreshBtn = document.getElementById('refreshBtn');
  const refreshIcon = document.getElementById('refreshIcon');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      if (refreshIcon) refreshIcon.classList.add('rotating');
      await fetchLiveExchangeRates();
      await fetchMetalPriceAPI();
      renderAllViews();
      showToast('새로고침', '실시간 환율 및 금속 시세가 갱신되었습니다.', 'success');
      setTimeout(() => {
        if (refreshIcon) refreshIcon.classList.remove('rotating');
      }, 750);
    });
  }

  // API Modal Handlers
  initApiModal();
}

// 8.1 API Settings Modal
function initApiModal() {
  const modal = document.getElementById('apiModal');
  const openBtn = document.getElementById('openApiSettingsBtn');
  const closeBtn = document.getElementById('closeApiModalBtn');
  const saveBtn = document.getElementById('saveApiBtn');
  const testBtn = document.getElementById('testApiBtn');
  const keyInput = document.getElementById('apiKeyInput');
  const toggleEye = document.getElementById('toggleApiKeyVisibility');
  const statusBox = document.getElementById('apiTestResultBox');
  const statusMsg = document.getElementById('apiStatusMessage');

  if (keyInput && APP_STATE.apiKey) {
    keyInput.value = APP_STATE.apiKey;
  }

  if (openBtn && modal) {
    openBtn.addEventListener('click', () => {
      modal.classList.add('open');
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('open');
    });
  }

  // Close modal when clicking backdrop
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  }

  // Toggle API Key visibility
  if (toggleEye && keyInput) {
    toggleEye.addEventListener('click', () => {
      const type = keyInput.getAttribute('type') === 'password' ? 'text' : 'password';
      keyInput.setAttribute('type', type);
      const eyeIcon = document.getElementById('eyeIcon');
      if (eyeIcon) {
        eyeIcon.setAttribute('data-lucide', type === 'password' ? 'eye' : 'eye-off');
        lucide.createIcons();
      }
    });
  }

  // Save Settings
  if (saveBtn && keyInput) {
    saveBtn.addEventListener('click', async () => {
      const enteredKey = keyInput.value.trim();
      APP_STATE.apiKey = enteredKey;
      localStorage.setItem('metalprice_api_key', enteredKey);

      const modeRadio = document.querySelector('input[name="apiMode"]:checked');
      if (modeRadio) APP_STATE.apiMode = modeRadio.value;

      modal.classList.remove('open');
      showToast('설정 완료', 'MetalpriceAPI 설정이 저장되었습니다.');
      await fetchMetalPriceAPI();
    });
  }

  // Test Connection Button
  if (testBtn && keyInput) {
    testBtn.addEventListener('click', async () => {
      const testKey = keyInput.value.trim();
      if (!testKey) {
        setStatusMsg('error', 'API 키를 먼저 입력해 주세요.');
        return;
      }

      setStatusMsg('info', '연결 상태를 확인 중입니다...');
      testBtn.disabled = true;

      try {
        const url = `https://api.metalpriceapi.com/v1/latest?api_key=${encodeURIComponent(testKey)}&base=USD&currencies=XAU`;
        const res = await fetch(url);
        const data = await res.json();

        if (data && data.success) {
          setStatusMsg('success', '✓ API 키가 정상 인증되었습니다. (실시간 연동 가능)');
        } else {
          setStatusMsg('error', `인증 실패: ${data.error?.info || '유효하지 않은 키입니다.'}`);
        }
      } catch (err) {
        setStatusMsg('error', `네트워크 오류 또는 CORS 제한: ${err.message}`);
      } finally {
        testBtn.disabled = false;
      }
    });
  }

  function setStatusMsg(type, msg) {
    if (!statusBox || !statusMsg) return;
    statusBox.className = `api-status-box ${type}`;
    statusMsg.textContent = msg;
  }
}

// 8.2 Chart PNG / CSV Export Handlers
function attachChartActionHandlers() {
  document.querySelectorAll('[data-action="export-csv"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const sym = btn.getAttribute('data-symbol');
      exportChartToCSV(sym);
    });
  });

  document.querySelectorAll('[data-action="export-png"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const sym = btn.getAttribute('data-symbol');
      exportChartToPNG(sym);
    });
  });
}

function exportChartToCSV(sym) {
  const metal = METALS_CONFIG[sym];
  const hist = generateHistoricalData(sym, APP_STATE.selectedTimeframe);
  
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += `Date,Metal,Symbol,Price (${APP_STATE.selectedCurrency}),Unit\n`;

  hist.forEach(row => {
    const dateStr = row.date.toISOString().split('T')[0];
    csvContent += `${dateStr},"${metal.nameKo}",${sym},${row.price.toFixed(4)},${APP_STATE.selectedUnit}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${sym}_${APP_STATE.selectedTimeframe}_metalprice.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('다운로드', `${metal.nameKo} CSV 파일이 다운로드되었습니다.`);
}

function exportChartToPNG(sym) {
  const canvas = document.getElementById(`canvas-${sym}`);
  if (!canvas) return;

  const imageUri = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.setAttribute("href", imageUri);
  link.setAttribute("download", `${sym}_chart.png`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('다운로드', '차트 이미지가 PNG 파일로 저장되었습니다.');
}

// 8.3 Toast Message Alert
function showToast(title, message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-triangle';

  toast.innerHTML = `
    <i data-lucide="${iconName}" class="icon-sm" style="color:var(--primary-accent)"></i>
    <div>
      <strong>${title}:</strong> <span>${message}</span>
    </div>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// --- 9. App Bootstrapper ---
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Lucide icons
  lucide.createIcons();

  // Bind UI Events
  initEventBindings();

  // 1. 실시간 OpenAPI 환율 데이터 호출 (USD/KRW 등)
  await fetchLiveExchangeRates();

  // 2. 금속 시세 데이터 호출 (MetalpriceAPI 또는 시뮬레이터)
  await fetchMetalPriceAPI();

  // 3. 전체 카드뷰 및 차트 렌더링
  renderAllViews();

  // 4. 실시간 호가 마이크로 틱 시뮬레이션 시작
  startLiveMarketSimulation();

  // 5. 60초 주기 실시간 환율 자동 갱신
  setInterval(async () => {
    await fetchLiveExchangeRates();
    updateMetalCards();
  }, 60000);
});
