const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs').promises;

const execPromise = util.promisify(exec);

const validatePath = (filePath) => {
  const resolvedPath = path.resolve(filePath);
  const tempDir = path.resolve(__dirname, '..', 'temp');
  return resolvedPath.startsWith(tempDir);
};

const convertDocument = async (inputPath, outputPath, targetFormat) => {
  if (!validatePath(inputPath)) {
    throw new Error('Invalid input path - must be in temp directory');
  }
  if (!validatePath(outputPath)) {
    throw new Error('Invalid output path - must be in temp directory');
  }

  const outputDir = path.dirname(outputPath);
  
  if (targetFormat === 'pdf') {
    const command = `libreoffice --headless --convert-to pdf --outdir "${outputDir}" "${inputPath}"`;
    
    try {
      const { stdout, stderr } = await execPromise(command, { timeout: 120000 });
      console.log('LibreOffice stdout:', stdout);
      if (stderr) console.error('LibreOffice stderr:', stderr);
      
      const inputFilename = path.basename(inputPath, path.extname(inputPath));
      const generatedPdf = path.join(outputDir, `${inputFilename}.pdf`);
      
      await fs.rename(generatedPdf, outputPath);
      
      return outputPath;
    } catch (error) {
      console.error('Document conversion error:', error);
      throw error;
    }
  } else if (targetFormat === 'txt') {
    const content = await fs.readFile(inputPath, 'utf8');
    await fs.writeFile(outputPath, content, 'utf8');
    return outputPath;
  } else if (targetFormat === 'md') {
    const content = await fs.readFile(inputPath, 'utf8');
    await fs.writeFile(outputPath, content, 'utf8');
    return outputPath;
  } else {
    throw new Error(`Unsupported document format: ${targetFormat}`);
  }
};

const convertDocumentWithTimeout = async (inputPath, outputPath, targetFormat, timeoutMs = 300000) => {
  return Promise.race([
    convertDocument(inputPath, outputPath, targetFormat),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Conversion timeout')), timeoutMs)
    )
  ]);
};

module.exports = { convertDocument, convertDocumentWithTimeout };
