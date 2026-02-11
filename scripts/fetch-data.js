import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GITHUB_API_BASE = 'https://api.github.com/repos/chromium/chromium';
const TOKEN = process.env.VITE_GITHUB_TOKEN;

const headers = {
  'User-Agent': 'Gemini-CLI-Data-Fetcher',
  'Accept': 'application/vnd.github.v3+json'
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const REQUEST_DELAY = 500; // ms

if (TOKEN) {
  headers['Authorization'] = `token ${TOKEN}`; 
} else {
  console.warn('No VITE_GITHUB_TOKEN found. API rate limits will be very restrictive.');
}

async function fetchDirectory(path) {
  await sleep(REQUEST_DELAY);
  console.log(`Fetching directory: ${path}`);
  try {
    const response = await axios.get(`${GITHUB_API_BASE}/contents/${path}`, { headers });
    return response.data;
  } catch (e) {
    if (e.response?.status === 401) {
      console.warn('Authentication failed (401). Retrying without token...');
      const { Authorization, ...restHeaders } = headers;
      const response = await axios.get(`${GITHUB_API_BASE}/contents/${path}`, { headers: restHeaders });
      return response.data;
    }
    throw e;
  }
}

async function fetchFileContent(path) {
  await sleep(REQUEST_DELAY);
  try {
    const response = await axios.get(`${GITHUB_API_BASE}/contents/${path}`, {
      headers: { ...headers, 'Accept': 'application/vnd.github.v3.raw' }
    });
    return response.data;
  } catch (e) {
    if (e.response?.status === 401) {
      const { Authorization, ...restHeaders } = headers;
      const response = await axios.get(`${GITHUB_API_BASE}/contents/${path}`, {
        headers: { ...restHeaders, 'Accept': 'application/vnd.github.v3.raw' }
      });
      return response.data;
    }
    throw e;
  }
}

function parseIncludes(content) {
  const includeRegex = /#include\s+(["<])([^">]+)([">])/g;
  const includes = [];
  let match;
  while ((match = includeRegex.exec(content)) !== null) {
    includes.push({
      path: match[2],
      isSystem: match[1] === '<'
    });
  }
  return includes;
}

async function analyzeDependencies(targetPath) {
  console.log(`Analyzing dependencies for: ${targetPath}`);
  try {
    const files = await fetchDirectory(targetPath);
    
    const subDirs = files
      .filter(f => f.type === 'dir')
      .map(f => f.path)
      .sort();

    const cppFiles = files.filter(f => f.type === 'file' && (
      f.name.endsWith('.cc') || 
      f.name.endsWith('.cpp') || 
      f.name.endsWith('.h') || 
      f.name.endsWith('.hpp')
    ));
    
    const nodes = [];
    const links = [];
    const inDegree = {};
    const internalFiles = new Set(cppFiles.map(f => f.name));

    cppFiles.forEach(f => {
      nodes.push({ id: f.name, group: 1, val: 10, isExternal: false, isSystem: false, fullPath: f.path });
      inDegree[f.name] = 0;
    });

    const externalNodes = new Map();

    for (const file of cppFiles) {
      try {
        const content = await fetchFileContent(file.path);
        const includes = parseIncludes(content);
        
        includes.forEach(inc => {
          const incName = inc.path.split('/').pop() || '';
          if (internalFiles.has(incName)) {
            links.push({ source: file.name, target: incName });
            inDegree[incName]++;
          } else {
            links.push({ source: file.name, target: incName });
            externalNodes.set(incName, { fullPath: inc.path, isSystem: inc.isSystem });
            inDegree[incName] = (inDegree[incName] || 0) + 1;
          }
        });
      } catch (e) {
        console.error(`Failed to fetch ${file.path}: ${e.message}`);
      }
    }

    externalNodes.forEach((info, name) => {
      nodes.push({ id: name, group: 2, val: 8, isExternal: true, isSystem: info.isSystem, fullPath: info.fullPath });
    });

    const leafNodes = Object.keys(inDegree).filter(name => inDegree[name] === 0 && !externalNodes.has(name));
    const finalNodes = nodes.map(n => ({
      ...n,
      inDegree: inDegree[n.id] || 0
    }));

    return {
      graph: { nodes: finalNodes, links, leafNodes },
      subDirs
    };
  } catch (err) {
    console.error(`Error analyzing ${targetPath}: ${err.message}`);
    return null;
  }
}

async function main() {
  const outputDir = path.join(__dirname, '../public/data');
  const rootsDir = path.join(outputDir, 'roots');

  if (!fs.existsSync(rootsDir)) {
    fs.mkdirSync(rootsDir, { recursive: true });
  }

  try {
    const rootItems = await fetchDirectory('');
    const rootDirs = rootItems
      .filter(item => item.type === 'dir' && !item.name.startsWith('.'))
      .map(item => item.name)
      .sort();

    // Save the list of available roots
    fs.writeFileSync(path.join(outputDir, 'roots.json'), JSON.stringify(rootDirs, null, 2));

    // Limit crawling to prevent extreme API usage while demonstrating the multi-file approach
    // In a real run with a high-limit token, you'd remove the slice(0, 10)
    const activeRoots = rootDirs.slice(0, 10); 

    for (const root of activeRoots) {
      const rootData = { graphs: {} };
      
      // 1. Analyze the root itself
      const rootResult = await analyzeDependencies(root);
      if (rootResult) {
        rootData.graphs[root] = rootResult;
        
        // 2. Analyze subdirectories of this root
        for (const subDir of rootResult.subDirs) {
          const subResult = await analyzeDependencies(subDir);
          if (subResult) {
            rootData.graphs[subDir] = subResult;
          }
        }
      }

      // Save each root to its own file
      const safeFileName = root.replace(/\//g, '_') + '.json';
      fs.writeFileSync(path.join(rootsDir, safeFileName), JSON.stringify(rootData, null, 2));
      console.log(`Saved root data for ${root} to roots/${safeFileName}`);
    }

    console.log(`Successfully generated roots.json and individual root files.`);

  } catch (err) {
    console.error(`Main error: ${err.message}`);
    process.exit(1);
  }
}

main();
