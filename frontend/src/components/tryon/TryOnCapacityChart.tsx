import {
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { getForecastCapacityForYear, type SiteLoadProfile, LOAD_PROFILES } from '../../data/loadProfile';
import {
  getCapacitySourcesForSites,
  getQualifiedCapacityMwCovered,
  monthsCoveredInYear
} from '../../data/linkedContracts';
import type { LinkedContract } from '../../data/linkedContracts';
import { r1 } from './utils';
import { OVERHEDGE_PATTERN_ID } from './types';

interface TryOnCapacityChartProps {
  effectiveCapacity: number;
  sites: string[];
  startYear: number;
  endYear: number;
  projectName: string;
  existingContracts?: LinkedContract[];
  // Proposed-deal term (from the save-form selectors). Used to prorate the
  // proposed capacity so a bilateral deal that doesn't run the full year shows
  // only its in-delivery share. Defaults to the full scope when omitted.
  termStartYear?: number;
  termStartMonth?: number;
  termEndYear?: number;
  termEndMonth?: number;
}

export function TryOnCapacityChart({
  effectiveCapacity,
  sites,
  startYear,
  endYear,
  projectName,
  existingContracts = [],
  termStartYear,
  termStartMonth = 1,
  termEndYear,
  termEndMonth = 12,
}: TryOnCapacityChartProps) {
  const tStartY = termStartYear ?? startYear;
  const tEndY = termEndYear ?? endYear;
  // Test console logging
  console.log('=== TRY ON CAPACITY CHART LOADED ===');
  
  // Debug input values
  console.log(`[CapacityChart] Input: effectiveCapacity=${effectiveCapacity}, sites=${JSON.stringify(sites)}, startYear=${startYear}, endYear=${endYear}, projectName=${projectName}`);
  
  // Calculate capacity data for each year
  const capacityData = [];
  let totalSiteCapacity = 0;
  let totalCoveredCapacity = 0;
  let totalUncoveredCapacity = 0;

  for (let year = startYear; year <= endYear; year++) {
    // Get total site capacity for this year
    let yearSiteCapacity = 0;
    for (const siteKey of sites) {
      const profile = LOAD_PROFILES.find(p => p.siteKey === siteKey);
      if (profile) {
        yearSiteCapacity += getForecastCapacityForYear(profile, year);
      }
    }

    // Get existing capacity from both CapacitySource and LDA-qualified LinkedContract capacity components
    const capacitySources = getCapacitySourcesForSites(sites);
    const contracts = existingContracts;
    
    const capacitySourceMw = capacitySources.reduce((sum, source) => sum + source.mwCovered, 0);
    
    // Get LDA for the first site (all sites in a try-on should be in the same LDA for capacity)
    const firstSiteProfile = { siteKey: sites[0] } as SiteLoadProfile;
    const loadLda = firstSiteProfile.lda || 'DOM'; // Default to DOM for Northern Virginia
    
    console.log(`[CapacityChart] Year ${year}: loadLda=${loadLda}, total contracts=${contracts.length}`);
    
    const contractCapacityMw = getQualifiedCapacityMwCovered(contracts, loadLda, year);
    const existingCapacity = capacitySourceMw + contractCapacityMw;

    console.log(`[CapacityChart] Year ${year}: capacitySourceMw=${capacitySourceMw}, contractCapacityMw=${contractCapacityMw}, existingCapacity=${existingCapacity}`);

    // Prorate the proposed deal by the share of this year it actually delivers.
    const proposedFrac = monthsCoveredInYear(year, tStartY, termStartMonth, tEndY, termEndMonth) / 12;
    const proposedCapacity = effectiveCapacity * proposedFrac;

    // Calculate coverage - simplified logic
    const totalCapacity = existingCapacity + proposedCapacity;
    // Above the zero line we only ever stack up to the requirement; existing is
    // counted first, then the proposed deal fills the remaining need.
    const coveredExisting = Math.min(existingCapacity, yearSiteCapacity);
    const actualProjectCapacity = Math.min(proposedCapacity, Math.max(0, yearSiteCapacity - existingCapacity));
    const uncovered = Math.max(0, yearSiteCapacity - existingCapacity - actualProjectCapacity);
    // Anything beyond the requirement is excess (over-procured) — charted below 0
    // with the same pattern as excess energy.
    const excess = Math.max(0, totalCapacity - yearSiteCapacity);
    const coveragePercent = yearSiteCapacity > 0 ? ((existingCapacity + actualProjectCapacity) / yearSiteCapacity) * 100 : 0;

    // Detailed debugging for Sterling
    if (sites.includes('sterling-hyperscale')) {
      console.log(`[CapacityChart] Year ${year} calculation: effectiveCapacity=${effectiveCapacity}, yearSiteCapacity=${yearSiteCapacity}, existingCapacity=${existingCapacity}, actualProjectCapacity=${actualProjectCapacity}, uncovered=${uncovered}`);
    }

    capacityData.push({
      year: year.toString(),
      siteCapacity: yearSiteCapacity || 0,
      existingCapacity: existingCapacity || 0,
      projectCapacity: actualProjectCapacity || 0,
      uncovered: uncovered || 0,
      coveragePercent: coveragePercent || 0,
      // For capacity tab style structure
      cap_uncovered: uncovered || 0,
      s_existing: coveredExisting || 0,
      s_tryon: actualProjectCapacity || 0,
      cap_excess: excess ? -excess : 0, // below the zero line
      _year: year,
    });

    totalSiteCapacity += yearSiteCapacity;
    totalCoveredCapacity += Math.min(totalCapacity, yearSiteCapacity); // Only count actual capacity needed
    totalUncoveredCapacity += uncovered;
  }

  const averageCoverage = totalSiteCapacity > 0 ? (totalCoveredCapacity / totalSiteCapacity) * 100 : 0;

  // Debug logging for chart data
  console.log('[CapacityChart] Final chart data:', capacityData);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Capacity Coverage</h3>
        <div className="text-xs text-slate-500">
          Average Coverage: {r1(averageCoverage)}%
        </div>
      </div>

      <ResponsiveContainer width="100%" height={250}>
        <ReBarChart data={capacityData} margin={{ top: 20, right: 30, left: 60, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis 
            dataKey="year" 
            tick={{ fontSize: 11 }}
            stroke="#64748b"
          />
          <YAxis 
            tick={{ fontSize: 11 }}
            stroke="#64748b"
            label={{ value: 'Capacity (MW)', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }}
          />
          <Tooltip
            formatter={(value: any, name: any) => {
              const numValue = Math.abs(Number(value) || 0);
              return [`${r1(numValue)} MW`, name];
            }}
            labelFormatter={(label) => `Year ${label}`}
            contentStyle={{ fontSize: 11 }}
          />
          <ReferenceLine y={0} stroke="#0f172a" strokeWidth={1.5} />
          {/* Existing capacity - blue base with wavy pattern like capacity tab */}
          <Bar
            dataKey="s_existing"
            stackId="cap"
            fill="#6366f1"
            shape={(props: any) => {
              const { x, y, width, height } = props;
              if (!width || !height || height <= 0) return null;
              return (
                <g>
                  <rect x={x} y={y} width={width} height={height} fill="#6366f1" />
                  <rect x={x} y={y} width={width} height={height} fill="url(#capacity-existing-wave-pattern)" stroke="#6366f1" strokeWidth={0.4} />
                </g>
              );
            }}
            name="Existing Capacity Contract"
            isAnimationActive={false}
          />

          {/* Try-on capacity - emerald background with energy-chart pattern overlay */}
          <Bar
            dataKey="s_tryon"
            stackId="cap"
            fill="#ecfdf5"
            stroke="#10b981"
            strokeWidth={0.4}
            shape={(props: any) => {
              const { x, y, width, height } = props;
              if (!width || !height || height <= 0) return null;
              return (
                <g>
                  <rect x={x} y={y} width={width} height={height} fill="#ecfdf5" />
                  <rect x={x} y={y} width={width} height={height} fill="url(#capacity-tryon-green-pattern)" stroke="#10b981" strokeWidth={0.4} />
                </g>
              );
            }}
            name="Proposed Capacity Contract"
            isAnimationActive={false}
          />

          {/* Capacity - total site capacity requirement */}
          <Bar
            dataKey="cap_uncovered"
            stackId="cap"
            fill="#6366f1"
            stroke="#6366f1"
            strokeWidth={0.4}
            radius={[3, 3, 0, 0]}
            name="Capacity"
            isAnimationActive={false}
          />

          {/* Excess (over-procured) capacity — below the zero line, same pattern as excess energy */}
          <Bar
            dataKey="cap_excess"
            stackId="cap"
            fill={`url(#${OVERHEDGE_PATTERN_ID})`}
            stroke="#b91c1c"
            strokeWidth={0.5}
            name="Excess Capacity"
            isAnimationActive={false}
          />
        </ReBarChart>
      </ResponsiveContainer>

      {/* Custom legend with pattern swatches like capacity tab */}
      <div className="flex flex-wrap gap-3 mt-4 text-xs">
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200">
          <span className="inline-block w-5 h-3" style={{ background: '#6366f1' }} />
          <span className="font-medium text-slate-700">Capacity</span>
        </div>
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200">
          <svg width="20" height="12">
            <rect width="20" height="12" fill="#6366f1" />
            <rect width="20" height="12" fill="url(#capacity-existing-wave-pattern)" stroke="#6366f1" strokeWidth="0.5" />
          </svg>
          <span className="font-medium text-slate-700">Existing Capacity Contract</span>
        </div>
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200">
          <svg width="20" height="12">
            <rect width="20" height="12" fill="#ecfdf5" />
            <rect width="20" height="12" fill="url(#capacity-tryon-green-pattern)" stroke="#10b981" strokeWidth="0.5" />
          </svg>
          <span className="font-medium text-slate-700">Proposed Capacity Contract</span>
        </div>
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200">
          <svg width="20" height="12">
            <rect width="20" height="12" fill={`url(#${OVERHEDGE_PATTERN_ID})`} stroke="#b91c1c" strokeWidth="0.5" />
          </svg>
          <span className="font-medium text-slate-700">Excess Capacity (below 0)</span>
        </div>
      </div>

      {/* Year-by-year breakdown */}
      <div className="mt-4 space-y-2">
        <h4 className="text-xs font-semibold text-slate-700">Year-by-Year Coverage</h4>
        <div className="grid grid-cols-3 gap-2">
          {capacityData.map((data) => (
            <div key={data.year} className="bg-slate-50 rounded p-2 text-xs">
              <div className="font-medium text-slate-900">{data.year}</div>
              <div className="text-slate-600">
                {r1(data.coveragePercent)}% covered
              </div>
              <div className="text-slate-500">
                {r1(data.siteCapacity)} MW total
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
