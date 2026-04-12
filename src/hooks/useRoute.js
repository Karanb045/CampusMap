// src/hooks/useRoute.js
// Dijkstra routing using campusGraph.js
// Building IDs in campusGraph match Firestore IDs exactly — no mapping needed.
// Returns routePath [[lat,lng],...] ready for Leaflet Polyline.

import { useState, useCallback } from 'react';
import campusGraph from '../data/campusGraph.js';

// ─── Dijkstra ─────────────────────────────────────────────────────────────────
function dijkstra(startId, endId) {
  const { nodes, edges } = campusGraph;

  if (!nodes[startId]) { console.warn('useRoute: start node not found:', startId); return null; }
  if (!nodes[endId])   { console.warn('useRoute: end node not found:',   endId);   return null; }
  if (startId === endId) return { coordinates: [nodes[startId]], nodeIds: [startId], totalDistance: 0 };

  const dist    = {};
  const prev    = {};
  const visited = new Set();
  const allIds  = Object.keys(nodes);

  for (const id of allIds) { dist[id] = Infinity; prev[id] = null; }
  dist[startId] = 0;

  const remaining = new Set(allIds);

  while (remaining.size > 0) {
    // Nearest unvisited node
    let u = null;
    for (const id of remaining) {
      if (u === null || dist[id] < dist[u]) u = id;
    }
    if (!u || dist[u] === Infinity) break;
    if (u === endId) break;

    remaining.delete(u);
    visited.add(u);

    for (const [nbId, weight] of (edges[u] ?? [])) {
      if (visited.has(nbId)) continue;
      const alt = dist[u] + weight;
      if (alt < dist[nbId]) {
        dist[nbId] = alt;
        prev[nbId] = u;
      }
    }
  }

  if (dist[endId] === Infinity) return null;

  // Reconstruct path node IDs
  const nodeIds = [];
  let cur = endId;
  while (cur !== null) { nodeIds.unshift(cur); cur = prev[cur]; }

  return {
    nodeIds,
    coordinates:   nodeIds.map(id => nodes[id]),  // [[lat,lng],...]
    totalDistance: dist[endId],                    // metres (graph weights)
  };
}

// ─── Nearest junction/gate to a user lat/lng ─────────────────────────────────
// Only routes through junctions and main_gate — buildings are destinations only.
function nearestEntryNode(lat, lng) {
  const entryIds = Object.keys(campusGraph.nodes).filter(
    id => id.startsWith('junction') || id === 'main_gate'
  );

  let best     = 'main_gate';
  let bestDist = Infinity;

  for (const id of entryIds) {
    const [nLat, nLng] = campusGraph.nodes[id];
    const d = Math.hypot(lat - nLat, lng - nLng);
    if (d < bestDist) { bestDist = d; best = id; }
  }

  return best;
}

function nearestGraphNode(lat, lng) {
  const ids = Object.keys(campusGraph.nodes);
  let best = null;
  let bestDist = Infinity;

  for (const id of ids) {
    const [nLat, nLng] = campusGraph.nodes[id];
    const d = Math.hypot(lat - nLat, lng - nLng);
    if (d < bestDist) {
      bestDist = d;
      best = id;
    }
  }

  return best;
}

// ─── Format distance for display ─────────────────────────────────────────────
function formatDistance(metres) {
  if (!metres || metres <= 0) return '';
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export default function useRoute() {
  const [routePath,     setRoutePath]     = useState(null);  // [[lat,lng],...] for Polyline
  const [routeInfo,     setRouteInfo]     = useState(null);  // { totalDistance, distanceLabel, nodeIds }
  const [routeError,    setRouteError]    = useState('');

  const calculateRoute = useCallback((userLocation, destination) => {
    setRouteError('');

    if (!userLocation?.lat || !userLocation?.lng) {
      setRouteError('Enable location to get directions.');
      return;
    }
    if (!destination) {
      setRouteError('No destination specified.');
      return;
    }

    const destinationId =
      typeof destination === 'string'
        ? destination
        : destination?.id;

    const destinationCoords =
      destination && typeof destination === 'object' &&
      typeof destination.lat === 'number' && typeof destination.lng === 'number'
        ? [destination.lat, destination.lng]
        : null;

    let endNodeId = destinationId && campusGraph.nodes[destinationId] ? destinationId : null;
    let finalCoords = null;

    // If destination is not a graph node, route to nearest graph node and then to destination.
    if (!endNodeId && destinationCoords) {
      endNodeId = nearestGraphNode(destinationCoords[0], destinationCoords[1]);
      finalCoords = destinationCoords;
    }

    if (!endNodeId) {
      setRouteError('Destination is not connected to routing graph.');
      setRoutePath(null);
      setRouteInfo(null);
      return;
    }

    const startNodeId = nearestEntryNode(userLocation.lat, userLocation.lng);
    const result      = dijkstra(startNodeId, endNodeId);

    if (!result) {
      setRouteError(`No route found to ${destinationId || 'destination'}.`);
      setRoutePath(null);
      setRouteInfo(null);
      return;
    }

    // Prepend actual user position so line starts from them, not from nearest junction
    const fullPath = [
      [userLocation.lat, userLocation.lng],
      ...result.coordinates,
    ];

    if (finalCoords) {
      const last = fullPath[fullPath.length - 1];
      const isSameAsLast = Array.isArray(last) && last[0] === finalCoords[0] && last[1] === finalCoords[1];
      if (!isSameAsLast) fullPath.push(finalCoords);
    }

    setRoutePath(fullPath);
    setRouteInfo({
      nodeIds:       result.nodeIds,
      totalDistance: result.totalDistance,
      distanceLabel: formatDistance(result.totalDistance),
    });
  }, []);

  const clearRoute = useCallback(() => {
    setRoutePath(null);
    setRouteInfo(null);
    setRouteError('');
  }, []);

  return { routePath, routeInfo, routeError, calculateRoute, clearRoute };
}