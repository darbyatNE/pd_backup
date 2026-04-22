import express from 'express';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Example document templates and descriptions
const EXAMPLE_DOCUMENTS = {
  // Buyer - Brownfield documents
  historical_invoice: {
    category: 'historical_invoice',
    facility_type: 'brownfield',
    name: 'Historical Utility Invoice',
    description: 'Past utility bills showing electricity consumption and costs',
    file_types: ['PDF'],
    expected_fields: [
      'Billing period (start and end dates)',
      'Total energy consumed (kWh)',
      'Total cost ($)',
      'Utility provider name',
      'Account number',
      'Rate structure ($/kWh)',
    ],
    example_filename: 'utility_invoice_jan_2024.pdf',
    guidance: 'Upload invoices from the past 12-24 months to establish historical consumption patterns. PDFs should be clear and readable.',
  },
  utility_contract: {
    category: 'utility_contract',
    facility_type: 'brownfield',
    name: 'Utility Contract',
    description: 'Current or past agreements with utility providers',
    file_types: ['PDF'],
    expected_fields: [
      'Contract term and duration',
      'Pricing structure and rates',
      'Demand charges',
      'Power factor requirements',
      'Contract capacity (kW or MW)',
    ],
    example_filename: 'utility_contract_2024.pdf',
    guidance: 'Include all active contracts. Redact sensitive information if needed, but retain pricing and capacity details.',
  },
  meter_reading: {
    category: 'meter_reading',
    facility_type: 'brownfield',
    name: 'Meter Reading Data',
    description: 'Time-series data from energy meters',
    file_types: ['CSV', 'TSV'],
    expected_fields: [
      'Timestamp or date',
      'Energy consumption (kWh)',
      'Demand (kW)',
      'Power factor',
      'Meter ID',
    ],
    example_filename: 'meter_data_2024.csv',
    guidance: 'CSV/TSV files should have headers. Preferred interval: 15-minute or hourly readings. Ensure timestamps are in a standard format (ISO 8601 or MM/DD/YYYY HH:MM).',
    csv_example: `Date,Time,Energy_kWh,Demand_kW,Power_Factor,Meter_ID
01/01/2024,00:00,125.5,500.2,0.95,METER-001
01/01/2024,00:15,127.3,502.1,0.94,METER-001
01/01/2024,00:30,126.1,498.7,0.95,METER-001`,
  },
  grid_data: {
    category: 'grid_data',
    facility_type: 'brownfield',
    name: 'Grid Consumption Data',
    description: 'Third-party verified grid offtake data for cross-verification',
    file_types: ['PDF', 'CSV', 'TSV'],
    expected_fields: [
      'Time period',
      'Total energy pulled from grid (kWh)',
      'Peak demand (kW)',
      'Data source/provider',
    ],
    example_filename: 'grid_data_report_2024.pdf',
    guidance: 'This data is used to cross-verify meter readings and invoices. Can be purchased from grid data providers or obtained from your utility.',
  },
  equipment_config: {
    category: 'equipment_config',
    facility_type: 'brownfield',
    name: 'Equipment Configuration',
    description: 'Documentation of current equipment setup and specifications',
    file_types: ['PDF'],
    expected_fields: [
      'Equipment inventory list',
      'Power ratings (kW)',
      'Equipment age and condition',
      'Cooling systems',
      'Uninterruptible Power Supply (UPS) capacity',
    ],
    example_filename: 'equipment_config.pdf',
    guidance: 'Include details about servers, cooling systems, UPS, generators, and other major power-consuming equipment.',
  },

  // Buyer - Greenfield documents
  equipment_spec: {
    category: 'equipment_spec',
    facility_type: 'greenfield',
    name: 'Equipment Specifications',
    description: 'Planned equipment details for new data center builds (Schneider Electric framework)',
    file_types: ['PDF', 'Form submission'],
    expected_fields: [
      'Equipment types and quantities',
      'Total power rating (kW)',
      'Floor area (sq ft)',
      'Cooling system type and capacity',
      'Power density (W/sq ft)',
      'Expected IT load',
      'Redundancy requirements (N, N+1, 2N)',
    ],
    example_filename: 'equipment_specifications.pdf',
    guidance: 'This can be submitted via the greenfield equipment form or as supporting documentation (manufacturer spec sheets, design plans). Follow the Schneider Electric framework for data center capacity planning.',
  },

  // Seller - Carbon-free project documents (by technology)
  solar: {
    category: 'solar',
    seller_type: 'carbon_free',
    technology_type: 'solar',
    name: 'Solar Project Documentation',
    description: 'Technical specifications for solar energy projects',
    file_types: ['PDF'],
    expected_fields: [
      'Project capacity (MW)',
      'Location and coordinates',
      'Panel specifications',
      'Inverter details',
      'Expected capacity factor',
      'Interconnection status',
      'PPA terms (if applicable)',
    ],
    example_filename: 'solar_project_technical_spec.pdf',
    guidance: 'Include site assessment reports, equipment specifications, and interconnection agreements.',
  },
  wind: {
    category: 'wind',
    seller_type: 'carbon_free',
    technology_type: 'wind',
    name: 'Wind Project Documentation',
    description: 'Technical specifications for wind energy projects',
    file_types: ['PDF'],
    expected_fields: [
      'Project capacity (MW)',
      'Turbine specifications',
      'Hub height and rotor diameter',
      'Expected capacity factor',
      'Wind resource assessment',
      'Interconnection status',
    ],
    example_filename: 'wind_project_technical_spec.pdf',
    guidance: 'Include wind resource studies, turbine spec sheets, and interconnection details.',
  },
  nuclear: {
    category: 'nuclear',
    seller_type: 'carbon_free',
    technology_type: 'nuclear',
    name: 'Nuclear Project Documentation',
    description: 'Technical specifications for nuclear energy projects',
    file_types: ['PDF'],
    expected_fields: [
      'Reactor type and capacity (MW)',
      'Safety certifications',
      'Operational history',
      'Availability factor',
      'Fuel cycle details',
      'Regulatory approvals',
    ],
    example_filename: 'nuclear_project_spec.pdf',
    guidance: 'Include reactor specifications, safety documentation, and regulatory compliance records.',
  },
  green_hydrogen: {
    category: 'green_hydrogen',
    seller_type: 'carbon_free',
    technology_type: 'green_hydrogen',
    name: 'Green Hydrogen Project Documentation',
    description: 'Technical specifications for green hydrogen projects',
    file_types: ['PDF'],
    expected_fields: [
      'Production capacity (kg/day or MW)',
      'Electrolyzer type and efficiency',
      'Renewable energy source',
      'Storage capacity',
      'Fuel cell specifications (if applicable)',
    ],
    example_filename: 'green_hydrogen_project_spec.pdf',
    guidance: 'Include electrolyzer specifications, renewable energy integration details, and storage capabilities.',
  },
  battery: {
    category: 'battery',
    seller_type: 'carbon_free',
    technology_type: 'battery',
    name: 'Battery Storage Project Documentation',
    description: 'Technical specifications for battery energy storage systems',
    file_types: ['PDF'],
    expected_fields: [
      'Storage capacity (MWh)',
      'Power rating (MW)',
      'Battery chemistry',
      'Round-trip efficiency',
      'Cycle life',
      'Discharge duration',
    ],
    example_filename: 'battery_storage_spec.pdf',
    guidance: 'Include battery specifications, inverter details, and performance characteristics.',
  },

  // Seller - Utility contracts
  utility_contract_seller: {
    category: 'utility_contract',
    seller_type: 'utility',
    technology_type: 'utility_contract',
    name: 'Utility Contract',
    description: 'Grid power supply contracts from utility providers',
    file_types: ['PDF'],
    expected_fields: [
      'Contract term and duration',
      'Pricing structure',
      'Capacity commitment (MW)',
      'Energy mix (if available)',
      'Rate schedules',
      'Demand charges',
    ],
    example_filename: 'utility_supply_contract.pdf',
    guidance: 'Include all terms, pricing schedules, and capacity commitments. This represents general grid power supply.',
  },
};

// GET /api/example-documents - Get all example document templates
router.get('/', authenticate, async (req, res) => {
  try {
    const { facility_type, seller_type, category } = req.query;

    let filteredDocs = { ...EXAMPLE_DOCUMENTS };

    // Filter by facility_type for buyers
    if (facility_type) {
      filteredDocs = Object.fromEntries(
        Object.entries(filteredDocs).filter(([_, doc]) => doc.facility_type === facility_type)
      );
    }

    // Filter by seller_type for sellers
    if (seller_type) {
      filteredDocs = Object.fromEntries(
        Object.entries(filteredDocs).filter(([_, doc]) => doc.seller_type === seller_type)
      );
    }

    // Filter by specific category
    if (category) {
      const doc = EXAMPLE_DOCUMENTS[category];
      if (doc) {
        return res.json({ example: doc });
      }
      return res.status(404).json({ error: 'Example document not found for this category' });
    }

    res.json({ examples: filteredDocs });
  } catch (error) {
    console.error('Error fetching example documents:', error);
    res.status(500).json({ error: 'Failed to fetch example documents' });
  }
});

// GET /api/example-documents/:category - Get specific example document template
router.get('/:category', authenticate, async (req, res) => {
  try {
    const { category } = req.params;

    const doc = EXAMPLE_DOCUMENTS[category];
    if (!doc) {
      return res.status(404).json({ error: 'Example document not found' });
    }

    res.json({ example: doc });
  } catch (error) {
    console.error('Error fetching example document:', error);
    res.status(500).json({ error: 'Failed to fetch example document' });
  }
});

export default router;
