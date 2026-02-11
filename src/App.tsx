import React, { useState, useEffect, useRef, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { FileCode, AlertCircle, Loader2, ChevronDown, Folder, Download, Eye, EyeOff, Search, X } from 'lucide-react';

interface DependencyGraph {
  nodes: any[];
  links: { source: string; target: string }[];
  leafNodes: string[];
}

function App() {
  const fgRef = useRef<any>(null);
  const [path, setPath] = useState('base/memory');
  const [loading, setLoading] = useState(true);
  const [showSystem, setShowSystem] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(-1);
  const [highlightNode, setHighlightNode] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<DependencyGraph>({ nodes: [], links: [], leafNodes: [] });
  const [error, setError] = useState<string | null>(null);
  const [availableDirs, setAvailableDirs] = useState<string[]>([]);
  const [subDirs, setSubDirs] = useState<string[]>([]);
  const [preFetchedData, setPreFetchedData] = useState<any>(null);

  // Reset search state when query or data changes
  useEffect(() => {
    setSearchIndex(-1);
    setHighlightNode(null);
  }, [searchQuery, graphData]);

  // Fetch pre-fetched data on mount
  useEffect(() => {
    const loadPreFetchedData = async () => {
      try {
        const response = await fetch('/data/dependencies.json');
        if (response.ok) {
          const data = await response.json();
          setPreFetchedData(data);
          setAvailableDirs(data.rootDirs || []);
          setLoading(false);
        } else {
          setError('Failed to load dependency data. Please run "npm run fetch-data" first.');
          setLoading(false);
        }
      } catch (e) {
        console.error('Failed to load pre-fetched data', e);
        setError('Failed to load dependency data. Please run "npm run fetch-data" first.');
        setLoading(false);
      }
    };
    loadPreFetchedData();
  }, []); // Only on mount

  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force('charge').strength(-150);
      fgRef.current.d3Force('link').distance(100);
    }
  }, [graphData]);

  const analyzeDependencies = (targetPath: string) => {
    if (!preFetchedData) return;
    
    setLoading(true);
    setError(null);
    setSubDirs([]);
    setHighlightNode(null);

    // Try pre-fetched data
    if (preFetchedData.graphs?.[targetPath]) {
      const { graph, subDirs: fetchedSubDirs } = preFetchedData.graphs[targetPath];
      setGraphData(graph);
      setSubDirs(fetchedSubDirs || []);
    } else {
      setGraphData({ nodes: [], links: [], leafNodes: [] });
      setError(`No pre-fetched data available for "${targetPath}". Run the fetch-data script to include this directory.`);
    }
    setLoading(false);
  };

  const filteredData = useMemo(() => {
    if (showSystem) return graphData;
    
    const nodes = graphData.nodes.filter(n => !n.isSystem);
    const nodeIds = new Set(nodes.map(n => n.id));
    const links = graphData.links.filter(l => {
      const sourceId = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const targetId = typeof l.target === 'object' ? (l.target as any).id : l.target;
      return nodeIds.has(sourceId) && nodeIds.has(targetId);
    });
    
    return { nodes, links, leafNodes: graphData.leafNodes };
  }, [graphData, showSystem]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;

    const matches = filteredData.nodes.filter(n => 
      n.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (n.fullPath && n.fullPath.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    if (matches.length > 0) {
      const nextIndex = (searchIndex + 1) % matches.length;
      const node = matches[nextIndex];
      setSearchIndex(nextIndex);
      setHighlightNode(node.id);
      
      if (fgRef.current) {
        fgRef.current.centerAt(node.x, node.y, 1000);
        fgRef.current.zoom(2.5, 1000);
      }
    }
  };

  const downloadUnreferencedFiles = () => {
    const content = graphData.leafNodes
      .map(nodeId => {
        const node = graphData.nodes.find(n => n.id === nodeId);
        return node?.fullPath || nodeId;
      })
      .join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `unreferenced_files_${path.replace(/\//g, '_')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    analyzeDependencies(path);
  }, [path]);

  return (
    <div className="flex h-screen bg-slate-900 text-white font-sans">
      {/* Sidebar */}
      <div className="w-80 border-r border-slate-700 flex flex-col bg-slate-800 shrink-0 overflow-hidden">
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileCode className="text-blue-400" />
            Chromium C++ Dependencies Tracker
          </h1>
          <p className="text-xs text-slate-400 mt-1">Include Dependency Visualizer</p>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Search Box */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Find File</label>
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Filename or path..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-300"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button 
                  type="button"
                  onClick={() => {setSearchQuery(''); setHighlightNode(null);}}
                  className="absolute right-3 top-2.5 text-slate-500 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </form>
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

          {/* Folder Select & Toggle */}
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Quick Jump</label>
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

            <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg border border-slate-700">
              <div className="flex items-center gap-2">
                {showSystem ? <Eye className="h-3 w-3 text-blue-400" /> : <EyeOff className="h-3 w-3 text-slate-500" />}
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">System Includes</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={showSystem}
                  onChange={(e) => setShowSystem(e.target.checked)}
                />
                <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
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

        <div className="flex-1 overflow-y-auto p-4 border-t border-slate-700 min-h-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-2">
              <AlertCircle className="h-3 w-3" />
              Unreferenced Files ({graphData.leafNodes.length})
            </h2>
            {graphData.leafNodes.length > 0 && (
              <button 
                onClick={downloadUnreferencedFiles}
                className="p-1.5 hover:bg-slate-700 rounded-md text-slate-400 hover:text-blue-400 transition-all active:scale-95"
                title="Download full paths"
              >
                <Download className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="space-y-2">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Loader2 className="animate-spin text-blue-500" />
                <span className="text-xs text-slate-500">Loading dependencies...</span>
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
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 bg-slate-400 rounded-full"></div>
                <span>Referenced Node</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
                <span>Not Loaded (External)</span>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-700 text-slate-400">
                <span className="font-semibold text-blue-400"># (N)</span>: Filename (Count of refs)
              </div>
           </div>
        </div>

        {filteredData.nodes.length > 0 ? (
          <ForceGraph2D
            ref={fgRef}
            graphData={filteredData as any}
            nodeLabel="fullPath"
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              const label = `${node.id} (${node.inDegree || 0})`;
              const fontSize = 14 / globalScale;
              ctx.font = `${fontSize}px Inter, Sans-Serif`;
              const textWidth = ctx.measureText(label).width;
              const padding = 4 / globalScale;
              const width = textWidth + padding * 2;
              const height = fontSize + padding * 2;

              let color = '#94a3b8'; // Default referenced
              if (node.isExternal) {
                color = '#f59e0b'; // Amber 500
              } else if (graphData.leafNodes.includes(node.id)) {
                color = '#3b82f6'; // Blue 500
              }
              
              // Draw Highlight if searched
              if (highlightNode === node.id) {
                ctx.shadowColor = '#fff';
                ctx.shadowBlur = 15;
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2 / globalScale;
                ctx.beginPath();
                ctx.roundRect(node.x - width / 2 - 2, node.y - height / 2 - 2, width + 4, height + 4, (2 / globalScale) + 1);
                ctx.stroke();
              }

              // Draw rounded rectangle
              ctx.fillStyle = color;
              const r = 2 / globalScale; // border radius
              ctx.beginPath();
              ctx.roundRect(node.x - width / 2, node.y - height / 2, width, height, r);
              ctx.fill();

              // Reset shadow
              ctx.shadowBlur = 0;

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
            linkDirectionalArrowLength={13}
            linkDirectionalArrowRelPos={0.5}
            backgroundColor="#0f172a"
          />
        ) : !loading && (
          <div className="flex items-center justify-center h-full text-slate-500">
            {error ? `Analysis failed: ${error}` : 'Loading initial directory...'}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
