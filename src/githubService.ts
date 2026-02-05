import axios from 'axios';

const GITHUB_API_BASE = 'https://api.github.com/repos/chromium/chromium';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
}

export interface DependencyGraph {
  nodes: { id: string; group: number; val: number; inDegree?: number; isExternal?: boolean; fullPath?: string }[];
  links: { source: string; target: string }[];
  leafNodes: string[];
}

export const fetchDirectory = async (path: string, token?: string): Promise<FileNode[]> => {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `token ${token}`;
  const response = await axios.get(`${GITHUB_API_BASE}/contents/${path}`, { headers });
  return response.data;
};

export const fetchFileContent = async (path: string, token?: string): Promise<string> => {
  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3.raw' };
  if (token) headers['Authorization'] = `token ${token}`;
  const response = await axios.get(`${GITHUB_API_BASE}/contents/${path}`, { headers });
  return response.data;
};

export const parseIncludes = (content: string): string[] => {
  const includeRegex = /#include\s+["<]([^">]+)[">]/g;
  const includes: string[] = [];
  let match;
  while ((match = includeRegex.exec(content)) !== null) {
    includes.push(match[1]);
  }
  return includes;
};
