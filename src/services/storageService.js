// d:\project\ProjectSE\src\services\storageService.js
// Note: Using base64 storage in Firestore instead of Firebase Storage (free plan limitation)

// Convert file to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

export async function uploadFloorPlan(buildingId, floorNumber, file) {
  try {
    const base64Data = await fileToBase64(file);
    
    // Return a mock URL that indicates it's base64 stored data
    const mockUrl = `base64:${buildingId}_${floorNumber}_${file.name}`;
    
    return {
      url: mockUrl,
      base64Data: base64Data,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    };
  } catch (error) {
    console.error('Base64 conversion error:', error);
    throw error;
  }
}

export async function uploadBuildingPhoto(buildingId, file) {
  try {
    const base64Data = await fileToBase64(file);
    const mockUrl = `base64:${buildingId}_photo_${file.name}`;
    
    return {
      url: mockUrl,
      base64Data: base64Data,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    };
  } catch (error) {
    console.error('Building photo base64 conversion error:', error);
    throw error;
  }
}

