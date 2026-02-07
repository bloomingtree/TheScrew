const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function setupPython() {
  console.log('Setting up Python dependencies for Zero Employee...');

  // Check Python
  let pythonCommand = 'python';
  try {
    const pythonVersion = execSync('python --version', { encoding: 'utf-8' });
    console.log('Found Python:', pythonVersion.trim());
  } catch {
    // Try python3
    try {
      const pythonVersion = execSync('python3 --version', { encoding: 'utf-8' });
      console.log('Found Python:', pythonVersion.trim());
      pythonCommand = 'python3';
    } catch {
      try {
        const pythonVersion = execSync('py --version', { encoding: 'utf-8' });
        console.log('Found Python:', pythonVersion.trim());
        pythonCommand = 'py';
      } catch {
        console.error('Python 3.8+ is required but not found.');
        console.error('Please install Python from https://python.org');
        process.exit(1);
      }
    }
  }

  // Check if requirements.txt exists
  const requirementsPath = path.join(__dirname, '..', 'requirements.txt');

  if (!fs.existsSync(requirementsPath)) {
    console.error('requirements.txt not found. Please create it first.');
    process.exit(1);
  }

  // Install Python dependencies
  console.log('Installing Python dependencies...');
  try {
    execSync(`${pythonCommand} -m pip install -r "${requirementsPath}"`, {
      stdio: 'inherit',
      shell: true
    });
    console.log('Python dependencies installed successfully.');
  } catch (error) {
    console.warn('Warning: Failed to install Python dependencies automatically.');
    console.warn(`Please run manually: ${pythonCommand} -m pip install -r requirements.txt`);
  }

  console.log('Python setup complete!');
}

setupPython();
