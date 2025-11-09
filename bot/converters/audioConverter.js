const ffmpeg = require('fluent-ffmpeg');
const path = require('path');

const AUDIO_BITRATES = {
  high: '320k',
  medium: '192k',
  low: '128k'
};

const validatePath = (filePath) => {
  const resolvedPath = path.resolve(filePath);
  const tempDir = path.resolve(__dirname, '..', 'temp');
  return resolvedPath.startsWith(tempDir);
};

const convertAudio = (inputPath, outputPath, targetFormat, quality = 'medium') => {
  return new Promise((resolve, reject) => {
    if (!validatePath(inputPath)) {
      return reject(new Error('Invalid input path - must be in temp directory'));
    }
    if (!validatePath(outputPath)) {
      return reject(new Error('Invalid output path - must be in temp directory'));
    }

    const bitrate = AUDIO_BITRATES[quality] || AUDIO_BITRATES.medium;
    
    let command = ffmpeg(inputPath)
      .output(outputPath)
      .audioBitrate(bitrate);

    if (targetFormat === 'mp3') {
      command.audioCodec('libmp3lame');
    } else if (targetFormat === 'aac') {
      command.audioCodec('aac');
    } else if (targetFormat === 'ogg') {
      command.audioCodec('libvorbis');
    } else if (targetFormat === 'flac') {
      command.audioCodec('flac');
    }

    command
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`Processing: ${Math.round(progress.percent)}% done`);
        }
      })
      .on('end', () => {
        console.log('Audio conversion finished');
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('Audio conversion error:', err.message);
        reject(err);
      });

    command.run();
  });
};

const convertAudioWithTimeout = async (inputPath, outputPath, targetFormat, quality = 'medium', timeoutMs = 600000) => {
  return Promise.race([
    convertAudio(inputPath, outputPath, targetFormat, quality),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Conversion timeout')), timeoutMs)
    )
  ]);
};

module.exports = { convertAudio, convertAudioWithTimeout };
