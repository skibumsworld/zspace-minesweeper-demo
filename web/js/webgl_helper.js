var GL;
var ASPECT_RATIO;
var SHADER_PROGRAM;
var VERTEX_POS_ATTR;
var VERTEX_COLOR_ATTR;

var CAMERA_ROTATION = [];
var CAMERA_POSITION = [];

function resetCamera() {
  CAMERA_ROTATION[0] = Math.PI / 3;
  CAMERA_ROTATION[1] = 0;
  CAMERA_POSITION[0] = 0;
  CAMERA_POSITION[1] = 0;
  CAMERA_POSITION[2] = - 2 * GRAPH_SIZE;
  draw();
}

function moveCamera(axis, direction) {
  CAMERA_POSITION[axis] += direction * CAMERA_POSITION[2] / 10;
  draw();
}

function rotateCamera(axis, direction) {
  CAMERA_ROTATION[axis] += direction * Math.PI/20;
  draw();
}

function initWebGL() {
  // Canvas creation
  var canvas = $('#webgl_canvas')[0];
  GL = canvas.getContext('webgl', {preserveDrawingBuffer: true});
  GL.clearColor(0.0, 0.0, 0.0, 1.0);  // Clear to black, fully opaque
  GL.clearDepth(1.0);                 // Clear everything
  GL.enable(GL.DEPTH_TEST);           // Enable depth testing
  GL.depthFunc(GL.LEQUAL);
  ASPECT_RATIO = canvas.clientWidth / canvas.clientHeight;;

  // Shader setup
  SHADER_PROGRAM =  GL.createProgram();
  GL.attachShader(SHADER_PROGRAM, getShader('#shader-fs')); // Fragment Shader
  GL.attachShader(SHADER_PROGRAM, getShader('#shader-vs')); // Vertex Shader
  GL.linkProgram(SHADER_PROGRAM);
  GL.useProgram(SHADER_PROGRAM);

  VERTEX_POS_ATTR = GL.getAttribLocation(SHADER_PROGRAM, 'vertex_pos');
  GL.enableVertexAttribArray(VERTEX_POS_ATTR);

  VERTEX_COLOR_ATTR = GL.getAttribLocation(SHADER_PROGRAM, 'vertex_color');
  GL.enableVertexAttribArray(VERTEX_COLOR_ATTR);
}

function draw() {
  GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
  setUniformMatrices();
  if(!GRAPH.complete) drawBuffers(SURFACE_PTS_BUFFER, SURFACE_COLORS_BUFFER, GL.TRIANGLE_STRIP);
  if(Object.keys(GRAPH.vertices).length > 0) {
    drawBuffers(VERTEX_PTS_BUFFER, VERTEX_COLORS_BUFFER, GL.POINTS);
    drawBuffers(EDGE_PTS_BUFFER, EDGE_COLORS_BUFFER, GL.LINES);
  }
}

function drawBuffers(pts_buff, colors_buff, style) {
  GL.bindBuffer(GL.ARRAY_BUFFER, pts_buff);
  GL.vertexAttribPointer(VERTEX_POS_ATTR, 3, GL.FLOAT, false, 0, 0);

  GL.bindBuffer(GL.ARRAY_BUFFER, colors_buff);
  GL.vertexAttribPointer(VERTEX_COLOR_ATTR, 4, GL.FLOAT, false, 0, 0);

  GL.drawArrays(style, 0, pts_buff.length / 3);
}

// Model-View Matrix
function getMVMatrix() {
  var m = mat4.create();
  mat4.identity(m);
  mat4.translate(m, m, [CAMERA_POSITION[0], CAMERA_POSITION[1], CAMERA_POSITION[2]]);

  var r = getRotationMatrix();
  mat4.multiply(m, m, r);

  return m;
}

function getProjectionMatrix() {
  var m = mat4.create();
  mat4.perspective(m, 45, ASPECT_RATIO, 0.1, 10000.0);

  return m;
}

function getRotationMatrix() {
  var m = mat4.create();
  mat4.identity(m);
  mat4.rotateX(m, m, -1 * CAMERA_ROTATION[0]);
  mat4.rotateZ(m, m, -1 * CAMERA_ROTATION[1]);

  return m;
}

function setUniformMatrices() {
  var mv_loc = GL.getUniformLocation(SHADER_PROGRAM, "mv_matrix");
  var mv_matrix = getMVMatrix();
  GL.uniformMatrix4fv(mv_loc, false, mv_matrix);

  var p_loc = GL.getUniformLocation(SHADER_PROGRAM, "p_matrix");
  var p_matrix = getProjectionMatrix();
  GL.uniformMatrix4fv(p_loc, false, p_matrix);
}

function getColorAtClick(x, y) {
  var buff = new Uint8Array(4);
  GL.readPixels(x, y, 1, 1, GL.RGBA, GL.UNSIGNED_BYTE, buff);
  return buff;
}

// Returns a 3D point at depth(0..1) that corresponds to a canvas click at x, y
// Uses the current projection matrix.
function unproject(x, y, depth) {
  var canvas = $('#webgl_canvas');

  x = 2 * x / canvas.width() - 1;
  y = 2 * y / canvas.height() - 1;
  depth = 2 * depth - 1;

  var mv_matrix = getMVMatrix();
  var p_matrix = getProjectionMatrix();
  var inv = mat4.create();
  mat4.multiply(inv, p_matrix, mv_matrix);
  mat4.invert(inv, inv);

  var v = [x, y, depth, 1];
  vec4.transformMat4(v, v, inv);

  return [v[0]/v[3], v[1]/v[3], v[2]/v[3]]
}

function getShader(selector) {
  var shader_script = $(selector)[0];
  var shader;
  if (shader_script.type == "x-shader/x-fragment") shader = GL.createShader(GL.FRAGMENT_SHADER);
  else if (shader_script.type == "x-shader/x-vertex")  shader = GL.createShader(GL.VERTEX_SHADER);

  var src = '';
  var child = shader_script.firstChild;
  while(child) {
    if(child.nodeType == child.TEXT_NODE) src += child.textContent;

    child = child.nextSibling;
  }

  GL.shaderSource(shader, src);
  GL.compileShader(shader);

  if(!GL.getShaderParameter(shader, GL.COMPILE_STATUS)) {
    alert("Failed to compile shader: " + GL.getShaderInfoLog(shader));
    return null;
  }

  return shader;
}

// Boring Buffer Population
var SURFACE_PTS_BUFFER;
var SURFACE_COLORS_BUFFER;
var VERTEX_PTS_BUFFER;
var VERTEX_COLORS_BUFFER;
var EDGE_PTS_BUFFER;
var EDGE_COLORS_BUFFER;

function createBuffers() {
  if(Object.keys(GRAPH.vertices).length > 0) {
    createVertexBuffers();
    createEdgeBuffers();
  }
}

function createSurfaceBuffers() {
  var width = GRAPH_SIZE / 2 + 1;
  var pts = [
    -1 * width, -1 * width, -0.1,
    -1 * width, width, -0.1,
    width, -1 * width, -0.1,
    width, width, -0.1,

    -1 * width, -1 * width, -0.5,
    -1 * width, width, -0.5,
    width, -1 * width, -0.5,
    width, width, -0.5,

    -1 * width, -1 * width, -0.5,
    -1 * width, -1 * width, -0.1,
    -1 * width, width, -0.5,
    -1 * width, width, -0.1,

    -1 * width, -1 * width, -0.5,
    -1 * width, -1 * width, -0.1,
    width, -1 * width, -0.5,
    width, -1 * width, -0.1,

    width, -1 * width, -0.5,
    width, -1 * width, -0.1,
    width, width, -0.5,
    width, width, -0.1,

    -1 * width, width, -0.5,
    -1 * width, width, -0.1,
    width, width, -0.5,
    width, width, -0.1
  ];
  SURFACE_PTS_BUFFER = GL.createBuffer();
  GL.bindBuffer(GL.ARRAY_BUFFER, SURFACE_PTS_BUFFER);
  GL.bufferData(GL.ARRAY_BUFFER, new Float32Array(pts), GL.STATIC_DRAW);

  var colors = [];
  for(var i = 0; i < pts.length; i++) colors.push(1.0, 1.0, 1.0, 1.0);
  SURFACE_COLORS_BUFFER = GL.createBuffer();
  GL.bindBuffer(GL.ARRAY_BUFFER, SURFACE_COLORS_BUFFER);
  GL.bufferData(GL.ARRAY_BUFFER, new Float32Array(colors), GL.STATIC_DRAW);

  SURFACE_PTS_BUFFER.length = pts.length;
}

function createVertexBuffers() {
  var pts = [];
  var colors = [];

  for(var hash in GRAPH.vertices) {
    var v = GRAPH.vertices[hash];
    pts.push(v.x, v.y, v.z);
    if(v.is_revealed && v.has_mine) colors.push(1.0, 0.0, 0.0, 1.0);
    else if(v.is_revealed) colors.push(0.0, 1.0, 0.0, 1.0);
    else colors.push(0.0, 0.0, 1.0, 1.0);
  }

  VERTEX_PTS_BUFFER = GL.createBuffer();
  GL.bindBuffer(GL.ARRAY_BUFFER, VERTEX_PTS_BUFFER);
  GL.bufferData(GL.ARRAY_BUFFER, new Float32Array(pts), GL.STATIC_DRAW);

  VERTEX_COLORS_BUFFER = GL.createBuffer();
  GL.bindBuffer(GL.ARRAY_BUFFER, VERTEX_COLORS_BUFFER);
  GL.bufferData(GL.ARRAY_BUFFER, new Float32Array(colors), GL.STATIC_DRAW);

  VERTEX_PTS_BUFFER.length = pts.length;
}

function createEdgeBuffers() {
  var pts = [];
  var colors = [];
  for(var i = 0; i < GRAPH.triangles.length; i++) {
    var t = GRAPH.triangles[i];
    for(var j = 0; j < 3; j++) {
      var v1 = t.vertices[j];
      var v2 = t.vertices[(j + 1) % 3];
      var edge = GRAPH.getEdge(v1, v2);
      if(edge.hidden) continue;

      pts.push(v1.x, v1.y, v1.z);
      pts.push(v2.x, v2.y, v2.z);

      if(!GRAPH.complete && GRAPH.outer_edge.indexOf(edge) >= 0) {
        colors.push(0.0, 1.0, 0.0, 1.0);
        colors.push(0.0, 1.0, 0.0, 1.0);
      } else if(v1.has_mine && v1.is_revealed || v2.has_mine && v2.is_revealed) {
        colors.push(1.0, 0.0, 0.0, 1.0);
        colors.push(1.0, 0.0, 0.0, 1.0);
      } else if(v1.is_revealed && v2.is_revealed) {
        colors.push(0.0, 1.0, 0.0, 1.0);
        colors.push(0.0, 1.0, 0.0, 1.0);
      } else {
        colors.push(0.3, 0.3, 0.9, 1.0);
        colors.push(0.3, 0.3, 0.9, 1.0);
      }
    }
  }

  EDGE_PTS_BUFFER = GL.createBuffer();
  GL.bindBuffer(GL.ARRAY_BUFFER, EDGE_PTS_BUFFER);
  GL.bufferData(GL.ARRAY_BUFFER, new Float32Array(pts), GL.STATIC_DRAW);

  EDGE_COLORS_BUFFER = GL.createBuffer();
  GL.bindBuffer(GL.ARRAY_BUFFER, EDGE_COLORS_BUFFER);
  GL.bufferData(GL.ARRAY_BUFFER, new Float32Array(colors), GL.STATIC_DRAW);

  EDGE_PTS_BUFFER.length = pts.length;
}