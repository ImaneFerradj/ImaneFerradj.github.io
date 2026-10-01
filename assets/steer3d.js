/* "Steer the tip yourself", in 3D.
   The robot's steerable tip inside a 3D bladder model (assets/bladder-mesh.js, loaded when the section
   comes near). The tip has three sections that bend in one plane; the rotation slider turns that plane
   around the shaft. Each section's curvature grows with the square of its voltage (electrostrictive
   behaviour). Wall the camera has seen turns blue, and a round inset shows what the camera sees.
   Plain WebGL, no library. Falls back to the planar sketch in steer.js when WebGL isn't available.
   Illustrative only — not a model of the real robot. */
(function () {
  var root = document.getElementById("steer");
  if (!root) return;
  var canvas = root.querySelector(".steer-canvas");
  var insetBtn = root.querySelector(".steer-inset");

  function fallback() {
    root.classList.add("is-2d");
    root.classList.remove("is-loading");
    if (window.steer2D) window.steer2D();
  }

  var gl = null;
  try {
    gl = canvas && canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: true });
  } catch (e) { gl = null; }
  if (!gl) { fallback(); return; }
  root.classList.add("is-loading");

  // ---- Load the mesh only when the section gets close ----
  function load() {
    if (window.BLADDER_MESH) { start(); return; }
    var s = document.createElement("script");
    var me = document.querySelector('script[src*="steer3d.js"]');
    s.src = me ? me.src.replace(/steer3d\.js.*$/, "bladder-mesh.js") : "assets/bladder-mesh.js";
    s.onload = function () { if (window.BLADDER_MESH) start(); else fallback(); };
    s.onerror = fallback;
    document.head.appendChild(s);
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (en) {
      if (en.some(function (e) { return e.isIntersecting; })) { io.disconnect(); load(); }
    }, { rootMargin: "600px 0px" });
    io.observe(root);
  } else load();

  function start() {
    try { init(); } catch (e) { if (window.console) console.error(e); fallback(); }
  }

  // ======================================================================
  function init() {
    var M = window.BLADDER_MESH;
    var bin = atob(M.data), bytes = new Uint8Array(bin.length);
    for (var b = 0; b < bin.length; b++) bytes[b] = bin.charCodeAt(b);
    var buf = bytes.buffer, nv = M.nv, nf = M.nf, nbf = M.nbf;
    var qpos = new Int16Array(buf, 0, nv * 3);
    var idx = new Uint16Array(buf, nv * 6, nf * 3);
    var isBody = new Uint8Array(buf, nv * 6 + nf * 6, nv);
    var GX = M.grid[0], GY = M.grid[1], GZ = M.grid[2];
    var sdf = new Int8Array(buf, M.sdoff, GX * GY * GZ);

    var pos = new Float32Array(nv * 3);
    for (var i = 0; i < nv * 3; i++) pos[i] = qpos[i] * M.pq;

    // smooth normals and per-vertex area (for the coverage score)
    var nrm = new Float32Array(nv * 3), area = new Float32Array(nv);
    for (var f = 0; f < nf; f++) {
      var a = idx[3 * f], c1 = idx[3 * f + 1], c2 = idx[3 * f + 2];
      var ux = pos[3 * c1] - pos[3 * a], uy = pos[3 * c1 + 1] - pos[3 * a + 1], uz = pos[3 * c1 + 2] - pos[3 * a + 2];
      var vx = pos[3 * c2] - pos[3 * a], vy = pos[3 * c2 + 1] - pos[3 * a + 1], vz = pos[3 * c2 + 2] - pos[3 * a + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var ar = Math.sqrt(nx * nx + ny * ny + nz * nz) / 6;
      [a, c1, c2].forEach(function (k) {
        nrm[3 * k] += nx; nrm[3 * k + 1] += ny; nrm[3 * k + 2] += nz; area[k] += ar;
      });
    }
    for (i = 0; i < nv; i++) {
      var l = Math.hypot(nrm[3 * i], nrm[3 * i + 1], nrm[3 * i + 2]) || 1;
      nrm[3 * i] /= l; nrm[3 * i + 1] /= l; nrm[3 * i + 2] /= l;
    }
    var bodyIds = [], bodyArea = 0;
    for (i = 0; i < nv; i++) if (isBody[i]) { bodyIds.push(i); bodyArea += area[i]; }
    var seen = new Float32Array(nv);

    // signed distance to the wall (negative inside), trilinear on the coarse grid
    function sd(x, y, z) {
      var fx = (x - M.g0[0]) / M.h, fy = (y - M.g0[1]) / M.h, fz = (z - M.g0[2]) / M.h;
      if (fx < 0 || fy < 0 || fz < 0 || fx >= GX - 1 || fy >= GY - 1 || fz >= GZ - 1) return 10;
      var ix = fx | 0, iy = fy | 0, iz = fz | 0, tx = fx - ix, ty = fy - iy, tz = fz - iz;
      function g(a, b, c) { return sdf[(iz + c) * GX * GY + (iy + b) * GX + ix + a]; }
      var c00 = g(0, 0, 0) * (1 - tx) + g(1, 0, 0) * tx, c10 = g(0, 1, 0) * (1 - tx) + g(1, 1, 0) * tx;
      var c01 = g(0, 0, 1) * (1 - tx) + g(1, 0, 1) * tx, c11 = g(0, 1, 1) * (1 - tx) + g(1, 1, 1) * tx;
      return ((c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz) * M.sdq;
    }

    // ---- GL helpers ----
    function shader(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    function program(vs, fs) {
      var p = gl.createProgram();
      gl.attachShader(p, shader(gl.VERTEX_SHADER, vs)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      var info = { p: p, a: {}, u: {} }, n, k;
      n = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
      for (k = 0; k < n; k++) { var at = gl.getActiveAttrib(p, k).name; info.a[at] = gl.getAttribLocation(p, at); }
      n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (k = 0; k < n; k++) { var un = gl.getActiveUniform(p, k).name; info.u[un] = gl.getUniformLocation(p, un); }
      return info;
    }
    function vbo(data, usage) {
      var bf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bf); gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW); return bf;
    }
    function attr(prog, name, bf, size) {
      var loc = prog.a[name]; if (loc == null || loc < 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, bf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }
    function off(prog, name) { var loc = prog.a[name]; if (loc != null && loc >= 0) gl.disableVertexAttribArray(loc); }

    var MASK = [
      "uniform vec3 uMask;",
      "float mask(){ if(uMask.z<=0.) return 1.; float d=distance(gl_FragCoord.xy,uMask.xy); if(d>uMask.z) discard; return 1.-smoothstep(uMask.z-1.5,uMask.z,d); }"
    ].join("\n");

    // Tissue: outside ("glass" diorama) and through-the-camera views
    var tissue = program([
      "attribute vec3 aPos; attribute vec3 aNrm; attribute float aSeen; attribute float aBody;",
      "uniform mat4 uVP; varying vec3 vP; varying vec3 vN; varying float vS; varying float vB;",
      "void main(){ vP=aPos; vN=aNrm; vS=aSeen; vB=aBody; gl_Position=uVP*vec4(aPos,1.); }"
    ].join("\n"), [
      "precision highp float;",
      "varying vec3 vP; varying vec3 vN; varying float vS; varying float vB;",
      "uniform vec3 uEye; uniform vec3 uTip; uniform vec3 uDir; uniform float uCosH; uniform float uRange;",
      "uniform float uMode; uniform float uAlpha; uniform vec3 uBg;",
      MASK,
      "float h3(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }",
      "float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);",
      "  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),",
      "             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }",
      "void main(){",
      "  float m=mask();",
      "  vec3 n=normalize(vN); vec3 V=normalize(uEye-vP); if(dot(n,V)<0.) n=-n;",
      "  vec3 tissue=mix(vec3(.84,.50,.47),vec3(.93,.70,.66),vB);",
      "  vec3 tv=vP-uTip; float dist=length(tv); float cs=dot(tv,uDir)/max(dist,1e-3);",
      "  float lit=smoothstep(uCosH-.03,uCosH+.03,cs)*(1.-smoothstep(uRange*.8,uRange,dist))*step(0.,dot(tv,normalize(vN)))*vB;",
      "  if(uMode<.5){",
      // outside: soft studio light, blue where already seen, light blue patch where the camera looks now
      "    vec3 L=normalize(vec3(-.5,-.45,.75)); float d=.55+.45*max(dot(n,L),0.)+.12*n.z;",
      "    vec3 col=tissue*d;",
      "    col=mix(col,vec3(.11,.42,.88)*(.75+.35*d),vS*vB*.9);",
      "    col=mix(col,vec3(.52,.76,1.),lit*.85);",
      "    float fres=pow(1.-abs(dot(n,V)),2.);",
      "    float a=uAlpha<1.?clamp(uAlpha+.45*fres,0.,1.):1.;",
      "    col=mix(col,uBg,smoothstep(50.,88.,vP.z));",
      "    gl_FragColor=vec4(col*a*m,a*m);",
      "  } else {",
      // through the camera: the only light is at the tip, the wall is wet mucosa with vessels
      "    vec3 Ld=uEye-vP; float d=length(Ld); vec3 L=Ld/d;",
      "    float att=1./(1.+pow(d/26.,2.));",
      "    float spot=.35+.65*smoothstep(uCosH-.35,uCosH+.1,dot(-L,uDir));",
      "    float df=max(dot(n,L),0.);",
      "    float sp=pow(max(dot(reflect(-L,n),V),0.),36.)*.55;",
      "    float w=vn(vP*.22)*.65+vn(vP*.61+3.)*.35;",
      "    float vein=(1.-smoothstep(.0,.018,abs(w-.5)))*smoothstep(.35,.6,vn(vP*.15+11.));",
      "    float vein2=(1.-smoothstep(.0,.012,abs(vn(vP*.9+7.)-.5)))*smoothstep(.45,.7,vn(vP*.3+5.));",
      "    vec3 muc=mix(vec3(.95,.63,.56),vec3(.99,.78,.70),vn(vP*.8));",
      "    muc=mix(muc,vec3(.66,.16,.17),vein*.7); muc=mix(muc,vec3(.80,.34,.32),vein2*.4);",
      "    vec3 col=muc*(.05+1.25*df*att*spot)+vec3(1.,.95,.9)*sp*att;",
      "    gl_FragColor=vec4(col*m,m);",
      "  }",
      "}"
    ].join("\n"));

    // Robot (lit, per-vertex colour) and the faint light cone (unlit, per-vertex alpha)
    var solid = program([
      "attribute vec3 aPos; attribute vec3 aNrm; attribute vec4 aCol;",
      "uniform mat4 uVP; varying vec3 vN; varying vec4 vC; varying vec3 vP;",
      "void main(){ vN=aNrm; vC=aCol; vP=aPos; gl_Position=uVP*vec4(aPos,1.); }"
    ].join("\n"), [
      "precision highp float; varying vec3 vN; varying vec4 vC; varying vec3 vP; uniform float uLit; uniform vec3 uEye;",
      MASK,
      "void main(){ float m=mask();",
      "  if(uLit<.5){ gl_FragColor=vec4(vC.rgb*vC.a*m,vC.a*m); return; }",
      "  vec3 n=normalize(vN); vec3 L=normalize(vec3(-.5,-.45,.75)); vec3 V=normalize(uEye-vP);",
      "  float d=.5+.5*max(dot(n,L),0.); float s=pow(max(dot(reflect(-L,n),V),0.),24.)*.35;",
      "  gl_FragColor=vec4((vC.rgb*d+s)*m,m); }"
    ].join("\n"));

    // Round backdrop and rim for the inset
    var disk = program([
      "attribute vec2 aXY; void main(){ gl_Position=vec4(aXY,0.,1.); }"
    ].join("\n"), [
      "precision highp float; uniform vec3 uMask; uniform vec4 uCol; uniform float uRing;",
      "void main(){ float d=distance(gl_FragCoord.xy,uMask.xy); if(d>uMask.z) discard;",
      "  float a=uCol.a*(1.-smoothstep(uMask.z-1.5,uMask.z,d));",
      "  if(uRing>0.){ a*=smoothstep(uMask.z-uRing-1.,uMask.z-uRing,d); }",
      "  gl_FragColor=vec4(uCol.rgb*a,a); }"
    ].join("\n"));

    var bPos = vbo(pos), bNrm = vbo(nrm), bSeen = vbo(seen, gl.DYNAMIC_DRAW), bBody = vbo(new Float32Array(isBody));
    var bIdx = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    var bQuad = vbo(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    var bRP = vbo(new Float32Array(1), gl.DYNAMIC_DRAW), bRN = vbo(new Float32Array(1), gl.DYNAMIC_DRAW), bRC = vbo(new Float32Array(1), gl.DYNAMIC_DRAW);
    var bRI = gl.createBuffer();
    var bCP = vbo(new Float32Array(1), gl.DYNAMIC_DRAW), bCN = vbo(new Float32Array(1), gl.DYNAMIC_DRAW), bCC = vbo(new Float32Array(1), gl.DYNAMIC_DRAW);
    var bCI = gl.createBuffer();
    var robotCount = 0, coneCount = 0;

    // ---- Small matrix kit (column-major) ----
    function persp(fovy, asp, n, f) {
      var t = 1 / Math.tan(fovy / 2), r = 1 / (n - f);
      return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (n + f) * r, -1, 0, 0, 2 * n * f * r, 0];
    }
    function look(e, c, up) {
      var zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
      var xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx, xl = Math.hypot(xx, xy, xz); xx /= xl; xy /= xl; xz /= xl;
      var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
        -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
    }
    function mul(a, b) {
      var o = new Float32Array(16);
      for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
        var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s;
      }
      return o;
    }

    // ---- Robot: three constant-curvature sections in one plane ----
    var L = 9, KMAX = 1.4 / L, R = 1.7, NS = 12, RING = 12;
    var HALF = 0.5, RANGE = 62, COSH = Math.cos(HALF);
    var ZMIN = 3;
    // highest base the straight tip can reach without touching the dome
    var ZMAX = ZMIN;
    for (var zb = ZMIN; zb < 45; zb += 0.25) { if (sd(0, 0, zb + 3 * L) < -(R + 1.2)) ZMAX = zb; else break; }

    function curv(v) { var u = v / 100; return KMAX * (u < 0 ? -u * u : u * u); }
    function backbone(zb, th, ks) {
      var mx = Math.cos(th), my = Math.sin(th), pts = [], tan = [], u = 0, w = zb, phi = 0;
      pts.push([0, 0, zb]); tan.push(0);
      for (var s = 0; s < 3; s++) {
        var k = ks[s];
        for (var j = 1; j <= NS; j++) {
          var d = L * j / NS, pu, pw;
          if (Math.abs(k) < 1e-7) { pu = u + d * Math.sin(phi); pw = w + d * Math.cos(phi); }
          else { pu = u + (Math.cos(phi) - Math.cos(phi + k * d)) / k; pw = w + (Math.sin(phi + k * d) - Math.sin(phi)) / k; }
          pts.push([pu * mx, pu * my, pw]); tan.push(phi + k * d);
        }
        u = pts[pts.length - 1][0] * mx + pts[pts.length - 1][1] * my; w = pts[pts.length - 1][2]; phi += k * L;
      }
      return { pts: pts, phi: tan, m: [mx, my, 0] };
    }
    function fits(bb) {
      for (var i = 1; i < bb.pts.length; i++) { var p = bb.pts[i]; if (sd(p[0], p[1], p[2]) > -(R + 0.8)) return false; }
      return true;
    }

    function buildRobot(bb, vs) {
      var P = [], N = [], C = [], I = [], m = bb.m, bn = [-m[1], m[0], 0]; // bn: normal to the bending plane
      var shaftC = [0.66, 0.70, 0.74], bodyC = [0.90, 0.93, 0.95], ringC = [0.69, 0.48, 0.29], volt = [0.11, 0.42, 0.88];
      var path = [[0, 0, -60, 0]].concat(bb.pts.map(function (p, i) { return [p[0], p[1], p[2], bb.phi[i]]; }));
      for (var i = 0; i < path.length; i++) {
        var ph = path[i][3], t = [Math.sin(ph) * m[0], Math.sin(ph) * m[1], Math.cos(ph)];
        var q = [Math.cos(ph) * m[0], Math.cos(ph) * m[1], -Math.sin(ph)]; // in-plane normal
        var sec = i === 0 ? -1 : Math.min(2, Math.floor((i - 1) / NS));
        var isRing = i > 1 && (i - 1) % NS === 0 && i < path.length - 1;
        for (var r = 0; r < RING; r++) {
          var a = 2 * Math.PI * r / RING, ca = Math.cos(a), sa = Math.sin(a);
          var nx = ca * q[0] + sa * bn[0], ny = ca * q[1] + sa * bn[1], nz = ca * q[2] + sa * bn[2];
          P.push(path[i][0] + R * nx, path[i][1] + R * ny, path[i][2] + R * nz); N.push(nx, ny, nz);
          var col = sec < 0 ? shaftC : bodyC;
          if (sec >= 0) {
            var v = vs[sec] / 100, side = v >= 0 ? -1 : 1;             // active film sits on the convex side
            var strip = Math.max(0, (side * ca - 0.35) / 0.65) * Math.abs(v);
            col = [col[0] + (volt[0] - col[0]) * strip, col[1] + (volt[1] - col[1]) * strip, col[2] + (volt[2] - col[2]) * strip];
          }
          if (isRing) col = ringC;
          C.push(col[0], col[1], col[2], 1);
        }
        if (i > 0) for (r = 0; r < RING; r++) {
          var r2 = (r + 1) % RING, b0 = (i - 1) * RING, b1 = i * RING;
          I.push(b0 + r, b1 + r, b1 + r2, b0 + r, b1 + r2, b0 + r2);
        }
      }
      // end cap with a dark lens in the middle
      var last = path.length - 1, tp = path[last], tph = tp[3];
      var tt = [Math.sin(tph) * m[0], Math.sin(tph) * m[1], Math.cos(tph)];
      var cBase = P.length / 3;
      for (r = 0; r < RING; r++) {
        var s0 = (last * RING + r) * 3;
        P.push(P[s0], P[s0 + 1], P[s0 + 2]); N.push(tt[0], tt[1], tt[2]); C.push(0.92, 0.94, 0.96, 1);
      }
      for (r = 0; r < RING; r++) {
        var s1 = (last * RING + r) * 3;
        P.push(tp[0] + (P[s1] - tp[0]) * 0.45 + tt[0] * 0.25, tp[1] + (P[s1 + 1] - tp[1]) * 0.45 + tt[1] * 0.25, tp[2] + (P[s1 + 2] - tp[2]) * 0.45 + tt[2] * 0.25);
        N.push(tt[0], tt[1], tt[2]); C.push(0.06, 0.08, 0.1, 1);
      }
      var cc = P.length / 3; P.push(tp[0] + tt[0] * 0.3, tp[1] + tt[1] * 0.3, tp[2] + tt[2] * 0.3); N.push(tt[0], tt[1], tt[2]); C.push(0.25, 0.35, 0.5, 1);
      for (r = 0; r < RING; r++) {
        r2 = (r + 1) % RING;
        I.push(cBase + r, cBase + r2, cBase + RING + r2, cBase + r, cBase + RING + r2, cBase + RING + r, cBase + RING + r, cBase + RING + r2, cc);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, bRP); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(P), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, bRN); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(N), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, bRC); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(C), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bRI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.DYNAMIC_DRAW);
      robotCount = I.length;
    }

    function buildCone(tip, dir, up) {
      var side = [dir[1] * up[2] - dir[2] * up[1], dir[2] * up[0] - dir[0] * up[2], dir[0] * up[1] - dir[1] * up[0]];
      var len = 20, rad = len * Math.tan(HALF), K = 28, P = [tip[0], tip[1], tip[2]], C = [0.42, 0.66, 1, 0.34], I = [];
      for (var k = 0; k < K; k++) {
        var a = 2 * Math.PI * k / K, ca = Math.cos(a) * rad, sa = Math.sin(a) * rad;
        P.push(tip[0] + dir[0] * len + up[0] * ca + side[0] * sa, tip[1] + dir[1] * len + up[1] * ca + side[1] * sa, tip[2] + dir[2] * len + up[2] * ca + side[2] * sa);
        C.push(0.42, 0.66, 1, 0);
        I.push(0, 1 + k, 1 + (k + 1) % K);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, bCP); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(P), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, bCN); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(P.length), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, bCC); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(C), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bCI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.DYNAMIC_DRAW);
      coneCount = I.length;
    }

    // ---- Controls and state ----
    var inputs = {
      ins: root.querySelector('[name="ins"]'), rot: root.querySelector('[name="rot"]'),
      s1: root.querySelector('[name="s1"]'), s2: root.querySelector('[name="s2"]'), s3: root.querySelector('[name="s3"]')
    };
    var keys = ["ins", "rot", "s1", "s2", "s3"];
    var out = root.querySelector(".steer-score b");
    var scanBtn = root.querySelector(".steer-scan"), clearBtn = root.querySelector(".steer-clear");
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var cur = keys.map(function (k) { return +inputs[k].value; });
    var view = { yaw: 3.55, pitch: 0.32, dist: 175, main: "outside" };
    var tipState = null, dirty = true;

    function wrap(a) { while (a > 180) a -= 360; while (a < -180) a += 360; return a; }

    function solve(c) {
      c = c || cur;
      var zb = ZMIN + (ZMAX - ZMIN) * c[0] / 100, th = c[1] * Math.PI / 180;
      var vs = [c[2], c[3], c[4]], ks = vs.map(curv);
      var bb = backbone(zb, th, ks);
      if (!fits(bb)) {                      // the wall stops the tip: scale the bend back until it fits
        var lo = 0, hi = 1;
        for (var it = 0; it < 14; it++) {
          var mid = (lo + hi) / 2;
          if (fits(backbone(zb, th, ks.map(function (k) { return k * mid; })))) lo = mid; else hi = mid;
        }
        bb = backbone(zb, th, ks.map(function (k) { return k * lo; }));
      }
      var tip = bb.pts[bb.pts.length - 1], ph = bb.phi[bb.phi.length - 1], m = bb.m;
      var dir = [Math.sin(ph) * m[0], Math.sin(ph) * m[1], Math.cos(ph)];
      var up = [Math.cos(ph) * m[0], Math.cos(ph) * m[1], -Math.sin(ph)];
      var eye = [tip[0] + dir[0] * 0.4, tip[1] + dir[1] * 0.4, tip[2] + dir[2] * 0.4];
      return { bb: bb, vs: vs, tip: eye, dir: dir, up: up };
    }

    var seenDirty = false;
    function paint(st, quiet) {
      var t = st.tip, d = st.dir, count = 0, changed = false;
      for (var j = 0; j < bodyIds.length; j++) {
        var i = bodyIds[j];
        if (!seen[i]) {
          var vx = pos[3 * i] - t[0], vy = pos[3 * i + 1] - t[1], vz = pos[3 * i + 2] - t[2];
          var dist = Math.sqrt(vx * vx + vy * vy + vz * vz);
          if (dist < RANGE && vx * d[0] + vy * d[1] + vz * d[2] > COSH * dist &&
              vx * nrm[3 * i] + vy * nrm[3 * i + 1] + vz * nrm[3 * i + 2] > 0) { seen[i] = 1; changed = true; }
        }
        if (seen[i]) count += area[i];
      }
      if (changed) seenDirty = true;
      if (quiet) return;
      if (seenDirty) { gl.bindBuffer(gl.ARRAY_BUFFER, bSeen); gl.bufferSubData(gl.ARRAY_BUFFER, 0, seen); seenDirty = false; }
      var pct = String(Math.round(100 * count / bodyArea));
      if (out.textContent !== pct) out.textContent = pct;
    }

    // ---- Drawing ----
    var BG = [0.955, 0.968, 0.976];
    function useTissue(VP, eye, st, mode, alpha, mask) {
      gl.useProgram(tissue.p);
      gl.uniformMatrix4fv(tissue.u.uVP, false, VP);
      gl.uniform3fv(tissue.u.uEye, eye); gl.uniform3fv(tissue.u.uTip, st.tip); gl.uniform3fv(tissue.u.uDir, st.dir);
      gl.uniform1f(tissue.u.uCosH, COSH); gl.uniform1f(tissue.u.uRange, RANGE);
      gl.uniform1f(tissue.u.uMode, mode); gl.uniform1f(tissue.u.uAlpha, alpha); gl.uniform3fv(tissue.u.uBg, BG);
      gl.uniform3fv(tissue.u.uMask, mask);
      attr(tissue, "aPos", bPos, 3); attr(tissue, "aNrm", bNrm, 3); attr(tissue, "aSeen", bSeen, 1); attr(tissue, "aBody", bBody, 1);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx);
    }
    function useSolid(VP, eye, lit, mask, P, N, C, I) {
      gl.useProgram(solid.p);
      gl.uniformMatrix4fv(solid.u.uVP, false, VP); gl.uniform3fv(solid.u.uEye, eye);
      gl.uniform1f(solid.u.uLit, lit); gl.uniform3fv(solid.u.uMask, mask);
      attr(solid, "aPos", P, 3); attr(solid, "aNrm", N, 3); attr(solid, "aCol", C, 4);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, I);
    }
    function drawDisk(mask, col, ring) {
      gl.useProgram(disk.p);
      gl.uniform3fv(disk.u.uMask, mask); gl.uniform4fv(disk.u.uCol, col); gl.uniform1f(disk.u.uRing, ring || 0);
      attr(disk, "aXY", bQuad, 2);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      off(disk, "aXY");
    }

    function drawOutside(st, vp, mask) {
      var tgt = [0, 0, 20], cp = Math.cos(view.pitch);
      var eye = [tgt[0] + view.dist * cp * Math.cos(view.yaw), tgt[1] + view.dist * cp * Math.sin(view.yaw), tgt[2] + view.dist * Math.sin(view.pitch)];
      var VP = mul(persp(0.62, vp[2] / vp[3], 20, 600), look(eye, tgt, [0, 0, 1]));
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
      // 1. the far half of the wall, seen from inside, and the ureters
      useTissue(VP, eye, st, 0, 1, mask);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT);
      gl.drawElements(gl.TRIANGLES, nbf * 3, gl.UNSIGNED_SHORT, 0);
      gl.cullFace(gl.BACK);
      gl.drawElements(gl.TRIANGLES, (nf - nbf) * 3, gl.UNSIGNED_SHORT, nbf * 6);
      // 2. the robot
      useSolid(VP, eye, 1, mask, bRP, bRN, bRC, bRI);
      gl.disable(gl.CULL_FACE);
      gl.drawElements(gl.TRIANGLES, robotCount, gl.UNSIGNED_SHORT, 0);
      // 3. the camera's light, then the near wall as glass
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      useSolid(VP, eye, 0, mask, bCP, bCN, bCC, bCI);
      gl.drawElements(gl.TRIANGLES, coneCount, gl.UNSIGNED_SHORT, 0);
      useTissue(VP, eye, st, 0, 0.16, mask);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      gl.drawElements(gl.TRIANGLES, nbf * 3, gl.UNSIGNED_SHORT, 0);
      gl.disable(gl.CULL_FACE); gl.depthMask(true); gl.disable(gl.BLEND);
      off(solid, "aCol");
    }

    function drawCamera(st, vp, mask) {
      var t = st.tip, d = st.dir;
      var VP = mul(persp(2 * HALF * 1.25, vp[2] / vp[3], 0.4, 200), look(t, [t[0] + d[0], t[1] + d[1], t[2] + d[2]], st.up));
      gl.disable(gl.CULL_FACE); gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(true);
      useTissue(VP, t, st, 1, 1, mask);
      gl.drawElements(gl.TRIANGLES, nbf * 3, gl.UNSIGNED_SHORT, 0);
    }

    function insetRect() {
      var cr = canvas.getBoundingClientRect(), br = insetBtn.getBoundingClientRect(), s = canvas.width / (cr.width || 1);
      var x = (br.left - cr.left) * s, w = br.width * s, y = (cr.bottom - br.bottom) * s;
      return [Math.round(x), Math.round(y), Math.round(w), Math.round(w)];
    }

    function draw() {
      var st = tipState, W = canvas.width, H = canvas.height;
      if (!st || !W || !H) return;
      gl.viewport(0, 0, W, H); gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      var ir = insetRect(), full = [0, 0, W, H], none = [0, 0, 0];
      var big = [W / 2, H / 2, Math.min(W, H) / 2 - 2], small = [ir[0] + ir[2] / 2, ir[1] + ir[3] / 2, ir[2] / 2];
      if (view.main === "outside") {
        drawOutside(st, full, none);
        gl.viewport(ir[0], ir[1], ir[2], ir[3]); gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.DEPTH_TEST);
        drawDisk(small, [0.06, 0.02, 0.02, 1]);
        drawCamera(st, ir, small);
        gl.enable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
        drawDisk(small, [1, 1, 1, 1], 3);
      } else {
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.DEPTH_TEST);
        drawDisk(big, [0.06, 0.02, 0.02, 1]);
        drawCamera(st, full, big);
        gl.viewport(ir[0], ir[1], ir[2], ir[3]); gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
        drawDisk(small, [BG[0], BG[1], BG[2], 1]);
        drawOutside(st, ir, small);
        gl.enable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
        drawDisk(small, [1, 1, 1, 1], 3);
      }
    }

    function update() {
      var st = solve();
      tipState = st;
      buildRobot(st.bb, st.vs);
      buildCone(st.tip, st.dir, st.up);
      paint(st);
      draw();
    }

    // ---- Animation: the tip eases toward the slider values ----
    var raf = 0, scanning = false, t0 = 0, tLast = 0, SCAN = 26;
    function scanPose(t) {
      return [55 + 45 * Math.sin(0.5 * t - 1.3), wrap(-180 + t * 360 / 13),
        100 * Math.sin(0.9 * t + 0.4), 100 * Math.sin(1.37 * t + 1.1), 100 * Math.sin(2.1 * t + 2.3)];
    }
    function tick(now) {
      raf = 0;
      if (scanning) {
        var t = Math.min((now - t0) / 1000, SCAN);
        // on a slow device frames are far apart: still paint the wall along the whole sweep
        var steps = Math.min(60, Math.floor((t - tLast) / 0.04));
        for (var q = 1; q < steps; q++) paint(solve(scanPose(tLast + (t - tLast) * q / steps)), true);
        tLast = t;
        if (t >= SCAN) stopScan();
        else {
          var sp = scanPose(t);
          keys.forEach(function (k, i) { inputs[k].value = sp[i]; });
        }
      }
      var moving = false;
      keys.forEach(function (k, i) {
        var target = +inputs[k].value, d = k === "rot" ? wrap(target - cur[i]) : target - cur[i];
        if (reduce || Math.abs(d) < 0.3) cur[i] = target;
        else { cur[i] = k === "rot" ? wrap(cur[i] + d * 0.16) : cur[i] + d * 0.16; moving = true; }
      });
      update();
      if (moving || scanning) raf = requestAnimationFrame(tick);
    }
    function wake() { if (!raf) raf = requestAnimationFrame(tick); }
    function redraw() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; draw(); }); }

    keys.forEach(function (k) {
      inputs[k].addEventListener("input", function (e) { if (e.isTrusted) stopScan(); wake(); });
    });
    clearBtn.addEventListener("click", function () {
      seen.fill(0); gl.bindBuffer(gl.ARRAY_BUFFER, bSeen); gl.bufferSubData(gl.ARRAY_BUFFER, 0, seen); update();
    });
    function stopScan() {
      scanning = false; scanBtn.setAttribute("aria-pressed", "false"); root.classList.remove("is-scanning");
    }
    scanBtn.addEventListener("click", function () {
      if (scanning) { stopScan(); return; }
      scanning = true; t0 = performance.now(); tLast = 0;
      scanBtn.setAttribute("aria-pressed", "true"); root.classList.add("is-scanning");
      wake();
    });

    // swap the main view and the round inset
    insetBtn.addEventListener("click", function () {
      view.main = view.main === "outside" ? "camera" : "outside";
      insetBtn.setAttribute("aria-pressed", view.main === "camera" ? "true" : "false");
      root.classList.toggle("is-camera", view.main === "camera");
      redraw();
    });

    // drag: turn the bladder (outside view) or turn the shaft (camera view)
    var drag = null;
    function turn(dx, dy) {
      if (view.main === "outside") {
        view.yaw -= dx * 0.009;
        view.pitch = Math.max(-1.2, Math.min(1.35, view.pitch + dy * 0.007));
        redraw();
      } else {
        inputs.rot.value = wrap(+inputs.rot.value - dx * 0.5);
        stopScan(); wake();
      }
      root.classList.add("was-dragged");
    }
    canvas.addEventListener("pointerdown", function (e) {
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      turn(e.clientX - drag.x, e.pointerType === "touch" ? 0 : e.clientY - drag.y);
      drag.x = e.clientX; drag.y = e.clientY;
    });
    function endDrag() { drag = null; }
    canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("keydown", function (e) {
      var s = e.shiftKey ? 3 : 1, k = e.key;
      if (k === "ArrowLeft") turn(-12 * s, 0); else if (k === "ArrowRight") turn(12 * s, 0);
      else if (k === "ArrowUp") turn(0, -12 * s); else if (k === "ArrowDown") turn(0, 12 * s);
      else return;
      e.preventDefault();
    });

    // size the drawing buffer to the element
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2), w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; redraw(); }
    }
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
    window.addEventListener("resize", resize);
    canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); fallback(); });

    resize();
    root.classList.remove("is-loading");
    root.classList.add("is-3d");
    update();
    window.__steer3d = { view: view, inputs: inputs, update: update, seen: seen, ZMAX: ZMAX };
  }
})();
