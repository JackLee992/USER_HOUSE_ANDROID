// Shared WebGL 1 resource owner for interleaved triangle batches. Geometry,
// shaders, logical sizing and simulation remain the responsibility of each game.
export function createWebGLSurface(canvas, { onFallback = () => {} } = {}) {
  let gl = null, unavailable = false, destroyed = false, notified = false;
  const shaders = new Set(), programs = new Set(), buffers = new Set();
  const textures = new Map(), batches = new Map(), enabledAttributes = new Set();
  const textureUnits = new Set();
  const available = () => !!gl && !unavailable && !destroyed;

  function release() {
    if (!gl) return;
    for (const shader of shaders) gl.deleteShader(shader);
    for (const program of programs) gl.deleteProgram(program);
    for (const buffer of buffers) gl.deleteBuffer(buffer);
    for (const texture of textures.values()) gl.deleteTexture(texture);
    forget();
  }
  function forget() {
    shaders.clear(); programs.clear(); buffers.clear(); textures.clear();
    batches.clear(); enabledAttributes.clear(); textureUnits.clear();
  }
  function loseContext() { gl?.getExtension('WEBGL_lose_context')?.loseContext(); }
  function fail(error, contextLost = false) {
    if (unavailable || destroyed) return;
    unavailable = true;
    canvas.hidden = true;
    canvas.removeEventListener('webglcontextlost', onLost);
    // The driver has already freed a lost context. Do not issue GL calls to it.
    if (contextLost) forget();
    else { release(); loseContext(); }
    if (!notified) { notified = true; onFallback(error); }
  }
  function onLost() {
    // This owner permanently falls back to Canvas 2D. Do not preventDefault:
    // opting into restoration would resurrect a context we no longer manage.
    fail(new Error('WebGL context lost'), true);
  }
  function allocate(object, collection, message) {
    if (!object) throw new Error(message);
    collection.add(object);
    return object;
  }
  function compile(type, source) {
    const shader = allocate(gl.createShader(type), shaders, 'WebGL shader allocation failed');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('WebGL shader compilation failed');
    return shader;
  }

  canvas.addEventListener('webglcontextlost', onLost);
  try {
    gl = canvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false,
      stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power',
    });
    if (!gl) throw new Error('WebGL unavailable');
    gl.enable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
  } catch (error) { fail(error); }

  return {
    get available() { return available(); },

    createBatch({ vertex, fragment, attributes, uniforms = {}, blend = 'alpha' }) {
      if (!available()) return null;
      try {
        const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
        const program = allocate(gl.createProgram(), programs, 'WebGL program allocation failed');
        gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('WebGL program linking failed');
        gl.deleteShader(vs); shaders.delete(vs); gl.deleteShader(fs); shaders.delete(fs);
        const buffer = allocate(gl.createBuffer(), buffers, 'WebGL buffer allocation failed');
        let stride = 0;
        const fields = attributes.map(([name, size]) => {
          if (!Number.isInteger(size) || size < 1 || size > 4) throw new Error('Invalid vertex attribute size');
          const field = { location: gl.getAttribLocation(program, name), size, offset: stride * 4 };
          stride += size;
          return field;
        });
        if (!stride || !['alpha', 'additive'].includes(blend)) throw new Error('Invalid WebGL batch layout');
        const values = Object.entries(uniforms).map(([name, type]) => {
          if (!['float', 'int', 'vec2', 'vec3', 'vec4', 'mat4', 'sampler2D'].includes(type)) throw new Error('Unsupported WebGL uniform');
          return { name, type, location: gl.getUniformLocation(program, name) };
        });
        const handle = Object.freeze({});
        batches.set(handle, { program, buffer, fields, stride, values, blend });
        return handle;
      } catch (error) { fail(error); return null; }
    },

    createTexture() {
      if (!available()) return null;
      try {
        const texture = gl.createTexture();
        if (!texture) throw new Error('WebGL texture allocation failed');
        const handle = Object.freeze({});
        textures.set(handle, texture);
        gl.activeTexture(gl.TEXTURE0); textureUnits.add(0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return handle;
      } catch (error) { fail(error); return null; }
    },

    uploadTexture(handle, image) {
      if (!available() || !image || !textures.has(handle)) return false;
      try {
        gl.activeTexture(gl.TEXTURE0); textureUnits.add(0);
        gl.bindTexture(gl.TEXTURE_2D, textures.get(handle));
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        if (gl.getError() !== gl.NO_ERROR) throw new Error('WebGL texture upload failed');
        return true;
      } catch (error) { fail(error); return false; }
    },

    beginFrame() {
      if (!available()) return false;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return true;
    },

    drawBatch(handle, { vertices, count, uniforms = {}, textures: inputTextures = {} }) {
      if (!available() || !batches.has(handle)) return false;
      const batch = batches.get(handle);
      try {
        gl.useProgram(batch.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffer);
        const needed = new Set(batch.fields.filter(field => field.location >= 0).map(field => field.location));
        for (const location of enabledAttributes) if (!needed.has(location)) gl.disableVertexAttribArray(location);
        enabledAttributes.clear();
        for (const field of batch.fields) {
          if (field.location < 0) continue;
          gl.enableVertexAttribArray(field.location);
          gl.vertexAttribPointer(field.location, field.size, gl.FLOAT, false, batch.stride * 4, field.offset);
          enabledAttributes.add(field.location);
        }
        let unit = 0;
        for (const { name, type, location } of batch.values) {
          if (location === null) continue; // Optimized out by this driver.
          if (type === 'sampler2D') {
            const texture = textures.get(inputTextures[name]);
            if (!texture) throw new Error('Missing WebGL batch texture: ' + name);
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.uniform1i(location, unit);
            textureUnits.add(unit++);
          } else {
            const value = uniforms[name];
            if (value === undefined) throw new Error('Missing WebGL batch uniform: ' + name);
            if (type === 'float') gl.uniform1f(location, value);
            else if (type === 'int') gl.uniform1i(location, value);
            else if (type === 'vec2') gl.uniform2f(location, value[0], value[1]);
            else if (type === 'vec3') gl.uniform3f(location, value[0], value[1], value[2]);
            else if (type === 'vec4') gl.uniform4f(location, value[0], value[1], value[2], value[3]);
            else if (type === 'mat4') gl.uniformMatrix4fv(location, false, value);
          }
        }
        // An untextured pass must not inherit bindings from an earlier pass.
        for (const previous of textureUnits) if (previous >= unit) {
          gl.activeTexture(gl.TEXTURE0 + previous);
          gl.bindTexture(gl.TEXTURE_2D, null);
          textureUnits.delete(previous);
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
        gl.blendFunc(gl.ONE, batch.blend === 'additive' ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLES, 0, count ?? vertices.length / batch.stride);
        return true;
      } catch (error) { fail(error); return false; }
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      canvas.hidden = true;
      canvas.removeEventListener('webglcontextlost', onLost);
      if (!unavailable) { release(); loseContext(); }
      else forget();
    },
  };
}
