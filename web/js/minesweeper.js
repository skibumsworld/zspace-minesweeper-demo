var GRAPH;
var GRAPH_SIZE;
var ANIMATE = true;
var NUM_BOMBS = 10;
var REMOVE_EDGE_COUNTER = 0;

function generateGraph() {
  $('#generate_status').html('');

  GRAPH_SIZE = parseInt($('#n_vertices').val());
  NUM_BOMBS = parseInt($('#n_bombs').val());
  ANIMATE = $('#animate_creation').is(':checked');
  var edge_density = parseInt($('#edge_density').val());

  if(isNaN(GRAPH_SIZE)) {
    alert($('#n_vertices').val() + ' is not a valid integer.');
    return;
  }
  if(isNaN(NUM_BOMBS)) {
    alert($('#n_bombs').val() + ' is not a valid integer.');
    return;
  }
  if(isNaN(edge_density)) {
    alert($('#edge_density').val() + ' is not a valid integer.');
    return;
  }

  if(GRAPH_SIZE > 1000) {
    GRAPH_SIZE = 1000;
    $('#n_vertices').val(GRAPH_SIZE);
  }
  if(NUM_BOMBS > GRAPH_SIZE / 4) {
    NUM_BOMBS = GRAPH_SIZE / 4;
    $('#n_bombs').val(NUM_BOMBS);
  }

  GRAPH_SIZE = GRAPH_SIZE;
  GRAPH = new Graph();
  GRAPH.edge_density = edge_density;
  createSurfaceBuffers();
  resetCamera();

  setTimeout(addVertexLoop, 100);
}

function addVertexLoop() {
  var batch_size = 100;
  var added = 0;
  while(true) {
    var x = Math.floor(Math.random() * GRAPH_SIZE) - GRAPH_SIZE / 2;
    var y = Math.floor(Math.random() * GRAPH_SIZE) - GRAPH_SIZE / 2;
    var v = new Vertex(x, y);

    var t1 = window.performance.now();
    if(GRAPH.addVertex(v)) {
      var t2 = window.performance.now();;
      GRAPH.generation_time = GRAPH.generation_time + (t2 - t1);
      if(ANIMATE) {
        createBuffers();
        draw();
        break;
      } else {
        added++;
        if(added == batch_size || Object.keys(GRAPH.vertices).length == GRAPH_SIZE) break;
      }
    }
  }

  if(Object.keys(GRAPH.vertices).length == GRAPH_SIZE) {
    var min_edges = 1 * GRAPH_SIZE;
    var current_edges = Object.keys(GRAPH.edges).length;
    REMOVE_EDGE_COUNTER = Math.ceil((current_edges - min_edges) / 10 * (11 - GRAPH.edge_density));
    $('#generate_status').html('Removing ' + REMOVE_EDGE_COUNTER + ' edges.');
    setTimeout(removeEdgeLoop, ANIMATE ? 100 : 10);
  } else {
    $('#generate_status').html('Generated ' + Object.keys(GRAPH.vertices).length + ' vertices.');
    setTimeout(addVertexLoop, ANIMATE ? 100 : 10);
  }
}

function removeEdgeLoop() {
  var batch_size = 100;
  var removed = 0;

  var done = false;
  while(!done) {
    var t1 = window.performance.now();
    done = !GRAPH.hideRandomEdge();
    var t2 = window.performance.now();;
    GRAPH.generation_time = GRAPH.generation_time + (t2 - t1);
    REMOVE_EDGE_COUNTER--;

    if(ANIMATE) {
      createBuffers();
      draw();
      break;
    } else {
      removed++;
      if(removed == batch_size || REMOVE_EDGE_COUNTER == 0 || done) break;
    }
  }
  if(REMOVE_EDGE_COUNTER == 0 || done) {
    if(done) {
      console.log('can not remove anymore edges');
    }
    $('#generate_status').html('Adding BOMBS!!!');
    setTimeout(function(){
      var t1 = window.performance.now();
      this.addZandBombs(NUM_BOMBS);
      var t2 = window.performance.now();;
      GRAPH.generation_time = GRAPH.generation_time + (t2 - t1);

      $('#generate_status').html('Generated Successfully in <b>' + GRAPH.generation_time.toFixed(2) +
                                 'ms</b> of cpu time with  an average of <b>' + (GRAPH.total_flips / GRAPH_SIZE).toFixed(2) +
                                 '</b> triangle flips per vertex insertion.');
      createBuffers();
      draw();
    }, 100);
    createBuffers();
    draw();
  } else {
    $('#generate_status').html('Removing ' + REMOVE_EDGE_COUNTER + ' edges.');
    setTimeout(removeEdgeLoop, ANIMATE ? 100 : 10);
  }
}

function addZandBombs(n_bombs) {
  var no_bomb_list = []

  for(var i in GRAPH.vertices) {
    var v = GRAPH.vertices[i];

    v.z = Math.floor(Math.random() * GRAPH_SIZE/2);
    no_bomb_list.push(v);
  }

  for(var i = 0; i < n_bombs; i++) {
    var bomb = Math.floor(Math.random() * no_bomb_list.length);
    var v = no_bomb_list.splice(bomb, 1);
    v[0].has_mine = true;
  }
  GRAPH.complete = true;
}

function revealVertex(v) {
  v.is_revealed = true;
  for(var i in v.edges) {
    var edge = v.edges[i];
    var v_other = edge.getOtherVertex(v);
    if(edge.hidden || v_other.is_revealed || v_other.has_mine) continue;

    var can_reveal = true;
    for(var j in v_other.edges) {
      var test = v_other.edges[j];
      if(test.hidden) continue;
      if(test.vertices[0].has_mine || test.vertices[1].has_mine) {
        can_reveal = false;
        break;
      }
    }

    if(can_reveal) revealVertex(v_other);
  }
}

function handleMouseClick(e) {
  if(!GRAPH.complete) return;

  var canvas = $('#webgl_canvas');
  var x = e.offsetX;
  var y = e.offsetY;

  var color = getColorAtClick(x, canvas.height() - y);
  if(color[2] < 200) return;

  var p1 = unproject(x, canvas.height() - y, 0);
  var p2 = unproject(x, canvas.height() - y, 1);

  var clicked = null;
  var smallest_angle = Math.PI;
  for(var i in GRAPH.vertices) {
    var v = GRAPH.vertices[i];
    if(v.is_revealed) continue;
    var angle = getAngle([p1, p2], [p1, v.vec3()]);
    var d = vec3.create();
    d = vec3.subtract(d, v.vec3(), p1);
    d = vec3.length(d);
    if(angle < smallest_angle) {
      smallest_angle = angle;
      clicked = v;
    }
  }

  if(clicked != null) {
    revealVertex(clicked);
    createVertexBuffers();
    createEdgeBuffers();
    draw();
  }
}

function handleMouseWheel(event) {
  var delta = event.wheelDelta ? event.wheelDelta / 40 : event.detail ? -event.detail : 0;
  if (delta) {
    moveCamera(2, CAMERA_POSITION[2] / 40 * delta);
  }

  return event.preventDefault() && false;
}

// Checks if 3 points are collinear.
function checkCollinear(v1, v2, v3) {
  return v1.x * (v2.y - v3.y) + v2.x * (v3.y - v1.y) + v3.x * (v1.y - v2.y) == 0;
}

// Checks if 2 segments intersect
function checkSegmentIntersect(l1, l2) {
  if(l1.indexOf(l2[0]) >= 0 || l1.indexOf(l2[1]) >= 0) return false;

  var s1 = (l1[1].y - l1[0].y) / (l1[1].x - l1[0].x);
  var s2 = (l2[1].y - l2[0].y) / (l2[1].x - l2[0].x);

  if(Math.abs(s1) == Infinity) {
    if(Math.abs(s2) == Infinity) {
      if(l1[0].x != l2[0].x) return false;

      return Math.min(l1[0].y, l1[1].y) < Math.max(l2[0].y, l2[1].y) &&
             Math.max(l1[0].y, l1[1].y) > Math.min(l2[0].y, l2[1].y);
    } else {
      var int_x = l1[0].x;
      var int_y = s2 * int_x + l2[0].y - s2 * l2[0].x
      return int_x > Math.min(l2[0].x, l2[1].x) && int_x < Math.max(l2[0].x, l2[1].x) &&
             int_y < Math.max(l1[0].y, l1[1].y) && int_y > Math.min(l1[0].y, l1[1].y);
    }
  } else if(Math.abs(s2) == Infinity) {
    var int_x = l2[0].x;
    var int_y = s1 * int_x + l1[0].y - s1 * l1[0].x
    return int_x > Math.min(l1[0].x, l1[1].x) && int_x < Math.max(l1[0].x, l1[1].x) &&
           int_y < Math.max(l2[0].y, l2[1].y) && int_y > Math.min(l2[0].y, l2[1].y);
  } else {
    var c1 = l1[0].y - s1 * l1[0].x;
    var c2 = l2[0].y - s2 * l2[0].x;
    if(s1 == s2) {
      if(c1 == c2) {
        return Math.min(l1[0].x, l1[1].x) > Math.max(l2[0].x, l2[1].x) ||
               Math.max(l2[0].x, l2[1].x) < Math.min(l1[0].x, l1[1].x);
      }
      return false;
    } else {
      var int_x = (c1 - c2) / (s2 - s1);
      return int_x > Math.min(l1[0].x, l1[1].x) && int_x < Math.max(l1[0].x, l1[1].x) &&
             int_x > Math.min(l2[0].x, l2[1].x) && int_x < Math.max(l2[0].x, l2[1].x);
    }
  }
}

// Returns the angle between two 3D segments.
function getAngle(l1, l2) {
  var v1 = vec3.create();
  var v2 = vec3.create();
  vec3.subtract(v1, l1[1], l1[0]);
  vec3.subtract(v2, l2[1], l2[0]);

  var angle = Math.acos(vec3.dot(v1, v2) / (vec3.length(v1) * vec3.length(v2)));
  return angle;
}