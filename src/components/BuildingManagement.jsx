import { useState, useEffect } from 'react';
import { getDocs, collection, doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import ditBuildings from '../data/ditBuildings.json';
import { updateBuilding, editStaticBuilding } from '../services/firestoreService';

export default function BuildingManagement() {
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingBuilding, setEditingBuilding] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    loadBuildings();
  }, []);

  const loadBuildings = async () => {
    try {
      // Load all buildings from Firestore
      const firestoreBuildings = await getDocs(collection(db, 'buildings'));
      
      // Merge static buildings from JSON with dynamic buildings from Firestore
      const staticBuildings = ditBuildings.features.map(feature => ({
        ...feature.properties,
        lat: feature.geometry.coordinates[0][0][1],
        lng: feature.geometry.coordinates[0][0][0],
        isStatic: true,
        editableBy: ['admin'],
        geometry: feature.geometry
      }));
      
      const allBuildings = [...staticBuildings, ...firestoreBuildings.docs.map(d => ({ id: d.id, ...d.data() }))];
      setBuildings(allBuildings);
    } catch (error) {
      console.error('Error loading buildings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (building) => {
    setEditingBuilding(building);
    setEditForm({
      name: building.name || '',
      category: building.category || 'academic',
      description: building.description || '',
      totalFloors: building.totalFloors || 1
    });
  };

  const handleSave = async () => {
    if (!editingBuilding) return;

    const userRole = 'admin'; // In real app, get from auth context
    
    try {
      let success = false;
      if (editingBuilding.isStatic) {
        success = await editStaticBuilding(editingBuilding.id, editForm, userRole);
      } else {
        success = await updateBuilding(editingBuilding.id, editForm, userRole);
      }

      if (success) {
        await loadBuildings(); // Reload buildings
        setEditingBuilding(null);
        setEditForm({});
        alert('Building updated successfully!');
      } else {
        alert('Failed to update building. Please check permissions.');
      }
    } catch (error) {
      console.error('Error updating building:', error);
      alert('Error updating building. Please try again.');
    }
  };

  const handleCancel = () => {
    setEditingBuilding(null);
    setEditForm({});
  };

  const handleDelete = async (buildingId) => {
    if (!confirm('Are you sure you want to delete this building?')) return;
    
    try {
      await updateDoc(doc(db, 'buildings', buildingId), {
        deleted: true,
        deletedAt: new Date()
      });
      await loadBuildings();
      alert('Building deleted successfully!');
    } catch (error) {
      console.error('Error deleting building:', error);
      alert('Error deleting building. Please try again.');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div>Loading buildings...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ marginBottom: '20px', color: '#1B3A6B' }}>
        Building Management
      </h2>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
        gap: '20px',
        marginBottom: '20px'
      }}>
        {buildings.map(building => (
          <div 
            key={building.id}
            style={{
              background: 'white',
              border: `2px solid ${building.isStatic ? '#1B3A6B' : '#e5e7eb'}`,
              borderRadius: '12px',
              padding: '16px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, color: '#1B3A6B' }}>
                {building.name}
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {building.isStatic && (
                  <span style={{
                    background: '#1B3A6B',
                    color: 'white',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '10px',
                    fontWeight: 'bold'
                  }}>
                    DEFAULT
                  </span>
                )}
                <button
                  onClick={() => handleEdit(building)}
                  style={{
                    background: '#378ADD',
                    color: 'white',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Edit
                </button>
                {!building.isStatic && (
                  <button
                    onClick={() => handleDelete(building.id)}
                    style={{
                      background: '#DC2626',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            
            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              <div><strong>Category:</strong> {building.category}</div>
              <div><strong>Floors:</strong> {building.totalFloors}</div>
              {building.description && (
                <div><strong>Description:</strong> {building.description}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editingBuilding && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#1B3A6B' }}>
              Edit {editingBuilding.name}
              {editingBuilding.isStatic && (
                <span style={{
                  background: '#1B3A6B',
                  color: 'white',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '10px',
                  marginLeft: '8px'
                }}>
                  DEFAULT BUILDING
                </span>
              )}
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                  Building Name
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                  Category
                </label>
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                >
                  <option value="academic">Academic</option>
                  <option value="admin">Admin</option>
                  <option value="amenity">Amenity</option>
                  <option value="hostel">Hostel</option>
                  <option value="sports">Sports</option>
                  <option value="medical">Medical</option>
                  <option value="lab">Lab</option>
                  <option value="classroom">Classroom</option>
                  <option value="office">Office</option>
                </select>
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                  Description
                </label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                  Total Floors
                </label>
                <input
                  type="number"
                  min="1"
                  value={editForm.totalFloors}
                  onChange={(e) => setEditForm({ ...editForm, totalFloors: parseInt(e.target.value) || 1 })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                onClick={handleCancel}
                style={{
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                style={{
                  background: '#1B3A6B',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
