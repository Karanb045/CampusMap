// d:\project\ProjectSE\src\store\mapStore.js
import { create } from 'zustand';

const useMapStore = create((set, get) => ({
  selectedBuilding: null,
  selectedFloor: 0,
  selectedRoom: null,
  activeFilter: 'all',
  searchQuery: '',
  routeNodes: [],
  userLocation: null,
  flyTarget: null,
  isPanelOpen: false,
  directionsOpen: false,
  indoorPathOpen: false,
  currentCheckpointFloor: null,
  buildings: [],
  rooms: [],
  
  // Helper method to get current state
  getState: () => get(),
  
  // Helper method to update state
  setState: (updates) => set(updates)
}));

export default useMapStore;

