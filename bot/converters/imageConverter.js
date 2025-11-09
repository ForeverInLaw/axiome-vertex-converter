const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { execSync } = require('child_process');

const QUALITY_LEVELS = {
  original: { quality: 100, scale: 1.0 },
  high: { quality: 95, scale: 1.0 },
  medium: { quality: 85, scale: 0.75 },
  low: { quality: 70, scale: 0.5 },
  minimum: { quality: 60, scale: 0.35 }
};

const validatePath = (filePath) => {
  const resolvedPath = path.resolve(filePath);
  const tempDir = path.resolve(__dirname, '..', 'temp');
  return resolvedPath.startsWith(tempDir);
};

const convertImage = async (inputPath, outputPath, targetFormat, quality = 'medium') => {
  if (!validatePath(inputPath)) {
    throw new Error('Invalid input path - must be in temp directory');
  }
  if (!validatePath(outputPath)) {
    throw new Error('Invalid output path - must be in temp directory');
  }

  const settings = QUALITY_LEVELS[quality] || QUALITY_LEVELS.medium;
  
  let workingPath = inputPath;
  let tempHeicJpg = null;

  // Check if input is HEIC/HEIF - convert using heif-convert
  const ext = path.extname(inputPath).toLowerCase();
  if (ext === '.heic' || ext === '.heif') {
    console.log('Detected HEIC/HEIF file, using heif-convert...');
    
    // If target is JPG/PNG and no scaling needed - convert directly
    if ((targetFormat === 'jpg' || targetFormat === 'jpeg' || targetFormat === 'png') && settings.scale === 1.0) {
      try {
        const qualityParam = targetFormat === 'png' ? 100 : settings.quality;
        execSync(`heif-convert -q ${qualityParam} "${inputPath}" "${outputPath}"`, { 
          encoding: 'utf-8',
          stdio: 'pipe'
        });
        console.log(`HEIC directly converted to ${targetFormat.toUpperCase()} (quality: ${qualityParam})`);
        return outputPath;
      } catch (error) {
        console.error('heif-convert error:', error.message);
        throw new Error(`HEIC conversion failed: ${error.message}`);
      }
    }
    
    // For other formats or when scaling needed - convert to temp PNG first (lossless)
    tempHeicJpg = inputPath.replace(/\.(heic|heif)$/i, '_heic_temp.png');
    try {
      execSync(`heif-convert -q 100 "${inputPath}" "${tempHeicJpg}"`, { 
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      console.log('HEIC converted to temporary PNG for further processing (lossless)');
      workingPath = tempHeicJpg;
    } catch (error) {
      console.error('heif-convert error:', error.message);
      throw new Error(`HEIC conversion failed: ${error.message}`);
    }
  }

  let image = sharp(workingPath);

  const metadata = await image.metadata();
  console.log(`Image metadata: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

  // Apply scaling if needed
  if (settings.scale < 1.0) {
    const newWidth = Math.round(metadata.width * settings.scale);
    image = image.resize(newWidth, null, { fit: 'inside' });
    console.log(`Scaling image to ${newWidth}px width (${Math.round(settings.scale * 100)}%)`);
  }

  const formatOptions = {
    jpeg: { quality: settings.quality },
    jpg: { quality: settings.quality },
    png: { compressionLevel: quality === 'original' ? 6 : quality === 'high' ? 7 : quality === 'medium' ? 8 : 9 },
    webp: { quality: settings.quality },
    gif: {},
    tiff: { quality: settings.quality },
    heic: { quality: settings.quality },
    heif: { quality: settings.quality }
  };

  const options = formatOptions[targetFormat.toLowerCase()] || {};

  await image
    .toFormat(targetFormat, options)
    .toFile(outputPath);

  // Clean up temporary HEIC conversion file
  if (tempHeicJpg) {
    try {
      await fs.unlink(tempHeicJpg);
      console.log('Cleaned up temporary HEIC conversion file');
    } catch (error) {
      console.warn('Failed to clean up temp file:', error.message);
    }
  }

  console.log(`Image converted to ${targetFormat}`);
  return outputPath;
};

const convertImageWithTimeout = async (inputPath, outputPath, targetFormat, quality = 'medium', timeoutMs = 300000) => {
  return Promise.race([
    convertImage(inputPath, outputPath, targetFormat, quality),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Conversion timeout')), timeoutMs)
    )
  ]);
};

module.exports = { convertImage, convertImageWithTimeout };
