import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import useStore from '../store'

// ── scratch objects ──────────────────────────────────────────────────────────
const _matrix = new THREE.Matrix4()
const _color  = new THREE.Color()
const _quat   = new THREE.Quaternion()
const _scale  = new THREE.Vector3()
const _pos    = new THREE.Vector3()
const _yAxis  = new THREE.Vector3(0, 1, 0)

const PLANET_GEO = new THREE.SphereGeometry(1, 32, 32)
const MOON_GEO   = new THREE.SphereGeometry(1, 14, 14)

// ── language lookup ──────────────────────────────────────────────────────────
const LANG_BY_EXT = {
  py: 'python', js: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', java: 'java',
  go: 'go', cpp: 'cpp', c: 'c', h: 'c', cs: 'csharp',
  rb: 'ruby', rs: 'rust', php: 'php', md: 'markdown',
}
const LANG_COLORS = {
  python: '#818cf8', javascript: '#fbbf24', typescript: '#38bdf8',
  java: '#fb923c', go: '#34d399', cpp: '#2dd4bf', c: '#a3e635',
  csharp: '#c084fc', ruby: '#f87171', rust: '#fb7185', php: '#a78bfa',
  markdown: '#64748b', unknown: '#94a3b8',
}
function getLang(fp) { return LANG_BY_EXT[(fp.split('.').pop() || '').toLowerCase()] || 'unknown' }
function easeOut(t) { return 1 - (1 - t) * (1 - t) }

// ── Shared GLSL noise helpers ────────────────────────────────────────────────
const GLSL_NOISE = /* glsl */`
  float hash2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float hash3(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
  float n2(vec2 p){ vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
    return mix(mix(hash2(i),hash2(i+vec2(1,0)),u.x),mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)),u.x),u.y); }
  float n3(vec3 p){ vec3 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
    return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),u.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),u.x),u.y),
               mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),u.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),u.x),u.y),u.z); }
  float fbm(vec3 p){ return n3(p)*0.5+n3(p*2.1)*0.25+n3(p*4.3)*0.125; }
`

// ── Planet vertex shader (organic displacement) ───────────────────────────────
const PLANET_VERT = /* glsl */`
  attribute mat4 instanceMatrix;
  attribute vec3 instanceColor;
  uniform float uTime;

  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec2 vUv;
  varying vec3 vPos;

  ${GLSL_NOISE}

  void main() {
    vColor = instanceColor;
    vUv    = uv;
    vPos   = normal; // world-space normal as surface coord

    float d = n3(normal * 3.5 + uTime * 0.01) * 0.07
            + n3(normal * 7.0 - uTime * 0.007) * 0.035;
    vec3 displaced   = position + normal * d;
    vec3 dispNormal  = normalize(normal + vec3(d) * 0.35);
    vNormal          = normalize(normalMatrix * mat3(instanceMatrix) * dispNormal);

    vec4 mvPos  = modelViewMatrix * instanceMatrix * vec4(displaced, 1.0);
    vViewPos    = -mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`

// ── Planet fragment: 5 distinct surface types driven by hue ─────────────────
const PLANET_FRAG = /* glsl */`
  uniform float uTime;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec2 vUv;
  varying vec3 vPos;

  ${GLSL_NOISE}

  // ─ Jupiter-style gas giant (Python / indigo langs) ─
  vec3 gasGiant(vec3 col, vec3 p, float t) {
    float lat  = p.y;
    float turb = n2(vec2(p.x * 3.0 + t * 0.015, lat * 5.0)) * 1.6;
    float band = sin(lat * 13.0 + turb) * 0.5 + 0.5;
    float fine = sin(lat * 31.0 + turb * 2.0) * 0.5 + 0.5;
    vec3 cream = vec3(0.86, 0.77, 0.62);
    vec3 rust  = vec3(0.58, 0.40, 0.27);
    vec3 base  = mix(rust, cream, band * 0.75 + fine * 0.25);
    // great red spot: oval blotch fixed on the surface
    vec2 spotUV = vec2(p.x - 0.55, (lat + 0.28) * 1.9);
    float spot  = smoothstep(0.38, 0.12, length(spotUV));
    base = mix(base, vec3(0.72, 0.28, 0.16), spot * 0.85);
    return base;
  }

  // ─ Mars-style desert (JavaScript amber, Java orange) ─
  vec3 desert(vec3 col, vec3 p, float t) {
    float rock  = fbm(p * 4.0);
    float maria = smoothstep(0.42, 0.62, fbm(p * 2.2 + 3.7)); // dark basalt plains
    vec3 rust   = vec3(0.69, 0.39, 0.21);
    vec3 sand   = vec3(0.82, 0.58, 0.36);
    vec3 dark   = vec3(0.38, 0.20, 0.11);
    vec3 base   = mix(mix(rust, sand, rock), dark, maria * 0.55);
    // thin polar caps
    float polar = smoothstep(0.82, 0.94, abs(p.y));
    base = mix(base, vec3(0.92, 0.90, 0.86), polar);
    return base;
  }

  // ─ Neptune-style ice giant (TypeScript sky-blue) ─
  vec3 icePlanet(vec3 col, vec3 p, float t) {
    float lat   = p.y;
    float band  = sin(lat * 9.0 + n2(vec2(p.x * 2.0, lat * 3.0)) * 1.2) * 0.5 + 0.5;
    vec3 deep   = vec3(0.10, 0.22, 0.62);
    vec3 light  = vec3(0.28, 0.48, 0.88);
    vec3 base   = mix(deep, light, band * 0.6 + 0.2);
    // bright methane cloud streaks
    float streak = smoothstep(0.62, 0.82, n2(vec2(p.x * 5.0 + t * 0.02, lat * 14.0)));
    base += vec3(0.75, 0.85, 1.0) * streak * 0.30;
    return base;
  }

  // ─ Io-style volcanic world (Rust, Ruby red-orange) ─
  vec3 lava(vec3 col, vec3 p, float t) {
    float flow   = fbm(p * 5.0 + vec3(0.0, t * 0.03, 0.0));
    float cracks = smoothstep(0.58, 0.82, flow);
    vec3 basalt  = vec3(0.16, 0.12, 0.10);
    vec3 sulfur  = vec3(0.55, 0.45, 0.22);
    float patch  = smoothstep(0.35, 0.6, fbm(p * 2.4 + 7.1));
    vec3 base    = mix(basalt, sulfur, patch * 0.5);
    base = mix(base, vec3(1.0, 0.38, 0.05), cracks); // glowing lava channels
    return base;
  }

  // ─ Earth-style ocean world (Go teal) ─
  vec3 ocean(vec3 col, vec3 p, float t) {
    float land  = smoothstep(0.50, 0.58, fbm(p * 2.6 + 1.3)); // continents
    float hills = fbm(p * 6.0);
    vec3 deepSea  = vec3(0.03, 0.13, 0.36);
    vec3 shelfSea = vec3(0.07, 0.27, 0.52);
    float shelf = smoothstep(0.40, 0.50, fbm(p * 2.6 + 1.3));
    vec3 water  = mix(deepSea, shelfSea, shelf);
    vec3 plains = vec3(0.20, 0.32, 0.12);
    vec3 ridges = vec3(0.42, 0.36, 0.24);
    vec3 terra  = mix(plains, ridges, hills);
    vec3 base   = mix(water, terra, land);
    // polar ice caps
    float polar = smoothstep(0.72, 0.86, abs(p.y));
    base = mix(base, vec3(0.93, 0.95, 0.97), polar);
    return base;
  }

  // ─ Hue classifier (RGB → planet type 0-4) ─
  int planetType(vec3 c) {
    float maxC = max(c.r, max(c.g, c.b));
    // purple/indigo (Python) → gas giant
    if (c.b > 0.45 && c.r > 0.3 && c.g < 0.55) return 0;
    // amber/yellow (JavaScript) → desert
    if (c.r > 0.7 && c.g > 0.5 && c.b < 0.3) return 1;
    // teal/cyan (Go, TypeScript) → ice+ocean mix
    if (c.g > 0.55 && c.b > 0.45 && c.r < 0.5) return 2;
    // red/orange (Java, Ruby, Rust) → lava
    if (c.r > 0.75 && c.g < 0.55 && c.b < 0.5) return 3;
    // sky blue (TypeScript strong blue) → ice
    if (c.b > 0.7 && c.g > 0.5 && c.r < 0.35) return 4;
    return 1; // default: rocky desert
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPos);
    vec3 L = normalize(vec3(0.6, 0.8, 0.5));

    // sharper day/night terminator
    float ndotl = dot(N, L);
    float diff  = smoothstep(-0.18, 0.35, ndotl) * 0.85 + 0.12;
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.2);

    int ptype = planetType(vColor);
    vec3 surface;
    if      (ptype == 0) surface = gasGiant(vColor, vPos, uTime);
    else if (ptype == 2) surface = ocean(vColor, vPos, uTime);
    else if (ptype == 3) surface = lava(vColor, vPos, uTime);
    else if (ptype == 4) surface = icePlanet(vColor, vPos, uTime);
    else                 surface = desert(vColor, vPos, uTime);

    // drifting cloud layer — earth-style ocean worlds only
    if (ptype == 2) {
      float c = fbm(vPos * 2.6 + vec3(uTime * 0.009, 0.0, uTime * 0.007));
      float cloudMask = smoothstep(0.52, 0.78, c);
      vec3  cloudCol  = vec3(0.94, 0.96, 1.0) * (diff * 0.85 + 0.15);
      surface = mix(surface, cloudCol, cloudMask * 0.5);
    }

    // subtle language tint so planets stay distinguishable in the legend
    surface = mix(surface, surface * (0.45 + vColor * 1.1), 0.16);

    vec3 base = surface * diff;

    // thin atmospheric rim in the language colour (identity halo)
    float rimStr = (ptype == 2 || ptype == 4) ? 1.1 : 0.7;
    base += vColor * fresnel * rimStr;

    // specular: strong glint on water only, faint elsewhere
    vec3 H    = normalize(L + V);
    float specPow = (ptype == 2) ? 110.0 : 38.0;
    float specStr = (ptype == 2) ? 0.6 : 0.08;
    float spec = pow(max(dot(N, H), 0.0), specPow);
    base += vec3(0.95, 0.97, 1.0) * spec * specStr;

    // lava self-glow on dark side
    if (ptype == 3) {
      float glow = fbm(vPos * 5.0 + vec3(0.0, uTime * 0.04, 0.0));
      float hotspot = smoothstep(0.58, 0.85, glow);
      float darkSide = 1.0 - smoothstep(-0.1, 0.3, ndotl);
      base += vec3(1.0, 0.3, 0.02) * hotspot * darkSide * 0.8;
    }

    base += vColor * 0.04; // faint emissive so bloom stays subtle

    gl_FragColor = vec4(base, 1.0);
  }
`

// ── Moon shader: simpler glow ─────────────────────────────────────────────────
const MOON_VERT = /* glsl */`
  attribute mat4 instanceMatrix;
  attribute vec3 instanceColor;
  uniform float uTime;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  ${GLSL_NOISE}

  void main() {
    vColor = instanceColor;
    // cratered surface — stronger, higher-frequency displacement
    float d = n3(normal * 7.0) * 0.16 + n3(normal * 14.0) * 0.07;
    vec3 displaced = position + normal * d;
    vNormal  = normalize(normalMatrix * mat3(instanceMatrix) * normalize(normal + vec3(d)*0.3));
    vec4 mvPos   = modelViewMatrix * instanceMatrix * vec4(displaced, 1.0);
    vViewPos     = -mvPos.xyz;
    gl_Position  = projectionMatrix * mvPos;
  }
`
const MOON_FRAG = /* glsl */`
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPos);
    vec3 L = normalize(vec3(0.6, 0.8, 0.5));
    float diff    = max(dot(N, L), 0.0) * 0.68 + 0.32;
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.2);
    // specular
    vec3  H    = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 38.0);
    vec3 col = vColor * diff;
    col += vColor * fresnel * 2.0;
    col += vec3(1.0) * spec * 0.2;
    col += vColor * 0.2;
    gl_FragColor = vec4(col, 1.0);
  }
`

// ── Saturn-style flat ring discs on the largest planets ─────────────────────
function PlanetRings({ filePlanets, expandedFileId }) {
  return filePlanets.filter(p => p.chunks.length >= 5).map(p => {
    const isExp = p.file_path === expandedFileId
    return (
      <group key={p.id} position={[p.x, p.y, p.z]} rotation={[Math.PI * 0.42, 0.18, 0]}>
        {/* main ring annulus */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[p.size * 1.45, p.size * 2.1, 72]} />
          <meshBasicMaterial
            color="#c9b896"
            transparent opacity={isExp ? 0.5 : 0.28} depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* outer band past the Cassini-style gap */}
        {p.chunks.length >= 8 && (
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[p.size * 2.22, p.size * 2.55, 72]} />
            <meshBasicMaterial
              color="#a89878"
              transparent opacity={isExp ? 0.32 : 0.16} depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        )}
      </group>
    )
  })
}

// ── Folder constellation labels ───────────────────────────────────────────────
// Groups file-planets by top-level directory and floats a faint billboarded
// label above each cluster's centroid — the galaxy reads as a knowledge graph.
function ConstellationLabels({ filePlanets, expandedFileId }) {
  const folders = useMemo(() => {
    const byFolder = {}
    for (const p of filePlanets) {
      const folder = p.file_path.includes('/') ? p.file_path.split('/')[0] : null
      if (!folder) continue
      ;(byFolder[folder] ??= []).push(p)
    }
    return Object.entries(byFolder)
      .filter(([, planets]) => planets.length >= 2)
      .map(([name, planets]) => ({
        name,
        x: planets.reduce((s, p) => s + p.x, 0) / planets.length,
        y: Math.max(...planets.map(p => p.y)) + 7,
        z: planets.reduce((s, p) => s + p.z, 0) / planets.length,
        count: planets.length,
      }))
  }, [filePlanets])

  const dimmed = !!expandedFileId
  return folders.map(f => (
    <Billboard key={f.name} position={[f.x, f.y, f.z]}>
      <Text
        fontSize={2.1}
        letterSpacing={0.22}
        color="#a5b4fc"
        fillOpacity={dimmed ? 0.07 : 0.38}
        anchorX="center"
        anchorY="middle"
      >
        {f.name.toUpperCase()}
      </Text>
      <Text
        position={[0, -2.1, 0]}
        fontSize={0.95}
        letterSpacing={0.12}
        color="#64748b"
        fillOpacity={dimmed ? 0.05 : 0.3}
        anchorX="center"
        anchorY="middle"
      >
        {`${f.count} files`}
      </Text>
    </Billboard>
  ))
}

// ── Atmosphere shell — always visible, brighter when expanded ────────────────
function AtmosphereShells({ filePlanets, expandedFileId }) {
  return filePlanets.map(planet => {
    const col = LANG_COLORS[planet.lang] || LANG_COLORS.unknown
    const isExp = planet.file_path === expandedFileId
    return (
      <group key={planet.id} position={[planet.x, planet.y, planet.z]}>
        <mesh>
          <sphereGeometry args={[planet.size * 1.48, 20, 20]} />
          <meshBasicMaterial
            color={col} transparent opacity={isExp ? 0.11 : 0.032}
            side={THREE.BackSide} depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        {isExp && (
          <mesh>
            <sphereGeometry args={[planet.size * 1.9, 20, 20]} />
            <meshBasicMaterial
              color={col} transparent opacity={0.045}
              side={THREE.BackSide} depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        )}
      </group>
    )
  })
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Nodes() {
  const graph            = useStore(s => s.graph)
  const highlightedNodes = useStore(s => s.highlightedNodes)
  const selectedNodeId   = useStore(s => s.selectedNodeId)
  const expandedFileId   = useStore(s => s.expandedFileId)
  const setSelectedNode  = useStore(s => s.setSelectedNode)
  const setExpandedFile  = useStore(s => s.setExpandedFile)
  const setCameraTarget  = useStore(s => s.setCameraTarget)

  // ── data grouping ──────────────────────────────────────────────────────────
  const { filePlanets, funcMoons, classMoons, issueNodes, prNodes, filePlanetMap } = useMemo(() => {
    if (!graph?.nodes) return { filePlanets: [], funcMoons: [], classMoons: [], issueNodes: [], prNodes: [], filePlanetMap: {} }
    const byFile = {}
    const issueNodes = [], prNodes = []
    for (const node of graph.nodes) {
      if (node.type === 'issue') { issueNodes.push(node); continue }
      if (node.type === 'pr')    { prNodes.push(node);   continue }
      if (node.type !== 'code')  continue
      ;(byFile[node.file_path] ??= []).push(node)
    }
    const allPlanets = Object.entries(byFile).map(([file_path, chunks]) => {
      const cx = chunks.reduce((s, c) => s + c.x, 0) / chunks.length
      const cy = chunks.reduce((s, c) => s + c.y, 0) / chunks.length
      const cz = chunks.reduce((s, c) => s + c.z, 0) / chunks.length
      const size = Math.max(1.5, Math.min(4.5, Math.log2(chunks.length + 1) * 1.6))
      const lang = getLang(file_path)
      return {
        id: `planet::${file_path}`, file_path, chunks,
        x: cx, y: cy, z: cz, size, lang,
        name: file_path.split('/').pop(),
        repNode: chunks.find(c => c.chunk_type === 'file') || chunks[0],
      }
    })
    allPlanets.sort((a, b) => b.chunks.length - a.chunks.length)
    const filePlanets = allPlanets.slice(0, 50)
    const filePlanetMap = Object.fromEntries(filePlanets.map(p => [p.file_path, p]))
    const allowed = new Set(filePlanets.map(p => p.file_path))
    const funcMoons = [], classMoons = []
    for (const node of graph.nodes) {
      if (node.type !== 'code' || !allowed.has(node.file_path)) continue
      if (node.chunk_type === 'function') funcMoons.push(node)
      else if (node.chunk_type === 'class') classMoons.push(node)
    }
    return { filePlanets, funcMoons, classMoons, issueNodes, prNodes, filePlanetMap }
  }, [graph])

  // ── shader uniforms ────────────────────────────────────────────────────────
  const planetUniforms = useMemo(() => ({ uTime: { value: 0 } }), [])
  const moonUniforms   = useMemo(() => ({ uTime: { value: 0 } }), [])

  // ── mesh refs ──────────────────────────────────────────────────────────────
  const planetMeshRef    = useRef()
  const glowMeshRef      = useRef()
  const funcMoonMeshRef  = useRef()
  const classMoonMeshRef = useRef()
  const issueMeshRef     = useRef()
  const prMeshRef        = useRef()

  // disable raycasting on glow so it never blocks planet click events
  useEffect(() => {
    if (glowMeshRef.current) glowMeshRef.current.raycast = () => {}
  })

  // ── rotation + burst accumulators ─────────────────────────────────────────
  const rotsRef  = useRef({ planets: new Float32Array(0), funcs: new Float32Array(0), classes: new Float32Array(0), issues: new Float32Array(0), prs: new Float32Array(0) })
  const burstRef = useRef({ funcs: new Float32Array(0), classes: new Float32Array(0) })

  useEffect(() => {
    rotsRef.current = {
      planets: new Float32Array(filePlanets.length),
      funcs:   new Float32Array(funcMoons.length),
      classes: new Float32Array(classMoons.length),
      issues:  new Float32Array(issueNodes.length),
      prs:     new Float32Array(prNodes.length),
    }
    burstRef.current = {
      funcs:   new Float32Array(funcMoons.length),
      classes: new Float32Array(classMoons.length),
    }
  }, [graph])

  const expandedRef = useRef(expandedFileId)
  useEffect(() => { expandedRef.current = expandedFileId }, [expandedFileId])

  // ── DOM tooltip ────────────────────────────────────────────────────────────
  const tooltipEl = typeof document !== 'undefined' ? document.getElementById('node-tooltip') : null
  const showTip = (label, sub, cx, cy) => {
    if (!tooltipEl) return
    tooltipEl.innerHTML =
      `<span style="font-weight:600;color:#f8fafc">${label}</span>` +
      (sub ? `<br/><span style="color:#94a3b8;font-size:11px">${sub}</span>` : '')
    tooltipEl.style.cssText += `;display:block;left:${cx + 14}px;top:${cy - 32}px`
  }
  const hideTip = () => { if (tooltipEl) tooltipEl.style.display = 'none' }

  const hoveredRef = useRef({ meshType: null, instanceId: -1 })

  // ── unified useFrame ───────────────────────────────────────────────────────
  useFrame(({ clock }, delta) => {
    const t        = clock.elapsedTime
    const rots     = rotsRef.current
    const burst    = burstRef.current
    const expanded = expandedRef.current
    const hn       = highlightedNodes
    const hov      = hoveredRef.current

    // update shader time
    planetUniforms.uTime.value = t
    moonUniforms.uTime.value   = t

    // ─ file planets ─
    const pm = planetMeshRef.current
    const gm = glowMeshRef.current
    if (pm && filePlanets.length) {
      for (let i = 0; i < filePlanets.length; i++) {
        const p           = filePlanets[i]
        const isExpanded  = p.file_path === expanded
        const isHighlight = p.chunks.some(c => hn.has(c.id))
        const isHovered   = hov.meshType === 'planet' && hov.instanceId === i
        const fade        = (expanded && !isExpanded) ? 0.15 : 1.0

        rots.planets[i] += delta * 0.06
        _quat.setFromAxisAngle(_yAxis, rots.planets[i])
        _pos.set(p.x, p.y, p.z)

        let s = p.size
        if (isExpanded)    s *= 1.35
        else if (isHovered) s *= 1.2
        if (isHighlight)    s *= 1.2
        _scale.setScalar(s)
        _matrix.compose(_pos, _quat, _scale)
        pm.setMatrixAt(i, _matrix)

        _color.set(LANG_COLORS[p.lang] || LANG_COLORS.unknown)
        if (isHighlight) { _color.r = Math.min(1, _color.r * 2.5); _color.g = Math.min(1, _color.g * 2.5); _color.b = Math.min(1, _color.b * 2.5) }
        if (fade < 1) _color.multiplyScalar(fade)
        pm.setColorAt(i, _color)

        if (gm) {
          // soft atmosphere halo: subtle at rest, brighter pulse when expanded
          const gs = s * (isExpanded ? 2.2 + Math.sin(t * 2) * 0.1 : 2.0)
          _scale.setScalar(gs)
          _matrix.compose(_pos, _quat.identity(), _scale)
          gm.setMatrixAt(i, _matrix)
          _color.set(LANG_COLORS[p.lang] || LANG_COLORS.unknown)
          const glowFade = fade < 1 ? fade * 0.3 : (isExpanded ? 0.10 : 0.035)
          _color.multiplyScalar(glowFade)
          gm.setColorAt(i, _color)
        }
      }
      pm.instanceMatrix.needsUpdate = true
      if (pm.instanceColor) pm.instanceColor.needsUpdate = true
      if (gm) { gm.instanceMatrix.needsUpdate = true; if (gm.instanceColor) gm.instanceColor.needsUpdate = true }
    }

    // ─ function moons ─
    const fm = funcMoonMeshRef.current
    if (fm && funcMoons.length) {
      for (let i = 0; i < funcMoons.length; i++) {
        const moon = funcMoons[i]
        const show = moon.file_path === expanded
        burst.funcs[i] = show ? Math.min(1, burst.funcs[i] + delta * 3.5) : Math.max(0, burst.funcs[i] - delta * 3.5)
        const bt = easeOut(burst.funcs[i])
        const fp = filePlanetMap[moon.file_path]
        _pos.set(
          fp ? fp.x + (moon.x - fp.x) * bt : moon.x * bt,
          fp ? fp.y + (moon.y - fp.y) * bt : moon.y * bt,
          fp ? fp.z + (moon.z - fp.z) * bt : moon.z * bt,
        )
        rots.funcs[i] += delta * 0.38
        _quat.setFromAxisAngle(_yAxis, rots.funcs[i])
        const isHov = hov.meshType === 'func' && hov.instanceId === i
        const isSel = selectedNodeId === moon.id
        _scale.setScalar(0.45 * bt * (isHov ? 1.5 : isSel ? 1.8 : 1))
        _matrix.compose(_pos, _quat, _scale)
        fm.setMatrixAt(i, _matrix)
        _color.set(hn.has(moon.id) ? '#ffffff' : '#a5b4fc')
        fm.setColorAt(i, _color)
      }
      fm.instanceMatrix.needsUpdate = true
      if (fm.instanceColor) fm.instanceColor.needsUpdate = true
    }

    // ─ class moons ─
    const cm = classMoonMeshRef.current
    if (cm && classMoons.length) {
      for (let i = 0; i < classMoons.length; i++) {
        const moon = classMoons[i]
        const show = moon.file_path === expanded
        burst.classes[i] = show ? Math.min(1, burst.classes[i] + delta * 3.5) : Math.max(0, burst.classes[i] - delta * 3.5)
        const bt = easeOut(burst.classes[i])
        const fp = filePlanetMap[moon.file_path]
        _pos.set(
          fp ? fp.x + (moon.x - fp.x) * bt : moon.x * bt,
          fp ? fp.y + (moon.y - fp.y) * bt : moon.y * bt,
          fp ? fp.z + (moon.z - fp.z) * bt : moon.z * bt,
        )
        rots.classes[i] += delta * 0.18
        _quat.setFromAxisAngle(_yAxis, rots.classes[i])
        const isHov = hov.meshType === 'class' && hov.instanceId === i
        const isSel = selectedNodeId === moon.id
        _scale.setScalar(0.58 * bt * (isHov ? 1.5 : isSel ? 1.8 : 1))
        _matrix.compose(_pos, _quat, _scale)
        cm.setMatrixAt(i, _matrix)
        _color.set(hn.has(moon.id) ? '#ffffff' : '#6ee7b7')
        cm.setColorAt(i, _color)
      }
      cm.instanceMatrix.needsUpdate = true
      if (cm.instanceColor) cm.instanceColor.needsUpdate = true
    }

    // ─ issues ─
    const im = issueMeshRef.current
    if (im && issueNodes.length) {
      const fade = expanded ? 0.2 : 1.0
      for (let i = 0; i < issueNodes.length; i++) {
        const n = issueNodes[i]
        rots.issues[i] += delta * 0.5
        const pulse = 1 + Math.sin(t * Math.PI * 1.8 + i * 1.3) * 0.14
        _quat.setFromAxisAngle(_yAxis, rots.issues[i])
        _pos.set(n.x, n.y, n.z)
        const isHov = hov.meshType === 'issue' && hov.instanceId === i
        _scale.setScalar(1.3 * pulse * (isHov ? 1.35 : 1) * fade)
        _matrix.compose(_pos, _quat, _scale)
        im.setMatrixAt(i, _matrix)
        _color.set(hn.has(n.id) ? '#ffffff' : '#fbbf24')
        if (fade < 1) _color.multiplyScalar(fade)
        im.setColorAt(i, _color)
      }
      im.instanceMatrix.needsUpdate = true
      if (im.instanceColor) im.instanceColor.needsUpdate = true
    }

    // ─ prs ─
    const prm = prMeshRef.current
    if (prm && prNodes.length) {
      const fade = expanded ? 0.2 : 1.0
      for (let i = 0; i < prNodes.length; i++) {
        const n = prNodes[i]
        rots.prs[i] += delta * 0.2
        _quat.setFromAxisAngle(_yAxis, rots.prs[i])
        _pos.set(n.x, n.y, n.z)
        const isHov = hov.meshType === 'pr' && hov.instanceId === i
        _scale.setScalar(1.3 * (isHov ? 1.35 : 1) * fade)
        _matrix.compose(_pos, _quat, _scale)
        prm.setMatrixAt(i, _matrix)
        _color.set(hn.has(n.id) ? '#ffffff' : '#4ade80')
        if (fade < 1) _color.multiplyScalar(fade)
        prm.setColorAt(i, _color)
      }
      prm.instanceMatrix.needsUpdate = true
      if (prm.instanceColor) prm.instanceColor.needsUpdate = true
    }
  })

  if (!graph?.nodes?.length) return null

  // ── event handlers ─────────────────────────────────────────────────────────
  function makePlanetHandlers() {
    return {
      onPointerMove(e) {
        e.stopPropagation()
        const id = e.instanceId
        if (id == null || id >= filePlanets.length) { hoveredRef.current = { meshType: null, instanceId: -1 }; hideTip(); return }
        hoveredRef.current = { meshType: 'planet', instanceId: id }
        const p = filePlanets[id]
        showTip(p.name, `${p.lang} · ${p.chunks.length} chunks — click to expand`, e.clientX, e.clientY)
      },
      onPointerOut(e) { e.stopPropagation(); hoveredRef.current = { meshType: null, instanceId: -1 }; hideTip() },
      onClick(e) {
        e.stopPropagation()
        const id = e.instanceId
        if (id == null || id >= filePlanets.length) return
        const p = filePlanets[id]
        if (expandedRef.current === p.file_path) {
          setExpandedFile(null)
        } else {
          setExpandedFile(p.file_path)
          setCameraTarget({ x: p.x, y: p.y, z: p.z + 32, lookAt: { x: p.x, y: p.y, z: p.z } })
        }
        setSelectedNode(p.repNode)
      },
    }
  }

  function makeMoonHandlers(meshType, moons) {
    return {
      onPointerMove(e) {
        e.stopPropagation()
        const id = e.instanceId
        if (id == null || id >= moons.length) { hoveredRef.current = { meshType: null, instanceId: -1 }; hideTip(); return }
        hoveredRef.current = { meshType, instanceId: id }
        const m = moons[id]
        showTip(m.name, m.file_path, e.clientX, e.clientY)
      },
      onPointerOut(e) { e.stopPropagation(); hoveredRef.current = { meshType: null, instanceId: -1 }; hideTip() },
      onClick(e) {
        e.stopPropagation()
        const id = e.instanceId
        if (id == null || id >= moons.length) return
        const m = moons[id]
        setSelectedNode(m)
        setCameraTarget({ x: m.x, y: m.y, z: m.z + 15, lookAt: { x: m.x, y: m.y, z: m.z } })
      },
    }
  }

  function makeNodeHandlers(meshType, nodes) {
    return {
      onPointerMove(e) {
        e.stopPropagation()
        const id = e.instanceId
        if (id == null || id >= nodes.length) { hoveredRef.current = { meshType: null, instanceId: -1 }; hideTip(); return }
        hoveredRef.current = { meshType, instanceId: id }
        const n = nodes[id]
        showTip(n.title || n.name || n.id, `${n.type} #${n.number || ''}`, e.clientX, e.clientY)
      },
      onPointerOut(e) { e.stopPropagation(); hoveredRef.current = { meshType: null, instanceId: -1 }; hideTip() },
      onClick(e) {
        e.stopPropagation()
        const id = e.instanceId
        if (id == null || id >= nodes.length) return
        setSelectedNode(nodes[id])
        setCameraTarget({ x: nodes[id].x, y: nodes[id].y, z: nodes[id].z + 20, lookAt: { x: nodes[id].x, y: nodes[id].y, z: nodes[id].z } })
      },
    }
  }

  return (
    <group>
      {/* glow halos — additive blending, rendered before planets */}
      {filePlanets.length > 0 && (
        <instancedMesh ref={glowMeshRef} args={[PLANET_GEO, null, filePlanets.length]} frustumCulled={false} renderOrder={-1}>
          <meshBasicMaterial vertexColors transparent opacity={0.08} depthWrite={false} blending={THREE.AdditiveBlending} />
        </instancedMesh>
      )}

      {/* file planets — custom fresnel shader */}
      {filePlanets.length > 0 && (
        <instancedMesh ref={planetMeshRef} args={[PLANET_GEO, null, filePlanets.length]} frustumCulled={false} {...makePlanetHandlers()}>
          <shaderMaterial
            vertexShader={PLANET_VERT}
            fragmentShader={PLANET_FRAG}
            uniforms={planetUniforms}
          />
        </instancedMesh>
      )}

      {/* function moons */}
      {funcMoons.length > 0 && (
        <instancedMesh ref={funcMoonMeshRef} args={[MOON_GEO, null, funcMoons.length]} frustumCulled={false} {...makeMoonHandlers('func', funcMoons)}>
          <shaderMaterial vertexShader={MOON_VERT} fragmentShader={MOON_FRAG} uniforms={moonUniforms} />
        </instancedMesh>
      )}

      {/* class moons */}
      {classMoons.length > 0 && (
        <instancedMesh ref={classMoonMeshRef} args={[MOON_GEO, null, classMoons.length]} frustumCulled={false} {...makeMoonHandlers('class', classMoons)}>
          <shaderMaterial vertexShader={MOON_VERT} fragmentShader={MOON_FRAG} uniforms={moonUniforms} />
        </instancedMesh>
      )}

      {/* issue nodes */}
      {issueNodes.length > 0 && (
        <instancedMesh ref={issueMeshRef} args={[MOON_GEO, null, issueNodes.length]} frustumCulled={false} {...makeNodeHandlers('issue', issueNodes)}>
          <shaderMaterial vertexShader={MOON_VERT} fragmentShader={MOON_FRAG} uniforms={moonUniforms} />
        </instancedMesh>
      )}

      {/* pr nodes */}
      {prNodes.length > 0 && (
        <instancedMesh ref={prMeshRef} args={[MOON_GEO, null, prNodes.length]} frustumCulled={false} {...makeNodeHandlers('pr', prNodes)}>
          <shaderMaterial vertexShader={MOON_VERT} fragmentShader={MOON_FRAG} uniforms={moonUniforms} />
        </instancedMesh>
      )}

      <PlanetRings filePlanets={filePlanets} expandedFileId={expandedFileId} />
      <AtmosphereShells filePlanets={filePlanets} expandedFileId={expandedFileId} />
      <ConstellationLabels filePlanets={filePlanets} expandedFileId={expandedFileId} />
    </group>
  )
}
