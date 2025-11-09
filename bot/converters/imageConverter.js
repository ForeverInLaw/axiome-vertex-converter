const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

const QUALITY_LEVELS = {
  high: 100,
  medium: 80,
  low: 60
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

  const qualityValue = QUALITY_LEVELS[quality] || QUALITY_LEVELS.medium;
  
  let image = sharp(inputPath);

  const metadata = await image.metadata();
  console.log(`Image metadata: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

  const formatOptions = {
    jpeg: { quality: qualityValue },
    jpg: { quality: qualityValue },
    png: { compressionLevel: quality === 'high' ? 6 : quality === 'medium' ? 7 : 9 },
    webp: { quality: qualityValue },
    gif: {},
    bmp: {},
    tiff: { quality: qualityValue }
  };

  const options = formatOptions[targetFormat.toLowerCase()] || {};

  await image
    .toFormat(targetFormat, options)
    .toFile(outputPath);

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
