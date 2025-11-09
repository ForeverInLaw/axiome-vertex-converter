const fs = require('fs').promises;
const path = require('path');

const TEMP_DIR = path.join(__dirname, '..', 'temp');
const CLEANUP_INTERVAL_MS = 600000; // 10 minutes
const FILE_MAX_AGE_MS = 600000;     // 10 minutes

const cleanupOldFiles = async () => {
  try {
    const now = Date.now();
    let deletedCount = 0;
    let freedSpace = 0;
    let emptyDirsRemoved = 0;
    
    // Read user directories
    const entries = await fs.readdir(TEMP_DIR, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(TEMP_DIR, entry.name);
      
      try {
        if (entry.isDirectory() && entry.name.startsWith('user_')) {
          // Process files in user directory
          const userFiles = await fs.readdir(entryPath);
          let dirHasFiles = false;
          
          for (const file of userFiles) {
            const filePath = path.join(entryPath, file);
            try {
              const stats = await fs.stat(filePath);
              
              if (stats.isFile()) {
                const age = now - stats.mtimeMs;
                
                if (age > FILE_MAX_AGE_MS) {
                  freedSpace += stats.size;
                  await fs.unlink(filePath);
                  deletedCount++;
                  console.log(`Deleted old file: ${file} (age: ${Math.round(age / 60000)} min)`);
                } else {
                  dirHasFiles = true;
                }
              }
            } catch (err) {
              console.error(`Error processing file ${file}:`, err.message);
            }
          }
          
          // Remove empty user directory
          if (!dirHasFiles) {
            const remainingFiles = await fs.readdir(entryPath);
            if (remainingFiles.length === 0) {
              await fs.rmdir(entryPath);
              emptyDirsRemoved++;
              console.log(`Removed empty directory: ${entry.name}`);
            }
          }
        }
      } catch (err) {
        console.error(`Error processing directory ${entry.name}:`, err.message);
      }
    }
    
    if (deletedCount > 0 || emptyDirsRemoved > 0) {
      console.log(`✅ Cleanup complete: ${deletedCount} files deleted (${(freedSpace / (1024 * 1024)).toFixed(2)} MB freed), ${emptyDirsRemoved} empty directories removed`);
    } else {
      console.log('🧹 Cleanup: no old files to remove');
    }
  } catch (error) {
    console.error('Error during cleanup:', error.message);
  }
};

const startCleanupService = () => {
  cleanupOldFiles();
  setInterval(cleanupOldFiles, CLEANUP_INTERVAL_MS);
  console.log('🧹 Cleanup service started (runs every 10 minutes, removes files older than 10 minutes)');
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
