const iconSize = 16;

function Icon({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      {children}
      <style>{`text { font-family: monospace; font-weight: 700; }`}</style>
    </svg>
  );
}

const tsIcon = (
  <Icon color="#3178c6">
    <rect x="1" y="1" width="14" height="14" rx="2" fill="#3178c6" />
    <text x="8" y="11.5" textAnchor="middle" fontSize="9" fill="#fff">TS</text>
  </Icon>
);

const tsxIcon = (
  <Icon color="#3178c6">
    <rect x="1" y="1" width="14" height="14" rx="2" fill="#1a6fb5" />
    <text x="8" y="11.5" textAnchor="middle" fontSize="7.5" fill="#fff">TSX</text>
  </Icon>
);

const jsIcon = (
  <Icon color="#f7df1e">
    <rect x="1" y="1" width="14" height="14" rx="2" fill="#f7df1e" />
    <text x="8" y="11.5" textAnchor="middle" fontSize="9" fill="#000">JS</text>
  </Icon>
);

const jsxIcon = (
  <Icon color="#61dafb">
    <rect x="1" y="1" width="14" height="14" rx="2" fill="#61dafb" />
    <text x="8" y="11.5" textAnchor="middle" fontSize="7.5" fill="#000">JSX</text>
  </Icon>
);

const cssIcon = (
  <Icon color="#663399">
    <rect x="1" y="1" width="14" height="14" rx="2" fill="#663399" />
    <text x="8" y="11.5" textAnchor="middle" fontSize="8" fill="#fff">CSS</text>
  </Icon>
);

const jsonIcon = (
  <Icon color="#cbcb41">
    <rect x="1" y="1" width="14" height="14" rx="2" fill="#cbcb41" />
    <text x="8" y="11.5" textAnchor="middle" fontSize="6" fill="#000">{'{}'}</text>
  </Icon>
);

const mdIcon = (
  <Icon color="#519aba">
    <rect x="1" y="1" width="14" height="14" rx="2" fill="#519aba" />
    <text x="8" y="11.5" textAnchor="middle" fontSize="8" fill="#fff">MD</text>
  </Icon>
);

const htmlIcon = (
  <Icon color="#e44d26">
    <rect x="1" y="1" width="14" height="14" rx="2" fill="#e44d26" />
    <text x="8" y="11.5" textAnchor="middle" fontSize="6" fill="#fff">{'<>'}</text>
  </Icon>
);

const defaultIcon = (
  <Icon color="#8b949e">
    <path d="M4 1.5h5.5L13 5v8.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-11A1.5 1.5 0 0 1 4 1.5z" stroke="#8b949e" strokeWidth="1" fill="none" />
    <path d="M9.5 1.5V5H13" stroke="#8b949e" strokeWidth="1" fill="none" />
  </Icon>
);

const extensionMap: Record<string, React.ReactNode> = {
  '.ts': tsIcon,
  '.tsx': tsxIcon,
  '.js': jsIcon,
  '.jsx': jsxIcon,
  '.mjs': jsIcon,
  '.cjs': jsIcon,
  '.css': cssIcon,
  '.scss': cssIcon,
  '.less': cssIcon,
  '.json': jsonIcon,
  '.md': mdIcon,
  '.mdx': mdIcon,
  '.html': htmlIcon,
  '.htm': htmlIcon,
};

export function getFileIcon(filename: string): React.ReactNode {
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return defaultIcon;
  const ext = filename.slice(dot).toLowerCase();
  return extensionMap[ext] ?? defaultIcon;
}
