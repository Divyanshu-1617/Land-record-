import React, { useState, useEffect, useRef } from 'react';
import { Icons } from './Icons';
import { analyzeLandData } from '../services/geminiService';
import { BarChart, Bar, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Fix Leaflet icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const MAX_SELECTION_TILES = 12;
const PIXEL_SAMPLE_STEP = 6;

// Coordinates for presets
const PRESETS = [
  { 
    id: 1, 
    name: 'Agricultural Zone', 
    url: 'https://images.unsplash.com/photo-1625246333195-58405079d378?q=80&w=1000&auto=format&fit=crop',
    coords: [36.7378, -119.7871],
    bounds: [[36.72, -119.80], [36.75, -119.77]]
  },
  { 
    id: 2, 
    name: 'Urban Reserve', 
    url: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?q=80&w=1000&auto=format&fit=crop',
    coords: [34.0522, -118.2437],
  },
  { 
    id: 3, 
    name: 'Forest Reserve', 
    url: 'https://images.unsplash.com/photo-1448375240586-dfd8d3f5d891?q=80&w=1000&auto=format&fit=crop',
    coords: [44.0521, -121.3153],
    bounds: [[44.04, -121.33], [44.06, -121.30]]
  },
];

const MAP_LAYERS = [
  { id: 'OSM', name: 'OpenStreetMap', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors' },
  { id: 'SAT', name: 'Satellite (Esri)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community' }
];

const STAT_LAYERS = [
  { id: 'RGB', name: 'Standard', colors: ['#8884d8', '#83a6ed', '#8dd1e1', '#82ca9d', '#a4de6c'] },
  { id: 'NDVI', name: 'Vegetation Index', colors: ['#d7191c', '#fdae61', '#ffffbf', '#a6d96a', '#1a9641'] },
];

const formatCoord = (coords) => {
  if (!coords) return 'NA';
  return `${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`;
};

export const MapExplorer = () => {
  const [selectedPreset, setSelectedPreset] = useState(PRESETS[0]);
  const [activeBaseLayer, setActiveBaseLayer] = useState('SAT');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [computedStats, setComputedStats] = useState(null);
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionEnd, setSelectionEnd] = useState(null);
  const [selectedBounds, setSelectedBounds] = useState(null);
  const [landClassification, setLandClassification] = useState(null);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const overlayRef = useRef(null);
  const selectionRectRef = useRef(null);
  const fileInputRef = useRef(null);
  const processedImageRef = useRef(null);
  const selectionStartRef = useRef(null);
  const selectionEndRef = useRef(null);

  const updateSelectionStart = (coords) => {
    selectionStartRef.current = coords;
    setSelectionStart(coords);
  };

  const updateSelectionEnd = (coords) => {
    selectionEndRef.current = coords;
    setSelectionEnd(coords);
  };

  const clearSelectionRectangle = () => {
    if (selectionRectRef.current) {
      selectionRectRef.current.remove();
      selectionRectRef.current = null;
    }
  };

  const resetSelectionState = () => {
    updateSelectionStart(null);
    updateSelectionEnd(null);
    setSelectedBounds(null);
    setComputedStats(null);
    setLandClassification(null);
    processedImageRef.current = null;
    clearSelectionRectangle();
  };

  const toBoundsPayload = (bounds) => {
    const nw = bounds.getNorthWest();
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const se = bounds.getSouthEast();
    const center = bounds.getCenter();

    return {
      northWest: [nw.lat, nw.lng],
      northEast: [ne.lat, ne.lng],
      southWest: [sw.lat, sw.lng],
      southEast: [se.lat, se.lng],
      center: [center.lat, center.lng]
    };
  };

  const classifyLandByNdvi = (stats) => {
    if (!stats?.histogram?.length) return null;

    const total = stats.histogram.reduce((acc, entry) => acc + entry.count, 0) || 1;
    const highVegetation = ((stats.histogram[7].count + stats.histogram[8].count + stats.histogram[9].count) / total) * 100;
    const moderateVegetation = ((stats.histogram[6].count + stats.histogram[7].count) / total) * 100;
    const negativeShare = ((stats.histogram[0].count + stats.histogram[1].count + stats.histogram[2].count + stats.histogram[3].count + stats.histogram[4].count) / total) * 100;

    if (stats.mean >= 0.45 && highVegetation >= 35) {
      return {
        label: 'Forest / Dense Vegetation',
        confidence: Math.min(95, Math.round(60 + highVegetation * 0.6)),
        reason: 'High NDVI concentration indicates dense, healthy vegetation.'
      };
    }

    if (stats.mean >= 0.25 && (highVegetation + moderateVegetation) >= 40) {
      return {
        label: 'Agriculture / Cropland',
        confidence: Math.min(92, Math.round(55 + (highVegetation + moderateVegetation) * 0.5)),
        reason: 'Moderate-to-high NDVI suggests managed vegetation and crop cover.'
      };
    }

    if (stats.mean >= 0.08) {
      return {
        label: 'Grassland / Shrubland',
        confidence: 72,
        reason: 'NDVI indicates sparse to medium vegetation cover.'
      };
    }

    if (stats.mean < -0.08 && negativeShare > 55) {
      return {
        label: 'Water / Wet Surface',
        confidence: 78,
        reason: 'Predominantly negative NDVI values are typical of water or wet surfaces.'
      };
    }

    return {
      label: 'Barren / Built-up',
      confidence: 70,
      reason: 'Low NDVI indicates weak vegetation response, usually soil, built-up land, or dry surfaces.'
    };
  };

  const calculateStats = (values) => {
    if (!values.length) return { min: 0, max: 0, mean: 0, stdDev: 0, histogram: [] };

    let min = 1;
    let max = -1;
    let sum = 0;
    for (const value of values) {
      if (value < min) min = value;
      if (value > max) max = value;
      sum += value;
    }

    const mean = sum / values.length;
    let sqDiff = 0;
    for (const value of values) {
      sqDiff += (value - mean) ** 2;
    }
    const stdDev = Math.sqrt(sqDiff / values.length);

    const bins = new Array(10).fill(0);
    for (const value of values) {
      const binIdx = Math.min(9, Math.floor(((value + 1) / 2) * 10));
      bins[binIdx] += 1;
    }

    const histogram = bins.map((count, index) => ({
      bin: (-1 + index * 0.2).toFixed(1),
      count
    }));

    return { min, max, mean, stdDev, histogram };
  };

  const loadImage = (url) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'Anonymous';
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });

  const extractNdviValuesFromImage = (image) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    ctx.drawImage(image, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const values = [];

    for (let y = 0; y < height; y += PIXEL_SAMPLE_STEP) {
      for (let x = 0; x < width; x += PIXEL_SAMPLE_STEP) {
        const idx = (y * width + x) * 4;
        const red = data[idx];
        const green = data[idx + 1];
        const ndviProxy = (green - red) / (green + red + 0.001);
        values.push(Math.max(-1, Math.min(1, ndviProxy)));
      }
    }

    return values;
  };

  const getTileCoordinatesForBounds = (bounds, zoom) => {
    const map = mapInstanceRef.current;
    const tileLayer = tileLayerRef.current;
    if (!map || !tileLayer) return [];

    const tileSize = tileLayer.getTileSize();
    const nwPoint = map.project(bounds.getNorthWest(), zoom);
    const sePoint = map.project(bounds.getSouthEast(), zoom);

    const xMin = Math.floor(Math.min(nwPoint.x, sePoint.x) / tileSize.x);
    const xMax = Math.floor(Math.max(nwPoint.x, sePoint.x) / tileSize.x);
    const yMin = Math.floor(Math.min(nwPoint.y, sePoint.y) / tileSize.y);
    const yMax = Math.floor(Math.max(nwPoint.y, sePoint.y) / tileSize.y);

    const coords = [];
    for (let x = xMin; x <= xMax; x += 1) {
      for (let y = yMin; y <= yMax; y += 1) {
        coords.push({ x, y, z: zoom });
      }
    }
    return coords;
  };

  const limitTilesForProcessing = (tileCoords) => {
    if (tileCoords.length <= MAX_SELECTION_TILES) return tileCoords;
    const stride = Math.ceil(tileCoords.length / MAX_SELECTION_TILES);
    return tileCoords.filter((_, idx) => idx % stride === 0).slice(0, MAX_SELECTION_TILES);
  };

  const processSelectionNdvi = async (bounds) => {
    const tileLayer = tileLayerRef.current;
    const map = mapInstanceRef.current;
    if (!tileLayer || !map) return;

    setIsProcessing(true);
    setComputedStats(null);
    setLandClassification(null);

    try {
      const zoom = Math.max(6, Math.min(map.getZoom(), 16));
      const allTiles = getTileCoordinatesForBounds(bounds, zoom);
      const tileCoords = limitTilesForProcessing(allTiles);
      if (!tileCoords.length) {
        throw new Error('No imagery tiles found for selected area.');
      }

      const ndviValues = [];
      for (const coords of tileCoords) {
        const tileUrl = tileLayer.getTileUrl(coords);
        const image = await loadImage(tileUrl);
        processedImageRef.current = image;
        ndviValues.push(...extractNdviValuesFromImage(image));
      }

      if (!ndviValues.length) {
        throw new Error('No NDVI samples extracted from selected area.');
      }

      const stats = calculateStats(ndviValues);
      setComputedStats(stats);
      setLandClassification(classifyLandByNdvi(stats));
    } catch (error) {
      console.warn('Area NDVI processing failed.', error);
      setComputedStats(null);
      setLandClassification({
        label: 'Unavailable',
        confidence: 0,
        reason: 'Unable to process NDVI for this area. Try SAT layer or a smaller selection.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMapClick = (event) => {
    if (!event?.latlng || isProcessing) return;

    const clickedPoint = [event.latlng.lat, event.latlng.lng];
    setResult(null);

    if (!selectionStartRef.current || selectionEndRef.current) {
      updateSelectionStart(clickedPoint);
      updateSelectionEnd(null);
      setSelectedBounds(null);
      setComputedStats(null);
      setLandClassification(null);
      clearSelectionRectangle();
      return;
    }

    const start = selectionStartRef.current;
    const end = clickedPoint;

    updateSelectionEnd(end);
    const bounds = L.latLngBounds(
      L.latLng(start[0], start[1]),
      L.latLng(end[0], end[1])
    );

    setSelectedBounds(toBoundsPayload(bounds));
    clearSelectionRectangle();
    if (mapInstanceRef.current) {
      selectionRectRef.current = L.rectangle(bounds, {
        color: '#22c55e',
        weight: 2,
        fillColor: '#22c55e',
        fillOpacity: 0.15
      }).addTo(mapInstanceRef.current);
    }

    void processSelectionNdvi(bounds);
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current).setView(selectedPreset.coords, 13);
    const layerConfig = MAP_LAYERS.find((layer) => layer.id === activeBaseLayer) || MAP_LAYERS[1];
    tileLayerRef.current = L.tileLayer(layerConfig.url, {
      attribution: layerConfig.attribution,
      maxZoom: 19
    }).addTo(map);

    mapInstanceRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 100);

    loadPreset(PRESETS[0], map);
    map.on('click', handleMapClick);

    return () => {
      map.off('click', handleMapClick);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle Base Layer Change
  useEffect(() => {
    if (!tileLayerRef.current) return;
    const layerConfig = MAP_LAYERS.find((layer) => layer.id === activeBaseLayer);
    if (layerConfig) {
      tileLayerRef.current.setUrl(layerConfig.url);
    }
  }, [activeBaseLayer]);

  const loadPreset = (preset, map = mapInstanceRef.current) => {
    if (!map) return;

    setSelectedPreset(preset);
    setResult(null);
    resetSelectionState();

    map.flyTo(preset.coords, 14, { duration: 1.5 });

    if (overlayRef.current) {
      overlayRef.current.remove();
      overlayRef.current = null;
    }

    if (preset.bounds) {
      overlayRef.current = L.imageOverlay(preset.url, preset.bounds, {
        opacity: 0.9,
        interactive: true
      }).addTo(map);
    }
  };

  const handleFileUpload = (event) => {
    if (event.target.files?.[0]) {
      const file = event.target.files[0];
      const url = URL.createObjectURL(file);
      const newPreset = {
        id: 999,
        name: 'Uploaded Parcel',
        url,
        coords: [34.05, -118.25],
        bounds: [[34.04, -118.26], [34.06, -118.22]]
      };
      loadPreset(newPreset);
    }
  };

  const handleAnalyze = async () => {
    if (!computedStats || !processedImageRef.current) return;
    setIsProcessing(true);

    const statsToUse = { NDVI: computedStats };
    const locationPrompt = selectedBounds
      ? `Analyze land for the selected rectangular parcel with corners NW ${formatCoord(selectedBounds.northWest)} and SE ${formatCoord(selectedBounds.southEast)}.`
      : `Analyze the land parcel located at ${selectedPreset.coords.join(', ')}.`;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = processedImageRef.current.width;
      canvas.height = processedImageRef.current.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(processedImageRef.current, 0, 0);
      const base64 = canvas.toDataURL('image/jpeg').split(',')[1];

      const analysis = await analyzeLandData(base64, locationPrompt, statsToUse);
      setResult(analysis);
    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const activeCoords = selectedBounds?.center || selectedPreset.coords;
  const selectionStatus = selectionStart && !selectionEnd
    ? 'Corner A selected. Click opposite corner to complete diagonal.'
    : selectedBounds
      ? 'Area selected. NDVI calculated from selected rectangle.'
      : 'Click map to select first corner of area.';

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col md:flex-row bg-slate-50 overflow-hidden">
      <div className="w-full md:w-80 flex flex-col bg-white border-r border-slate-200 z-20 shadow-xl overflow-y-auto shrink-0">
        <div className="p-5 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 flex items-center mb-4">
            <Icons.Map className="w-5 h-5 mr-2 text-brand-600" />
            Map Inspector
          </h2>

          <div className="mb-5 p-3 rounded-lg border border-brand-100 bg-brand-50/50">
            <p className="text-xs font-semibold text-brand-700 mb-1">Area Selection (2 clicks)</p>
            <p className="text-[11px] text-slate-600 mb-2">{selectionStatus}</p>
            <p className="text-[11px] text-slate-600">Point A: {formatCoord(selectionStart)}</p>
            <p className="text-[11px] text-slate-600">Point B: {formatCoord(selectionEnd)}</p>
            {selectedBounds && (
              <p className="text-[11px] text-slate-600 mt-1">
                Diagonal NW-SE: {formatCoord(selectedBounds.northWest)} to {formatCoord(selectedBounds.southEast)}
              </p>
            )}
            <button
              type="button"
              onClick={resetSelectionState}
              className="mt-3 w-full py-2 text-xs rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100 transition-all"
            >
              Clear Selection
            </button>
          </div>

          <div className="mb-6">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Base Map</p>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              {MAP_LAYERS.map((layer) => (
                <button
                  key={layer.id}
                  onClick={() => setActiveBaseLayer(layer.id)}
                  className={`flex-1 py-1 px-3 text-xs font-medium rounded-md transition-all ${
                    activeBaseLayer === layer.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {layer.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 mb-6">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Jump to Region</p>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => loadPreset(preset)}
                  className={`text-xs p-2 rounded border text-left transition-all ${
                    selectedPreset.id === preset.id
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs p-2 rounded border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50 flex items-center justify-center"
              >
                <Icons.Upload className="w-3 h-3 mr-1" /> Overlay
              </button>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
            </div>
          </div>

          {landClassification && (
            <div className="mb-6 p-3 rounded-lg border border-emerald-100 bg-emerald-50/60">
              <p className="text-xs font-semibold text-emerald-800">Land Type</p>
              <p className="text-sm font-semibold text-slate-800 mt-1">{landClassification.label}</p>
              <p className="text-[11px] text-slate-600 mt-1">{landClassification.reason}</p>
              {landClassification.confidence > 0 && (
                <p className="text-[11px] text-slate-500 mt-1">Confidence: {landClassification.confidence}%</p>
              )}
            </div>
          )}

          {computedStats && (
            <div className="mb-6 animate-fade-in">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">NDVI Distribution</p>
                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-600">Selection-based</span>
              </div>
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={computedStats.histogram}>
                    <Tooltip
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{ fontSize: '12px', borderRadius: '4px', border: 'none', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}
                    />
                    <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                      {computedStats.histogram.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={STAT_LAYERS[1].colors[index % 5]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 text-[11px] text-slate-600">
                <span>Mean: {computedStats.mean.toFixed(3)}</span>
                <span>StdDev: {computedStats.stdDev.toFixed(3)}</span>
              </div>
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={isProcessing || !computedStats}
            className="w-full py-3 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white rounded-xl shadow-lg font-semibold flex items-center justify-center transition-all disabled:opacity-70 disabled:grayscale"
          >
            {isProcessing ? (
              <><Icons.Spinner className="w-5 h-5 mr-2 animate-spin" /> Processing NDVI...</>
            ) : (
              <><Icons.AI className="w-5 h-5 mr-2" /> AI Verification</>
            )}
          </button>
        </div>

        {result && (
          <div className="p-5 bg-slate-50 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-800">Verification Report</h3>
              <div className="px-2 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded uppercase">Verified</div>
            </div>

            <div className="mb-4 text-sm text-slate-600 bg-white p-3 rounded-lg border border-slate-200 shadow-sm leading-relaxed">
              {result.summary}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white p-3 rounded border border-slate-200">
                <div className="text-xs text-slate-500">Land Use</div>
                <div className="font-semibold text-slate-800">{result.landUse}</div>
              </div>
              <div className="bg-white p-3 rounded border border-slate-200">
                <div className="text-xs text-slate-500">Score</div>
                <div className="font-semibold text-brand-600">{result.suitabilityScore}/100</div>
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500 mb-2">Identified Risks</div>
              <div className="flex flex-wrap gap-2">
                {result.risks.map((risk, idx) => (
                  <span key={idx} className="text-xs px-2 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded flex items-center">
                    <Icons.Alert className="w-3 h-3 mr-1" /> {risk}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 relative bg-slate-900 overflow-hidden">
        <div id="map-container" ref={mapContainerRef} className="w-full h-full" />
        <div className="absolute bottom-6 left-6 z-[400] bg-white/90 backdrop-blur p-3 rounded-lg shadow-xl border border-white/20">
          <div className="text-xs font-bold text-slate-700 mb-2">Active Region</div>
          <div className="flex items-center gap-2">
            <Icons.Map className="w-4 h-4 text-brand-600" />
            <span className="text-xs text-slate-600">
              {selectedBounds ? 'Selected Area' : selectedPreset.name}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {activeCoords[0].toFixed(2)}, {activeCoords[1].toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
