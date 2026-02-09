/**
 * File Type Detection Utility
 *
 * Determines whether a file is text or binary based on its extension.
 * Used by the Pyodide file system bridge to decide on the encoding method.
 */

/**
 * Text file extensions that are safe to read as UTF-8
 */
const TEXT_EXTENSIONS = new Set([
  // Programming languages
  '.py', '.pyw', '.pyi',
  '.js', '.jsx', '.mjs', '.cjs',
  '.ts', '.tsx',
  '.java', '.kt', '.kts',
  '.go', '.rs',
  '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx',
  '.cs', '.vb',
  '.swift', '.m', '.mm',
  '.php', '.phtml',
  '.rb', '.gemspec',
  '.pl', '.pm', '.t',
  '.lua',
  '.r', '.rmd',
  '.scala', '.sc',
  '.clj', '.cljs', '.cljc',
  '.ex', '.exs',

  // Web technologies
  '.html', '.htm', '.xhtml', '.shtml',
  '.css', '.scss', '.sass', '.less',
  '.xml', '.xsl', '.xsd', '.xslt', '.svg',
  '.json', '.jsonc', '.jsonl',
  '.yaml', '.yml',
  '.toml',
  '.graphql', '.gql',

  // Scripts and configs
  '.sh', '.bash', '.zsh', '.fish', '.csh', '.tcsh',
  '.bat', '.cmd', '.ps1', '.psm1', '.psd1', '.ps1xml',
  '.vim', '.vimrc',
  '.emacs', '.el',
  '.editorconfig',
  '.eslintrc', '.eslintignore', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yaml',
  '.prettierrc', '.prettierignore',
  '.babelrc', '.babelrc.js', '.babelrc.json',

  // Documentation and text
  '.txt', '.text',
  '.md', '.markdown', '.mdown', '.mkd',
  '.rst',
  '.adoc', '.asciidoc',
  '.log',
  '.csv', '.tsv',
  '.rss', '.atom',

  // Package configs
  '.ini', '.cfg', '.conf', '.config', '.configs',
  '.env', '.env.local', '.env.development', '.env.production', '.env.test',
  '.gitignore', '.gitattributes', '.gitmodules', '.gitconfig',
  '.hgignore', '.hgignore',
  '.dockerignore', '.dockerfile',
  '.npmignore', '.npmrc',
  '.yarnrc',
  '.babelignore',

  // Makefiles and build files
  'Makefile', 'makefile', 'Makefile.am', 'Makefile.in',
  'CMakeLists.txt', 'cmake',
  '.mk',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',

  // License files
  'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE.rst',
  'COPYING', 'COPYING.txt',
  'NOTICE', 'NOTICE.txt',
  'AUTHORS', 'AUTHORS.txt',
  'README', 'README.md', 'README.txt', 'README.rst',
  'CHANGELOG', 'CHANGELOG.md', 'CHANGES', 'CHANGES.md',
  'CONTRIBUTING', 'CONTRIBUTING.md',
  'CODE_OF_CONDUCT', 'CODE_OF_CONDUCT.md',

  // SQL and databases
  '.sql', '.psql',
  '.db', '.db3', '.sqlite', '.sqlite3',

  // Key and certificate files (text-based)
  '.pem', '.crt', '.cer', '.key', '.pub', '.csr',
  '.ssh', '.known_hosts',

  // Jupyter and notebooks
  '.ipynb',

  // Templates
  '.jinja', '.jinja2', '.j2',
  '.mustache', '.handlebars', '.hbs',
  '.erb', '.ejs',
  '.liquid',
  '.twig',
  '.smarty',

  // Other text formats
  '.pot', '.po',
  '.tsv',
  '.properties',
  '.sub', '.srt',
  '.vtt',
]);

/**
 * Binary file extensions that must be read as binary
 */
const BINARY_EXTENSIONS = new Set([
  // Office documents
  '.doc', '.docx', '.dot', '.dotx',
  '.xls', '.xlsx', '.xlsm', '.xlsb', '.xlt', '.xltx',
  '.ppt', '.pptx', '.pps', '.ppsx', '.pot', '.potx',
  '.odt', '.ods', '.odp', '.odg',

  // Archives
  '.zip', '.zipx', '.z',
  '.tar', '.tar.gz', '.tar.bz2', '.tar.xz', '.tar.lz', '.tar.Z',
  '.gz', '.bz2', '.xz', '.lz', '.lzma', '.Z', '.zst',
  '.7z', '.s7z',
  '.rar',
  '.cab',
  '.iso', '.img', '.dmg',
  '.deb', '.rpm',
  '.jar', '.war', '.ear', '.nar',

  // Images
  '.png', '.jpg', '.jpeg', '.jpe', '.jfif',
  '.gif', '.gifv',
  '.bmp', '.dib',
  '.webp', '.heic', '.heif',
  '.ico', '.cur',
  '.tiff', '.tif',
  '.psd', '.psb',
  '.ai', '.eps',
  '.raw', '.cr2', '.nef', '.arw',
  '.avif', '.jxl',
  '.svg', '.svgz',  // SVG is text but often used as binary

  // PDFs
  '.pdf',

  // Executables and binaries
  '.exe', '.dll', '.sys', '.drv',
  '.so', '.so.1', '.so.2', '.so.3', '.so.4', '.so.5', '.so.6',
  '.dylib', '.dylib.1', '.dylib.2',
  '.bin',
  '.o', '.a', '.lib',
  '.obj',
  '.class',
  '.dex',
  '.wasm', '.wat',
  '.app', '.apk',

  // Media
  '.mp3', '.mp2', '.mp1', '.mpga',
  '.wav', '.wave',
  '.flac', '.alac',
  '.aac', '.m4a', '.m4b', '.m4p', '.m4r', '.m4v',
  '.ogg', '.oga', '.ogv', '.ogx', '.opus', '.spx',
  '.wma', '.wmv',
  '.avi', '.mp4', '.mpg', '.mpeg', '.mov', '.mkv', '.webm', '.flv',
  '.3gp', '.3g2',
  '.rm', '.rmvb',
  '.asf',
  '.mts', '.m2ts',

  // Fonts
  '.ttf', '.otf', '.woff', '.woff2', '.eot', '.fon', '.fnt',

  // Database files
  '.mdb', '.accdb',
  '.db', '.db3', '.sqlite', '.sqlite3',  // Can be text or binary, treat as binary
  '.frm', '.myd', '.myi',

  // Other binary formats
  '.swf', '.fla',
  '.dat',
  '.bin',
  '.rom',
  '.iso',
  '.img',
  '.disk',
  '.sparseimage',
  '.bundle',
  '.pkg',
  '.dmg',
  '.toast',
  '.cue',
  '.toast',
]);

/**
 * Determine if a file is binary based on its extension
 *
 * @param filename - The file name or path
 * @returns true if binary, false if text
 */
export function isBinaryFile(filename: string): boolean {
  // Normalize the filename to lowercase for case-insensitive comparison
  const lowerName = filename.toLowerCase();

  // Check for explicit binary extensions
  for (const ext of BINARY_EXTENSIONS) {
    if (lowerName.endsWith(ext)) {
      return true;
    }
  }

  // Check for explicit text extensions
  for (const ext of TEXT_EXTENSIONS) {
    if (lowerName.endsWith(ext)) {
      return false;
    }
  }

  // If no extension matches, default to binary (safer default)
  // This prevents corrupting unknown file types
  return !lowerName.includes('.');
}

/**
 * Get the appropriate encoding for a file based on its extension
 *
 * @param filename - The file name or path
 * @returns 'utf-8' for text files, 'base64' for binary files
 */
export function getFileEncoding(filename: string): 'utf-8' | 'base64' {
  return isBinaryFile(filename) ? 'base64' : 'utf-8';
}

/**
 * Get the file extension from a filename
 *
 * @param filename - The file name or path
 * @returns The file extension (including the dot), or empty string if no extension
 */
export function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return '';
  }
  return filename.substring(lastDotIndex);
}
