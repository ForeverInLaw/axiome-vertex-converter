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
  
  const inputExt = path.extname(inputPath).toLowerCase();
  
  if (targetFormat === 'pdf') {
    // Use LibreOffice for PDF conversion
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
  } else if (targetFormat === 'txt' || targetFormat === 'md') {
    // Use Pandoc for text/markdown conversion
    // Using 'plain' for both to avoid escaping special characters
    const pandocFormat = 'plain';
    
    // If source is txt/md and target is txt/md, just copy
    if ((inputExt === '.txt' || inputExt === '.md') && (targetFormat === 'txt' || targetFormat === 'md')) {
      const content = await fs.readFile(inputPath, 'utf8');
      await fs.writeFile(outputPath, content, 'utf8');
      console.log(`Copied ${inputExt} to .${targetFormat}`);
      return outputPath;
    }
    
    // Otherwise use pandoc
    const command = `pandoc "${inputPath}" -o "${outputPath}" -t ${pandocFormat} --wrap=preserve`;
    
    try {
      const { stdout, stderr } = await execPromise(command, { timeout: 120000 });
      if (stdout) console.log('Pandoc stdout:', stdout);
      if (stderr) console.log('Pandoc stderr:', stderr);
      
      console.log(`Converted to ${targetFormat.toUpperCase()} using Pandoc`);
      return outputPath;
    } catch (error) {
      console.error('Pandoc conversion error:', error);
      throw error;
    }
  } else if (targetFormat === 'docx') {
    // Use Pandoc for DOCX output
    const command = `pandoc "${inputPath}" -o "${outputPath}"`;
    
    try {
      const { stdout, stderr } = await execPromise(command, { timeout: 120000 });
      if (stdout) console.log('Pandoc stdout:', stdout);
      if (stderr) console.log('Pandoc stderr:', stderr);
      
      console.log('Converted to DOCX using Pandoc');
      return outputPath;
    } catch (error) {
      console.error('Pandoc conversion error:', error);
      throw error;
    }
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
