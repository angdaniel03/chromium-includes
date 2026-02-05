import React, { useState, useEffect, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { FileCode, AlertCircle, Loader2, Key, ChevronDown, Folder } from 'lucide-react';
import { fetchDirectory, fetchFileContent, parseIncludes } from './githubService';
import type { DependencyGraph } from './githubService';

function App() {
  const fgRef = useRef<any>(null);
  const [path, setPath] = useState('base/memory');
  const [token, setToken] = useState(import.meta.env.VITE_GITHUB_TOKEN || '');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [graphData, setGraphData] = useState<DependencyGraph>({ nodes: [], links: [], leafNodes: [] });
  const [error, setError] = useState<string | null>(null);
  const [availableDirs, setAvailableDirs] = useState<string[]>([]);
  const [subDirs, setSubDirs] = useState<string[]>([]);

  // Fetch top-level directories on mount
  useEffect(() => {
    const loadRootDirs = async () => {
      try {
        const items = await fetchDirectory('', token);
        const dirs = items
          .filter(item => item.type === 'dir' && !item.name.startsWith('.'))
          .map(item => item.name)
          .sort();
        setAvailableDirs(dirs);
      } catch (e) {
        console.error('Failed to fetch root directories', e);
      }
    };
    loadRootDirs();
  }, [token]);

  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force('charge').strength(-150);
      fgRef.current.d3Force('link').distance(100);
    }
  }, [graphData]);

  const analyzeDependencies = async (targetPath: string) => {
    setLoading(true);
    setProgress({ current: 0, total: 0 });
    setError(null);
    setSubDirs([]);
    try {
      const files = await fetchDirectory(targetPath, token);
      
      // Store subdirectories for navigation
      const dirs = files
        .filter(f => f.type === 'dir')
        .map(f => f.path)
        .sort();
      setSubDirs(dirs);

      const cppFiles = files.filter(f => f.type === 'file' && (
        f.name.endsWith('.cc') || 
        f.name.endsWith('.cpp') || 
        f.name.endsWith('.h') || 
        f.name.endsWith('.hpp')
      ));
      
      setProgress({ current: 0, total: cppFiles.length });
      
      const nodes: { id: string; group: number; val: number }[] = [];
      const links: { source: string; target: string }[] = [];
      const inDegree: Record<string, number> = {};

      cppFiles.forEach(f => {
        nodes.push({ id: f.name, group: 1, val: 10 });
        inDegree[f.name] = 0;
      });

      for (let i = 0; i < cppFiles.length; i++) {
        const file = cppFiles[i];
        try {
          const content = await fetchFileContent(file.path, token);
          const includes = parseIncludes(content);
          
          includes.forEach(inc => {
            const incName = inc.split('/').pop() || '';
            if (inDegree[incName] !== undefined) {
              links.push({ source: file.name, target: incName });
              inDegree[incName]++;
            }
          });
          setProgress(prev => ({ ...prev, current: i + 1 }));
        } catch (e: any) {
          if (e.response?.status === 403) throw new Error('GitHub API rate limit exceeded. Please provide a Personal Access Token.');
          console.error(`Failed to fetch ${file.path}`, e);
        }
      }

      const leafNodes = Object.keys(inDegree).filter(name => inDegree[name] === 0);
      const finalNodes = nodes.map(n => ({
        ...n,
        inDegree: inDegree[n.id] || 0
      }));
      setGraphData({ nodes: finalNodes, links, leafNodes });
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data from GitHub');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    analyzeDependencies(path);
  }, [path]);

  return (
    <div className="flex h-screen bg-slate-900 text-white font-sans">
      {/* Sidebar */}
      <div className="w-80 border-r border-slate-700 flex flex-col bg-slate-800">
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileCode className="text-blue-400" />
            Chromium C++ Dependencies Tracker
          </h1>
          <p className="text-xs text-slate-400 mt-1">Include Dependency Visualizer</p>
        </div>

        <div className="p-4 space-y-4">
          {/* Token Input */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">GitHub Token (Optional)</label>
            <div className="relative">
              <Key className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="password"
                placeholder="ghp_..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-300"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
          </div>

          {/* Breadcrumbs */}
          <div className="flex flex-wrap gap-1 items-center text-[10px] text-slate-500 font-mono bg-slate-900/50 p-2 rounded border border-slate-700">
            <button onClick={() => setPath('base')} className="hover:text-blue-400">root</button>
            {path.split('/').map((part, i, arr) => (
              <React.Fragment key={part}>
                <span>/</span>
                <button 
                  onClick={() => setPath(arr.slice(0, i + 1).join('/'))}
                  className="hover:text-blue-400"
                >
                  {part}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* Folder Select */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Quick Jump</label>
            <div className="space-y-2">
              <div className="relative">
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-slate-300"
                  value={availableDirs.includes(path) ? path : 'custom'}
                  onChange={(e) => {
                    if (e.target.value !== 'custom') setPath(e.target.value);
                  }}
                >
                  <option value="custom">-- Select Root --</option>
                  {availableDirs.map(dir => (
                    <option key={dir} value={dir}>{dir}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-slate-500 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Subdirectories */}
          {subDirs.length > 0 && !loading && (
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase mb-2 block flex items-center gap-1">
                <Folder className="h-3 w-3" /> Subdirectories
              </label>
              <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto pr-1">
                {subDirs.map(dir => (
                  <button
                    key={dir}
                    onClick={() => setPath(dir)}
                    className="text-left px-2 py-1.5 bg-slate-900/30 hover:bg-slate-700 rounded text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-2 truncate"
                  >
                    <Folder className="h-3 w-3 shrink-0 text-blue-500/50" />
                    {dir.split('/').pop()}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 border-t border-slate-700">
          <h2 className="text-xs font-semibold uppercase text-slate-500 mb-4 flex items-center gap-2">
            <AlertCircle className="h-3 w-3" />
            Unreferenced Files ({graphData.leafNodes.length})
          </h2>
          <div className="space-y-2">
            {loading ? (
              <div className="space-y-4 py-4">
                <div className="flex flex-col items-center justify-center gap-2">
                  <Loader2 className="animate-spin text-blue-500" />
                  <span className="text-xs text-slate-500">Scanning {progress.current} / {progress.total} files</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-blue-500 h-full transition-all duration-300 ease-out" 
                    style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}
                  ></div>
                </div>
              </div>
            ) : (
              graphData.leafNodes.map(node => (
                <div key={node} className="p-2 bg-slate-700/50 rounded border border-slate-600 text-sm hover:bg-slate-700 transition-colors truncate">
                  {node}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative bg-slate-900">
        {error && (
          <div className="absolute top-4 right-4 z-10 bg-red-500/10 border border-red-500 text-red-500 px-4 py-2 rounded-lg text-sm max-w-md">
            {error}
          </div>
        )}
        
        <div className="absolute top-4 left-4 z-10">
           <div className="bg-slate-800/80 backdrop-blur border border-slate-700 p-3 rounded-lg text-xs">
              <div className="flex items-center gap-2 mb-1 text-blue-400 font-bold">
                <span>Directory: chromium/{path}</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span>Unreferenced (Leaf)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-slate-400 rounded-full"></div>
                <span>Referenced Node</span>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-700 text-slate-400">
                <span className="font-semibold text-blue-400"># (N)</span>: Filename (Count of refs)
              </div>
           </div>
        </div>

        {graphData.nodes.length > 0 ? (
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            nodeLabel="id"
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              const label = `${node.id} (${node.inDegree || 0})`;
              const fontSize = 14 / globalScale;
              ctx.font = `${fontSize}px Inter, Sans-Serif`;
              const textWidth = ctx.measureText(label).width;
              const padding = 4 / globalScale;
              const width = textWidth + padding * 2;
              const height = fontSize + padding * 2;

              const color = graphData.leafNodes.includes(node.id) ? '#3b82f6' : '#94a3b8';
              
              // Draw rounded rectangle
              ctx.fillStyle = color;
              const r = 2 / globalScale; // border radius
              ctx.beginPath();
              ctx.roundRect(node.x - width / 2, node.y - height / 2, width, height, r);
              ctx.fill();

              // Draw text
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = '#1e293b'; 
              ctx.fillText(label, node.x, node.y);

              // Update node's collision area
              node.__bckgDimensions = [width, height]; 
            }}
            nodePointerAreaPaint={(node: any, color, ctx) => {
              ctx.fillStyle = color;
              const bckgDimensions = node.__bckgDimensions;
              if (bckgDimensions) {
                ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);
              }
            }}
            linkColor={() => '#4bab27'}
            linkDirectionalArrowLength={20}
            linkDirectionalArrowRelPos={15}
            backgroundColor="#0f172a"
          />
        ) : !loading && (
          <div className="flex items-center justify-center h-full text-slate-500">
            {error ? 'Analysis failed. Check token or path.' : 'Loading initial directory...'}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
