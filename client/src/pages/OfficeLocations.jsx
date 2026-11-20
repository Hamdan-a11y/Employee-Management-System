import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Building2,
  ShieldCheck,
  Plus,
  Edit2,
  Trash2,
  Power,
  RotateCcw,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Navigation,
  Crosshair,
  Filter,
  Calendar,
  Users,
  Check,
  X,
  AlertCircle,
  Info
} from 'lucide-react';
import './OfficeLocations.css';

// SVG HTML markers for custom Leaflet DivIcons to ensure clean styling and avoid asset bundling issues
const createDivIcon = (color, label = '', isOffice = false) => {
  return L.divIcon({
    className: 'custom-leaflet-icon',
    html: `
      <div class="geo-marker ${isOffice ? 'geo-marker-office' : 'geo-marker-punch'}" style="background-color: ${color}">
        ${
          isOffice
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M9 9h1"/><path d="M9 13h1"/><path d="M9 17h1"/><path d="M14 9h1"/><path d="M14 13h1"/><path d="M14 17h1"/></svg>'
            : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>'
        }
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  });
};

const OfficeLocations = () => {
  const { user, isAdmin, isHR, isDeptManager, isEmployee } = useAuth();
  const { success, error: notifyError } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();

  const canManageOffices = Boolean(isAdmin || isHR);
  const canManageExemptions = Boolean(isAdmin || isHR);

  // Tab: 'map' | 'offices' | 'exemptions'
  const defaultTab = canManageOffices ? 'offices' : 'map';
  const activeTab = searchParams.get('tab') || defaultTab;

  const handleTabChange = (tabName) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabName);
    setSearchParams(next, { replace: true });
  };

  // Common State
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);

  // ==========================================
  // 1. OFFICE LOCATIONS TAB STATE
  // ==========================================
  const [offices, setOffices] = useState([]);
  const [loadingOffices, setLoadingOffices] = useState(true);
  const [officeSearch, setOfficeSearch] = useState('');
  const [isOfficeModalOpen, setIsOfficeModalOpen] = useState(false);
  const [editingOfficeId, setEditingOfficeId] = useState(null);
  const [savingOffice, setSavingOffice] = useState(false);
  const [officeFormError, setOfficeFormError] = useState('');

  const [officeForm, setOfficeForm] = useState({
    name: '',
    address: '',
    latitude: 37.7749,
    longitude: -122.4194,
    allowed_radius: 100,
    is_active: true
  });

  // Modal Map Ref and Instance
  const modalMapContainerRef = useRef(null);
  const modalMapInstanceRef = useRef(null);
  const modalMarkerRef = useRef(null);
  const modalCircleRef = useRef(null);

  // ==========================================
  // 2. ATTENDANCE MAP TAB STATE
  // ==========================================
  const [mapDate, setMapDate] = useState(new Date().toISOString().split('T')[0]);
  const [mapDept, setMapDept] = useState('all');
  const [mapEmployee, setMapEmployee] = useState('all');
  const [mapStatus, setMapStatus] = useState('all');
  const [mapData, setMapData] = useState({ summary: {}, punches: [], offices: [] });
  const [loadingMapData, setLoadingMapData] = useState(false);

  // Live Map Container Ref and Instance
  const mainMapContainerRef = useRef(null);
  const mainMapInstanceRef = useRef(null);
  const mainMapLayerGroupRef = useRef(null);

  // ==========================================
  // 3. LOCATION EXEMPTIONS TAB STATE
  // ==========================================
  const [exemptions, setExemptions] = useState([]);
  const [loadingExemptions, setLoadingExemptions] = useState(false);
  const [isExemptionModalOpen, setIsExemptionModalOpen] = useState(false);
  const [savingExemption, setSavingExemption] = useState(false);
  const [exemptionFormError, setExemptionFormError] = useState('');
  const [exemptionTargetType, setExemptionTargetType] = useState('employee'); // 'employee' | 'department'

  const [exemptionForm, setExemptionForm] = useState({
    employee_id: '',
    department_id: '',
    reason: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: ''
  });

  // Load Departments and Employees lookup
  useEffect(() => {
    api.get('/departments')
      .then((res) => setDepartments(res.data || []))
      .catch(() => {});

    if (canManageOffices || canManageExemptions || isDeptManager) {
      api.get('/employees', { params: { limit: 500 } })
        .then((res) => setEmployees(res.data.employees || []))
        .catch(() => {});
    }
  }, [canManageOffices, canManageExemptions, isDeptManager]);

  // ==========================================
  // FETCH OFFICES
  // ==========================================
  const fetchOffices = useCallback(async () => {
    try {
      setLoadingOffices(true);
      const res = await api.get('/offices');
      setOffices(res.data.offices || []);
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to load office locations.');
    } finally {
      setLoadingOffices(false);
    }
  }, [notifyError]);

  useEffect(() => {
    if (activeTab === 'offices') {
      fetchOffices();
    }
  }, [activeTab, fetchOffices]);

  // ==========================================
  // FETCH EXEMPTIONS
  // ==========================================
  const fetchExemptions = useCallback(async () => {
    try {
      setLoadingExemptions(true);
      const res = await api.get('/offices/exemptions/list');
      setExemptions(res.data.exemptions || []);
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to load location exemptions.');
    } finally {
      setLoadingExemptions(false);
    }
  }, [notifyError]);

  useEffect(() => {
    if (activeTab === 'exemptions' && canManageExemptions) {
      fetchExemptions();
    }
  }, [activeTab, canManageExemptions, fetchExemptions]);

  // ==========================================
  // FETCH ATTENDANCE MAP DATA
  // ==========================================
  const fetchMapData = useCallback(async () => {
    try {
      setLoadingMapData(true);
      const params = { date: mapDate };
      if (mapDept !== 'all') params.department_id = mapDept;
      if (mapEmployee !== 'all') params.employee_id = mapEmployee;
      if (mapStatus !== 'all') params.status = mapStatus;

      const res = await api.get('/offices/attendance-map', { params });
      setMapData(res.data || { summary: {}, punches: [], offices: [] });
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to load attendance map data.');
    } finally {
      setLoadingMapData(false);
    }
  }, [mapDate, mapDept, mapEmployee, mapStatus, notifyError]);

  useEffect(() => {
    if (activeTab === 'map') {
      fetchMapData();
    }
  }, [activeTab, fetchMapData]);

  // ==========================================
  // RENDER / UPDATE MAIN LEAFLET MAP
  // ==========================================
  useEffect(() => {
    if (activeTab !== 'map' || !mainMapContainerRef.current) return;

    if (!mainMapInstanceRef.current) {
      // Default initial view: San Francisco Bay Area or center of country
      const map = L.map(mainMapContainerRef.current, {
        center: [37.7749, -122.4194],
        zoom: 12,
        zoomControl: true
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);

      mainMapLayerGroupRef.current = L.layerGroup().addTo(map);
      mainMapInstanceRef.current = map;
    }

    const map = mainMapInstanceRef.current;
    const layerGroup = mainMapLayerGroupRef.current;
    layerGroup.clearLayers();

    const bounds = [];

    // 1. Plot Office Locations & Allowed Geofence Radius Circles
    const officesList = mapData.offices || [];
    officesList.forEach((off) => {
      const lat = parseFloat(off.latitude);
      const lon = parseFloat(off.longitude);
      const radius = parseInt(off.allowed_radius, 10);

      if (!isNaN(lat) && !isNaN(lon)) {
        bounds.push([lat, lon]);

        // Radius circle (translucent blue)
        L.circle([lat, lon], {
          radius,
          color: '#2563eb',
          fillColor: '#3b82f6',
          fillOpacity: 0.12,
          weight: 1.5,
          dashArray: '4, 4'
        })
          .bindTooltip(`Geofence Radius: ${radius}m`, { sticky: true })
          .addTo(layerGroup);

        // Office Marker Pin
        const officeMarker = L.marker([lat, lon], {
          icon: createDivIcon('#2563eb', off.name, true)
        }).addTo(layerGroup);

        officeMarker.bindPopup(`
          <div class="map-popup-card">
            <div class="map-popup-header">
              <span class="map-popup-title">${off.name}</span>
              <span class="map-popup-badge office-badge">OFFICE</span>
            </div>
            <div class="map-popup-body">
              <p><strong>Address:</strong> ${off.address}</p>
              <p><strong>Allowed Geofence:</strong> ${radius} meters</p>
              <p><strong>Coordinates:</strong> ${lat.toFixed(5)}, ${lon.toFixed(5)}</p>
            </div>
          </div>
        `);
      }
    });

    // 2. Plot Attendance Check-In Markers
    const punchesList = mapData.punches || [];
    punchesList.forEach((punch) => {
      const lat = parseFloat(punch.latitude);
      const lon = parseFloat(punch.longitude);

      if (!isNaN(lat) && !isNaN(lon)) {
        bounds.push([lat, lon]);

        let pinColor = '#10b981'; // Green for inside
        let statusLabel = 'INSIDE';

        if (punch.location_status === 'outside') {
          pinColor = '#ef4444'; // Red for outside
          statusLabel = 'OUTSIDE';
        } else if (punch.location_status === 'exempt') {
          pinColor = '#f59e0b'; // Amber for exempt
          statusLabel = 'EXEMPT';
        }

        const punchMarker = L.marker([lat, lon], {
          icon: createDivIcon(pinColor, punch.employee_name, false)
        }).addTo(layerGroup);

        punchMarker.bindPopup(`
          <div class="map-popup-card">
            <div class="map-popup-header">
              <span class="map-popup-title">${punch.employee_name}</span>
              <span class="map-popup-badge status-${punch.location_status}">${statusLabel}</span>
            </div>
            <div class="map-popup-body">
              <p><strong>Department:</strong> ${punch.department_name || 'N/A'}</p>
              <p><strong>Check-In Time:</strong> ${punch.check_in_time ? new Date(punch.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</p>
              <p><strong>Nearest Office:</strong> ${punch.nearest_office_name || 'None'}</p>
              <p><strong>Distance:</strong> ${punch.distance !== null ? `${Math.round(punch.distance)} meters` : 'N/A'}</p>
              <p><strong>GPS Accuracy:</strong> ${punch.accuracy !== null ? `±${Math.round(punch.accuracy)}m` : 'N/A'}</p>
              ${
                punch.is_flagged_suspicious
                  ? `<div class="map-popup-alert">⚠️ Flagged Suspicious: ${punch.suspicious_reason || 'Anomaly detected'}</div>`
                  : ''
              }
            </div>
          </div>
        `);
      }
    });

    // Adjust view to fit all markers if present
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [activeTab, mapData]);

  // Clean up main map on unmount
  useEffect(() => {
    return () => {
      if (mainMapInstanceRef.current) {
        mainMapInstanceRef.current.remove();
        mainMapInstanceRef.current = null;
      }
    };
  }, []);

  // ==========================================
  // MODAL MAP CLICK PICKER SETUP
  // ==========================================
  useEffect(() => {
    if (!isOfficeModalOpen) {
      if (modalMapInstanceRef.current) {
        modalMapInstanceRef.current.remove();
        modalMapInstanceRef.current = null;
        modalMarkerRef.current = null;
        modalCircleRef.current = null;
      }
      return;
    }

    // Small delay to allow modal DOM container to render
    const timer = setTimeout(() => {
      if (!modalMapContainerRef.current) return;

      const lat = parseFloat(officeForm.latitude) || 37.7749;
      const lon = parseFloat(officeForm.longitude) || -122.4194;
      const radius = parseInt(officeForm.allowed_radius, 10) || 100;

      if (!modalMapInstanceRef.current) {
        const map = L.map(modalMapContainerRef.current, {
          center: [lat, lon],
          zoom: 15,
          zoomControl: true
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19
        }).addTo(map);

        const circle = L.circle([lat, lon], {
          radius,
          color: '#2563eb',
          fillColor: '#3b82f6',
          fillOpacity: 0.15,
          weight: 2
        }).addTo(map);

        const marker = L.marker([lat, lon], {
          icon: createDivIcon('#2563eb', 'Office Location', true),
          draggable: true
        }).addTo(map);

        // Click on map to place pin
        map.on('click', (e) => {
          const newLat = parseFloat(e.latlng.lat.toFixed(8));
          const newLon = parseFloat(e.latlng.lng.toFixed(8));
          setOfficeForm((prev) => ({ ...prev, latitude: newLat, longitude: newLon }));
          marker.setLatLng([newLat, newLon]);
          circle.setLatLng([newLat, newLon]);
        });

        // Drag marker
        marker.on('dragend', (e) => {
          const pos = e.target.getLatLng();
          const newLat = parseFloat(pos.lat.toFixed(8));
          const newLon = parseFloat(pos.lng.toFixed(8));
          setOfficeForm((prev) => ({ ...prev, latitude: newLat, longitude: newLon }));
          circle.setLatLng([newLat, newLon]);
        });

        modalMapInstanceRef.current = map;
        modalMarkerRef.current = marker;
        modalCircleRef.current = circle;
      } else {
        modalMapInstanceRef.current.invalidateSize();
        modalMarkerRef.current?.setLatLng([lat, lon]);
        modalCircleRef.current?.setLatLng([lat, lon]);
        modalCircleRef.current?.setRadius(radius);
        modalMapInstanceRef.current.setView([lat, lon], 15);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [isOfficeModalOpen, officeForm.latitude, officeForm.longitude, officeForm.allowed_radius]);

  // Use current browser location in modal picker
  const handleUseCurrentLocationInModal = () => {
    if (!navigator.geolocation) {
      notifyError('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(8));
        const lon = parseFloat(pos.coords.longitude.toFixed(8));
        setOfficeForm((prev) => ({ ...prev, latitude: lat, longitude: lon }));
        if (modalMapInstanceRef.current) {
          modalMarkerRef.current?.setLatLng([lat, lon]);
          modalCircleRef.current?.setLatLng([lat, lon]);
          modalMapInstanceRef.current.setView([lat, lon], 16);
        }
        success('Detected current location coordinates.');
      },
      (err) => {
        notifyError(`Could not obtain location: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Open Create Office Modal
  const handleOpenCreateOffice = () => {
    setEditingOfficeId(null);
    setOfficeFormError('');
    setOfficeForm({
      name: '',
      address: '',
      latitude: 37.774929,
      longitude: -122.419416,
      allowed_radius: 100,
      is_active: true
    });
    setIsOfficeModalOpen(true);
  };

  // Open Edit Office Modal
  const handleOpenEditOffice = (office) => {
    setEditingOfficeId(office.id);
    setOfficeFormError('');
    setOfficeForm({
      name: office.name,
      address: office.address,
      latitude: parseFloat(office.latitude),
      longitude: parseFloat(office.longitude),
      allowed_radius: parseInt(office.allowed_radius, 10),
      is_active: Boolean(office.is_active)
    });
    setIsOfficeModalOpen(true);
  };

  // Save Office Handler
  const handleSaveOffice = async (e) => {
    e.preventDefault();
    setOfficeFormError('');

    if (!officeForm.name.trim()) {
      setOfficeFormError('Office name is required.');
      return;
    }
    if (!officeForm.address.trim()) {
      setOfficeFormError('Address is required.');
      return;
    }
    if (officeForm.allowed_radius < 10) {
      setOfficeFormError('Allowed radius must be at least 10 meters.');
      return;
    }

    try {
      setSavingOffice(true);
      if (editingOfficeId) {
        const res = await api.put(`/offices/${editingOfficeId}`, officeForm);
        success(res.data.message || 'Office location updated.');
      } else {
        const res = await api.post('/offices', officeForm);
        success(res.data.message || 'Office location created.');
      }
      setIsOfficeModalOpen(false);
      fetchOffices();
    } catch (err) {
      setOfficeFormError(err.response?.data?.message || 'Failed to save office location.');
    } finally {
      setSavingOffice(false);
    }
  };

  // Toggle Office Active Status
  const handleToggleOfficeStatus = async (office) => {
    try {
      const res = await api.patch(`/offices/${office.id}/status`, {
        is_active: !office.is_active
      });
      success(res.data.message || `Office ${!office.is_active ? 'activated' : 'deactivated'}.`);
      fetchOffices();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to update office status.');
    }
  };

  // Delete Office Handler
  const handleDeleteOffice = async (office) => {
    if (!office.can_delete) {
      notifyError('This office has linked attendance records and cannot be deleted. You can deactivate it instead.');
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete "${office.name}"?`)) {
      return;
    }
    try {
      const res = await api.delete(`/offices/${office.id}`);
      success(res.data.message || 'Office deleted.');
      fetchOffices();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to delete office.');
    }
  };

  // ==========================================
  // EXEMPTION HANDLERS
  // ==========================================
  const handleOpenGrantExemption = () => {
    setExemptionFormError('');
    setExemptionTargetType('employee');
    setExemptionForm({
      employee_id: '',
      department_id: '',
      reason: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: ''
    });
    setIsExemptionModalOpen(true);
  };

  const handleSaveExemption = async (e) => {
    e.preventDefault();
    setExemptionFormError('');

    if (exemptionTargetType === 'employee' && !exemptionForm.employee_id) {
      setExemptionFormError('Please select an employee.');
      return;
    }
    if (exemptionTargetType === 'department' && !exemptionForm.department_id) {
      setExemptionFormError('Please select a department.');
      return;
    }
    if (!exemptionForm.reason.trim()) {
      setExemptionFormError('Reason for exemption is required.');
      return;
    }
    if (!exemptionForm.start_date) {
      setExemptionFormError('Start date is required.');
      return;
    }

    try {
      setSavingExemption(true);
      const payload = {
        employee_id: exemptionTargetType === 'employee' ? exemptionForm.employee_id : null,
        department_id: exemptionTargetType === 'department' ? exemptionForm.department_id : null,
        reason: exemptionForm.reason.trim(),
        start_date: exemptionForm.start_date,
        end_date: exemptionForm.end_date || null
      };

      const res = await api.post('/offices/exemptions', payload);
      success(res.data.message || 'Location exemption granted.');
      setIsExemptionModalOpen(false);
      fetchExemptions();
    } catch (err) {
      setExemptionFormError(err.response?.data?.message || 'Failed to grant exemption.');
    } finally {
      setSavingExemption(false);
    }
  };

  const handleRevokeExemption = async (exemption) => {
    if (!window.confirm(`Are you sure you want to revoke this location exemption?`)) {
      return;
    }
    try {
      const res = await api.patch(`/offices/exemptions/${exemption.id}/revoke`);
      success(res.data.message || 'Exemption revoked.');
      fetchExemptions();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to revoke exemption.');
    }
  };

  // Filtered offices list
  const filteredOffices = offices.filter((o) => {
    if (!officeSearch.trim()) return true;
    const q = officeSearch.toLowerCase();
    return o.name.toLowerCase().includes(q) || o.address.toLowerCase().includes(q);
  });

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content geo-main">
        {/* Header */}
        <div className="geo-header">
          <div>
            <h1 className="geo-title">Offices & Geolocation Attendance</h1>
            <p className="geo-subtitle">
              Manage office geofences, view live attendance check-in coordinates on Leaflet OpenStreetMap, and oversee remote work exemptions.
            </p>
          </div>

          <div className="geo-header-actions">
            {activeTab === 'offices' && canManageOffices && (
              <button type="button" onClick={handleOpenCreateOffice} className="btn btn-primary">
                <Plus size={16} />
                <span>Add Office</span>
              </button>
            )}
            {activeTab === 'exemptions' && canManageExemptions && (
              <button type="button" onClick={handleOpenGrantExemption} className="btn btn-primary">
                <ShieldCheck size={16} />
                <span>Grant Exemption</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="geo-tabs">
          <button
            type="button"
            className={`geo-tab-btn ${activeTab === 'map' ? 'active' : ''}`}
            onClick={() => handleTabChange('map')}
          >
            <MapPin size={16} />
            <span>Attendance Map</span>
          </button>

          {canManageOffices && (
            <button
              type="button"
              className={`geo-tab-btn ${activeTab === 'offices' ? 'active' : ''}`}
              onClick={() => handleTabChange('offices')}
            >
              <Building2 size={16} />
              <span>Office Locations</span>
            </button>
          )}

          {canManageExemptions && (
            <button
              type="button"
              className={`geo-tab-btn ${activeTab === 'exemptions' ? 'active' : ''}`}
              onClick={() => handleTabChange('exemptions')}
            >
              <ShieldCheck size={16} />
              <span>Location Exemptions</span>
            </button>
          )}
        </div>

        {/* TAB 1: ATTENDANCE MAP */}
        {activeTab === 'map' && (
          <div className="geo-tab-content">
            {/* Filter Toolbar */}
            <div className="card geo-filters-card">
              <div className="geo-filters-row">
                <div className="geo-filter-item">
                  <label className="geo-filter-label">
                    <Calendar size={13} />
                    <span>Date</span>
                  </label>
                  <input
                    type="date"
                    value={mapDate}
                    onChange={(e) => setMapDate(e.target.value)}
                    className="input geo-filter-input"
                  />
                </div>

                {!isEmployee && (
                  <div className="geo-filter-item">
                    <label className="geo-filter-label">
                      <Building2 size={13} />
                      <span>Department</span>
                    </label>
                    <select
                      value={mapDept}
                      onChange={(e) => setMapDept(e.target.value)}
                      className="select geo-filter-select"
                      disabled={isDeptManager}
                    >
                      <option value="all">All Departments</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {!isEmployee && (
                  <div className="geo-filter-item">
                    <label className="geo-filter-label">
                      <Users size={13} />
                      <span>Employee</span>
                    </label>
                    <select
                      value={mapEmployee}
                      onChange={(e) => setMapEmployee(e.target.value)}
                      className="select geo-filter-select"
                    >
                      <option value="all">All Employees</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} (#{e.id})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="geo-filter-item">
                  <label className="geo-filter-label">
                    <Filter size={13} />
                    <span>Location Status</span>
                  </label>
                  <select
                    value={mapStatus}
                    onChange={(e) => setMapStatus(e.target.value)}
                    className="select geo-filter-select"
                  >
                    <option value="all">All Locations</option>
                    <option value="inside">Inside Geofence</option>
                    <option value="outside">Outside Geofence</option>
                    <option value="exempt">Exempt (Remote)</option>
                    <option value="suspicious">Flagged Suspicious</option>
                  </select>
                </div>

                <div className="geo-filter-actions">
                  <button
                    type="button"
                    onClick={fetchMapData}
                    className="btn btn-secondary btn-sm"
                    title="Refresh Map Data"
                  >
                    <RotateCcw size={14} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* Metric Summary Chips */}
              <div className="geo-metrics-row">
                <div className="geo-metric-chip">
                  <span className="metric-chip-label">Total Check-Ins:</span>
                  <span className="metric-chip-val">{mapData.summary?.total_check_ins || 0}</span>
                </div>
                <div className="geo-metric-chip chip-success">
                  <span className="metric-chip-label">Inside Geofence:</span>
                  <span className="metric-chip-val">
                    {mapData.summary?.inside_geofence || 0}
                    {mapData.summary?.total_check_ins > 0 &&
                      ` (${Math.round(((mapData.summary?.inside_geofence || 0) / mapData.summary.total_check_ins) * 100)}%)`}
                  </span>
                </div>
                <div className="geo-metric-chip chip-danger">
                  <span className="metric-chip-label">Outside Geofence:</span>
                  <span className="metric-chip-val">{mapData.summary?.outside_geofence || 0}</span>
                </div>
                <div className="geo-metric-chip chip-exempt">
                  <span className="metric-chip-label">Remote / Exempt:</span>
                  <span className="metric-chip-val">{mapData.summary?.exempt_check_ins || 0}</span>
                </div>
                {mapData.summary?.flagged_suspicious > 0 && (
                  <div className="geo-metric-chip chip-warning">
                    <AlertTriangle size={13} />
                    <span className="metric-chip-label">Suspicious Anomaly:</span>
                    <span className="metric-chip-val">{mapData.summary?.flagged_suspicious}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Map Canvas */}
            <div className="card geo-map-card">
              <div className="geo-map-container" ref={mainMapContainerRef}></div>

              {/* Map Legend */}
              <div className="geo-map-legend">
                <span className="legend-title">Map Legend:</span>
                <span className="legend-item">
                  <span className="legend-dot office-dot"></span>
                  <span>Office Geofence</span>
                </span>
                <span className="legend-item">
                  <span className="legend-dot inside-dot"></span>
                  <span>Inside Allowed Radius</span>
                </span>
                <span className="legend-item">
                  <span className="legend-dot outside-dot"></span>
                  <span>Outside Radius</span>
                </span>
                <span className="legend-item">
                  <span className="legend-dot exempt-dot"></span>
                  <span>Remote / Exempt</span>
                </span>
              </div>
            </div>

            {/* List Table of Punches on Map for Accessibility */}
            <div className="card geo-punches-card">
              <div className="geo-card-header">
                <h3 className="geo-card-title">Check-In Coordinates Log ({mapData.punches?.length || 0})</h3>
              </div>
              <div className="table-responsive">
                <table className="geo-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Department</th>
                      <th>Time</th>
                      <th>Nearest Office</th>
                      <th>Distance</th>
                      <th>Accuracy</th>
                      <th>Status</th>
                      <th>Security Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingMapData ? (
                      <tr>
                        <td colSpan="8" className="geo-empty-td">
                          Loading map points...
                        </td>
                      </tr>
                    ) : (mapData.punches || []).length === 0 ? (
                      <tr>
                        <td colSpan="8" className="geo-empty-td">
                          No check-ins recorded for the selected date and filters.
                        </td>
                      </tr>
                    ) : (
                      mapData.punches.map((p) => (
                        <tr key={p.id}>
                          <td className="font-medium">{p.employee_name}</td>
                          <td>{p.department_name || '—'}</td>
                          <td>
                            {p.check_in_time
                              ? new Date(p.check_in_time).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })
                              : '—'}
                          </td>
                          <td>{p.nearest_office_name || '—'}</td>
                          <td>{p.distance !== null ? `${Math.round(p.distance)} m` : '—'}</td>
                          <td>{p.accuracy !== null ? `±${Math.round(p.accuracy)} m` : '—'}</td>
                          <td>
                            <span className={`badge status-badge-${p.location_status}`}>
                              {p.location_status}
                            </span>
                          </td>
                          <td>
                            {p.is_flagged_suspicious ? (
                              <span className="badge badge-warning" title={p.suspicious_reason}>
                                <AlertTriangle size={12} />
                                <span>{p.suspicious_reason || 'Anomaly'}</span>
                              </span>
                            ) : (
                              <span className="badge badge-success-subtle">
                                <Check size={12} />
                                <span>Verified</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: OFFICE LOCATIONS */}
        {activeTab === 'offices' && canManageOffices && (
          <div className="geo-tab-content">
            <div className="card geo-search-card">
              <div className="geo-search-box">
                <Search size={16} className="geo-search-icon" />
                <input
                  type="text"
                  placeholder="Search offices by name or address..."
                  value={officeSearch}
                  onChange={(e) => setOfficeSearch(e.target.value)}
                  className="input geo-search-input"
                />
                {officeSearch && (
                  <button
                    type="button"
                    onClick={() => setOfficeSearch('')}
                    className="btn btn-ghost btn-sm"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            <div className="card geo-table-card">
              <div className="table-responsive">
                <table className="geo-table">
                  <thead>
                    <tr>
                      <th>Office Name</th>
                      <th>Address</th>
                      <th>Coordinates</th>
                      <th>Allowed Radius</th>
                      <th>Linked Punches</th>
                      <th>Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingOffices ? (
                      <tr>
                        <td colSpan="7" className="geo-empty-td">
                          Loading offices...
                        </td>
                      </tr>
                    ) : filteredOffices.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="geo-empty-td">
                          No offices found. Click "Add Office" to create one.
                        </td>
                      </tr>
                    ) : (
                      filteredOffices.map((office) => (
                        <tr key={office.id}>
                          <td>
                            <div className="geo-office-name-col">
                              <Building2 size={16} className="office-row-icon" />
                              <span className="font-semibold">{office.name}</span>
                            </div>
                          </td>
                          <td className="geo-address-cell">{office.address}</td>
                          <td className="font-mono text-xs">
                            {office.latitude.toFixed(5)}, {office.longitude.toFixed(5)}
                          </td>
                          <td>
                            <span className="badge badge-radius">{office.allowed_radius} m</span>
                          </td>
                          <td>
                            <span className="badge badge-subtle">
                              {office.attendance_count || 0} punches
                            </span>
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                office.is_active ? 'badge-success' : 'badge-inactive'
                              }`}
                            >
                              {office.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="text-right">
                            <div className="geo-actions-row">
                              <button
                                type="button"
                                onClick={() => handleOpenEditOffice(office)}
                                className="btn btn-secondary btn-xs"
                                title="Edit Office & Geofence"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleOfficeStatus(office)}
                                className={`btn btn-xs ${
                                  office.is_active ? 'btn-outline-danger' : 'btn-outline-success'
                                }`}
                                title={office.is_active ? 'Deactivate Office' : 'Activate Office'}
                              >
                                <Power size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteOffice(office)}
                                disabled={!office.can_delete}
                                className="btn btn-danger btn-xs"
                                title={
                                  office.can_delete
                                    ? 'Delete Office'
                                    : 'Cannot delete office with linked attendance records; deactivate instead.'
                                }
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: LOCATION EXEMPTIONS */}
        {activeTab === 'exemptions' && canManageExemptions && (
          <div className="geo-tab-content">
            <div className="card geo-table-card">
              <div className="geo-card-header">
                <h3 className="geo-card-title">Remote & Field Work Location Exemptions</h3>
                <p className="geo-card-desc">
                  Staff or whole departments with approved exemptions can check in remotely without geofence boundary restrictions.
                </p>
              </div>

              <div className="table-responsive">
                <table className="geo-table">
                  <thead>
                    <tr>
                      <th>Target</th>
                      <th>Scope</th>
                      <th>Reason</th>
                      <th>Start Date</th>
                      <th>End Date</th>
                      <th>Status</th>
                      <th>Approved By</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingExemptions ? (
                      <tr>
                        <td colSpan="8" className="geo-empty-td">
                          Loading exemptions...
                        </td>
                      </tr>
                    ) : exemptions.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="geo-empty-td">
                          No active location exemptions. Click "Grant Exemption" to add one.
                        </td>
                      </tr>
                    ) : (
                      exemptions.map((ex) => (
                        <tr key={ex.id}>
                          <td className="font-semibold">
                            {ex.employee_name || ex.department_name}
                            {ex.employee_email ? (
                              <span className="geo-email-sub">{ex.employee_email}</span>
                            ) : null}
                          </td>
                          <td>
                            <span className="badge badge-scope">
                              {ex.employee_id ? 'Employee' : 'Department'}
                            </span>
                          </td>
                          <td>{ex.reason}</td>
                          <td>{ex.start_date?.slice(0, 10)}</td>
                          <td>{ex.end_date ? ex.end_date.slice(0, 10) : 'Ongoing / Indefinite'}</td>
                          <td>
                            <span
                              className={`badge ${
                                ex.is_active ? 'badge-success' : 'badge-inactive'
                              }`}
                            >
                              {ex.is_active ? 'Active' : 'Revoked'}
                            </span>
                          </td>
                          <td>{ex.approver_name || 'Admin'}</td>
                          <td className="text-right">
                            {ex.is_active ? (
                              <button
                                type="button"
                                onClick={() => handleRevokeExemption(ex)}
                                className="btn btn-outline-danger btn-xs"
                                title="Revoke Exemption"
                              >
                                Revoke
                              </button>
                            ) : (
                              <span className="text-xs text-muted">Inactive</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: ADD / EDIT OFFICE */}
        {isOfficeModalOpen && (
          <div className="modal-backdrop" onClick={() => setIsOfficeModalOpen(false)}>
            <div
              className="modal-content geo-office-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <div className="modal-title-wrap">
                  <Building2 size={20} className="modal-title-icon" />
                  <h2 className="modal-title">
                    {editingOfficeId ? 'Edit Office Location' : 'Add Office Location & Geofence'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOfficeModalOpen(false)}
                  className="btn btn-ghost btn-sm"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveOffice}>
                <div className="modal-body geo-modal-body">
                  {officeFormError && (
                    <div className="geo-form-alert" role="alert">
                      <AlertCircle size={16} />
                      <span>{officeFormError}</span>
                    </div>
                  )}

                  <div className="geo-modal-grid">
                    {/* Left side: Form inputs */}
                    <div className="geo-modal-form-col">
                      <div className="form-group">
                        <label className="form-label">
                          Office Name <span className="required">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={officeForm.name}
                          onChange={(e) =>
                            setOfficeForm((prev) => ({ ...prev, name: e.target.value }))
                          }
                          placeholder="e.g. San Francisco Tech Hub"
                          className="input"
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">
                          Physical Address <span className="required">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={officeForm.address}
                          onChange={(e) =>
                            setOfficeForm((prev) => ({ ...prev, address: e.target.value }))
                          }
                          placeholder="e.g. 100 Market St, Suite 400"
                          className="input"
                        />
                      </div>

                      <div className="geo-form-row">
                        <div className="form-group flex-1">
                          <label className="form-label">Latitude (-90 to 90)</label>
                          <input
                            type="number"
                            step="any"
                            required
                            value={officeForm.latitude}
                            onChange={(e) =>
                              setOfficeForm((prev) => ({
                                ...prev,
                                latitude: parseFloat(e.target.value) || 0
                              }))
                            }
                            className="input font-mono"
                          />
                        </div>

                        <div className="form-group flex-1">
                          <label className="form-label">Longitude (-180 to 180)</label>
                          <input
                            type="number"
                            step="any"
                            required
                            value={officeForm.longitude}
                            onChange={(e) =>
                              setOfficeForm((prev) => ({
                                ...prev,
                                longitude: parseFloat(e.target.value) || 0
                              }))
                            }
                            className="input font-mono"
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <div className="geo-label-with-hint">
                          <label className="form-label">
                            Allowed Radius: <strong>{officeForm.allowed_radius} meters</strong>
                          </label>
                          <span className="text-xs text-muted">Min: 10m</span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="1000"
                          step="10"
                          value={officeForm.allowed_radius}
                          onChange={(e) =>
                            setOfficeForm((prev) => ({
                              ...prev,
                              allowed_radius: parseInt(e.target.value, 10) || 10
                            }))
                          }
                          className="geo-range-slider"
                        />
                      </div>

                      <div className="geo-location-picker-actions">
                        <button
                          type="button"
                          onClick={handleUseCurrentLocationInModal}
                          className="btn btn-secondary btn-sm"
                        >
                          <Crosshair size={14} />
                          <span>Use My Current GPS Position</span>
                        </button>
                      </div>

                      <div className="form-group">
                        <label className="geo-checkbox-label">
                          <input
                            type="checkbox"
                            checked={officeForm.is_active}
                            onChange={(e) =>
                              setOfficeForm((prev) => ({
                                ...prev,
                                is_active: e.target.checked
                              }))
                            }
                          />
                          <span>Office is active for attendance validation</span>
                        </label>
                      </div>
                    </div>

                    {/* Right side: Interactive Map Click-Picker */}
                    <div className="geo-modal-map-col">
                      <div className="geo-map-picker-banner">
                        <Navigation size={14} />
                        <span>Click anywhere on the map or drag the pin to position the office</span>
                      </div>
                      <div
                        className="geo-modal-map-canvas"
                        ref={modalMapContainerRef}
                      ></div>
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    onClick={() => setIsOfficeModalOpen(false)}
                    className="btn btn-secondary"
                    disabled={savingOffice}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingOffice}>
                    {savingOffice ? 'Saving...' : editingOfficeId ? 'Save Changes' : 'Create Office'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: GRANT LOCATION EXEMPTION */}
        {isExemptionModalOpen && (
          <div className="modal-backdrop" onClick={() => setIsExemptionModalOpen(false)}>
            <div
              className="modal-content geo-exemption-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <div className="modal-title-wrap">
                  <ShieldCheck size={20} className="modal-title-icon" />
                  <h2 className="modal-title">Grant Location Exemption</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsExemptionModalOpen(false)}
                  className="btn btn-ghost btn-sm"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveExemption}>
                <div className="modal-body">
                  {exemptionFormError && (
                    <div className="geo-form-alert" role="alert">
                      <AlertCircle size={16} />
                      <span>{exemptionFormError}</span>
                    </div>
                  )}

                  {/* Target Scope Switch */}
                  <div className="form-group">
                    <label className="form-label">Exemption Scope</label>
                    <div className="geo-radio-group">
                      <label className="geo-radio-card">
                        <input
                          type="radio"
                          name="targetType"
                          value="employee"
                          checked={exemptionTargetType === 'employee'}
                          onChange={() => setExemptionTargetType('employee')}
                        />
                        <span>Single Employee</span>
                      </label>
                      <label className="geo-radio-card">
                        <input
                          type="radio"
                          name="targetType"
                          value="department"
                          checked={exemptionTargetType === 'department'}
                          onChange={() => setExemptionTargetType('department')}
                        />
                        <span>Whole Department</span>
                      </label>
                    </div>
                  </div>

                  {exemptionTargetType === 'employee' ? (
                    <div className="form-group">
                      <label className="form-label">
                        Employee <span className="required">*</span>
                      </label>
                      <select
                        required
                        value={exemptionForm.employee_id}
                        onChange={(e) =>
                          setExemptionForm((prev) => ({ ...prev, employee_id: e.target.value }))
                        }
                        className="select"
                      >
                        <option value="">Select Employee...</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name} ({emp.designation || 'Staff'}) — ID #{emp.id}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="form-group">
                      <label className="form-label">
                        Department <span className="required">*</span>
                      </label>
                      <select
                        required
                        value={exemptionForm.department_id}
                        onChange={(e) =>
                          setExemptionForm((prev) => ({ ...prev, department_id: e.target.value }))
                        }
                        className="select"
                      >
                        <option value="">Select Department...</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">
                      Reason for Exemption <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Remote Contract / Field Client Representative"
                      value={exemptionForm.reason}
                      onChange={(e) =>
                        setExemptionForm((prev) => ({ ...prev, reason: e.target.value }))
                      }
                      className="input"
                    />
                  </div>

                  <div className="geo-form-row">
                    <div className="form-group flex-1">
                      <label className="form-label">
                        Start Date <span className="required">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={exemptionForm.start_date}
                        onChange={(e) =>
                          setExemptionForm((prev) => ({ ...prev, start_date: e.target.value }))
                        }
                        className="input"
                      />
                    </div>

                    <div className="form-group flex-1">
                      <label className="form-label">End Date (Optional)</label>
                      <input
                        type="date"
                        value={exemptionForm.end_date}
                        onChange={(e) =>
                          setExemptionForm((prev) => ({ ...prev, end_date: e.target.value }))
                        }
                        className="input"
                      />
                      <span className="text-xs text-muted">Leave blank for indefinite exemption</span>
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    onClick={() => setIsExemptionModalOpen(false)}
                    className="btn btn-secondary"
                    disabled={savingExemption}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={savingExemption}
                  >
                    {savingExemption ? 'Granting...' : 'Grant Exemption'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default OfficeLocations;
