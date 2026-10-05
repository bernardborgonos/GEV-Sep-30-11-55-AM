import test from 'node:test';
import assert from 'node:assert/strict';
import urlIntelligenceLayer, {
  ingestFilesSimultaneously,
  getActiveDatasets,
  isMultiDatasetMode,
  removeDataset,
  clearAllDatasets,
  setTrajectoryScrubberTime,
} from './urlIntelligence.js';

test('Simultaneous Ingestion: Parses and populates multiple datasets into urlIntelligenceLayer', async () => {
  const gpxSample = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GPS-Logger">
  <trk>
    <name>Delivery Fleet Bravo</name>
    <trkseg>
      <trkpt lat="14.5995" lon="120.9842">
        <time>2026-03-12T08:00:00Z</time>
      </trkpt>
      <trkpt lat="14.6010" lon="120.9855">
        <time>2026-03-12T08:05:00Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

  const csvSample = `Name,Latitude,Longitude,Category,Address
Manila Hub Alpha,14.5995,120.9842,Logistics Hub,Port Area Manila
Clark Air Logistics,15.1850,120.5590,Airport,Clark Pampanga`;

  const files = [
    { name: 'fleet_bravo.gpx', content: gpxSample },
    { name: 'customs_hubs.csv', content: csvSample },
  ];

  const result = await ingestFilesSimultaneously(files);

  assert.ok(result, 'Result should be defined');
  assert.equal(result.datasets.length, 2, 'Should have 2 datasets');
  assert.equal(isMultiDatasetMode(), true, 'Should be in multi-dataset mode');

  const activeDatasets = getActiveDatasets();
  assert.equal(activeDatasets.length, 2, 'Active datasets count matches');

  // Verify chromatic colors are assigned
  assert.ok(activeDatasets[0].color, 'Dataset 1 has color');
  assert.ok(activeDatasets[1].color, 'Dataset 2 has color');
  assert.notEqual(activeDatasets[0].color, activeDatasets[1].color, 'Datasets have distinct chromatic colors');

  // Verify combined points and trajectories
  const points = urlIntelligenceLayer.getPoints();
  const csvPoints = points.filter((p) => p.datasetName === 'customs_hubs.csv');
  assert.ok(csvPoints.length >= 2, 'Has at least 2 points from CSV');

  const trajectories = urlIntelligenceLayer.getTrajectoryList();
  assert.ok(trajectories.length >= 1, 'Has at least 1 trajectory from GPX');
  assert.equal(trajectories[0].datasetName, 'fleet_bravo.gpx');

  // Test dataset removal
  const firstId = activeDatasets[0].datasetId;
  removeDataset(firstId);
  assert.equal(getActiveDatasets().length, 1, 'Should have 1 dataset remaining');

  // Test clear all
  clearAllDatasets();
  assert.equal(getActiveDatasets().length, 0, 'Should have 0 datasets remaining');
  assert.equal(isMultiDatasetMode(), false, 'Multi dataset mode should be false');
});
