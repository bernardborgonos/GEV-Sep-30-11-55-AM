/**
 * @module presetIntelligenceData
 * @description Curated datasets and endpoints for Quick Presets across diverse formats:
 * - HTML Webpages (e.g. Bureau of Immigration, UNESCO, DFA)
 * - CSV Datasets (e.g. Global Maritime Container Ports & Terminals)
 * - Google Drive / Google Sheets (e.g. Emergency Logistics & Relief Supply Network)
 * - PDF Documents (e.g. Port Security & Customs Clearance Bulletin)
 * - GeoJSON / OpenData (e.g. Global Humanitarian Logistics Hubs)
 */

import {
  SAMPLE_MANILA_100_VEHICLE_SIMULATION_CSV,
  SAMPLE_METRO_PATROL_GPX,
  SAMPLE_NMEA_GPS_STREAM,
} from './manilaVehicleSimulation.js';
import {
  MANILA_TRANSIT_KML,
  MANILA_TRANSIT_GPX,
  MANILA_TRANSIT_NMEA,
  MANILA_TRANSIT_CSV,
  MANILA_TRANSIT_DATASETS,
} from './manilaTransitData.js';
import {
  PH_STRATEGIC_SIMULATION_NODES,
  PH_STRATEGIC_SIMULATION_GEOJSON,
  PH_STRATEGIC_SIMULATION_CSV,
} from './philippineStrategicSimulationData.js';

export {
  SAMPLE_MANILA_100_VEHICLE_SIMULATION_CSV,
  SAMPLE_METRO_PATROL_GPX,
  SAMPLE_NMEA_GPS_STREAM,
  MANILA_TRANSIT_KML,
  MANILA_TRANSIT_GPX,
  MANILA_TRANSIT_NMEA,
  MANILA_TRANSIT_CSV,
  MANILA_TRANSIT_DATASETS,
  PH_STRATEGIC_SIMULATION_NODES,
  PH_STRATEGIC_SIMULATION_GEOJSON,
  PH_STRATEGIC_SIMULATION_CSV,
};

export const QUICK_PRESETS = Object.freeze([
  {
    id: 'ph-strategic-operational-simulation',
    format: 'GEOJSON',
    formatBadge: 'PHASE 4 SIM',
    label: '⚡ Phase 4: Philippine Strategic Network & Operational Simulation (GeoJSON)',
    url: 'https://defense.gov.ph/simulation/ph_strategic_operational_simulation.geojson',
    folderCategory: 'Simulation',
    description: '33 Strategic National Gateways, Maritime Borders & Defense Command Hubs across 17 Regions with real-time operational simulation dynamics',
  },
  {
    id: 'manila-transit-kml',
    format: 'KML',
    formatBadge: 'TRANSIT KML',
    label: '🚆 Manila Transit: Living Network 46 Stations & gx:Track (KML)',
    url: 'https://drive.google.com/file/d/manila_transit_living_network.kml/view',
    folderCategory: 'Layers',
    description: '46 station Placemarks & synchronized 24.5-min Space-Time simulation tracks (LRT-1, LRT-2, MRT-3)',
  },
  {
    id: 'manila-transit-gpx',
    format: 'GPX',
    formatBadge: 'TRANSIT GPX',
    label: '🧭 Manila Transit: Synchronized Simulation (GPX 1.1)',
    url: 'https://drive.google.com/file/d/manila_transit_simulation.gpx/view',
    folderCategory: 'GPX-Tracks',
    description: 'Lead trains 001 (LRT-2) & 002 (MRT-3) with 30s-dwell / 90s-transit rhythm and elevation coordinates',
  },
  {
    id: 'manila-transit-nmea',
    format: 'NMEA',
    formatBadge: 'TRANSIT NMEA',
    label: '📡 Manila Transit: Real-Time GPS Telemetry Log (NMEA-0183)',
    url: 'https://drive.google.com/file/d/manila_transit_telemetry.nmea/view',
    folderCategory: 'NMEA-Logs',
    description: 'Raw NMEA sentences ($GPRMC/$GPGGA) from T0 2026-09-11T00:00:00Z through 24.5-minute journey',
  },
  {
    id: 'manila-transit-csv',
    format: 'G-DRIVE-CSV',
    formatBadge: 'TRANSIT CSV',
    label: '📊 Manila Transit: Space-Time Telemetry Kinematics (CSV)',
    url: 'https://drive.google.com/file/d/manila_transit_space_time.csv/view',
    folderCategory: 'Fleet-GPS',
    description: 'Complete station registry & 10s kinematic telemetry for Train 001 & 002 with status & speed profiles',
  },
  {
    id: 'gdrive-fleet-gps',
    format: 'G-DRIVE-CSV',
    formatBadge: 'DRIVE FLEET',
    label: '📁 Drive: Metro Fleet 100 Telemetry (CSV)',
    url: 'https://drive.google.com/file/d/1_GodsEyeView_Metro_Fleet_Telemetry/view',
    folderCategory: 'Fleet-GPS',
    description: 'Commercial fleet coordinates, speed, heading, and breadcrumbs synced via Google Drive GodsEyeView/Fleet-GPS/',
  },
  {
    id: 'gdrive-gpx-track',
    format: 'G-DRIVE-GPX',
    formatBadge: 'DRIVE GPX',
    label: '📁 Drive: Alpine Rescue Patrol (GPX)',
    url: 'https://drive.google.com/file/d/2_GodsEyeView_Mountain_Rescue_Track/view',
    folderCategory: 'GPX-Tracks',
    description: 'Tactical SAR route waypoint markers and elevation geometry synced via Google Drive GodsEyeView/GPX-Tracks/',
  },
  {
    id: 'gdrive-nmea-stream',
    format: 'G-DRIVE-NMEA',
    formatBadge: 'DRIVE NMEA',
    label: '📁 Drive: Coastal Patrol GPS Log (NMEA)',
    url: 'https://drive.google.com/file/d/3_GodsEyeView_Coastal_Patrol_NMEA/view',
    folderCategory: 'NMEA-Logs',
    description: 'Raw NMEA-0183 ($GPRMC/$GPGGA) satellite navigation logs synced via Google Drive GodsEyeView/NMEA-Logs/',
  },
  {
    id: 'manila-100-vehicle-simulation',
    format: 'GPS-XLSX',
    formatBadge: 'FLEET GPS',
    label: '🛰️ Manila 100-Vehicle Real-Time GPS Telemetry',
    url: 'https://telemetry.nav/manila_100_vehicle_simulation.xlsx',
    description: '100 commercial vehicles streaming 6,100 breadcrumbs across Metro Manila arteries (dynamic polylines & speed kinematics)',
  },
  {
    id: 'metro-patrol-gpx',
    format: 'GPX',
    formatBadge: 'GPX TRACK',
    label: '🧭 Metro Manila Tactical Patrol Route (GPX)',
    url: 'https://gps.patrol.ph/metro_manila_unit_patrol.gpx',
    description: 'GPX XML track of tactical emergency response unit navigating Manila Bay and Port Area corridors',
  },
  {
    id: 'nmea-gps-stream',
    format: 'NMEA',
    formatBadge: 'NMEA GPS',
    label: '📡 NMEA-0183 Live GPS Stream ($GPRMC/$GPGGA)',
    url: 'https://gps.stream/nmea_live_telemetry.nmea',
    description: 'Real-time marine & vehicle NMEA sentence stream with raw knots, compass course, and satellite fix metadata',
  },
  {
    id: 'ph-bi-ports-offices',
    format: 'HTML',
    formatBadge: 'HTML',
    label: '🇵🇭 Bureau of Immigration (Ports & Offices)',
    url: 'https://immigration.gov.ph/contacts/',
    description: '13 International Ports of Entry/Exit and 67 Regional District/Field Offices across the Philippines',
  },
  {
    id: 'global-seaports-csv',
    format: 'CSV',
    formatBadge: 'CSV',
    label: '📊 Major Global Seaports & Terminals',
    url: 'https://raw.githubusercontent.com/datasets/seaports/master/data/seaports.csv',
    description: 'Tabular CSV dataset of primary world maritime trade gateways and deepwater container terminals',
  },
  {
    id: 'logistics-google-sheet',
    format: 'G-SHEET',
    formatBadge: 'G-SHEET',
    label: '📋 Emergency Logistics & Relief Hubs',
    url: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/export?format=csv',
    description: 'Live Google Drive spreadsheet detailing regional disaster relief warehouses and forwarding facilities',
  },
  {
    id: 'port-security-bulletin-pdf',
    format: 'PDF',
    formatBadge: 'PDF',
    label: '📄 Port Security & Customs Bulletin',
    url: 'https://customs.gov.ph/bulletin/port-clearance-advisory.pdf',
    description: 'Official PDF bulletin covering border checkpoints, customs inspection stations, and maritime patrol stations',
  },
  {
    id: 'bi-citizens-charter-pdf',
    format: 'PDF',
    formatBadge: 'PDF',
    label: '🇵🇭 BI Citizen\'s Charter Ports & Offices (PDF)',
    url: 'https://immigration.gov.ph/wp-content/uploads/2025/03/2021_BI_-Citizens-Charter_2nd-Ed.pdf',
    description: 'Bureau of Immigration Citizen\'s Charter with all international ports of entry and field offices',
  },
  {
    id: 'world-capitals-currency-pdf',
    format: 'PDF',
    formatBadge: 'PDF',
    label: '🌍 World Capitals & Currencies (PDF)',
    url: 'https://pdf.bankexamstoday.com/raman_files/LIst-of-countries-and-capitals-and-currency.pdf',
    description: 'Comprehensive global gazetteer of sovereign nations, capital cities, and currencies',
  },
  {
    id: 'global-universities-pdf',
    format: 'PDF',
    formatBadge: 'PDF',
    label: '🎓 Global Universities Directory (PDF)',
    url: 'https://links.bmiglobaled.com/kit/GISFW_ListofUniversities.pdf',
    description: 'International directory of higher education institutions, colleges, and research universities',
  },
  {
    id: 'un-logistics-geojson',
    format: 'GEOJSON',
    formatBadge: 'GEOJSON',
    label: '🌐 UN Humanitarian Logistics Depots',
    url: 'https://logcluster.org/data/global-logistics-hubs.geojson',
    description: 'GeoJSON spatial feed of global humanitarian staging areas and emergency response hubs',
  },
  {
    id: 'unesco-world-heritage',
    format: 'HTML',
    formatBadge: 'HTML',
    label: '🏛️ UNESCO World Heritage Sites',
    url: 'https://whc.unesco.org',
    description: 'Global heritage properties, monuments, and cultural conservation sites',
  },
  {
    id: 'ph-dfa-consular',
    format: 'HTML',
    formatBadge: 'HTML',
    label: '🛂 DFA Consular Offices & Satellites',
    url: 'https://consular.dfa.gov.ph',
    description: 'Department of Foreign Affairs passport and consular offices across the Philippines',
  },
]);

/**
 * Curated CSV content for Global Major Seaports.
 */
export const SAMPLE_SEAPORTS_CSV = `PortName,Country,Latitude,Longitude,Type,Status,HandlingCapacity
Port of Shanghai,China,31.2304,121.4737,Seaport,Active,47.3M TEU
Port of Singapore,Singapore,1.29027,103.851959,Seaport,Active,37.5M TEU
Port of Ningbo-Zhoushan,China,29.8683,121.5440,Seaport,Active,31.0M TEU
Port of Shenzhen,China,22.5431,114.0579,Seaport,Active,28.8M TEU
Port of Busan,South Korea,35.1796,129.0756,Seaport,Active,22.7M TEU
Port of Rotterdam,Netherlands,51.9244,4.4777,Seaport,Active,15.3M TEU
Port of Antwerp-Bruges,Belgium,51.2194,4.4025,Seaport,Active,14.2M TEU
Port of Los Angeles,United States,33.7432,-118.2673,Seaport,Active,10.6M TEU
Port of Long Beach,United States,33.7701,-118.1937,Seaport,Active,9.4M TEU
Port of Dubai (Jebel Ali),United Arab Emirates,25.0113,55.0612,Seaport,Active,14.0M TEU
Port of Manila (MICT),Philippines,14.5995,120.9842,Seaport,Active,5.2M TEU
Port of Batangas,Philippines,13.7565,121.0583,Seaport,Active,2.8M TEU
Port of Subic Bay,Philippines,14.8219,120.2747,Seaport,Active,1.6M TEU
Port of Cebu,Philippines,10.3157,123.8854,Seaport,Active,3.1M TEU
Port of Hamburg,Germany,53.5511,9.9937,Seaport,Active,8.7M TEU
Port of Tokyo,Japan,35.6190,139.7820,Seaport,Active,4.9M TEU
Port of Sydney (Botany),Australia,-33.9749,151.2188,Seaport,Active,2.7M TEU
Port of Santos,Brazil,-23.9608,-46.3336,Seaport,Active,4.8M TEU
Port of Colombo,Sri Lanka,6.9271,79.8612,Seaport,Active,7.2M TEU
Port of Valencia,Spain,39.4699,-0.3763,Seaport,Active,5.4M TEU`;

/**
 * Curated Google Sheets / CSV representation for Disaster Logistics & Relief Hubs.
 */
export const SAMPLE_GOOGLE_SHEETS_LOGISTICS = `FacilityName,Category,Address,City,Latitude,Longitude,Capacity,Contact
Manila National Disaster Logistics Warehouse,District Office,Camp Aguinaldo EDSA,Quezon City,14.6091,121.0617,100000 MT,(02) 8911-5061
Clark Forward Air Logistics Base,Airport,Clark Freeport Zone,Angeles City,15.1860,120.5596,50000 MT,(045) 499-5568
Subic Maritime Relief Staging Wharf,Seaport,Subic Bay Freeport Zone,Olongapo,14.8219,120.2747,75000 MT,(047) 252-4000
Cebu Regional Disaster Response Center,Field Office,Mandaue Reclamation Area,Cebu,10.3235,123.9312,60000 MT,(032) 345-2244
Davao Southern Mindanao Relief Hub,Field Office,Buhangin District,Davao City,7.1253,125.6456,45000 MT,(082) 296-9241
Iloilo Western Visayas Logistics Depot,Field Office,Fort San Pedro,Iloilo City,10.6969,122.5644,30000 MT,(033) 337-1234
Zamboanga Peninsula Humanitarian Outpost,Border Crossing,Port Area Pettit Barracks,Zamboanga City,6.9214,122.0790,25000 MT,(062) 991-1122
Cagayan de Oro Northern Mindanao Center,Field Office,Macabalan Port Area,Cagayan de Oro,8.4542,124.6319,35000 MT,(088) 856-1123
Legazpi Bicol Regional Operation Center,Extension Unit,Albay Capitol Complex,Legazpi City,13.1391,123.7438,20000 MT,(052) 480-1234
Baguio Cordillera High-Altitude Depot,Extension Unit,Loakan Airport Road,Baguio City,16.4023,120.5960,15000 MT,(074) 442-5678`;

/**
 * Curated text extracted from Customs & Port Security PDF bulletin.
 */
export const SAMPLE_CUSTOMS_PDF_TEXT = `REPUBLIC OF THE PHILIPPINES
BUREAU OF CUSTOMS & MARITIME SAFETY
NATIONAL PORT SECURITY & CLEARANCE ADVISORY BULLETIN

Pursuant to Executive Order on Integrated Border Control, the following primary customs inspection stations, maritime security checkpoints, and international clearing offices are designated active operational status:

1. Port of Manila Customs Clearing Terminal
Category: Seaport
Location: South Harbor, Port Area, Manila
Coordinates: Lat 14.5833, Lon 120.9667
Contact: clearance.pom@customs.gov.ph | (02) 8527-4537
Operational Mandate: 24/7 Deepwater Cargo Inspection & Clearance

2. NAIA Customs Aviation Inspection Division
Category: Airport
Location: Terminal 3 Complex, Pasay City, Metro Manila
Coordinates: Lat 14.5204, Lon 121.0144
Contact: naia.customs@gov.ph
Operational Mandate: Air Cargo, Baggage Screening, Diplomatic Courier Clearance

3. Cebu International Container Customs District
Category: District Office
Location: Pier 6, Cebu International Port, Cebu City
Coordinates: Lat 10.3157, Lon 123.8854
Contact: cebu.district@customs.gov.ph
Operational Mandate: Central Visayas Port of Entry & Container Scanning

4. Batangas Container Terminal Enforcement Base
Category: Seaport
Location: Sta. Clara, Batangas City
Coordinates: Lat 13.7565, Lon 121.0583
Contact: batangas.enforcement@customs.gov.ph
Operational Mandate: Calabarzon Maritime Patrol & Hazardous Cargo

5. Subic Bay International Clearance Office
Category: Border Crossing
Location: Bldg 229 Waterfront Road, Subic Bay Freeport Zone
Coordinates: Lat 14.8219, Lon 120.2747
Contact: sbfz.customs@customs.gov.ph
Operational Mandate: Special Economic Zone Customs & Free Port Border Checkpoint

6. Davao Sasa Wharf Customs Station
Category: Field Office
Location: Sasa Wharf, Km 9, Davao City
Coordinates: Lat 7.1253, Lon 125.6456
Contact: davao.port@customs.gov.ph
Operational Mandate: Southern Mindanao Agri-Cargo & Reefer Inspection

7. General Santos Makar Wharf Border Facility
Category: Border Crossing
Location: Makar Port, General Santos City, South Cotabato
Coordinates: Lat 6.1164, Lon 125.1716
Contact: gensan.makar@customs.gov.ph
Operational Mandate: BIMP-EAGA Sea Border Clearance & Fishery Inspection

8. Zamboanga Port Customs Enforcement Unit
Category: Border Crossing
Location: Port Area, Zamboanga City
Coordinates: Lat 6.9214, Lon 122.0790
Contact: zambo.customs@gov.ph
Operational Mandate: Sulu Sea Border Checkpoint & Cross-Border Patrol

9. Cagayan de Oro Macabalan Port Facility
Category: Field Office
Location: Macabalan, Cagayan de Oro City, Misamis Oriental
Coordinates: Lat 8.4542, Lon 124.6319
Contact: cdo.port@customs.gov.ph
Operational Mandate: Northern Mindanao Industrial & Agri Container Terminal

10. San Fernando La Union Poro Point Terminal
Category: Extension Unit
Location: Poro Point Freeport, San Fernando City, La Union
Coordinates: Lat 16.6159, Lon 120.3209
Contact: poropoint.customs@gov.ph
Operational Mandate: Ilocos Region Maritime Gateway & Fuel Terminal`;

/**
 * Curated GeoJSON for UN Humanitarian Logistics Clusters.
 */
export const SAMPLE_UN_LOGISTICS_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [120.9842, 14.5995] },
      properties: {
        name: 'UNHRD Humanitarian Staging Facility — Manila',
        category: 'Main Office',
        address: 'Port Area Manila, Philippines',
        contact: 'unhrd.manila@wfp.org',
        details: 'Asia-Pacific Regional Humanitarian Response Depot',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [55.0612, 25.0113] },
      properties: {
        name: 'UNHRD Global Logistics Hub — Dubai',
        category: 'Main Office',
        address: 'International Humanitarian City, Dubai, UAE',
        contact: 'unhrd.dubai@wfp.org',
        details: 'Central Global Supply & Rapid Deployment Depot',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [17.9442, 40.6321] },
      properties: {
        name: 'UNHRD Base — Brindisi',
        category: 'District Office',
        address: 'San Vito dei Normanni Air Station, Brindisi, Italy',
        contact: 'unhrd.brindisi@wfp.org',
        details: 'European Strategic Stockpile & Training Depot',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-79.5583, 8.9824] },
      properties: {
        name: 'UNHRD Americas Hub — Panama City',
        category: 'District Office',
        address: 'Panama Pacifico Logistics Park, Panama City',
        contact: 'unhrd.panama@wfp.org',
        details: 'Latin America & Caribbean Humanitarian Forwarding Depot',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [38.7578, 9.0108] },
      properties: {
        name: 'UNHRD Strategic Center — Addis Ababa',
        category: 'District Office',
        address: 'Bole Airport Logistics Zone, Addis Ababa, Ethiopia',
        contact: 'unhrd.addis@wfp.org',
        details: 'East Africa Humanitarian Relief Depot',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [31.2357, 30.0444] },
      properties: {
        name: 'Regional Humanitarian Fleet Center — Cairo',
        category: 'Field Office',
        address: 'Nasr City Logistics Corridor, Cairo, Egypt',
        contact: 'fleet.cairo@wfp.org',
        details: 'Middle East Emergency Convoys & Medical Equipment',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [100.5018, 13.7563] },
      properties: {
        name: 'UN Logistics Cluster Sub-Regional Office — Bangkok',
        category: 'Field Office',
        address: 'Rajdamnern Nok Avenue, Bangkok, Thailand',
        contact: 'logcluster.bangkok@wfp.org',
        details: 'Southeast Asia Disaster Response Coordination',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [85.3240, 27.7172] },
      properties: {
        name: 'Humanitarian Staging Area — Kathmandu',
        category: 'Extension Unit',
        address: 'Tribhuvan International Airport Cargo Gate, Kathmandu, Nepal',
        contact: 'logcluster.nepal@wfp.org',
        details: 'Himalayan Airlift & Mountain Access Outpost',
      },
    },
  ],
};

/**
 * Curated text extracted from World Countries, Capitals, and Currencies PDF bulletin.
 */
export const SAMPLE_COUNTRIES_CAPITALS_TEXT = `LIST OF COUNTRIES AND CAPITALS AND CURRENCY
Country Name	Capital	Currency
Afghanistan	Kabul	Afghani
Albania	Tirane	Lek
Algeria	Algiers	Dinar
Andorra	Andorra la Vella	Euro
Angola	Luanda	Kwanza
Argentina	Buenos Aires	Peso
Armenia	Yerevan	Dram
Australia	Canberra	Dollar
Austria	Vienna	Euro
Azerbaijan	Baku	Manat
Bahamas	Nassau	Dollar
Bahrain	Manama	Dinar
Bangladesh	Dhaka	Taka
Barbados	Bridgetown	Dollar
Belarus	Minsk	Ruble
Belgium	Brussels	Euro
Belize	Belmopan	Dollar
Bolivia	Sucre	Boliviano
Brazil	Brasilia	Real
Canada	Ottawa	Dollar
Chile	Santiago	Peso
China	Beijing	Yuan
Colombia	Bogota	Peso
Costa Rica	San Jose	Colon
Croatia	Zagreb	Euro
Cuba	Havana	Peso
Cyprus	Nicosia	Euro
Czech Republic	Prague	Koruna
Denmark	Copenhagen	Krone
Egypt	Cairo	Pound
Finland	Helsinki	Euro
France	Paris	Euro
Germany	Berlin	Euro
Greece	Athens	Euro
Hungary	Budapest	Forint
Iceland	Reykjavik	Krona
India	New Delhi	Rupee
Indonesia	Jakarta	Rupiah
Iran	Tehran	Rial
Iraq	Baghdad	Dinar
Ireland	Dublin	Euro
Israel	Jerusalem	Shekel
Italy	Rome	Euro
Japan	Tokyo	Yen
Jordan	Amman	Dinar
Kenya	Nairobi	Shilling
Kuwait	Kuwait City	Dinar
Malaysia	Kuala Lumpur	Ringgit
Mexico	Mexico City	Peso
Morocco	Rabat	Dirham
Netherlands	Amsterdam	Euro
New Zealand	Wellington	Dollar
Nigeria	Abuja	Naira
Norway	Oslo	Krone
Pakistan	Islamabad	Rupee
Peru	Lima	Sol
Philippines	Manila	Peso
Poland	Warsaw	Zloty
Portugal	Lisbon	Euro
Qatar	Doha	Riyal
Romania	Bucharest	Leu
Russia	Moscow	Ruble
Saudi Arabia	Riyadh	Riyal
Singapore	Singapore	Dollar
South Africa	Pretoria	Rand
South Korea	Seoul	Won
Spain	Madrid	Euro
Sweden	Stockholm	Krona
Switzerland	Bern	Franc
Taiwan	Taipei	Dollar
Thailand	Bangkok	Baht
Turkey	Ankara	Lira
Ukraine	Kyiv	Hryvnia
United Arab Emirates	Abu Dhabi	Dirham
United Kingdom	London	Pound
United States	Washington	Dollar
Vietnam	Hanoi	Dong`;

/**
 * Curated text extracted from Global Universities Directory PDF bulletin.
 */
export const SAMPLE_UNIVERSITIES_TEXT = `GLOBAL INTERNATIONAL STUDENT FAIR - LIST OF UNIVERSITIES
Curtin University | Australia
University of New South Wales | Australia
University of Sydney | Australia
University of Western Australia | Australia
Acadia University | Canada
Brescia University College | Canada
Huron University | Canada
McGill University | Canada
Trent University | Canada
University of British Columbia | Canada
University of Montreal | Canada
University of Toronto | Canada
Audencia Business School | France
Burgundy School of Business | France
ESCP Business School | France
Sciences Po | France
University of Oxford | United Kingdom
University of Cambridge | United Kingdom
Imperial College London | United Kingdom
University of Edinburgh | United Kingdom
University of Manchester | United Kingdom
Harvard University | United States
Massachusetts Institute of Technology | United States
Stanford University | United States
Columbia University | United States
University of California Berkeley | United States
National University of Singapore | Singapore
Nanyang Technological University | Singapore
University of Tokyo | Japan
Kyoto University | Japan
ETH Zurich | Switzerland
University of Melbourne | Australia`;
