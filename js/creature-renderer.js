/* Batch the homepage creature glyphs without changing particle simulation. */
(function () {
  'use strict';
  window.createCreatureRenderer = function (canvas, glyphs) {
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true });
    if (!gl || gl.getParameter(gl.MAX_TEXTURE_SIZE) < 4096) return null;
    const instancing = gl.getExtension('ANGLE_instanced_arrays');
    if (!instancing) return null;
    function shader(type, source) {
      const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, `
      attribute vec2 position; attribute vec2 uv; attribute vec4 color; attribute vec2 corner; attribute vec2 extent;
      varying highp vec2 tex; varying vec4 tint;
      void main(){gl_Position=vec4((position.x+corner.x*extent.x)/300.0-1.0,1.0-(position.y+corner.y*extent.y)/300.0,0.0,1.0);tex=uv+corner*extent/4096.0;tint=color;}`));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `
      precision mediump float; varying highp vec2 tex; varying vec4 tint; uniform sampler2D atlas;
      void main(){float a=texture2D(atlas,tex).a*tint.a;gl_FragColor=vec4(tint.rgb*a,a);}`));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    // Cache the ORIGINAL native font size, rather than scaling a larger font:
    // tiny Courier glyph hinting is part of the original point-cloud appearance.
    const cell = 16, atlasSize = 4096, columns = Math.floor(atlasSize / (cell * glyphs.length));
    const capacity = columns * (atlasSize / cell);
    const strip = document.createElement('canvas'); strip.width = cell * glyphs.length; strip.height = cell;
    const ac = strip.getContext('2d');
    const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, atlasSize, atlasSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fonts = new Map();

    function fontSlot(size) {
      let slot = fonts.get(size);
      if (slot) return slot;
      const index = fonts.size;
      if (index >= capacity) throw new Error('Creature glyph atlas capacity exceeded');
      slot = { x: (index % columns) * strip.width, y: Math.floor(index / columns) * cell };
      ac.clearRect(0, 0, strip.width, cell);
      ac.font = size + 'px "Courier New", monospace';
      ac.textAlign = 'center'; ac.textBaseline = 'middle'; ac.fillStyle = '#fff';
      glyphs.forEach((g, i) => ac.fillText(g, (i + .5) * cell, cell / 2));
      gl.texSubImage2D(gl.TEXTURE_2D,0,slot.x,slot.y,gl.RGBA,gl.UNSIGNED_BYTE,strip);
      // Crop only transparent padding, with a one-pixel filtering border.
      // This keeps the exact native glyph while avoiding empty GPU fragments.
      const pixels = ac.getImageData(0, 0, strip.width, cell).data;
      slot.bounds = glyphs.map((_, glyph) => {
        let left=cell, top=cell, right=-1, bottom=-1;
        for(let y=0;y<cell;y++)for(let x=0;x<cell;x++) {
          if(pixels[(y*strip.width+glyph*cell+x)*4+3]) {
            left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
          }
        }
        if(right<0)return null;
        left=Math.max(0,left-1);top=Math.max(0,top-1);
        return {left,top,width:Math.min(cell,right+2)-left,height:Math.min(cell,bottom+2)-top};
      });
      fonts.set(size, slot);
      return slot;
    }
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const [name, size, offset] of [['position',2,0],['uv',2,8],['extent',2,16],['color',4,24]]) {
      const location=gl.getAttribLocation(program,name); gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location,size,gl.FLOAT,false,40,offset);
      instancing.vertexAttribDivisorANGLE(location,1);
    }
    const quadBuffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);
    const cornerLocation=gl.getAttribLocation(program,'corner'); gl.enableVertexAttribArray(cornerLocation);
    gl.vertexAttribPointer(cornerLocation,2,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    let data=new Float32Array(10*4096), used=0;
    return {
      clearRect() {
        used=0;
        // Reclaim only between frames, so queued UVs always remain valid.
        if (fonts.size > capacity / 2) fonts.clear();

      },
      point(glyphIndex, x, y, size, alpha, r, g, b) {
        if(used+10>data.length){const larger=new Float32Array(data.length*2);larger.set(data);data=larger;}
        const slot=fontSlot(size);
        const bounds=slot.bounds[glyphIndex];
        if(!bounds)return;
        data[used++]=x+bounds.left-cell/2; data[used++]=y+bounds.top-cell/2;
        data[used++]=(slot.x+glyphIndex*cell+bounds.left)/atlasSize; data[used++]=(slot.y+bounds.top)/atlasSize;
        data[used++]=bounds.width;data[used++]=bounds.height;
        data[used++]=r/255; data[used++]=g/255; data[used++]=b/255; data[used++]=alpha;
      },
      flush() {
        gl.viewport(0,0,canvas.width,canvas.height); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bufferData(gl.ARRAY_BUFFER,data.subarray(0,used),gl.DYNAMIC_DRAW);
        instancing.drawArraysInstancedANGLE(gl.TRIANGLES,0,6,used/10);

      }
    };
  };
})();


