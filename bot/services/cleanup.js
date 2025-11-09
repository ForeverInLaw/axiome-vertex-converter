const fs = require('fs').promises;
const path = require('path');

const TEMP_DIR = path.join(__dirname, '..', 'temp');
const CLEANUP_INTERVAL_MS = 900000;
const FILE_MAX_AGE_MS = 1800000;

const cleanupOldFiles = async () => {
  try {
    const now = Date.now();
    const files = await fs.readdir(TEMP_DIR);
    let deletedCount = 0;
    let freedSpace = 0;
    
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      try {
        const stats = await fs.stat(filePath);
        const age = now - stats.mtimeMs;
        
        if (age > FILE_MAX_AGE_MS) {
          freedSpace += stats.size;
          await fs.unlink(filePath);
          deletedCount++;
        }
      } catch (err) {
        console.error(`Error cleaning up file ${file}:`, err.message);
      }
    }
    
    if (deletedCount > 0) {
      console.log(`Cleanup: deleted ${deletedCount} files, freed ${(freedSpace / (1024 * 1024)).toFixed(2)} MB`);
    }
  } catch (error) {
    console.error('Error during cleanup:', error.message);
  }
};

const startCleanupService = () => {
  cleanupOldFiles();
  setInterval(cleanupOldFiles, CLEANUP_INTERVAL_MS);
  console.log('Cleanup service started (runs every 15 minutes)');
};

const deleteFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error.message);
  }
};

module.exports = {
  startCleanupService,
  cleanupOldFiles,
  deleteFile,
};
