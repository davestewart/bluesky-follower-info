const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// data
const manifest = JSON.parse(fs.readFileSync('./src/manifest.json', 'utf8'))
const { name, version } = manifest

// paths
const inputDir = path.join(__dirname, './src')
const outputDir = path.join(__dirname, '../releases')
const outputFile = path.join(outputDir, `${name} - ${version}.zip`)

// setup
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}
if (fs.existsSync(outputFile)) {
  fs.rmSync(outputFile)
}

// files
const files = [
  '*',
  '**/*'
].join(' ')

// zip
try {
  execSync(`npx bestzip "${outputFile}" ${files}`, {
    stdio: 'inherit',
    cwd: inputDir
  })
  console.log(`Successfully created: ${outputFile}`)
}
catch (error) {
  console.error('Error creating zip:', error)
  process.exit(1)
}
