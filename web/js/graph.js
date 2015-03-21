function Graph() {
  this.vertices = {}; // Can be optimized with a better hash table implementation.
  this.edges = {}; // Can be optimized with a better hash table implementation.
  this.triangles = [];
  this.outer_edge = [];
  this.total_flips = 0;
  this.generation_time = 0;
  this.edge_density = 5;
  this.complete = false;

  // Adds a Triangle to the graph and updates necessary caches.
  // Note: This does not do any flipping.
  this.addTriangle = function(t) {
    this.triangles.push(t);
    for(var i in t.vertices) {
      var v1 = t.vertices[i];
      var v2 = t.vertices[(i + 1) % 3];

      var edge = this.getEdge(v1, v2);
      if(edge == null) {
        edge = new Edge(v1, v2);

        v1.edges.push(edge);
        v2.edges.push(edge);

        this.edges[edge.hash()] = edge;
        this.outer_edge.push(edge);
      } else {
        this.outer_edge.splice(this.outer_edge.indexOf(edge), 1);
      }

      edge.triangles.push(t);
      t.edges.push(edge);
    }
  }

  // Deletes a Triangle from the graph and updates necessary caches.
  this.deleteTriangle = function(t) {
    for(var i in t.vertices) {
      var v1 = t.vertices[i];
      var v2 = t.vertices[(i + 1) % 3];
      var edge = this.getEdge(v1, v2);

      if(edge.triangles.length == 1) {
        // Edge has no other triangles. Needs to be removed from the graph.
        v1.edges.splice(v1.edges.indexOf(edge), 1);
        v2.edges.splice(v2.edges.indexOf(edge), 1);

        delete this.edges[edge.hash()];
        this.outer_edge.splice(this.outer_edge.indexOf(edge), 1);
      } else {
        edge.triangles.splice(edge.triangles.indexOf(t), 1);
        this.outer_edge.push(edge);
      }
    }

    this.triangles.splice(this.triangles.indexOf(t), 1);
  }

  // Adds a Triangle to the graph and performs any necessary flips.
  // Returns the number of flips performed.
  this.addAndFlipTriangle = function(t) {
    this.addTriangle(t);

    var flip_counter = 0;
    var neighbors = t.getNeighbors(this);
    var affected = [];
    for(var i in neighbors)  affected.push([t, neighbors[i]]);

    while(true) {
      var needs_flip = [];
      for(var i in affected) {
        var pair = affected[i];
        if(!pair[0].checkAngles(pair[1])) {
          needs_flip = pair;
          break;
        }
      }

      // If all the neighbors meet the Delaunay condition then we're done.
      if(needs_flip.length == 0) break;

      affected = [];
      flip_counter++;
      var flipped = needs_flip[0].flip(needs_flip[1]);

      this.deleteTriangle(needs_flip[0]);
      this.deleteTriangle(needs_flip[1]);
      this.addTriangle(flipped[0]);
      this.addTriangle(flipped[1]);

      for(var i in flipped) {
        var neighbors = flipped[i].getNeighbors(this);
        for(var j in neighbors) {
          if(flipped.indexOf(neighbors[j]) < 0)
            affected.push([flipped[i], neighbors[j]]);
        }
      }
    }
    return flip_counter;
  }

  // Splits a triangle on a point and performs any necessary flips.
  this.splitTriangle = function(t, v) {
    var new_ts = [];
    var removed = [t];
    for(var i in t.vertices) {
      var v1 = t.vertices[i];
      var v2 = t.vertices[(i + 1) % 3];
      var edge = this.getEdge(v1, v2);

      var next_t = new Triangle(v, v1, v2);
      var adjacent = this.getAdjacentTriangle(t, edge);;

      if(checkCollinear(v, v1, v2)) {
        // If there's an adjacent triangle on the collinear edge we need to split that one into two as well.
        if(adjacent != null) {
          removed.push(adjacent);
          for(var j in adjacent.vertices) {
            if(adjacent.vertices[j] == v1 || adjacent.vertices[j] == v2) continue;
            new_ts.push(new Triangle(v, v1, adjacent.vertices[j]));
            new_ts.push(new Triangle(v, v2, adjacent.vertices[j]));
          }
        }
        continue;
      }

      new_ts.push(next_t);
    }

    var flip_counter = 0;
    for(var i in removed) this.deleteTriangle(removed[i]);
    for(var i in new_ts) flip_counter += this.addAndFlipTriangle(new_ts[i]);

    this.total_flips += flip_counter;
  }

  // Adds a vertex to the graph and creates new triangles.
  this.addVertex = function(v) {
    var hash = v.hash();
    if(this.vertices[hash] != null) return false;

    var n = Object.keys(this.vertices).length;
    if(n < 2) {
      this.vertices[hash] = v;
      return true;
    }

    if(n == 2) {
      var existing = [];
      for(var i in this.vertices) {
        existing.push(this.vertices[i]);
      }
      if(checkCollinear(existing[0], existing[1], v)) {
        // Don't allow a straight line for first 3 vertices.
        return false;
      }
      this.vertices[hash] = v;
      this.addTriangle(new Triangle(existing[0], existing[1], v));
      return true;
    }

    this.vertices[hash] = v;
                                           1
    // if inside an existing triangle split the triangle.
    var t = this.getContainingTriangle(v);
    if(t != null) {
      this.splitTriangle(t, v);
      return true;
    }

    // Go around the outside edge and add as many triangles as possible.
    var new_ts = [];
    var removed = [];
    for(var i in this.outer_edge) {
      var edge = this.outer_edge[i];
      var v1 = edge.vertices[0];
      var v2 = edge.vertices[1];

      if(checkCollinear(v, v1, v2)) continue;

      var candidate = new Triangle(v, v1, v2);
      var adjacent = this.getAdjacentTriangle(candidate, edge);

      if(candidate.intersects(adjacent, edge)) continue;

      // Check if the candidate intersects the outer edge.
      var valid = true;
      for(var j in this.outer_edge) {
        var edge = this.outer_edge[j];

        if(checkSegmentIntersect([v, v1], edge.vertices) || checkSegmentIntersect([v, v2], edge.vertices)) {
          valid = false;
          break;
        }
      }
      if(!valid) continue;

      new_ts.push(candidate);
    }

    if(new_ts.length == 0) {
      delete this.vertices[hash];
      return false;
    }

    var flip_counter = 0;
    for(var i in removed) this.deleteTriangle(removed[i]);
    for(var i in new_ts) flip_counter += this.addAndFlipTriangle(new_ts[i]);

    this.total_flips += flip_counter;
    return true;
  }

  // Hides a random edge in the graph.
  // Don't delete them because they are nice to have for rendering.
  this.hideRandomEdge = function() {
    var x = Math.floor(Math.random() * GRAPH_SIZE) - GRAPH_SIZE / 2;
    var y = Math.floor(Math.random() * GRAPH_SIZE) - GRAPH_SIZE / 2;
    var random = new Vertex(x, y);

    // Get the nearest existing vertex to x, y
    var v = null;
    var min = Number.MAX_VALUE;
    for(var i in this.vertices) {
      var candidate = this.vertices[i];
      var d = candidate.distance(random);
      if(d < min) {
        min = d;
        v = candidate;
      }
    }

    // BFS search for the nearest non hidden edge that can "potentially" be removed.
    var candidate = null;
    var next_round = [v];
    var visited = {};
    while(candidate == null && next_round.length > 0) {
      var current_round = next_round;
      next_round = [];
      for(var i in current_round) {
        var v = current_round[i];
        visited[v.hash()] = v;
        for(var j in v.edges) {
          var edge = v.edges[j];
          // Don't traverse edges that have been removed already.
          if(edge.hidden) continue;

          if(!edge.remove_failed) {
            candidate = edge;
            break;
          } else {
            var v_other = edge.getOtherVertex(v);
            if(visited[v_other.hash()] == null) {
              next_round.push(v_other);
            }
          }
        }
      }
    }

    // If there's still no candidate means we have removed all the edges in the graph that we can.
    if(candidate == null) return false;

    // Another BFS search for the nearest edge that can "actually" be removed.
    var visited = {};
    var next_round = [candidate];
    var removed = this.canRemoveEdge(candidate) ? candidate : null;
    while(removed == null && next_round.length > 0) {
      var current_round = next_round;
      next_round = [];
      for(var i in current_round) {
        var current = current_round[i];
        visited[current.hash()] = current;
        for(var j in current.vertices) {
          var v = current.vertices[j];
          for(var k in v.edges) {
            var edge = v.edges[k];
            if(edge.hidden || edge == current || visited[edge.hash()] != null) continue;
            next_round.push(edge);
            if(!edge.remove_failed) {
              if(this.canRemoveEdge(edge)) {
                removed = edge;
                break;
              }
            }
          }
        }
        if(removed != null) break;
      }
    }

    if(removed != null) removed.hidden = true;

    return removed != null;
  }

  // Checks if edge can be removed from the graph without breaking connectedness.
  this.canRemoveEdge = function(edge) {
    // Can always remove an edge of a triangle without breaking connectedness.
    for(var i in edge.triangles) {
      var t = edge.triangles[i];
      var visible = true;
      for(var j in t.edges) {
        visible &= !t.edges[j].hidden;
      }
      if(visible) return true;
    }

    var v1 = edge.vertices[0];
    var v2 = edge.vertices[1];

    // DFS search to find a path from v1 to v2 that doesn't use the input edge.
    // Edges for each vertex are sorted by angle so loops/circles are found quickly.
    var visited = {};
    var path = [v1];
    var next = v2;
    var last_edge = edge;
    visited[v1.hash()] = v1;
    while(next != null && next != v1) {
      var current = next;
      if(visited[current.hash()] == null) {
        visited[current.hash()] = visited;
        current.sortEdges(last_edge);
      }
      path.push(current);
      next = null;

      for(var i in current.edges) {
        if(i == 0) continue;

        var next_edge = current.edges[i];
        if(next_edge.hidden || next_edge == edge) continue;

        var candidate = next_edge.getOtherVertex(current);
        if(candidate == v1 || visited[candidate.hash()] == null) {
          next = candidate;
          last_edge = this.getEdge(next, current);
          break;
        }
      }

      if(next == null) {
        var depth = path.length;
        if(depth == 2) {
          next = null;
        } else {
          path.pop();
          next = path.pop();
          last_edge = this.getEdge(next, path[path.length - 1]);
        }
      }
    }

    edge.remove_failed = next != v1;;
    return next == v1;
  }

  // Convenience function for getting edges from 2 vertices.
  this.getEdge = function(v1, v2) {
    return this.edges[Edge.hash(v1, v2)];
  }

  // Checks if vertex v is contained in any existing triangles.
  // Returns the containing triangle if one is found.
  // Can be optimized if triangles were in bins.
  this.getContainingTriangle = function(v) {
    for(var i in this.triangles) {
      var t = this.triangles[i];
      if(t.contains(v)) return t;
    }
    return null;
  }

  // Returns the adjacent triangle given a common_edge if one exists.
  this.getAdjacentTriangle = function(t, edge) {
    for(var i in edge.triangles) {
      if(edge.triangles[i] != t) return edge.triangles[i];
    }
    return null;
  }
}
