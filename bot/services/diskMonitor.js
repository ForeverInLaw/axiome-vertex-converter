const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Minimum free space required (in GB)
const MIN_FREE_SPACE_GB = 2;

/**
 * Check available disk space
 * @returns {Promise<{freeGB: number, totalGB: number, usedPercent: number}>}
 */
const checkDiskSpace = async () => {
  try {
    // Cross-platform disk space check
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      // Windows: use wmic
      const { stdout } = await execPromise('wmic logicaldisk get size,freespace,caption');
      const lines = stdout.trim().split('\n').slice(1); // Skip header
      
      // Parse C: drive (or first available drive)
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const caption = parts[0];
          const free = parseInt(parts[1]) || 0;
          const total = parseInt(parts[2]) || 0;
          
          if (caption && free > 0 && total > 0) {
            const freeGB = free / (1024 ** 3);
            const totalGB = total / (1024 ** 3);
            const usedPercent = ((total - free) / total) * 100;
            
            return { freeGB, totalGB, usedPercent };
          }
        }
      }
    } else {
      // Linux/Mac: use df
      const { stdout } = await execPromise('df -k /tmp');
      const lines = stdout.trim().split('\n');
      
      if (lines.length >= 2) {
        const parts = lines[1].trim().split(/\s+/);
        const total = parseInt(parts[1]) * 1024; // KB to bytes
        const used = parseInt(parts[2]) * 1024;
        const free = parseInt(parts[3]) * 1024;
        
        const freeGB = free / (1024 ** 3);
        const totalGB = total / (1024 ** 3);
        const usedPercent = (used / total) * 100;
        
        return { freeGB, totalGB, usedPercent };
      }
    }
    
    // Fallback values
    return { freeGB: 10, totalGB: 100, usedPercent: 90 };
    
  } catch (error) {
    console.error('Error checking disk space:', error.message);
    // Return safe defaults to not block operations
    return { freeGB: 10, totalGB: 100, usedPercent: 90 };
  }
};

/**
 * Check if there's enough free disk space
 * @param {number} requiredGB - Required space in GB
 * @throws {Error} If not enough space
 */
const ensureDiskSpace = async (requiredGB = MIN_FREE_SPACE_GB) => {
  const { freeGB, usedPercent } = await checkDiskSpace();
  
  if (freeGB < requiredGB) {
    const error = new Error(`Недостаточно места на диске. Свободно: ${freeGB.toFixed(2)} GB, требуется: ${requiredGB} GB`);
    error.code = 'INSUFFICIENT_DISK_SPACE';
    throw error;
  }
  
  if (usedPercent > 95) {
    console.warn(`Warning: Disk usage is ${usedPercent.toFixed(1)}% (${freeGB.toFixed(2)} GB free)`);
  }
  
  return { freeGB, usedPercent };
};

/**
 * Log current disk space
 */
const logDiskSpace = async () => {
  const { freeGB, totalGB, usedPercent } = await checkDiskSpace();
  console.log(`Disk space: ${freeGB.toFixed(2)} GB free of ${totalGB.toFixed(2)} GB (${usedPercent.toFixed(1)}% used)`);
};

module.exports = {
  checkDiskSpace,
  ensureDiskSpace,
  logDiskSpace,
  MIN_FREE_SPACE_GB,
};
