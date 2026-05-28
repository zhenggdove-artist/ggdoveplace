// Use global React and ReactDOM from CDN
const { useState, useRef, useEffect, useCallback } = React;
const { createRoot } = ReactDOM;

// ==========================================
// CONFIGURATION & ASSETS
// ==========================================

// Local sprite sequences used for the HUD NPC
const ASSETS = {
  SHOOTER_NPC_FRAMES: Array.from({ length: 19 }, (_, i) => `assets/player/player${i + 1}.PNG`),
};

const MOBILE_BREAKPOINT = 768;
const TARGET_ASPECT_RATIO = 16 / 9;
const BULLET_POINT_COUNT = 80;
// 玩家在三維世界中的生成點/縮放：桌面與手機分開調
const PLAYER_CONFIG = {
  desktop: { position: { x: -35, y: 0, z: 0 }, baseScale: 1.0 },
  mobile: { position: { x: -10, y: 0, z: 0 }, baseScale: 1.2 },
};
// 玩家碰撞判定用半徑（玩家局部座標下的距離，單位同點雲座標）
const PLAYER_HIT_RADIUS = 1.2;
// NPC 子彈生成點與大小：桌面與手機分開調
const SHOOTER_BULLET_CONFIG = {
  desktop: { origin: { x: 45, y: -2, z: 0 }, radius: 0.2, size: 0.6 },
  mobile: { origin: { x: 10, y: -2, z: 0 }, radius: 0.2, size: 0.6 },
};
const BULLET_SPEED = 0.6; // 子彈朝玩家移動的速度
// 眼睛調整參數
const EYE_SCALE = 1.8; // 整顆眼睛放大倍率（原本 1.5）
const EYE_PUPIL_COLOR = 0x66ccff; // 水藍色
const EYE_PUPIL_THRESHOLD = 0.45; // 半徑內視為瞳孔（原本 0.35）
const EYE_PUPIL_SIZE = 0.06; // 瞳孔點大小（原本 0.04）
const EYE_IRIS_POINTS_SIDE = 600; // 側視瞳孔/虹膜點數（原本 400）
const EYE_IRIS_POINTS_FRONT = 1000; // 正視瞳孔/虹膜點數（原本 400）
const TENTACLE_DENSITY = { rings: 100, pointsPerRing: 40 }; // 觸手點環數與每環點數
// 觸手控制參數
const TENTACLE_SETTINGS = {
  perBatch: 5, // 一批生成幾根
  growthPerClick: 0.3, // 每次點擊增加的長度倍率
  baseLength: 5, // 觸手基礎長度
  lengthJitter: 10, // 觸手長度隨機附加
  towardCameraBias: 0.8, // 越大越朝鏡頭/玩家（+Z）方向（實際會隨機正負，產生朝內/朝外變化）
  followScaleStrength: 3, // 觸手越靠近鏡頭越放大的強度
  wiggleChaosRange: [0.7, 1.6], // 蠕動混亂度倍率
  dirChaosXY: 1.2, // XY 隨機擴散倍率
};
const NPC_HEAD_ANCHOR_RATIO = 0.22; // fraction from top where head center sits
const SHOOTER_FIRE_FRAME_INDEX = 6; // player7.PNG (0-based indexing)

const useIsMobileViewport = () => {
  const getMatches = () => {
    if (typeof window === 'undefined') return false;
    const widthGuess = Math.min(
      window.visualViewport?.width || Infinity,
      window.innerWidth || Infinity,
      document.documentElement?.clientWidth || Infinity
    );
    const mqMatches = window.matchMedia?.(`(max-width: ${MOBILE_BREAKPOINT}px)`)?.matches ?? false;
    const uaMatches = typeof navigator !== 'undefined'
      ? /Mobile|Android|iP(hone|od|ad)/i.test(navigator.userAgent || '')
      : false;
    const widthMatches = widthGuess !== Infinity ? widthGuess <= MOBILE_BREAKPOINT : false;
    return mqMatches || widthMatches || uaMatches;
  };

  const [isMobile, setIsMobile] = useState(getMatches);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia?.(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = () => setIsMobile(getMatches());
    mq?.addEventListener?.('change', handler);
    mq?.addListener?.(handler);
    window.addEventListener('resize', handler);
    window.visualViewport?.addEventListener?.('resize', handler);
    handler();
    return () => {
      mq?.removeEventListener?.('change', handler);
      mq?.removeListener?.(handler);
      window.removeEventListener('resize', handler);
      window.visualViewport?.removeEventListener?.('resize', handler);
    };
  }, []);

  return isMobile;
};

// Generic sprite sheet animator for <img> elements
const SpriteAnimator = ({
  frames,
  fps = 12,
  breathe = false,
  style,
  className = '',
  alt = '',
  onFrameChange,
  ...imgProps
}) => {
  const [frameIndex, setFrameIndex] = useState(0);
  const frameCount = frames?.length || 0;
  const rafRef = useRef(null);
  const lastTimeRef = useRef(0);
  const frameRef = useRef(0);
  const breatheOffsetRef = useRef(Math.random() * Math.PI * 2);

  useEffect(() => {
    setFrameIndex(0);
    frameRef.current = 0;
    lastTimeRef.current = 0;
    if (frameCount > 0) {
      onFrameChange?.(0);
    }
  }, [frameCount, onFrameChange]);

  useEffect(() => {
    if (!frameCount) return undefined;

    // Preload frames to avoid flicker on mobile browsers
    const preloaded = frames.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });

    return () => {
      preloaded.forEach((img) => {
        img.src = '';
      });
    };
  }, [frames, frameCount]);

  useEffect(() => {
    if (!frameCount) return undefined;

    const animate = (time) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const elapsed = time - lastTimeRef.current;
      const baseInterval = 1000 / Math.max(1, fps);
      const breatheWave = breathe
        ? 0.5 + 0.5 * Math.sin(time * 0.001 * 0.8 + breatheOffsetRef.current)
        : 0;
      const breatheFactor = breathe ? 0.7 + breatheWave * 0.6 : 1;
      const interval = baseInterval * breatheFactor;

      if (elapsed >= interval) {
        lastTimeRef.current = time;
        frameRef.current = (frameRef.current + 1) % frameCount;
        setFrameIndex(frameRef.current);
        onFrameChange?.(frameRef.current);
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTimeRef.current = 0;
    };
  }, [frameCount, fps, breathe, onFrameChange]);

  if (!frameCount) return null;

  return (
    <img
      src={frames[frameIndex]}
      alt={alt}
      className={className}
      style={style}
      draggable={false}
      {...imgProps}
    />
  );
};

// ==========================================
// SHADERS (GLSL)
// ==========================================

const vertexShader = `
  uniform float uTime;
  uniform float uHeal; // Distortion intensity
  uniform float uHit;  // Damage flash intensity
  
  attribute float size;
  attribute vec3 customColor;
  
  varying vec3 vColor;
  varying float vHit;

  // Simple noise function
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  
  float snoise(vec3 v) {
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 = v - i + dot(i, C.xxx) ;
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute( permute( permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
  }

  void main() {
    vColor = customColor;
    vHit = uHit;

    // Base vibration
    float noiseVal = snoise(position * 0.1 + uTime * 0.5);
    
    // Violent heal distortion
    float distortion = noiseVal * (0.2 + uHeal * 5.0);
    
    vec3 newPos = position + normal * distortion;
    
    vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
    
    // Size attenuation
    gl_PointSize = size * (400.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// SPECIAL SHADER FOR BLINKING EYE
const eyeVertexShader = `
  uniform float uBlink; // 0.0 = Open, 1.0 = Closed
  attribute vec3 aOpenPos;
  attribute vec3 aClosedPos;
  attribute float size;
  attribute vec3 customColor;
  
  varying vec3 vColor;

  void main() {
    vColor = customColor;
    
    // Morph between open and closed state
    vec3 newPos = mix(aOpenPos, aClosedPos, uBlink);
    
    vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
    gl_PointSize = size * (400.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  varying float vHit;

  void main() {
    // Soft glow point
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if(dist > 0.5) discard;

    // Glow falloff
    float alpha = 1.0 - smoothstep(0.3, 0.5, dist);

    // Mix base color with Red when hit
    vec3 finalColor = mix(vColor, vec3(1.0, 0.0, 0.0), vHit);
    
    // Brightness controlled by JS via customColor now
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

const eyeFragmentShader = `
  varying vec3 vColor;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if(dist > 0.5) discard;
    float alpha = 1.0 - smoothstep(0.1, 0.5, dist);
    // Eye is always bright/cyan
    gl_FragColor = vec4(vColor, alpha * 0.8);
  }
`;

// ==========================================
// UTILS
// ==========================================

// --- PROCEDURAL EYE GENERATOR ---
const generateCyberEye = (THREE, viewType) => {
    // Arrays for Attributes
    const openPos = [];
    const closedPos = [];
    const sizes = [];
    const colors = [];

    const cyan = new THREE.Color(0x00ffff);
    const white = new THREE.Color(0xffffff);
    const pupilColor = new THREE.Color(EYE_PUPIL_COLOR);

    // Helper to push point
    const addPoint = (x1, y1, z1, x2, y2, z2, s, c) => {
        openPos.push(x1, y1, z1);
        closedPos.push(x2, y2, z2);
        sizes.push(s);
        colors.push(c.r, c.g, c.b);
    };

    if (viewType === 'side') {
        // --- SIDE VIEW (Looking Right +X) ---
        const irisX = 0.5; // Front of eye
        const irisRadY = 0.5; 
        const irisRadZ = 0.4;
        
        // 1. IRIS
        const irisPoints = EYE_IRIS_POINTS_SIDE;
        for(let i=0; i<irisPoints; i++) {
            const r = Math.sqrt(Math.random());
            const theta = Math.random() * Math.PI * 2;
            const y = r * Math.cos(theta) * irisRadY;
            const z = r * Math.sin(theta) * irisRadZ; 
            const bulge = Math.cos(r * Math.PI * 0.5) * 0.2; 
            const x = irisX + bulge;

            const isPupil = r < EYE_PUPIL_THRESHOLD;
            const col = isPupil ? pupilColor : cyan;

            // PUPIL SQUASH: When closed, Y scales down to 0
            addPoint(x, y, z, x, y * 0.05, z, isPupil ? EYE_PUPIL_SIZE : 0.05, col);
        }

        // 2. LIDS
        const lidSegments = 200;
        const startX = -1.2;
        const endX = 0.6;
        for(let i=0; i<=lidSegments; i++) {
            const t = i / lidSegments;
            const x = startX + (endX - startX) * t;
            
            const openY_Top = Math.sin(t * Math.PI * 0.7) * 0.7; 
            const openY_Bot = -Math.sin(t * Math.PI * 0.7) * 0.7; 
            const closedY = 0; 
            
            // Add point for lid edge
            addPoint(x, openY_Top, 0.1, x, closedY, 0.1, 0.06, white);
            addPoint(x, openY_Bot, 0.1, x, closedY, 0.1, 0.06, white);

            // Fill Volume
            if (Math.random() > 0.5) {
                 addPoint(x, openY_Top + 0.05, 0.1, x, closedY + 0.02, 0.1, 0.04, cyan);
            }

            // 3. LASHES (Forward Sweep)
            if (i % 3 === 0 && t > 0.3) { 
                const lashLen = 0.4 + Math.random() * 0.6;
                const segments = 8;
                for(let k=0; k<segments; k++) {
                    const lt = k / segments;
                    // Open: Forward (+X) and Up
                    const lxOpen = x + (lashLen * lt); 
                    const lyOpen = openY_Top + (lashLen * lt * 0.8) + (lt*lt*0.2); 
                    const lzOpen = 0.2 + lt * 0.2; 
                    
                    // Closed: Down
                    const lxClosed = x + (lashLen * lt);
                    const lyClosed = closedY - (lashLen * lt * 0.5); 
                    const lzClosed = 0.2 + lt * 0.2;

                    const col = new THREE.Color().copy(cyan).multiplyScalar(1.0 - lt*0.7);
                    addPoint(lxOpen, lyOpen, lzOpen, lxClosed, lyClosed, lzClosed, 0.03, col);
                    
                    if (k < 4) { // Lower lash
                        const llyOpen = openY_Bot - (lashLen * lt * 0.5);
                        const llyClosed = closedY - (lashLen * lt * 0.5);
                        addPoint(lxOpen, llyOpen, lzOpen, lxClosed, llyClosed, lzClosed, 0.03, col);
                    }
                }
            }
        }
    } else {
        // --- FRONT VIEW (Looking Front +Z) ---
        // Iris on XY plane
        const irisZ = 0.2;
        const irisRad = 0.5;

        // 1. IRIS
        const irisPoints = EYE_IRIS_POINTS_FRONT;
        for(let i=0; i<irisPoints; i++) {
            const r = Math.sqrt(Math.random());
            const theta = Math.random() * Math.PI * 2;
            const x = r * Math.cos(theta) * irisRad;
            const y = r * Math.sin(theta) * irisRad;
            const bulge = Math.cos(r * Math.PI * 0.5) * 0.2;
            const z = irisZ + bulge;

            const isPupil = r < EYE_PUPIL_THRESHOLD;
            const col = isPupil ? pupilColor : cyan;

            // SQUASH Y
            addPoint(x, y, z, x, y * 0.05, z, isPupil ? EYE_PUPIL_SIZE : 0.05, col);
        }

        // 2. LIDS (Parabola in X)
        const lidPoints = 200;
        const width = 1.4;
        for(let i=0; i<=lidPoints; i++) {
             const t = (i / lidPoints) * 2.0 - 1.0; // -1 to 1
             const x = t * (width / 2);
             
             // Parabola
             const arch = Math.cos(t * Math.PI * 0.5);
             const openY_Top = arch * 0.6;
             const openY_Bot = -arch * 0.6;
             const closedY = 0;

             // Lid Edge
             addPoint(x, openY_Top, 0.1, x, closedY, 0.1, 0.06, white);
             addPoint(x, openY_Bot, 0.1, x, closedY, 0.1, 0.06, white);

             // LASHES (Radiate Out)
             if (i % 3 === 0) {
                 const lashLen = 0.4 + Math.random() * 0.3;
                 const segments = 6;
                 for(let k=0; k<segments; k++) {
                     const lt = k/segments;
                     // Radial direction approx normal to curve
                     const dx = x * 0.5;
                     const dy = 1.0;
                     
                     // Upper
                     const lx = x + dx * lt * 0.2;
                     const ly = openY_Top + dy * lashLen * lt;
                     const lz = 0.2 + lt*0.3; // Curl fwd

                     const lyClosed = closedY - lashLen * lt * 0.5;

                     const col = new THREE.Color().copy(cyan).multiplyScalar(1.0 - lt*0.7);
                     addPoint(lx, ly, lz, lx, lyClosed, lz, 0.03, col);

                     // Lower
                     const lly = openY_Bot - dy * lashLen * lt;
                     const llyClosed = closedY - lashLen * lt * 0.5;
                     addPoint(lx, lly, lz, lx, llyClosed, lz, 0.03, col);
                 }
             }
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(openPos, 3));
    geo.setAttribute('aOpenPos', new THREE.Float32BufferAttribute(openPos, 3));
    geo.setAttribute('aClosedPos', new THREE.Float32BufferAttribute(closedPos, 3));
    geo.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    geo.setAttribute('customColor', new THREE.Float32BufferAttribute(colors, 3));
    
    return geo;
}


// Custom helper to generate ringed points along a curve
const generateRingedPoints = (
    THREE, 
    curve, 
    numRings, 
    pointsPerRing, 
    baseRadius,
    rootColor, 
    tipColor
) => {
    const points = [];
    const sizes = [];
    const colors = [];
    
    const frames = curve.computeFrenetFrames(numRings, false);
    const tempColor = new THREE.Color();

    for (let i = 0; i <= numRings; i++) {
        const u = i / numRings;
        
        // Get position and Frenet vectors for orientation
        const pos = curve.getPointAt(u);
        const N = frames.normals[i];
        const B = frames.binormals[i];
        
        // Tapering: Thick at root (u=0), thin at tip (u=1)
        const currentRadius = baseRadius * (1.0 - u * 0.8);

        // Color Gradient
        tempColor.copy(rootColor).lerp(tipColor, u);

        for (let j = 0; j < pointsPerRing; j++) {
            const angle = (j / pointsPerRing) * Math.PI * 2;
            const sin = Math.sin(angle);
            const cos = Math.cos(angle);

            // Calculate vertex position: P + R * (N*cos + B*sin)
            const px = pos.x + currentRadius * (N.x * cos + B.x * sin);
            const py = pos.y + currentRadius * (N.y * cos + B.y * sin);
            const pz = pos.z + currentRadius * (N.z * cos + B.z * sin);

            points.push(px, py, pz);
            
            // Randomize size slightly for organic feel
            sizes.push(0.1 + Math.random() * 0.15);
            
            colors.push(tempColor.r, tempColor.g, tempColor.b);
        }
    }

    return { points, sizes, colors };
};

// ==========================================
// COMPONENTS
// ==========================================

// --- DYNAMIC PARTICLE HEALTH BAR ---
const PointCloudHealthBar = ({ health, lastHit, isMobile = false }) => {
    const canvasRef = useRef(null);
    const healthRef = useRef(health); 
    const displayedHealthRef = useRef(health); // For fluid animation
    
    // ANCHORED PHYSICS SYSTEM
    // STRIDE = 8: [x, y, vx, vy, originX, originY, mass, offset]
    const STRIDE = 8;
    const PARTICLE_COUNT = 7000;
    const particlesRef = useRef(null);
    const reqRef = useRef(0);
    
    // Disturbance State
    const disturbanceRef = useRef(0);

    // 1. Initialize Particles (Anchored Layout)
    useEffect(() => {
        const data = new Float32Array(PARTICLE_COUNT * STRIDE);
        for(let i = 0; i < PARTICLE_COUNT; i++) {
            const idx = i * STRIDE;
            
            // STRATIFIED SAMPLING for perfect coverage
            const t = i / PARTICLE_COUNT;
            const jitter = (Math.random() - 0.5) * 0.01;
            
            const originX = Math.max(0, Math.min(1, t + jitter));
            const originY = Math.random(); 

            data[idx]     = originX; // x
            data[idx+1]   = originY; // y
            data[idx+2]   = 0;       // vx
            data[idx+3]   = 0;       // vy
            data[idx+4]   = originX; // originX (Anchor)
            data[idx+5]   = originY; // originY (Anchor)
            data[idx+6]   = 0.5 + Math.random() * 1.0; // mass (light vs heavy particles)
            data[idx+7]   = Math.random() * 100; // offset
        }
        particlesRef.current = data;
    }, []);

    // 2. Sync Health
    useEffect(() => {
        healthRef.current = health;
    }, [health]);

    // 3. React to Damage (Add Kinetic Energy)
    useEffect(() => {
        if (!particlesRef.current || lastHit === 0) return;
        // Set disturbance energy. This will decay over time.
        disturbanceRef.current = 1.0;
    }, [lastHit]);

    // 4. Physics Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const render = () => {
            const w = canvas.width;
            const h = canvas.height;
            const data = particlesRef.current;
            if (!data) return;

            // Decay disturbance
            disturbanceRef.current *= 0.90; // Fast decay for "momentary" feel
            const shake = disturbanceRef.current;

            const time = performance.now() * 0.001;

            // Smoothly interpolate displayed health towards actual health
            const diff = healthRef.current - displayedHealthRef.current;
            if (Math.abs(diff) > 0.1) {
                displayedHealthRef.current += diff * 0.05; // Fluid speed
            } else {
                displayedHealthRef.current = healthRef.current;
            }
            
            const healthPct = displayedHealthRef.current / 100;
            const isOverheal = displayedHealthRef.current > 100;

            ctx.clearRect(0, 0, w, h);

            for(let i=0; i<PARTICLE_COUNT; i++) {
                const idx = i * STRIDE;
                
                let x = data[idx];
                let y = data[idx+1];
                let vx = data[idx+2];
                let vy = data[idx+3];
                const ox = data[idx+4]; // Anchor X
                const oy = data[idx+5]; // Anchor Y
                const mass = data[idx+6];
                const offset = data[idx+7];

                // --- 1. SPRING FORCE (Return to Anchor) ---
                // Keeps particles evenly distributed
                const springK = 0.02; // Stiffness
                vx += (ox - x) * springK;
                vy += (oy - y) * springK;

                // --- 2. IDLE DRIFT (Light Floating) ---
                // Very subtle noise movement
                const driftAmp = 0.00005;
                vx += Math.sin(time + offset + y * 10) * driftAmp;
                vy += Math.cos(time + offset + x * 10) * driftAmp;

                // --- 3. HIT REACTION (Vibration/Kinetic Boost) ---
                // When hit, add random noise to velocity (thermal agitation)
                if (shake > 0.01) {
                    const kick = shake * 0.005 / mass; // Heavier particles move less
                    vx += (Math.random() - 0.5) * kick;
                    vy += (Math.random() - 0.5) * kick;
                }

                // --- 4. INTEGRATION ---
                // Damping to prevent infinite oscillation
                vx *= 0.92;
                vy *= 0.92;

                x += vx;
                y += vy;

                // Store
                data[idx] = x;
                data[idx+1] = y;
                data[idx+2] = vx;
                data[idx+3] = vy;

                // --- 5. RENDER ---
                const isActive = x <= healthPct;

                if (isActive) {
                    let r, g, b;
                    if (isOverheal) {
                        // Neon Pink/White flicker
                        if (Math.random() > 0.9) { r=255; g=255; b=255; }
                        else { r=255; g=0; b=255; }
                    } else {
                        // Green
                        r=0; g=255; b=0;
                    }

                    // Brightness modulation based on movement speed
                    const speed = Math.sqrt(vx*vx + vy*vy);
                    const brightness = 0.5 + Math.min(speed * 500, 0.5); // Brighter when moving fast
                    
                    ctx.fillStyle = `rgba(${r},${g},${b}, ${brightness})`;

                    // Small, crisp point
                    const pSize = mass * 1.2;
                    ctx.fillRect(x * w, y * h, pSize, pSize);
                } else {
                    // Very faint background trail
                    ctx.fillStyle = 'rgba(20, 50, 20, 0.05)';
                    ctx.fillRect(x * w, y * h, 1, 1);
                }
            }

            reqRef.current = requestAnimationFrame(render);
        };
        
        render();
        return () => cancelAnimationFrame(reqRef.current);
    }, []);

    const containerWidth = isMobile ? '50vw' : '600px';
    const containerHeight = isMobile ? '28px' : '40px';
    const containerTop = isMobile ? '20px' : '30px';
    const containerLeft = isMobile ? '20px' : '30px';
    const canvasWidth = isMobile ? 800 : 1200;
    const canvasHeight = isMobile ? 60 : 80;

    return (
        <div style={{
            position: 'absolute',
            top: containerTop,
            left: containerLeft,
            width: containerWidth, 
            height: containerHeight,
            borderBottom: '1px solid rgba(0,255,0,0.2)',
            background: 'rgba(0, 20, 0, 0.1)', // Subtle backing
            boxShadow: '0 0 20px rgba(0,255,0,0.05)'
        }}>
            {/* High DPI Canvas */}
            <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} style={{ width: '100%', height: '100%' }} />
        </div>
    );
};


// ==========================================
// PHASE 1: DRAWING COMPONENT
// ==========================================
const DrawingPhase = ({ onFinish }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const contextRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // High DPI Canvas
    canvas.width = 600;
    canvas.height = 600;
    canvas.style.width = '300px';
    canvas.style.height = '300px';

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(2, 2);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 4;
      contextRef.current = ctx;
      
      // Canvas background
      ctx.clearRect(0, 0, 300, 300);
      ctx.fillStyle = '#FFE4CA';
      ctx.fillRect(0, 0, 300, 300);
    }
  }, []);

  const getCanvasPoint = useCallback((nativeEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    let clientX;
    let clientY;

    if (nativeEvent.touches && nativeEvent.touches.length > 0) {
      clientX = nativeEvent.touches[0].clientX;
      clientY = nativeEvent.touches[0].clientY;
    } else if (nativeEvent.changedTouches && nativeEvent.changedTouches.length > 0) {
      clientX = nativeEvent.changedTouches[0].clientX;
      clientY = nativeEvent.changedTouches[0].clientY;
    } else if (typeof nativeEvent.clientX === 'number' && typeof nativeEvent.clientY === 'number') {
      clientX = nativeEvent.clientX;
      clientY = nativeEvent.clientY;
    } else if (typeof nativeEvent.offsetX === 'number' && typeof nativeEvent.offsetY === 'number') {
      clientX = nativeEvent.offsetX + rect.left;
      clientY = nativeEvent.offsetY + rect.top;
    } else {
      return null;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, []);

  const startDrawing = useCallback((event) => {
    if (event?.cancelable) event.preventDefault();
    const point = getCanvasPoint(event.nativeEvent);
    if (!point) return;
    if (typeof event.pointerId === 'number') {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    }
    contextRef.current?.beginPath();
    contextRef.current?.moveTo(point.x, point.y);
    setIsDrawing(true);
  }, [getCanvasPoint]);

  const finishDrawing = useCallback((event) => {
    if (event?.cancelable) event.preventDefault();
    if (typeof event?.pointerId === 'number' && event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!isDrawing) return;
    contextRef.current?.closePath();
    setIsDrawing(false);
  }, [isDrawing]);

  const draw = useCallback((event) => {
    if (!isDrawing) return;
    if (event?.cancelable) event.preventDefault();
    const point = getCanvasPoint(event.nativeEvent);
    if (!point) return;
    contextRef.current?.lineTo(point.x, point.y);
    contextRef.current?.stroke();
  }, [getCanvasPoint, isDrawing]);

  const handleFinish = () => {
    const canvas = canvasRef.current;
    if (!canvas || !contextRef.current) return;

    const imgData = contextRef.current.getImageData(0, 0, 600, 600);
    const data = imgData.data;
    const points = [];

    // Volumetric Generation Settings
    const volumeLayers = 6; // Create depth
    const volumeDepth = 4.0; 

    // Sample pixels
    for (let y = 0; y < 600; y += 3) {
      for (let x = 0; x < 600; x += 3) {
        const index = (y * 600 + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const a = data[index + 3];
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        
        // If dark pixel (drawn line)
        if (a > 10 && brightness < 180) {
          const baseX = (x - 300) / 10;
          const baseY = -(y - 300) / 10;

          // Generate VOLUMETRIC cluster for this pixel
          for(let l=0; l<volumeLayers; l++) {
            // Random scatter
            const scatter = 0.2;
            const px = baseX + (Math.random() - 0.5) * scatter;
            const py = baseY + (Math.random() - 0.5) * scatter;
            // Spread along Z to create volume
            const pz = (Math.random() - 0.5) * volumeDepth;
            
            points.push(px, py, pz);
          }
        }
      }
    }
    
    if (points.length === 0) {
      alert("Please draw something first.");
      return;
    }
    onFinish(points);
  };

  return (
    <div style={{
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100vh',
      background: '#111'
    }}>
      <h2 className="neural-text" style={{color: '#00ff00', marginBottom: '20px', textTransform: 'uppercase', fontSize: '2rem'}}>WHAT ARE YOU</h2>
      <canvas
        ref={canvasRef}
        onPointerDown={startDrawing}
        onPointerUp={finishDrawing}
        onPointerMove={draw}
        onPointerLeave={finishDrawing}
        onPointerCancel={finishDrawing}
        style={{ border: '2px solid #00ff00', cursor: 'crosshair', background: 'white', touchAction: 'none' }}
      />
      <button 
        onClick={handleFinish}
        className="neural-text"
        style={{
          marginTop: '20px',
          background: 'transparent',
          color: '#00ff00',
          border: '1px solid #00ff00',
          padding: '10px 30px',
          fontFamily: 'Megrim',
          fontSize: '24px',
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        INITIATE LIFE
      </button>
    </div>
  );
};

// ==========================================
// PHASE 2: THE GAME
// ==========================================
const GamePhase = ({ pointData, onGameOver }) => {
  const mountRef = useRef(null);
  const [health, setHealth] = useState(100);
  const [lastHitTime, setLastHitTime] = useState(0); // For UI Disturbance
  const healthRef = useRef(100); 
  const isMobile = useIsMobileViewport();
  const playerConf = isMobile ? PLAYER_CONFIG.mobile : PLAYER_CONFIG.desktop;
  const bulletConf = isMobile ? SHOOTER_BULLET_CONFIG.mobile : SHOOTER_BULLET_CONFIG.desktop;
  
  // Refs
  const sceneRef = useRef(null);
  const entityRef = useRef(null); 
  const horrorGrowthsRef = useRef([]); 
  const bulletsRef = useRef([]);
  const collisionPointsRef = useRef([]); // 碰撞採樣點（玩家局部座標）
  const clickCenterIndexRef = useRef(null); // 最近一次點擊對應的點雲索引
  const bloodParticlesRef = useRef([]);
  const isDeadRef = useRef(false);
  const pendingShotRef = useRef(false);

  // INDEPENDENT EYE CONTROLLERS
  const eyesRef = useRef([]);

  // Tentacle Batch System
  const tentacleBatchRef = useRef({
    active: false,
    meshes: [],
    centerIndex: 0,
    targetScale: 0.1 // For gradual growth
  });

  const uniformsRef = useRef({
    uTime: { value: 0 },
    uHeal: { value: 0 },
    uHit: { value: 0 },
  });
  const healIntensityRef = useRef(0);
  const hitIntensityRef = useRef(0);
  const animationFrameRef = useRef(0);

  // Config for Tentacle Aesthetics
  const MAX_RINGS = TENTACLE_DENSITY.rings; // How many transverse rings
  const POINTS_PER_RING = TENTACLE_DENSITY.pointsPerRing; // Points in one circle

  useEffect(() => {
    const THREE = window.THREE;
    if (!THREE) return;

    // SCENE
    const scene = new THREE.Scene();
    // Deep Space/Void Background
    scene.fog = new THREE.FogExp2(0x020205, 0.02);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 45;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    
    const isMobileViewport = () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
    const computeRendererViewport = () => {
      const vv = window.visualViewport;
      return {
        width: vv?.width || window.innerWidth,
        height: vv?.height || window.innerHeight
      };
    };
    const applyRendererViewport = () => {
      const { width, height } = computeRendererViewport();
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const canvas = renderer.domElement;
      canvas.style.width = '100vw';
      canvas.style.height = '100dvh';
      canvas.style.minHeight = '100vh';
      canvas.style.maxWidth = '100%';
      canvas.style.maxHeight = '100%';
      canvas.style.display = 'block';
      canvas.style.position = 'fixed';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.transform = 'none';
    };
    applyRendererViewport();
    mountRef.current?.appendChild(renderer.domElement);
    
    const handleResize = () => {
      renderer.setPixelRatio(window.devicePixelRatio);
      applyRendererViewport();
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    const disposeBullet = (sceneObj, bullet) => {
      if (!bullet) return;
      sceneObj.remove(bullet);
      if (bullet.material?.dispose) bullet.material.dispose();
      if (bullet.geometry?.dispose) bullet.geometry.dispose();
    };

    // LIGHTS
    const ambientLight = new THREE.AmbientLight(0x222222);
    scene.add(ambientLight);
    
    // ----------------------------
    // ENTITY GENERATION (Volumetric Point Cloud)
    // ----------------------------
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pointData, 3));
    
    // Very small points for "Neural Cloud" look
    const sizes = new Float32Array(pointData.length / 3).fill(0.1); 
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    const colors = [];
    const color = new THREE.Color();
    for (let i = 0; i < pointData.length / 3; i++) {
      // Base vessel color: Greenish/Teal neural look
      // STORED for later use in tentacle matching
      color.setHSL(0.35 + Math.random() * 0.1, 0.8, 0.6); 
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('customColor', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.ShaderMaterial({
      uniforms: uniformsRef.current,
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      transparent: true
    });

    const cloud = new THREE.Points(geometry, material);
    // 玩家生成位置（依桌機/手機設定）
    cloud.position.set(playerConf.position.x, playerConf.position.y, playerConf.position.z); 
    scene.add(cloud);
    entityRef.current = cloud;

    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    // 碰撞採樣點：取部分點雲用來做距離判定（避免方形碰撞）
    const totalPoints = pointData.length / 3;
    const stride = Math.max(1, Math.floor(totalPoints / 1500)); // 約取 1500 點做碰撞
    const sampled = [];
    for (let i = 0; i < totalPoints; i += stride) {
      sampled.push(new THREE.Vector3(pointData[i * 3], pointData[i * 3 + 1], pointData[i * 3 + 2]));
    }
    collisionPointsRef.current = sampled;

    // ----------------------------
    // EYE ATTACHMENT LOGIC (EDGE DETECTION)
    // ----------------------------
    
    // Pre-calculate candidate points
    const candidates = [];
    for(let i=0; i<totalPoints; i++) {
        candidates.push({
            index: i,
            x: pointData[i*3],
            y: pointData[i*3+1],
            z: pointData[i*3+2]
        });
    }
    // Sort by X descending (Rightmost points first)
    candidates.sort((a, b) => b.x - a.x);

    // Filter: Top 5% of X values are considered "Right Edge"
    const rightEdgeThresholdIndex = Math.floor(candidates.length * 0.05);
    const rightEdgePoints = candidates.slice(0, Math.max(20, rightEdgeThresholdIndex));

    const createEye = (type) => {
        let px=0, py=0, pz=0;
        
        if (type === 'side') {
            // PICK FROM RIGHT EDGE
            // Pick a random point from the rightmost set
            const rIdx = Math.floor(Math.random() * rightEdgePoints.length);
            const p = rightEdgePoints[rIdx];
            px = p.x;
            py = p.y;
            pz = p.z;
        } else {
            // FRONT EYE: Random location
            let attempt = 0;
            const rangeY = box.max.y - box.min.y;
            const rangeX = box.max.x - box.min.x;
            
            // Bias towards upper body for front eyes
            const targetMinY = box.min.y + rangeY * 0.4; 
            
            while(attempt < 50) {
                const idx = Math.floor(Math.random() * totalPoints);
                const ty = pointData[idx*3+1];
                // Ensure it's not too far left/right extremes for aesthetic balance
                if (ty > targetMinY) {
                    px = pointData[idx*3];
                    py = pointData[idx*3+1];
                    pz = pointData[idx*3+2];
                    break;
                }
                attempt++;
            }
        }

        const eyeGeo = generateCyberEye(THREE, type);
        
        // UNIQUE UNIFORM FOR INDEPENDENT BLINKING
        const eyeUniforms = {
            uBlink: { value: 0 }
        };

        const eyeMat = new THREE.ShaderMaterial({
            uniforms: eyeUniforms,
            vertexShader: eyeVertexShader,
            fragmentShader: eyeFragmentShader,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            transparent: true
        });
        
        const mesh = new THREE.Points(eyeGeo, eyeMat);
        mesh.position.set(px, py, pz + 1.0); 
        mesh.scale.set(EYE_SCALE, EYE_SCALE, EYE_SCALE);
        cloud.add(mesh);

        // Register controller
        eyesRef.current.push({
            mesh,
            uniforms: eyeUniforms,
            nextBlinkTime: Math.random() * 2.0, // Initial random offset
            blinkState: 'open',
            blinkSpeed: 0.1 + Math.random() * 0.1 // Random speed
        });
    };

    // SPAWN EYES: 3 FRONT, 2 SIDE
    createEye('front');
    createEye('front');
    createEye('front');
    createEye('side');
    createEye('side');

    // ----------------------------
    // HORROR FACTORIES
    // ----------------------------
    const spawnHorrorGrowth = () => {
        if (!entityRef.current) return;
        
        const batch = tentacleBatchRef.current;
        const totalPoints = pointData.length / 3;

        // 每次點擊保證至少生成一根：滿批次時重置後再生成
        if (batch.meshes.length >= TENTACLE_SETTINGS.perBatch) {
             batch.meshes = [];
             batch.targetScale = 0.1;
             batch.active = false; 
        }

        // 如果尚未設定中心，改用點擊位置最近的點雲；若沒有點擊紀錄則隨機
        if (!batch.active && batch.meshes.length === 0) {
             batch.centerIndex = (clickCenterIndexRef.current ?? Math.floor(Math.random() * totalPoints));
             batch.active = true;
        }

        // 每次呼叫都新增一根觸手
        const chosenIndex = clickCenterIndexRef.current ?? batch.centerIndex;
        createSingleTentacle(chosenIndex, batch.targetScale);

        // 同時推進成長倍率
        batch.targetScale += TENTACLE_SETTINGS.growthPerClick; // Grow by config per click
        if (batch.targetScale > 1.0) batch.targetScale = 1.0;
    };

    const createSingleTentacle = (seedIndex, initialScale) => {
        // =================================================
        // POINT CLOUD TENTACLE GENERATION (Sequential)
        // =================================================
        
        // 1. Root Position: Clustered around seed
        const totalPoints = pointData.length / 3;
        const offset = Math.floor((Math.random() - 0.5) * 50); 
        let rootIdx = (seedIndex + offset) % totalPoints;
        if (rootIdx < 0) rootIdx += totalPoints;
        
        const rx = pointData[rootIdx * 3];
        const ry = pointData[rootIdx * 3 + 1];
        const rz = pointData[rootIdx * 3 + 2];
        const rootPos = new THREE.Vector3(rx, ry, rz);

        // Get Root Color
        const entityColors = entityRef.current.geometry.attributes.customColor.array;
        const rootColor = new THREE.Color(
            entityColors[rootIdx * 3],
            entityColors[rootIdx * 3 + 1],
            entityColors[rootIdx * 3 + 2]
        );

        // 2. Control Points
        const pathPoints = [];
        const numSegments = 25;
        const length = TENTACLE_SETTINGS.baseLength + Math.random() * TENTACLE_SETTINGS.lengthJitter; 
        // 方向增加變化：XY 擴散放大，Z 方向隨機正負（朝玩家/遠離玩家皆有）
        const dir = new THREE.Vector3(
            (Math.random()-0.5) * 2 * TENTACLE_SETTINGS.dirChaosXY, 
            (Math.random()-0.5) * 2 * TENTACLE_SETTINGS.dirChaosXY, 
            (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * TENTACLE_SETTINGS.towardCameraBias)
        ).normalize();

        for(let i=0; i<numSegments; i++) {
            const t = i / numSegments;
            const p = dir.clone().multiplyScalar(t * length);
            
            p.x += Math.sin(t * Math.PI * 4) * 3 * t;
            p.y += Math.cos(t * Math.PI * 4) * 3 * t;
            p.z += Math.sin(t * Math.PI * 2) * 5 * t;
            
            pathPoints.push(p);
        }
        const curve = new THREE.CatmullRomCurve3(pathPoints);
        
        // 3. Generate Ring Data (High Density)
        const tipColor = new THREE.Color(0xFF007F); // Hot Pink
        const { points, sizes, colors } = generateRingedPoints(
             THREE, curve, MAX_RINGS, POINTS_PER_RING, 0.8, rootColor, tipColor
        );

        const particles = new Float32Array(points);
        const particleSizes = new Float32Array(sizes);
        const particleColors = new Float32Array(colors);
        const originalColors = new Float32Array(colors); // Store Original for Dimming Logic
        
        // BUFFER GEOMETRY
        const pointsGeo = new THREE.BufferGeometry();
        const posAtt = new THREE.BufferAttribute(particles, 3);
        const colAtt = new THREE.BufferAttribute(particleColors, 3);
        
        posAtt.setUsage(THREE.DynamicDrawUsage);
        colAtt.setUsage(THREE.DynamicDrawUsage);

        pointsGeo.setAttribute('position', posAtt);
        pointsGeo.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));
        pointsGeo.setAttribute('customColor', colAtt);

        const pointsMat = new THREE.ShaderMaterial({
            uniforms: uniformsRef.current,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            transparent: true
        });

        const pointsMesh = new THREE.Points(pointsGeo, pointsMat);
        pointsMesh.position.copy(rootPos);
        // Start tiny for fade-in
        pointsMesh.scale.set(0.01, 0.01, 0.01); 
        pointsMesh.userData.logicalScale = 0.01; // 紀錄邏輯縮放，避免每幀累乘

        entityRef.current.add(pointsMesh);

        // Add to global animation list
        const growthData = {
            type: 'tentacle_cloud',
            mesh: pointsMesh,
            curve,
            rootColor,
            tipColor,
            restPoints: pathPoints.map(p => p.clone()),
            seed: Math.random() * 1000,
            speed: 1.0 + Math.random() * 1.2,
            spiralFactor: (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 3),
            wiggleChaos: TENTACLE_SETTINGS.wiggleChaosRange[0] + Math.random() * (TENTACLE_SETTINGS.wiggleChaosRange[1] - TENTACLE_SETTINGS.wiggleChaosRange[0]),
            originalColors: originalColors, // Keep Ref
            createdAt: performance.now() // For Fade-In
        };
        horrorGrowthsRef.current.push(growthData);

        // Add to current batch
        tentacleBatchRef.current.meshes.push(pointsMesh);
    };

    // ----------------------------
    // EXPLOSION
    // ----------------------------
    const createExplosion = () => {
        if (!entityRef.current) return;
        entityRef.current.visible = false;
        const particleCount = 200;
        const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const mat = new THREE.MeshBasicMaterial({ color: 0xaa0000 }); 

        for(let i=0; i<particleCount; i++) {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(entityRef.current.position);
            mesh.position.x += (Math.random() - 0.5) * 10;
            mesh.position.y += (Math.random() - 0.5) * 10;
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 3, 
                (Math.random() - 0.5) * 3, 
                (Math.random() - 0.5) * 3
            );
            scene.add(mesh);
            bloodParticlesRef.current.push({ mesh, velocity });
        }
    };

    // ----------------------------
    // RAYCASTER
    // ----------------------------
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const setClickCenterFromWorldPoint = (worldPoint) => {
      if (!entityRef.current || !pointData?.length) return;
      const local = entityRef.current.worldToLocal(worldPoint.clone());
      let nearestIdx = 0;
      let nearestD2 = Infinity;
      const totalPoints = pointData.length / 3;
      const stride = Math.max(1, Math.floor(totalPoints / 2000)); // 降低計算量
      for (let i = 0; i < totalPoints; i += stride) {
        const dx = local.x - pointData[i * 3];
        const dy = local.y - pointData[i * 3 + 1];
        const dz = local.z - pointData[i * 3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < nearestD2) {
          nearestD2 = d2;
          nearestIdx = i;
        }
      }
      clickCenterIndexRef.current = nearestIdx;
    };

    const onMouseClick = (event) => {
      if (isDeadRef.current) return;
      const canvasRect = renderer.domElement.getBoundingClientRect();
      const rectWidth = canvasRect.width || window.innerWidth;
      const rectHeight = canvasRect.height || window.innerHeight;
      const relativeX = (event.clientX - canvasRect.left) / rectWidth;
      const relativeY = (event.clientY - canvasRect.top) / rectHeight;

      mouse.x = relativeX * 2 - 1;
      mouse.y = -(relativeY * 2 - 1);

      raycaster.setFromCamera(mouse, camera);
      const hitTestGeo = new THREE.PlaneGeometry(40, 40);
      const hitTestMesh = new THREE.Mesh(hitTestGeo, new THREE.MeshBasicMaterial({visible:false}));
      hitTestMesh.position.copy(cloud.position);
      hitTestMesh.updateMatrixWorld();
      
      const intersects = raycaster.intersectObject(hitTestMesh);
      const hitPoint = intersects[0]?.point;

      if (hitPoint) {
        setClickCenterFromWorldPoint(hitPoint);
        healIntensityRef.current = 1.0;
        setHealth(prev => {
            const newHealth = prev + 5;
            healthRef.current = newHealth;
            return newHealth;
        });
      } else if (entityRef.current) {
        // fallback: 用玩家中心避免漏掉觸手生成位置
        setClickCenterFromWorldPoint(entityRef.current.getWorldPosition(new THREE.Vector3()));
      }

      // 每次點擊都生成觸手（無論是否補血）
      spawnHorrorGrowth();
    };

    window.addEventListener('pointerdown', onMouseClick);

    // ----------------------------
    // GAME LOOP
    // ----------------------------
    const animate = (time) => {
      const seconds = time * 0.001;
      uniformsRef.current.uTime.value = seconds;
      healIntensityRef.current *= 0.95;
      uniformsRef.current.uHeal.value = healIntensityRef.current;
      hitIntensityRef.current *= 0.9;
      uniformsRef.current.uHit.value = hitIntensityRef.current;

      // INDEPENDENT BLINK LOGIC
      eyesRef.current.forEach(eye => {
          // Check if time to blink
          if (seconds > eye.nextBlinkTime) {
              if (eye.blinkState === 'open') {
                  eye.blinkState = 'closing';
              }
          }
          
          if (eye.blinkState === 'closing') {
              eye.uniforms.uBlink.value += eye.blinkSpeed;
              if (eye.uniforms.uBlink.value >= 1.0) {
                  eye.uniforms.uBlink.value = 1.0;
                  eye.blinkState = 'closed';
                  // Schedule re-open very quickly (100ms)
                  eye.nextBlinkTime = seconds + 0.1; 
              }
          } else if (eye.blinkState === 'closed' && seconds > eye.nextBlinkTime) {
              eye.blinkState = 'opening';
          } else if (eye.blinkState === 'opening') {
              eye.uniforms.uBlink.value -= eye.blinkSpeed;
              if (eye.uniforms.uBlink.value <= 0.0) {
                  eye.uniforms.uBlink.value = 0.0;
                  eye.blinkState = 'open';
                  // Next blink: Random interval 2s - 6s
                  eye.nextBlinkTime = seconds + 2.0 + Math.random() * 4.0; 
              }
          }
      });

      if (healthRef.current <= 0 && !isDeadRef.current) {
          isDeadRef.current = true;
          createExplosion();
          setTimeout(() => onGameOver(), 2500); 
      }

      if (isDeadRef.current) {
          bloodParticlesRef.current.forEach(p => {
              p.mesh.position.add(p.velocity);
              p.mesh.rotation.x += 0.1;
              p.velocity.y -= 0.02; 
          });
      } else {
          // UPDATE HORROR GROWTHS
          const targetScaleGlobal = tentacleBatchRef.current.targetScale;

          horrorGrowthsRef.current.forEach(g => {
              if (g.type === 'tentacle_cloud') {
                  const { curve, restPoints, seed, speed, mesh, spiralFactor, rootColor, tipColor, originalColors, createdAt, wiggleChaos } = g;
                  
                  // 1. Smooth Growth (Tween scale) - 使用邏輯縮放避免累乘爆炸
                  let logicalScale = mesh.userData.logicalScale ?? mesh.scale.x;
                  if (tentacleBatchRef.current.meshes.includes(mesh)) {
                      logicalScale = logicalScale + (targetScaleGlobal - logicalScale) * 0.1;
                  }
                  mesh.userData.logicalScale = logicalScale;
                  // 1b. 越靠近鏡頭越放大，遠離鏡頭變小（非累積）
                  const worldPos = mesh.getWorldPosition(new THREE.Vector3());
                  const distToCam = worldPos.distanceTo(camera.position);
                  const followFactor = 1 + TENTACLE_SETTINGS.followScaleStrength * Math.max(0, (60 - distToCam) / 60);
                  const finalScale = logicalScale * followFactor;
                  mesh.scale.set(finalScale, finalScale, finalScale);

                  // 2. Animate Control Points (Writhing)
                  for(let i=0; i<curve.points.length; i++) {
                      if (i === 0) continue; 
                      
                      const rest = restPoints[i];
                      const amp = (i / curve.points.length) * 3.0 * (wiggleChaos ?? 1); // Increased amplitude at tips
                      
                      const t = seconds * speed + i * 0.15;
                      const chaosPhase = seed + i * 0.37;
                      const spiralX = Math.sin(t + chaosPhase * 0.3) * Math.cos(t * 0.5 + chaosPhase) * spiralFactor * 0.35;
                      const spiralY = Math.cos(t + chaosPhase * 0.5) * Math.sin(t * 0.5 + chaosPhase) * spiralFactor * 0.35;
                      const nx = Math.sin(seconds * speed * (0.8 + wiggleChaos * 0.4) + i + seed);
                      const ny = Math.cos(seconds * speed * (1.1 + wiggleChaos * 0.3) + i + seed * 1.2);
                      const nz = Math.sin(seconds * speed * (0.7 + wiggleChaos * 0.2) + seed * 0.7 + i * 0.2);

                      curve.points[i].x = rest.x + nx * amp + spiralX;
                      curve.points[i].y = rest.y + ny * amp + spiralY;
                      curve.points[i].z = rest.z + nz * amp;
                  }

                  // 3. Re-generate Geometry
                  const { points } = generateRingedPoints(
                      THREE, curve, MAX_RINGS, POINTS_PER_RING, 0.8, rootColor, tipColor
                  );
                  
                  const attPos = mesh.geometry.attributes.position;
                  const attCol = mesh.geometry.attributes.customColor;
                  
                  // 4. Color / Glow / Fade Logic
                  // Fade In (0.3s)
                  const age = time - createdAt;
                  const fadeIn = Math.min(age / 300, 1.0); // 0 to 1 over 300ms

                  // Glow Logic based on Scale
                  // Stage 1-3 (Scale < 0.4): Dim (0.3)
                  // Stage 4+ (Scale >= 0.4): Bright (1.2)
                  const scaleFactor = mesh.scale.x;
                  let glowMultiplier = 0.3; // Default Dim
                  if (scaleFactor >= 0.35) {
                      glowMultiplier = 1.2; // GLOW
                  }

                  const finalBrightness = glowMultiplier * fadeIn;

                  // Update buffers
                  for(let k=0; k < points.length; k++) {
                      attPos.array[k] = points[k];
                      
                      // Apply brightness to color
                      attCol.array[k * 3]     = originalColors[k * 3]     * finalBrightness;
                      attCol.array[k * 3 + 1] = originalColors[k * 3 + 1] * finalBrightness;
                      attCol.array[k * 3 + 2] = originalColors[k * 3 + 2] * finalBrightness;
                  }
                  attPos.needsUpdate = true;
                  attCol.needsUpdate = true;

                  // Ensure we draw everything (RESTORED DENSITY)
                  mesh.geometry.setDrawRange(0, points.length / 3);
              }
          });

          // MAIN ENTITY ANIMATION (BREATHING & ROTATION)
          if (entityRef.current) {
             // Slow rotation
             entityRef.current.rotation.z = Math.sin(seconds * 0.1) * 0.05;
             
             // ORGANIC BREATHING SIMULATION
             // Compound sine wave for non-uniform, biological breathing rhythm
             // (Slow inhale, pause, fast exhale pattern simulation via interference)
             const breath = (Math.sin(seconds * 2.0) + Math.sin(seconds * 3.14) * 0.5) * 0.02;
             
             const healthScale = 0.4 + Math.max(0, healthRef.current - 100) / 400.0;
             const baseScale = playerConf.baseScale * healthScale;
             const finalScale = baseScale + breath;
             
             entityRef.current.scale.set(finalScale, finalScale, finalScale);
          }

          // BULLET LOGIC
          if (pendingShotRef.current) {
              pendingShotRef.current = false;
              const bullet = createBullet(scene);
              if (bullet) {
                  bulletsRef.current.push(bullet);
              }
          }
          const tmpHitVec = new THREE.Vector3();
          const localTmp = new THREE.Vector3();
          const targetWorld = new THREE.Vector3();
          for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
              const b = bulletsRef.current[i];
              const data = b.userData || (b.userData = {});
              if (data.pulseOffset === undefined) {
                  data.pulseOffset = Math.random() * Math.PI * 2;
              }
              const pulse = time * 0.003 + data.pulseOffset;
              if (b.material?.color?.setHSL) {
                  const hue = 0.02 + 0.05 * Math.sin(pulse);
                  const lightness = 0.45 + 0.25 * Math.sin(pulse * 2.0);
                  const clampedLight = Math.max(0.2, Math.min(0.85, lightness));
                  b.material.color.setHSL(hue, 1, clampedLight);
                  b.material.opacity = 0.55 + 0.35 * Math.abs(Math.sin(pulse * 1.5));
              }
              if (data.baseY === undefined) {
                  data.baseY = b.position.y;
              }
              b.rotation.z += 0.08;

              // 依玩家點雲最近點方向移動（每幀重算，不再水平）
              let moved = false;
              if (entityRef.current && collisionPointsRef.current.length) {
                  localTmp.copy(b.position);
                  entityRef.current.worldToLocal(localTmp);
                  let nearest = null;
                  let nearestD2 = Infinity;
                  for (let k = 0; k < collisionPointsRef.current.length; k++) {
                      const p = collisionPointsRef.current[k];
                      const d2 = localTmp.distanceToSquared(p);
                      if (d2 < nearestD2) {
                          nearestD2 = d2;
                          nearest = p;
                      }
                  }
                  if (nearest) {
                      targetWorld.copy(nearest).applyMatrix4(entityRef.current.matrixWorld);
                      const dirVec = targetWorld.sub(b.position);
                      const len2 = dirVec.lengthSq();
                      if (len2 > 0.0001) {
                          dirVec.normalize().multiplyScalar(BULLET_SPEED);
                          b.position.add(dirVec);
                          moved = true;
                      }
                  }
              }
              if (!moved) {
                  b.position.x -= BULLET_SPEED;
              }

              // Hit Detection (依玩家配置位置計算)
              const playerCenterX = playerConf.position.x;
              const hitHalfWidth = 12 * playerConf.baseScale; // 可依需要放大/縮小
              const hitHalfHeight = 10; // 垂直判定範圍

              // 方形粗判斷（快速）
              let hit = false;
              if (
                  b.position.x < playerCenterX + hitHalfWidth &&
                  b.position.x > playerCenterX - hitHalfWidth &&
                  Math.abs(b.position.y - playerConf.position.y) < hitHalfHeight
              ) {
                  // 精細判斷：將子彈座標轉到玩家局部座標，計算與點雲採樣點距離
                  if (entityRef.current && collisionPointsRef.current.length) {
                      const localPos = entityRef.current.worldToLocal(tmpHitVec.copy(b.position));
                      const r2 = PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS;
                      for (let k = 0; k < collisionPointsRef.current.length; k++) {
                          if (localPos.distanceToSquared(collisionPointsRef.current[k]) <= r2) {
                              hit = true;
                              break;
                          }
                      }
                  } else {
                      hit = true; // 後備：若無點雲資料仍視為命中
                  }
              }

              if (hit) {
                  disposeBullet(scene, b);
                  bulletsRef.current.splice(i, 1);
                  hitIntensityRef.current = 1.0;
                  setHealth(prev => {
                      const h = prev - 10;
                      healthRef.current = h;
                      return h;
                  });
                  // Trigger UI Disturbance
                  setLastHitTime(Date.now());
                  continue;
              }
              const cleanupX = playerCenterX - (hitHalfWidth + 20);
              if (b.position.x < cleanupX) { // Removed when off screen Left
                  disposeBullet(scene, b);
                  bulletsRef.current.splice(i, 1);
              }
          }
      }

      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('pointerdown', onMouseClick);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      cancelAnimationFrame(animationFrameRef.current);
      if(mountRef.current) mountRef.current.innerHTML = '';
      const cleanupScene = sceneRef.current;
      bulletsRef.current.forEach((b) => {
        cleanupScene?.remove?.(b);
        if (b.material?.dispose) b.material.dispose();
        if (b.geometry?.dispose) b.geometry.dispose();
      });
      bulletsRef.current = [];
      horrorGrowthsRef.current = [];
      bloodParticlesRef.current = [];
    };
  }, [isMobile, playerConf, bulletConf]);

  const createBullet = useCallback((scene) => {
      const THREE = window.THREE;
      if (!THREE) return null;

      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(BULLET_POINT_COUNT * 3);
      const colors = new Float32Array(BULLET_POINT_COUNT * 3);
      const palette = [
        new THREE.Color(0xfff066),
        new THREE.Color(0xffa000),
        new THREE.Color(0xff2d2d)
      ];

      for (let i = 0; i < BULLET_POINT_COUNT; i++) {
          const angle = Math.random() * Math.PI * 2;
          const radius = bulletConf.radius * Math.random();
          const zOffset = (Math.random() - 0.5) * 0.6 * (bulletConf.radius / 0.8);
          positions[i * 3] = Math.cos(angle) * radius;
          positions[i * 3 + 1] = Math.sin(angle) * radius;
          positions[i * 3 + 2] = zOffset;

          const color = palette[Math.floor(Math.random() * palette.length)];
          colors[i * 3] = color.r;
          colors[i * 3 + 1] = color.g;
          colors[i * 3 + 2] = color.b;
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
          size: bulletConf.size,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          vertexColors: true
      });

      const cloud = new THREE.Points(geometry, material);
      const originVec = new THREE.Vector3(bulletConf.origin.x, bulletConf.origin.y, bulletConf.origin.z);
      cloud.position.copy(originVec);
      // 讓子彈朝玩家點雲飛行
      let dir = new THREE.Vector3(-1, 0, 0).multiplyScalar(BULLET_SPEED);
      if (entityRef.current && collisionPointsRef.current.length) {
        const samples = collisionPointsRef.current;
        const idx = Math.floor(Math.random() * samples.length);
        const targetLocal = samples[idx].clone();
        const targetWorld = targetLocal.applyMatrix4(entityRef.current.matrixWorld);
        dir = targetWorld.sub(originVec);
        if (dir.lengthSq() > 0.0001) {
          dir.normalize().multiplyScalar(BULLET_SPEED);
        } else {
          dir.set(-BULLET_SPEED, 0, 0);
        }
      }
      cloud.userData = { 
        pulseOffset: Math.random() * Math.PI * 2,
        baseY: bulletConf.origin.y,
        dir
      };
      scene.add(cloud);
      return cloud;
  }, [bulletConf]);

  const handleShooterFrameChange = useCallback((frameIdx) => {
      if (frameIdx !== SHOOTER_FIRE_FRAME_INDEX) return;
      pendingShotRef.current = true;
  }, []);

  const healthColor = health > 100 ? '#ff00ff' : '#00ff00';
  const healthLabelStyle = {
    position: 'absolute',
    top: isMobile ? '60px' : '75px',
    left: isMobile ? '20px' : '30px',
    color: healthColor,
    fontSize: isMobile ? '13px' : '18px',
    fontWeight: 'bold',
    fontFamily: 'Megrim',
    textTransform: 'uppercase',
    display: 'flex',
    alignItems: 'center',
    gap: isMobile ? '6px' : '10px'
  };
  const symbolFontSize = isMobile ? '18px' : '24px';
  const overgrowthFontSize = isMobile ? '10px' : '14px';

  const npcSize = isMobile ? 120 : 150;
  const npcStyle = {
    position: 'absolute',
    right: isMobile ? '2%' : '5%',
    top: '50%',
    transform: `translateY(-${NPC_HEAD_ANCHOR_RATIO * 100}%)`,
    width: `${npcSize}px`,
    height: `${npcSize}px`
  };

  return (
    <>
      {/* 3D Container */}
      <div
        ref={mountRef}
        style={{
          width: '100vw',
          height: '100dvh',
          minHeight: '100vh',
          position: 'fixed',
          inset: 0,
          zIndex: 1,
          backgroundColor: '#000',
          overflow: 'hidden'
        }}
      />
      
      {/* HUD Layer - FUTURISTIC/NEURAL STYLE */}
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100dvh', minHeight: '100vh', pointerEvents: 'none', zIndex: 10 }}>
        
        {/* Shooter NPC - SWAPPED TO RIGHT */}
        <div style={npcStyle}>
            <SpriteAnimator
              id="npc_shooter"
              frames={ASSETS.SHOOTER_NPC_FRAMES}
              fps={14}
              breathe
              onFrameChange={handleShooterFrameChange}
              alt="Shooter"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
        </div>

        {/* POINT CLOUD HEALTH BAR */}
        <PointCloudHealthBar health={health} lastHit={lastHitTime} isMobile={isMobile} />

        {/* Health Text Label */}
        <div className="neural-text" style={healthLabelStyle}>
            <span style={{ fontSize: symbolFontSize }}>Γê┐</span> 
            VESSEL SYNAPSE: {health}%
        </div>
      </div>
    </>
  );
};

// ==========================================
// PHASE 3: GAME OVER
// ==========================================
const GameOverPhase = () => {
    const poem = [
        "WITH JUST A STICK AND A BIT OF ICE CREAM,",
        "THEY TRANSFORMED ME INTO A DINOSAUR.",
        "HOW ABOUT YOU?"
    ];
    const [lineIndex, setLineIndex] = useState(-1); 
    const [text, setText] = useState("");
    const [isBlackout, setIsBlackout] = useState(false);

    useEffect(() => {
        let lineIdx = 0;
        let charIdx = 0;
        let currentText = "";
        
        const typeChar = () => {
            if (lineIdx >= poem.length) {
                setTimeout(() => {
                    setIsBlackout(true);
                }, 30000); 
                return;
            }

            const line = poem[lineIdx];
            if (charIdx < line.length) {
                currentText = line.substring(0, charIdx + 1);
                setText(prev => {
                    const pastLines = poem.slice(0, lineIdx).join('\n');
                    return (pastLines ? pastLines + '\n' : '') + currentText;
                });
                charIdx++;
                setTimeout(typeChar, 100); 
            } else {
                lineIdx++;
                charIdx = 0;
                setTimeout(typeChar, 1000); 
            }
        };

        setTimeout(typeChar, 2000);

    }, []);

    if (isBlackout) {
        return <div style={{ width: '100vw', height: '100vh', background: 'black' }} />;
    }

    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            background: 'black',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            animation: 'fadeIn 2s ease-in'
        }}>
            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            `}</style>
            <div style={{
                color: 'white',
                fontFamily: 'Megrim, monospace',
                fontSize: '32px',
                whiteSpace: 'pre-line',
                textAlign: 'center',
                lineHeight: '1.5',
                textShadow: '0 0 10px white'
            }}>
                {text}
            </div>
        </div>
    );
};

// ==========================================
// MAIN APP COMPONENT
// ==========================================
const App = () => {
  const [phase, setPhase] = useState('drawing');
  const [pointData, setPointData] = useState([]);

  const handleDrawFinish = (points) => {
    setPointData(points);
    setPhase('game');
  };

  const handleGameOver = () => {
    setPhase('gameover');
  };

  return (
    <>
      {phase === 'drawing' && <DrawingPhase onFinish={handleDrawFinish} />}
      {phase === 'game' && <GamePhase pointData={pointData} onGameOver={handleGameOver} />}
      {phase === 'gameover' && <GameOverPhase />}
    </>
  );
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);
