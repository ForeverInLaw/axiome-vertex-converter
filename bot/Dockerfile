FROM node:20-slim

# Run as non-root user
RUN useradd -m -u 1001 botuser

# Install FFmpeg, LibreOffice, Pandoc, Sharp dependencies, libheif for HEIC/HEIF support
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libreoffice \
    pandoc \
    libvips-dev \
    libheif-examples \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN npm install -g pnpm@latest

WORKDIR /usr/src/app/bot

# Copy package files (pnpm uses pnpm-lock.yaml)
COPY package.json pnpm-lock.yaml* ./

# Install dependencies with pnpm
RUN pnpm install --prod --frozen-lockfile

# Copy bot files
COPY . .

# Create temp directory and set permissions
RUN mkdir -p temp && chown -R botuser:botuser /usr/src/app

# Switch to non-root user
USER botuser

CMD ["sh", "-c", "node payment-verifier.js & node main.js"]
