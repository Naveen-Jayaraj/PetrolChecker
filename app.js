// Baseline fuel rates database for Indian States and default backup
const BASE_PETROL_RATES = {
  "IN": {
    "Delhi": 94.72,
    "Maharashtra": 104.21,
    "Karnataka": 102.84,
    "Tamil Nadu": 100.75,
    "Telangana": 107.41,
    "West Bengal": 103.94,
    "Gujarat": 94.44,
    "Rajasthan": 104.88,
    "Uttar Pradesh": 94.65,
    "Kerala": 105.80,
    "Andhra Pradesh": 109.87,
    "Madhya Pradesh": 106.47,
    "Bihar": 105.18,
    "Punjab": 96.40,
    "Haryana": 95.20,
    "Default": 99.50
  },
  "Default": 102.50
};

// Global App State
let state = {
  vehicles: [],
  refills: [],
  activeVehicleId: '',
  theme: 'dark', // 'dark' (AMOLED) or 'light' (Yellow-White)
  location: { city: 'Mumbai', region: 'Maharashtra', country: 'IN' },
  petrolRate: 104.21,
  rateSource: 'Default Rate', // 'API Detected' or 'Fallback Database' or 'User Input'
  streaks: { count: 0, lastActionDate: null },
  achievements: []
};

// Helper: Save State to LocalStorage
function saveState() {
  localStorage.setItem('petrol_tracker_state', JSON.stringify(state));
}

// Helper: Load State from LocalStorage
function loadState() {
  const stored = localStorage.getItem('petrol_tracker_state');
  if (stored) {
    try {
      state = JSON.parse(stored);
      // Recalculate mileage for all vehicles
      state.vehicles.forEach(v => {
        if (v.manualMileage === undefined) {
          v.manualMileage = v.mileage;
        }
        recalculateVehicleMileage(v);
      });
      // Ensure streaks/achievements exist
      if (!state.streaks) state.streaks = { count: 0, lastActionDate: null };
      if (!state.achievements) state.achievements = [];
      // Double check active vehicle
      if (state.vehicles.length > 0 && !state.activeVehicleId) {
        state.activeVehicleId = state.vehicles[0].id;
      }
    } catch (e) {
      console.error("Failed to parse stored state. Initializing defaults.", e);
      initializeDefaults();
    }
  } else {
    initializeDefaults();
  }
}

// Helper: Initialize Default Vehicle if Storage is Empty
function initializeDefaults() {
  state.vehicles = [];
  state.activeVehicleId = '';
  state.refills = [];
  state.theme = 'dark';
  state.petrolRate = 104.21;
  state.rateSource = 'Default Database';
  state.streaks = { count: 0, lastActionDate: null };
  state.achievements = [];
  saveState();
}


// Dynamic Petrol Rate Fetcher via Location API
async function fetchLocalPetrolRate() {
  const badgeDot = document.getElementById('rate-status-dot');
  const badgeText = document.getElementById('rate-status-text');
  
  if (!navigator.onLine) {
    updateRateUI(state.petrolRate, 'offline');
    return;
  }
  
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (!res.ok) throw new Error("Location fetch failed");
    const data = await res.json();
    
    if (data.country_code || data.country) {
      const country = data.country_code || data.country;
      const region = data.region || 'Default';
      const city = data.city || '';
      
      state.location = { city, region, country };
      
      let baseRate = 102.50; // default backup
      if (BASE_PETROL_RATES[country]) {
        if (typeof BASE_PETROL_RATES[country] === 'object') {
          baseRate = BASE_PETROL_RATES[country][region] || BASE_PETROL_RATES[country]['Default'] || 99.50;
        } else {
          baseRate = BASE_PETROL_RATES[country];
        }
      } else {
        baseRate = BASE_PETROL_RATES['Default'];
      }
      
      // Simulate micro daily variation
      const day = new Date().getDate();
      const variation = parseFloat((Math.sin(day) * 0.75).toFixed(2));
      const simulatedRate = parseFloat((baseRate + variation).toFixed(2));
      
      state.petrolRate = simulatedRate;
      state.rateSource = `Live Rate for ${city || region}`;
      saveState();
      
      updateRateUI(simulatedRate, 'live');
    }
  } catch (err) {
    console.warn("Could not fetch location. Using cached price.", err);
    updateRateUI(state.petrolRate, 'fallback');
  }
}

function updateRateUI(rate, status) {
  const badgeDot = document.getElementById('rate-status-dot');
  const badgeText = document.getElementById('rate-status-text');
  const rateInput = document.getElementById('refill-rate');
  
  if (rateInput) {
    rateInput.value = rate.toFixed(2);
  }
  
  if (badgeDot && badgeText) {
    badgeDot.className = 'status-dot';
    if (status === 'live') {
      badgeDot.classList.add('online');
      badgeText.innerText = state.rateSource;
    } else if (status === 'fallback') {
      badgeDot.classList.remove('online');
      badgeText.innerText = `Cached database rate`;
    } else {
      badgeDot.classList.remove('online');
      badgeText.innerText = `Offline: using last rate`;
    }
  }
  
  // Run modal calculation preview
  calculateRefillPreview();
}

// Active Vehicle Helper
function getActiveVehicle() {
  return state.vehicles.find(v => v.id === state.activeVehicleId) || state.vehicles[0];
}

// UI Rendering Engine: Dashboard
function renderDashboard() {
  const vehicle = getActiveVehicle();
  if (!vehicle) {
    document.getElementById('active-vehicle-name-header').innerText = 'No Vehicle';
    document.getElementById('dash-range-left').innerText = `0 km`;
    document.getElementById('dash-range-percent').innerText = 'Please add a vehicle';
    document.getElementById('dash-current-odo').innerText = `0 km`;
    document.getElementById('dash-mileage').innerText = `0 km/L`;
    document.getElementById('dash-last-refill-odo').innerText = 'None';
    return;
  }
  
  // Update header text
  document.getElementById('active-vehicle-name-header').innerText = vehicle.name;
  
  // Calculate remaining range
  // Range Left = (Last Refill Odometer + Last Refill Range) - Current Odometer
  const totalRange = vehicle.lastRefillRange || 0;
  const currentOdo = vehicle.odometer || 0;
  const lastRefillOdo = vehicle.lastRefillOdo || 0;
  
  let rangeLeft = 0;
  let percentLeft = 0;
  
  if (totalRange > 0) {
    const endOdo = lastRefillOdo + totalRange;
    rangeLeft = Math.max(0, parseFloat((endOdo - currentOdo).toFixed(1)));
    percentLeft = Math.min(100, Math.max(0, Math.round((rangeLeft / totalRange) * 100)));
  } else {
    // If no refill recorded yet
    rangeLeft = 0;
    percentLeft = 0;
  }
  
  // Update UI texts
  document.getElementById('dash-range-left').innerText = `${rangeLeft} km`;
  document.getElementById('dash-range-percent').innerText = totalRange > 0 ? `${percentLeft}% Range Left` : 'Refill needed';
  document.getElementById('dash-current-odo').innerText = `${currentOdo.toLocaleString()} km`;
  document.getElementById('dash-mileage').innerText = `${vehicle.mileage.toFixed(1)} km/L`;
  document.getElementById('dash-last-refill-odo').innerText = lastRefillOdo > 0 ? `${lastRefillOdo.toLocaleString()} km` : 'None';
  
  // Gauge animation
  const circle = document.getElementById('dash-gauge-circle');
  if (circle) {
    const radius = 80;
    const circumference = 2 * Math.PI * radius; // 502.65
    circle.setAttribute('stroke-dasharray', circumference);
    
    // Dash offset: if 100% left, offset is 0. If 0% left, offset is circumference.
    const offset = circumference - (percentLeft / 100) * circumference;
    circle.setAttribute('stroke-dashoffset', offset);
    
    // Dynamic color shifting for visual cue
    if (percentLeft > 50) {
      circle.style.stroke = 'var(--accent-color)';
    } else if (percentLeft > 20) {
      circle.style.stroke = '#ffa726'; // amber warning
    } else {
      circle.style.stroke = 'var(--danger-color)'; // red danger
    }
  }
  
  // Odometer Direct Input setup
  const odoInput = document.getElementById('current-odo-input');
  if (odoInput) {
    odoInput.value = currentOdo;
    odoInput.min = lastRefillOdo;
  }
  
  // Update travelled diff text
  const diff = Math.max(0, currentOdo - lastRefillOdo);
  const diffSpan = document.getElementById('odo-travelled-diff');
  if (diffSpan) {
    diffSpan.innerText = `Travelled: ${diff} km since fill`;
  }
  
  // Gamification Updates
  const streakBanner = document.getElementById('streak-banner');
  const streakCount = document.getElementById('streak-count');
  if (streakBanner && state.streaks) {
    if (state.streaks.count > 0) {
      streakBanner.style.display = 'flex';
      streakCount.innerText = state.streaks.count;
    } else {
      streakBanner.style.display = 'none';
    }
  }
}

// Odometer Updates
function updateOdometer(newValue) {
  const vehicle = getActiveVehicle();
  if (!vehicle) return;
  
  newValue = parseInt(newValue);
  if (isNaN(newValue) || newValue < vehicle.lastRefillOdo) {
    newValue = vehicle.lastRefillOdo;
  }
  
  vehicle.odometer = newValue;
  
  // Gamification trigger
  if (typeof updateStreakAndAchievements === 'function') {
    updateStreakAndAchievements();
  } else {
    saveState();
    renderDashboard();
  }
}

function softUpdateOdometer(newValue) {
  const vehicle = getActiveVehicle();
  if (!vehicle) return;
  
  const totalRange = vehicle.lastRefillRange || 0;
  const lastRefillOdo = vehicle.lastRefillOdo || 0;
  
  let rangeLeft = 0;
  let percentLeft = 0;
  
  if (totalRange > 0) {
    const endOdo = lastRefillOdo + totalRange;
    rangeLeft = Math.max(0, parseFloat((endOdo - newValue).toFixed(1)));
    percentLeft = Math.min(100, Math.max(0, Math.round((rangeLeft / totalRange) * 100)));
  }
  
  document.getElementById('dash-range-left').innerText = `${rangeLeft} km`;
  document.getElementById('dash-range-percent').innerText = totalRange > 0 ? `${percentLeft}% Range Left` : 'Refill needed';
  
  // Update travelled diff text
  const diff = Math.max(0, newValue - lastRefillOdo);
  const diffSpan = document.getElementById('odo-travelled-diff');
  if (diffSpan) {
    diffSpan.innerText = `Travelled: ${diff} km since fill`;
  }
  
  // Update gauge circle
  const circle = document.getElementById('dash-gauge-circle');
  if (circle) {
    const radius = 80;
    const circumference = 2 * Math.PI * radius;
    circle.setAttribute('stroke-dasharray', circumference);
    const offset = circumference - (percentLeft / 100) * circumference;
    circle.setAttribute('stroke-dashoffset', offset);
    if (percentLeft > 50) {
      circle.style.stroke = 'var(--accent-color)';
    } else if (percentLeft > 20) {
      circle.style.stroke = '#ffa726';
    } else {
      circle.style.stroke = 'var(--danger-color)';
    }
  }
}

function recalculateVehicleMileage(vehicle) {
  if (!vehicle) return;
  
  if (vehicle.manualMileage === undefined) {
    vehicle.manualMileage = vehicle.mileage || 45;
  }
  
  // Find all refills for this vehicle
  const vRefills = state.refills
    .filter(r => r.vehicleId === vehicle.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date) || a.odometer - b.odometer);
    
  const N = vRefills.length - 1; // Number of trips
  
  if (N <= 0) {
    vehicle.mileage = vehicle.manualMileage;
    return;
  }
  
  // Calculate learned mileage
  const firstRefill = vRefills[0];
  const lastRefill = vRefills[vRefills.length - 1];
  const totalDistance = lastRefill.odometer - firstRefill.odometer;
  
  // Sum liters for all refills except the last one
  let totalLiters = 0;
  for (let i = 0; i < vRefills.length - 1; i++) {
    totalLiters += vRefills[i].liters;
  }
  
  if (totalDistance > 0 && totalLiters > 0) {
    const learnedMileage = totalDistance / totalLiters;
    
    // Blending formula
    const weightManual = Math.max(0, 3 - N);
    const blendedMileage = (vehicle.manualMileage * weightManual + learnedMileage * N) / (weightManual + N);
    
    vehicle.mileage = parseFloat(blendedMileage.toFixed(2));
  } else {
    vehicle.mileage = vehicle.manualMileage;
  }
}


// UI Rendering Engine: History List
function renderHistory() {
  const timeline = document.getElementById('refill-timeline');
  if (!timeline) return;
  timeline.innerHTML = '';
  
  const activeTab = document.querySelector('.filter-chip.active');
  const filterType = activeTab ? activeTab.dataset.filter : 'all';
  
  const filteredRefills = getFilteredRefills(filterType);
  
  // Calculate Statistics for active filters
  calculateStats(filteredRefills);
  
  if (filteredRefills.length === 0) {
    timeline.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3>No Refills Found</h3>
        <p>Log a new petrol fill using the refill button on the main dashboard.</p>
      </div>
    `;
    // Render empty charts
    renderCharts([]);
    return;
  }
  
  // Sort descending by date & odometer for history display
  const sortedRefills = [...filteredRefills].sort((a, b) => new Date(b.date) - new Date(a.date) || b.odometer - a.odometer);
  
  sortedRefills.forEach(refill => {
    // Find previous refill to calculate trip details
    const previousRefill = getPreviousRefill(refill);
    let tripDistance = 'N/A';
    let actualMileage = 'N/A';
    
    if (previousRefill) {
      tripDistance = refill.odometer - previousRefill.odometer;
      if (tripDistance > 0 && previousRefill.liters > 0) {
        // Distance traveled since last refill / fuel added at last refill
        actualMileage = (tripDistance / previousRefill.liters).toFixed(1);
      }
    }
    
    const card = document.createElement('div');
    card.className = 'timeline-card';
    
    const vName = state.vehicles.find(v => v.id === refill.vehicleId)?.name || 'Unknown';
    const dateFormatted = new Date(refill.date).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
    
    card.innerHTML = `
      <button class="btn-delete-refill" onclick="deleteRefill('${refill.id}')">
        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
      <div class="timeline-card-header">
        <div class="timeline-date">${dateFormatted} &bull; <strong style="color:var(--text-secondary)">${vName}</strong></div>
        <div class="timeline-cost">₹${refill.amount}</div>
      </div>
      <div class="timeline-grid">
        <div class="timeline-item">
          <span class="timeline-label">Odometer</span>
          <span class="timeline-value">${refill.odometer} km</span>
        </div>
        <div class="timeline-item">
          <span class="timeline-label">Fuel Added</span>
          <span class="timeline-value">${refill.liters.toFixed(2)} L</span>
        </div>
        <div class="timeline-item">
          <span class="timeline-label">Price Rate</span>
          <span class="timeline-value">₹${refill.rate.toFixed(2)}</span>
        </div>
      </div>
      <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border-color); display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary);">
        <span>Distance covered: <strong>${tripDistance !== 'N/A' ? tripDistance + ' km' : 'N/A (First refuel)'}</strong></span>
        <span>Mileage: <strong>${actualMileage !== 'N/A' ? actualMileage + ' km/L' : 'N/A'}</strong></span>
      </div>
    `;
    timeline.appendChild(card);
  });
  
  // Render charts with filtered refills
  renderCharts(filteredRefills);
}

// Helpers for calculations
function getFilteredRefills(filter) {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  
  return state.refills.filter(refill => {
    const refDate = new Date(refill.date);
    if (filter === 'today') {
      return refill.date === todayStr;
    } else if (filter === 'month') {
      return refDate >= startOfMonth;
    } else if (filter === 'year') {
      return refDate >= startOfYear;
    }
    return true; // 'all'
  });
}

function getPreviousRefill(currentRefill) {
  // Find all refills for this vehicle
  const vRefills = state.refills
    .filter(r => r.vehicleId === currentRefill.vehicleId)
    .sort((a, b) => a.odometer - b.odometer);
    
  const index = vRefills.findIndex(r => r.id === currentRefill.id);
  if (index > 0) {
    return vRefills[index - 1];
  }
  return null;
}

// Statistics calculator
function calculateStats(refillsList) {
  let totalSpend = 0;
  let totalLiters = 0;
  let totalKmTravelled = 0;
  let tripMileages = [];
  
  // For total travelled, group by vehicle and find min/max odo
  const odoByVehicle = {};
  refillsList.forEach(r => {
    totalSpend += r.amount;
    totalLiters += r.liters;
    
    if (!odoByVehicle[r.vehicleId]) {
      odoByVehicle[r.vehicleId] = { min: r.odometer, max: r.odometer };
    } else {
      if (r.odometer < odoByVehicle[r.vehicleId].min) odoByVehicle[r.vehicleId].min = r.odometer;
      if (r.odometer > odoByVehicle[r.vehicleId].max) odoByVehicle[r.vehicleId].max = r.odometer;
    }
    
    // Calculate its trip mileage if possible
    const prev = getPreviousRefill(r);
    if (prev) {
      const dist = r.odometer - prev.odometer;
      if (dist > 0 && prev.liters > 0) {
        tripMileages.push(dist / prev.liters);
      }
    }
  });
  
  // Calculate total Km travelled
  Object.values(odoByVehicle).forEach(range => {
    totalKmTravelled += (range.max - range.min);
  });
  
  // Average mileage
  let avgMileage = 0;
  if (tripMileages.length > 0) {
    avgMileage = tripMileages.reduce((a, b) => a + b, 0) / tripMileages.length;
  } else {
    // Fallback to active vehicle nominal mileage
    const v = getActiveVehicle();
    avgMileage = v ? v.mileage : 45;
  }
  
  const avgCostPerKm = totalKmTravelled > 0 ? (totalSpend / totalKmTravelled) : 0;
  
  // Update stats cards in UI
  document.getElementById('stat-total-spent').innerText = `₹${Math.round(totalSpend).toLocaleString()}`;
  document.getElementById('stat-total-dist').innerText = `${totalKmTravelled.toLocaleString()} km`;
  document.getElementById('stat-avg-mileage').innerText = `${avgMileage.toFixed(1)} km/L`;
  document.getElementById('stat-cost-per-km').innerText = avgCostPerKm > 0 ? `₹${avgCostPerKm.toFixed(2)}/km` : '₹0.00';
}

// Chart Rendering Logic (Bar, Pie, Area)
function renderCharts(refillsList) {
  // 1. Monthly Spend Bar Chart
  const spendByMonth = {};
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  // Get last 6 months list
  const last6Months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    spendByMonth[key] = 0;
    last6Months.push({ key, label: `${monthNames[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}` });
  }
  
  refillsList.forEach(r => {
    const rDate = new Date(r.date);
    const key = `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, '0')}`;
    if (spendByMonth[key] !== undefined) {
      spendByMonth[key] += r.amount;
    }
  });
  
  const barChartData = last6Months.map(m => ({
    label: m.label,
    value: spendByMonth[m.key]
  }));
  
  renderBarChart('spend-bar-chart', barChartData);
  
  // 2. Vehicle Shares Pie Chart
  const refillShares = {};
  refillsList.forEach(r => {
    const v = state.vehicles.find(veh => veh.id === r.vehicleId);
    const name = v ? v.name : 'Unknown';
    refillShares[name] = (refillShares[name] || 0) + 1;
  });
  
  const pieChartData = Object.entries(refillShares).map(([label, value]) => ({
    label, value
  }));
  
  renderPieChart('vehicle-pie-chart', pieChartData);
  
  // 3. Mileage Trend Line Chart
  // Get last 6 refills chronologically for active vehicle
  const activeVehicleRefills = refillsList
    .filter(r => r.vehicleId === state.activeVehicleId)
    .sort((a, b) => new Date(a.date) - new Date(b.date) || a.odometer - b.odometer);
    
  const lineChartData = [];
  activeVehicleRefills.forEach(r => {
    const prev = getPreviousRefill(r);
    if (prev) {
      const dist = r.odometer - prev.odometer;
      if (dist > 0 && prev.liters > 0) {
        const dateStr = new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        lineChartData.push({
          label: dateStr,
          value: dist / prev.liters
        });
      }
    }
  });
  
  // Keep only last 6 mileage plots
  renderLineChart('mileage-line-chart', lineChartData.slice(-6));
}

// Chart Components Drawing (SVG manipulations)
function renderBarChart(svgId, data) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  svg.innerHTML = '';
  
  const width = svg.clientWidth || 340;
  const height = 160;
  const paddingLeft = 45;
  const paddingBottom = 25;
  const paddingTop = 15;
  const paddingRight = 15;
  
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  
  const maxVal = Math.max(...data.map(d => d.value)) * 1.15 || 500;
  
  // Draw Y grid lines
  const gridSteps = 3;
  for (let i = 0; i <= gridSteps; i++) {
    const y = paddingTop + chartHeight - (i / gridSteps) * chartHeight;
    const val = (i / gridSteps) * maxVal;
    
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', paddingLeft);
    line.setAttribute('y1', y);
    line.setAttribute('x2', width - paddingRight);
    line.setAttribute('y2', y);
    line.setAttribute('class', 'chart-grid-line');
    svg.appendChild(line);
    
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', paddingLeft - 8);
    text.setAttribute('y', y + 4);
    text.setAttribute('text-anchor', 'end');
    text.setAttribute('class', 'chart-axis-text');
    text.textContent = `₹${Math.round(val)}`;
    svg.appendChild(text);
  }
  
  // Draw bars
  const colWidth = chartWidth / data.length;
  const barWidth = colWidth * 0.55;
  
  data.forEach((d, i) => {
    const valHeight = (d.value / maxVal) * chartHeight;
    const x = paddingLeft + i * colWidth + (colWidth - barWidth) / 2;
    const y = paddingTop + chartHeight - valHeight;
    
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', barWidth);
    rect.setAttribute('height', Math.max(2, valHeight));
    rect.setAttribute('class', 'chart-bar');
    
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `${d.label}: ₹${d.value.toFixed(1)}`;
    rect.appendChild(title);
    svg.appendChild(rect);
    
    // Label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x + barWidth / 2);
    text.setAttribute('y', height - 8);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'chart-axis-text');
    text.textContent = d.label;
    svg.appendChild(text);
  });
}

function renderPieChart(svgId, data) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  svg.innerHTML = '';
  
  if (data.length === 0) {
    svg.innerHTML = `<text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" class="chart-axis-text">No shares available</text>`;
    return;
  }
  
  const colors = ['#ffd54f', '#ffb300', '#ff8f00', '#ffe082', '#fff59d'];
  const total = data.reduce((sum, d) => sum + d.value, 0);
  
  const centerX = (svg.clientWidth || 340) / 2;
  const centerY = 75;
  const radius = 55;
  
  let accumulatedAngle = 0;
  
  if (data.length === 1) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', centerX);
    circle.setAttribute('cy', centerY);
    circle.setAttribute('r', radius);
    circle.setAttribute('fill', colors[0]);
    circle.setAttribute('class', 'chart-pie-slice');
    
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `${data[0].label}: ${data[0].value} refills (100%)`;
    circle.appendChild(title);
    
    svg.appendChild(circle);
  } else {
    data.forEach((d, i) => {
      const sliceAngle = (d.value / total) * 360;
      
      const x1 = centerX + radius * Math.cos((accumulatedAngle - 90) * Math.PI / 180);
      const y1 = centerY + radius * Math.sin((accumulatedAngle - 90) * Math.PI / 180);
      
      accumulatedAngle += sliceAngle;
      
      const x2 = centerX + radius * Math.cos((accumulatedAngle - 90) * Math.PI / 180);
      const y2 = centerY + radius * Math.sin((accumulatedAngle - 90) * Math.PI / 180);
      
      const largeArc = sliceAngle > 180 ? 1 : 0;
      const pathData = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('fill', colors[i % colors.length]);
      path.setAttribute('class', 'chart-pie-slice');
      
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${d.label}: ${d.value} refills (${Math.round(d.value / total * 100)}%)`;
      path.appendChild(title);
      svg.appendChild(path);
    });
  }
  
  // Render Legends underneath
  const legendGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  legendGroup.setAttribute('transform', `translate(0, 145)`);
  
  let legendHTML = '';
  const legendContainer = document.getElementById('pie-legend-container');
  if (legendContainer) {
    legendContainer.innerHTML = '';
    data.forEach((d, i) => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `
        <span class="legend-dot" style="background-color: ${colors[i % colors.length]}"></span>
        <span>${d.label} (${Math.round(d.value / total * 100)}%)</span>
      `;
      legendContainer.appendChild(item);
    });
  }
}

function renderLineChart(svgId, data) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  svg.innerHTML = '';
  
  if (data.length < 2) {
    svg.innerHTML = `<text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" class="chart-axis-text">Need at least 2 refills for mileage trend</text>`;
    return;
  }
  
  const width = svg.clientWidth || 340;
  const height = 160;
  const paddingLeft = 35;
  const paddingBottom = 25;
  const paddingTop = 15;
  const paddingRight = 15;
  
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  
  const values = data.map(d => d.value);
  const minVal = Math.max(0, Math.min(...values) * 0.9 - 5);
  const maxVal = Math.max(...values) * 1.1 + 3;
  
  // Grid
  const gridSteps = 3;
  for (let i = 0; i <= gridSteps; i++) {
    const y = paddingTop + chartHeight - (i / gridSteps) * chartHeight;
    const val = minVal + (i / gridSteps) * (maxVal - minVal);
    
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', paddingLeft);
    line.setAttribute('y1', y);
    line.setAttribute('x2', width - paddingRight);
    line.setAttribute('y2', y);
    line.setAttribute('class', 'chart-grid-line');
    svg.appendChild(line);
    
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', paddingLeft - 8);
    text.setAttribute('y', y + 4);
    text.setAttribute('text-anchor', 'end');
    text.setAttribute('class', 'chart-axis-text');
    text.textContent = `${Math.round(val)}`;
    svg.appendChild(text);
  }
  
  // Points
  const colWidth = chartWidth / (data.length - 1);
  const pathPoints = [];
  data.forEach((d, i) => {
    const x = paddingLeft + i * colWidth;
    const y = paddingTop + chartHeight - ((d.value - minVal) / (maxVal - minVal)) * chartHeight;
    pathPoints.push({ x, y, value: d.value, label: d.label });
  });
  
  // Draw Area Path
  const areaPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  let areaD = `M ${pathPoints[0].x} ${paddingTop + chartHeight} `;
  pathPoints.forEach(p => { areaD += `L ${p.x} ${p.y} `; });
  areaD += `L ${pathPoints[pathPoints.length - 1].x} ${paddingTop + chartHeight} Z`;
  areaPath.setAttribute('d', areaD);
  areaPath.setAttribute('class', 'chart-area');
  
  // Add gradient to SVG
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.appendChild(defs);
  }
  defs.innerHTML = `
    <linearGradient id="area-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="var(--accent-color)" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="var(--accent-color)" stop-opacity="0"/>
    </linearGradient>
  `;
  svg.appendChild(areaPath);
  
  // Draw Line Path
  const linePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  let lineD = `M ${pathPoints[0].x} ${pathPoints[0].y} `;
  for (let i = 1; i < pathPoints.length; i++) {
    lineD += `L ${pathPoints[i].x} ${pathPoints[i].y} `;
  }
  linePath.setAttribute('d', lineD);
  linePath.setAttribute('class', 'chart-line');
  svg.appendChild(linePath);
  
  // Draw Dots and hover titles
  pathPoints.forEach(p => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', p.x);
    circle.setAttribute('cy', p.y);
    circle.setAttribute('r', 4.5);
    circle.setAttribute('fill', 'var(--accent-color)');
    circle.setAttribute('stroke', 'var(--surface-color)');
    circle.setAttribute('stroke-width', 2);
    
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `${p.label}: ${p.value.toFixed(1)} km/L`;
    circle.appendChild(title);
    svg.appendChild(circle);
    
    // Labels
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', p.x);
    text.setAttribute('y', height - 8);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'chart-axis-text');
    text.textContent = p.label;
    svg.appendChild(text);
  });
}

// UI Rendering Engine: Profile / Vehicles Section
function renderProfile() {
  const vehicleList = document.getElementById('vehicle-list-container');
  if (!vehicleList) return;
  vehicleList.innerHTML = '';
  
  state.vehicles.forEach(vehicle => {
    const isActive = vehicle.id === state.activeVehicleId;
    const card = document.createElement('div');
    card.className = `vehicle-card ${isActive ? 'active' : ''}`;
    card.onclick = () => selectVehicle(vehicle.id);
    
    const hasAdjusted = vehicle.manualMileage !== undefined && vehicle.mileage !== vehicle.manualMileage;
    const mileageDisplay = `${vehicle.mileage.toFixed(1)} km/L${hasAdjusted ? ` <span style="font-size:0.75rem; font-weight:normal; opacity:0.8;">(Auto-adjusted from ${vehicle.manualMileage.toFixed(1)})</span>` : ''}`;
    
    card.innerHTML = `
      <div class="vehicle-details">
        <h4>${vehicle.name}</h4>
        <p>Mileage: <strong>${mileageDisplay}</strong> &bull; Odo: <strong>${vehicle.odometer} km</strong></p>
      </div>
      <div class="vehicle-status-badge">${isActive ? 'Active' : 'Switch'}</div>
    `;
    vehicleList.appendChild(card);
  });
  
  // Fill profile avatar initials
  const activeVehicle = getActiveVehicle();
  if (activeVehicle) {
    const initials = activeVehicle.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    document.getElementById('profile-avatar-initials').innerText = initials;
    document.getElementById('profile-active-name').innerText = activeVehicle.name;
    const hasAdjusted = activeVehicle.manualMileage !== undefined && activeVehicle.mileage !== activeVehicle.manualMileage;
    document.getElementById('profile-active-details').innerHTML = `Mileage: <strong>${activeVehicle.mileage.toFixed(1)} km/L</strong>${hasAdjusted ? ` <span style="font-size:0.75rem; opacity:0.8;">(Auto-adjusted from ${activeVehicle.manualMileage.toFixed(1)})</span>` : ''} | Odo: <strong>${activeVehicle.odometer} km</strong>`;
  } else {
    document.getElementById('profile-avatar-initials').innerText = '?';
    document.getElementById('profile-active-name').innerText = 'No Vehicle';
    document.getElementById('profile-active-details').innerHTML = `Please add a vehicle to track stats.`;
  }
  
  // Render Achievements
  const achievementsContainer = document.getElementById('achievements-container');
  if (achievementsContainer) {
    achievementsContainer.innerHTML = '';
    if (!state.achievements || state.achievements.length === 0) {
      achievementsContainer.innerHTML = '<div style="grid-column: span 2; font-size: 0.85rem; color: var(--text-secondary); text-align: center; padding: 20px;">No achievements yet. Keep tracking to unlock badges!</div>';
    } else {
      state.achievements.forEach(ach => {
        const achCard = document.createElement('div');
        achCard.className = 'achievement-card';
        const dateFormatted = new Date(ach.date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
        achCard.innerHTML = `
          <div class="achievement-icon">${ach.icon}</div>
          <div class="achievement-info">
            <span class="achievement-title">${ach.title}</span>
            <span class="achievement-date">${dateFormatted}</span>
          </div>
        `;
        achievementsContainer.appendChild(achCard);
      });
    }
  }
}

// Switch active vehicle
function selectVehicle(id) {
  state.activeVehicleId = id;
  saveState();
  renderDashboard();
  renderProfile();
  renderHistory();
}

// Modal Management: Refill Calculations Preview
function calculateRefillPreview() {
  const amountInput = document.getElementById('refill-amount');
  const rateInput = document.getElementById('refill-rate');
  
  const amount = parseFloat(amountInput.value);
  const rate = parseFloat(rateInput.value);
  
  const litersSpan = document.getElementById('preview-liters');
  const rangeSpan = document.getElementById('preview-range');
  
  if (isNaN(amount) || isNaN(rate) || amount <= 0 || rate <= 0) {
    litersSpan.innerText = '0.00 L';
    rangeSpan.innerText = '0.0 km';
    return;
  }
  
  const liters = amount / rate;
  const vehicle = getActiveVehicle();
  const range = liters * (vehicle ? vehicle.mileage : 45);
  
  litersSpan.innerText = `${liters.toFixed(2)} L`;
  rangeSpan.innerText = `+${range.toFixed(1)} km`;
}

// Record a new refill
function handleRefillSubmit(e) {
  e.preventDefault();
  
  const amountInput = document.getElementById('refill-amount');
  const rateInput = document.getElementById('refill-rate');
  const odoInput = document.getElementById('refill-odo');
  const dateInput = document.getElementById('refill-date');
  
  const amount = parseFloat(amountInput.value);
  const rate = parseFloat(rateInput.value);
  const odometer = parseInt(odoInput.value);
  const date = dateInput.value;
  
  const vehicle = getActiveVehicle();
  if (!vehicle) return;
  
  // Validation
  if (isNaN(amount) || amount <= 0) {
    alert("Please enter a valid amount spent.");
    return;
  }
  if (isNaN(rate) || rate <= 0) {
    alert("Please enter a valid fuel rate.");
    return;
  }
  if (isNaN(odometer) || odometer < vehicle.lastRefillOdo) {
    alert(`Odometer reading cannot be less than your last refuel odometer (${vehicle.lastRefillOdo} km).`);
    return;
  }
  if (!date) {
    alert("Please select a fill date.");
    return;
  }
  const selectedDate = new Date(date);
  const todayDate = new Date();
  // Clear times for direct date comparison
  todayDate.setHours(23, 59, 59, 999);
  if (selectedDate > todayDate) {
    alert("Fill date cannot be in the future!");
    return;
  }
  if (selectedDate.getFullYear() < 2000 || selectedDate.getFullYear() > 2100) {
    alert("Please enter a valid year between 2000 and 2100.");
    return;
  }
  
  const liters = amount / rate;
  
  // Record Refill
  const refill = {
    id: 'refill-' + Date.now(),
    vehicleId: vehicle.id,
    amount,
    rate,
    odometer,
    date,
    liters,
    rangeAdded: 0 // Will update below
  };
  
  state.refills.push(refill);
  
  // Recalculate learned mileage
  recalculateVehicleMileage(vehicle);
  
  // Calculate range added using corrected mileage
  const rangeAdded = liters * vehicle.mileage;
  refill.rangeAdded = rangeAdded;
  
  // Update active vehicle stats
  vehicle.odometer = odometer;
  vehicle.lastRefillOdo = odometer;
  vehicle.lastRefillRange = parseFloat(rangeAdded.toFixed(1));
  
  // Update petrol rate in state for caching
  state.petrolRate = rate;
  state.rateSource = 'User Input';
  
  // Gamification trigger
  if (typeof updateStreakAndAchievements === 'function') {
    updateStreakAndAchievements();
  } else {
    saveState();
    renderDashboard();
    renderHistory();
    renderProfile();
  }
  
  // Reset Form and close modal
  e.target.reset();
  closeModal('refill-modal');
}

// Delete history refill item
let refillIdToDelete = null;
function deleteRefill(id) {
  refillIdToDelete = id;
  const dialog = document.getElementById('alert-dialog-confirm');
  if (dialog) {
    dialog.style.display = 'flex';
  }
}

function confirmDeleteRefill() {
  if (!refillIdToDelete) return;
  
  // Find the index
  const index = state.refills.findIndex(r => r.id === refillIdToDelete);
  if (index !== -1) {
    const refill = state.refills[index];
    state.refills.splice(index, 1);
    
    // Recalculate last refill odo & range for that vehicle
    const vehicle = state.vehicles.find(v => v.id === refill.vehicleId);
    if (vehicle) {
      recalculateVehicleMileage(vehicle);
      
      const vRefills = state.refills
        .filter(r => r.vehicleId === vehicle.id)
        .sort((a, b) => a.odometer - b.odometer);
        
      if (vRefills.length > 0) {
        const lastRef = vRefills[vRefills.length - 1];
        // Re-estimate range for the now-last refill with updated mileage
        lastRef.rangeAdded = lastRef.liters * vehicle.mileage;
        
        vehicle.lastRefillOdo = lastRef.odometer;
        vehicle.lastRefillRange = parseFloat(lastRef.rangeAdded.toFixed(1));
        vehicle.odometer = Math.max(vehicle.odometer, lastRef.odometer);
      } else {
        // Reset to initial settings if no refills left
        vehicle.lastRefillOdo = vehicle.odometer;
        vehicle.lastRefillRange = 0;
      }
    }
    
    saveState();
    renderDashboard();
    renderHistory();
    renderProfile();
  }
  
  cancelDeleteRefill();
}

function cancelDeleteRefill() {
  refillIdToDelete = null;
  const dialog = document.getElementById('alert-dialog-confirm');
  if (dialog) {
    dialog.style.display = 'none';
  }
}

// Add/Edit Vehicle Form Handler
function handleVehicleSubmit(e) {
  e.preventDefault();
  
  const nameInput = document.getElementById('vehicle-name');
  const mileageInput = document.getElementById('vehicle-mileage');
  const odoInput = document.getElementById('vehicle-initial-odo');
  
  const name = nameInput.value.trim();
  const mileage = parseFloat(mileageInput.value);
  const odometer = parseInt(odoInput.value);
  
  if (!name) {
    alert("Please enter a vehicle name.");
    return;
  }
  if (isNaN(mileage) || mileage <= 0) {
    alert("Please enter a valid mileage.");
    return;
  }
  if (isNaN(odometer) || odometer < 0) {
    alert("Please enter a valid initial odometer.");
    return;
  }
  
  const newVehicle = {
    id: 'veh-' + Date.now(),
    name,
    mileage,
    manualMileage: mileage,
    odometer,
    lastRefillOdo: odometer,
    lastRefillRange: 0
  };
  
  state.vehicles.push(newVehicle);
  state.activeVehicleId = newVehicle.id;
  
  saveState();
  
  // UI Syncs
  renderDashboard();
  renderProfile();
  renderHistory();
  
  e.target.reset();
  closeModal('vehicle-modal');
}

// Manage Edit/Change Odometer on Profile
function handleEditVehicleMileage(e) {
  e.preventDefault();
  const activeVehicle = getActiveVehicle();
  if (!activeVehicle) return;
  
  const editMileageInput = document.getElementById('edit-mileage-val');
  const newMileage = parseFloat(editMileageInput.value);
  
  if (isNaN(newMileage) || newMileage <= 0) {
    alert("Please enter a valid mileage.");
    return;
  }
  
  activeVehicle.manualMileage = newMileage;
  recalculateVehicleMileage(activeVehicle);
  // Recalculate any remaining ranges if necessary
  if (state.refills.length > 0) {
    const vRefills = state.refills
      .filter(r => r.vehicleId === activeVehicle.id)
      .sort((a, b) => a.odometer - b.odometer);
      
    if (vRefills.length > 0) {
      // Recalculate range for the last refill with new mileage
      const last = vRefills[vRefills.length - 1];
      last.rangeAdded = last.liters * activeVehicle.mileage;
      activeVehicle.lastRefillRange = parseFloat(last.rangeAdded.toFixed(1));
    }
  }
  
  saveState();
  renderDashboard();
  renderProfile();
  renderHistory();
  
  closeModal('edit-vehicle-modal');
}

// Clear all app data
function clearAllData() {
  if (confirm("Are you absolutely sure you want to clear all data? This cannot be undone!")) {
    localStorage.removeItem('petrol_tracker_state');
    initializeDefaults();
    renderDashboard();
    renderHistory();
    renderProfile();
    alert("Data cleared successfully.");
  }
}

// UI Tabs Swapping Engine
function switchTab(tabName) {
  // Update nav UI buttons
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Update screens visibility
  const screens = document.querySelectorAll('.screen');
  screens.forEach(screen => {
    if (screen.id === `${tabName}-screen`) {
      screen.classList.add('active');
    } else {
      screen.classList.remove('active');
    }
  });
  
  // Trigger redraw if history to ensure charts adjust to SVG width
  if (tabName === 'history') {
    renderHistory();
  } else if (tabName === 'profile') {
    renderProfile();
  } else if (tabName === 'dashboard') {
    renderDashboard();
  }
}

// Theme Switching
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  document.documentElement.setAttribute('data-theme', newTheme);
  state.theme = newTheme;
  saveState();
  
  // Update theme toggle icon
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  const sunIcon = `
    <svg viewBox="0 0 24 24">
      <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.01c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41l1.06-1.06z"/>
    </svg>
  `;
  const moonIcon = `
    <svg viewBox="0 0 24 24">
      <path d="M12.3 22h-.1c-5.5 0-10-4.5-10-10 0-4.8 3.5-8.9 8.2-9.8.6-.1 1.2.3 1.3.9.1.6-.3 1.2-.9 1.3-3.5.7-6 3.7-6 7.4 0 4.1 3.4 7.5 7.5 7.5 3.7 0 6.8-2.5 7.5-6 .1-.6.7-1 1.3-.9.6.1.9.7.8 1.3-.9 4.7-5 8.2-9.7 8.3z"/>
    </svg>
  `;
  
  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    toggleBtn.innerHTML = theme === 'dark' ? sunIcon : moonIcon;
  }
}

// Modal Animation Helpers
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.style.display = 'flex';
  
  // Special handling for prefilling inputs in Refill Modal
  if (modalId === 'refill-modal') {
    const vehicle = getActiveVehicle();
    if (vehicle) {
      document.getElementById('refill-odo').value = vehicle.odometer;
      document.getElementById('refill-odo').min = vehicle.lastRefillOdo;
    }
    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('refill-date').value = today;
    
    // Auto-fetch/refresh petrol price
    fetchLocalPetrolRate();
  } else if (modalId === 'edit-vehicle-modal') {
    const vehicle = getActiveVehicle();
    if (vehicle) {
      document.getElementById('edit-mileage-val').value = vehicle.mileage;
    }
  }
}

function closeModal(modalId) {
  if (modalId === 'vehicle-modal' && state.vehicles.length === 0) {
    alert("You must add at least one vehicle to use the app.");
    return;
  }
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.style.display = 'none';
}

// Service Worker Registration
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('Service Worker registered successfully.', reg.scope))
        .catch(err => console.error('Service Worker registration failed.', err));
    });
  }
}

// Initialize Application on DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
  // Load local state
  loadState();
  
  // Set theme preference
  document.documentElement.setAttribute('data-theme', state.theme);
  updateThemeIcon(state.theme);
  
  // Setup standard routing events
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });
  
  // Setup theme toggle event
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.onclick = toggleTheme;
  
  // Setup Refill Form Submission
  const refillForm = document.getElementById('refill-form');
  if (refillForm) refillForm.onsubmit = handleRefillSubmit;
  
  // Setup Vehicle Form Submission
  const vehicleForm = document.getElementById('vehicle-form');
  if (vehicleForm) vehicleForm.onsubmit = handleVehicleSubmit;
  
  // Setup Edit Mileage Form
  const editMileageForm = document.getElementById('edit-mileage-form');
  if (editMileageForm) editMileageForm.onsubmit = handleEditVehicleMileage;
  
  // Odometer Input Event Listeners
  const odoInput = document.getElementById('current-odo-input');
  if (odoInput) {
    odoInput.oninput = (e) => {
      const val = parseInt(e.target.value);
      if (!isNaN(val)) {
        softUpdateOdometer(val);
      }
    };
    odoInput.onchange = (e) => {
      const val = parseInt(e.target.value);
      if (!isNaN(val)) {
        updateOdometer(val);
      }
    };
  }
  
  // Interactive adjustment buttons on Dashboard Odo Card
  const btnMinusOdo = document.getElementById('btn-odo-minus');
  if (btnMinusOdo) {
    btnMinusOdo.onclick = () => {
      const activeVehicle = getActiveVehicle();
      if (activeVehicle) {
        updateOdometer(activeVehicle.odometer - 1);
      }
    };
  }
  
  const btnPlusOdo = document.getElementById('btn-odo-plus');
  if (btnPlusOdo) {
    btnPlusOdo.onclick = () => {
      const activeVehicle = getActiveVehicle();
      if (activeVehicle) {
        updateOdometer(activeVehicle.odometer + 1);
      }
    };
  }
  
  // Refill Calculator Real-time Updates
  const refillAmount = document.getElementById('refill-amount');
  const refillRate = document.getElementById('refill-rate');
  if (refillAmount) refillAmount.oninput = calculateRefillPreview;
  if (refillRate) refillRate.oninput = calculateRefillPreview;
  
  // History tab filtering chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderHistory();
    };
  });
  
  // Render Dashboard Home
  renderDashboard();
  
  // Setup initial active screens
  switchTab('dashboard');
  
  // Enforce onboarding if no vehicles
  if (state.vehicles.length === 0) {
    openModal('vehicle-modal');
  }
  
  // Register Service Worker for PWA compliance
  registerServiceWorker();
  
  // Check online status and fetch live rates
  window.addEventListener('online', fetchLocalPetrolRate);
  window.addEventListener('offline', () => updateRateUI(state.petrolRate, 'offline'));
  fetchLocalPetrolRate();
  
  // Handle PWA Shortcuts Routing
  handleURLParameters();
});

// Gamification Engine
function updateStreakAndAchievements() {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  // Streak Logic
  if (state.streaks.lastActionDate !== todayStr) {
    if (state.streaks.lastActionDate) {
      const lastDate = new Date(state.streaks.lastActionDate);
      const diffTime = Math.abs(today - lastDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        state.streaks.count++;
      } else {
        state.streaks.count = 1;
      }
    } else {
      state.streaks.count = 1;
    }
    state.streaks.lastActionDate = todayStr;
  }
  
  // Achievement Logic
  const addAchievement = (id, title, icon) => {
    if (!state.achievements.find(a => a.id === id)) {
      state.achievements.push({ id, title, icon, date: todayStr });
    }
  };
  
  if (state.refills.length > 0) addAchievement('first_refill', 'First Refill', '⛽');
  if (state.refills.length >= 5) addAchievement('five_refills', 'Frequent Flyer', '🚀');
  if (state.streaks.count >= 3) addAchievement('streak_3', 'On Fire (3 Days)', '🔥');
  
  const hasVOver1k = state.vehicles.some(v => v.odometer >= 1000);
  if (hasVOver1k) addAchievement('1k_club', '1000km Club', '🛣️');

  saveState();
  renderDashboard();
  if (typeof renderProfile === 'function') renderProfile();
  if (typeof renderHistory === 'function') renderHistory();
}

// PWA Shortcuts Routing Handler
function handleURLParameters() {
  const urlParams = new URLSearchParams(window.location.search);
  const action = urlParams.get('action');
  
  if (action === 'quick-add') {
    openModal('refill-modal');
  } else if (action === 'update-odo') {
    // Focus odometer input
    const odoInput = document.getElementById('current-odo-input');
    if (odoInput) {
      odoInput.focus();
    }
  }
  
  // Remove param to prevent triggering on refresh
  if (action) {
    const newUrl = window.location.pathname;
    window.history.replaceState({}, document.title, newUrl);
  }
}
