// Convenience wrapper for a Vertex.
function Vertex(x, y) {
  this.x = x;
  this.y = y;
  this.z = 0;
  this.edges = [];
  this.is_revealed = false;
  this.has_mine = false;

  // Sorts the edges array by angle from the given edge.
  this.sortEdges = function(edge) {
    var common = this;
    var v = edge.getOtherVertex(this);
    this.edges.sort(function (e1, e2) {
      var v1 = e1.getOtherVertex(common);
      var v2 = e2.getOtherVertex(common);
      var a1 = getAngle([common.vec3(), v.vec3()], [common.vec3(), v1.vec3()]);
      var a2 = getAngle([common.vec3(), v.vec3()], [common.vec3(), v2.vec3()]);
      return a1 > a2 ? 1 : -1;
    });
  }

  // Gets the distance between this vertex and other_v
  this.distance = function(other_v) {
    return Math.sqrt(Math.pow(other_v.x - this.x, 2) + Math.pow(other_v.y - this.y, 2) + Math.pow(other_v.z - this.z, 2));
  }

  // Returns this vertex as an array [x, y, z]
  this.vec3 = function() {
    return vec3.fromValues(this.x, this.y, this.z);
  }

  this.hash = function() {
    return this.y * GRAPH_SIZE + this.x;
  }
}

// Convenience wrapper for an Edge.
function Edge(v1, v2) {
  this.vertices = [];
  this.triangles = [];
  this.hidden = false;
  this.remove_failed = false;

  if(v1.x < v2.x) this.vertices = [v1, v2];
  else if(v1.x == v2.x) this.vertices =  v1.y < v2.y ? [v1, v2] : [v2, v1];
  else this.vertices = [v2, v1];

  this.getOtherVertex = function(v) {
    return this.vertices[(this.vertices.indexOf(v) + 1) % 2];
  }

  this.hash = function() {
    return Edge.hash(this.vertices[0], this.vertices[1]);
  }
}

Edge.hash = function(v1, v2) {
  var sorted = [];
  if(v1.x < v2.x) sorted = [v1, v2];
  else if(v1.x == v2.x) sorted =  v1.y < v2.y ? [v1, v2] : [v2, v1];
  else sorted = [v2, v1];

  var hash = (sorted[0].x * GRAPH_SIZE + sorted[0].y) * GRAPH_SIZE;
  hash = (hash +  sorted[1].x) * GRAPH_SIZE + sorted[1].y;

  return hash;
}

function Triangle(v1, v2, v3) {
  // Store the vertices in counter clockwise order.
  var d = v1.x * v2.y + v2.x * v3.y + v3.x * v1.y - v2.y * v3.x - v3.y * v1.x - v1.y * v2.x;
  this.vertices = d > 0 ? [v1, v2, v3] : [v1, v3, v2];
  this.edges = [];

  // Returns all triangles that share an edge with this one in the graph.
  this.getNeighbors = function(graph) {
    var neighbors = [];
    for(var i in this.vertices) {
      var v1 = this.vertices[i];
      var v2 = this.vertices[(i + 1) % 3];
      var edge = graph.getEdge(v1, v2);
      for(var j in edge.triangles) {
        if(edge.triangles[j] != this) neighbors.push(edge.triangles[j]);
      }
    }
    return neighbors;
  }

  // Checks if this triangle contains a pt.
  this.contains = function(pt) {
    var v1 = [this.vertices[2].x - this.vertices[0].x, this.vertices[2].y - this.vertices[0].y];
    var v2 = [this.vertices[1].x - this.vertices[0].x, this.vertices[1].y - this.vertices[0].y];
    var v3 = [pt.x - this.vertices[0].x, pt.y - this.vertices[0].y];

    var dot00 = vec2.dot(v1, v1);
    var dot01 = vec2.dot(v1, v2);
    var dot02 = vec2.dot(v1, v3);
    var dot11 = vec2.dot(v2, v2);;
    var dot12 = vec2.dot(v2, v3);;

    var inv_denom = 1/ (dot00 * dot11 - dot01 * dot01);

    var u = (dot11 * dot02 - dot01 * dot12) * inv_denom;
    var v = (dot00 * dot12 - dot01 * dot02) * inv_denom;

    return ((u >= 0) && (v >= 0) && (u + v < 1));
  }

  // Checks if this triangle and other_t overlap. Requires a common_edge to exist and be passed in.
  this.intersects = function(other_t, common_edge) {
    var lines = [];
    for(var i in this.vertices) {
      var v = this.vertices[i];
      if(common_edge.vertices.indexOf(v) < 0) {
        if(other_t.contains(v)) return true;
        lines.push([v, common_edge.vertices[0]], [v, common_edge.vertices[1]])
      }

      v = other_t.vertices[i];
      if(common_edge.vertices.indexOf(v) < 0) {
        if(this.contains(v)) return true;
        lines.push([v, common_edge.vertices[1]], [v, common_edge.vertices[0]])
      }
      if(lines.length == 4) break;
    }

    return checkSegmentIntersect(lines[0], lines[2]) || checkSegmentIntersect(lines[1], lines[3]);
  }

  // Returns the angle at v.
  this.getAngle = function(v) {
    var i = this.vertices.indexOf(v);
    var v1 = this.vertices[(i + 1) % 3];
    var v2 = this.vertices[(i + 2) % 3];
    return getAngle([v.vec3(), v1.vec3()], [v.vec3(), v2.vec3()]);
  }

  // Checks if the sum of the angles opposite each other in
  // this Triangle and other_t is bigger then 180.
  this.checkAngles = function(other_t) {
    var a1 = 0;
    var a2 = 0;
    for(var i in this.vertices) {
      var v = other_t.vertices[i];
      if(this.vertices.indexOf(v) < 0) {
        a1 = other_t.getAngle(v);
      }
      v = this.vertices[i];
      if(other_t.vertices.indexOf(v) < 0) {
        a2 = this.getAngle(v);
      }
      if(a1 > 0 && a2 > 0) break;
    }
    return a1 + a2 <= Math.PI;
  }

  // Returns the two triangles that represent this and other_t flipped.
  this.flip = function(other_t) {
    var t1 = [];
    var t2 = [];
    for(var i in other_t.vertices) {
      var v = other_t.vertices[i];
      if(this.vertices.indexOf(v) < 0) {
        for(var j in this.vertices) {
          var v2 = this.vertices[j];
          if(other_t.vertices.indexOf(v2) < 0) {
            t1 = new Triangle(v, v2, this.vertices[(j + 1) % 3]);
            t2 = new Triangle(v, v2, this.vertices[(j + 2) % 3]);
            break;
          }
        }
        break;
      }
    }
    return [t1, t2];
  }
}
