# 🌍 GlobalPulse — World Population Explorer

A modern, high-performance, interactive web application to explore, analyze, and visualize the population of every country and territory in the world. Built with vanilla JavaScript, modern CSS glassmorphism styling, Leaflet.js, and Chart.js.

---

## 🌟 Key Features

### 1. 📊 Interactive Table & Card Explorer
- **Comprehensive Dataset**: Covers **250 countries and territories** with 2024 population figures, global ranks, world shares, land areas, densities, and growth rates.
- **Instant Search**: Filter effortlessly by country name, official name, capital city, or ISO alpha-2/3 codes (`US`, `IND`, `Tokyo`, etc.).
- **Multi-criteria Filtering**:
  - Filter by **Continent / Region** (Asia, Africa, Europe, Americas, Oceania).
  - Filter by **Population Tiers**: Giants (>100M), Large (20M–100M), Medium (5M–20M), and Small (<5M).
- **Flexible Sorting**: Sort by Population (High/Low), Country Name (A–Z/Z–A), Population Density, Surface Area, or Annual Growth Rate.
- **View Switcher**: Toggle seamlessly between a data table view and a visual card grid.
- **Export Capabilities**: Export currently filtered or complete datasets to **CSV** with one click.

### 2. 🗺️ Interactive World Map (Leaflet.js)
- **Population Bubbles**: Country markers sized proportionally by population (`sqrt(population)`).
- **Color-Coded Tiers**: Instant visual identification from Megapopulations (>500M) down to micro-territories.
- **Hover Tooltips & Rich Popups**: Inspect flag, rank, capital, density, and click directly into the detailed country profile.
- **Quick Jump Navigator**: Instantly fly and zoom to any nation via the map navigation dropdown.
- **Dynamic Dark/Light Tile Layers**: Switches automatically between CartoDB Voyager and Dark Matter based on your theme.

### 3. 📈 Visual Analytics & Demographic Charts (Chart.js)
- **Top 15 Most Populous Nations**: Horizontal bar chart comparing the world's population leaders.
- **Continental Distribution**: Donut chart detailing population shares across Asia, Africa, Europe, the Americas, and Oceania.
- **Top 10 Density Champions**: Bar chart ranking the most densely populated nations and territories (Monaco, Singapore, etc.).
- **Population Tier Distribution**: Histogram illustrating how nations are distributed across population brackets.

### 4. ⚖️ Head-to-Head Country Comparison Tool
- Compare any two countries side-by-side.
- Compares: Total Population, Global Rank, World Share %, Capital, Surface Area, Population Density, and Growth Rate.
- **Proportional Visual Diff Bars**: Visualizes the proportional split between both chosen nations.

### 5. 🎮 "Demographic Clash" Population Quiz Game
- Test your demographic instincts! Guess which of two randomly matched nations has a higher population.
- Instant feedback with animated number reveal, synthesized sound effects, and confetti celebrations on win streaks.
- Persists your Best Streak in browser local storage.

### 6. 🔍 Detailed Country Profile Modal
- Complete dossiers including:
  - High-resolution SVG flags
  - Official and common names
  - Population, Global Rank, and % Share of Humanity
  - Surface Area & Density (people / km²)
  - Capital city, Subregion, Languages, and Currencies
  - One-click shortcuts to **Google Maps** and **Wikipedia**

### 7. ⏱️ Live World Population Ticker
- Real-time simulation incrementing global population counter by net global births minus deaths (~+2.4 people/second) on top of the ~8.14 billion baseline.

---

## 🚀 How to Run

### Method 1: Double-Click Launcher (Windows)
Double-click `start-server.bat` in this folder. It will launch a lightweight local server and open your default browser to `http://localhost:8080/`.

### Method 2: PowerShell
Open PowerShell in this directory and execute:
```powershell
.\start-server.ps1
```

### Method 3: Direct Browser Launch (Zero-Setup)
You can also directly double-click or drag-and-drop `index.html` into Google Chrome, Microsoft Edge, Firefox, or any modern web browser. The application includes a self-contained offline dataset (`data/countries-data.js`) and works immediately.

---

## 📂 Project Structure

```
enrui/
├── index.html                 # Main Single Page Application structure
├── styles.css                 # Glassmorphism styling, themes & responsiveness
├── app.js                     # Application controllers, charts, map & quiz logic
├── start-server.ps1           # Zero-dependency PowerShell HTTP server
├── start-server.bat           # Windows double-click server launcher
├── README.md                  # Project documentation
└── data/
    ├── countries.json         # Complete structured JSON dataset
    └── countries-data.js      # Bundled client-side dataset
```

---

## 📊 Data Source
- **Primary Source**: [World Bank Open Data API](https://data.worldbank.org/) (Indicator: `SP.POP.TOTL` & `SP.POP.GROW`).
- **Territories & Geographic Metadata**: mledoze/countries & FlagCDN.
