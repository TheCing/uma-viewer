// ============================================
// DATA & STATE
// ============================================

let data = [];
let filteredData = [];
let selectedIndex = 0;
let byTrainedId = {};

// Sort state - load from localStorage
let sortField = localStorage.getItem('uma_sortField') || 'rank_score';
let sortAsc = localStorage.getItem('uma_sortAsc') === 'true';

// View mode: 'ace' or 'parent'
let viewMode = localStorage.getItem('uma_viewMode') || 'ace';

// Optimization state
let optimizationResults = null;
let transferThreshold = parseInt(localStorage.getItem('uma_transfer_threshold')) || 15;
let protectionRules = JSON.parse(localStorage.getItem('uma_protection_rules')) || [];
let protectionLogic = localStorage.getItem('uma_protection_logic') || 'or'; // 'or' or 'and'
let showOnlyProtected = false;

// Editable scoring values (points per star or flat points)
const DEFAULT_SCORE_VALUES = {
  stat: 2,        // Blue (stats): pts per ★
  aptitude: 4,    // Pink (aptitudes): pts per ★
  unique: 1,      // Green (unique): pts per ★
  scenario: 7,    // Scenario sparks: flat pts
  highValue: 5,   // High-value skills: flat pts
  standard: 1     // Standard skills: flat pts
};
let scoreValues = JSON.parse(localStorage.getItem('uma_score_values')) || { ...DEFAULT_SCORE_VALUES };

// Editable high-value skills list
const DEFAULT_HIGH_VALUE_SKILLS = [
  'Groundwork', "Playtime's Over!", 'Tail Held High', 'Early Lead', 'Fast-Paced',
  'Uma Stan', 'Straightaway Spurt', 'Slipstream', 'Head-On', 'Nimble Navigator', 'Ramp Up'
];
let highValueSkills = JSON.parse(localStorage.getItem('uma_high_value_skills')) || [...DEFAULT_HIGH_VALUE_SKILLS];

// Editable scenario sparks list
const DEFAULT_SCENARIO_SPARKS = ['URA Finale', 'Unity Cup'];
let scenarioSparks = JSON.parse(localStorage.getItem('uma_scenario_sparks')) || [...DEFAULT_SCENARIO_SPARKS];

function saveOptimizationSettings() {
  localStorage.setItem('uma_score_values', JSON.stringify(scoreValues));
  localStorage.setItem('uma_high_value_skills', JSON.stringify(highValueSkills));
  localStorage.setItem('uma_scenario_sparks', JSON.stringify(scenarioSparks));
  localStorage.setItem('uma_protection_logic', protectionLogic);
}

// All known spark names for the filter dropdown
const SPARK_NAMES_FOR_FILTER = [
  // High-value skills
  'Groundwork', "Playtime's Over!", 'Tail Held High', 'Early Lead', 'Fast-Paced',
  'Uma Stan', 'Straightaway Spurt', 'Slipstream', 'Head-On', 'Nimble Navigator', 'Ramp Up',
  // Scenario
  'URA Finale', 'Unity Cup',
  // Stats
  'Speed', 'Stamina', 'Power', 'Guts', 'Wit',
  // Ground
  'Turf', 'Dirt',
  // Distance
  'Sprint', 'Mile', 'Medium', 'Long',
  // Style
  'Front Runner', 'Pace Chaser', 'Late Surger', 'End Closer'
];

// Filter state - load from localStorage or use defaults
const defaultFilters = {
  // Aptitude filters (require A rank or better)
  track: { turf: true, dirt: true },
  distance: { sprint: true, mile: true, medium: true, long: true },
  style: { front: true, pace: true, late: true, end: true },
  
  // Spark filters
  attributeSparks: {
    speed: true, stamina: true, power: true, guts: true, wit: true,
    starFilter: 'all', // 'all', '2+', '3'
    includeParents: false
  },
  aptitudeSparks: {
    turf: true, dirt: true, sprint: true, mile: true, medium: true, long: true,
    front: true, pace: true, late: true, end: true,
    starFilter: 'all',
    includeParents: false
  },
  uniqueSparks: {
    enabled: true,
    starFilter: 'all',
    includeParents: false
  }
};

let filters = JSON.parse(localStorage.getItem('uma_filters')) || JSON.parse(JSON.stringify(defaultFilters));

// ============================================
// PERSISTENCE
// ============================================

function saveSortPrefs() {
  localStorage.setItem('uma_sortField', sortField);
  localStorage.setItem('uma_sortAsc', sortAsc);
}

function saveViewMode() {
  localStorage.setItem('uma_viewMode', viewMode);
}

function saveFilters() {
  localStorage.setItem('uma_filters', JSON.stringify(filters));
}

// ============================================
// DATA LOADING
// ============================================

async function loadData() {
  try {
    const response = await fetch('enriched_data.json');
    if (!response.ok) throw new Error('Failed to load');
    data = await response.json();
    
    // Build lookup map
    byTrainedId = {};
    data.forEach((c, i) => {
      if (c.trained_chara_id) {
        byTrainedId[c.trained_chara_id] = { char: c, index: i };
      }
    });
    
    render();
  } catch (err) {
    document.getElementById('app').innerHTML = `
      <div class="loading">
        <span style="color: var(--red);">error: failed to load enriched_data.json</span>
      </div>
    `;
  }
}

// ============================================
// VIEW MODE
// ============================================

function toggleViewMode() {
  viewMode = viewMode === 'ace' ? 'parent' : 'ace';
  saveViewMode();
  updateModeToggle();
  // Re-render list to show spark preview in parent mode
  filterAndSortList();
  if (selectedIndex >= 0 && data[selectedIndex]) {
    renderDetail(data[selectedIndex]);
  }
}

function updateModeToggle() {
  const toggle = document.getElementById('mode-switch');
  const aceLabel = document.getElementById('mode-ace');
  const parentLabel = document.getElementById('mode-parent');
  if (toggle) {
    toggle.classList.toggle('parent', viewMode === 'parent');
    aceLabel?.classList.toggle('active', viewMode === 'ace');
    parentLabel?.classList.toggle('active', viewMode === 'parent');
  }
}

// ============================================
// FILTERING LOGIC
// ============================================

function getAptitudeGrade(value) {
  if (value >= 8) return 'S';
  if (value === 7) return 'A';
  if (value === 6) return 'B';
  if (value === 5) return 'C';
  if (value === 4) return 'D';
  if (value === 3) return 'E';
  if (value === 2) return 'F';
  return 'G';
}

function isAptitudeGood(value) {
  // A rank (7) or better
  return value >= 7;
}

function passesFilters(char) {
  // Track filter - must have at least one checked track with A+ aptitude
  const trackChecks = [];
  if (filters.track.turf) trackChecks.push(isAptitudeGood(char.proper_ground_turf));
  if (filters.track.dirt) trackChecks.push(isAptitudeGood(char.proper_ground_dirt));
  if (trackChecks.length > 0 && !trackChecks.some(v => v)) return false;
  
  // Distance filter
  const distChecks = [];
  if (filters.distance.sprint) distChecks.push(isAptitudeGood(char.proper_distance_short));
  if (filters.distance.mile) distChecks.push(isAptitudeGood(char.proper_distance_mile));
  if (filters.distance.medium) distChecks.push(isAptitudeGood(char.proper_distance_middle));
  if (filters.distance.long) distChecks.push(isAptitudeGood(char.proper_distance_long));
  if (distChecks.length > 0 && !distChecks.some(v => v)) return false;
  
  // Style filter
  const styleChecks = [];
  if (filters.style.front) styleChecks.push(isAptitudeGood(char.proper_running_style_nige));
  if (filters.style.pace) styleChecks.push(isAptitudeGood(char.proper_running_style_senko));
  if (filters.style.late) styleChecks.push(isAptitudeGood(char.proper_running_style_sashi));
  if (filters.style.end) styleChecks.push(isAptitudeGood(char.proper_running_style_oikomi));
  if (styleChecks.length > 0 && !styleChecks.some(v => v)) return false;
  
  // Spark filters
  if (!passesSparkFilters(char)) return false;
  
  return true;
}

function passesSparkFilters(char) {
  const sparks = char.spark_array_enriched || [];
  let allSparks = [...sparks];
  
  // Get parent sparks if include parents is enabled for any filter
  const parentSparks = [];
  if (filters.attributeSparks.includeParents || 
      filters.aptitudeSparks.includeParents || 
      filters.uniqueSparks.includeParents) {
    const succession = char.succession_chara_array || [];
    succession.forEach(parent => {
      if (parent.factor_info_array) {
        parentSparks.push(...parent.factor_info_array);
      }
    });
  }
  
  // Attribute sparks filter (Speed, Stamina, Power, Guts, Wit)
  const attrFilter = filters.attributeSparks;
  const attrIds = { speed: [100, 199], stamina: [200, 299], power: [300, 399], guts: [400, 499], wit: [500, 599] };
  const checkedAttrs = Object.entries(attrFilter)
    .filter(([k, v]) => v === true && attrIds[k])
    .map(([k]) => attrIds[k]);
  
  if (checkedAttrs.length > 0) {
    const searchSparks = attrFilter.includeParents ? [...sparks, ...parentSparks] : sparks;
    const hasAttrSpark = searchSparks.some(s => {
      const id = parseInt(s.spark_id || s.factor_id) || 0;
      const matchesAttr = checkedAttrs.some(([min, max]) => id >= min && id <= max);
      if (!matchesAttr) return false;
      return passesStarFilter(s.stars, attrFilter.starFilter);
    });
    if (!hasAttrSpark) return false;
  }
  
  // Aptitude sparks filter (Ground + Distance + Style sparks)
  const aptFilter = filters.aptitudeSparks;
  const aptIds = {
    turf: [1100, 1199], dirt: [1200, 1299],
    sprint: [3100, 3199], mile: [3200, 3299], medium: [3300, 3399], long: [3400, 3499],
    front: [2100, 2199], pace: [2200, 2299], late: [2300, 2399], end: [2400, 2499]
  };
  const checkedApts = Object.entries(aptFilter)
    .filter(([k, v]) => v === true && aptIds[k])
    .map(([k]) => aptIds[k]);
  
  if (checkedApts.length > 0) {
    const searchSparks = aptFilter.includeParents ? [...sparks, ...parentSparks] : sparks;
    const hasAptSpark = searchSparks.some(s => {
      const id = parseInt(s.spark_id || s.factor_id) || 0;
      const matchesApt = checkedApts.some(([min, max]) => id >= min && id <= max);
      if (!matchesApt) return false;
      return passesStarFilter(s.stars, aptFilter.starFilter);
    });
    if (!hasAptSpark) return false;
  }
  
  // Unique sparks filter
  const uniqueFilter = filters.uniqueSparks;
  if (uniqueFilter.enabled) {
    const searchSparks = uniqueFilter.includeParents ? [...sparks, ...parentSparks] : sparks;
    const hasUniqueSpark = searchSparks.some(s => {
      const id = parseInt(s.spark_id || s.factor_id) || 0;
      if (id < 10000000 || id >= 20000000) return false;
      return passesStarFilter(s.stars, uniqueFilter.starFilter);
    });
    if (!hasUniqueSpark) return false;
  }
  
  return true;
}

function passesStarFilter(stars, filter) {
  if (filter === 'all') return true;
  if (filter === '2+') return (stars || 0) >= 2;
  if (filter === '3') return (stars || 0) >= 3;
  return true;
}

function countActiveFilters() {
  let count = 0;
  
  // Track
  if (!filters.track.turf || !filters.track.dirt) count++;
  
  // Distance
  if (!filters.distance.sprint || !filters.distance.mile || 
      !filters.distance.medium || !filters.distance.long) count++;
  
  // Style
  if (!filters.style.front || !filters.style.pace || 
      !filters.style.late || !filters.style.end) count++;
  
  // Attribute sparks
  const attr = filters.attributeSparks;
  if (!attr.speed || !attr.stamina || !attr.power || !attr.guts || !attr.wit ||
      attr.starFilter !== 'all' || attr.includeParents) count++;
  
  // Aptitude sparks
  const apt = filters.aptitudeSparks;
  if (!apt.turf || !apt.dirt || !apt.sprint || !apt.mile || !apt.medium || 
      !apt.long || !apt.front || !apt.pace || !apt.late || !apt.end ||
      apt.starFilter !== 'all' || apt.includeParents) count++;
  
  // Unique sparks
  if (!filters.uniqueSparks.enabled || filters.uniqueSparks.starFilter !== 'all' ||
      filters.uniqueSparks.includeParents) count++;
  
  return count;
}

// ============================================
// RENDER
// ============================================

function render() {
  const app = document.getElementById('app');
  app.className = 'app';
  
  const activeFilters = countActiveFilters();
  
  app.innerHTML = `
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo-row">
          <div class="logo">uma_viewer</div>
          <div class="mode-toggle">
            <span class="mode-toggle-label ${viewMode === 'ace' ? 'active' : ''}" id="mode-ace">Ace</span>
            <div class="mode-switch ${viewMode === 'parent' ? 'parent' : ''}" id="mode-switch" title="Toggle view mode"></div>
            <span class="mode-toggle-label ${viewMode === 'parent' ? 'active' : ''}" id="mode-parent">Parent</span>
          </div>
        </div>
        <div class="search-box">
          <input type="text" id="search" placeholder="search..." autocomplete="off">
        </div>
      </div>
      <div class="controls-row">
        <select id="sort-field">
          <option value="rank_score">Score</option>
          <option value="chara_name_en">Name</option>
          <option value="wins">Wins</option>
          <option value="create_time">Created</option>
          <option value="speed">Speed</option>
          <option value="stamina">Stamina</option>
          <option value="power">Power</option>
          <option value="guts">Guts</option>
          <option value="wiz">Wit</option>
        </select>
        <button class="control-btn ${sortAsc ? '' : 'desc'}" id="sort-dir" title="Toggle sort direction">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14M5 12l7-7 7 7"/>
          </svg>
        </button>
        <button class="control-btn ${activeFilters > 0 ? 'active' : ''}" id="filter-btn" title="Filter">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
          </svg>
          ${activeFilters > 0 ? `<span class="filter-active-badge">${activeFilters}</span>` : ''}
        </button>
      </div>
      <div class="list-count" id="count-display">// ${data.length} characters</div>
      <div class="character-list" id="list"></div>
    </aside>
    <main class="main" id="detail"></main>
    
    <!-- Filter Modal -->
    <div class="filter-overlay" id="filter-overlay">
      <div class="filter-modal">
        <div class="filter-header">
          <h2>Display Settings</h2>
          <button class="filter-close" id="filter-close">&times;</button>
        </div>
        <div class="filter-tabs">
          <button class="filter-tab active" data-tab="filter">Filter</button>
        </div>
        <div class="filter-content" id="filter-content">
          ${renderFilterContent()}
        </div>
        <div class="filter-footer">
          <button class="filter-reset" id="filter-reset">Reset Filters</button>
          <div class="filter-actions">
            <button class="filter-cancel" id="filter-cancel">Cancel</button>
            <button class="filter-apply" id="filter-apply">OK</button>
          </div>
        </div>
      </div>
    </div>
    
    ${renderOptimizeUI()}
  `;
  
  // Set initial values
  document.getElementById('sort-field').value = sortField;
  
  // Event listeners
  document.getElementById('search').addEventListener('input', filterAndSortList);
  
  document.getElementById('sort-field').addEventListener('change', (e) => {
    sortField = e.target.value;
    if (sortField === 'chara_name_en' || sortField === 'create_time') {
      sortAsc = true;
    } else {
      sortAsc = false;
    }
    saveSortPrefs();
    updateSortDirButton();
    filterAndSortList();
  });
  
  document.getElementById('sort-dir').addEventListener('click', () => {
    sortAsc = !sortAsc;
    saveSortPrefs();
    updateSortDirButton();
    filterAndSortList();
  });
  
  document.getElementById('mode-switch').addEventListener('click', toggleViewMode);
  
  // Filter modal events
  document.getElementById('filter-btn').addEventListener('click', openFilterModal);
  document.getElementById('filter-close').addEventListener('click', closeFilterModal);
  document.getElementById('filter-cancel').addEventListener('click', closeFilterModal);
  document.getElementById('filter-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeFilterModal();
  });
  document.getElementById('filter-apply').addEventListener('click', applyFilters);
  document.getElementById('filter-reset').addEventListener('click', resetFilters);
  
  // Optimization listeners
  attachOptimizeListeners();
  
  filterAndSortList();
  if (data.length > 0) {
    renderDetail(data[0]);
  }
}

function renderFilterContent() {
  return `
    <!-- Track -->
    <div class="filter-section">
      <div class="filter-section-title">Track</div>
      <div class="filter-checkboxes">
        <label class="filter-checkbox ${filters.track.turf ? 'checked' : ''}" data-filter="track.turf">
          <span class="checkmark"></span>
          <span>Turf</span>
        </label>
        <label class="filter-checkbox ${filters.track.dirt ? 'checked' : ''}" data-filter="track.dirt">
          <span class="checkmark"></span>
          <span>Dirt</span>
        </label>
      </div>
    </div>
    
    <!-- Distance -->
    <div class="filter-section">
      <div class="filter-section-title">Distance</div>
      <div class="filter-checkboxes">
        <label class="filter-checkbox ${filters.distance.sprint ? 'checked' : ''}" data-filter="distance.sprint">
          <span class="checkmark"></span>
          <span>Sprint</span>
        </label>
        <label class="filter-checkbox ${filters.distance.mile ? 'checked' : ''}" data-filter="distance.mile">
          <span class="checkmark"></span>
          <span>Mile</span>
        </label>
        <label class="filter-checkbox ${filters.distance.medium ? 'checked' : ''}" data-filter="distance.medium">
          <span class="checkmark"></span>
          <span>Medium</span>
        </label>
        <label class="filter-checkbox ${filters.distance.long ? 'checked' : ''}" data-filter="distance.long">
          <span class="checkmark"></span>
          <span>Long</span>
        </label>
      </div>
    </div>
    
    <!-- Style -->
    <div class="filter-section">
      <div class="filter-section-title">Style</div>
      <div class="filter-checkboxes">
        <label class="filter-checkbox ${filters.style.front ? 'checked' : ''}" data-filter="style.front">
          <span class="checkmark"></span>
          <span>Front Runner</span>
        </label>
        <label class="filter-checkbox ${filters.style.pace ? 'checked' : ''}" data-filter="style.pace">
          <span class="checkmark"></span>
          <span>Pace Chaser</span>
        </label>
        <label class="filter-checkbox ${filters.style.late ? 'checked' : ''}" data-filter="style.late">
          <span class="checkmark"></span>
          <span>Late Surger</span>
        </label>
        <label class="filter-checkbox ${filters.style.end ? 'checked' : ''}" data-filter="style.end">
          <span class="checkmark"></span>
          <span>End Closer</span>
        </label>
      </div>
    </div>
    
    <!-- Attribute Sparks -->
    <div class="filter-section">
      <div class="filter-section-title">Attribute Sparks</div>
      <div class="filter-checkboxes">
        <label class="filter-checkbox ${filters.attributeSparks.speed ? 'checked' : ''}" data-filter="attributeSparks.speed">
          <span class="checkmark"></span>
          <span>Speed</span>
        </label>
        <label class="filter-checkbox ${filters.attributeSparks.stamina ? 'checked' : ''}" data-filter="attributeSparks.stamina">
          <span class="checkmark"></span>
          <span>Stamina</span>
        </label>
        <label class="filter-checkbox ${filters.attributeSparks.power ? 'checked' : ''}" data-filter="attributeSparks.power">
          <span class="checkmark"></span>
          <span>Power</span>
        </label>
        <label class="filter-checkbox ${filters.attributeSparks.guts ? 'checked' : ''}" data-filter="attributeSparks.guts">
          <span class="checkmark"></span>
          <span>Guts</span>
        </label>
        <label class="filter-checkbox ${filters.attributeSparks.wit ? 'checked' : ''}" data-filter="attributeSparks.wit">
          <span class="checkmark"></span>
          <span>Wit</span>
        </label>
      </div>
      <div class="filter-stars">
        <label class="filter-star-option ${filters.attributeSparks.starFilter === 'all' ? 'active' : ''}" data-star-filter="attributeSparks" data-value="all">All</label>
        <label class="filter-star-option ${filters.attributeSparks.starFilter === '2+' ? 'active' : ''}" data-star-filter="attributeSparks" data-value="2+">★★+</label>
        <label class="filter-star-option ${filters.attributeSparks.starFilter === '3' ? 'active' : ''}" data-star-filter="attributeSparks" data-value="3">★★★</label>
      </div>
      <div class="filter-include-parents">
        <label class="filter-checkbox ${filters.attributeSparks.includeParents ? 'checked' : ''}" data-filter="attributeSparks.includeParents">
          <span class="checkmark"></span>
          <span>Include Sparks from Origin Legacies</span>
        </label>
      </div>
    </div>
    
    <!-- Aptitude Sparks -->
    <div class="filter-section">
      <div class="filter-section-title">Aptitude Sparks</div>
      <div class="filter-checkboxes">
        <label class="filter-checkbox ${filters.aptitudeSparks.turf ? 'checked' : ''}" data-filter="aptitudeSparks.turf">
          <span class="checkmark"></span>
          <span>Turf</span>
        </label>
        <label class="filter-checkbox ${filters.aptitudeSparks.dirt ? 'checked' : ''}" data-filter="aptitudeSparks.dirt">
          <span class="checkmark"></span>
          <span>Dirt</span>
        </label>
        <label class="filter-checkbox ${filters.aptitudeSparks.sprint ? 'checked' : ''}" data-filter="aptitudeSparks.sprint">
          <span class="checkmark"></span>
          <span>Sprint</span>
        </label>
        <label class="filter-checkbox ${filters.aptitudeSparks.mile ? 'checked' : ''}" data-filter="aptitudeSparks.mile">
          <span class="checkmark"></span>
          <span>Mile</span>
        </label>
        <label class="filter-checkbox ${filters.aptitudeSparks.medium ? 'checked' : ''}" data-filter="aptitudeSparks.medium">
          <span class="checkmark"></span>
          <span>Medium</span>
        </label>
        <label class="filter-checkbox ${filters.aptitudeSparks.long ? 'checked' : ''}" data-filter="aptitudeSparks.long">
          <span class="checkmark"></span>
          <span>Long</span>
        </label>
        <label class="filter-checkbox ${filters.aptitudeSparks.front ? 'checked' : ''}" data-filter="aptitudeSparks.front">
          <span class="checkmark"></span>
          <span>Front</span>
        </label>
        <label class="filter-checkbox ${filters.aptitudeSparks.pace ? 'checked' : ''}" data-filter="aptitudeSparks.pace">
          <span class="checkmark"></span>
          <span>Pace</span>
        </label>
        <label class="filter-checkbox ${filters.aptitudeSparks.late ? 'checked' : ''}" data-filter="aptitudeSparks.late">
          <span class="checkmark"></span>
          <span>Late</span>
        </label>
        <label class="filter-checkbox ${filters.aptitudeSparks.end ? 'checked' : ''}" data-filter="aptitudeSparks.end">
          <span class="checkmark"></span>
          <span>End</span>
        </label>
      </div>
      <div class="filter-stars">
        <label class="filter-star-option ${filters.aptitudeSparks.starFilter === 'all' ? 'active' : ''}" data-star-filter="aptitudeSparks" data-value="all">All</label>
        <label class="filter-star-option ${filters.aptitudeSparks.starFilter === '2+' ? 'active' : ''}" data-star-filter="aptitudeSparks" data-value="2+">★★+</label>
        <label class="filter-star-option ${filters.aptitudeSparks.starFilter === '3' ? 'active' : ''}" data-star-filter="aptitudeSparks" data-value="3">★★★</label>
      </div>
      <div class="filter-include-parents">
        <label class="filter-checkbox ${filters.aptitudeSparks.includeParents ? 'checked' : ''}" data-filter="aptitudeSparks.includeParents">
          <span class="checkmark"></span>
          <span>Include Sparks from Origin Legacies</span>
        </label>
      </div>
    </div>
    
    <!-- Unique Sparks -->
    <div class="filter-section">
      <div class="filter-section-title">Unique Sparks</div>
      <div class="filter-checkboxes">
        <label class="filter-checkbox ${filters.uniqueSparks.enabled ? 'checked' : ''}" data-filter="uniqueSparks.enabled">
          <span class="checkmark"></span>
          <span>Umamusume</span>
        </label>
      </div>
      <div class="filter-stars">
        <label class="filter-star-option ${filters.uniqueSparks.starFilter === 'all' ? 'active' : ''}" data-star-filter="uniqueSparks" data-value="all">All</label>
        <label class="filter-star-option ${filters.uniqueSparks.starFilter === '2+' ? 'active' : ''}" data-star-filter="uniqueSparks" data-value="2+">★★+</label>
        <label class="filter-star-option ${filters.uniqueSparks.starFilter === '3' ? 'active' : ''}" data-star-filter="uniqueSparks" data-value="3">★★★</label>
      </div>
      <div class="filter-include-parents">
        <label class="filter-checkbox ${filters.uniqueSparks.includeParents ? 'checked' : ''}" data-filter="uniqueSparks.includeParents">
          <span class="checkmark"></span>
          <span>Include Sparks from Origin Legacies</span>
        </label>
      </div>
    </div>
  `;
}

// Temp filters for modal editing
let tempFilters = null;

function openFilterModal() {
  tempFilters = JSON.parse(JSON.stringify(filters));
  document.getElementById('filter-content').innerHTML = renderFilterContent();
  document.getElementById('filter-overlay').classList.add('visible');
  attachFilterListeners();
}

function closeFilterModal() {
  document.getElementById('filter-overlay').classList.remove('visible');
  tempFilters = null;
}

function attachFilterListeners() {
  // Checkbox toggles
  document.querySelectorAll('.filter-checkbox[data-filter]').forEach(el => {
    el.addEventListener('click', () => {
      const path = el.dataset.filter.split('.');
      let obj = filters;
      for (let i = 0; i < path.length - 1; i++) {
        obj = obj[path[i]];
      }
      obj[path[path.length - 1]] = !obj[path[path.length - 1]];
      el.classList.toggle('checked');
    });
  });
  
  // Star filter options
  document.querySelectorAll('.filter-star-option').forEach(el => {
    el.addEventListener('click', () => {
      const group = el.dataset.starFilter;
      const value = el.dataset.value;
      filters[group].starFilter = value;
      
      // Update UI
      el.parentElement.querySelectorAll('.filter-star-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.value === value);
      });
    });
  });
}

function applyFilters() {
  saveFilters();
  closeFilterModal();
  filterAndSortList();
  render(); // Re-render to update filter badge
}

function resetFilters() {
  filters = JSON.parse(JSON.stringify(defaultFilters));
  document.getElementById('filter-content').innerHTML = renderFilterContent();
  attachFilterListeners();
}

function updateSortDirButton() {
  const btn = document.getElementById('sort-dir');
  if (btn) {
    btn.classList.toggle('desc', !sortAsc);
    btn.title = sortAsc ? 'Ascending' : 'Descending';
  }
}

function filterAndSortList() {
  const q = (document.getElementById('search')?.value || '').toLowerCase();
  
  // Apply search and filters
  filteredData = data.filter(c => {
    // Search filter
    const name = (c.chara_name_en || '').toLowerCase();
    const card = (c.card_name_en || '').toLowerCase();
    if (!name.includes(q) && !card.includes(q)) return false;
    
    // Apply filters (if any are active)
    return passesFilters(c);
  });
  
  // Sort
  filteredData.sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];
    
    if (aVal == null) aVal = sortField === 'chara_name_en' ? '' : 0;
    if (bVal == null) bVal = sortField === 'chara_name_en' ? '' : 0;
    
    if (sortField === 'chara_name_en' || sortField === 'create_time') {
      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    }
    
    return sortAsc ? aVal - bVal : bVal - aVal;
  });
  
  const countEl = document.getElementById('count-display');
  if (countEl) {
    countEl.textContent = `// ${filteredData.length} characters`;
  }
  
  renderList(filteredData);
}

// Get spark summary for parent mode list preview
function getSparkSummary(char) {
  const sparks = char.spark_array_enriched || [];
  
  // Also include parent sparks
  const parentSparks = [];
  const succession = char.succession_chara_array || [];
  succession.forEach(parent => {
    if (parent.factor_info_array) {
      parentSparks.push(...parent.factor_info_array);
    }
  });
  
  const allSparks = [...sparks, ...parentSparks];
  
  // Categories with their ID ranges, short labels, and color class
  const categories = {
    'Spd': { ranges: [[100, 199]], color: 'stat' },
    'Sta': { ranges: [[200, 299]], color: 'stat' },
    'Pow': { ranges: [[300, 399]], color: 'stat' },
    'Gut': { ranges: [[400, 499]], color: 'stat' },
    'Wit': { ranges: [[500, 599]], color: 'stat' },
    'Gnd': { ranges: [[1100, 1299]], color: 'aptitude' }, // Ground sparks (Turf/Dirt)
    'Dst': { ranges: [[3100, 3499]], color: 'aptitude' }, // Distance sparks
    'Sty': { ranges: [[2100, 2499]], color: 'aptitude' }, // Style sparks
    'Unq': { ranges: [[10000000, 19999999]], color: 'unique' } // Unique sparks
  };
  
  const totals = {};
  
  allSparks.forEach(s => {
    const id = parseInt(s.spark_id || s.factor_id) || 0;
    const stars = s.stars || 0;
    
    for (const [label, config] of Object.entries(categories)) {
      for (const [min, max] of config.ranges) {
        if (id >= min && id <= max) {
          totals[label] = (totals[label] || 0) + stars;
          break;
        }
      }
    }
  });
  
  // Build summary with colored spans
  const parts = [];
  // Order: Stats first, then aptitudes (ground/distance/style), then unique
  const order = ['Spd', 'Sta', 'Pow', 'Gut', 'Wit', 'Gnd', 'Dst', 'Sty', 'Unq'];
  for (const label of order) {
    if (totals[label]) {
      const colorClass = categories[label].color;
      parts.push(`<span class="spark-${colorClass}">${label} ${totals[label]}</span>`);
    }
  }
  
  return parts.length > 0 ? parts.join(' ') : '<span class="spark-none">No sparks</span>';
}

function renderList(chars) {
  const list = document.getElementById('list');
  if (!list) return;
  
  const isParentMode = viewMode === 'parent';
  
  list.innerHTML = chars.map((c, i) => {
    const metaContent = isParentMode 
      ? `<span class="spark-preview">${getSparkSummary(c)}</span>`
      : `<span class="list-score">${formatScore(c.rank_score)}</span> • ${c.wins || 0} wins`;
    
    return `
      <div class="character-item ${data.indexOf(c) === selectedIndex ? 'active' : ''}" data-index="${data.indexOf(c)}">
        <div class="name">${c.chara_name_en || 'Unknown'}</div>
        <div class="meta">${metaContent}</div>
      </div>
    `;
  }).join('');
  
  list.querySelectorAll('.character-item').forEach(el => {
    el.addEventListener('click', () => {
      selectedIndex = parseInt(el.dataset.index);
      document.querySelectorAll('.character-item').forEach(e => e.classList.remove('active'));
      el.classList.add('active');
      renderDetail(data[selectedIndex]);
    });
  });
}

// ============================================
// HELPERS
// ============================================

function getRunningStyle(value) {
  const styles = { 1: 'Front Runner', 2: 'Pace Chaser', 3: 'Late Surger', 4: 'End Closer' };
  return styles[value] || '?';
}

function formatScore(score) {
  return score ? score.toLocaleString() : '0';
}

function valueToGrade(value) {
  if (value >= 8) return 'S';
  if (value === 7) return 'A';
  if (value === 6) return 'B';
  if (value === 5) return 'C';
  if (value === 4) return 'D';
  if (value === 3) return 'E';
  if (value === 2) return 'F';
  return 'G';
}

function renderGrade(value) {
  const grade = valueToGrade(value);
  return `<span class="grade ${grade}">${grade}</span>`;
}

// Spark helpers
function getSparkTypeClass(sparkId) {
  const id = parseInt(sparkId) || 0;
  if (id >= 100 && id < 600) return 'spark-type-stat';
  if (id >= 2100 && id < 2500) return 'spark-type-distance';
  if (id >= 3100 && id < 3500) return 'spark-type-distance';
  if (id >= 10000000 && id < 20000000) return 'spark-type-unique';
  return '';
}

function getSparkSortPriority(sparkId) {
  const id = parseInt(sparkId) || 0;
  if (id >= 100 && id < 600) return 0;
  if (id >= 2100 && id < 2500) return 1;
  if (id >= 3100 && id < 3500) return 1;
  if (id >= 10000000 && id < 20000000) return 2;
  return 3;
}

function getStars(level) {
  const filled = Math.min(Math.max(level || 0, 0), 3);
  const empty = 3 - filled;
  return '★'.repeat(filled) + '☆'.repeat(empty);
}

function getStarClass(level) {
  if (level === 3) return 'spark-3star';
  if (level === 2) return 'spark-2star';
  return 'spark-1star';
}

// ============================================
// DETAIL RENDER
// ============================================

function renderDetail(char) {
  if (!char) {
    document.getElementById('detail').innerHTML = `<div class="empty-state">// select a character</div>`;
    return;
  }
  
  const style = getRunningStyle(char.running_style);
  const wins = char.wins || 0;
  const rankScore = char.rank_score || 0;
  const isParentMode = viewMode === 'parent';
  
  if (isParentMode) {
    document.getElementById('detail').innerHTML = `
      <div class="parent-mode">
        <div class="parent-header">
          <div class="parent-header-row">
            <h1>${char.chara_name_en || 'Unknown'}</h1>
            <button class="optimize-btn" id="optimize-btn">optimize account</button>
          </div>
          <div class="parent-meta">
            ${char.race_cloth_name_en ? `<span class="parent-outfit">${char.race_cloth_name_en}</span>` : ''}
            ${char.create_time ? `<span class="parent-date">${char.create_time}</span>` : ''}
          </div>
        </div>
        ${renderInheritanceSparks(char)}
      </div>
    `;
    
    // Re-attach optimize button listener
    document.getElementById('optimize-btn')?.addEventListener('click', runOptimization);
  } else {
    document.getElementById('detail').innerHTML = `
      <div class="detail-header">
        <h1>${char.chara_name_en || 'Unknown'}</h1>
        <div class="subtitle">${char.costume_name_en || ''} • card_id: ${char.card_id}${char.race_cloth_name_en ? ` • Racing: ${char.race_cloth_name_en}` : ''}${char.create_time ? ` • Created: ${char.create_time}` : ''}</div>
        <div class="header-badges">
          <span class="badge score">${formatScore(rankScore)} pts</span>
          <span class="badge style">${style}</span>
          <span class="badge wins">${wins} wins</span>
        </div>
        <div class="stats-grid">
          ${['speed', 'stamina', 'power', 'guts', 'wiz'].map(s => `
            <div class="stat">
              <div class="label">${s === 'wiz' ? 'wit' : s}</div>
              <div class="value">${char[s] || 0}</div>
            </div>
          `).join('')}
        </div>
      </div>
      
      ${renderAptitudes(char)}
      ${renderSkills(char)}
      ${renderSparks(char)}
      ${renderWins(char)}
      ${renderEpithets(char)}
      ${renderSupports(char)}
      ${renderFamilyTree(char)}
      ${renderRaces(char)}
      ${renderJson(char)}
    `;
    
    document.querySelector('.json-toggle')?.addEventListener('click', (e) => {
      e.currentTarget.classList.toggle('open');
      document.querySelector('.json-block').classList.toggle('visible');
    });
  }
  
  // Family tree navigation
  document.querySelectorAll('.tree-node[data-goto]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.goto);
      selectedIndex = idx;
      document.querySelectorAll('.character-item').forEach(e => e.classList.remove('active'));
      document.querySelector(`.character-item[data-index="${idx}"]`)?.classList.add('active');
      renderDetail(data[idx]);
      document.getElementById('detail').scrollTop = 0;
    });
  });
}

// ============================================
// RENDER COMPONENTS
// ============================================

function renderSkills(char) {
  const skills = char.skill_array || [];
  if (!skills.length) return '';
  
  function formatEffects(effects) {
    if (!effects || !effects.length) return '—';
    return effects.map(e => e.readable || e.type_name).join(', ');
  }
  
  function getSkillTypeClass(skillType) {
    return 'skill-' + (skillType || 'white');
  }
  
  return `
    <div class="section">
      <div class="section-title">Skills <span class="count">${skills.length}</span></div>
      <table class="data-table skills-table">
        <thead>
          <tr><th>Name</th><th>Lv</th><th>Condition</th><th>Effect</th><th>Dur</th></tr>
        </thead>
        <tbody>
          ${skills.map(s => `
            <tr class="${getSkillTypeClass(s.skill_type)}">
              <td class="name-col">${s.skill_name_en || '—'}</td>
              <td>${s.level}</td>
              <td class="condition-col">${s.condition || '—'}</td>
              <td class="effect-col">${formatEffects(s.effects)}</td>
              <td>${s.duration || '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderSparks(char) {
  const sparks = char.spark_array_enriched || [];
  if (!sparks.length) return '';
  
  const sortedSparks = [...sparks].sort((a, b) => {
    const priorityA = getSparkSortPriority(a.spark_id);
    const priorityB = getSparkSortPriority(b.spark_id);
    if (priorityA !== priorityB) return priorityA - priorityB;
    return (b.stars || 0) - (a.stars || 0);
  });
  
  return `
    <div class="section">
      <div class="section-title">Sparks <span class="count">${sparks.length}</span></div>
      <div class="tag-list">
        ${sortedSparks.map(s => `<span class="tag spark-tag ${getStarClass(s.stars)} ${getSparkTypeClass(s.spark_id)}">${s.spark_name_en || s.spark_id} <span class="spark-stars">${getStars(s.stars)}</span></span>`).join('')}
      </div>
    </div>
  `;
}

function renderInheritanceSparks(char) {
  function renderSparksList(sparks) {
    if (!sparks || !sparks.length) {
      return '<span style="color:var(--text-muted);font-size:12px">No sparks</span>';
    }
    const sorted = [...sparks].sort((a, b) => {
      const idA = a.spark_id || a.factor_id;
      const idB = b.spark_id || b.factor_id;
      const priorityA = getSparkSortPriority(idA);
      const priorityB = getSparkSortPriority(idB);
      if (priorityA !== priorityB) return priorityA - priorityB;
      return (b.stars || 0) - (a.stars || 0);
    });
    return sorted.map(s => {
      const sparkId = s.spark_id || s.factor_id;
      return `
        <span class="inheritance-spark ${getStarClass(s.stars)} ${getSparkTypeClass(sparkId)}">
          <span>${s.spark_name_en || sparkId || '?'}</span>
          <span class="spark-stars">${getStars(s.stars)}</span>
        </span>
      `;
    }).join('');
  }
  
  const umaSparks = char.spark_array_enriched || [];
  const succession = char.succession_chara_array || [];
  const parent1 = succession.find(p => p.position_id === 10);
  const parent2 = succession.find(p => p.position_id === 20);
  
  return `
    <div class="inheritance-view">
      <div class="inheritance-uma current">
        <div class="inheritance-uma-header">
          <span class="inheritance-uma-name">${char.chara_name_en || 'Unknown'}</span>
          <span class="inheritance-uma-label">This Uma</span>
        </div>
        <div class="inheritance-sparks-grid">
          ${renderSparksList(umaSparks)}
        </div>
      </div>
      
      <div class="inheritance-parents">
        ${parent1 ? `
          <div class="inheritance-uma parent">
            <div class="inheritance-uma-header">
              <span class="inheritance-uma-name">${parent1.chara_name_en || 'Parent 1'}</span>
              <span class="inheritance-uma-label">Parent 1</span>
            </div>
            <div class="inheritance-sparks-grid">
              ${renderSparksList(parent1.factor_info_array)}
            </div>
          </div>
        ` : '<div class="inheritance-uma parent"><span style="color:var(--text-muted)">No parent data</span></div>'}
        
        ${parent2 ? `
          <div class="inheritance-uma parent">
            <div class="inheritance-uma-header">
              <span class="inheritance-uma-name">${parent2.chara_name_en || 'Parent 2'}</span>
              <span class="inheritance-uma-label">Parent 2</span>
            </div>
            <div class="inheritance-sparks-grid">
              ${renderSparksList(parent2.factor_info_array)}
            </div>
          </div>
        ` : '<div class="inheritance-uma parent"><span style="color:var(--text-muted)">No parent data</span></div>'}
      </div>
    </div>
  `;
}

function renderWins(char) {
  const wins = char.win_saddle_array_enriched || [];
  if (!wins.length) return '';
  
  return `
    <div class="section">
      <div class="section-title">Race Wins <span class="count">${wins.length}</span></div>
      <div class="tag-list">
        ${wins.map(w => `<span class="tag">${w.race_name_en || w.saddle_id}</span>`).join('')}
      </div>
    </div>
  `;
}

function renderEpithets(char) {
  const epithets = char.nickname_array_enriched || [];
  if (!epithets.length) return '';
  
  return `
    <div class="section">
      <div class="section-title">Epithets <span class="count">${epithets.length}</span></div>
      <div class="tag-list">
        ${epithets.map(e => `<span class="tag">${e.nickname_name_en || e.nickname_id}</span>`).join('')}
      </div>
    </div>
  `;
}

function renderAptitudes(char) {
  const hasGround = char.proper_ground_turf !== undefined || char.proper_ground_dirt !== undefined;
  const hasStyle = char.proper_running_style_nige !== undefined;
  const hasDistance = char.proper_distance_short !== undefined;
  
  if (!hasGround && !hasStyle && !hasDistance) return '';
  
  return `
    <div class="section">
      <div class="section-title">Aptitudes</div>
      <div class="aptitude-grid">
        <div class="aptitude-group">
          <div class="aptitude-group-title">Ground</div>
          <div class="aptitude-row">
            <span class="aptitude-label">Turf</span>
            ${renderGrade(char.proper_ground_turf || 1)}
          </div>
          <div class="aptitude-row">
            <span class="aptitude-label">Dirt</span>
            ${renderGrade(char.proper_ground_dirt || 1)}
          </div>
        </div>
        <div class="aptitude-group">
          <div class="aptitude-group-title">Running Style</div>
          <div class="aptitude-row">
            <span class="aptitude-label">Front Runner</span>
            ${renderGrade(char.proper_running_style_nige || 1)}
          </div>
          <div class="aptitude-row">
            <span class="aptitude-label">Pace Chaser</span>
            ${renderGrade(char.proper_running_style_senko || 1)}
          </div>
          <div class="aptitude-row">
            <span class="aptitude-label">Late Surger</span>
            ${renderGrade(char.proper_running_style_sashi || 1)}
          </div>
          <div class="aptitude-row">
            <span class="aptitude-label">End Closer</span>
            ${renderGrade(char.proper_running_style_oikomi || 1)}
          </div>
        </div>
        <div class="aptitude-group">
          <div class="aptitude-group-title">Distance</div>
          <div class="aptitude-row">
            <span class="aptitude-label">Sprint</span>
            ${renderGrade(char.proper_distance_short || 1)}
          </div>
          <div class="aptitude-row">
            <span class="aptitude-label">Mile</span>
            ${renderGrade(char.proper_distance_mile || 1)}
          </div>
          <div class="aptitude-row">
            <span class="aptitude-label">Medium</span>
            ${renderGrade(char.proper_distance_middle || 1)}
          </div>
          <div class="aptitude-row">
            <span class="aptitude-label">Long</span>
            ${renderGrade(char.proper_distance_long || 1)}
          </div>
        </div>
      </div>
    </div>
  `;
}

function getMaxLevel(supportCardId, limitBreak) {
  const idStr = String(supportCardId);
  const lb = limitBreak || 0;
  
  if (idStr.startsWith('3')) {
    return 30 + (lb * 5);
  } else if (idStr.startsWith('2')) {
    return 25 + (lb * 5);
  } else {
    return 20 + (lb * 5);
  }
}

function formatLB(lb) {
  const count = lb || 0;
  return count >= 4 ? 'MLB' : count + 'LB';
}

function renderSupports(char) {
  const supports = char.support_card_list || [];
  if (!supports.length) return '';
  
  return `
    <div class="section">
      <div class="section-title">Support Cards <span class="count">${supports.length}</span></div>
      <table class="data-table">
        <thead>
          <tr><th>Name</th><th>Type</th><th>Lv</th><th>LB</th></tr>
        </thead>
        <tbody>
          ${supports.map(s => {
            const maxLv = getMaxLevel(s.support_card_id, s.limit_break_count);
            return `
            <tr>
              <td class="name-col">${s.support_card_name_en || '—'}</td>
              <td>${s.support_card_type || '—'}</td>
              <td>${maxLv}</td>
              <td>${formatLB(s.limit_break_count)}</td>
            </tr>
          `}).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function getCharName(c) {
  if (!c) return null;
  return c.chara_name_en || c.card_name_en || 'Unknown';
}

function getCharOutfit(c) {
  if (!c) return '';
  return c.costume_name_en || '';
}

function renderTreeNode(char, isCurrent = false, trainedId = null) {
  if (!char) {
    return `<div class="tree-node missing">
      <div class="node-name">External</div>
      <div class="node-outfit">${trainedId ? `id: ${trainedId}` : 'Friend/Deleted'}</div>
    </div>`;
  }
  
  const entry = byTrainedId[char.trained_chara_id];
  const clickable = entry && !isCurrent;
  
  return `<div class="tree-node ${isCurrent ? 'current' : ''}" ${clickable ? `data-goto="${entry.index}"` : ''}>
    <div class="node-name">${getCharName(char)}</div>
    <div class="node-outfit">${getCharOutfit(char)}</div>
  </div>`;
}

function renderFamilyTree(char) {
  const p1Id = char.succession_trained_chara_id_1;
  const p2Id = char.succession_trained_chara_id_2;
  
  if (!p1Id && !p2Id) return '';
  
  const parent1 = byTrainedId[p1Id]?.char;
  const parent2 = byTrainedId[p2Id]?.char;
  
  const gp1_1Id = parent1?.succession_trained_chara_id_1;
  const gp1_2Id = parent1?.succession_trained_chara_id_2;
  const gp2_1Id = parent2?.succession_trained_chara_id_1;
  const gp2_2Id = parent2?.succession_trained_chara_id_2;
  
  const gp1_1 = byTrainedId[gp1_1Id]?.char;
  const gp1_2 = byTrainedId[gp1_2Id]?.char;
  const gp2_1 = byTrainedId[gp2_1Id]?.char;
  const gp2_2 = byTrainedId[gp2_2Id]?.char;
  
  const hasGrandparents = gp1_1Id || gp1_2Id || gp2_1Id || gp2_2Id;
  
  return `
    <div class="section">
      <div class="section-title">Family Tree</div>
      <div class="family-tree" id="family-tree">
        <div class="tree-level">
          ${renderTreeNode(char, true)}
        </div>
        <div class="tree-connector split"></div>
        <div class="tree-level">
          <div class="tree-branch">
            <div class="branch-line"></div>
            ${renderTreeNode(parent1, false, p1Id)}
          </div>
          <div class="tree-branch">
            <div class="branch-line"></div>
            ${renderTreeNode(parent2, false, p2Id)}
          </div>
        </div>
        ${hasGrandparents ? `
          <div class="tree-level" style="gap: 120px;">
            <div class="tree-connector split" style="width: 120px;"></div>
            <div class="tree-connector split" style="width: 120px;"></div>
          </div>
          <div class="tree-level" style="gap: 12px;">
            <div class="tree-row">
              <div class="tree-branch">
                <div class="branch-line"></div>
                ${renderTreeNode(gp1_1, false, gp1_1Id)}
              </div>
              <div class="tree-branch">
                <div class="branch-line"></div>
                ${renderTreeNode(gp1_2, false, gp1_2Id)}
              </div>
            </div>
            <div class="tree-row">
              <div class="tree-branch">
                <div class="branch-line"></div>
                ${renderTreeNode(gp2_1, false, gp2_1Id)}
              </div>
              <div class="tree-branch">
                <div class="branch-line"></div>
                ${renderTreeNode(gp2_2, false, gp2_2Id)}
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderRaces(char) {
  const races = char.race_result_list || [];
  if (!races.length) return '';
  
  const sorted = [...races].sort((a, b) => (b.turn || 0) - (a.turn || 0)).slice(0, 15);
  
  return `
    <div class="section">
      <div class="section-title">Races <span class="count">${sorted.length}/${races.length}</span></div>
      <table class="data-table">
        <thead>
          <tr><th>Place</th><th>Race</th><th>Turn</th><th>Program ID</th></tr>
        </thead>
        <tbody>
          ${sorted.map(r => {
            const p = r.order_of_finish || r.result_order || '?';
            const pc = p === 1 ? 'p1' : p === 2 ? 'p2' : p === 3 ? 'p3' : 'other';
            return `
              <tr>
                <td><span class="place ${pc}">${p}</span></td>
                <td class="name-col">${r.race_name_en || '—'}</td>
                <td>${r.turn || '—'}</td>
                <td>${r.program_id}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function syntaxHighlight(json) {
  return json
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span class="json-string">"$1"</span>')
    .replace(/: (\d+)/g, ': <span class="json-number">$1</span>')
    .replace(/: (true|false)/g, ': <span class="json-bool">$1</span>')
    .replace(/: (null)/g, ': <span class="json-null">$1</span>');
}

function renderJson(char) {
  const json = JSON.stringify(char, null, 2);
  const highlighted = syntaxHighlight(json);
  
  return `
    <div class="json-section">
      <button class="json-toggle">
        <span class="arrow">▶</span> raw json
      </button>
      <div class="json-block">
        <pre>${highlighted}</pre>
      </div>
    </div>
  `;
}

// ============================================
// ACCOUNT OPTIMIZATION
// ============================================

function calculateSparkScore(char) {
  const sparks = char.spark_array_enriched || [];
  let totalScore = 0;
  const breakdown = { stat: 0, aptitude: 0, unique: 0, skill: 0, highValue: 0, scenario: 0 };
  
  sparks.forEach(s => {
    const id = parseInt(s.spark_id) || 0;
    const stars = s.stars || 0;
    const name = s.spark_name_en || '';
    
    // Blue (stats): pts per ★
    if (id >= 100 && id < 600) {
      const pts = stars * scoreValues.stat;
      totalScore += pts;
      breakdown.stat += pts;
    }
    // Pink (aptitudes - ground + distance + style): pts per ★
    else if ((id >= 1100 && id < 1300) || (id >= 2100 && id < 2500) || (id >= 3100 && id < 3500)) {
      const pts = stars * scoreValues.aptitude;
      totalScore += pts;
      breakdown.aptitude += pts;
    }
    // Green (unique): pts per ★
    else if (id >= 10000000 && id < 20000000) {
      const pts = stars * scoreValues.unique;
      totalScore += pts;
      breakdown.unique += pts;
    }
    // White (skills) - check for special cases
    else {
      // Scenario sparks
      if (scenarioSparks.includes(name)) {
        totalScore += scoreValues.scenario;
        breakdown.scenario += scoreValues.scenario;
      }
      // High-value skills
      else if (highValueSkills.includes(name)) {
        totalScore += scoreValues.highValue;
        breakdown.highValue += scoreValues.highValue;
      }
      // Standard skills
      else {
        totalScore += scoreValues.standard;
        breakdown.skill += scoreValues.standard;
      }
    }
  });
  
  return { total: totalScore, breakdown };
}

// Check if Uma is protected by any rule
function isProtectedByRules(char) {
  if (protectionRules.length === 0) return false;
  
  const mainSparks = char.spark_array_enriched || [];
  
  // Collect parent sparks (only direct parents: position_id 10 and 20)
  const parentSparks = [];
  if (char.succession_chara_array) {
    for (const parent of char.succession_chara_array) {
      // Only count direct parents, not grandparents
      const posId = parent.position_id;
      if (posId !== 10 && posId !== 20) continue;
      
      if (parent.factor_info_array) {
        for (const factor of parent.factor_info_array) {
          parentSparks.push({
            spark_name_en: factor.spark_name_en || '',
            stars: factor.stars || 0
          });
        }
      }
    }
  }
  
  // Check each rule
  const ruleResults = protectionRules.map(rule => {
    let totalStars = 0;
    const searchName = rule.sparkName.toLowerCase();
    
    // Always check main Uma sparks
    for (const spark of mainSparks) {
      const name = spark.spark_name_en || '';
      if (name.toLowerCase().includes(searchName)) {
        totalStars += spark.stars || 0;
      }
    }
    
    // Only check parent sparks if scope is 'total'
    if (rule.scope === 'total') {
      for (const spark of parentSparks) {
        const name = spark.spark_name_en || '';
        if (name.toLowerCase().includes(searchName)) {
          totalStars += spark.stars || 0;
        }
      }
    }
    
    return totalStars >= rule.minStars;
  });
  
  // Apply AND/OR logic
  if (protectionLogic === 'and') {
    return ruleResults.every(r => r); // ALL rules must match
  } else {
    return ruleResults.some(r => r);  // ANY rule matches
  }
}

function saveProtectionRules() {
  localStorage.setItem('uma_protection_rules', JSON.stringify(protectionRules));
}

function recalculateProtection() {
  if (!optimizationResults) return;
  optimizationResults.forEach(r => {
    r.isProtected = isProtectedByRules(data[r.index]);
    const belowThreshold = r.score < transferThreshold;
    r.toTransfer = belowThreshold && !r.isProtected;
  });
}

function recalculateScores() {
  if (!optimizationResults) return;
  optimizationResults.forEach(r => {
    const score = calculateSparkScore(data[r.index]);
    r.score = score.total;
    r.breakdown = score.breakdown;
    const belowThreshold = r.score < transferThreshold;
    r.toTransfer = belowThreshold && !r.isProtected;
  });
}

function runOptimization() {
  const results = data.map((char, index) => {
    const score = calculateSparkScore(char);
    const isProtected = isProtectedByRules(char);
    const belowThreshold = score.total < transferThreshold;
    
    return {
      index,
      name: char.chara_name_en || 'Unknown',
      outfit: char.costume_name_en || '',
      createTime: char.create_time || '',
      sparkCount: (char.spark_array_enriched || []).length,
      score: score.total,
      breakdown: score.breakdown,
      isProtected,
      toTransfer: belowThreshold && !isProtected
    };
  });
  
  // Sort by date descending (newest first) to match in-game order
  results.sort((a, b) => {
    if (!a.createTime && !b.createTime) return 0;
    if (!a.createTime) return 1;
    if (!b.createTime) return -1;
    return b.createTime.localeCompare(a.createTime);
  });
  
  optimizationResults = results;
  showOptimizationResults();
}

function showOptimizationResults() {
  document.getElementById('optimize-overlay').classList.add('visible');
  renderOptimizationResults();
}

function closeOptimization() {
  document.getElementById('optimize-overlay').classList.remove('visible');
  showOnlyProtected = false; // Reset filter when closing
}

function renderOptimizationResults() {
  const container = document.getElementById('optimize-results');
  if (!container || !optimizationResults) return;
  
  // Preserve open state of details elements before re-rendering
  const scoringDetailsOpen = container.querySelector('.optimize-settings')?.open ?? false;
  const hvSkillsDetailsOpen = container.querySelectorAll('.optimize-settings')[1]?.open ?? false;
  
  const protectedCount = optimizationResults.filter(r => r.isProtected && r.score < transferThreshold).length;
  
  // Filter results if showing only protected
  let displayResults = optimizationResults;
  if (showOnlyProtected) {
    displayResults = optimizationResults.filter(r => r.isProtected && r.score < transferThreshold);
  }
  
  const toTransfer = displayResults.filter(r => r.toTransfer);
  const toKeep = displayResults.filter(r => !r.toTransfer);
  
  container.innerHTML = `
    <div class="optimize-summary">
      <div class="optimize-stat">
        <span class="optimize-stat-value">${data.length}</span>
        <span class="optimize-stat-label">Total Uma</span>
      </div>
      <div class="optimize-stat transfer">
        <span class="optimize-stat-value">${toTransfer.length}</span>
        <span class="optimize-stat-label">To Transfer</span>
      </div>
      <div class="optimize-stat keep">
        <span class="optimize-stat-value">${toKeep.length}</span>
        <span class="optimize-stat-label">To Keep</span>
      </div>
    </div>
    
    <div class="optimize-threshold">
      <label>Threshold: <input type="number" id="threshold-input" value="${transferThreshold}" min="0" max="100"> pts</label>
      <small>Uma scoring below this are marked for transfer</small>
    </div>
    
    <div class="optimize-protection">
      <div class="protection-header">
        <span class="protection-title">// protection rules</span>
        <div class="protection-header-right">
          <span class="logic-label">Logic:</span>
          <button class="logic-toggle ${protectionLogic === 'or' ? 'active' : ''}" id="logic-or">OR</button>
          <button class="logic-toggle ${protectionLogic === 'and' ? 'active' : ''}" id="logic-and">AND</button>
          ${protectedCount > 0 ? `<button class="protection-count ${showOnlyProtected ? 'active' : ''}" id="toggle-protected">${protectedCount} protected</button>` : ''}
        </div>
      </div>
      <div class="protection-rules" id="protection-rules">
        ${protectionRules.map((rule, i) => `
          <div class="protection-rule">
            <span>Keep if <strong>${rule.sparkName}</strong> ≥ <strong>${rule.minStars}★</strong> <span class="rule-scope">(${rule.scope === 'total' ? 'total' : 'main'})</span></span>
            <button class="rule-remove" data-rule-index="${i}">&times;</button>
          </div>
        `).join('')}
      </div>
      <div class="protection-add">
        <span>Keep if</span>
        <input type="text" id="rule-spark-name" list="spark-names-list" placeholder="spark name...">
        <datalist id="spark-names-list">
          ${SPARK_NAMES_FOR_FILTER.map(n => `<option value="${n}">`).join('')}
        </datalist>
        <span>≥</span>
        <input type="number" id="rule-min-stars" value="2" min="1" max="9" style="width:50px">
        <span>★</span>
        <select id="rule-scope" class="rule-scope-select">
          <option value="main">main only</option>
          <option value="total">total (+ parents)</option>
        </select>
        <button class="rule-add-btn" id="rule-add-btn">+ add</button>
      </div>
    </div>
    
    <details class="optimize-settings" ${scoringDetailsOpen ? 'open' : ''}>
      <summary>// scoring settings</summary>
      <div class="settings-content">
        <div class="settings-row">
          <label>Stat (blue) per ★:</label>
          <input type="number" id="score-stat" value="${scoreValues.stat}" min="0" max="20">
        </div>
        <div class="settings-row">
          <label>Aptitude (pink) per ★:</label>
          <input type="number" id="score-aptitude" value="${scoreValues.aptitude}" min="0" max="20">
        </div>
        <div class="settings-row">
          <label>Unique (green) per ★:</label>
          <input type="number" id="score-unique" value="${scoreValues.unique}" min="0" max="20">
        </div>
        <div class="settings-row">
          <label>Standard skill (white):</label>
          <input type="number" id="score-standard" value="${scoreValues.standard}" min="0" max="20">
        </div>
        <div class="settings-row">
          <label>High-value skill:</label>
          <input type="number" id="score-highvalue" value="${scoreValues.highValue}" min="0" max="20">
        </div>
        <div class="settings-row">
          <label>Scenario spark:</label>
          <input type="number" id="score-scenario" value="${scoreValues.scenario}" min="0" max="20">
        </div>
        <button class="settings-reset" id="reset-scores">Reset to defaults</button>
      </div>
    </details>
    
    <details class="optimize-settings" ${hvSkillsDetailsOpen ? 'open' : ''}>
      <summary>// high-value skills (${highValueSkills.length})</summary>
      <div class="settings-content">
        <div class="hv-skills-list" id="hv-skills-list">
          ${highValueSkills.map((skill, i) => `
            <span class="hv-skill">${skill}<button class="hv-remove" data-hv-index="${i}">&times;</button></span>
          `).join('')}
        </div>
        <div class="hv-add">
          <input type="text" id="hv-skill-input" placeholder="Add skill name...">
          <button class="hv-add-btn" id="hv-add-btn">+ add</button>
        </div>
        <button class="settings-reset" id="reset-hv-skills">Reset to defaults</button>
      </div>
    </details>
    
    ${toTransfer.length > 0 ? `
      <div class="optimize-section">
        <div class="optimize-section-title transfer">// to transfer (${toTransfer.length})</div>
        <div class="optimize-list">
          ${toTransfer.map(r => renderOptimizeRow(r, true)).join('')}
        </div>
      </div>
    ` : ''}
    
    <div class="optimize-section">
      <div class="optimize-section-title keep">// to keep (${toKeep.length})</div>
      <div class="optimize-list">
        ${toKeep.map(r => renderOptimizeRow(r, false)).join('')}
      </div>
    </div>
  `;
  
  // Threshold change listener
  document.getElementById('threshold-input')?.addEventListener('change', (e) => {
    transferThreshold = parseInt(e.target.value) || 15;
    localStorage.setItem('uma_transfer_threshold', transferThreshold);
    // Recalculate transfer status
    optimizationResults.forEach(r => {
      const belowThreshold = r.score < transferThreshold;
      r.toTransfer = belowThreshold && !r.isProtected;
    });
    renderOptimizationResults();
  });
  
  // Toggle protected view
  document.getElementById('toggle-protected')?.addEventListener('click', () => {
    showOnlyProtected = !showOnlyProtected;
    renderOptimizationResults();
  });
  
  // AND/OR logic toggle
  document.getElementById('logic-or')?.addEventListener('click', () => {
    if (protectionLogic !== 'or') {
      protectionLogic = 'or';
      saveOptimizationSettings();
      recalculateProtection();
      renderOptimizationResults();
    }
  });
  document.getElementById('logic-and')?.addEventListener('click', () => {
    if (protectionLogic !== 'and') {
      protectionLogic = 'and';
      saveOptimizationSettings();
      recalculateProtection();
      renderOptimizationResults();
    }
  });
  
  // Score value inputs - stop propagation to prevent details from closing
  ['stat', 'aptitude', 'unique', 'standard', 'highvalue', 'scenario'].forEach(key => {
    const input = document.getElementById(`score-${key}`);
    if (input) {
      ['click', 'mousedown', 'pointerdown'].forEach(evt => {
        input.addEventListener(evt, e => e.stopPropagation());
      });
      input.addEventListener('change', () => {
        const val = parseInt(input.value) || 0;
        const storeKey = key === 'highvalue' ? 'highValue' : key;
        scoreValues[storeKey] = val;
        saveOptimizationSettings();
        recalculateScores();
        renderOptimizationResults();
      });
    }
  });
  
  // Reset scores
  document.getElementById('reset-scores')?.addEventListener('click', (e) => {
    e.stopPropagation();
    scoreValues = { ...DEFAULT_SCORE_VALUES };
    saveOptimizationSettings();
    recalculateScores();
    renderOptimizationResults();
  });
  
  // High-value skills add - stop propagation to prevent details from closing
  const hvInput = document.getElementById('hv-skill-input');
  if (hvInput) {
    ['click', 'mousedown', 'pointerdown'].forEach(evt => {
      hvInput.addEventListener(evt, e => e.stopPropagation());
    });
  }
  
  const hvAddBtn = document.getElementById('hv-add-btn');
  hvAddBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const skillName = hvInput?.value.trim();
    if (skillName && !highValueSkills.includes(skillName)) {
      highValueSkills.push(skillName);
      saveOptimizationSettings();
      recalculateScores();
      renderOptimizationResults();
    }
  });
  
  // High-value skills remove
  container.querySelectorAll('.hv-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.hvIndex);
      highValueSkills.splice(idx, 1);
      saveOptimizationSettings();
      recalculateScores();
      renderOptimizationResults();
    });
  });
  
  // Reset high-value skills
  document.getElementById('reset-hv-skills')?.addEventListener('click', (e) => {
    e.stopPropagation();
    highValueSkills = [...DEFAULT_HIGH_VALUE_SKILLS];
    saveOptimizationSettings();
    recalculateScores();
    renderOptimizationResults();
  });
  
  // Add rule listener
  document.getElementById('rule-add-btn')?.addEventListener('click', () => {
    const sparkName = document.getElementById('rule-spark-name').value.trim();
    const minStars = parseInt(document.getElementById('rule-min-stars').value) || 2;
    const scope = document.getElementById('rule-scope').value || 'main';
    
    if (sparkName) {
      protectionRules.push({ sparkName, minStars, scope });
      saveProtectionRules();
      // Recalculate protection status
      optimizationResults.forEach(r => {
        r.isProtected = isProtectedByRules(data[r.index]);
        const belowThreshold = r.score < transferThreshold;
        r.toTransfer = belowThreshold && !r.isProtected;
      });
      renderOptimizationResults();
    }
  });
  
  // Remove rule listeners
  container.querySelectorAll('.rule-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.ruleIndex);
      protectionRules.splice(idx, 1);
      saveProtectionRules();
      // Recalculate protection status
      optimizationResults.forEach(r => {
        r.isProtected = isProtectedByRules(data[r.index]);
        const belowThreshold = r.score < transferThreshold;
        r.toTransfer = belowThreshold && !r.isProtected;
      });
      renderOptimizationResults();
    });
  });
  
  // Click to view Uma
  container.querySelectorAll('.optimize-row[data-index]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.index);
      selectedIndex = idx;
      closeOptimization();
      filterAndSortList();
      renderDetail(data[idx]);
    });
  });
}

function renderOptimizeRow(result, isTransfer) {
  const b = result.breakdown;
  const breakdownParts = [];
  if (b.stat > 0) breakdownParts.push(`<span class="spark-stat">Stat ${b.stat}</span>`);
  if (b.aptitude > 0) breakdownParts.push(`<span class="spark-aptitude">Apt ${b.aptitude}</span>`);
  if (b.unique > 0) breakdownParts.push(`<span class="spark-unique">Unq ${b.unique}</span>`);
  if (b.scenario > 0) breakdownParts.push(`<span class="spark-scenario">Scen ${b.scenario}</span>`);
  if (b.highValue > 0) breakdownParts.push(`<span class="spark-high">HV ${b.highValue}</span>`);
  if (b.skill > 0) breakdownParts.push(`<span class="spark-skill">Skl ${b.skill}</span>`);
  
  const showProtectedBadge = result.isProtected && result.score < transferThreshold;
  
  return `
    <div class="optimize-row ${isTransfer ? 'transfer' : ''} ${showProtectedBadge ? 'protected' : ''}" data-index="${result.index}">
      <div class="optimize-row-main">
        <span class="optimize-name">${result.name}</span>
        ${showProtectedBadge ? '<span class="protected-badge">protected</span>' : ''}
        <span class="optimize-score ${isTransfer ? 'low' : ''}">${result.score} pts</span>
      </div>
      <div class="optimize-row-breakdown">${breakdownParts.join(' ')}</div>
    </div>
  `;
}

function renderOptimizeUI() {
  return `
    <!-- Optimization Modal -->
    <div class="optimize-overlay" id="optimize-overlay">
      <div class="optimize-modal">
        <div class="optimize-header">
          <h2>// optimize account</h2>
          <button class="optimize-close" id="optimize-close">&times;</button>
        </div>
        <div class="optimize-content" id="optimize-results">
          <div class="optimize-loading">Analyzing your account...</div>
        </div>
        <div class="optimize-footer">
          <button class="optimize-done" id="optimize-done">Done</button>
        </div>
      </div>
    </div>
  `;
}

function attachOptimizeListeners() {
  document.getElementById('optimize-btn')?.addEventListener('click', runOptimization);
  document.getElementById('optimize-close')?.addEventListener('click', closeOptimization);
  document.getElementById('optimize-done')?.addEventListener('click', closeOptimization);
  document.getElementById('optimize-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeOptimization();
  });
}

// ============================================
// INIT
// ============================================

loadData();
