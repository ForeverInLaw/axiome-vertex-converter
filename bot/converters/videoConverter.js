const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const { QUALITY_SETTINGS } = require('../keyboards/qualitySelector');

const validatePath = (filePath) => {
  const resolvedPath = path.resolve(filePath);
  const tempDir = path.resolve(__dirname, '..', 'temp');
  return resolvedPath.startsWith(tempDir);
};

const convertVideo = (inputPath, outputPath, targetFormat, quality = 'medium') => {
  return new Promise((resolve, reject) => {
    if (!validatePath(inputPath)) {
      return reject(new Error('Invalid input path - must be in temp directory'));
    }
    if (!validatePath(outputPath)) {
      return reject(new Error('Invalid output path - must be in temp directory'));
    }

    const settings = QUALITY_SETTINGS[quality] || QUALITY_SETTINGS.medium;
    
    const command = ffmpeg(inputPath)
      .output(outputPath)
      .videoCodec('libx264')
      .audioCodec('aac');

    if (targetFormat === 'webm') {
      command.videoCodec('libvpx').audioCodec('libvorbis');
    }

    command
      .outputOptions([
        `-crf ${settings.crf}`,
        '-preset medium',
        '-movflags +faststart'
      ])
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`Processing: ${Math.round(progress.percent)}% done`);
        }
      })
      .on('end', () => {
        console.log('Video conversion finished');
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('Video conversion error:', err.message);
        reject(err);
      });

    command.run();
  });
};

const convertVideoWithTimeout = async (inputPath, outputPath, targetFormat, quality = 'medium', timeoutMs = 600000) => {
  return Promise.race([
    convertVideo(inputPath, outputPath, targetFormat, quality),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Conversion timeout')), timeoutMs)
    )
  ]);
};

module.exports = { convertVideo, convertVideoWithTimeout };
